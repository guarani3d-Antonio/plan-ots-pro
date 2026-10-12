import pg from 'pg';
import {createClient} from '@supabase/supabase-js';
import {S3Client,HeadBucketCommand,ListObjectsV2Command,GetObjectCommand} from '@aws-sdk/client-s3';
import {Upload} from '@aws-sdk/lib-storage';
import {getSignedUrl} from '@aws-sdk/s3-request-presigner';
import {mkdtemp,writeFile,readFile,rm,stat} from 'node:fs/promises';
import {createReadStream,createWriteStream} from 'node:fs';
import {pipeline} from 'node:stream/promises';
import {Transform} from 'node:stream';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {randomUUID} from 'node:crypto';
import {writeArchive,unpackArchive,scopeSnapshot,canonical,hashFile,reuseIndex} from './archive.mjs';
import {rehearseRecovery} from './recovery.mjs';
import {databaseOptions,dumpEnvironment} from './database.mjs';
const required=['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','SUPABASE_ANON_KEY','DATABASE_URL','BACKUP_MASTER_KEY','BACKUP_RELEASE_ID','R2_ENDPOINT','R2_ACCESS_KEY_ID','R2_SECRET_ACCESS_KEY','R2_BUCKET','BACKUP_ALLOWED_ORIGIN'];
for(const name of required)if(!process.env[name])throw new Error('Falta configurar '+name);
const E=process.env,api=createClient(E.SUPABASE_URL,E.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
if(Buffer.from(E.BACKUP_MASTER_KEY,'base64').length!==32)throw new Error('Clave de respaldo inválida');
if([E.SUPABASE_URL,E.R2_ENDPOINT,E.BACKUP_ALLOWED_ORIGIN].some(u=>new URL(u).protocol!=='https:'))throw new Error('Las conexiones deben usar HTTPS');
const r2=new S3Client({region:'auto',endpoint:E.R2_ENDPOINT,credentials:{accessKeyId:E.R2_ACCESS_KEY_ID,secretAccessKey:E.R2_SECRET_ACCESS_KEY}});
const bucket=E.R2_BUCKET;
function byteLimit(maximum){let size=0;return new Transform({transform(chunk,_encoding,callback){size+=chunk.length;callback(size>maximum?new Error('El archivo excede la capacidad configurada'):null,chunk);}});}
function ok(r){if(r.error)throw new Error(r.error.message);return r.data;}
async function usedSpace(){let token,total=0;do{const page=await r2.send(new ListObjectsV2Command({Bucket:bucket,ContinuationToken:token}));for(const o of page.Contents||[])total+=o.Size||0;token=page.IsTruncated?page.NextContinuationToken:undefined;}while(token);return total;}
// libpq receives the password through its environment, never through argv/logs.
function dbEnv(url){return dumpEnvironment(url);}
async function dump(file,snapshot,schemaOnly=false){await new Promise((resolve,reject)=>{const child=spawn(E.PG_DUMP||'pg_dump',['--format=custom','--no-owner','--schema=public','--schema=auth','--schema=storage',...(schemaOnly?['--schema-only']:[]),`--snapshot=${snapshot}`,`--file=${file}`],{env:dbEnv(E.DATABASE_URL),windowsHide:true,stdio:['ignore','ignore','pipe']});let failed=false;child.stderr.on('data',()=>{failed=true;});child.on('error',()=>reject(new Error('No está disponible pg_dump')));child.on('close',code=>code===0?resolve():reject(new Error(`Falló la exportación PostgreSQL (${code}${failed?', revisar el servicio':''})`)));});}
async function creatorClient(token){const userApi=createClient(E.SUPABASE_URL,E.SUPABASE_ANON_KEY,{global:{headers:{Authorization:'Bearer '+token}},auth:{persistSession:false,autoRefreshToken:false}});const user=await userApi.auth.getUser(token);if(user.error||!user.data.user||ok(await userApi.rpc('plan_es_creador'))!==true)throw new Error('Sin permiso');return userApi;}
async function patch(job,values){const r=await api.from('plan_respaldos').update(values).eq('id',job.id).eq('lease',job.lease).eq('estado','procesando').select('id');if(r.error||r.data?.length!==1)throw new Error('El trabajo cambió de propietario');}
 async function execute(job){
 const dir=await mkdtemp(join(tmpdir(),'plan-ots-backup-')),db=new pg.Client(databaseOptions(E.DATABASE_URL));let timer,leaseLost=false;
 try{
  timer=setInterval(()=>{void patch(job,{lease_hasta:new Date(Date.now()+600000).toISOString()}).catch(()=>{leaseLost=true;});},60000);
  const entries=[],packageFile=join(dir,'copy.potbackup');
  if(job.tarea==='verificar'){
   if(!job.paquete_path||!job.paquete_sha256)throw new Error('La copia no tiene archivo');
   const object=await r2.send(new GetObjectCommand({Bucket:bucket,Key:job.paquete_path}));await pipeline(object.Body,byteLimit(Number(E.BACKUP_VERIFY_MAX_BYTES||536870912)),createWriteStream(packageFile,{mode:0o600,flags:'wx'}));
   if(await hashFile(packageFile)!==job.paquete_sha256)throw new Error('El paquete descargado cambió');
   const checked=await unpackArchive(packageFile,join(dir,'verified.zip'),E.BACKUP_MASTER_KEY,Number(E.BACKUP_VERIFY_MAX_BYTES||536870912));const {manifest}=checked;
   if(manifest.backupId!==job.id||manifest.tenantId!==job.tenant_id)throw new Error('Alcance del paquete incorrecto');
   let ensayo;try{ensayo=await rehearseRecovery(checked,dir,E.BACKUP_LAB_IMAGE);}catch{ensayo={correcto:false,estado:'fallida',mensaje:'El ensayo no se completó; revisar el laboratorio antes de recuperar.'};}
   await patch(job,{estado:'creada',tarea:'crear',integridad_en:new Date().toISOString(),recuperacion_en:ensayo.correcto?new Date().toISOString():null,terminado_en:new Date().toISOString(),informe:{tipo:'verificacion',correcto:true,archivos:manifest.entries.length,recuperacion:ensayo.estado,ensayo,mensaje:'Cifrado, manifiesto y huellas comprobados. El ensayo aislado tiene su propio resultado.'},lease:null,lease_hasta:null});return;
  }
  await db.connect();await db.query('begin isolation level repeatable read read only');
  const exported=(await db.query('select pg_export_snapshot() id')).rows[0].id;
  const raw=(await db.query('select public.plan_respaldo_snapshot() value')).rows[0].value;
  raw.entorno={postgresMajor:Number((await db.query("select current_setting('server_version_num')::int/10000 major")).rows[0].major),roles:(await db.query('select rolname from pg_roles order by rolname')).rows.map(r=>r.rolname),extensiones:(await db.query("select e.extname name,n.nspname schema,e.extversion version from pg_extension e join pg_namespace n on n.oid=e.extnamespace where e.extname<>'plpgsql' order by e.extname")).rows,authConteos:{}};
  if(!job.tenant_id)for(const r of (await db.query("select tablename from pg_tables where schemaname='auth'")).rows){const name=r.tablename.replaceAll('"','""');raw.entorno.authConteos[r.tablename]=(await db.query(`select count(*)::text n from auth."${name}"`)).rows[0].n;}
  const snapshot=scopeSnapshot(raw,job.tenant_id),corte=snapshot.corte_en;
  const data=canonical(snapshot);const sourceBytes=snapshot.storage.reduce((sum,o)=>sum+Number(o.metadata?.size||0),Buffer.byteLength(data));
  const config=ok(await api.from('plan_respaldo_config').select('*').eq('id',true).single());
  // Conservative ceiling leaves room for the dump, encryption and multipart upload.
  if(sourceBytes>Number(E.BACKUP_MAX_SINGLE_BYTES||268435456))throw new Error('El respaldo excede la capacidad configurada; ajustar el servicio antes de copiar');
  const current=await usedSpace();if(current+sourceBytes*2>Number(config.max_bytes))throw new Error('No hay espacio dentro del límite gratuito configurado');
  entries.push({name:'datos/snapshot.json',content:data});
  const file=join(dir,'database.dump');await dump(file,exported,!!job.tenant_id);entries.push({name:job.tenant_id?'base/esquema.dump':'base/plataforma.dump',path:file});
  // Company copies never contain the global dump or Auth passwords.
  const inventory=new Set(snapshot.storage.map(o=>`${o.bucket_id}/${o.name}`));
  function checkRefs(v){if(typeof v==='string'){let ref=v.startsWith('storage://')?v.slice(10):null;const match=v.match(/\/storage\/v1\/object\/(?:public|authenticated|sign)\/([^?]+)/);if(match)ref=decodeURIComponent(match[1]);if(ref&&!inventory.has(ref))throw new Error('La copia contiene una referencia a un archivo faltante');}if(v&&typeof v==='object')Object.values(v).forEach(checkRefs);}
  checkRefs(snapshot.tablas);
  for(const [table,rows] of Object.entries(snapshot.tablas))for(const row of rows){if(!row.file_path)continue;const storageBucket=table==='plan_directorio_fotos'?'directory-photos':['fotos','plan_foto_originales','plan_documento_foto_referencias'].includes(table)?'fotos':null;if(storageBucket&&!inventory.has(storageBucket+'/'+row.file_path))throw new Error('Falta un archivo referenciado por '+table);}
  // Reuse verified bytes from the last encrypted archive of the same scope.
  // This avoids pulling unchanged photos from Supabase every day. Each new
  // archive still contains its own complete, independent byte streams.
  let previousZip=null,reusable=new Map();
  let previousQuery=api.from('plan_respaldos').select('id,paquete_path,paquete_sha256').eq('estado','creada').neq('id',job.id).order('creado_en',{ascending:false}).limit(1);
  previousQuery=job.tenant_id?previousQuery.eq('tenant_id',job.tenant_id):previousQuery.is('tenant_id',null);
  const previous=ok(await previousQuery)[0];
  if(previous){
   const oldFile=join(dir,'previous.potbackup'),oldObject=await r2.send(new GetObjectCommand({Bucket:bucket,Key:previous.paquete_path}));
   await pipeline(oldObject.Body,byteLimit(Number(E.BACKUP_VERIFY_MAX_BYTES||536870912)),createWriteStream(oldFile,{mode:0o600,flags:'wx'}));
   if(await hashFile(oldFile)!==previous.paquete_sha256)throw new Error('La copia anterior no supera la comprobación; revisar antes de volver a descargar los originales');
   const checked=await unpackArchive(oldFile,join(dir,'previous.zip'),E.BACKUP_MASTER_KEY,Number(E.BACKUP_VERIFY_MAX_BYTES||536870912));
   if(checked.manifest.backupId!==previous.id||checked.manifest.tenantId!==job.tenant_id)throw new Error('El alcance de la copia anterior no coincide');
   previousZip=checked.zip;const oldSnapshot=JSON.parse(await previousZip.file('datos/snapshot.json').async('string'));reusable=reuseIndex(oldSnapshot,snapshot);
  }
  let objectIndex=0,bytes=Buffer.byteLength(data),copiedSourceBytes=0,reusedObjects=0;
  for(const object of snapshot.storage){
   if(!['planos','fotos','exports','directory-photos','profile-photos'].includes(object.bucket_id))throw new Error('Nuevo depósito requiere revisar la cobertura: '+object.bucket_id);
   const metadata=()=>api.rpc('plan_respaldo_objeto',{p_bucket:object.bucket_id,p_path:object.name}).then(ok);
   if(canonical(await metadata())!==canonical(object))throw new Error('Un archivo cambió después del corte; repetir copia');
   const file=join(dir,`object-${objectIndex}.bin`),cached=reusable.get(`${object.bucket_id}/${object.name}`);
   if(cached){const entry=previousZip.file(cached);if(!entry)throw new Error('Falta el original en la copia previa');await writeFile(file,await entry.async('nodebuffer'),{flags:'wx',mode:0o600});reusedObjects++;}
   else {const response=await fetch(E.SUPABASE_URL+'/storage/v1/object/authenticated/'+encodeURIComponent(object.bucket_id)+'/'+object.name.split('/').map(encodeURIComponent).join('/'),{headers:{apikey:E.SUPABASE_SERVICE_ROLE_KEY,Authorization:'Bearer '+E.SUPABASE_SERVICE_ROLE_KEY}});
    if(!response.ok||!response.body)throw new Error('No se pudo copiar un archivo del depósito '+object.bucket_id);
    await pipeline(response.body,byteLimit(Number(E.BACKUP_MAX_SINGLE_BYTES||268435456)-bytes),createWriteStream(file,{flags:'wx',mode:0o600}));copiedSourceBytes+=(await stat(file)).size;
   }
   const objectBytes=(await stat(file)).size;bytes+=objectBytes;
   if(object.metadata?.size!=null&&Number(object.metadata.size)!==objectBytes)throw new Error('El tamaño copiado difiere del inventario de Storage');
   if(bytes>Number(E.BACKUP_MAX_SINGLE_BYTES||268435456))throw new Error('El volumen real supera el límite de la copia');
   if(canonical(await metadata())!==canonical(object))throw new Error('Un archivo fue modificado durante la copia');
   entries.push({name:`archivos/${objectIndex++}.bin`,path:file});object.backupEntry=entries.at(-1).name;
  }
  // Retain the exact source snapshot and the index-to-object relationship.
  entries[0].content=canonical(snapshot);
  await db.query('commit');
  const manifest={backupId:job.id,tenantId:job.tenant_id,corteEn:corte,appRelease:E.BACKUP_RELEASE_ID,archivosDesdeOrigenBytes:copiedSourceBytes,archivosReutilizados:reusedObjects,alcance:job.tenant_id?'empresa':'plataforma',recuperacion:job.tenant_id?'requiere plataforma compatible':'dump PostgreSQL y archivos',keyId:E.BACKUP_KEY_ID||'principal',conteos:Object.fromEntries(Object.entries(snapshot.tablas).map(([t,r])=>[t,r.length]))};
  const info=await writeArchive(packageFile,entries,manifest,E.BACKUP_MASTER_KEY);
  if(current+info.bytes>Number(config.max_bytes))throw new Error('El paquete supera el presupuesto de almacenamiento');
  await unpackArchive(packageFile,join(dir,'check.zip'),E.BACKUP_MASTER_KEY,Number(E.BACKUP_VERIFY_MAX_BYTES||536870912));
  if(leaseLost)throw new Error('El servicio perdió la reserva del trabajo; repetir la copia');
  const key=`plan-ots/${job.id}/${randomUUID()}.potbackup`;
  await new Upload({client:r2,params:{Bucket:bucket,Key:key,Body:createReadStream(packageFile),ContentType:'application/octet-stream',Metadata:{sha256:info.sha256}},queueSize:1,leavePartsOnError:false}).done();
  // Read back the persisted R2 object, not only the local archive.
  const stored=await r2.send(new GetObjectCommand({Bucket:bucket,Key:key}));const readback=join(dir,'readback.potbackup');await pipeline(stored.Body,byteLimit(info.bytes),createWriteStream(readback,{flags:'wx',mode:0o600}));
  if(await hashFile(readback)!==info.sha256)throw new Error('La copia remota no coincide');
  let ensayo={correcto:false,estado:'pendiente'};
  if(E.BACKUP_AUTO_REHEARSAL==='true'){
   const persisted=await unpackArchive(readback,join(dir,'remote-verified.zip'),E.BACKUP_MASTER_KEY,Number(E.BACKUP_VERIFY_MAX_BYTES||536870912));
   try{ensayo=await rehearseRecovery(persisted,dir,E.BACKUP_LAB_IMAGE);}catch{ensayo={correcto:false,estado:'fallida',mensaje:'La copia existe, pero el laboratorio no pudo recuperarla.'};}
  }
  if(leaseLost)throw new Error('El servicio perdió la reserva del trabajo');
  await patch(job,{estado:'creada',tarea:'crear',corte_en:corte,paquete_path:key,paquete_sha256:info.sha256,bytes:info.bytes,objetos:snapshot.storage.length,filas:Object.values(snapshot.tablas).reduce((n,r)=>n+r.length,0),integridad_en:new Date().toISOString(),recuperacion_en:ensayo.correcto?new Date().toISOString():null,terminado_en:new Date().toISOString(),lease:null,lease_hasta:null,informe:{tipo:'integridad',correcto:true,recuperacion:ensayo.estado,ensayo,conteos:manifest.conteos,mensaje:'Copia cifrada leída de nuevo desde R2. Consultá el resultado independiente de recuperación.'}});
 }catch(error){await patch(job,{estado:'incompleta',error:String(error.message).slice(0,700),terminado_en:new Date().toISOString(),lease:null,lease_hasta:null}).catch(()=>{});throw new Error('El trabajo de respaldo no se completó; revisar su estado en Administración.');}
 finally{clearInterval(timer);await db.end().catch(()=>{});const target=resolve(dir);if(target.startsWith(resolve(tmpdir())+requireSeparator())&&target.includes('plan-ots-backup-'))await rm(target,{recursive:true,force:true});}
}
function requireSeparator(){return process.platform==='win32'?'\\':'/';}
let working=false;
async function tick(){if(working)return;working=true;try{await r2.send(new HeadBucketCommand({Bucket:bucket}));ok(await api.rpc('plan_respaldo_latido'));const job=ok(await api.rpc('plan_respaldo_tomar'));if(job?.id)await execute(job);}finally{working=false;}}
// Connections are checked read-only. Activation of automatic jobs remains a
// separate Creator action after the operator installs and validates this service.
await r2.send(new HeadBucketCommand({Bucket:bucket}));
// Ephemeral runners can drain one durable job without hosting a public server.
if(E.BACKUP_RUN_ONCE==='true'){
 try{await tick();console.log('Comprobación del motor completada; consultá el historial para ver el trabajo.');}
 catch{console.error('El motor no completó la ejecución.');process.exitCode=1;}
}else{
const server=createServer(async(req,res)=>{
 const origin=req.headers.origin;if(origin&&origin!==E.BACKUP_ALLOWED_ORIGIN){res.writeHead(403).end();return;}
 res.setHeader('Access-Control-Allow-Origin',E.BACKUP_ALLOWED_ORIGIN);res.setHeader('Access-Control-Allow-Headers','authorization, content-type');res.setHeader('Access-Control-Allow-Methods','POST, OPTIONS');res.setHeader('Cache-Control','no-store');
 if(req.method==='OPTIONS'){res.writeHead(204).end();return;}
 try{
  if(req.method!=='POST'||req.url!=='/download')throw new Error('Ruta no disponible');
  const token=req.headers.authorization?.replace(/^Bearer /,'');if(!token)throw new Error('Iniciá sesión');const user=await creatorClient(token);
  let body='';for await(const chunk of req){body+=chunk;if(body.length>1024)throw new Error('Solicitud inválida');}
  const {id}=JSON.parse(body);if(!/^[a-f0-9-]{36}$/i.test(id))throw new Error('Copia inválida');
  const job=ok(await user.from('plan_respaldos').select('id,estado,paquete_path,paquete_sha256').eq('id',id).single());if(job.estado!=='creada'||!job.paquete_path)throw new Error('Copia no disponible');
  const url=await getSignedUrl(r2,new GetObjectCommand({Bucket:bucket,Key:job.paquete_path,ResponseContentDisposition:`attachment; filename="plan-ots-${job.id}.potbackup"`}),{expiresIn:60});
  res.setHeader('Content-Type','application/json');res.end(JSON.stringify({url,sha256:job.paquete_sha256}));
 }catch{res.writeHead(403,{'Content-Type':'application/json'}).end(JSON.stringify({error:'No se pudo autorizar la descarga'}));}
});
server.requestTimeout=15000;
server.listen(Number(E.BACKUP_PORT||8788),E.BACKUP_BIND||'127.0.0.1');
const guardedTick=()=>tick().catch(()=>console.error('El servicio de respaldo no pudo procesar la cola.'));
setInterval(()=>void guardedTick(),30000);void guardedTick();
}
