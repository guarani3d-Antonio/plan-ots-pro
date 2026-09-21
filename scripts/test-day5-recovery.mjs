// Recuperación local y lectura completa del respaldo binario; no imprime datos privados.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
const {PGlite}=await import(pathToFileURL(resolve(process.argv[2])).href);
const dir='.backups.local/2026-09-20-dia5/';
const rows=JSON.parse(await readFile(dir+'domain-before.json','utf8'));
const objects=JSON.parse(await readFile(dir+'objects-before.json','utf8'));
const schema=JSON.parse(await readFile(dir+'schema-before.json','utf8'));
const tables=['tenants','plataforma_administradores','tenant_miembros','proyectos','proyecto_miembros','campos_definicion','ordenes','fotos','comentarios_ot','ot_comentarios','versiones','sync_log','eventos_uso','ordenes_eliminadas','dashboard_configs'];
const db=new PGlite();const run=async p=>db.exec(await readFile(p,'utf8'));
const dump=async()=>{const out={};for(const t of tables)out[t]=(await db.query(`select coalesce(jsonb_agg(r order by r::text),'[]') rows from (select to_jsonb(t) r from public.${t} t) q`)).rows[0].rows;return out;};
try{
  let bytes=0;for(const o of objects){const b=await readFile(dir+'objects/'+o.backupFile);assert.equal(createHash('sha256').update(b).digest('hex'),o.sha256,'Hash de archivo respaldado');assert.equal(b.length,o.bytes);bytes+=b.length;}
  await run('supabase/tests/captured-domain.sql');await run('supabase/tests/storage-foundation.sql');
  await run('supabase/migrations/202609200001_multitenancy_foundation.sql');await run('supabase/migrations/202609200002_multitenancy_enforcement.sql');
  const ids=new Set();for(const t of tables)for(const row of rows[t])for(const k of ['created_by','updated_by','uploaded_by','user_id','invitado_por','eliminado_por'])if(row[k])ids.add(row[k]);
  for(const id of ids)await db.query('insert into auth.users(id) values($1) on conflict do nothing',[id]);
  for(const t of tables)await db.exec(`alter table public.${t} disable trigger user`);
  for(const t of tables)if(rows[t].length)await db.query(`insert into public.${t} select * from jsonb_populate_recordset(null::public.${t},$1::jsonb)`,[JSON.stringify(rows[t])]);
  for(const t of tables)await db.exec(`alter table public.${t} enable trigger user`);
  for(const o of objects)await db.query('insert into storage.objects(id,bucket_id,name) values($1,$2,$3)',[o.id,o.bucket,o.namePath]);
  const before=await dump();
  const policyRows=async()=>(await db.query("select policyname,cmd,roles,qual,with_check from pg_policies where schemaname='storage' and tablename='objects' order by policyname")).rows;
  const beforePolicies=await policyRows();
  const remotePolicies=schema.policies.filter(p=>p.schemaname==='storage'&&p.tablename==='objects').sort((a,b)=>a.policyname.localeCompare(b.policyname));
  const shape=p=>JSON.stringify([p.policyname,p.cmd,p.roles,p.qual,p.with_check]);
  assert.deepEqual(beforePolicies.map(shape).sort(),remotePolicies.map(shape).sort(),'Catálogo remoto coincide con políticas restaurables');
  const rpc=schema.functions.find(f=>f.proname==='plan_crear_proyecto').definition;
  const localRPC=async()=>(await db.query("select pg_get_functiondef('public.plan_crear_proyecto(text,text,text,text,text[],text[],uuid)'::regprocedure) def")).rows[0].def;
  const normalize=s=>s.replace(/\r\n/g,'\n').trim();
  const originalRPC=await localRPC();
  assert.equal(normalize(originalRPC),normalize(rpc),'RPC remoto coincide con reversión');
  await run('supabase/migrations/202609210003_private_storage.sql');
  assert.deepEqual(await dump(),before,'Migración conserva todas las filas');
  const links=(await db.query('select bucket_id,object_name,proyecto_id from plan_archivos_legados')).rows;
  // Comprobación independiente: referencias URL durables, recursivas y file_path.
  const expected=new Set();const inventory=new Set(objects.map(o=>o.bucket+'|'+o.namePath));const legacy=new Set(rows.proyectos.filter(p=>!p.tenant_id).map(p=>p.id));
  function visit(v,p){if(typeof v==='string'){for(const bucket of ['planos','fotos','exports']){const prefix=`https://iqgbyqyoovzvhhdjawnt.supabase.co/storage/v1/object/public/${bucket}/`;let name;if(v.startsWith(prefix))name=decodeURIComponent(v.slice(prefix.length).split('?')[0]);if(v.startsWith('storage://'+bucket+'/'))name=v.slice(('storage://'+bucket+'/').length);if(name&&inventory.has(bucket+'|'+name))expected.add(JSON.stringify([bucket,name,p]));}}else if(v&&typeof v==='object')for(const x of Object.values(v))visit(x,p);}
  for(const t of ['proyectos','ordenes','fotos','versiones'])for(const row of rows[t]){const p=t==='proyectos'?row.id:row.proyecto_id;if(!legacy.has(p))continue;visit(row,p);if(t==='fotos'&&inventory.has('fotos|'+row.file_path))expected.add(JSON.stringify(['fotos',row.file_path,p]));}
  assert.deepEqual(new Set(links.map(l=>JSON.stringify([l.bucket_id,l.object_name,l.proyecto_id]))),expected,'Referencias históricas exactas');
  const linkedObjects=new Set(links.map(l=>l.bucket_id+'|'+l.object_name)).size;
  await run('supabase/rollback/202609210003_private_storage.rollback.sql');
  assert.deepEqual(await dump(),before,'Reversión conserva todas las filas');assert.deepEqual(await policyRows(),beforePolicies);assert.equal(normalize(await localRPC()),normalize(rpc));
  const report={testedAt:new Date().toISOString(),scope:'Restauración local de 15 tablas y metadata Storage; migración y reversión exactas. Los 180 binarios se releen con SHA-256, sin restaurar Auth ni subirlos de nuevo al servidor.',objects:objects.length,bytes,allFileHashesValid:true,allDomainRowsPreserved:true,legacyLinks:links.length,linkedObjects,unreferencedObjectsPreserved:objects.length-linkedObjects,rollbackCatalogMatchesRemote:true};
  await writeFile('docs/estabilizacion-2026-09-20/dia-5/recovery-test.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}catch(e){console.error('Recuperación fallida:',e.code??'',e.message.split('\n')[0]);process.exitCode=1;}finally{await db.close();}
