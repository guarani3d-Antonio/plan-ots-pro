import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { randomUUID, createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
const env=await readFile('.env.local','utf8');
const key=env.match(/^VITE_SUPABASE_ANON_KEY\s*=\s*["']?([^\r\n"']+)/m)?.[1];
const options={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}};
const fresh=()=>createClient('https://iqgbyqyoovzvhhdjawnt.supabase.co',key,options);
const credentials=JSON.parse(await readFile('.backups.local/2026-09-20-dia4/test-credentials.local.json','utf8'));
const clients={},results=[],ids=[],storagePaths=[];
const A='11000000-0000-4000-8000-000000000001',T1='10000000-0000-4000-8000-000000000001',T2='20000000-0000-4000-8000-000000000002';
const ok=r=>{if(r.error)throw new Error(`${r.error.code}: ${r.error.message}`);return r.data;};
const denied=r=>assert.equal(r.error?.code,'42501');
async function test(name,fn){try{await fn();results.push({name,ok:true});console.log(`OK ${name}`);}catch(e){results.push({name,ok:false,error:e.message});console.log(`FAIL ${name}: ${e.message}`);}}
const login=async key=>{const c=credentials.find(c=>c.key===key);assert(c);const client=fresh();ok(await client.auth.signInWithPassword({email:c.email,password:c.password}));return client;};
let before;
try{
 for(const key of ['platform-creator','e1-supervisor','e1-tecnico-1','e1-lector','e2-supervisor'])clients[key]=await login(key);
 const admin=clients['platform-creator'],s=clients['e1-supervisor'],t=clients['e1-tecnico-1'],v=clients['e1-lector'],other=clients['e2-supervisor'];
 // Snapshot only the user's field work, never print its contents.
 const snapshot=async()=>{
  const projects=ok(await admin.from('proyectos').select('id,updated_at').eq('tenant_id','afc0d6f0-5192-4a73-8da1-58573a8a9469').order('id'));
  const orders=projects.length?ok(await admin.from('ordenes').select('*').in('proyecto_id',projects.map(p=>p.id)).order('id')):[];
  const photos=projects.length?ok(await admin.from('fotos').select('*').in('proyecto_id',projects.map(p=>p.id)).order('id')):[];
  return {projects:projects.length,orders:orders.length,photos:photos.length,hash:createHash('sha256').update(JSON.stringify({projects,orders,photos})).digest('hex')};
 };
 before=await snapshot();
 await test('directorio compartido entre sesiones y aislado por empresa',async()=>{
  const row=ok(await t.rpc('plan_agregar_contratista',{p_tenant:T1,p_nombre:'QA Contratista compartido'}));assert.equal(row.tenant_id,T1);
  assert.equal(ok(await s.from('plan_contratistas').select('id').eq('id',row.id)).length,1);
  assert.equal(ok(await other.from('plan_contratistas').select('id').eq('id',row.id)).length,0);
  denied(await v.rpc('plan_agregar_contratista',{p_tenant:T1,p_nombre:'Prohibido'}));denied(await t.rpc('plan_agregar_contratista',{p_tenant:T2,p_nombre:'Prohibido'}));
 });
 const id=ok(await s.rpc('plan_crear_orden',{p_proyecto:A,p_pos_x:.123,p_pos_y:.456}));ids.push(id);
 await test('fecha civil de Paraguay asignada por el servidor',async()=>{
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Asuncion',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  assert.equal(ok(await s.from('ordenes').select('fecha_ingreso').eq('id',id).single()).fecha_ingreso,today);
 });
 await test('original protegido, capas persistentes y conflicto de revisión en fotos',async()=>{
  const photo=randomUUID(),path=`${T1}/${A}/${id}/${randomUUID()}.png`,derivative=`${T1}/${A}/${id}/${randomUUID()}.png`;
  const bytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=','base64');
  for(const p of [path,derivative]){ok(await t.storage.from('fotos').upload(p,bytes,{contentType:'image/png'}));storagePaths.push(p);}
  ok(await t.from('fotos').insert({id:photo,orden_id:id,proyecto_id:A,categoria:'ANTES',file_path:path,file_url:`storage://fotos/${path}`,file_type:'imagen'}));
  const original=ok(await t.from('plan_foto_originales').select('*').eq('foto_id',photo).single());assert.equal(original.file_path,path);
  const annotations=[{id:'qa-layer',tipo:'flecha',color:'#E53E3E',puntos:[{x:100,y:200},{x:700,y:450}],visible:true}];
  const updated=ok(await t.from('fotos').update({file_path:derivative,file_url:`storage://fotos/${derivative}`,anotaciones:annotations,descripcion:'QA capas',edicion:{espacio:'ancho1000',brillo:10,contraste:5}}).eq('id',photo).eq('revision',0).select('revision').single());assert.equal(updated.revision,1);
  const stale=ok(await s.from('fotos').update({descripcion:'sobrescritura obsoleta'}).eq('id',photo).eq('revision',0).select('id'));assert.equal(stale.length,0);
  const reopened=ok(await s.from('fotos').select('anotaciones,descripcion,edicion').eq('id',photo).single());assert.deepEqual(reopened.anotaciones,annotations);assert.equal(reopened.descripcion,'QA capas');assert.equal(reopened.edicion.brillo,10);
  await s.storage.from('fotos').remove([path]); // Supervisor may delete ordinary images; original must still be protected.
  const downloaded=ok(await t.storage.from('fotos').download(path));assert.deepEqual(Buffer.from(await downloaded.arrayBuffer()),bytes);
  assert.equal(ok(await other.from('plan_foto_originales').select('foto_id').eq('foto_id',photo)).length,0);
  ok(await t.from('fotos').update({anotaciones:[],edicion:{espacio:'ancho1000',brillo:0,contraste:0}}).eq('id',photo).eq('revision',1));
  assert.equal(ok(await t.from('fotos').select('anotaciones').eq('id',photo).single()).anotaciones.length,0);
  assert.equal(ok(await t.from('plan_foto_originales').select('file_path').eq('foto_id',photo).single()).file_path,path);
  ok(await s.from('fotos').delete().eq('id',photo));
  const removed=ok(await s.storage.from('fotos').remove([path,derivative]));assert.equal(removed.length,2);
  storagePaths.splice(storagePaths.indexOf(path),1);storagePaths.splice(storagePaths.indexOf(derivative),1);
 });
 await test('autor, creación, edición y estado se conservan en servidor',async()=>{
  ok(await t.from('ordenes').update({descripcion:'QA historial persistente',contratistas:['QA Contratista compartido']}).eq('id',id));
  const row=ok(await t.from('ordenes').select('updated_at').eq('id',id).single());
  ok(await t.rpc('plan_cambiar_estado_orden',{p_orden:id,p_expected_at:row.updated_at,p_estado:'En proceso',p_fecha_fin:null,p_comentario:'QA comienzo de trabajo'}));
  const page=ok(await s.rpc('plan_eventos_pagina',{p_orden:id}));
  assert(page.eventos.some(e=>e.tipo==='ordenes.insert'));assert(page.eventos.some(e=>e.cambios.descripcion?.despues==='QA historial persistente'));
  assert(page.eventos.some(e=>e.actor_email===credentials.find(c=>c.key==='e1-tecnico-1').email));
  assert.equal(ok(await other.rpc('plan_eventos_pagina',{p_orden:id})).eventos.length,0);
  denied(await t.from('plan_ot_eventos').update({actor_email:'falso'}).eq('orden_id',id));
 });
 await test('costos no se filtran al técnico por historial',async()=>{
  ok(await s.from('ordenes').update({costo:7654321}).eq('id',id));
  assert(ok(await s.rpc('plan_eventos_pagina',{p_orden:id})).eventos.some(e=>e.restringido));
  const tech=ok(await t.rpc('plan_eventos_pagina',{p_orden:id}));assert(!tech.eventos.some(e=>e.restringido));assert(!JSON.stringify(tech).includes('7654321'));
 });
 await test('lectura persiste en nueva sesión y no afecta a otros usuarios',async()=>{
  const ev=ok(await t.rpc('plan_eventos_pagina',{p_orden:id})).eventos[0];
  ok(await t.from('plan_eventos_lecturas').upsert({evento_id:ev.id},{onConflict:'evento_id,user_id',ignoreDuplicates:true}));
  ok(await t.from('plan_eventos_lecturas').upsert({evento_id:ev.id},{onConflict:'evento_id,user_id',ignoreDuplicates:true}));
  const another=await login('e1-tecnico-1');assert.equal(ok(await another.rpc('plan_eventos_pagina',{p_orden:id})).eventos.find(e=>e.id===ev.id).leida,true);
  assert.equal(ok(await s.rpc('plan_eventos_pagina',{p_orden:id})).eventos.find(e=>e.id===ev.id).leida,false);
  denied(await other.from('plan_eventos_lecturas').insert({evento_id:ev.id}));await another.auth.signOut({scope:'local'});
 });
 await test('exportación registrada una sola vez por solicitud',async()=>{
  const p={p_orden:id,p_tipo:'ficha',p_formato:'HTML',p_solicitud:randomUUID()};const eid=ok(await v.rpc('plan_solicitar_exportacion',p));assert.equal(ok(await v.rpc('plan_solicitar_exportacion',p)),eid);
  denied(await other.rpc('plan_solicitar_exportacion',{...p,p_solicitud:randomUUID()}));
 });
 await test('anónimo sin acceso a historial ni directorio',async()=>{for(const table of ['plan_ot_eventos','plan_contratistas'])denied(await fresh().from(table).select('id'));});
 await test('eliminar solo la OT ficticia conserva su evidencia',async()=>{ok(await s.from('ordenes').delete().eq('id',id));assert(ok(await s.rpc('plan_eventos_pagina',{p_orden:id})).eventos.some(e=>e.tipo==='ordenes.delete'));ids.splice(ids.indexOf(id),1);});
 await test('proyecto, OT y fotos de campo permanecen intactos',async()=>assert.deepEqual(await snapshot(),before));
}catch(e){results.push({name:'preparación',ok:false,error:e.message});}
finally{
 if(ids.length&&clients['e1-supervisor']){
  const s=clients['e1-supervisor'];await s.from('fotos').delete().in('orden_id',ids);
  if(storagePaths.length){const r=await s.storage.from('fotos').remove(storagePaths);if(r.error||r.data.length!==storagePaths.length)results.push({name:'limpieza de imágenes ficticias',ok:false,error:r.error?.message??'El servidor no confirmó todos los archivos'});}
  const r=await s.from('ordenes').delete().in('id',ids);if(r.error)results.push({name:'limpieza de OTs ficticias',ok:false,error:r.error.message});
 }
 for(const c of Object.values(clients))await c.auth.signOut({scope:'local'});
 const report={testedAt:new Date().toISOString(),fieldSnapshot:before,passed:results.filter(r=>r.ok).length,total:results.length,results};await writeFile('docs/bloqueos-2026-09-22/rest-tests.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({passed:report.passed,total:report.total}));if(results.some(r=>!r.ok))process.exitCode=1;
}
