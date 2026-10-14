import assert from 'node:assert/strict';
import {readFile,readdir,mkdir,writeFile} from 'node:fs/promises';
import {deflateSync} from 'node:zlib';
import {PGlite} from '@electric-sql/pglite';
import {rolldown} from 'rolldown';
const id=n=>`10000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
await mkdir('tmp/signatures-qa',{recursive:true});
const bundle=await rolldown({input:'src/services/documentSignatureModel.ts'});await bundle.write({file:'tmp/signatures-qa/model.mjs',format:'esm'});await bundle.close();
const {espaciosFirma,incorporarFirmas}=await import('../tmp/signatures-qa/model.mjs');
const {materializarHtmlControlado,PLANTILLA_CONTROLADA_VERSION}=await import('../supabase/functions/_shared/controlled-report.mjs');
function crc(b){let c=0xffffffff;for(const v of b){c^=v;for(let i=0;i<8;i++)c=c&1?0xedb88320^(c>>>1):c>>>1;}return (c^0xffffffff)>>>0;}
const chunk=(type,data)=>{const b=Buffer.concat([Buffer.from(type),data]),len=Buffer.alloc(4),sum=Buffer.alloc(4);len.writeUInt32BE(data.length);sum.writeUInt32BE(crc(b));return Buffer.concat([len,b,sum]);};
const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(96);ihdr.writeUInt32BE(32,4);ihdr[8]=8;ihdr[9]=6;
const raster=Buffer.alloc(32*(96*4+1));for(let y=0;y<32;y++)for(let x=0;x<96;x++){const i=y*(96*4+1)+1+x*4;raster[i+3]=Math.abs(y-(6+x%20))<2?255:0;}
const png=Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),chunk('IHDR',ihdr),chunk('IDAT',deflateSync(raster)),chunk('IEND',Buffer.alloc(0))]);
const image='data:image/png;base64,'+png.toString('base64');await writeFile('tmp/signatures-qa/synthetic-stroke.png',png);
const slots=[{id:id(300),categoria:'Técnico / Supervisor'},{id:id(301),categoria:'Cliente'},{id:id(302),categoria:'Cliente'},{id:id(303),categoria:'Contratista'}];
assert.equal(espaciosFirma(slots).length,4);assert.throws(()=>espaciosFirma([...slots,{id:id(304),categoria:'Contacto'}]),/cuatro/);assert.throws(()=>espaciosFirma([slots[0],slots[0]]),/inválida/);
const db=new PGlite();const one=async(sql,args=[])=>(await db.query(sql,args)).rows[0];
const as=async u=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[u??'']);if(u)await db.exec('set role authenticated');};
const creator=id(1),outsider=id(2),tenant=id(10),work=id(20);let n=500;
try{
 for(const file of ['captured-domain.sql','storage-foundation.sql'])await db.exec(await readFile('supabase/tests/'+file,'utf8'));
 await db.exec("alter table auth.users add column raw_user_meta_data jsonb default '{}';alter table auth.users add column created_at timestamptz default now();alter table auth.users add column last_sign_in_at timestamptz;alter table storage.buckets add column name text;alter table storage.buckets add column file_size_limit bigint;alter table storage.buckets add column allowed_mime_types text[];");
 for(const file of (await readdir('supabase/migrations')).filter(f=>f.endsWith('.sql')).sort())await db.exec(await readFile('supabase/migrations/'+file,'utf8'));
 await db.query('insert into auth.users(id,email) values($1,$2),($3,$4)',[creator,'creator@qa.test',outsider,'outsider@qa.test']);await db.query('insert into plataforma_administradores(user_id) values($1)',[creator]);
 await db.query("insert into tenants(id,nombre,slug) values($1,'QA firmas','signatures-qa')",[tenant]);await db.query("insert into proyectos(id,tenant_id,nombre,plano_url,created_by) values($1,$2,'Obra QA','pending://plan-upload-required',$3)",[work,tenant,creator]);
 await as(creator);const order=(await one('select plan_crear_orden($1,null,null) id',[work])).id;
 const save=async(doc,data,version,correction=false)=>(await one('select plan_documento_version_guardar($1,$2,$3,$4,$5,$6,1,$7) r',[doc,data,version,id(n++),correction,correction?'Nueva información de prueba':null,PLANTILLA_CONTROLADA_VERSION])).r;
 const sign=async(r,slot,request=id(n++),img=image,hash=r.contenido_sha256)=>(await one('select to_jsonb(plan_documento_firmar($1,$2,$3,$4,$5)) f',[r.id,hash,slot,img,request])).f;
 for(const type of ['orden_servicio','visita','relevamiento','avance','cierre','acta','encuesta']){
  const doc=(await one('select (plan_documento_reservar($1,$2,1,$3)).id id',[order,type,id(n++)])).id;
  const data={observaciones:'Información final QA',incluirFotos:false,firmantes:slots,[type==='orden_servicio'?'origen':type]:{}};
  await assert.rejects(save(doc,{...data,firmantes:[...slots,{id:id(304),categoria:'Contacto'}]},0),e=>e.code==='22023');
  const first=await save(doc,data,0),r=first.revision;const request=id(n++);const f=await sign(r,slots[0].id,request);
  assert.equal(f.revision_id,r.id);assert.equal(f.contenido_sha256,r.contenido_sha256);assert.equal(f.registrada_por,creator);assert.equal(f.tenant_id,tenant);assert.match(f.imagen_sha256,/^[0-9a-f]{64}$/);
  assert.equal((await sign(r,slots[0].id,request)).id,f.id);await assert.rejects(sign(r,slots[1].id,request),e=>e.code==='22023');
  await assert.rejects(sign(r,slots[0].id),e=>e.code==='22023');await assert.rejects(sign(r,slots[1].id,id(n++),image,'f'.repeat(64)),e=>e.code==='22023');await assert.rejects(sign(r,id(900)),e=>e.code==='22023');await assert.rejects(sign(r,slots[1].id,id(n++),'data:image/svg+xml,<svg/>'),e=>e.code==='22023');
  for(const s of slots.slice(1))await sign(r,s.id);
  const rows=(await one('select plan_documento_firmas_leer($1) f',[r.id])).f;assert.equal(rows.length,4);
  const stored=(await one('select plan_documento_fuentes_version($1) f',[r.id])).f;
  const html=materializarHtmlControlado(r,stored,{},rows);assert.equal((html.match(/data-signature-slot=/g)||[]).length,4);assert.equal((html.match(/alt="Firma manuscrita:/g)||[]).length,4);
  assert.ok(html.indexOf('data-document-signatures="true"')>html.indexOf('Información final QA')||type==='acta'||type==='encuesta'||type==='visita');
  assert.doesNotMatch(html,/<(?:section|div)[^>]*page-break[^>]*>\s*<div class="report-signatures"/);
  await writeFile(`tmp/signatures-qa/${type}.html`,html);
  assert.throws(()=>materializarHtmlControlado(r,stored,{},[{...f,revision_id:id(999)}]),/no corresponde/);
  const corrected=await save(doc,{...data,observaciones:'Versión corregida sin firmas heredadas'},1,true);assert.equal((await one('select plan_documento_firmas_leer($1) f',[corrected.revision.id])).f.length,0);
  assert.equal((await one('select plan_documento_firmas_leer($1) f',[r.id])).f.length,4);await assert.rejects(sign(r,slots[0].id),e=>e.code==='40001');
  await db.query('select plan_documento_preparar($1,$2)',[corrected.revision.id,id(n++)]);await assert.rejects(sign(corrected.revision,slots[0].id),e=>e.code==='22023');
  await as(outsider);await assert.rejects(db.query('select plan_documento_firmas_leer($1)',[r.id]),e=>e.code==='42501');await assert.rejects(sign(r,slots[1].id),e=>e.code==='42501');await as(creator);
  await assert.rejects(db.query('update plan_documento_firmas set categoria=$1 where id=$2',['Contacto',f.id]),e=>e.code==='42501');await assert.rejects(db.query('delete from plan_documento_firmas where id=$1',[f.id]),e=>e.code==='42501');
 }
 await db.exec('reset role');const snapshot=(await one('select plan_respaldo_snapshot() s')).s;assert.equal(snapshot.tablas.plan_documento_firmas.length,28);assert.equal(snapshot.tablas.plan_documento_firmas[0].imagen_png,image);
 assert.ok(incorporarFirmas('<div class="a4-page">FINAL</div>\n<footer></footer>',slots).indexOf('data-document-signatures')>3);
 console.log('7 documentos: firmas inmutables por versión, 4 espacios, roles repetidos, hash, reintento idempotente, aislamiento, PDF bloqueado y respaldo con PNG: correctos.');
}finally{await db.close();}
