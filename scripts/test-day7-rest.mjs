// Prueba el flujo conectado con la clave pública y cuentas ficticias. No usa service_role.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';

const url = 'https://iqgbyqyoovzvhhdjawnt.supabase.co';
const projectA1 = '11000000-0000-4000-8000-000000000001';
const projectB1 = '22000000-0000-4000-8000-000000000001';
const env = await readFile('.env.local', 'utf8');
const anonKey = env.match(/^VITE_SUPABASE_ANON_KEY\s*=\s*["']?([^\r\n"']+)/m)?.[1];
assert(anonKey, 'Falta la clave pública de Supabase');

const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const credentials = JSON.parse(await readFile('.backups.local/2026-09-20-dia4/test-credentials.local.json', 'utf8'));
const clients = {};
const results = [];
const cleanup = [];
const qaPositions = new Set(['0.21,0.31', '0.22,0.32', '0.23,0.33', '0.24,0.34', '0.25,0.35', '0.26,0.36']);
const ok = (response) => {
  if (response.error) throw new Error(`${response.error.code}: ${response.error.message}`);
  return response.data;
};
const denied = (response) => {
  assert(response.error, 'Se esperaba un rechazo');
  assert.equal(response.error.code, '42501');
};
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
async function create(client, project = projectA1, x = 0.25, y = 0.3) {
  return ok(await client.rpc('plan_crear_orden', { p_proyecto: project, p_pos_x: x, p_pos_y: y }));
}
async function row(client, id) {
  return ok(await client.from('ordenes').select('id,ot,estado,comentarios,responsable,updated_at,created_by').eq('id', id).single());
}

try {
  for (const credential of credentials) {
    const client = createClient(url, anonKey, options);
    ok(await client.auth.signInWithPassword({ email: credential.email, password: credential.password }));
    clients[credential.key] = client;
  }
  const tech = clients['e1-tecnico-1'];
  const supervisor = clients['e1-supervisor'];
  const admin = clients['e1-admin'];
  const viewer = clients['e1-lector'];

  // Una interrupción manual puede impedir el finally. Retirar únicamente OTs
  // vacías creadas por esta matriz, en sus coordenadas reservadas del día 7.
  const previousQa = ok(await admin.from('ordenes')
    .select('id,pos_x,pos_y,ubicacion,rubro,created_at')
    .eq('proyecto_id', projectA1)
    .gte('created_at', '2026-09-21T01:45:00Z'))
    .filter((order) => qaPositions.has(`${order.pos_x},${order.pos_y}`) && !order.ubicacion && !order.rubro);
  for (const order of previousQa) ok(await admin.from('ordenes').delete().eq('id', order.id));

  await test('dos sesiones crean OTs concurrentes sin repetir el código', async () => {
    const [techId, supervisorId] = await Promise.all([
      create(tech, projectA1, 0.21, 0.31),
      create(supervisor, projectA1, 0.22, 0.32),
    ]);
    cleanup.push({ id: techId, owner: tech }, { id: supervisorId, owner: supervisor });
    const [techRow, supervisorRow] = await Promise.all([row(tech, techId), row(supervisor, supervisorId)]);
    assert.notEqual(techId, supervisorId);
    assert.match(techRow.ot, /^OT-\d+$/);
    assert.match(supervisorRow.ot, /^OT-\d+$/);
    assert.notEqual(techRow.ot, supervisorRow.ot);
    const duplicate = await supervisor.from('ordenes').update({ ot: techRow.ot }).eq('id', supervisorId);
    assert.equal(duplicate.error?.code, '23505');
    assert.equal((await row(supervisor, supervisorId)).ot, supervisorRow.ot);
  });

  await test('ediciones distintas se recuperan tras detectar la versión antigua', async () => {
    const id = await create(supervisor, projectA1, 0.23, 0.33);
    cleanup.push({ id, owner: supervisor });
    const initial = await row(supervisor, id);
    const first = ok(await supervisor.from('ordenes').update({ comentarios: 'Cambio desde sesión A' }).eq('id', id).eq('updated_at', initial.updated_at).select('updated_at').single());
    const stale = ok(await tech.from('ordenes').update({ responsable: 'Equipo sesión B' }).eq('id', id).eq('updated_at', initial.updated_at).select('id'));
    assert.equal(stale.length, 0);
    const second = ok(await tech.from('ordenes').update({ responsable: 'Equipo sesión B' }).eq('id', id).eq('updated_at', first.updated_at).select('id'));
    assert.equal(second.length, 1);
    const merged = await row(supervisor, id);
    assert.equal(merged.comentarios, 'Cambio desde sesión A');
    assert.equal(merged.responsable, 'Equipo sesión B');
  });

  await test('estado y comentario se confirman juntos y rechazan una pantalla antigua', async () => {
    const id = await create(tech, projectA1, 0.24, 0.34);
    cleanup.push({ id, owner: admin, force: true });
    const initial = await row(tech, id);
    ok(await tech.rpc('plan_cambiar_estado_orden', {
      p_orden: id,
      p_expected_at: initial.updated_at,
      p_estado: 'En proceso',
      p_fecha_fin: null,
      p_comentario: 'Inicio confirmado en campo',
    }));
    const changed = await row(supervisor, id);
    assert.equal(changed.estado, 'En proceso');
    const comments = ok(await supervisor.from('ot_comentarios').select('comentario,estado_nuevo').eq('orden_id', id));
    assert.equal(comments.length, 1);
    assert.equal(comments[0].estado_nuevo, 'En proceso');
    const stale = await supervisor.rpc('plan_cambiar_estado_orden', {
      p_orden: id,
      p_expected_at: initial.updated_at,
      p_estado: 'Cerrada',
      p_fecha_fin: null,
      p_comentario: 'Intento desde pantalla antigua',
    });
    assert.equal(stale.error?.code, 'PT409');
    assert.equal((await row(supervisor, id)).estado, 'En proceso');
  });

  await test('el creador cancela una OT nueva propia y desaparece de la obra', async () => {
    const id = await create(tech, projectA1, 0.25, 0.35);
    ok(await tech.rpc('plan_cancelar_orden_nueva', { p_orden: id }));
    assert.equal(ok(await supervisor.from('ordenes').select('id').eq('id', id)).length, 0);
  });

  await test('un lector no crea, cambia estado ni cancela OTs', async () => {
    denied(await viewer.rpc('plan_crear_orden', { p_proyecto: projectA1, p_pos_x: 0.3, p_pos_y: 0.4 }));
    const id = await create(tech, projectA1, 0.26, 0.36);
    cleanup.push({ id, owner: tech });
    const current = await row(tech, id);
    denied(await viewer.rpc('plan_cambiar_estado_orden', { p_orden: id, p_expected_at: current.updated_at, p_estado: 'Cerrada', p_fecha_fin: null, p_comentario: 'No autorizado' }));
    denied(await viewer.rpc('plan_cancelar_orden_nueva', { p_orden: id }));
  });

  await test('un técnico no crea OTs en otra empresa', async () => {
    denied(await tech.rpc('plan_crear_orden', { p_proyecto: projectB1, p_pos_x: 0.4, p_pos_y: 0.5 }));
  });

  await test('coordenadas fuera del plano se rechazan sin crear registros', async () => {
    const response = await tech.rpc('plan_crear_orden', { p_proyecto: projectA1, p_pos_x: 1.2, p_pos_y: 0.5 });
    assert.equal(response.error?.code, '22023');
  });
} catch (error) {
  results.push({ name: 'preparación REST', ok: false, error: error.message.split('\n')[0] });
} finally {
  for (const item of cleanup.reverse()) {
    try {
      if (!item.force) {
        const cancelled = await item.owner.rpc('plan_cancelar_orden_nueva', { p_orden: item.id });
        if (!cancelled.error) continue;
      }
      const cleanupResult = await clients['e1-admin']?.from('ordenes').delete().eq('id', item.id);
      if (cleanupResult?.error) throw cleanupResult.error;
    } catch (error) {
      results.push({ name: `limpieza ${item.id.slice(0, 8)}`, ok: false, error: error.message });
    }
  }
  if (clients['e1-admin']) {
    await test('la matriz no deja OTs activas de prueba', async () => {
      const activeQa = ok(await clients['e1-admin'].from('ordenes')
        .select('id,pos_x,pos_y,ubicacion,rubro,created_at')
        .eq('proyecto_id', projectA1)
        .gte('created_at', '2026-09-21T01:45:00Z'))
        .filter((order) => qaPositions.has(`${order.pos_x},${order.pos_y}`) && !order.ubicacion && !order.rubro);
      assert.equal(activeQa.length, 0);
    });
  }
  const report = {
    testedAt: new Date().toISOString(),
    scope: 'Supabase real con JWT de cuentas ficticias y clave pública. Prueba creación concurrente, control de versión, transición atómica, permisos y cancelación.',
    passed: results.filter((result) => result.ok).length,
    total: results.length,
    results,
  };
  await writeFile('docs/estabilizacion-2026-09-20/dia-7/rest-tests.json', `${JSON.stringify(report, null, 2)}\n`);
  console.log(`${report.passed}/${report.total}`);
  if (results.some((result) => !result.ok)) process.exitCode = 1;
}
