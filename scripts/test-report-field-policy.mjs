import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

const db=new PGlite(),id=n=>`12000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const creator=id(1),tech=id(2),other=id(3),tenant=id(10),work=id(20),otherWork=id(21);
let stage='fixture',seq=100;
const one=async(sql,args=[])=>(await db.query(sql,args)).rows[0];
const as=async u=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[u??'']);if(u)await db.exec('set role authenticated')};
const ctx=async(order,type,links={},doc=null)=>(await one('select plan_documento_contexto_campos($1,$2,$3,$4) c',[order,type,links,doc])).c;
const reserve=async(order,type)=>(await one('select (plan_documento_reservar($1,$2,1,$3)).id id',[order,type,id(seq++)])).id;
const save=async(doc,data,version=0,correction=false)=>(await one("select plan_documento_version_guardar($1,$2,$3,$4,$5,$6,1,'expediente-controlado-2026-10-08-datos') r",[doc,data,version,id(seq++),correction,correction?'Corrección de prueba':null])).r;
const reject=async fn=>assert.rejects(fn,e=>['22023','42501'].includes(e.code));
try{
 for(const file of ['captured-domain.sql','storage-foundation.sql'])await db.exec(await readFile('supabase/tests/'+file,'utf8'));
 await db.exec("alter table auth.users add column raw_user_meta_data jsonb default '{}';alter table auth.users add column created_at timestamptz default now();alter table auth.users add column last_sign_in_at timestamptz;alter table storage.buckets add column name text;alter table storage.buckets add column file_size_limit bigint;alter table storage.buckets add column allowed_mime_types text[];");
 for(const file of (await readdir('supabase/migrations')).filter(f=>f.endsWith('.sql')).sort()){stage=file;await db.exec(await readFile('supabase/migrations/'+file,'utf8'));}
 await db.query('insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3),($4,$5,$6),($7,$8,$9)',[creator,'owner@qa.test',{nombre:'Dueño'},tech,'tech@qa.test',{nombre:'José',apellidos:'Técnico'},other,'other@qa.test',{nombre:'Otro'}]);
 await db.query('insert into plataforma_administradores(user_id) values($1)',[creator]);
 await db.query("insert into tenants(id,nombre,slug) values($1,'QA','report-policy')",[tenant]);
 await db.query("insert into tenant_miembros(tenant_id,user_id,rol) values($1,$2,'tecnico')",[tenant,tech]);
 await db.query("insert into proyectos(id,tenant_id,nombre,plano_url,created_by) values($1,$2,'Obra oficial','pending://plan-upload-required',$3),($4,$2,'Obra distinta','pending://plan-upload-required',$3)",[work,tenant,creator,otherWork]);
 await as(creator);await db.query("select plan_admin_obra_miembro($1,'tech@qa.test','tecnico')",[work]);
 const order=(await one('select plan_crear_orden($1,0.5,0.5) id',[work])).id;
 await db.query("update ordenes set responsable_id=$1,descripcion='Solicitud original exacta',fecha_inicio_trabajos='2026-10-10',fecha_fin_trabajos='2026-10-12' where id=$2",[tech,order]);
 const otherOrder=(await one('select plan_crear_orden($1,0.5,0.5) id',[otherWork])).id;
 await as(null);stage='seed client';
 const client=(await one("insert into plan_clientes(tenant_id,nombre,identificacion,contacto,telefono,correo,direccion,creado_por) values($1,'Cliente oficial','123','Contacto oficial','0981','c@qa.test','Domicilio oficial',$2) returning id",[tenant,creator])).id;
 const location=(await one("insert into plan_cliente_ubicaciones(tenant_id,cliente_id,proyecto_id,tipo_inmueble,nombre_obra,direccion,piso,unidad) values($1,$2,$3,'residencial_altura','Ubicación','Dirección oficial','4','313') returning id",[tenant,client,work])).id;
 await as(creator);
 await db.query('update ordenes set cliente_id=$1,cliente_ubicacion_id=$2 where id=$3',[client,location,order]);
 const types=['orden_servicio','visita','relevamiento','avance','cierre','acta','encuesta'];
 const docs={};
 stage='identity across all seven';
 for(const type of types){
  const doc=docs[type]=await reserve(order,type),c=await ctx(order,type);
  assert.equal(c.identificacion.responsable,'José Técnico');assert.equal(c.identificacion.cliente,'Cliente oficial');assert.equal(c.identificacion.unidad_amenities,'313');
  for(const k of ['obra','unidad_amenities','responsable','rubro','fecha_ingreso','cliente','identificacion','contacto','telefono','correo','domicilio','direccion_obra','piso','descripcion'])await reject(()=>save(doc,{identificacion:{[k]:'Manipulado'}}));
  await reject(()=>save(doc,{vinculos:{receptor:'cliente:'+id(999)}}));
 }
 const os=await save(docs.orden_servicio,{origen:{solicitante:'Solicitante original',contacto:'Contacto recibido',canal:'Teléfono'},observaciones:'Aclaración adicional'});
 const vis=await save(docs.visita,{visita:{recorrido:'Dormitorio junto a la ventana',observacionesTecnicas:'Texto libre ñ'},identificacion:{ubicacion:'Descripción referencial editable'}});
 assert.equal(vis.revision.datos.visita.responsableVisita,'José Técnico');assert.equal(vis.revision.datos.visita.propietario,'Solicitante original');assert.equal(vis.revision.datos.identificacion.ubicacion,'Descripción referencial editable');
 stage='references and protected technical actors';
 const foreign=await reserve(otherOrder,'visita');const foreignSave=await save(foreign,{visita:{observacionesTecnicas:'Otra OT'}});
 await reject(()=>ctx(order,'relevamiento',{visita:foreignSave.revision.id}));
 await reject(()=>save(docs.relevamiento,{relevamiento:{antecedentes:'Pedido reescrito'}}));
 await reject(()=>save(docs.visita,{visita:{responsableVisita:'Dueño'}},1,true));
 await as(tech);await reject(()=>ctx(order,'visita',{tecnico:creator}));
 await reject(()=>save(docs.relevamiento,{relevamiento:{decisionAlcance:'Aprobado con referencia',cronograma:'Aprobación inventada'}}));
 await reject(()=>save(docs.relevamiento,{relevamiento:{decisionGarantia:'Aplica con fundamento'}}));
 await as(creator);
 const rel=await save(docs.relevamiento,{relevamiento:{decisionAlcance:'Aprobado con referencia',cronograma:'Decisión del jefe registrada',hallazgos:'Hallazgo propio'},itemsAlcance:[{id:'A-01',trabajo:'Reparar el muro',criterio:'Superficie sin fisuras'}]});
 assert.equal(rel.revision.datos.decisionPlan.actor,creator);
 await as(tech);
 await reject(()=>save(docs.relevamiento,{...rel.revision.datos,relevamiento:{...rel.revision.datos.relevamiento,alcance:'Ampliación sin autorización'}},1,true));
 const diagnosed=await save(docs.relevamiento,{...rel.revision.datos,relevamiento:{...rel.revision.datos.relevamiento,hallazgos:'Aclaración técnica sin cambiar el plan'}},1,true);
 assert.equal(diagnosed.revision.datos.decisionPlan.actor,creator,'Una aclaración no inventa otra aprobación');
 await as(creator);
 for(const type of ['avance','cierre']){
  const c=await ctx(order,type);assert.equal(c.vinculos.relevamiento,diagnosed.revision.id);
  const key=type==='avance'?'itemsAvance':'itemsCierre';
  await reject(()=>save(docs[type],{[key]:[{id:'A-02',trabajo:'Actividad no aprobada'}]}));
  await reject(()=>save(docs[type],{[key]:[{id:'A-01',previsto:'Cambio',trabajo:'Cambio',criterio:'Cambio'}]}));
 }
 await reject(()=>save(docs.cierre,{cierre:{inicioReal:'2026-09-01'}}));
 const advanced=await save(docs.avance,{itemsAvance:[{id:'A-01',realizado:'Preparación de superficie',saldo:'Terminación'}],avance:{desvios:'Lluvia'}});
 assert.equal(advanced.revision.datos.itemsAvance[0].previsto,'Reparar el muro');
 const closed=await save(docs.cierre,{cierre:{ejecucionPorItem:'Muro reparado',entregables:'Registro fotográfico',conclusion:'Resultado comprobado'},itemsCierre:[{id:'A-01',resultado:'Cumple',verificadorFecha:'Técnico, 12/10'}]});
 assert.equal(closed.revision.datos.itemsCierre[0].criterio,'Superficie sin fisuras');
 const act=await ctx(order,'acta');assert.equal(act.protegidos.objetoEntrega,'Muro reparado');assert.equal(act.protegidos.receptor,'Cliente oficial');
 await reject(()=>save(docs.acta,{acta:{objetoEntrega:'Otra entrega'}}));
 await reject(()=>save(docs.acta,{acta:{decisionPreparada:'Conforme'}}));
 await save(docs.acta,{acta:{decisionPreparada:'Conforme',decisionReferencia:'Mensaje del receptor, 12/10, conservado',reservas:'Sin reservas declaradas'}});
 await reject(()=>save(docs.encuesta,{encuesta:{calidadTrabajo:'10'}}));
 const surveyed=await save(docs.encuesta,{encuesta:{calidadTrabajo:'8',referenciaFuente:'Respuesta presencial registrada',sugerencias:'Texto del cliente'}});
 assert.equal(surveyed.revision.datos.encuesta.respondente,'Cliente oficial');
 stage='source changes and immutable history';
 await as(null);
 await db.query("update proyectos set nombre='Nombre nuevo' where id=$1",[work]);
 await db.query("update plan_clientes set nombre='Cliente actualizado' where id=$1",[client]);
 await as(creator);
 const corrected=await save(docs.visita,{visita:{observacionesTecnicas:'Corrección, con tilde.'}},1,true);
 assert.equal(corrected.revision.datos.identificacion.obra,'Nombre nuevo');assert.equal(corrected.revision.datos.identificacion.cliente,'Cliente actualizado');
 const old=(await one('select datos from plan_documento_revisiones where id=$1',[vis.revision.id])).datos;
 assert.equal(old.identificacion.obra,'Obra oficial');assert.equal(old.identificacion.cliente,'Cliente oficial');assert.equal(old.visita.observacionesTecnicas,'Texto libre ñ');
 await as(other);await reject(()=>ctx(order,'visita'));await reject(()=>save(docs.visita,{},2,true));
 console.log('PASS: 7 documents; 14 inherited fields cannot be forged; linked people and revisions; controlled approvals; immutable scope and dates; client provenance; editable narrative; preserved historical identity; permission isolation.');
}catch(e){console.error('FAIL',stage,e.code??'',e.message);process.exitCode=1;}finally{await db.close();}
