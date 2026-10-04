// A new synthetic document with saved identification; no BBC orders are edited.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {randomUUID,createHash} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
process.loadEnvFile('.env.local');
const dir='tmp/pdfs/pilot-2026-10-04'; await mkdir(dir,{recursive:true});
const file=`${dir}/state.json`;
const state=await readFile(file,'utf8').then(JSON.parse).catch(e=>{if(e.code!=='ENOENT')throw e;return {requests:{}};});
const save=()=>writeFile(file,JSON.stringify(state,null,2));
const request=async k=>{state.requests[k]??=randomUUID();await save();return state.requests[k];};
const creds=JSON.parse(await readFile('.backups.local/2026-09-20-dia4/test-credentials.local.json','utf8'));
const ok=r=>{if(r.error)throw Error(r.error.message);return r.data;};
const clients={}; const results=[];
try {
  for(const key of ['e1-supervisor','platform-creator','e1-admin','e1-tecnico-1','e2-admin']) {
    const account=creds.find(c=>c.key===key);assert(account);
    const c=createClient(process.env.VITE_SUPABASE_URL,process.env.VITE_SUPABASE_ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
    ok(await c.auth.signInWithPassword({email:account.email,password:account.password}));clients[key]=c;
  }
  const author=clients['e1-supervisor'], creator=clients['platform-creator'];
  const project=ok(await author.from('proyectos').select('id,nombre,tenant_id').eq('id','11000000-0000-4000-8000-000000000001').single());
  const tenant=ok(await creator.from('tenants').select('nombre').eq('id',project.tenant_id).single());assert.equal(tenant.nombre,'Empresa de prueba 1');
  state.tenantId=project.tenant_id;await save();
  if(!state.orderId) {
    const order=ok(await author.rpc('plan_crear_orden',{p_proyecto:project.id,p_pos_x:0.5,p_pos_y:0.5}));
    state.orderId=typeof order==='string'?order:order.id;await save();
    ok(await author.from('ordenes').update({descripcion:'QA CIERRE 04-10 — datos ficticios, sin validez operativa',rubro:'Albañilería'}).eq('id',state.orderId));
  }
  const doc=ok(await author.rpc('plan_documento_reservar',{p_orden:state.orderId,p_tipo:'visita',p_ciclo:1,p_solicitud:await request('reserve')}));
  state.documentId=doc.id;state.code=doc.codigo;await save();
  if(!state.revisionId) {
    const draft=ok(await author.rpc('plan_documento_borrador_guardar',{p_documento:doc.id,p_version:0,p_solicitud:await request('draft'),
      p_datos:{incluirFotos:false,fotoIds:[],observaciones:'Ensayo de emisión del piloto',identificacion:{obra:'OBRA EDITADA QA 04 OCT',cliente:'CLIENTE EDITADO QA 04 OCT',telefono:'0999 QA EXACTO',unidad:'',responsable:''},visita:{objetivo:'Verificar precarga y edición literal de los datos.'}}}));
    const rev=ok(await author.rpc('plan_documento_revision_congelar',{p_documento:doc.id,p_version:draft.version,p_motivo:'QA versión actual',p_esquema:1,p_plantilla:'expediente-controlado-2026-10-04',p_solicitud:await request('freeze')}));
    state.revisionId=rev.id;await save();
  }
  const session=ok(await author.auth.getSession()).session;
  const requestId=await request('render');
  async function render() {
    const r=await fetch(`${process.env.VITE_SUPABASE_URL}/functions/v1/render-documento`,{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://plan-ots-pro.pages.dev',Authorization:`Bearer ${session.access_token}`,apikey:process.env.VITE_SUPABASE_ANON_KEY},body:JSON.stringify({revisionId:state.revisionId,solicitudId:requestId}),signal:AbortSignal.timeout(90000)});
    const body=await r.json();assert(r.ok,`Render ${r.status}: ${body.error??body.message}`);return body;
  }
  const renders=await Promise.all([render(),render()]);
  assert.equal(renders[0].candidatoId,renders[1].candidatoId);state.candidateId=renders[0].candidatoId;await save();
  // Both first calls race for one server lock. At least one finishes the PDF.
  const candidate=ok(await author.from('plan_documento_candidatos').select('*').eq('id',state.candidateId).single());assert.equal(candidate.estado,'listo');
  const bytes=Buffer.from(await ok(await author.storage.from('exports').download(candidate.pdf_path)).arrayBuffer());
  assert.equal(bytes.length,candidate.pdf_bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),candidate.pdf_sha256);
  await writeFile(`${dir}/visita.pdf`,bytes);
  results.push({case:'render concurrente con versión nueva y descarga exacta',ok:true,statuses:renders.map(r=>r.estado)});
  for(const key of ['e1-supervisor','e1-admin','e1-tecnico-1','e2-admin']) {
    const denied=await clients[key].rpc('plan_documento_revisar_pdf',{p_candidato:candidate.id,p_sha256:candidate.pdf_sha256,p_decision:'aprobado',p_motivo:null,p_solicitud:randomUUID()});
    assert.equal(denied.error?.code,'42501',`Debe denegar revisión a ${key}`);
    const emit=await clients[key].rpc('plan_documento_emitir',{p_candidato:candidate.id,p_solicitud:randomUUID()});assert.equal(emit.error?.code,'42501',`Debe denegar emisión a ${key}`);
  }
  results.push({case:'solo Creador puede revisar y emitir; denegado a cuatro roles',ok:true});
  state.policies??=ok(await creator.rpc('plan_politicas_listar',{p_tenant:state.tenantId})).filter(p=>['identidad','revision','conservacion'].includes(p.modulo));await save();
  if(process.argv.includes('--verify-issue')) {
    for(const p of state.policies) {
      assert.equal(p.estado,'pendiente');
      ok(await creator.rpc('plan_politica_decidir',{p_tenant:state.tenantId,p_modulo:p.modulo,p_estado:'aprobada',p_autoridad:'QA SIMULADA 04-10',p_respaldo:'Ensayo autorizado exclusivamente en Empresa de prueba 1',p_detalle:'Sin validez para clientes; restaurar al finalizar.',p_vigente_desde:'2026-10-04',p_solicitud:await request(`policy-${p.modulo}`)}));
    }
    const review=await creator.rpc('plan_documento_revisar_pdf',{p_candidato:candidate.id,p_sha256:candidate.pdf_sha256,p_decision:'aprobado',p_motivo:null,p_solicitud:await request('approve')});ok(review);
    const emissions=await Promise.all([creator.rpc('plan_documento_emitir',{p_candidato:candidate.id,p_solicitud:await request('issue-1')}),creator.rpc('plan_documento_emitir',{p_candidato:candidate.id,p_solicitud:await request('issue-2')})]);
    const first=ok(emissions[0]), second=ok(emissions[1]);assert.equal(first.id,second.id);state.emissionId=first.id;await save();
    const preserved=Buffer.from(await ok(await creator.storage.from('exports').download(first.pdf_path)).arrayBuffer());assert(bytes.equals(preserved));
    results.push({case:'Creador aprueba y dos emisiones simultaneas conservan un solo PDF exacto',ok:true});
  }
  console.log(JSON.stringify({code:state.code,orderId:state.orderId,results},null,2));
} finally {
  if(state.tenantId && state.policies && clients['platform-creator']) {
    const creator=clients['platform-creator'];
    try {
      const current=ok(await creator.rpc('plan_politicas_listar',{p_tenant:state.tenantId}));
      for(const p of state.policies) {
        const now=current.find(x=>x.modulo===p.modulo);
        if(now?.autoridad==='QA SIMULADA 04-10') {
          ok(await creator.rpc('plan_politica_decidir',{p_tenant:state.tenantId,p_modulo:p.modulo,p_estado:p.estado,p_autoridad:p.autoridad,p_respaldo:p.respaldo,p_detalle:p.detalle,p_vigente_desde:p.vigente_desde,p_solicitud:randomUUID()}));
        } else assert.equal(now?.estado,p.estado,'La politica cambio externamente; no sobrescribir');
      }
      const restored=ok(await creator.rpc('plan_politicas_listar',{p_tenant:state.tenantId}));
      for(const p of state.policies)assert.equal(restored.find(x=>x.modulo===p.modulo)?.estado,p.estado);
      results.push({case:'politicas ficticias restauradas al terminar',ok:true});
    } catch(error) {console.error('Requiere restauracion de politicas QA:',error.message);process.exitCode=1;}
  }
  await writeFile(`${dir}/results.json`,JSON.stringify({testedAt:new Date().toISOString(),results},null,2));
  for(const c of Object.values(clients))await c.auth.signOut({scope:'local'});
}
