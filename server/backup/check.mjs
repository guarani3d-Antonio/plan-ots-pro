import pg from 'pg';
import {createClient} from '@supabase/supabase-js';
import {S3Client,HeadBucketCommand,PutObjectCommand,GetObjectCommand,DeleteObjectCommand} from '@aws-sdk/client-s3';
import {randomUUID,randomBytes} from 'node:crypto';
import {spawn} from 'node:child_process';
import {dirname,join} from 'node:path';
import {command} from './recovery.mjs';
import {digest} from './archive.mjs';
import {databaseOptions,dumpEnvironment} from './database.mjs';

const E=process.env;
for(const key of ['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','DATABASE_URL','BACKUP_MASTER_KEY','R2_ENDPOINT','R2_ACCESS_KEY_ID','R2_SECRET_ACCESS_KEY','R2_BUCKET','BACKUP_RELEASE_ID'])if(!E[key])throw new Error('Falta configurar '+key);
if(Buffer.from(E.BACKUP_MASTER_KEY,'base64').length!==32)throw new Error('Clave de respaldo inválida');
if(new URL(E.R2_ENDPOINT).protocol!=='https:'||new URL(E.SUPABASE_URL).protocol!=='https:')throw new Error('Las conexiones deben usar HTTPS');
const db=new pg.Client(databaseOptions(E.DATABASE_URL));
const api=createClient(E.SUPABASE_URL,E.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const r2=new S3Client({region:'auto',endpoint:E.R2_ENDPOINT,credentials:{accessKeyId:E.R2_ACCESS_KEY_ID,secretAccessKey:E.R2_SECRET_ACCESS_KEY}});
const name='plan-ots-probe/'+randomUUID()+'.bin';let written=false;
try {
 await db.connect();await db.query('begin read only');
 const major=Number((await db.query("select current_setting('server_version_num')::int/10000 major")).rows[0].major);
 await db.query('select public.plan_respaldo_snapshot()');await db.query('commit');
 const version=await command(E.PG_DUMP||'pg_dump',['--version']);
 if(Number(version.match(/PostgreSQL\) (\d+)/)?.[1])!==major)throw new Error('pg_dump debe coincidir con la versión de PostgreSQL');
 // Validate libpq's own certificate trust before any source files are copied.
 await new Promise((resolve,reject)=>{
  const child=spawn(E.PG_DUMP?join(dirname(E.PG_DUMP),'psql'):'psql',['--no-psqlrc','--set=ON_ERROR_STOP=1','--command=select 1'],{env:dumpEnvironment(E.DATABASE_URL),windowsHide:true,stdio:'ignore'});
  child.on('error',()=>reject(new Error('Falta el cliente PostgreSQL del motor')));
  child.on('close',code=>code===0?resolve():reject(new Error('La conexión PostgreSQL con certificado verificado no se completó')));
 });
 await r2.send(new HeadBucketCommand({Bucket:E.R2_BUCKET}));
 const proof=randomBytes(64);await r2.send(new PutObjectCommand({Bucket:E.R2_BUCKET,Key:name,Body:proof,ContentType:'application/octet-stream'}));written=true;
 const returned=await r2.send(new GetObjectCommand({Bucket:E.R2_BUCKET,Key:name}));
 if(digest(await returned.Body.transformToByteArray())!==digest(proof))throw new Error('La prueba remota no coincide');
 await r2.send(new DeleteObjectCommand({Bucket:E.R2_BUCKET,Key:name}));written=false;
 const {error}=await api.from('plan_respaldo_config').update({destino:'r2_verificado',actualizado_en:new Date().toISOString()}).eq('id',true).select('id').single();
 if(error)throw new Error('Falta aplicar la migración de respaldos');
 console.log('Destino comprobado. La programación sigue como estaba; falta crear una copia y ensayar recuperación.');
} finally {
 await db.end().catch(()=>{});
 // Delete only the named, random object created by this probe.
 if(written)await r2.send(new DeleteObjectCommand({Bucket:E.R2_BUCKET,Key:name})).catch(()=>{});
}
