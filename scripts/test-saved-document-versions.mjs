import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const db=new PGlite(),id=n=>`10000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const creator=id(1),outsider=id(2),tenant=id(10),work=id(20);
const one=async(sql,args=[])=>(await db.query(sql,args)).rows[0];
const as=async u=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[u??'']);if(u)await db.exec('set role authenticated')};
try{
 for(const file of ['captured-domain.sql','storage-foundation.sql'])await db.exec(await readFile('supabase/tests/'+file,'utf8'));
 await db.exec("alter table auth.users add column raw_user_meta_data jsonb default '{}';alter table auth.users add column created_at timestamptz default now();alter table auth.users add column last_sign_in_at timestamptz;alter table storage.buckets add column name text;alter table storage.buckets add column file_size_limit bigint;alter table storage.buckets add column allowed_mime_types text[];");
 for(const file of (await readdir('supabase/migrations')).filter(f=>f.endsWith('.sql')).sort())await db.exec(await readFile('supabase/migrations/'+file,'utf8'));
 await db.query('insert into auth.users(id,email) values($1,$2),($3,$4)',[creator,'creator@qa.test',outsider,'outsider@qa.test']);
 await db.query('insert into plataforma_administradores(user_id) values($1)',[creator]);
 await db.query("insert into tenants(id,nombre,slug) values($1,'QA','saved-versions-qa')",[tenant]);
 await db.query("insert into proyectos(id,tenant_id,nombre,plano_url,created_by) values($1,$2,'Obra QA','pending://plan-upload-required',$3)",[work,tenant,creator]);
 await as(creator);
 const order=(await one('select plan_crear_orden($1,0.5,0.5) id',[work])).id;
 const save=async(doc,data,version,request,correction=false,motivo=null)=>(await one("select plan_documento_version_guardar($1,$2,$3,$4,$5,$6,1,'expediente-controlado-2026-10-08-datos') r",[doc,data,version,request,correction,motivo])).r;
 let n=100;
 for(const tipo of ['orden_servicio','visita','relevamiento','avance','cierre','acta','encuesta']){
  const doc=(await one('select (plan_documento_reservar($1,$2,1,$3)).id id',[order,tipo,id(n++)])).id;
  const initial={observaciones:'Inicial: á, ñ y coma,',identificacion:{obra:'Obra QA'}},request=id(n++);
  const first=await save(doc,initial,0,request);
  assert.equal(first.borrador.version,1);assert.deepEqual(first.revision.datos,initial);assert.equal(first.revision.creada_por,creator);
  const retried=await save(doc,initial,0,request);assert.equal(retried.revision.id,first.revision.id);
  await assert.rejects(save(doc,{observaciones:'Cambio'},1,id(n++)),e=>e.code==='22023');
  await assert.rejects(save(doc,{observaciones:'Cambio'},1,id(n++),true,''),e=>e.code==='22023');
  await assert.rejects(db.query('select plan_documento_borrador_guardar($1,$2,1,$3)',[doc,{observaciones:'Bypass'},id(n++)]),e=>e.code==='42501');
  const correction={observaciones:'Corregido: tilde y punto.'},second=await save(doc,correction,1,id(n++),true,'Corrección de puntuación');
  assert.equal(second.borrador.version,2);assert.equal(second.revision.motivo,'Corrección de puntuación');
  assert.deepEqual((await one('select datos from plan_documento_revisiones where id=$1',[first.revision.id])).datos,initial);
  assert.equal((await one('select count(*)::integer n from plan_documento_revisiones where documento_id=$1',[doc])).n,2);
  await assert.rejects(save(doc,{observaciones:'Obsoleto'},1,id(n++),true,'Otra sesión'),e=>e.code==='40001');
  await assert.rejects(db.query('update plan_documento_revisiones set datos=$1 where id=$2',[correction,first.revision.id]),e=>e.code==='42501');
  await assert.rejects(db.query('delete from plan_documento_revisiones where id=$1',[first.revision.id]),e=>e.code==='42501');
  await as(outsider);await assert.rejects(save(doc,correction,2,id(n++),true,'Sin alcance'),e=>e.code==='42501');await as(creator);
 }
 // Previously saved drafts must survive their first corrected version intact.
 const legacy=(await one("select (plan_documento_reservar($1,'visita',1,$2)).id id",[order,id(n++)])).id;
 await db.exec('reset role');await db.query('select plan_documento_borrador_guardar($1,$2,0,$3)',[legacy,{observaciones:'Borrador anterior a la actualización'},id(n++)]);await as(creator);
 const corrected=await save(legacy,{observaciones:'Corrección nueva'},1,id(n++),true,'Aclaración');
 assert.equal(corrected.revisiones.length,2);
 assert.equal(corrected.revisiones[0].datos.observaciones,'Borrador anterior a la actualización');
 assert.equal(corrected.revisiones[1].datos.observaciones,'Corrección nueva');
 const path=`${tenant}/${work}/${order}/photo.jpg`;
 await db.exec("reset role;update storage.buckets set public=false where id='fotos';set role authenticated;");
 await db.query("insert into storage.objects(bucket_id,name,owner_id) values('fotos',$1,$2)",[path,creator]);
 const photo=(await one("insert into fotos(orden_id,proyecto_id,categoria,file_path,file_url,file_type,descripcion,uploaded_by) values($1,$2,'ANTES',$3,$4,'imagen','Descripción original',auth.uid()) returning id",[order,work,path,'storage://fotos/'+path])).id;
 const photographed=(await one("select (plan_documento_reservar($1,'visita',1,$2)).id id",[order,id(n++)])).id;
 const conserved=await save(photographed,{fotoIds:[photo]},0,id(n++));
 await db.query("update fotos set descripcion='Descripción editada después' where id=$1",[photo]);
 const snapshot=(await one('select plan_documento_fuentes_version($1) f',[conserved.revision.id])).f;
 assert.equal(snapshot.fotos[0].descripcion,'Descripción original');
 await as(outsider);await assert.rejects(db.query('select plan_documento_fuentes_version($1)',[conserved.revision.id]),e=>e.code==='42501');await as(creator);
 const rollback=(await one("select (plan_documento_reservar($1,'visita',1,$2)).id id",[order,id(n++)])).id;
 await assert.rejects(save(rollback,{fotoIds:[id(999)]},0,id(n++)),e=>e.code==='42501');
 assert.equal((await one('select count(*)::int n from plan_documento_borradores where documento_id=$1',[rollback])).n,0);
 console.log('Seven document types: immutable atomic saves, legacy preservation, explicit corrections, author/reason, safe retries, stale sessions, direct-write denial and tenant isolation passed.');
}finally{await db.close()}

