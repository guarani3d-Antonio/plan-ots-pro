// Código real del store, sync y hook; adaptadores en memoria, sin red ni .env.
// No sustituye pruebas de IndexedDB, React, Realtime ni RLS del servidor.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import ts from 'typescript';

const results = [];
const json = value => JSON.parse(JSON.stringify(value));
function create(init) {
  let state;
  const set = value => { state = { ...state, ...(typeof value === 'function' ? value(state) : value) }; };
  state = init(set, () => state);
  return Object.assign(() => state, { getState: () => state, setState: set });
}
function table(initial = []) {
  const rows = new Map(initial.map(row => [row.id, json(row)]));
  const table = {
    rows,
    async put(row) { rows.set(row.id, json(row)); },
    async add(row) { const id = row.id ?? rows.size + 1; rows.set(id, json({ ...row, id })); },
    async update(id, patch) { if (rows.has(id)) rows.set(id, { ...rows.get(id), ...json(patch) }); },
    async delete(id) { rows.delete(id); },
    async bulkPut(values) { for (const row of values) await table.put(row); },
    async toArray() { return [...rows.values()].map(json); },
    orderBy() { return table; },
    where(key) {
      const matching = predicate => ({
        async toArray() { return [...rows.values()].filter(predicate).map(json); },
        async delete() { for (const [id, row] of rows) if (predicate(row)) rows.delete(id); },
      });
      return {
        equals: value => matching(row => row[key] === value),
        anyOf: (...values) => matching(row => values.includes(row[key])),
      };
    },
  };
  return table;
}
function remote(response = { data: [], error: null }) {
  const calls = [], handlers = {};
  let cleanupCount = 0;
  return {
    calls, handlers, get cleanupCount() { return cleanupCount; },
    from(name) {
      const call = { table: name }; calls.push(call);
      const query = {};
      for (const method of ['select', 'insert', 'update', 'eq', 'in', 'order', 'single']) {
        query[method] = (...args) => { call[method] = args; return query; };
      }
      query.then = (ok, fail) => Promise.resolve(typeof response === 'function' ? response(call) : response).then(ok, fail);
      return query;
    },
    channel() {
      const channel = {
        on(_type, filter, callback) { handlers[filter.event] = { filter, callback }; return channel; },
        subscribe() { return channel; },
      };
      return channel;
    },
    removeChannel() { cleanupCount++; },
  };
}
function load(file, mocks, globals = {}, cache = new Map()) {
  const absolute = path.resolve(file);
  if (cache.has(absolute)) return cache.get(absolute);
  // Lista cerrada: un import nuevo obliga a revisar el arnés, nunca abre DB/red.
  const allowed = ['src/data/ordenMapper.ts', 'src/stores/ordenesStore.ts', 'src/sync/SyncManager.ts', 'src/hooks/useRealtimeOrdenes.ts'].map(p => path.resolve(p));
  assert.ok(allowed.includes(absolute), `Módulo no autorizado: ${absolute}`);
  const source = fs.readFileSync(absolute, 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} }; cache.set(absolute, module.exports);
  vm.runInNewContext(compiled, {
    module, exports: module.exports, Date, Set, Map,
    console: { log() {}, warn() {}, error() {} }, navigator: { onLine: true }, ...globals,
    require(spec) {
      if (Object.hasOwn(mocks, spec)) return mocks[spec];
      if (spec === 'zustand') return { create };
      if (spec === 'uuid') return { v4: () => 'ot-test' };
      if (spec.startsWith('.')) return load(path.resolve(path.dirname(absolute), spec) + '.ts', mocks, globals, cache);
      throw new Error(`Import no autorizado: ${spec}`);
    },
  }, { filename: absolute });
  return module.exports;
}
function setup(supabase = remote(), online = true) {
  const db = { ordenes: table(), syncQueue: table(), fotosPendientes: table(), async transaction(...args) { return args.at(-1)(); } };
  const mocks = {
    '../db/dexie': { db }, '../db/supabase': { supabase }, '../services/fotosService': {},
    '../services/storageService': { referenciaArchivo: (bucket, name) => `storage://${bucket}/${name}` },
    './authStore': { useAuthStore: { getState: () => ({ user: { id: 'actor-test' } }) } },
  };
  const globals = { navigator: { onLine: online } };
  const { useOrdenesStore: store } = load('src/stores/ordenesStore.ts', mocks, globals);
  return { db, supabase, store, sync: () => load('src/sync/SyncManager.ts', mocks).procesarSyncQueue(), mocks };
}
async function check(name, test) {
  try { await test(); results.push({ name, ok: true }); }
  catch (error) { results.push({ name, ok: false, error: error.message }); }
}
const sample = {
  id: 'ot-test', proyecto_id: 'obra-test', ot: 'OT-001', ubicacion: 'Nivel 1',
  comentarios: 'Nota independiente', descripcion: 'Descripción independiente',
  estado: 'Pendiente', prioridad: 'Media', responsable: 'Técnico', rubro: 'Pintura',
  pos_x: null, pos_y: 0, plano_ref_url: '', campos: { avance: 0, control: false },
  conflict_flag: false, created_by: 'autor-original', updated_by: 'editor-original',
  created_at: '2026-09-20T00:00:00Z', updated_at: '2026-09-20T01:00:00Z',
  fecha_ingreso: '2026-09-19', obra: 'Obra de prueba', unidad_amenities: 'Unidad 1',
  en_garantia: false, asiste_facility: true, costo: 0, nivel_riesgo: 'Alto',
  rubro_secundario: ['Electricidad'], contratistas: ['Contratista ficticio'],
  fecha_inicio_trabajos: '2026-09-20', porcentaje_avance: 0, fecha_fin_trabajos: '2026-09-21',
  reincidencia: false, potencialmente_conflictivo: true,
  acta_conformidad: 'Pendiente', informe_relevamiento: 'Pendiente', informe_avance: 'Pendiente', informe_cierre: 'Pendiente',
  acta_conformidad_url: 'fixture-acta', informe_relevamiento_url: 'fixture-relevamiento',
  informe_avance_url: 'fixture-avance', informe_cierre_url: 'fixture-cierre',
};
function assertSupportedFields(actual) {
  for (const [key, value] of Object.entries(sample)) assert.deepEqual(json(actual[key]), value, key);
}

