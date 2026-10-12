import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {createPortalHandler,MAX_BODY_BYTES,imageMatches} from '../supabase/functions/_shared/portalProtocol.mjs';
import {scopeSnapshot} from '../server/backup/archive.mjs';

const db = new PGlite(), id = n => `13000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const creator=id(1),tech=id(2),tenant=id(10),work=id(20),otherWork=id(21),realTenant=id(11),realWork=id(22);
const one=async(sql,args=[])=>(await db.query(sql,args)).rows[0];
const as=async(user,role=user?'authenticated':'service_role')=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user||'']);await db.exec('set role '+role);};
let stage='fixture';
try {
  for (const file of ['captured-domain.sql','storage-foundation.sql']) await db.exec(await readFile('supabase/tests/'+file,'utf8'));
  await db.exec("alter table auth.users add column raw_user_meta_data jsonb default '{}';alter table auth.users add column created_at timestamptz default now();alter table auth.users add column last_sign_in_at timestamptz;alter table storage.buckets add column name text;alter table storage.buckets add column file_size_limit bigint;alter table storage.buckets add column allowed_mime_types text[];alter table storage.objects add column metadata jsonb default '{}';");
  for (const file of (await readdir('supabase/migrations')).filter(f=>f.endsWith('.sql')).sort()) {stage=file;await db.exec(await readFile('supabase/migrations/'+file,'utf8'));}
  await db.query('insert into auth.users(id,email) values($1,$2),($3,$4)',[creator,'creator@qa.invalid',tech,'tech@qa.invalid']);
  await db.query('insert into plataforma_administradores(user_id) values($1)',[creator]);
  await db.query("insert into tenants(id,nombre,slug) values($1,'Empresa de prueba QA','claims-qa'),($2,'Empresa real','real-claims-qa')",[tenant,realTenant]);
  await db.query("insert into proyectos(id,tenant_id,nombre,plano_url,created_by) values($1,$2,'Obra QA','pending://plan-upload-required',$3),($4,$2,'Otra obra QA','pending://plan-upload-required',$3),($5,$6,'Obra real','pending://plan-upload-required',$3)",[work,tenant,creator,otherWork,realWork,realTenant]);
  await db.query("insert into tenant_miembros(tenant_id,user_id,rol) values($1,$2,'tecnico')",[tenant,tech]);
  await db.query("insert into proyecto_miembros(proyecto_id,tenant_id,user_id,rol) values($1,$2,$3,'tecnico')",[work,tenant,tech]);
  // Actual backup predicates are covered by test:backups. Here deliberately
  // flip the dependency to exercise intake failure without creating copies.
  await db.exec("create or replace function public.plan_respaldo_listo(p_tenant uuid) returns boolean language sql stable as $$select coalesce(current_setting('qa.backup_ready',true),'')='yes'$$;select set_config('qa.backup_ready','yes',false);");
  const guard=()=>one("select plan_portal_piloto_guardar($1,'Recepción',true) v",[work]);
  stage='permission boundaries';
  await as(tech);await assert.rejects(guard);await assert.rejects(()=>one('select plan_portal_reservar($1,$2,$3)',[id(99),id(100),{}]));
  await as(null,'anon');await assert.rejects(()=>one('select * from plan_reclamos'));await assert.rejects(()=>one('select plan_portal_publico_contexto($1)',[id(99)]));
  await as(tech);await assert.rejects(()=>one('select plan_reclamo_tecnicos($1)',[work]));
  await as(creator);assert.equal((await one('select plan_reclamo_tecnicos($1) v',[work])).v[0].nombre,'tech@qa.invalid');
  await assert.rejects(()=>one("select plan_portal_piloto_guardar($1,'',true)",[realWork]));
  await db.exec("select set_config('qa.backup_ready','no',false)");await assert.rejects(guard);
  await db.exec("select set_config('qa.backup_ready','yes',false)");
  const config=(await guard()).v,portal=config.id;
  await assert.rejects(()=>one("select plan_portal_piloto_guardar($1,'',true)",[otherWork]));
  const uploads=[], port={
    async rpc(name,args) {
      await as(null); const keys=Object.keys(args), placeholders=keys.map((_,i)=>'$'+(i+1)).join(',');
      return (await one(`select public.${name}(${placeholders}) v`,Object.values(args))).v;
    },
    async upload(path,bytes,mime) {
      uploads.push({path,bytes:bytes.length,mime});await db.exec('reset role');
      try {await db.query("insert into storage.objects(id,bucket_id,name,metadata) values($1,'fotos',$2,$3) on conflict(bucket_id,name) do update set metadata=excluded.metadata",[id(800+uploads.length),path,{size:bytes.length,mimetype:mime}]);}
      catch(error){console.error('storage fixture',error.message,error.code);throw error;}
    },
  };
  const handler=createPortalHandler(port),headers={'Origin':'https://plan-ots-pro.pages.dev','x-plan-portal':portal};
  const data={nombre:'Persona ficticia',telefono:'00000000',correo:'',relacion:'Propietario/a',unidad:'402 · baño',descripcion:'Humedad junto a la ventana · evidencia de prueba',atencion:'No',previo:'No',consentimiento:true,aviso:'piloto-qr-v1'};
  const png=new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,0]);
  const request=(nonce,patch={},photo=true)=>{
    const form=new FormData();form.append('solicitud',JSON.stringify({...data,...patch,solicitud_id:nonce}));
    if(photo)form.append('foto',new Blob([png],{type:'image/png'}),'../../malicious-name.png');
    return new Request('https://example.invalid/portal',{method:'POST',headers,body:form});
  };
  const context=await handler(new Request('https://example.invalid/portal',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:'{"accion":"contexto"}'}));
  const ctx=await context.json();assert.equal(ctx.obra,'Obra QA');assert.equal(ctx.empresa,'Empresa de prueba QA');assert(!JSON.stringify(ctx).includes('telefono'));
  const wrongOrigin=await handler(new Request('https://example.invalid',{method:'POST',headers:{...headers,Origin:'https://other.invalid'},body:'x'}));assert.equal(wrongOrigin.status,403);
  assert.equal((await handler(new Request('https://example.invalid',{method:'POST',headers:{...headers,'Content-Type':'multipart/form-data; boundary=abc','Content-Length':String(MAX_BODY_BYTES+1)},body:'x'}))).status,413);
  assert.equal((await handler(request(id(100),{consentimiento:false}))).status,400);
  assert.equal((await handler(request(id(100),{unidad:''}))).status,400);
  const badForm=new FormData();badForm.append('solicitud',JSON.stringify({...data,solicitud_id:id(100)}));badForm.append('foto',new Blob(['<svg/>'],{type:'image/png'}),'f.png');
  assert.equal((await handler(new Request('https://example.invalid',{method:'POST',headers,body:badForm}))).status,400);
  stage='persistent intake and idempotency';
  const nonce=id(101), response=await handler(request(nonce));assert.equal(response.status,200);const receipt=await response.json();assert.match(receipt.numero,/^REC-\d+$/);assert(receipt.recibido_en);
  const repeated=await handler(request(nonce));assert.deepEqual(await repeated.json(),receipt);assert.equal(uploads.length,1);
  assert(!uploads[0].path.includes('malicious'));assert.equal((await handler(request(nonce,{descripcion:'Changed'}))).status,409);
  await db.exec('reset role');const claim=await one('select * from plan_reclamos where solicitud_id=$1',[nonce]);assert.equal(claim.estado,'Recibido');assert.equal(claim.datos.descripcion,data.descripcion);
  assert.equal((await one('select count(*) n from plan_reclamo_archivos where reclamo_id=$1',[claim.id])).n,1);
  await as(tech);assert.equal((await one('select count(*) n from plan_reclamos')).n,0);await assert.rejects(()=>db.query("update plan_reclamos set datos='{}' where id=$1",[claim.id]));
  stage='OT conversion and private evidence';
  await as(creator);await assert.rejects(()=>one("select plan_reclamo_resolver($1,$2,'crear') v",[claim.id,claim.version]));
  const resolved=(await one("select plan_reclamo_resolver($1,$2,'crear',null,'',$3) v",[claim.id,claim.version,tech])).v;
  const order=await one('select * from ordenes where id=$1',[resolved.orden_id]);assert.equal(order.descripcion,data.descripcion);assert.equal(order.unidad_amenities,data.unidad);assert.equal(order.ubicada_en_plano,false);assert.equal(order.responsable_id,tech);
  assert.equal(order.campos.solicitante,data.nombre);assert.equal(order.campos.contacto_solicitante,data.telefono);
  assert.equal((await one('select count(*) n from fotos where orden_id=$1',[order.id])).n,1);
  assert.equal((await one('select count(*) n from plan_foto_originales where foto_id in (select id from fotos where orden_id=$1)',[order.id])).n,1);
  await assert.rejects(()=>one("select plan_reclamo_resolver($1,$2,'crear')",[claim.id,claim.version]));assert.equal((await one('select count(*) n from ordenes')).n,1);
  const path=uploads[0].path;assert.equal((await one("select plan_archivo_de_proyecto('fotos',$1,$2) v",[path,work])).v,true);
  await as(null,'anon');assert.equal((await one("select count(*) n from storage.objects where name=$1",[path])).n,0);
  // Another request links to the same OT without overwriting its identity/text.
  const linkedNonce=id(102);assert.equal((await handler(request(linkedNonce,{descripcion:'Otra observación'},false))).status,200);
  await db.exec('reset role');const linkClaim=await one('select * from plan_reclamos where solicitud_id=$1',[linkedNonce]);
  await as(creator);const foreign=(await one('select plan_crear_orden($1,0.5,0.5) id',[otherWork])).id;
  await assert.rejects(()=>one("select plan_reclamo_resolver($1,1,'vincular',$2)",[linkClaim.id,foreign]));
  await one("select plan_reclamo_resolver($1,1,'vincular',$2)",[linkClaim.id,order.id]);assert.equal((await one('select descripcion from ordenes where id=$1',[order.id])).descripcion,data.descripcion);
  assert.equal((await one('select count(*) n from comentarios_ot where orden_id=$1',[order.id])).n,1);
  const archiveNonce=id(103);await handler(request(archiveNonce,{},false));await db.exec('reset role');const archived=await one('select * from plan_reclamos where solicitud_id=$1',[archiveNonce]);await as(creator);
  await assert.rejects(()=>one("select plan_reclamo_resolver($1,1,'archivar',null,'')",[archived.id]));
  await one("select plan_reclamo_resolver($1,1,'archivar',null,'Duplicado ficticio')",[archived.id]);assert.equal((await one('select estado from plan_reclamos where id=$1',[archived.id])).estado,'Archivado');
  stage='pause, backup gate, cap and expiry';
  await one("select plan_portal_piloto_guardar($1,'Recepción',false)",[work]);assert.equal((await handler(request(id(104),{},false))).status,409);
  await as(creator);await guard();await db.exec('reset role');await db.exec("select set_config('qa.backup_ready','no',false)");assert.equal((await handler(request(id(104),{},false))).status,409);
  await db.exec('reset role');await db.exec("select set_config('qa.backup_ready','yes',false)");
  for(let n=104;n<=106;n++)assert.equal((await handler(request(id(n),{},false))).status,200);
  assert.equal((await handler(request(id(107),{},false))).status,409);await db.exec('reset role');assert.equal((await one('select count(*) n from plan_reclamos')).n,6);
  await as(creator);const same=(await guard()).v;assert.equal(same.id,portal);assert.equal(same.usados,6);assert.equal(same.vence_en,config.vence_en);
  await db.exec('reset role');await db.query("update plan_portales_piloto set vence_en=now()-interval '1 second' where id=$1",[portal]);assert.equal((await handler(request(id(101)))).status,409);
  stage='backup coverage';await db.exec('reset role');
  const snapshot=(await one('select plan_respaldo_snapshot() v')).v;
  for(const table of ['plan_portales_piloto','plan_reclamos','plan_reclamo_archivos','plan_reclamo_eventos'])assert(snapshot.tablas[table].length>0);
  // Verify ownership of the new module separately. The existing platform
  // copy includes all tables; this does not certify unrelated company exports.
  const moduleTables=['tenants','proyectos','plan_portales_piloto','plan_reclamos','plan_reclamo_archivos','plan_reclamo_eventos'];
  const scoped=scopeSnapshot({...snapshot,tablas:Object.fromEntries(moduleTables.map(t=>[t,snapshot.tablas[t]]))},tenant);assert.equal(scoped.tablas.plan_reclamos.length,6);assert.equal(scoped.tablas.plan_reclamo_archivos.length,1);assert(scoped.storage.some(o=>o.name===path));
  assert.equal(imageMatches(new Uint8Array([1,2,3]),'image/jpeg'),false);
  console.log('Piloto QR: HTTP acotado, datos persistentes, evidencia privada, duplicados, permisos, OT nueva/vinculada, archivo, pausa, cupo, vencimiento y cobertura de respaldo aprobados. Solo datos ficticios locales.');
}catch(error){console.error('Etapa:',stage,'·',error.message,'·',error.code||'',error.position||'');process.exitCode=1;}finally{await db.close();}
