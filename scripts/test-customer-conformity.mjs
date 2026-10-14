import assert from 'node:assert/strict';
import {readFile,readdir,mkdir,writeFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {rolldown} from 'rolldown';
import {materializarHtmlControlado,PLANTILLA_CONTROLADA_VERSION} from '../supabase/functions/_shared/controlled-report.mjs';
await mkdir('tmp/conformidad-qa',{recursive:true});
const bundle=await rolldown({input:'src/services/customerConformityModel.ts'});await bundle.write({file:'tmp/conformidad-qa/model.mjs',format:'esm'});await bundle.close();
const {validarConformidad}=await import('../tmp/conformidad-qa/model.mjs');
const db=new PGlite();const one=async(sql,args=[])=>(await db.query(sql,args)).rows[0];const id=n=>`20000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
let nonce=100;const creator=id(1),outsider=id(2),tenant=id(10),work=id(20);
const as=async u=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[u??'']);if(u)await db.exec('set role authenticated');};
try{
 for(const file of ['captured-domain.sql','storage-foundation.sql'])await db.exec(await readFile('supabase/tests/'+file,'utf8'));
 await db.exec("alter table auth.users add column raw_user_meta_data jsonb default '{}';alter table auth.users add column created_at timestamptz default now();alter table auth.users add column last_sign_in_at timestamptz;alter table storage.buckets add column name text;alter table storage.buckets add column file_size_limit bigint;alter table storage.buckets add column allowed_mime_types text[];");
 for(const file of (await readdir('supabase/migrations')).filter(f=>f.endsWith('.sql')).sort())await db.exec(await readFile('supabase/migrations/'+file,'utf8'));
 await db.query('insert into auth.users(id,email) values($1,$2),($3,$4)',[creator,'conformidad@qa.test',outsider,'outsider@qa.test']);await db.query('insert into plataforma_administradores(user_id) values($1)',[creator]);
 await db.query("insert into tenants(id,nombre,slug) values($1,'QA conformidad','conformidad-qa')",[tenant]);await db.query("insert into proyectos(id,tenant_id,nombre,plano_url,created_by) values($1,$2,'Obra QA','pending://plan-upload-required',$3)",[work,tenant,creator]);
 const image='data:image/png;base64,'+(await readFile('tmp/signatures-qa/synthetic-stroke.png')).toString('base64');
 const slots=[{id:id(30),categoria:'Técnico / Supervisor'},{id:id(31),categoria:'Cliente'},{id:id(32),categoria:'Cliente'}];
 const save=async(doc,data,v=0,correct=false)=>(await one('select plan_documento_version_guardar($1,$2,$3,$4,$5,$6,1,$7) r',[doc,data,v,id(nonce++),correct,correct?'Corrección QA':null,PLANTILLA_CONTROLADA_VERSION])).r;
 const sign=async(r,slot,request=id(nonce++))=>(await one('select to_jsonb(plan_documento_firmar($1,$2,$3,$4,$5)) f',[r.id,r.contenido_sha256,slot,image,request])).f;
 const read=async r=>(await one('select plan_documento_conformidad_leer($1) c',[r])).c;
 const resolve=async(p,text='Verificado y resuelto.',request=id(nonce++))=>(await one('select to_jsonb(plan_documento_pendiente_resolver($1,$2,$3)) e',[p,text,request])).e;
 for(const decision of ['Conforme','Conforme con observaciones','No conforme']){
  await as(creator);const order=(await one('select plan_crear_orden($1,null,null) id',[work])).id;
  await db.exec('reset role');await db.query("update ordenes set estado='Cerrada' where id=$1",[order]);await as(creator);
  const doc=(await one('select (plan_documento_reservar($1,$2,1,$3)).id id',[order,'acta',id(nonce++)])).id;
  const c={version:1,decision,receptor:'Cliente QA',calidad:'Cliente',espacioReceptor:slots[1].id,motivo:decision==='No conforme'?'El acabado no cumple con lo acordado.':'',confirmada:true,pendientes:decision==='Conforme'?[]:[{id:id(nonce++),descripcion:'Retocar pintura <script>no ejecutar</script>',responsable:'Técnico QA',fecha:'2026-10-15'}]};
  const data={observaciones:'',incluirFotos:false,firmantes:slots,acta:{conformidadJSON:JSON.stringify(c)}};
  assert.equal(validarConformidad(data),null);assert.match(validarConformidad({...data,acta:{conformidadJSON:JSON.stringify({...c,confirmada:false})}}),/Confirm/);
  await assert.rejects(save(doc,{...data,acta:{conformidadJSON:JSON.stringify({...c,confirmada:false})}}),e=>e.code==='22023');
  await assert.rejects(save(doc,{...data,acta:{conformidadJSON:JSON.stringify({...c,espacioReceptor:slots[0].id})}}),e=>e.code==='22023');
  const result=await save(doc,data),r=result.revision;assert.equal((await read(r.id)).conformidad,null);
  await sign(r,slots[0].id);await sign(r,slots[2].id);assert.equal((await read(r.id)).conformidad,null);
  const request=id(nonce++),firma=await sign(r,slots[1].id,request);assert.equal((await sign(r,slots[1].id,request)).id,firma.id);
  const state=await read(r.id);assert.equal(state.conformidad.firma_id,firma.id);assert.equal(state.conformidad.decision,decision);assert.equal(state.conformidad.contenido_sha256,r.contenido_sha256);assert.equal(state.pendientes.length,c.pendientes.length);
  const fuentes=(await one('select plan_documento_fuentes_version($1) f',[r.id])).f;const signatures=(await one('select plan_documento_firmas_leer($1) f',[r.id])).f;
  const html=materializarHtmlControlado(r,fuentes,{},signatures);assert.ok(html.includes(decision));assert.ok(html.indexOf('data-document-signatures')>html.indexOf('Alcance de la conformidad'));
  if(c.pendientes.length){assert.ok(html.includes('&lt;script&gt;no ejecutar&lt;/script&gt;'));const pending=state.pendientes[0].pendiente_id;
   await as(outsider);await assert.rejects(read(r.id),e=>e.code==='42501');await assert.rejects(resolve(pending),e=>e.code==='42501');await as(creator);
   const key=id(nonce++),e=await resolve(pending,'Verificado y resuelto.',key);assert.equal((await resolve(pending,'Verificado y resuelto.',key)).id,e.id);
   await assert.rejects(resolve(pending,'Texto cambiado',key),e=>e.code==='22023');await assert.rejects(resolve(pending),e=>e.code==='40001');
   assert.equal((await read(r.id)).pendientes[0].constancia,'Verificado y resuelto.');assert.equal(materializarHtmlControlado(r,fuentes,{},signatures),html);
   await db.exec('reset role');await assert.rejects(db.query('update plan_documento_pendientes set descripcion=$1 where id=$2',['Sobrescribir',pending]),e=>e.code==='42501');await as(creator);
  }
  await assert.rejects(db.query('select * from plan_documento_conformidades'),e=>e.code==='42501');
  const correction=await save(doc,data,1,true);assert.equal((await read(correction.revision.id)).conformidad,null);assert.equal((await read(correction.revision.id)).pendientes.length,0);assert.equal((await read(r.id)).conformidad.id,state.conformidad.id);
  await writeFile('tmp/conformidad-qa/'+decision.replaceAll(' ','-')+'.html',html);
 }
 // Legacy signatures never infer a customer's decision, and open OTs cannot register conformity.
 await as(creator);const order=(await one('select plan_crear_orden($1,null,null) id',[work])).id;const doc=(await one('select (plan_documento_reservar($1,$2,1,$3)).id id',[order,'acta',id(nonce++)])).id;
 const legacy=await save(doc,{observaciones:'',incluirFotos:false,firmantes:slots,acta:{}});await sign(legacy.revision,slots[1].id);assert.equal((await read(legacy.revision.id)).conformidad,null);
 const c={version:1,decision:'Conforme',receptor:'QA',calidad:'Cliente',espacioReceptor:slots[1].id,motivo:'',confirmada:true,pendientes:[]};
 const open=await save(doc,{observaciones:'',incluirFotos:false,firmantes:slots,acta:{conformidadJSON:JSON.stringify(c)}},1,true);await assert.rejects(sign(open.revision,slots[1].id),e=>e.code==='22023');
 await db.exec('reset role');const snapshot=(await one('select plan_respaldo_snapshot() s')).s;assert.equal(snapshot.tablas.plan_documento_conformidades.length,3);assert.equal(snapshot.tablas.plan_documento_pendientes.length,2);assert.equal(snapshot.tablas.plan_documento_pendiente_eventos.length,2);
 console.log('Conformidad: tres decisiones, firma designada exacta, captura atómica, pendientes con constancia, reintentos, aislamiento, versión anterior inmutable y respaldo: correctos.');
}finally{await db.close();}
