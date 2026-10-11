import {createClient} from 'npm:@supabase/supabase-js@2.105.4';
import {S3Client,GetObjectCommand,HeadObjectCommand} from 'npm:@aws-sdk/client-s3@3.1149.0';
import {getSignedUrl} from 'npm:@aws-sdk/s3-request-presigner@3.1149.0';
import {backupDownloadHandler} from '../_shared/backup-download.mjs';

const origin = 'https://plan-ots-pro.pages.dev';
const read = (key:string) => Deno.env.get(key) ?? '';
// A separate bucket-scoped, read-only credential is sufficient for this bridge.
const endpoint = read('BACKUP_R2_ENDPOINT');
const bucket = read('BACKUP_R2_BUCKET');
const access = read('BACKUP_R2_DOWNLOAD_ACCESS_KEY_ID');
const secret = read('BACKUP_R2_DOWNLOAD_SECRET_ACCESS_KEY');
const supabaseUrl = read('SUPABASE_URL');
const anon = read('SUPABASE_ANON_KEY');
let handler: ((request:Request)=>Promise<Response>) | undefined;
if (endpoint && bucket && access && secret && supabaseUrl && anon) {
  const r2 = new S3Client({region:'auto',endpoint,forcePathStyle:true,credentials:{accessKeyId:access,secretAccessKey:secret},maxAttempts:2});
  const userClient = (authorization:string) => createClient(supabaseUrl,anon,{
    global:{headers:{Authorization:authorization},fetch:(input,init)=>fetch(input,{...init,signal:AbortSignal.timeout(10000)})},
    auth:{persistSession:false,autoRefreshToken:false},
  });
  handler = backupDownloadHandler({
    origin, endpoint,
    async authorize(authorization:string) {
      const api = userClient(authorization);
      const identity = await api.auth.getUser(authorization.slice(7));
      if (identity.error || !identity.data.user) return false;
      const permission = await api.rpc('plan_es_creador');
      return !permission.error && permission.data === true;
    },
    async findJob(authorization:string,id:string) {
      const result = await userClient(authorization).from('plan_respaldos')
        .select('id,estado,bytes,integridad_en,paquete_path,paquete_sha256').eq('id',id).single();
      return result.error ? null : result.data;
    },
    async headObject(path:string) {
      const object = await r2.send(new HeadObjectCommand({Bucket:bucket,Key:path}),{abortSignal:AbortSignal.timeout(10000)});
      return {bytes:object.ContentLength,sha256:object.Metadata?.sha256};
    },
    signObject(path:string,filename:string,expiresIn:number) {
      return getSignedUrl(r2,new GetObjectCommand({Bucket:bucket,Key:path,
        ResponseContentDisposition:`attachment; filename="${filename}"`}),{expiresIn});
    },
  });
}
Deno.serve(request => {
  if (handler) return handler(request);
  const headers:Record<string,string> = {'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin'};
  if (request.headers.get('origin') === origin) Object.assign(headers,{
    'Access-Control-Allow-Origin':origin,
    'Access-Control-Allow-Headers':'authorization, apikey, x-client-info, content-type',
    'Access-Control-Allow-Methods':'POST, OPTIONS',
  });
  if (request.method === 'OPTIONS') return new Response(null,{status:204,headers});
  return new Response(JSON.stringify({error:'Descarga segura pendiente de conexión'}),{status:503,headers});
});
