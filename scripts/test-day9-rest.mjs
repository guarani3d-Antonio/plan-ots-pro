// Matriz final de campo conectado con clave pública y cuentas ficticias.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';

const url = 'https://iqgbyqyoovzvhhdjawnt.supabase.co';
const projects = {
  'e1-obra-1': '11000000-0000-4000-8000-000000000001',
  'e1-obra-2': '11000000-0000-4000-8000-000000000002',
  'e2-obra-1': '22000000-0000-4000-8000-000000000001',
  'e2-obra-2': '22000000-0000-4000-8000-000000000002',
};
const projectIds = Object.values(projects);
const env = await readFile('.env.local', 'utf8');
const anonKey = env.match(/^VITE_SUPABASE_ANON_KEY\s*=\s*["']?([^\r\n"']+)/m)?.[1];
assert(anonKey, 'Falta la clave pública de Supabase');
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const credentials = JSON.parse(await readFile('.backups.local/2026-09-20-dia4/test-credentials.local.json', 'utf8'));
const spec = JSON.parse(await readFile('docs/estabilizacion-2026-09-20/fixtures-tenants.json', 'utf8'));
const clients = {}, results = [];
const ok = response => { if (response.error) throw new Error(`${response.error.code}: ${response.error.message}`); return response.data; };
const denied = response => assert.equal(response.error?.code, '42501');
async function test(name, fn) {
  try { await fn(); results.push({ name, ok: true }); console.log(`OK ${name}`); }
  catch (error) { results.push({ name, ok: false, error: error.message.split('\n')[0] }); console.log(`FAIL ${name}: ${error.message.split('\n')[0]}`); }
}

try {
  for (const credential of credentials) {
    const client = createClient(url, anonKey, options);
    ok(await client.auth.signInWithPassword({ email: credential.email, password: credential.password }));
    clients[credential.key] = client;
  }
  const creator = clients['platform-creator'], e2Admin = clients['e2-admin'];

  // Limpieza exacta del recorrido visual de este bloque: binario, fila de foto y OT.
  const fieldOrders = ok(await e2Admin.from('ordenes').select('id').eq('proyecto_id', projects['e2-obra-2']).eq('obra', 'QA campo Samsung Tab FE'));
  for (const order of fieldOrders) {
    const photos = ok(await e2Admin.from('fotos').select('id,file_url,file_path').eq('orden_id', order.id));
    const paths = photos.map(photo => photo.file_path || String(photo.file_url).replace(/^storage:\/\/fotos\//, '')).filter(Boolean);
    if (paths.length) ok(await e2Admin.storage.from('fotos').remove(paths));
    if (photos.length) ok(await e2Admin.from('fotos').delete().in('id', photos.map(photo => photo.id)));
    ok(await e2Admin.from('ordenes').delete().eq('id', order.id));
  }

  await test('las cuatro obras ficticias conservan un fixture activo', async () => {
    const rows = ok(await creator.from('ordenes').select('id,proyecto_id').in('proyecto_id', projectIds));
    for (const projectId of projectIds) assert.equal(rows.filter(row => row.proyecto_id === projectId).length, 1);
  });

  await test('cada cuenta recibe exactamente sus obras de campo', async () => {
    const expected = { 'platform-creator': projectIds };
    for (const organization of spec.organizations) for (const user of organization.users)
      expected[user.key] = user.projects.map(key => projects[key]);
    for (const [key, ids] of Object.entries(expected)) {
      const context = ok(await clients[key].rpc('plan_contexto_acceso'));
      const visible = context.obras.map(project => project.id).filter(id => projectIds.includes(id)).sort();
      assert.deepEqual(visible, [...ids].sort(), key);
    }
  });

  await test('técnicos y lectores no atraviesan empresa ni amplían permisos', async () => {
    const tech = clients['e1-tecnico-1'], viewer = clients['e1-lector'];
    assert.equal(ok(await tech.from('ordenes').select('id').eq('proyecto_id', projects['e2-obra-1'])).length, 0);
    denied(await tech.rpc('plan_crear_orden', { p_proyecto: projects['e2-obra-1'], p_pos_x: 0.4, p_pos_y: 0.4 }));
    denied(await viewer.rpc('plan_crear_orden', { p_proyecto: projects['e1-obra-1'], p_pos_x: 0.4, p_pos_y: 0.4 }));
    denied(await viewer.rpc('plan_restaurar_version', { p_version: '00000000-0000-4000-8000-000000000001', p_proyecto: projects['e1-obra-1'] }));
  });

  await test('la reanudación usa contexto vigente y no dejó evidencia temporal', async () => {
    for (const key of ['e1-tecnico-1', 'e1-supervisor', 'e2-tecnico-2', 'e2-supervisor']) {
      const first = ok(await clients[key].rpc('plan_contexto_acceso'));
      const second = ok(await clients[key].rpc('plan_contexto_acceso'));
      assert.deepEqual(second, first);
    }
    assert.equal(ok(await e2Admin.from('ordenes').select('id').eq('proyecto_id', projects['e2-obra-2']).eq('obra', 'QA campo Samsung Tab FE')).length, 0);
  });
} catch (error) {
  results.push({ name: 'preparación REST', ok: false, error: error.message.split('\n')[0] });
}

await mkdir('docs/estabilizacion-2026-09-20/dia-9', { recursive: true });
const report = {
  testedAt: new Date().toISOString(),
  scope: 'Supabase real con las cuatro obras y once cuentas ficticias: visibilidad, permisos, reanudación y limpieza del recorrido Samsung.',
  passed: results.filter(result => result.ok).length,
  total: results.length,
  results,
};
await writeFile('docs/estabilizacion-2026-09-20/dia-9/rest-tests.json', `${JSON.stringify(report, null, 2)}\n`);
console.log(`${report.passed}/${report.total}`);
if (results.some(result => !result.ok)) process.exitCode = 1;
