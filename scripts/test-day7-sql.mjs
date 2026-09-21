import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
const pgliteEntry=process.argv[2]??'C:/dev/fio-pro/dist/nc-sql-runtime/node_modules/@electric-sql/pglite/dist/index.js';
const {PGlite}=await import(pathToFileURL(resolve(pgliteEntry)).href);
const db=new PGlite(),results=[];
const migration='supabase/migrations/202609210005_connected_ot_flow.sql';
const uid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const A='11000000-0000-4000-8000-000000000001',B='22000000-0000-4000-8000-000000000001';
const scalar=async(q,p=[])=>Object.values((await db.query(q,p)).rows[0])[0];
const run=async p=>db.exec(await readFile(p,'utf8'));
async function as(n,fn,role='authenticated'){await db.exec(`begin;set local role ${role};select set_config('request.jwt.claim.sub','${uid(n)}',true)`);try{return await fn();}finally{await db.exec('rollback');}}
async function rejected(query,params,code){await db.exec('savepoint expected_error');try{await db.query(query,params);assert.fail('Faltó el rechazo esperado');}catch(e){await db.exec('rollback to savepoint expected_error');if(e.code==='ERR_ASSERTION')throw e;assert.equal(e.code,code);}finally{await db.exec('release savepoint expected_error');}}
async function test(name,fn){try{await fn();results.push({name,ok:true});}catch(e){await db.exec('rollback').catch(()=>{});results.push({name,ok:false,error:e.message});}}
try{
 await run('supabase/tests/captured-domain.sql');await run('supabase/tests/storage-foundation.sql');
 await db.exec("create function auth.jwt() returns jsonb language sql stable as $$select jsonb_build_object('email','fixture@plan.test')$$");
 for(const m of ['202609200001_multitenancy_foundation','202609200002_multitenancy_enforcement','202609210003_private_storage','202609210004_session_capabilities_costs'])await run('supabase/migrations/'+m+'.sql');
 const spec=JSON.parse(await readFile('docs/estabilizacion-2026-09-20/fixtures-tenants.json','utf8')),users=[spec.platformCreator,...spec.organizations.flatMap(o=>o.users)];
 for(let i=0;i<users.length;i++)await db.query('insert into auth.users(id,email) values($1,$2)',[uid(i+1),users[i].email]);
 await run('supabase/seeds/20260920_fictional_tenants.sql');await run(migration);
 await test('dos creaciones reciben códigos correlativos confirmados por servidor',()=>as(4,async()=>{
  const one=await scalar('select plan_crear_orden($1,.2,.3)',[A]),two=await scalar('select plan_crear_orden($1,.4,.5)',[A]);
  assert.deepEqual((await db.query('select ot from ordenes where id in ($1,$2) order by ot',[one,two])).rows.map(r=>r.ot),['OT-001','OT-002']);
 }));
 await test('índice rechaza código activo duplicado aunque se omita el RPC',()=>as(4,async()=>{
  const one=await scalar('select plan_crear_orden($1,.2,.3)',[A]),two=await scalar('select plan_crear_orden($1,.4,.5)',[A]),ot=await scalar('select ot from ordenes where id=$1',[one]);
  await rejected('update ordenes set ot=$1 where id=$2',[ot,two],'23505');
 }));
 await test('coordenadas inválidas no crean filas',()=>as(4,async()=>{const before=await scalar('select count(*) from ordenes');await rejected('select plan_crear_orden($1,2,.2)',[A],'22023');assert.equal(await scalar('select count(*) from ordenes'),before);}));
 await test('técnico no crea en obra ajena',()=>as(4,()=>assert.rejects(()=>db.query('select plan_crear_orden($1,.2,.2)',[B]),e=>e.code==='42501')));
 await test('estado y comentario se confirman en una transacción',()=>as(4,async()=>{
  const id=await scalar('select plan_crear_orden($1,.2,.2)',[A]),at=await scalar('select updated_at from ordenes where id=$1',[id]);
  await db.query("select plan_cambiar_estado_orden($1,$2,'En proceso',null,'Inicio confirmado')",[id,at]);
  assert.equal(await scalar('select estado from ordenes where id=$1',[id]),'En proceso');assert.equal(await scalar('select count(*) from ot_comentarios where orden_id=$1',[id]),1);
 }));
 await test('versión antigua rechaza estado y no deja comentario parcial',()=>as(4,async()=>{
  const id=await scalar('select plan_crear_orden($1,.2,.2)',[A]),at=await scalar("select updated_at-interval '1 second' from ordenes where id=$1",[id]);
  await rejected("select plan_cambiar_estado_orden($1,$2,'En proceso',null,'No debe quedar')",[id,at],'PT409');assert.equal(await scalar('select count(*) from ot_comentarios where orden_id=$1',[id]),0);
 }));
 await test('creador técnico cancela su OT reciente vacía',()=>as(4,async()=>{const id=await scalar('select plan_crear_orden($1,.2,.2)',[A]);await db.query('select plan_cancelar_orden_nueva($1)',[id]);assert.equal(await scalar('select count(*) from ordenes where id=$1',[id]),0);}));
 await test('OT con evidencia de actividad ya no se cancela como nueva',()=>as(4,async()=>{const id=await scalar('select plan_crear_orden($1,.2,.2)',[A]),at=await scalar('select updated_at from ordenes where id=$1',[id]);await db.query("select plan_cambiar_estado_orden($1,$2,'En proceso',null,'Ya iniciada')",[id,at]);await assert.rejects(()=>db.query('select plan_cancelar_orden_nueva($1)',[id]),e=>e.code==='42501');}));
 await test('lector no crea',()=>as(6,()=>rejected(`select plan_crear_orden('${A}',.2,.2)`,[],'42501')));
 await test('lector no cancela orden ajena',()=>as(4,async()=>{const id=await scalar('select plan_crear_orden($1,.2,.2)',[A]);await db.query("select set_config('request.jwt.claim.sub',$1,true)",[uid(6)]);await rejected('select plan_cancelar_orden_nueva($1)',[id],'42501');}));
 await test('RPC no ejecutables por anónimo',async()=>assert.equal(await scalar("select count(*) from pg_proc where proname in ('plan_crear_orden','plan_cambiar_estado_orden','plan_cancelar_orden_nueva') and has_function_privilege('anon',oid,'execute')"),0));
 await test('rollback retira los tres RPC y el índice del día 7',async()=>{await run('supabase/rollback/202609210005_connected_ot_flow.rollback.sql');assert.equal(await scalar("select count(*) from pg_proc where proname in ('plan_crear_orden','plan_cambiar_estado_orden','plan_cancelar_orden_nueva')"),0);assert.equal(await scalar("select count(*) from pg_class where relname='ordenes_proyecto_ot_activa_uidx'"),0);});
}catch(e){results.push({name:'preparación',ok:false,error:e.message});}
finally{await db.close();await mkdir('docs/estabilizacion-2026-09-20/dia-7',{recursive:true});const report={testedAt:new Date().toISOString(),sha256:createHash('sha256').update(await readFile(migration)).digest('hex'),passed:results.filter(r=>r.ok).length,total:results.length,results};await writeFile('docs/estabilizacion-2026-09-20/dia-7/sql-tests.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));if(results.some(r=>!r.ok))process.exitCode=1;}
