import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
const {PGlite}=await import(pathToFileURL(resolve(process.argv[2])).href);
const db=new PGlite();const results=[];
const sql=await readFile('supabase/migrations/202609210003_private_storage.sql','utf8');
const uid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const A='11000000-0000-4000-8000-000000000001',A2='11000000-0000-4000-8000-000000000002',B='22000000-0000-4000-8000-000000000001';
const TA='10000000-0000-4000-8000-000000000001',TB='20000000-0000-4000-8000-000000000002';
const plane=`${TA}/${A}/plan.pdf`,photo=`${TA}/${A}/${uid(301)}/photo.jpg`,foreign=`${TB}/${B}/foreign.pdf`;
const scalar=async q=>Object.values((await db.query(q)).rows[0])[0];
const run=async p=>db.exec(await readFile(p,'utf8'));
async function check(name,fn){try{await fn();results.push({name,ok:true});}catch(e){await db.exec('rollback').catch(()=>{});results.push({name,ok:false,error:e.message});}}
async function as(n,fn,role='authenticated'){await db.exec(`begin;set local role ${role};select set_config('request.jwt.claim.sub','${uid(n)}',true);`);try{return await fn();}finally{await db.exec('rollback');}}
const denied=q=>assert.rejects(()=>db.query(q),e=>e.code==='42501');
const policies=async()=>(await db.query(`select policyname,cmd,roles,qual,with_check from pg_policies where schemaname='storage' order by policyname`)).rows;
try{
  await run('supabase/tests/captured-domain.sql');await run('supabase/tests/storage-foundation.sql');
  await run('supabase/migrations/202609200001_multitenancy_foundation.sql');await run('supabase/migrations/202609200002_multitenancy_enforcement.sql');
  const spec=JSON.parse(await readFile('docs/estabilizacion-2026-09-20/fixtures-tenants.json','utf8'));
  const users=[spec.platformCreator,...spec.organizations.flatMap(o=>o.users)];
  for(let i=0;i<users.length;i++)await db.query('insert into auth.users(id,email) values($1,$2)',[uid(i+1),users[i].email]);
  await run('supabase/seeds/20260920_fictional_tenants.sql');
  await db.exec(`insert into proyectos(id,nombre,plano_url,created_by) values('${uid(190)}','Legado','https://iqgbyqyoovzvhhdjawnt.supabase.co/storage/v1/object/public/planos/old%20plan.pdf','${uid(2)}');
    insert into storage.objects(bucket_id,name) values('planos','old plan.pdf'),('fotos','orphan.jpg');
    insert into ordenes(id,proyecto_id,ot,ubicacion,rubro,responsable,prioridad,plano_ref_url) values('${uid(301)}','${A}','QA','A','Test','Test','Media','fixture'),('${uid(302)}','${B}','QA','B','Test','Test','Media','fixture');`);
  const oldPolicies=await policies();const oldRPC=await scalar(`select pg_get_functiondef('public.plan_crear_proyecto(text,text,text,text,text[],text[],uuid)'::regprocedure)`);
  await db.exec(sql);
  await db.exec(`insert into storage.objects(bucket_id,name,owner_id) values('planos','${plane}','${uid(2)}'),('fotos','${photo}','${uid(4)}'),('planos','${foreign}','${uid(7)}');`);
  for(const [n,visible] of [[1,2],[2,1],[3,1],[4,1],[5,0],[6,1],[7,1],[8,1],[9,1],[10,0],[11,1]]){
    await check(`cuenta ${n}: lectura de planos A/B según obra`,()=>as(n,async()=>assert.equal(await scalar(`select count(*) from storage.objects where name in ('${plane}','${foreign}')`),visible)));
  }
  await check('anon no lee objetos',()=>as(2,async()=>assert.equal(await scalar('select count(*) from storage.objects'),0),'anon'));
  await check('técnico sube foto a su obra y orden',()=>as(4,()=>db.query(`insert into storage.objects(bucket_id,name,owner_id) values('fotos','${TA}/${A}/${uid(301)}/new.jpg',auth.uid()::text) returning id`)));
  await check('técnico no sube a otra obra de la misma empresa',()=>as(4,()=>denied(`insert into storage.objects(bucket_id,name) values('planos','${TA}/${A2}/bad.pdf')`)));
  await check('técnico no sube foto en empresa ajena',()=>as(4,()=>denied(`insert into storage.objects(bucket_id,name) values('fotos','${TB}/${B}/${uid(302)}/bad.jpg')`)));
  await check('no se falsifica prefijo tenant',()=>as(4,()=>denied(`insert into storage.objects(bucket_id,name) values('fotos','${TB}/${A}/${uid(301)}/bad.jpg')`)));
  await check('no se cruza orden con proyecto',()=>as(4,()=>denied(`insert into storage.objects(bucket_id,name) values('fotos','${TA}/${A}/${uid(302)}/bad.jpg')`)));
  await check('viewer no sube foto',()=>as(6,()=>denied(`insert into storage.objects(bucket_id,name) values('fotos','${TA}/${A}/${uid(301)}/viewer.jpg')`)));
  await check('técnico no sube planos',()=>as(4,()=>denied(`insert into storage.objects(bucket_id,name) values('planos','${TA}/${A}/bad.pdf')`)));
  await check('supervisor sube planos',()=>as(3,()=>db.query(`insert into storage.objects(bucket_id,name,owner_id) values('planos','${TA}/${A}/new.pdf',auth.uid()::text) returning id`)));
  await check('técnico no lee ni sube exports',()=>as(4,async()=>{assert.equal(await scalar(`select plan_storage_permitido('exports','${TA}/${A}/report.pdf','read')`),false);await denied(`insert into storage.objects(bucket_id,name) values('exports','${TA}/${A}/report.pdf')`);}));
  await check('supervisor sube exports',()=>as(3,()=>db.query(`insert into storage.objects(bucket_id,name,owner_id) values('exports','${TA}/${A}/report.pdf',auth.uid()::text) returning id`)));
  await check('no se falsifica propietario del archivo',()=>as(4,()=>denied(`insert into storage.objects(bucket_id,name,owner_id) values('fotos','${TA}/${A}/${uid(301)}/fake-owner.jpg','${uid(7)}')`)));
  await check('no hay sobrescritura ni traslado de objeto',()=>as(2,async()=>assert.equal((await db.query(`update storage.objects set name='${TA}/${A}/renamed.pdf' where name='${plane}' returning id`)).rows.length,0)));
  await check('propietario técnico elimina su archivo',()=>as(4,async()=>assert.equal((await db.query(`delete from storage.objects where name='${photo}' returning id`)).rows.length,1)));
  await check('lector no elimina archivo',()=>as(6,async()=>assert.equal((await db.query(`delete from storage.objects where name='${photo}' returning id`)).rows.length,0)));
  await check('archivo legado codificado conserva acceso de miembro',()=>as(2,async()=>assert.equal(await scalar(`select count(*) from storage.objects where name='old plan.pdf'`),1)));
  await check('archivo legado no se abre a otro tenant',()=>as(7,async()=>assert.equal(await scalar(`select count(*) from storage.objects where name='old plan.pdf'`),0)));
  await check('huérfano no se publica a Creador',()=>as(1,async()=>assert.equal(await scalar(`select count(*) from storage.objects where name='orphan.jpg'`),0)));
  await check('cliente no altera asignación de archivos legados',()=>as(2,()=>denied(`insert into plan_archivos_legados values('fotos','orphan.jpg','${A}')`)));
  await check('proyecto no puede adoptar plano de otra obra',()=>as(2,()=>denied(`update proyectos set plano_url='storage://planos/${foreign}' where id='${A}'`)));
  await check('proyecto acepta su plano privado',()=>as(2,()=>db.query(`update proyectos set plano_url='storage://planos/${plane}' where id='${A}' returning id`)));
  await check('foto admite URL durable y ruta coherentes',()=>as(4,()=>db.query(`insert into fotos(proyecto_id,orden_id,categoria,file_path,file_url,file_type) values('${A}','${uid(301)}','ANTES','${photo}','storage://fotos/${photo}','imagen') returning id`)));
  await check('foto rechaza ruta ajena aun con orden local',()=>as(4,()=>denied(`insert into fotos(proyecto_id,orden_id,categoria,file_path,file_url,file_type) values('${A}','${uid(301)}','ANTES','${TB}/${B}/${uid(302)}/bad.jpg','storage://fotos/${TB}/${B}/${uid(302)}/bad.jpg','imagen')`)));
  await check('revocación de membresía corta Storage',async()=>{
    await db.exec(`update tenant_miembros set activo=false where user_id='${uid(4)}'`);
    try{await as(4,async()=>assert.equal(await scalar('select count(*) from storage.objects'),0));}
    finally{await db.exec(`update tenant_miembros set activo=true where user_id='${uid(4)}'`);}
  });
  await check('RPC reserva obra sin adoptar URL arbitraria',()=>as(2,async()=>{
    const p=(await db.query(`select * from plan_crear_proyecto('Reserva','pending://plan-upload-required')`)).rows[0];
    assert.equal(p.plano_url,'pending://plan-upload-required');
    await assert.rejects(()=>db.query(`select * from plan_crear_proyecto('Falsa','storage://planos/${foreign}')`),e=>e.code==='22023');
  }));
  await check('rollback restaura políticas y RPC anteriores',async()=>{
    await run('supabase/rollback/202609210003_private_storage.rollback.sql');assert.deepEqual(await policies(),oldPolicies);
    assert.equal(await scalar(`select pg_get_functiondef('public.plan_crear_proyecto(text,text,text,text,text[],text[],uuid)'::regprocedure)`),oldRPC);
  });
}catch(e){results.push({name:'preparación',ok:false,error:e.message});}
finally{
  await db.close();await mkdir('docs/estabilizacion-2026-09-20/dia-5',{recursive:true});
  const report={scope:'PostgreSQL local, catálogo de dominio capturado y metadata mínima de Storage. No simula API ni archivos.',sha256:createHash('sha256').update(sql).digest('hex'),passed:results.filter(r=>r.ok).length,total:results.length,results};
  await writeFile('docs/estabilizacion-2026-09-20/dia-5/storage-sql-tests.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));if(results.some(r=>!r.ok))process.exitCode=1;
}
