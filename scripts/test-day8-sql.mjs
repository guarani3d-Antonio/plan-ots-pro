import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
const entry=process.argv[2]??'C:/dev/fio-pro/dist/nc-sql-runtime/node_modules/@electric-sql/pglite/dist/index.js';
const {PGlite}=await import(pathToFileURL(resolve(entry)).href);const db=new PGlite(),results=[];
const migration='supabase/migrations/202609210006_atomic_restore.sql';
const uid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const A='11000000-0000-4000-8000-000000000001',B='22000000-0000-4000-8000-000000000001';
const O1='81000000-0000-4000-8000-000000000001',O2='81000000-0000-4000-8000-000000000002',O3='81000000-0000-4000-8000-000000000003';
const V1='82000000-0000-4000-8000-000000000001',V2='82000000-0000-4000-8000-000000000002',V3='82000000-0000-4000-8000-000000000003',V4='82000000-0000-4000-8000-000000000004';
const run=async path=>db.exec(await readFile(path,'utf8'));const scalar=async(q,p=[])=>Object.values((await db.query(q,p)).rows[0])[0];
async function as(n,fn){await db.exec(`begin;set local role authenticated;select set_config('request.jwt.claim.sub','${uid(n)}',true)`);try{return await fn();}finally{await db.exec('rollback');}}
async function rejected(query,params,code){await db.exec('savepoint expected');try{await db.query(query,params);assert.fail('Faltó rechazo');}catch(e){await db.exec('rollback to savepoint expected');if(e.code==='ERR_ASSERTION')throw e;assert.equal(e.code,code);}finally{await db.exec('release savepoint expected');}}
async function test(name,fn){try{await fn();results.push({name,ok:true});}catch(e){await db.exec('rollback').catch(()=>{});results.push({name,ok:false,error:e.message});}}
const snap=(orders)=>({ordenes:orders,total:orders.length,fecha:'2026-09-21T00:00:00Z'});
const item=(id,ot,comentarios)=>({id,ot,ubicacion:'Sector restaurado',rubro:'Prueba',estado:'Pendiente',responsable:'Equipo restaurado',prioridad:'Media',pos_x:.2,pos_y:.3,comentarios,campos:{origen:'snapshot'}});
try{
 await run('supabase/tests/captured-domain.sql');await run('supabase/tests/storage-foundation.sql');
 await db.exec("create function auth.jwt() returns jsonb language sql stable as $$select jsonb_build_object('email','fixture@plan.test')$$");
 for(const m of ['202609200001_multitenancy_foundation','202609200002_multitenancy_enforcement','202609210003_private_storage','202609210004_session_capabilities_costs','202609210005_connected_ot_flow'])await run(`supabase/migrations/${m}.sql`);
 const spec=JSON.parse(await readFile('docs/estabilizacion-2026-09-20/fixtures-tenants.json','utf8')),users=[spec.platformCreator,...spec.organizations.flatMap(o=>o.users)];
 for(let i=0;i<users.length;i++)await db.query('insert into auth.users(id,email) values($1,$2)',[uid(i+1),users[i].email]);
 await run('supabase/seeds/20260920_fictional_tenants.sql');await run(migration);
 assert.match(await readFile(migration,'utf8'),/order by o\.id for update/);
 for(const [id,ot] of [[O1,'OT-001'],[O2,'OT-002'],[O3,'OT-099']])await db.query("insert into ordenes(id,proyecto_id,ot,ubicacion,rubro,estado,responsable,prioridad,plano_ref_url,pos_x,pos_y,created_by,updated_by) values($1,$2,$3,'Actual','Prueba','En proceso','Actual','Alta','',.5,.5,$4,$4)",[id,A,ot,uid(4)]);
 await db.query('insert into versiones(id,proyecto_id,nombre,snapshot,created_by) values($1,$2,$3,$4,$5)',[V1,A,'Intercambio válido',snap([item(O1,'OT-002','restaurado uno'),item(O2,'OT-001','restaurado dos')]),uid(3)]);
 await db.query('insert into versiones(id,proyecto_id,nombre,snapshot,created_by) values($1,$2,$3,$4,$5)',[V2,A,'Falta OT',snap([item('89999999-0000-4000-8000-000000000099','OT-050','ausente')]),uid(3)]);
 await db.query('insert into versiones(id,proyecto_id,nombre,snapshot,created_by) values($1,$2,$3,$4,$5)',[V3,A,'Duplicada',snap([item(O1,'OT-010','a'),item(O2,'OT-010','b')]),uid(3)]);
 await db.query('insert into versiones(id,proyecto_id,nombre,snapshot,created_by) values($1,$2,$3,$4,$5)',[V4,A,'Sin órdenes',{total:0},uid(3)]);
 await test('supervisor restaura intercambio y crea backup atómico',()=>as(3,async()=>{
  const before=Number(await scalar('select count(*) from versiones where proyecto_id=$1',[A]));
  const result=await scalar('select plan_restaurar_version($1,$2)',[V1,A]);assert.equal(result.restored,2);assert.match(result.backup_id,/^[0-9a-f-]{36}$/);
  assert.equal(Number(await scalar('select count(*) from versiones where proyecto_id=$1',[A])),before+1);
  assert.deepEqual((await db.query('select ot,comentarios from ordenes where id in ($1,$2) order by id',[O1,O2])).rows,[{ot:'OT-002',comentarios:'restaurado uno'},{ot:'OT-001',comentarios:'restaurado dos'}]);
  assert.equal(Number(await scalar("select jsonb_array_length(snapshot->'ordenes') from versiones where id=$1",[result.backup_id])),3);
 }));
 await test('snapshot con OT ausente no cambia nada ni crea backup',()=>as(3,async()=>{const before=Number(await scalar('select count(*) from versiones'));await rejected('select plan_restaurar_version($1,$2)',[V2,A],'P0002');assert.equal(Number(await scalar('select count(*) from versiones')),before);assert.equal(await scalar('select ot from ordenes where id=$1',[O1]),'OT-001');}));
 await test('snapshot con código duplicado se rechaza completo',()=>as(3,async()=>{await rejected('select plan_restaurar_version($1,$2)',[V3,A],'22023');assert.equal(await scalar('select ot from ordenes where id=$1',[O2]),'OT-002');}));
 await test('snapshot sin lista de órdenes se rechaza antes del backup',()=>as(3,async()=>{const before=Number(await scalar('select count(*) from versiones'));await rejected('select plan_restaurar_version($1,$2)',[V4,A],'22023');assert.equal(Number(await scalar('select count(*) from versiones')),before);}));
 await test('conflicto con OT fuera del snapshot revierte backup y cambios',()=>as(3,async()=>{const conflict=snap([item(O1,'OT-099','conflicto')]);const id='82000000-0000-4000-8000-000000000005';await db.query('insert into versiones(id,proyecto_id,nombre,snapshot,created_by) values($1,$2,$3,$4,$5)',[id,A,'Conflicto externo',conflict,uid(3)]);const before=Number(await scalar('select count(*) from versiones'));await rejected('select plan_restaurar_version($1,$2)',[id,A],'23505');assert.equal(Number(await scalar('select count(*) from versiones')),before);assert.equal(await scalar('select ot from ordenes where id=$1',[O1]),'OT-001');}));
 await test('técnico y lector no restauran',async()=>{await as(4,()=>rejected('select plan_restaurar_version($1,$2)',[V1,A],'42501'));await as(6,()=>rejected('select plan_restaurar_version($1,$2)',[V1,A],'42501'));});
 await test('supervisor de otra empresa no restaura',()=>as(8,()=>rejected('select plan_restaurar_version($1,$2)',[V1,A],'42501')));
 await test('anónimo no ejecuta restauración',async()=>assert.equal(await scalar("select count(*) from pg_proc where proname='plan_restaurar_version' and has_function_privilege('anon',oid,'execute')"),0));
 await test('rollback retira solo el RPC del día 8',async()=>{await run('supabase/rollback/202609210006_atomic_restore.rollback.sql');assert.equal(await scalar("select count(*) from pg_proc where proname='plan_restaurar_version'"),0);assert.equal(await scalar("select count(*) from pg_proc where proname='plan_crear_orden'"),1);});
}catch(e){results.push({name:'preparación',ok:false,error:e.message});}
finally{await db.close();await mkdir('docs/estabilizacion-2026-09-20/dia-8',{recursive:true});const report={testedAt:new Date().toISOString(),sha256:createHash('sha256').update(await readFile(migration)).digest('hex'),passed:results.filter(r=>r.ok).length,total:results.length,results};await writeFile('docs/estabilizacion-2026-09-20/dia-8/sql-tests.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));if(results.some(r=>!r.ok))process.exitCode=1;}
