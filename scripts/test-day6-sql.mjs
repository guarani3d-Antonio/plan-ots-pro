import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
const {PGlite}=await import(pathToFileURL(resolve(process.argv[2])).href);
const db=new PGlite(),results=[];
const migration='supabase/migrations/202609210004_session_capabilities_costs.sql';
const uid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const A='11000000-0000-4000-8000-000000000001',B='22000000-0000-4000-8000-000000000001',TA='10000000-0000-4000-8000-000000000001';
const scalar=async q=>Object.values((await db.query(q)).rows[0])[0];
const run=async p=>db.exec(await readFile(p,'utf8'));
async function as(n,fn,role='authenticated'){await db.exec(`begin;set local role ${role};select set_config('request.jwt.claim.sub','${uid(n)}',true)`);try{return await fn();}finally{await db.exec('rollback');}}
const denied=q=>assert.rejects(()=>db.query(q),e=>e.code==='42501');
async function test(name,fn){try{await fn();results.push({name,ok:true});}catch(e){await db.exec('rollback').catch(()=>{});results.push({name,ok:false,error:e.message.split('\n')[0]});}}
try{
 await run('supabase/tests/captured-domain.sql');await run('supabase/tests/storage-foundation.sql');
 for(const m of ['202609200001_multitenancy_foundation','202609200002_multitenancy_enforcement','202609210003_private_storage'])await run('supabase/migrations/'+m+'.sql');
 const spec=JSON.parse(await readFile('docs/estabilizacion-2026-09-20/fixtures-tenants.json','utf8'));
 const users=[spec.platformCreator,...spec.organizations.flatMap(o=>o.users)];
 for(let i=0;i<users.length;i++)await db.query('insert into auth.users(id,email) values($1,$2)',[uid(i+1),users[i].email]);
 await run('supabase/seeds/20260920_fictional_tenants.sql');
 for(const [n,p,c] of [[301,A,123],[302,B,789]])await db.query('insert into ordenes(id,proyecto_id,ot,ubicacion,rubro,responsable,prioridad,plano_ref_url,costo) values($1,$2,$3,\'A\',\'QA\',\'QA\',\'Media\',\'fixture\',$4)',[uid(n),p,'QA-'+n,c]);
 await db.query("insert into versiones(proyecto_id,nombre,snapshot) values($1,'Costos históricos',$2)",[A,JSON.stringify({ordenes:[{costo:123,campos:{costo:456}}]})]);
 const original=await scalar('select jsonb_agg(to_jsonb(o) order by id) from ordenes o');
 const audit=await scalar("select pg_get_functiondef('fn_audit_orden_eliminada()'::regprocedure)");
 await run(migration);
 await test('migración separa y conserva los dos importes',async()=>{assert.equal(await scalar('select count(*) from ordenes where costo is not null'),0);assert.equal(await scalar('select sum(costo) from orden_costos'),'912');});
 for(const [n,visible] of [[1,2],[2,1],[3,1],[4,0],[5,0],[6,0],[7,1],[8,1],[9,0],[10,0],[11,0]])await test(`rol ${n}: costos según capacidad efectiva`,()=>as(n,async()=>assert.equal(await scalar('select count(*) from orden_costos'),visible)));
 await test('anon sin acceso a tabla privada',()=>as(4,()=>denied('select * from orden_costos'),'anon'));
 await test('técnico lee órdenes sin recuperar ni filtrar costo real',()=>as(4,async()=>{assert.equal(await scalar('select costo from ordenes limit 1'),null);assert.equal(await scalar('select count(*) from ordenes where costo=123'),0);}));
 await test('técnico no modifica importes',()=>as(4,()=>denied(`update ordenes set costo=100 where id='${uid(301)}'`)));
 await test('técnico edita contenido sin borrar el costo privado',()=>as(4,async()=>{await db.query(`update ordenes set comentarios='Cambio técnico' where id='${uid(301)}'`);assert.equal(await scalar('select costo from ordenes limit 1'),null);}));
 await test('supervisor actualiza costo y cero sin publicarlos',()=>as(3,async()=>{await db.query(`update ordenes set costo=450 where id='${uid(301)}'`);assert.equal(await scalar('select costo from orden_costos'), '450');await db.query(`update ordenes set costo=0 where id='${uid(301)}'`);assert.equal(await scalar('select costo from orden_costos'),'0');assert.equal(await scalar('select costo from ordenes limit 1'),null);}));
 await test('sin escritura directa en tabla privada',()=>as(3,()=>denied(`update orden_costos set costo=500`)));
 await test('inserción con costo se completa atómicamente',()=>as(3,async()=>{await db.query(`insert into ordenes(proyecto_id,ot,ubicacion,rubro,responsable,prioridad,plano_ref_url,costo) values('${A}','Con costo','A','QA','QA','Media','fixture',321)`);await db.exec('set constraints all immediate');assert.equal(await scalar('select sum(costo) from orden_costos'),'444');}));
 await test('técnico no lee snapshots que contienen costos',()=>as(4,async()=>assert.equal(await scalar('select count(*) from versiones'),0)));
 await test('técnico no crea snapshots',()=>as(4,()=>denied(`insert into versiones(proyecto_id,nombre,snapshot) values('${A}','NO','{}')`)));
 await test('supervisor conserva snapshots íntegros',()=>as(3,async()=>assert.equal(await scalar("select snapshot#>>'{ordenes,0,campos,costo}' from versiones"),'456')));
 await test('borrado audita el costo antes de cascada',()=>as(3,async()=>{await db.query(`delete from ordenes where id='${uid(301)}'`);assert.equal(await scalar('select datos_completos->>\'costo\' from ordenes_eliminadas'),'123');assert.equal(await scalar('select count(*) from orden_costos'),0);}));
 await test('contexto del técnico no concede administración',()=>as(4,async()=>{const c=await scalar('select plan_contexto_acceso()');assert.equal(c.creador,false);assert.equal(c.obras.length,1);assert.equal(c.obras[0].editar,true);assert.equal(c.obras[0].administrar,false);assert.equal(c.empresas[0].puede_crear,false);}));
 await test('contexto del Creador cubre cuatro obras y dos empresas',()=>as(1,async()=>{const c=await scalar('select plan_contexto_acceso()');assert.equal(c.creador,true);assert.equal(c.obras.length,4);assert.equal(c.empresas.length,2);}));
 await test('admin de empresa no ejecuta RPC de Creador',()=>as(2,()=>denied("select plan_admin_empresa('No autorizada')")));
 await test('Creador crea y desactiva empresa',()=>as(1,async()=>{const id=await scalar("select plan_admin_empresa('Empresa temporal')");await db.query('select plan_admin_empresa($1,$2,false)',['Empresa temporal',id]);assert.equal(await scalar(`select activo from tenants where id='${id}'`),false);}));
 await test('Creador rebaja miembro sin conservar capacidades',()=>as(1,async()=>{await db.query(`select plan_admin_miembro('${TA}','${users[3].email}','viewer',true)`);await db.query(`select set_config('request.jwt.claim.sub','${uid(4)}',true)`);assert.equal((await scalar('select plan_contexto_acceso()')).obras[0].editar,false);}));
 await test('Creador revoca acceso a obra',()=>as(1,async()=>{await db.query(`select plan_admin_obra_miembro('${A}','${users[3].email}','sin_acceso')`);await db.query(`select set_config('request.jwt.claim.sub','${uid(4)}',true)`);assert.equal((await scalar('select plan_contexto_acceso()')).obras.length,0);}));
 await test('revocación corta costos con sesión existente',async()=>{await db.query(`update tenant_miembros set activo=false where user_id='${uid(3)}'`);try{await as(3,async()=>assert.equal(await scalar('select count(*) from orden_costos'),0));}finally{await db.query(`update tenant_miembros set activo=true where user_id='${uid(3)}'`);}});
 await test('funciones RPC no ejecutables por anon',async()=>assert.equal(await scalar("select count(*) from pg_proc where proname in ('plan_contexto_acceso','plan_admin_empresa','plan_admin_miembro','plan_admin_obra_miembro') and has_function_privilege('anon',oid,'execute')"),0));
 await test('rollback restaura filas y auditoría previas',async()=>{await run('supabase/rollback/202609210004_session_capabilities_costs.rollback.sql');assert.deepEqual(await scalar('select jsonb_agg(to_jsonb(o) order by id) from ordenes o'),original);assert.equal(await scalar("select pg_get_functiondef('fn_audit_orden_eliminada()'::regprocedure)"),audit);});
}catch(e){results.push({name:'preparación',ok:false,error:e.message});}
finally{await db.close();await mkdir('docs/estabilizacion-2026-09-20/dia-6',{recursive:true});const report={testedAt:new Date().toISOString(),sha256:createHash('sha256').update(await readFile(migration)).digest('hex'),passed:results.filter(r=>r.ok).length,total:results.length,results};await writeFile('docs/estabilizacion-2026-09-20/dia-6/sql-tests.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));if(results.some(r=>!r.ok))process.exitCode=1;}
