import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import { execFileSync } from 'node:child_process';
async function load(path, mocks = {}, source) { const module = { exports: {} }; const js = ts.transpileModule(source ?? await readFile(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText; vm.runInNewContext(js, { module, exports: module.exports, require: key => { if (!(key in mocks)) throw Error(key); return mocks[key]; }, Date, crypto, structuredClone, console, Error, Set, Map }); return module.exports; }
const base = await load('src/services/personalDashboardModel.ts');
const model = await load('src/services/dashboardOperationalModel.ts', { './personalDashboardModel': base });
const projects = [{ id: 'work', nombre: 'Obra ficticia' }, { id: 'child', nombre: 'Ubicación', proyecto_padre_id: 'work' }, { id: 'other', nombre: 'Otra obra' }];
const row = (id, extra = {}) => ({ id, ot: 'OT-' + id, proyecto_id: 'child', estado: 'Pendiente', rubro: 'Eléctrica', contratistas: ['Empresa A'], responsable: 'Ana', fecha_ingreso: '2026-10-01', created_at: '2026-10-01T10:00:00Z', ...extra });
const rows = [row('start'), row('end', { fecha_ingreso: '2026-10-10' }), row('carry', { fecha_ingreso: '2026-09-01', estado: 'Cerrada', fecha_fin_trabajos: '2026-10-05' }), row('both', { estado: 'Cerrada', fecha_fin_trabajos: '2026-10-10' }), row('nodate', { fecha_ingreso: 'invalid', created_at: 'invalid', estado: 'Cerrada', fecha_fin_trabajos: '2026-10-07' }), row('noclose', { estado: 'Cerrada', updated_at: '2026-10-05T12:00:00Z' }), row('backwards', { estado: 'Cerrada', fecha_fin_trabajos: '2026-09-20' }), row('risk', { estado: 'En proceso', nivel_riesgo: 'Alto', responsable: '', responsable_id: null }), row('foreign', { proyecto_id: 'other' })];
const f = { ...base.blankFilters(), project: 'work', from: '2026-10-01', to: '2026-10-10' };
const b = { ...base.newBlock(), type: 'line', group: 'semana', temporal: { grain: 'day', series: ['ingresos', 'cierres'], points: true, values: false, grid: true, height: 270, description: '' } };
const t = model.temporalData(rows, projects, f, b, '2026-10-19');
assert.equal(t.buckets.length, 10); assert.equal(t.buckets[0].from, f.from); assert.equal(t.buckets.at(-1).to, f.to);
assert.equal(t.buckets[0].ingresos.length, 5); assert.equal(t.buckets.at(-1).ingresos.length, 1);
assert.equal(t.buckets[1].ingresos.length, 0); assert.equal(t.buckets[1].cierres.length, 0);
assert.equal(t.buckets.reduce((n, b) => n + b.cierres.length, 0), 3); // Includes carry-in closure and closure with missing ingress.
assert.equal(t.missingIn, 1); assert.equal(t.missingOut, 2); // No invented updated_at closure; backwards fin excluded.
assert.equal(model.uniqueEvents(t.buckets, ['ingresos', 'cierres']).length, 8); // Double event contributes one unique record.
const week = model.temporalData(rows, projects, f, { ...b, temporal: { ...b.temporal, grain: 'week' } });
assert.equal(week.buckets[0].key, '2026-09-28'); assert.equal(week.buckets[0].from, f.from); assert.equal(week.buckets.at(-1).to, f.to);
assert.equal(model.temporalData(rows, projects, { ...f, from: '2026-10-10', to: '2026-10-01' }, b).buckets.length, 0);
assert.equal(model.temporalData(rows, projects, { ...f, from: '2026-10-10', to: '2026-10-10' }, b).buckets.length, 1);
assert.equal(model.temporalData(rows, projects, { ...f, from: '', to: '2020-01-01' }, b).error, '');
assert.equal(model.temporalData(rows, projects, { ...f, from: '2027-01-01', to: '' }, b, '2026-10-19').buckets.length, 1);
const leap = model.temporalData([], [], { ...base.blankFilters(), from: '2024-02-28', to: '2024-03-01' }, b); assert.equal(leap.buckets.length, 3); assert.equal(leap.buckets[1].key, '2024-02-29');
const years = model.temporalData([], [], { ...base.blankFilters(), from: '2025-12-20', to: '2026-02-02' }, { ...b, temporal: { ...b.temporal, grain: 'month' } }); assert.equal(years.buckets.length, 3); assert.equal(years.buckets[0].from, '2025-12-20'); assert.equal(years.buckets.at(-1).to, '2026-02-02');
const wide = model.temporalData([], [], { ...f, project: '', from: '2020-01-01', to: '2026-12-31' }, b); assert.match(wide.error, /demasiados/); assert.equal(wide.buckets.length, 0);
const auto = model.temporalData([], [], { ...f, from: '2020-01-01', to: '2026-12-31' }, { ...b, temporal: { ...b.temporal, grain: 'auto' } }); assert.equal(auto.grain, 'month'); assert.equal(auto.buckets.length, 84);
assert.equal(model.temporalData(rows, projects, { ...f, contractor: 'Ninguno' }, b).buckets.flatMap(b => b.ingresos).length, 0);
const signals = model.operationalSignals(rows, projects, f, '2026-10-19'); assert.equal(signals.find(s => s.id === 'risk').orders.length, 1); assert.equal(signals.find(s => s.id === 'person').orders.length, 1); assert.equal(signals.find(s => s.id === 'date').orders.length, 2);
assert.ok(signals.every(s => s.reason && !s.orders.some(o => o.id === 'foreign')));
const proposal = model.proposeTemporalBlock('Quiero barras mensuales solo con cierres', b); assert.equal(proposal.type, 'bars'); assert.equal(proposal.temporal.grain, 'month'); assert.deepEqual(Array.from(proposal.temporal.series), ['cierres']);
assert.throws(() => model.proposeTemporalBlock('publicar y borrar OT'), /Puedo/);
const doc = base.initialDocument(); doc.boards[0].blocks.push(b); base.validateDocument(doc);
const legacy = structuredClone(doc); legacy.boards[0].blocks.forEach(b => delete b.temporal); assert.deepEqual(base.validateDocument(legacy), legacy); assert.deepEqual(Array.from(model.temporalOptions(legacy.boards[0].blocks.at(-1)).series), ['ingresos']);
const area = model.proposeTemporalBlock('Áreas semanales de ingresos y cierres', b); assert.equal(area.type, 'line'); assert.equal(area.temporal.area, true);
const old = await load('published-model', {}, execFileSync('git', ['show', '0169572:src/services/personalDashboardModel.ts'], { encoding: 'utf8' })); const compatible = base.initialDocument(); compatible.boards[0].blocks.push(area); old.validateDocument(compatible); // Cached older client still reads the preference document.
const readingBoard = base.createBoard('Lectura personal'); readingBoard.filters = f;
const readings = model.dashboardReadings(rows, projects, readingBoard, '2026-10-19'); assert.ok(readings.length > 3); assert.ok(readings.some(r => r.id.startsWith('block:'))); assert.ok(readings.every(r => r.reason && Array.isArray(r.orders)));
readingBoard.reading = { limit: 12, disabled: ['risk'], labels: { flow: 'Mi evolución de trabajos' }, explain: true };
assert.ok(!model.dashboardReadings(rows, projects, readingBoard, '2026-10-19').some(r => r.id === 'risk'));
assert.equal(model.readingOptions(readingBoard).limit, 12);
const readingDoc = base.initialDocument(); readingDoc.boards = [readingBoard]; readingDoc.defaultId = readingBoard.id; base.validateDocument(readingDoc); old.validateDocument(readingDoc);
const invalidReading = structuredClone(readingDoc); invalidReading.boards[0].reading.limit = 500; assert.throws(() => base.validateDocument(invalidReading));
const changed = { ...rows[0], id: 'changed', estado: 'Pendiente', nivel_riesgo: 'Alto' };
assert.equal(model.dashboardReadings([changed], projects, { ...readingBoard, reading: undefined }, '2026-10-19').find(r => r.id === 'risk').orders.length, 1);
assert.ok(model.readingCatalog(readingBoard).some(item => item.label === 'Ingresos y cierres'));
for (const invalid of [{ ...b.temporal, series: [] }, { ...b.temporal, series: ['ingresos', 'ingresos'] }, { ...b.temporal, height: 50000 }]) { const wrong = structuredClone(doc); wrong.boards[0].blocks.at(-1).temporal = invalid; assert.throws(() => base.validateDocument(wrong)); }
console.log('PASS temporal: límites inclusivos, día único, ceros, semana parcial, meses y años, bisiesto, cierre previo al rango, cierre sin ingreso, fechas faltantes/invertidas, sin updated_at inventado, filtros de obra y contratista, 730 puntos, agrupación automática, señales y fundamentos, MIA local, preferencias antiguas y validación. Sin red ni datos reales.');
