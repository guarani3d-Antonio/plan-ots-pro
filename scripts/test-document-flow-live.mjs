// Solo cuentas y obra sintéticas. Nunca utiliza una clave administrativa.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { randomUUID, createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

process.loadEnvFile('.env.local');
const credentials = JSON.parse(await readFile('.backups.local/2026-09-20-dia4/test-credentials.local.json', 'utf8'));
const projectId = '11000000-0000-4000-8000-000000000001';
const directory = 'tmp/pdfs/live-flow';
await mkdir(directory, { recursive: true });
const stateFile = `${directory}/state.json`;
const state = await readFile(stateFile, 'utf8').then(JSON.parse).catch(error => {
  if (error.code !== 'ENOENT') throw error;
  return { requests: {} };
});
const results = [];
const clients = {};
const ok = response => { if (response.error) throw new Error(`${response.error.code ?? ''}: ${response.error.message}`); return response.data; };
const save = () => writeFile(stateFile, JSON.stringify(state, null, 2));
async function request(name) { state.requests[name] ??= randomUUID(); await save(); return state.requests[name]; }
async function check(name, action) { await action(); results.push({ name, ok: true }); console.log(`OK ${name}`); }

try {
  for (const key of ['platform-creator', 'e1-supervisor', 'e1-admin', 'e1-tecnico-1', 'e2-admin']) {
    const account = credentials.find(item => item.key === key);
    assert(account, `Falta cuenta de prueba ${key}`);
    const client = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY,
      { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
    ok(await client.auth.signInWithPassword({ email: account.email, password: account.password }));
    clients[key] = client;
  }
  const author = clients['e1-supervisor'];
  const reviewer = clients['platform-creator'];
  const project = ok(await author.from('proyectos').select('id,nombre,tenant_id').eq('id', projectId).single());
  assert.match(project.nombre, /prueba/i, 'La obra debe ser ficticia');
  console.log(`Obra sintética verificada: ${project.nombre}`);
  if (process.argv.includes('--inspect')) {
    console.log(JSON.stringify(ok(await clients['platform-creator'].rpc('plan_politicas_listar', { p_tenant: project.tenant_id })), null, 2));
  } else {
    if (!state.orderId) {
      const order = ok(await author.rpc('plan_crear_orden', { p_proyecto: projectId, p_pos_x: 0.4, p_pos_y: 0.4 }));
      state.orderId = typeof order === 'string' ? order : order.id;
      assert(state.orderId); await save();
      ok(await author.from('ordenes').update({ descripcion: 'QA DOCUMENTAL SINTÉTICA — no corresponde a un reclamo real' }).eq('id', state.orderId));
    }
    const doc = ok(await author.rpc('plan_documento_reservar', {
      p_orden: state.orderId, p_tipo: 'visita', p_ciclo: 1, p_solicitud: await request('reserve'),
    }));
    state.documentId = doc.id; await save();
    const draft = ok(await author.rpc('plan_documento_borrador_guardar', {
      p_documento: doc.id, p_datos: { observaciones: 'Prueba integral con cuentas ficticias. Sin validez operativa.', incluirFotos: false, fotoIds: [], visita: {} },
      p_version: 0, p_solicitud: await request('draft'),
    }));
    const revision = ok(await author.rpc('plan_documento_revision_congelar', {
      p_documento: doc.id, p_version: draft.version, p_motivo: 'Ensayo técnico con datos sintéticos',
      p_esquema: 1, p_plantilla: 'expediente-controlado-2026-09-29', p_solicitud: await request('freeze'),
    }));
    state.revisionId = revision.id; await save();
    await check('fuentes congeladas inaccesibles al tecnico y a otra empresa', async () => {
      for (const key of ['e1-tecnico-1', 'e2-admin'])
        assert.equal(ok(await clients[key].from('plan_documento_fuentes').select('revision_id').eq('revision_id', revision.id)).length, 0, key);
    });
    async function render(client) {
      const session = ok(await client.auth.getSession()).session;
      const response = await fetch(`${process.env.VITE_SUPABASE_URL}/functions/v1/render-documento`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://plan-ots-pro.pages.dev',
          Authorization: `Bearer ${session.access_token}`, apikey: process.env.VITE_SUPABASE_ANON_KEY },
        body: JSON.stringify({ revisionId: revision.id, solicitudId: await request('render') }),
        signal: AbortSignal.timeout(90000),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(`Render HTTP ${response.status}: ${body.error ?? body.message}`);
      return body;
    }
    let rendered;
    await check('render PDF autorizado en servicio publicado', async () => {
      rendered = await render(author); assert.equal(rendered.estado, 'listo');
      state.candidateId = rendered.candidatoId; await save();
    });
    const candidate = ok(await author.from('plan_documento_candidatos').select('*').eq('id', state.candidateId).single());
    async function download(client) {
      const blob = ok(await client.storage.from('exports').download(candidate.pdf_path));
      const bytes = Buffer.from(await blob.arrayBuffer());
      assert.equal(bytes.length, candidate.pdf_bytes);
      assert.equal(createHash('sha256').update(bytes).digest('hex'), candidate.pdf_sha256);
      return bytes;
    }
    await check('dos cuentas descargan el mismo PDF con hash exacto', async () => {
      const first = await download(author), second = await download(reviewer);
      assert(first.equals(second)); await writeFile(`${directory}/visita.pdf`, first);
    });
    await check('reintento devuelve el mismo candidato sin duplicar', async () => {
      const repeat = await render(author); assert.equal(repeat.candidatoId, candidate.id);
      assert.equal(repeat.pdfSha256, candidate.pdf_sha256);
    });
    await check('reintentos concurrentes conservan un unico candidato listo', async () => {
      const retries = await Promise.all([render(author), render(author)]);
      for (const repeat of retries) {
        assert.equal(repeat.candidatoId, candidate.id);
        assert.equal(repeat.pdfSha256, candidate.pdf_sha256);
      }
      assert.equal(ok(await author.from('plan_documento_candidatos').select('id').eq('revision_id', revision.id)).length, 1);
    });
    await check('editar la OT no cambia el PDF congelado', async () => {
      const before = await download(author);
      ok(await author.from('ordenes').update({ descripcion: 'QA DOCUMENTAL SINTÉTICA — edición posterior al PDF congelado; no es un reclamo real' }).eq('id', state.orderId));
      assert(before.equals(await download(author)));
    });
    await check('PDF privado inaccesible al tecnico y a otra empresa', async () => {
      for (const key of ['e1-tecnico-1', 'e2-admin']) {
        const denied = await clients[key].storage.from('exports').download(candidate.pdf_path);
        assert(denied.error, `${key} no debe leer el PDF`);
      }
    });
    await check('el autor no puede aprobar su propio PDF', async () => {
      const denied = await author.rpc('plan_documento_revisar_pdf', {
        p_candidato: candidate.id, p_sha256: candidate.pdf_sha256, p_decision: 'aprobado',
        p_motivo: 'QA', p_solicitud: await request('selfApproval'),
      });
      assert.equal(denied.error?.code, '42501');
    });
    await check('segunda cuenta aprueba exactamente los bytes verificados', async () => {
      ok(await reviewer.rpc('plan_documento_revisar_pdf', {
        p_candidato: candidate.id, p_sha256: candidate.pdf_sha256, p_decision: 'aprobado',
        p_motivo: 'QA con datos ficticios; verificación técnica del PDF descargado', p_solicitud: await request('review'),
      }));
    });
    // No inventar decisiones institucionales para habilitar la emisión.
    const policies = ok(await clients['platform-creator'].rpc('plan_politicas_listar', { p_tenant: project.tenant_id }));
    console.log('Políticas:', JSON.stringify(policies.map(p => ({ modulo: p.modulo, estado: p.estado }))));
    const issued = ok(await reviewer.from('plan_documento_emisiones').select('id').eq('documento_id', doc.id));
    if (!issued.length && policies.some(p => ['identidad', 'revision', 'conservacion'].includes(p.modulo) && p.estado !== 'aprobada')) {
      await check('no permite emitir con politicas pendientes', async () => {
        const denied = await reviewer.rpc('plan_documento_emitir', {
          p_candidato: candidate.id, p_solicitud: await request('emitPending'),
        });
        assert.equal(denied.error?.code, '22023');
        assert.match(denied.error.message, /Politica documental/);
        assert.equal(ok(await reviewer.from('plan_documento_emisiones').select('id').eq('documento_id', doc.id)).length, 0);
      });
    }
  }
} catch (error) {
  results.push({ name: 'flujo documental real', ok: false, error: error.message });
  console.error(error.message); process.exitCode = 1;
} finally {
  for (const client of Object.values(clients)) await client.auth.signOut({ scope: 'local' });
  await writeFile(`${directory}/results.json`, JSON.stringify({ testedAt: new Date().toISOString(), results }, null, 2));
}
