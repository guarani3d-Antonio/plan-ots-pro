import { supabase as existing } from './qa-dashboards-mock';
import { proyectos } from './qa-grid-local-mock';
import { identityId } from '../src/security/sessionScope';
import { createBoard, initialDocument, localDay, validateDocument } from '../src/services/personalDashboardModel';
import { addDays } from '../src/services/dashboardOperationalModel';
const listeners = new Set<() => void>();
export const watch = (cb: () => void) => { listeners.add(cb); return () => { listeners.delete(cb); }; };
const today = localDay(), first = addDays(today, -55);
const rows: Record<string, unknown>[] = Array.from({ length: 160 }, (_, i) => {
  const start = addDays(first, i % 56), closed = i % 3 === 0;
  return { id: `40000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`, proyecto_id: proyectos[i % 2].id, ot: `OT-QA-${i + 1}`, estado: closed ? 'Cerrada' : i % 2 ? 'Pendiente' : 'En proceso', rubro: i % 2 ? 'Eléctrica' : 'Albañilería', responsable: i % 11 ? 'Ana QA' : '', responsable_id: null, contratistas: [i % 2 ? 'Electro QA' : 'Obras QA'], nivel_riesgo: i % 13 ? 'Bajo' : 'Alto', prioridad: i % 7 ? 'Media' : 'Alta', fecha_ingreso: i === 9 ? 'fecha-inválida' : start, fecha_fin_trabajos: closed && i % 15 ? addDays(start, Math.min(3, Math.max(0, Math.floor((Date.parse(today) - Date.parse(start)) / 86400000)))) : null, created_at: start + 'T12:00:00Z', updated_at: today + 'T12:00:00Z', descripcion: 'Trabajo ficticio de ensayo', comentarios: '', campos: {}, pos_x: .5, pos_y: .5, deleted_at: null };
});
let serial = 0;
export function simulateData() { serial++; rows.push({ ...rows[1], id: 'QA-NEW-' + serial, ot: 'OT-QA-NUEVA-' + serial, fecha_ingreso: today, estado: 'Pendiente', responsable: '', nivel_riesgo: 'Alto' }); listeners.forEach(fn => fn()); }
const many = new URLSearchParams(location.search).get('many') === '1';
const key = 'qa-dashboard-operational-private-v1' + (many ? '-twenty-boards' : '');
const configs: Record<string, { config: unknown; revision: number }> = JSON.parse(localStorage.getItem(key) || '{}');
const a = '10000000-0000-4000-8000-000000000001';
if (!configs[a]) { const doc = initialDocument(); doc.boards[0] = createBoard('Dashboard anterior conservado'); doc.defaultId = doc.boards[0].id; const chart = doc.boards[0].blocks.find(b => b.group === 'semana')!; delete chart.temporal; chart.title = 'Ingresos por semana'; chart.width = 6; configs[a] = { config: doc, revision: 1 }; }
if (many) { const id = '10000000-0000-4000-8000-000000000002'; if (!configs[id]) { const doc = initialDocument(); doc.boards = Array.from({length:20}, (_,i)=>createBoard('Dashboard '+String(i+1).padStart(2,'0'),i>0)); doc.defaultId = doc.boards[0].id; configs[id] = {config:doc,revision:1}; } }
let fail = false;
export const failNextRead = () => { fail = true; listeners.forEach(fn => fn()); };
class Query {
  predicates: ((o: Record<string, unknown>) => boolean)[] = []; from = 0; to = 999;
  select() { return this; } is(k: string, v: unknown) { this.predicates.push(o => (o[k] ?? null) === v); return this; }
  eq(k: string, v: unknown) { this.predicates.push(o => o[k] === v); return this; } order() { return this; } range(a: number, z: number) { this.from = a; this.to = z; return this; }
  then(resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) { return Promise.resolve().then(() => { if (fail) { fail = false; throw Error('Falla ficticia de lectura'); } const all = rows.filter(o => this.predicates.every(fn => fn(o))); return { data: structuredClone(all.slice(this.from, this.to + 1)), count: all.length, error: null }; }).then(resolve, reject); }
  insert() { throw Error('Escritura operativa bloqueada'); } update() { throw Error('Escritura operativa bloqueada'); } upsert() { throw Error('Escritura operativa bloqueada'); } delete() { throw Error('Escritura operativa bloqueada'); }
}
export const supabase: typeof existing = { ...existing,
  from(name: string) { if (name === 'ordenes') return new Query(); if (name !== 'plan_dashboards_personales') return existing.from(name); let requested = ''; return { select() { return this; }, eq(_key: string, id: string) { requested = id; return this; }, async maybeSingle() { if (requested !== identityId()) throw Error('Identidad de ensayo incorrecta'); return { data: structuredClone(configs[requested] || null), error: null }; } }; },
  rpc(name: string, args: Record<string, unknown> = {}) { if (name !== 'plan_guardar_dashboards_personales') return existing.rpc(name, args); const id = identityId()!, stored = configs[id]; if ((stored?.revision ?? 0) !== args.p_revision) return Promise.resolve({ data: null, error: { message: 'DASHBOARD_CONFLICT' } }); const config = validateDocument(args.p_config); configs[id] = { config, revision: (stored?.revision ?? 0) + 1 }; localStorage.setItem(key, JSON.stringify(configs)); return Promise.resolve({ data: configs[id].revision, error: null }); },
};
