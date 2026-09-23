import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const {PGlite}=await import(pathToFileURL('C:/dev/fio-pro/dist/nc-sql-runtime/node_modules/@electric-sql/pglite/dist/index.js').href);
const db=new PGlite(),results=[];
const migration='supabase/migrations/202609220007_trust_events_contractors.sql';
const uid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const A='11000000-0000-4000-8000-000000000001',B='22000000-0000-4000-8000-000000000001';
const T1='10000000-0000-4000-8000-000000000001',T2='20000000-0000-4000-8000-000000000002';
const O='81000000-0000-4000-8000-000000000001',F='82000000-0000-4000-8000-000000000001';
const run=async p=>db.exec(await readFile(p,'utf8'));
const scalar=async(q,p=[])=>Object.values((await db.query(q,p)).rows[0])[0];
async function as(n,fn){await db.exec(`begin;set local role authenticated;select set_config('request.jwt.claim.sub','${uid(n)}',true)`);try{return await fn();}finally{await db.exec('rollback');}}
async function denied(q,p=[],code='42501'){await db.exec('savepoint expected');try{await db.query(q,p);assert.fail('Faltó rechazo');}catch(e){await db.exec('rollback to savepoint expected');if(e.code==='ERR_ASSERTION')throw e;assert.equal(e.code,code,e.message);}finally{await db.exec('release savepoint expected');}}
async function test(name,fn){try{await fn();results.push({name,ok:true});}catch(e){await db.exec('rollback').catch(()=>{});results.push({name,ok:false,error:e.message});}}
try{
 await run('supabase/tests/captured-domain.sql');await run('supabase/tests/storage-foundation.sql');
 await db.exec("create function auth.jwt() returns jsonb language sql stable as $$select jsonb_build_object('email','fixture@plan.test')$$");
 for(const m of ['202609200001_multitenancy_foundation','202609200002_multitenancy_enforcement','202609210003_private_storage','202609210004_session_capabilities_costs','202609210005_connected_ot_flow','202609210006_atomic_restore'])await run(`supabase/migrations/${m}.sql`);
 const spec=JSON.parse(await readFile('docs/estabilizacion-2026-09-20/fixtures-tenants.json','utf8')),users=[spec.platformCreator,...spec.organizations.flatMap(o=>o.users)];
 for(let i=0;i<users.length;i++)await db.query('insert into auth.users(id,email) values($1,$2)',[uid(i+1),users[i].email]);
 await run('supabase/seeds/20260920_fictional_tenants.sql');
 await db.query("insert into ordenes(id,proyecto_id,ot,ubicacion,rubro,responsable,prioridad,plano_ref_url,contratistas,created_by,updated_by) values($1,$2,'OT-001','','Prueba','Equipo','Media','',array['Preexistente'],$3,$3)",[O,A,uid(3)]);
 await db.query("insert into ot_comentarios(orden_id,proyecto_id,user_id,user_email,comentario,estado_anterior,estado_nuevo) values($1,$2,$3,'original@plan.test','Comentario histórico','Pendiente','En proceso')",[O,A,uid(3)]);
 await run(migration);await run('supabase/migrations/202609220008_photo_originals.sql');
 await test('backfill conserva hechos previos sin inventar actividad',async()=>{assert.equal(Number(await scalar('select count(*) from plan_ot_eventos')),1);assert.equal(await scalar('select legado from plan_ot_eventos'),true);assert.equal(await scalar('select nombre from plan_contratistas'),'Preexistente');});
 await test('directorio compartido y nombres idempotentes',()=>as(4,async()=>{const c=await scalar('select to_jsonb(plan_agregar_contratista($1,$2))',[T1,'  Electricista  ']);const d=await scalar('select to_jsonb(plan_agregar_contratista($1,$2))',[T1,'electricista']);assert.equal(c.id,d.id);assert.equal(c.creado_por,uid(4));}));
 await test('lector no agrega; técnico no agrega a otra empresa',async()=>{await as(6,()=>denied('select to_jsonb(plan_agregar_contratista($1,$2))',[T1,'Prohibido']));await as(4,()=>denied('select to_jsonb(plan_agregar_contratista($1,$2))',[T2,'Prohibido']));});
 await test('otra empresa no lee directorio ni historial',()=>as(8,async()=>{assert.equal(Number(await scalar('select count(*) from plan_contratistas')),0);assert.equal(Number(await scalar('select count(*) from plan_ot_eventos')),0);}));
 await test('creador administra destino explícito',()=>as(1,async()=>{const r=await scalar('select to_jsonb(plan_agregar_contratista($1,$2))',[T2,'Destino 2']);assert.equal(r.tenant_id,T2);}));
 await test('no se puede insertar/modificar/borrar evidencia directamente',()=>as(3,async()=>{for(const q of ['delete from plan_ot_eventos','update plan_ot_eventos set actor_email=\'falso\'','insert into plan_ot_eventos default values','insert into plan_contratistas default values'])await denied(q);}));
 await test('edición registra todos los cambios, autor real y asignación atómica',()=>as(4,async()=>{
 await db.query("update ordenes set descripcion='Reparación',pos_x=.7,contratistas=array['Nuevo'] where id=$1",[O]);
 const e=(await db.query("select * from plan_ot_eventos where not legado")).rows[0];assert.equal(e.actor_email,users[3].email);assert.equal(e.actor_id,uid(4));assert.equal(e.cambios.descripcion.despues,'Reparación');assert.equal(e.cambios.pos_x.despues,.7);assert.equal(await scalar("select count(*) from plan_contratistas where nombre='Nuevo'"),1);
 }));
 await test('guardar sin cambios no genera ruido',()=>as(4,async()=>{await db.query('update ordenes set descripcion=descripcion where id=$1',[O]);assert.equal(Number(await scalar('select count(*) from plan_ot_eventos where not legado')),0);}));
 await test('costo visible solo a supervisor, incluso via paginación',()=>as(3,async()=>{
 await db.query('update ordenes set costo=345678 where id=$1',[O]);assert.equal(Number(await scalar('select count(*) from plan_ot_eventos where restringido')),1);
 await db.query("select set_config('request.jwt.claim.sub',$1,true)",[uid(4)]);assert.equal(Number(await scalar('select count(*) from plan_ot_eventos where restringido')),0);assert.ok(!JSON.stringify(await scalar('select plan_eventos_pagina()')).includes('345678'));
 }));
 await test('estado y comentario quedan en misma transacción',()=>as(4,async()=>{
 const at=await scalar('select updated_at::text from ordenes where id=$1',[O]);await db.query("select plan_cambiar_estado_orden($1,$2,'En proceso',null,'Inicio confirmado')",[O,at]);
 assert.equal(Number(await scalar('select count(*) from plan_ot_eventos where not legado')),2);
 await denied("select plan_cambiar_estado_orden($1,'2000-01-01','Cerrada',null,'Conflicto')",[O],'PT409');assert.equal(Number(await scalar('select count(*) from plan_ot_eventos where not legado')),2);
 }));
 await test('foto, descripción y anotación quedan auditadas sin URLs privadas',()=>as(4,async()=>{
 await db.query("insert into fotos(id,orden_id,proyecto_id,categoria,file_path,file_url,file_type) values($1,$2,$3,'ANTES',$4,$5,'imagen')",[F,O,A,`${T1}/${A}/${O}/ruta-secreta.jpg`,`storage://fotos/${T1}/${A}/${O}/ruta-secreta.jpg`]);
 await db.query("update fotos set descripcion='Detalle',anotaciones='[{\"type\":\"arrow\"}]' where id=$1",[F]);
 const s=JSON.stringify((await db.query("select cambios from plan_ot_eventos where tipo like 'fotos.%'")).rows);assert.match(s,/arrow/);assert.ok(!s.includes('secreta'));assert.match(s,/Detalle/);
 }));
 await test('original inmutable y protegido frente a borrado por clientes anteriores',()=>as(4,async()=>{
 const path=T1+'/'+A+'/'+O+'/original.jpg',ref='storage://fotos/'+path;
 await db.query("insert into storage.objects(bucket_id,name,owner_id) values('fotos',$1,$2)",[path,uid(4)]);
 await db.query("insert into fotos(id,orden_id,proyecto_id,categoria,file_path,file_url,file_type) values($1,$2,$3,'ANTES',$4,$5,'imagen')",[F,O,A,path,ref]);
 assert.equal(await scalar('select file_path from plan_foto_originales where foto_id=$1',[F]),path);
 await denied("update plan_foto_originales set file_path='ajeno' where foto_id=$1",[F]);
 await db.query('delete from storage.objects where name=$1',[path]);assert.equal(Number(await scalar('select count(*) from storage.objects where name=$1',[path])),1);
 await db.query("update fotos set edicion='{\"espacio\":\"ancho1000\"}',descripcion='Primera edición' where id=$1 and revision=0",[F]);
 assert.equal(await scalar('select revision from fotos where id=$1',[F]),1);
 assert.equal((await db.query("update fotos set descripcion='Edición vieja' where id=$1 and revision=0 returning id",[F])).rows.length,0);
 }));
 await test('fecha inicial usa día civil de Paraguay',()=>as(4,async()=>{
 const id=await scalar('select plan_crear_orden($1,.2,.3)',[A]);assert.equal(await scalar("select fecha_ingreso=timezone('America/Asuncion',now())::date from ordenes where id=$1",[id]),true);
 }));
 await test('comentarios y su eliminación conservan texto y autor',()=>as(4,async()=>{
 const id=await scalar("insert into comentarios_ot(orden_id,proyecto_id,user_id,user_name,texto) values($1,$2,$3,'Técnico','Evidencia') returning id",[O,A,uid(4)]);await db.query('delete from comentarios_ot where id=$1',[id]);
 assert.equal(Number(await scalar("select count(*) from plan_ot_eventos where tipo like 'comentarios_ot.%'")),2);
 }));
 await test('borrar OT no borra historial',()=>as(3,async()=>{await db.query('delete from ordenes where id=$1',[O]);assert.equal(Number(await scalar("select count(*) from plan_ot_eventos where tipo='ordenes.delete'")),1);assert.equal(Number(await scalar('select count(*) from plan_ot_eventos where legado')),1);}));
 await test('exportación idempotente y semántica solicitada',()=>as(6,async()=>{const q='select plan_solicitar_exportacion($1,$2,$3,$4)',p=[O,'ficha','HTML',uid(50)];const id=await scalar(q,p);assert.equal(await scalar(q,p),id);assert.equal(await scalar('select tipo from plan_ot_eventos where id=$1',[id]),'informe.solicitado');await denied(q,[O,'ficha','PDF',uid(50)],'22023');}));
 await test('exportación ajena denegada',()=>as(8,()=>denied('select plan_solicitar_exportacion($1,$2,$3,$4)',[O,'ficha','PDF',uid(51)])));
 await test('lecturas propias persistentes, idempotentes y aisladas',()=>as(3,async()=>{
 await db.query("update ordenes set descripcion='Notificable' where id=$1",[O]);const p=await scalar('select plan_eventos_pagina()');assert.equal(p.sinLeer,1);const id=p.eventos[0].id;
 await db.query('insert into plan_eventos_lecturas(evento_id) values($1) on conflict do nothing',[id]);assert.equal((await scalar('select plan_eventos_pagina()')).sinLeer,0);
 await denied('insert into plan_eventos_lecturas(evento_id,user_id) values($1,$2)',[id,uid(4)]);
 await db.query("select set_config('request.jwt.claim.sub',$1,true)",[uid(4)]);assert.equal((await scalar('select plan_eventos_pagina()')).sinLeer,1);
 await db.query("select set_config('request.jwt.claim.sub',$1,true)",[uid(8)]);await denied('insert into plan_eventos_lecturas(evento_id) values($1)',[id]);
 }));
 await test('revocar membresía retira eventos y lecturas',async()=>{
 await db.exec('begin');await db.query('delete from proyecto_miembros where proyecto_id=$1 and user_id=$2',[A,uid(4)]);await db.exec('set local role authenticated');await db.query("select set_config('request.jwt.claim.sub',$1,true)",[uid(4)]);assert.equal((await scalar('select plan_eventos_pagina($1)',[O])).eventos.length,0);await db.exec('rollback');
 });
 await test('paginación sin duplicados y sin pérdida',()=>as(3,async()=>{
 for(let i=0;i<55;i++)await db.query('update ordenes set descripcion=$1 where id=$2',[`Página ${i}`,O]);const p=await scalar('select plan_eventos_pagina()');assert.equal(p.eventos.length,50);assert.equal(p.hayMas,true);const last=p.eventos.at(-1),next=await scalar('select plan_eventos_pagina(null,$1,$2)',[last.created_at,last.id]);assert.equal(next.eventos.length,5);assert.equal(new Set([...p.eventos,...next.eventos].map(e=>e.id)).size,55);
 }));
 await test('anónimo no accede a tablas ni funciones',async()=>{for(const t of ['plan_ot_eventos','plan_eventos_lecturas','plan_contratistas'])assert.equal(await scalar('select has_table_privilege(\'anon\',$1,\'select\')',[t]),false);assert.equal(await scalar("select count(*) from pg_proc where proname in ('plan_agregar_contratista','plan_registrar_cambio_ot','plan_solicitar_exportacion','plan_eventos_pagina') and has_function_privilege('anon',oid,'execute')"),0);});
 await test('reversión conserva evidencia y retira acceso',async()=>{const n=await scalar('select count(*) from plan_ot_eventos');await run('supabase/rollback/202609220007_trust_events_contractors.rollback.sql');assert.equal(await scalar('select count(*) from plan_ot_eventos'),n);assert.equal(await scalar("select has_table_privilege('authenticated','plan_ot_eventos','select')"),false);});
}catch(e){results.push({name:'preparación',ok:false,error:e.message});}
finally{await db.close();await mkdir('docs/bloqueos-2026-09-22',{recursive:true});const report={testedAt:new Date().toISOString(),sha256:createHash('sha256').update(await readFile(migration)).digest('hex'),photoMigrationSha256:createHash('sha256').update(await readFile('supabase/migrations/202609220008_photo_originals.sql')).digest('hex'),passed:results.filter(r=>r.ok).length,total:results.length,results};await writeFile('docs/bloqueos-2026-09-22/sql-tests.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));if(results.some(r=>!r.ok))process.exitCode=1;}