await check('carga online conserva campos y fecha de caché real en Array.map', async () => {
  const context = setup(remote({ data: [sample, { ...sample, id: 'ot-test-2' }], error: null }));
  const start = Date.now();
  await context.store.getState().cargarOrdenes('obra-test');
  assertSupportedFields(context.store.getState().ordenes[0]);
  assert.equal(context.db.ordenes.rows.size, 2);
  for (const row of context.db.ordenes.rows.values()) assert.ok(row._last_fetched >= start);
});
await check('CREATE online e importación encolada transmiten el mismo contrato', async () => {
  const connected = setup(), disconnected = setup(remote(), false);
  await connected.store.getState().crearOrdenDesdeImport(sample);
  await disconnected.store.getState().crearOrdenDesdeImport(sample);
  assert.equal(disconnected.supabase.calls.length, 0);
  assert.equal(disconnected.db.syncQueue.rows.size, 1);
  await disconnected.sync();
  const sent = json(connected.supabase.calls[0].insert[0]);
  assert.deepEqual(json(disconnected.supabase.calls[0].insert[0]), sent);
  for (const [key, value] of Object.entries(sample)) {
    if (!['created_at', 'updated_at'].includes(key)) assert.deepEqual(sent[key], value, key);
  }
  assert.equal('_synced' in sent, false);
  assert.equal(disconnected.db.syncQueue.rows.size, 0);
});
await check('UPDATE online y cola conservan null/cero/false y omiten identidad manipulada', async () => {
  const patch = { costo: 0, en_garantia: false, pos_x: null, comentarios: '', descripcion: 'Diagnóstico', fecha_fin_trabajos: null, obra: undefined, id: 'intruso', proyecto_id: 'ajeno', created_by: 'intruso', updated_by: 'intruso', _synced: true };
  const connected = setup(remote(call => ({ data: { ...sample, ...call.update?.[0] }, error: null })));
  await connected.db.ordenes.put(sample);
  connected.store.setState({ ordenes: [sample] });
  await connected.store.getState().actualizarOrden(sample.id, patch);
  const queued = setup();
  await queued.db.syncQueue.add({ tipo: 'UPDATE_OT', payload: { id: sample.id, campos: patch }, intentos: 0 });
  await queued.sync();
  const onlinePayload = json(connected.supabase.calls[0].update[0]);
  const queuedPayload = json(queued.supabase.calls[0].update[0]);
  assert.equal(onlinePayload.updated_by, 'actor-test');
  assert.equal('updated_by' in queuedPayload, false, 'No atribuir cola antigua al usuario actual');
  assert.ok(Date.parse(onlinePayload.updated_at)); assert.ok(Date.parse(queuedPayload.updated_at));
  delete onlinePayload.updated_by; delete onlinePayload.updated_at; delete queuedPayload.updated_at;
  const expected = { costo: 0, en_garantia: false, pos_x: null, comentarios: '', descripcion: 'Diagnóstico', fecha_fin_trabajos: null };
  assert.deepEqual(onlinePayload, expected); assert.deepEqual(queuedPayload, expected);
  assert.deepEqual(json(connected.supabase.calls[0].eq), ['id', sample.id]);
});
await check('Realtime INSERT/UPDATE conserva campos; DELETE repetido es local y limpia selección', async () => {
  const context = setup(); let cleanup;
  const { useRealtimeOrdenes } = load('src/hooks/useRealtimeOrdenes.ts', {
    ...context.mocks, '../stores/ordenesStore': { useOrdenesStore: context.store },
    react: { useEffect(effect) { cleanup = effect(); } },
  });
  useRealtimeOrdenes('obra-test');
  for (const event of ['INSERT', 'UPDATE']) {
    const handler = context.supabase.handlers[event];
    assert.equal(handler.filter.filter, 'proyecto_id=eq.obra-test');
    handler.callback({ new: sample });
    await Promise.resolve();
    assertSupportedFields(context.store.getState().ordenes[0]);
    assertSupportedFields(context.db.ordenes.rows.get(sample.id));
  }
  context.store.getState().seleccionar(sample.id);
  for (let i = 0; i < 2; i++) context.supabase.handlers.DELETE.callback({ old: { id: sample.id } });
  await Promise.resolve();
  assert.equal(context.store.getState().ordenes.length, 0);
  assert.equal(context.store.getState().ordenSeleccionada, null);
  assert.equal(context.db.ordenes.rows.size, 0);
  assert.equal(context.db.syncQueue.rows.size, 0);
  assert.equal(context.supabase.calls.length, 0, 'Un DELETE remoto no genera otra escritura');
  cleanup(); assert.equal(context.supabase.cleanupCount, 1);
});

const report = { scope: 'Módulos TS reales en VM; red, React, Zustand y Dexie simulados. No certifica sesión, conflictos, durabilidad ni RLS.', passed: results.filter(r => r.ok).length, total: results.length, results };
fs.mkdirSync('docs/estabilizacion-2026-09-20/dia-2', { recursive: true });
fs.writeFileSync('docs/estabilizacion-2026-09-20/dia-2/orden-contract-tests.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
if (results.some(result => !result.ok)) process.exitCode = 1;
