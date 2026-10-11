import assert from 'node:assert/strict';
import {S3Client,GetObjectCommand} from '@aws-sdk/client-s3';
import {getSignedUrl} from '@aws-sdk/s3-request-presigner';
import {backupDownloadHandler} from '../supabase/functions/_shared/backup-download.mjs';

const origin='https://plan-ots-pro.pages.dev';
const endpoint='https://0123456789abcdef0123456789abcdef.r2.cloudflarestorage.com';
const id='11000000-0000-4000-8000-000000000001';
const hash='a'.repeat(64);
const job={id,estado:'creada',bytes:120,integridad_en:'2026-10-11',paquete_sha256:hash,
  paquete_path:`plan-ots/${id}/22000000-0000-4000-8000-000000000002.potbackup`};
let authorizeCalls=0,headCalls=0,signCalls=0;
// Signing uses fake credentials and the real SDK, with no network requests.
const r2=new S3Client({endpoint,region:'auto',forcePathStyle:true,credentials:{accessKeyId:'fixture',secretAccessKey:'fixture'}});
const dependencies={origin,endpoint,
  authorize:async()=>{authorizeCalls++;return true;},
  findJob:async()=>job,
  headObject:async()=>{headCalls++;return {bytes:120,sha256:hash};},
  signObject:async(path,filename,expiresIn)=>{
    signCalls++;
    return getSignedUrl(r2,new GetObjectCommand({Bucket:'private-fixture',Key:path,
      ResponseContentDisposition:`attachment; filename="${filename}"`}),{expiresIn});
  },
};
const request=(body={id},options={})=>new Request('https://fixture.supabase.co/functions/v1/descargar-respaldo',{
  method:options.method??'POST',headers:{Origin:origin,Authorization:'Bearer fixture','Content-Type':'application/json',...options.headers},
  ...(options.method==='OPTIONS'||options.method==='GET'?{}:{body:typeof body==='string'?body:JSON.stringify(body)}),
});
const handler=backupDownloadHandler(dependencies);
let result=await handler(request());
assert.equal(result.status,200);
assert.equal(result.headers.get('cache-control'),'no-store');
assert.equal(result.headers.get('access-control-allow-origin'),origin);
const valid=await result.json(),url=new URL(valid.url);
assert.equal(url.origin,endpoint);
assert.equal(url.pathname,`/private-fixture/${job.paquete_path}`);
assert.equal(url.searchParams.get('X-Amz-Expires'),'60');
assert.equal(url.searchParams.get('response-content-disposition'),`attachment; filename="plan-ots-${id}.potbackup"`);
assert.equal(valid.sha256,hash);
assert.equal(valid.expires_in,60);
assert.equal(headCalls,1);assert.equal(signCalls,1);

for(const options of [{method:'GET'},{headers:{Origin:'https://attacker.invalid'}},{headers:{Authorization:''}}]) {
  result=await handler(request({id},options));assert.ok([401,403,405].includes(result.status));
}
assert.equal(authorizeCalls,1);assert.equal(headCalls,1);
result=await handler(request({id},{method:'OPTIONS'}));assert.equal(result.status,204);
assert.equal(authorizeCalls,1);
assert.equal((await backupDownloadHandler({...dependencies,authorize:async()=>false})(request())).status,403);
assert.equal(headCalls,1);
for(const body of [{id:'bad'},null,[],{id,path:'other'},'invalid-json','x'.repeat(1025)]) {
  assert.equal((await handler(request(body))).status,400);
}
assert.equal(headCalls,1);
for(const changes of [{estado:'pendiente'},{integridad_en:null},{bytes:0},{bytes:NaN},
  {paquete_sha256:'bad'},{id:'another'},{paquete_path:`plan-ots/other/${id}.potbackup`},
  {paquete_path:`plan-ots/${id}/../private.potbackup`}]) {
  assert.equal((await backupDownloadHandler({...dependencies,findJob:async()=>({...job,...changes})})(request())).status,409);
}
assert.equal(headCalls,1);
assert.equal((await backupDownloadHandler({...dependencies,findJob:async()=>null})(request())).status,409);
for(const remote of [{bytes:121,sha256:hash},{bytes:120,sha256:'different'},{bytes:120}]) {
  assert.equal((await backupDownloadHandler({...dependencies,headObject:async()=>remote})(request())).status,409);
}
assert.equal(signCalls,1);
const failed=await backupDownloadHandler({...dependencies,headObject:async()=>{throw new Error('secret credential path');}})(request());
assert.equal(failed.status,503);assert.ok(!(await failed.text()).includes('secret'));
assert.equal((await backupDownloadHandler({...dependencies,signObject:async()=> 'https://attacker.invalid/?X-Amz-Expires=60'})(request())).status,503);
assert.equal((await backupDownloadHandler({...dependencies,signObject:async()=> endpoint+'/?X-Amz-Expires=3600'})(request())).status,503);
assert.throws(()=>backupDownloadHandler({...dependencies,endpoint:'http://local'}),/Invalid R2/);
assert.throws(()=>backupDownloadHandler({...dependencies,endpoint:'https://attacker.invalid'}),/Invalid R2/);
assert.throws(()=>backupDownloadHandler({...dependencies,endpoint:endpoint+'/prefix'}),/Invalid R2/);
assert.throws(()=>backupDownloadHandler({...dependencies,origin:origin+'/path'}),/Invalid origin/);
console.log('Descarga segura: permiso, RLS, alcance, objeto remoto y firma temporal comprobados localmente; cero llamadas a la nube.');
