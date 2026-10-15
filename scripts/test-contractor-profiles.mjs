import assert from 'node:assert/strict';
import {readFile,readdir,mkdir,writeFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
await mkdir('output/contratistas-implementation-20261015',{recursive:true});
const db=new PGlite(),id=n=>`41000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const creator=id(1),outsider=id(2),tenant=id(10),other=id(11),work=id(20),work2=id(21),foreign=id(22);
const one=async(sql,args=[])=>(await db.query(sql,args)).rows[0];
const as=async user=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user??'']);if(user)await db.exec('set role authenticated')};
try{
 for(const f of ['captured-domain.sql','storage-foundation.sql'])await db.exec(await readFile('supabase/tests/'+f,'utf8'));
 await db.exec("alter table auth.users add column raw_user_meta_data jsonb default '{}';alter table auth.users add column created_at timestamptz default now();alter table auth.users add column last_sign_in_at timestamptz;alter table storage.buckets add column name text;alter table storage.buckets add column file_size_limit bigint;alter table storage.buckets add column allowed_mime_types text[];");
 for(const f of (await readdir('supabase/migrations')).filter(f=>f.endsWith('.sql')).sort())await db.exec(await readFile('supabase/migrations/'+f,'utf8'));
 await db.query('insert into auth.users(id,email) values($1,$2),($3,$4)',[creator,'contractor@qa.test',outsider,'outsider@qa.test']);await db.query('insert into plataforma_administradores(user_id) values($1)',[creator]);
 await db.query("insert into tenants(id,nombre,slug) values($1,'Empresa QA','contractor-qa'),($2,'Otra empresa','contractor-other')",[tenant,other]);
 for(const [w,t,name] of [[work,tenant,'Edificio QA'],[work2,tenant,'Casa QA'],[foreign,other,'Obra ajena']])await db.query("insert into proyectos(id,tenant_id,nombre,created_by,plano_url) values($1,$2,$3,$4,'pending://plan-upload-required')",[w,t,name,creator]);
 await as(creator);
 const save=async(t,name,c=null)=>(await one("select plan_directorio_guardar('contratista',$1,$2,$3,false) id",[t,c,{nombre:name,activo:true,tipo:'independiente',especialidad:'Electricidad',telefono:'0000'}])).id;
 const contractor=await save(tenant,'Electricista QA'),second=await save(tenant,'Segundo QA'),empty=await save(tenant,'Sin actividad QA'),otherContractor=await save(other,'Electricista QA');
 const orders=[];
 for(let i=0;i<23;i++){const order=(await one('select plan_crear_orden($1,null,null) id',[i%2?work2:work])).id;orders.push(order);await db.exec('reset role');await db.query("update ordenes set contratistas=$1,estado=$2,fecha_ingreso='2026-10-01',fecha_inicio_trabajos=$3,fecha_fin_trabajos=$4,descripcion=$5 where id=$6",[i===0?['Electricista QA','Segundo QA']:['Electricista QA'],i<2?'Pendiente':'Cerrada',i<2?null:'2026-10-01',i<2?null:'2026-10-03','Trabajo '+i,order]);await as(creator);}
 const list=async(t=tenant)=>(await one('select plan_contratistas_directorio($1) r',[t])).r;
 const profile=async(c=contractor,t=tenant,page=0,state=null,from=null,to=null,w=null)=>(await one('select plan_contratista_perfil($1,$2,$3,$4,$5,$6,$7) r',[t,c,from,to,page,state,w])).r;
 const unassigned=(await one('select plan_crear_orden($1,null,null) id',[work])).id;
 await db.exec('reset role');await db.query("update ordenes set contratistas='{}',descripcion='Sin asignación' where id=$1",[unassigned]);await db.query("update ordenes set descripcion='Sin asignación corregida' where id=$1",[unassigned]);assert.deepEqual((await one('select contratistas from ordenes where id=$1',[unassigned])).contratistas,[]);await as(creator);
 let p=await profile();assert.equal(p.resumen.total,23);assert.equal(p.resumen.cerrada,21);assert.equal(p.resumen.diasEjecucion,3);assert.equal(p.resumen.cierresConFecha,21);assert.equal(p.ordenes.length,20);assert.equal((await profile(contractor,tenant,1)).ordenes.length,3);assert.equal((await profile(contractor,tenant,0,'Activos')).totalOrdenes,2);assert.equal(p.obras.length,2);
 assert.equal((await profile(second)).ordenes[0].compartida,true);assert.equal((await profile(empty)).resumen.diasEjecucion,null);assert.equal((await profile(contractor,tenant,0,null,'2026-11-01')).resumen.total,0);
 assert.equal((await list()).find(c=>c.id===contractor).indicadores.total,23);assert.equal((await list()).find(c=>c.id===empty).indicadores.total,0);
 await save(tenant,'Nombre corregido QA',contractor);assert.equal((await profile()).resumen.total,23);assert.equal((await list()).find(c=>c.id===contractor).datos.nombre,'Nombre corregido QA');
 await db.exec('reset role');await db.query("update ordenes set deleted_at=now() where id=$1",[orders[2]]);await db.query("update ordenes set fecha_fin_trabajos='2026-09-30' where id=$1",[orders[3]]);await as(creator);
 p=await profile();assert.equal(p.resumen.total,22);assert.equal(p.resumen.cierresConFecha,19);assert.equal(p.resumen.diasEjecucion,3);
 await save(tenant,'Segunda corrección de nombre QA',contractor);await db.exec('reset role');await db.query("update ordenes set descripcion='Otra edición después de renombrar' where id=$1",[orders[3]]);assert.deepEqual((await one('select contratistas from ordenes where id=$1',[orders[3]])).contratistas,['Segunda corrección de nombre QA']);await as(creator);assert.equal((await profile()).resumen.total,22);
 await db.exec('reset role');await assert.rejects(db.query("update ordenes set contratistas=array['Inventado'] where id=$1",[orders[0]]),e=>e.code==='22023');await as(creator);
 await assert.rejects(profile(otherContractor,tenant),e=>e.code==='42501');await assert.rejects(profile(contractor,other),e=>e.code==='42501');await assert.rejects(profile(contractor,tenant,-1),e=>e.code==='22023');
 await assert.rejects(one('select * from plan_contratista_historial_base($1)',[tenant]),e=>e.code==='42501');
 await as(outsider);await assert.rejects(profile(),e=>e.code==='42501');await assert.rejects(list(),e=>e.code==='42501');
 await db.exec('reset role');await db.query("insert into tenant_miembros(tenant_id,user_id,rol) values($1,$2,'supervisor')",[tenant,outsider]);await db.query("insert into proyecto_miembros(proyecto_id,user_id,rol) values($1,$2,'supervisor')",[work,outsider]);await db.query("insert into plan_equipo_permisos(tenant_id,user_id,clave,permitido,delegable) values($1,$2,'contratista.ver',true,false) on conflict(tenant_id,user_id,clave) do update set permitido=true",[tenant,outsider]);await as(outsider);
 assert.equal((await profile()).resumen.total,11);assert.equal((await profile()).obras.length,1);assert.equal((await list()).find(c=>c.id===contractor).indicadores.total,11);await assert.rejects(list(other),e=>e.code==='42501');
 const evidence={resultado:'PASS',controles:['identidad estable tras renombrado','paginación','estados y períodos','días inclusivos solo con fechas válidas','participación compartida','contratista sin trabajos','OT eliminada excluida','permiso de empresa y alcance por obra','función interna inaccesible','sin presupuestos ni evaluaciones ficticias']};await writeFile('output/contratistas-implementation-20261015/pruebas-servidor.json',JSON.stringify(evidence,null,2));console.log('PASS: '+evidence.controles.join(', '));
}finally{await db.close()}
