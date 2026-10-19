// Entirely synthetic and local: no worker, .env, Supabase, R2 or credentials.
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomBytes,randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {assertStorageCoverage} from '../server/backup/coverage.mjs';
import {writeArchive,unpackArchive,scopeSnapshot,canonical,digest,reuseIndex} from '../server/backup/archive.mjs';
import {companyInsertSql,rowFingerprint,laboratorySessionSql} from '../server/backup/recovery.mjs';

const id=n=>`19000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const dir=await mkdtemp(join(tmpdir(),'plan-ots-contractor-backup-test-'));
const source=new PGlite();
const sql=await readFile(new URL('../supabase/migrations/202610100001_backup_jobs.sql',import.meta.url),'utf8');
const budgetSql=await readFile(new URL('../supabase/migrations/202610150002_contractor_budgets.sql',import.meta.url),'utf8');
const evaluationSql=await readFile(new URL('../supabase/migrations/202610150003_contractor_evaluations.sql',import.meta.url),'utf8');
const schema=`create role anon;create role authenticated;create role service_role bypassrls;
 create schema auth;create schema storage;
 create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql stable as $$select null::uuid$$;
 create function public.plan_es_creador() returns boolean language sql stable as $$select true$$;
 create table public.tenants(id uuid primary key);
 create table public.proyectos(id uuid primary key,tenant_id uuid references public.tenants);
 create table public.ordenes(id uuid primary key,proyecto_id uuid references public.proyectos);
 create table public.plan_contratistas(id uuid primary key,tenant_id uuid references public.tenants);
 create table public.plan_documento_revisiones(id uuid primary key,orden_id uuid references public.ordenes);
 create table storage.buckets(id text primary key,name text,public boolean);
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets,name text,metadata jsonb);`;
async function install(db){
 await db.exec(schema);
 // Reuse the real version-table definitions, including numeric/identity fields
 // and FKs. Only unrelated RPCs and policies are outside this fixture.
 await db.exec(budgetSql.slice(0,budgetSql.indexOf('alter table public.plan_presupuestos'))+'commit;');
 await db.exec(evaluationSql.slice(0,evaluationSql.indexOf('alter table public.plan_contratista_evaluaciones'))+'commit;');
 await db.exec(sql);await db.exec(laboratorySessionSql());
}
try{
 await install(source);
 await source.query('insert into auth.users values($1)',[id(1)]);
 await source.exec("insert into storage.buckets values('contractor-files','contractor-files',false),('contractor-evidence','contractor-evidence',false)");
 const originals=new Map();
 for(const offset of [10,20]){
  const tenant=id(offset),project=id(offset+1),order=id(offset+2),contractor=id(offset+3),plan=id(offset+4),budget=id(offset+5),evaluation=id(offset+6);
  await source.query('insert into tenants values($1)',[tenant]);
  await source.query('insert into proyectos values($1,$2)',[project,tenant]);
  await source.query('insert into ordenes values($1,$2)',[order,project]);
  await source.query('insert into plan_contratistas values($1,$2)',[contractor,tenant]);
  await source.query('insert into plan_documento_revisiones values($1,$2)',[plan,order]);
  await source.query('insert into plan_presupuestos(id,tenant_id,proyecto_id,orden_id,contratista_id,creado_por) values($1,$2,$3,$4,$5,$6)',[budget,tenant,project,order,contractor,id(1)]);
  await source.query('insert into plan_contratista_evaluaciones(id,tenant_id,proyecto_id,orden_id,contratista_id) values($1,$2,$3,$4,$5)',[evaluation,tenant,project,order,contractor]);
  // Same path in two private buckets, different bytes: never mix their cache
  // entries or recover an evaluation image as a budget attachment.
  const path=`${tenant}/${order}/ficticio.bin`;
  for(const bucket of ['contractor-files','contractor-evidence']){
   const bytes=Buffer.concat([Buffer.from(`${bucket}:empresa-${offset}:`),Buffer.from([0,255,13,10,31])]);
   originals.set(`${bucket}/${path}`,bytes);
   await source.query('insert into storage.objects(bucket_id,name,metadata) values($1,$2,$3)',[bucket,path,{size:bytes.length,mimetype:'application/octet-stream'}]);
  }
  for(const version of [1,2]){
   await source.query(`insert into plan_presupuesto_versiones(presupuesto_id,version,datos,fuentes,moneda,base,iva,total,contenido_sha256,creada_por,solicitud_id,solicitud_sha256)
    values($1,$2,$3,$4,'USD',9007199254740993.12,0,9007199254740993.12,$5,$6,$7,$5)`,[budget,version,{adjunto:{path,nombre:'Presupuesto ficticio'},documento_revision:plan},{documento_revision:{id:plan,version:1}},'a'.repeat(64),id(1),randomUUID()]);
   await source.query(`insert into plan_contratista_evaluacion_versiones(evaluacion_id,version,documento_revision,evaluador_id,evaluador_nombre,criterios,fundamento,fecha,fuentes,contenido_sha256,registrada_por,registrada_nombre,solicitud_id,solicitud_sha256)
    values($1,$2,$3,$4,'Técnico ficticio','[]','Evidencia ficticia','2026-10-19',$5,$6,$4,'Técnico ficticio',$7,$6)`,[evaluation,version,plan,id(1),{evidencia:{path,nombre:'Evidencia ficticia'}},'b'.repeat(64),randomUUID()]);
  }
 }
 const snapshot=(await source.query('select plan_respaldo_snapshot() value')).rows[0].value;
 assert.equal(snapshot.storage.length,4);assertStorageCoverage(snapshot);
 assert.equal(snapshot.tablas.plan_presupuesto_versiones[0].total,'9007199254740993.12');
 for(const bucket of ['planos','fotos','exports','directory-photos','profile-photos'])assertStorageCoverage({tablas:{},storage:[{bucket_id:bucket,name:'ficticio'}]});
 assertStorageCoverage({tablas:{},storage:[],buckets:snapshot.buckets});
 assert.throws(()=>assertStorageCoverage({...snapshot,storage:[...snapshot.storage,{bucket_id:'nuevo-no-revisado',name:'ficticio'}]}),/Nuevo depósito/);
 for(const bucket of ['contractor-files','contractor-evidence'])assert.throws(()=>assertStorageCoverage({...snapshot,storage:snapshot.storage.filter(o=>o.bucket_id!==bucket)}),new RegExp('Falta un archivo referenciado en '+bucket));
 const company=scopeSnapshot(snapshot,id(10));assertStorageCoverage(company);
 assert.equal(company.storage.length,2);
 assert.equal(company.tablas.plan_presupuesto_versiones.length,2);
 assert.equal(company.tablas.plan_contratista_evaluacion_versiones.length,2);
 assert.ok(company.storage.every(o=>o.name.startsWith(id(10)+'/')));
 const foreignReference=structuredClone(company);
 foreignReference.tablas.plan_presupuesto_versiones[0].datos.adjunto.path=snapshot.storage.find(o=>o.name.startsWith(id(20)+'/')).name;
 assert.throws(()=>assertStorageCoverage(foreignReference),/Falta un archivo/);

 for(const [scope,data] of [['plataforma',snapshot],['empresa',company]]){
  const packed=structuredClone(data);
  const entries=packed.storage.map((object,index)=>{
   object.backupEntry=`archivos/${index}.bin`;
   return {name:object.backupEntry,content:originals.get(`${object.bucket_id}/${object.name}`)};
  });
  const key=randomBytes(32).toString('base64'),archive=join(dir,scope+'.potbackup');
  await writeArchive(archive,[{name:'datos/snapshot.json',content:canonical(packed)},...entries],{backupId:randomUUID(),tenantId:scope==='empresa'?id(10):null},key);
  const checked=await unpackArchive(archive,join(dir,scope+'.zip'),key);
  const restored=JSON.parse(await checked.zip.file('datos/snapshot.json').async('string'));
  assertStorageCoverage(restored);
  assert.equal(reuseIndex(restored,data).size,data.storage.length);
  const modified=structuredClone(data);modified.storage[0].metadata.size++;
  assert.equal(reuseIndex(restored,modified).size,data.storage.length-1);
  for(const [index,object] of restored.storage.entries()){
   const bytes=await checked.zip.file(object.backupEntry).async('nodebuffer');
   const file=join(dir,`${scope}-${index}.bin`);await writeFile(file,bytes,{flag:'wx'});
   assert.equal(digest(await readFile(file)),digest(originals.get(`${object.bucket_id}/${object.name}`)));
  }
  const lab=new PGlite();try{
   await install(lab);await lab.exec(companyInsertSql(restored));
   const recovered=(await lab.query('select plan_respaldo_snapshot() value')).rows[0].value;
   for(const [table,rows] of Object.entries(restored.tablas))assert.equal(rowFingerprint(recovered.tablas[table]||[]),rowFingerprint(rows),`${scope}: ${table}`);
   assert.equal(rowFingerprint(recovered.storage),rowFingerprint(restored.storage.map(({backupEntry,...row})=>row)));
   assert.equal(rowFingerprint(recovered.buckets),rowFingerprint(restored.buckets));
   assertStorageCoverage(recovered);
   const linked=(await lab.query(`select count(*)::int n from plan_presupuesto_versiones v join plan_presupuestos b on b.id=v.presupuesto_id
    join ordenes o on o.id=b.orden_id join plan_documento_revisiones p on p.id=(v.datos->>'documento_revision')::uuid and p.orden_id=o.id`)).rows[0].n;
   assert.equal(linked,scope==='empresa'?2:4);
   const evaluated=(await lab.query(`select count(*)::int n from plan_contratista_evaluacion_versiones v join plan_contratista_evaluaciones e on e.id=v.evaluacion_id
    join plan_documento_revisiones p on p.id=v.documento_revision and p.orden_id=e.orden_id join auth.users u on u.id=v.evaluador_id`)).rows[0].n;
   assert.equal(evaluated,scope==='empresa'?2:4);
  }finally{await lab.close();}
 }
 console.log('OK: depósitos de contratistas, adjuntos/evidencias obligatorios, rechazo de depósitos nuevos, aislamiento entre empresas, versiones/OT/evaluador, precisión, cifrado, recuperación SQL PGlite y archivos por SHA-256; sin red ni datos reales.');
}finally{await source.close();await rm(dir,{recursive:true,force:true});}
