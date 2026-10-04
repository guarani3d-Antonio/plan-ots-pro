// Ensayo de emisión exclusivamente en el fixture conocido de Empresa de prueba 1.
// Restaura las políticas del fixture; no decide políticas de BBC ni usa service_role.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { randomUUID, createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
process.loadEnvFile('.env.local');
const directory = 'tmp/pdfs/live-flow';
const fixture = JSON.parse(await readFile(`${directory}/state.json`, 'utf8'));
const credentials = JSON.parse(await readFile('.backups.local/2026-09-20-dia4/test-credentials.local.json', 'utf8'));
const clients = {}, results = [];
const ok = r => { if (r.error) throw new Error(`${r.error.code}: ${r.error.message}`); return r.data; };
const journalFile = `${directory}/issue-journal.json`;
const journal = await readFile(journalFile, 'utf8').then(JSON.parse).catch(e => { if (e.code !== 'ENOENT') throw e; return { run: randomUUID(), policies: [] }; });
const save = () => writeFile(journalFile, JSON.stringify(journal, null, 2));
const label = `QA SIMULADA ${journal.run}`;
let tenantId;
async function test(name, action) { await action(); results.push({ name, ok: true }); console.log(`OK ${name}`); }
async function listPolicies() { return ok(await clients['platform-creator'].rpc('plan_politicas_listar', {p_tenant:tenantId})); }
async function decide(policy, approved) {
  return ok(await clients['platform-creator'].rpc('plan_politica_decidir', {
    p_tenant: tenantId, p_modulo: policy.modulo, p_estado: approved ? 'aprobada' : policy.estado,
    p_autoridad: approved ? label : policy.autoridad,
    p_respaldo: approved ? 'Ensayo autorizado en empresa ficticia. Sin validez para clientes.' : policy.respaldo,
    p_detalle: approved ? label : policy.detalle,
    p_vigente_desde: approved ? '2026-10-02' : policy.vigente_desde,
    p_solicitud: randomUUID(),
  }));
}
try {
  for (const key of ['platform-creator','e1-admin','e1-supervisor','e1-tecnico-1','e2-admin']) {
    const account = credentials.find(c=>c.key===key);
    assert(account);
    const client=createClient(process.env.VITE_SUPABASE_URL,process.env.VITE_SUPABASE_ANON_KEY,
      {auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
    ok(await client.auth.signInWithPassword({email:account.email,password:account.password})); clients[key]=client;
  }
  const author=clients['e1-supervisor'], reviewer=clients['platform-creator'];
  const doc=ok(await author.from('plan_documentos').select('*').eq('id',fixture.documentId).single());
  assert.equal(doc.proyecto_id,'11000000-0000-4000-8000-000000000001');
  assert.equal(doc.orden_id,fixture.orderId);
  tenantId=doc.tenant_id;
  const tenant=ok(await clients['platform-creator'].from('tenants').select('nombre').eq('id',tenantId).single());
  assert.equal(tenant.nombre,'Empresa de prueba 1');
  const source=ok(await author.from('plan_documento_revisiones').select('datos').eq('id',fixture.revisionId).single());
  assert.match(source.datos.observaciones,/cuentas ficticias/);
  const candidate=ok(await author.from('plan_documento_candidatos').select('*').eq('id',fixture.candidateId).single());
  assert.equal(candidate.documento_id,doc.id); assert.equal(candidate.estado,'listo');
  if (!journal.policies.length) {
    journal.policies=(await listPolicies()).filter(p=>['identidad','revision','conservacion'].includes(p.modulo));
    assert.equal(journal.policies.length,3);
    assert(journal.policies.every(p=>p.estado==='pendiente'), 'No alterar políticas aprobadas de otro ensayo');
    await save();
  }
  for (const policy of journal.policies) await decide(policy,true);
  await test('dos solicitudes concurrentes producen una sola emision',async()=>{
    const emit=client=>client.rpc('plan_documento_emitir',{p_candidato:candidate.id,p_solicitud:randomUUID()});
    const outcomes=await Promise.all([emit(reviewer),emit(reviewer)]);
    const first=ok(outcomes[0]), second=ok(outcomes[1]);
    assert.equal(first.id,second.id);
    assert.equal(first.pdf_sha256,candidate.pdf_sha256);
    assert.equal(ok(await author.from('plan_documento_emisiones').select('id').eq('documento_id',doc.id)).length,1);
    journal.emissionId=first.id; await save();
  });
  async function download(client) {
    const blob=ok(await client.storage.from('exports').download(candidate.pdf_path));
    const bytes=Buffer.from(await blob.arrayBuffer());
    assert.equal(createHash('sha256').update(bytes).digest('hex'),candidate.pdf_sha256);
    assert.equal(bytes.length,candidate.pdf_bytes); return bytes;
  }
  await test('emitido descargable e identico por ambas cuentas',async()=>{
    assert((await download(author)).equals(await download(reviewer)));
  });
  await test('emitido y archivo inaccesibles fuera del rol y empresa',async()=>{
    for(const key of ['e1-tecnico-1','e2-admin']) {
      assert.equal(ok(await clients[key].from('plan_documento_emisiones').select('id').eq('id',journal.emissionId)).length,0);
      assert((await clients[key].storage.from('exports').download(candidate.pdf_path)).error);
    }
  });
  await test('una cuenta de aplicacion no puede sobrescribir el PDF',async()=>{
    const bytes=await download(author);
    const denied=await author.storage.from('exports').update(candidate.pdf_path,bytes,{contentType:'application/pdf'});
    assert(denied.error); assert(bytes.equals(await download(author)));
  });
  await test('editar la OT despues de emitir conserva el archivo original',async()=>{
    const bytes=await download(author);
    ok(await author.from('ordenes').update({descripcion:'QA DOCUMENTAL SINTÉTICA — edición posterior a emisión de ensayo'}).eq('id',fixture.orderId));
    assert(bytes.equals(await download(reviewer)));
  });
} catch(e) { results.push({name:'emision remota',ok:false,error:e.message}); console.error(e.message);process.exitCode=1; }
finally {
  if(tenantId && clients['platform-creator']) {
    try {
      const current=await listPolicies();
      for(const policy of journal.policies) {
        const now=current.find(p=>p.modulo===policy.modulo);
        if(now?.autoridad===label) await decide(policy,false);
        else if(now?.estado!==policy.estado) throw new Error('La política cambió externamente; no se sobrescribe');
      }
      const restored=await listPolicies();
      for(const policy of journal.policies) assert.equal(restored.find(p=>p.modulo===policy.modulo)?.estado,policy.estado);
      results.push({name:'politicas del fixture restauradas',ok:true}); console.log('OK politicas del fixture restauradas');
    } catch(e) {results.push({name:'restauracion de politicas',ok:false,error:e.message});console.error(e.message);process.exitCode=1;}
  }
  await writeFile(`${directory}/issue-results.json`,JSON.stringify({testedAt:new Date().toISOString(),results},null,2));
  for(const client of Object.values(clients)) await client.auth.signOut({scope:'local'});
}
