// Prueba la restauración real con la clave pública y cuentas ficticias. No usa service_role.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';

const url = 'https://iqgbyqyoovzvhhdjawnt.supabase.co';
const projectA1 = '11000000-0000-4000-8000-000000000001';
const env = await readFile('.env.local', 'utf8');
const anonKey = env.match(/^VITE_SUPABASE_ANON_KEY\s*=\s*["']?([^\r\n"']+)/m)?.[1];
assert(anonKey, 'Falta la clave pública de Supabase');
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const credentials = JSON.parse(await readFile('.backups.local/2026-09-20-dia4/test-credentials.local.json', 'utf8'));
const clients = {};
const results = [];
const temporaryOrders = [];
const temporaryVersions = [];
const ok = (response) => {
  if (response.error) throw new Error(`${response.error.code}: ${response.error.message}`);
  return response.data;
};
const denied = (response) => assert.equal(response.error?.code, '42501');
async function test(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`OK ${name}`);
  } catch (error) {
    results.push({ name, ok: false, error: error.message.split('\n')[0] });
    console.log(`FAIL ${name}: ${error.message.split('\n')[0]}`);
  }
}

try {
  for (const credential of credentials) {
    const client = createClient(url, anonKey, options);
    ok(await client.auth.signInWithPassword({ email: credential.email, password: credential.password }));
    clients[credential.key] = client;
  }
  const supervisor = clients['e1-supervisor'];
  const admin = clients['e1-admin'];
  const viewer = clients['e1-lector'];
  const otherSupervisor = clients['e2-supervisor'];
  const anonymous = createClient(url, anonKey, options);

  const firstId = ok(await supervisor.rpc('plan_crear_orden', { p_proyecto: projectA1, p_pos_x: 0.781, p_pos_y: 0.881 }));
  const secondId = ok(await supervisor.rpc('plan_crear_orden', { p_proyecto: projectA1, p_pos_x: 0.782, p_pos_y: 0.882 }));
  temporaryOrders.push(firstId, secondId);
  const originals = ok(await supervisor.from('ordenes')
    .select('id,ot,ubicacion,rubro,estado,responsable,prioridad,pos_x,pos_y,comentarios,campos')
    .in('id', temporaryOrders)
    .order('id'));
  assert.equal(originals.length, 2);

  const snapshotOrders = originals.map((order, index) => ({
    ...order,
    ot: originals[1 - index].ot,
    ubicacion: `Zona restaurada ${index + 1}`,
    comentarios: `Valor recuperado ${index + 1}`,
    responsable: 'Equipo QA día 8',
  }));
  const sourceId = randomUUID();
  temporaryVersions.push(sourceId);
  ok(await supervisor.from('versiones').insert({
    id: sourceId,
    proyecto_id: projectA1,
    nombre: 'QA día 8 restauración atómica',
    snapshot: { ordenes: snapshotOrders, total: 2, fecha: new Date().toISOString() },
    total_ordenes: 2,
  }));
  ok(await supervisor.from('ordenes').update({ comentarios: 'Cambio posterior al snapshot' }).in('id', temporaryOrders));

  await test('lector, anónimo y otra empresa no restauran', async () => {
    denied(await viewer.rpc('plan_restaurar_version', { p_version: sourceId, p_proyecto: projectA1 }));
    denied(await otherSupervisor.rpc('plan_restaurar_version', { p_version: sourceId, p_proyecto: projectA1 }));
    denied(await anonymous.rpc('plan_restaurar_version', { p_version: sourceId, p_proyecto: projectA1 }));
  });

  await test('Supabase restaura las dos OTs y crea el backup en la misma operación', async () => {
    const result = ok(await supervisor.rpc('plan_restaurar_version', { p_version: sourceId, p_proyecto: projectA1 }));
    assert.equal(result.restored, 2);
    assert.match(result.backup_id, /^[0-9a-f-]{36}$/);
    temporaryVersions.push(result.backup_id);
    const restored = ok(await supervisor.from('ordenes').select('id,ot,ubicacion,comentarios,responsable').in('id', temporaryOrders).order('id'));
    assert.deepEqual(restored.map((order) => order.ot), snapshotOrders.map((order) => order.ot));
    assert.deepEqual(restored.map((order) => order.comentarios), ['Valor recuperado 1', 'Valor recuperado 2']);
    const backup = ok(await supervisor.from('versiones').select('automatica,snapshot').eq('id', result.backup_id).single());
    assert.equal(backup.automatica, true);
    assert(Array.isArray(backup.snapshot.ordenes));
    assert(backup.snapshot.ordenes.length >= 2);
  });

  await test('snapshot inválido falla sin generar otro backup', async () => {
    const invalidId = randomUUID();
    temporaryVersions.push(invalidId);
    ok(await supervisor.from('versiones').insert({
      id: invalidId,
      proyecto_id: projectA1,
      nombre: 'QA día 8 inválida',
      snapshot: { total: 0 },
    }));
    const beforeResponse = await supervisor.from('versiones').select('id', { count: 'exact', head: true });
    if (beforeResponse.error) throw beforeResponse.error;
    const rejected = await supervisor.rpc('plan_restaurar_version', { p_version: invalidId, p_proyecto: projectA1 });
    assert.equal(rejected.error?.code, '22023');
    const afterResponse = await supervisor.from('versiones').select('id', { count: 'exact', head: true });
    if (afterResponse.error) throw afterResponse.error;
    assert.equal(afterResponse.count, beforeResponse.count);
  });
} catch (error) {
  results.push({ name: 'preparación REST', ok: false, error: error.message.split('\n')[0] });
} finally {
  const supervisor = clients['e1-supervisor'];
  const admin = clients['e1-admin'];
  for (const id of temporaryVersions.reverse()) {
    try { if (supervisor) ok(await supervisor.from('versiones').delete().eq('id', id)); }
    catch (error) { results.push({ name: `limpieza versión ${id.slice(0, 8)}`, ok: false, error: error.message }); }
  }
  for (const id of temporaryOrders.reverse()) {
    try { if (admin) ok(await admin.from('ordenes').delete().eq('id', id)); }
    catch (error) { results.push({ name: `limpieza OT ${id.slice(0, 8)}`, ok: false, error: error.message }); }
  }
  if (supervisor && admin) {
    await test('la matriz no deja datos temporales', async () => {
      assert.equal(ok(await supervisor.from('versiones').select('id').in('id', temporaryVersions)).length, 0);
      assert.equal(ok(await admin.from('ordenes').select('id').in('id', temporaryOrders)).length, 0);
    });
  }
  const report = {
    testedAt: new Date().toISOString(),
    scope: 'Supabase real con JWT ficticios y clave pública. Restauración y backup atómicos, rechazo por rol/tenant y limpieza.',
    passed: results.filter((result) => result.ok).length,
    total: results.length,
    results,
  };
  await writeFile('docs/estabilizacion-2026-09-20/dia-8/rest-tests.json', `${JSON.stringify(report, null, 2)}\n`);
  console.log(`${report.passed}/${report.total}`);
  if (results.some((result) => !result.ok)) process.exitCode = 1;
}
