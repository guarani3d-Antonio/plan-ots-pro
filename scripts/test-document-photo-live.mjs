// Ensayo remoto con imagen sintética. No modifica empresas ni políticas reales.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {randomUUID,createHash} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
process.loadEnvFile('.env.local');
const base='tmp/pdfs/live-flow';
const fixture=JSON.parse(await readFile(`${base}/state.json`,'utf8'));
const state=await readFile(`${base}/photo-state.json`,'utf8').then(JSON.parse).catch(e=>{if(e.code!=='ENOENT')throw e;return {requests:{},photoId:randomUUID()};});
const credentials=JSON.parse(await readFile('.backups.local/2026-09-20-dia4/test-credentials.local.json','utf8'));
const clients={},results=[];
const ok=r=>{if(r.error)throw new Error(`${r.error.code}: ${r.error.message}`);return r.data;};
const save=()=>writeFile(`${base}/photo-state.json`,JSON.stringify(state,null,2));
async function request(name){state.requests[name]??=randomUUID();await save();return state.requests[name];}
async function test(name,fn){await fn();results.push({name,ok:true});console.log(`OK ${name}`);}
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
try {
  for(const key of ['e1-supervisor','platform-creator','e1-tecnico-1']){
    const account=credentials.find(c=>c.key===key);assert(account);
    const client=createClient(process.env.VITE_SUPABASE_URL,process.env.VITE_SUPABASE_ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
    ok(await client.auth.signInWithPassword({email:account.email,password:account.password}));clients[key]=client;
  }
  const author=clients['e1-supervisor'], reviewer=clients['platform-creator'];
  const project=ok(await author.from('proyectos').select('id,nombre,tenant_id').eq('id','11000000-0000-4000-8000-000000000001').single());
  assert.match(project.nombre,/prueba/);
  const order=ok(await author.from('ordenes').select('id,proyecto_id,descripcion').eq('id',fixture.orderId).single());
  assert.equal(order.proyecto_id,project.id);assert.match(order.descripcion,/QA DOCUMENTAL SINTÉTICA/);
  const bytes=await readFile('scripts/fixtures/document-photo-qa.png');
  const path=`${project.tenant_id}/${project.id}/${fixture.orderId}/${state.photoId}.png`;
  await save();
  if(!ok(await author.from('fotos').select('id').eq('id',state.photoId)).length){
    const upload=await author.storage.from('fotos').upload(path,bytes,{contentType:'image/png',upsert:false});
    if(upload.error) {
      const existing=Buffer.from(await ok(await author.storage.from('fotos').download(path)).arrayBuffer());
      assert.equal(sha(existing),sha(bytes));
    }
    ok(await author.from('fotos').insert({id:state.photoId,orden_id:fixture.orderId,proyecto_id:project.id,categoria:'DESPUES',file_path:path,file_url:`storage://fotos/${path}`,file_type:'imagen',descripcion:'Imagen sintética QA: no corresponde a un cliente.'}));
  }
  const doc=ok(await author.rpc('plan_documento_reservar',{p_orden:fixture.orderId,p_tipo:'cierre',p_ciclo:1,p_solicitud:await request('reserve')}));
  const draft=ok(await author.rpc('plan_documento_borrador_guardar',{p_documento:doc.id,p_version:0,p_solicitud:await request('draft'),p_datos:{
    observaciones:'Ensayo de fotografía y concurrencia con cuentas ficticias.',incluirFotos:true,fotoIds:[state.photoId],
    cierre:{alcanceReferencia:'Ensayo QA',verificacion:'Control técnico sintético',conclusion:'Sin validez operativa.'},
    itemsCierre:[{id:'QA-1',trabajo:'Prueba de fotografía',criterio:'Imagen visible y archivada',resultado:'Pendiente de revisión QA',verificadorFecha:'Equipo QA · 02/10/2026'}],
  }}));
  const revision=ok(await author.rpc('plan_documento_revision_congelar',{p_documento:doc.id,p_version:draft.version,p_motivo:'Ensayo con foto sintética',p_esquema:1,p_plantilla:'expediente-controlado-2026-09-29',p_solicitud:await request('freeze')}));
  state.revisionId=revision.id;await save();
  const session=ok(await author.auth.getSession()).session;
  const solicitation=await request('render');
  async function render(){
    const response=await fetch(`${process.env.VITE_SUPABASE_URL}/functions/v1/render-documento`,{method:'POST',headers:{Origin:'https://plan-ots-pro.pages.dev','Content-Type':'application/json',apikey:process.env.VITE_SUPABASE_ANON_KEY,Authorization:`Bearer ${session.access_token}`},body:JSON.stringify({revisionId:revision.id,solicitudId:solicitation}),signal:AbortSignal.timeout(90000)});
    const body=await response.json();assert(response.ok,`Render ${response.status}: ${body.error}`);return body;
  }
  await test('generacion inicial concurrente con foto conserva un candidato',async()=>{
    const outcomes=await Promise.all([render(),render()]);
    assert.equal(outcomes[0].candidatoId,outcomes[1].candidatoId);
    assert(outcomes.some(r=>r.estado==='listo'));
    state.candidateId=outcomes[0].candidatoId;await save();
    assert.equal(ok(await author.from('plan_documento_candidatos').select('id').eq('revision_id',revision.id)).length,1);
  });
  const candidate=ok(await author.from('plan_documento_candidatos').select('*').eq('id',state.candidateId).single());
  await test('original y edicion archivados con bytes y hash exactos',async()=>{
    assert.equal(candidate.fuentes_binarias.length,1);
    const photo=candidate.fuentes_binarias[0];assert.equal(photo.id,state.photoId);
    for(const kind of ['original','edicion']){
      const archived=Buffer.from(await ok(await reviewer.storage.from('exports').download(photo[kind].path)).arrayBuffer());
      assert(archived.equals(bytes));assert.equal(photo[kind].sha256,sha(bytes));assert.equal(photo[kind].bytes,bytes.length);
      assert((await clients['e1-tecnico-1'].storage.from('exports').download(photo[kind].path)).error);
    }
    const pdf=Buffer.from(await ok(await reviewer.storage.from('exports').download(candidate.pdf_path)).arrayBuffer());
    assert.equal(sha(pdf),candidate.pdf_sha256);await writeFile(`${base}/cierre-con-foto.pdf`,pdf);
  });
  await test('el original congelado no puede sobrescribirse',async()=>{
    assert((await author.storage.from('fotos').update(path,bytes,{contentType:'image/png'})).error);
  });
  await test('un PDF observado no puede emitirse',async()=>{
    ok(await reviewer.rpc('plan_documento_revisar_pdf',{p_candidato:candidate.id,p_sha256:candidate.pdf_sha256,p_decision:'observado',p_motivo:'Ensayo deliberado de rechazo. Documento ficticio.',p_solicitud:await request('observe')}));
    const denied=await reviewer.rpc('plan_documento_emitir',{p_candidato:candidate.id,p_solicitud:await request('emit')});
    assert.equal(denied.error?.code,'22023');assert.match(denied.error.message,/sin aprobacion exacta/);
  });
}catch(e){results.push({name:'flujo con foto',ok:false,error:e.message});console.error(e.message);process.exitCode=1;}
finally{await writeFile(`${base}/photo-results.json`,JSON.stringify({testedAt:new Date().toISOString(),results},null,2));for(const client of Object.values(clients))await client.auth.signOut({scope:'local'});}
