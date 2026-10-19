import type { OrdenLocal } from '../types/orden';
import type { Proyecto } from '../stores/proyectosStore';

export const STATUS_COLORS: Record<string, string> = { Pendiente: '#EF5261', 'En proceso': '#4D83E5', Cerrada: '#9BCB24', 'No aplica': '#94A3B8' };
export const PALETTE = ['#4D83E5', '#24B5A4', '#A17CE0', '#F3AC42', '#EC729D', '#67ADCE', '#9BCB24', '#D58250'];
export type ChartType = 'metric' | 'bars' | 'line' | 'pie' | 'donut' | 'table';
export interface TemporalOptions {
  grain: 'auto' | 'day' | 'week' | 'month'; series: ('ingresos' | 'cierres')[];
  points: boolean; values: boolean; grid: boolean; height: 230 | 270 | 320; description: string; area?: boolean;
}
export type GroupBy = 'estado' | 'rubro' | 'responsable' | 'contratista' | 'obra' | 'semana';
export type Condition = 'all' | 'active' | 'pending' | 'progress' | 'closed' | 'overdue';
export type Measure = 'count' | 'entities' | 'duration';
export interface DashboardBlock {
  id: string; title: string; type: ChartType; group: GroupBy; measure: Measure;
  condition: Condition; width: 3 | 6 | 12; rubro: string; colors: Record<string, string>; temporal?: TemporalOptions;
}
export interface DashboardFilters {
  project: string; rubro: string; responsible: string; contractor: string; estado: string; search: string;
  from: string; to: string; dateField: 'ingreso' | 'fin';
}
export interface ReadingOptions { limit: 3 | 6 | 12; disabled: string[]; labels: Record<string, string>; explain?: boolean }
export interface PersonalBoard { id: string; name: string; blocks: DashboardBlock[]; filters: DashboardFilters; reading?: ReadingOptions }
export interface DashboardDocument { version: 1; defaultId: string; boards: PersonalBoard[] }
export const TYPE_LABELS: Record<ChartType, string> = { metric: 'Indicador', bars: 'Barras', line: 'Líneas', pie: 'Torta', donut: 'Dona', table: 'Tabla' };
export const GROUP_LABELS: Record<GroupBy, string> = { estado: 'Estado', rubro: 'Rubro', responsable: 'Responsable', contratista: 'Contratista', obra: 'Obra', semana: 'Fecha de eventos' };
export const CONDITION_LABELS: Record<Condition, string> = { all: 'Todas', active: 'Activas', pending: 'Pendientes', progress: 'En proceso', closed: 'Cerradas', overdue: 'Fuera de plazo registrado' };
export function localDay(date = new Date()): string { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }
export function validDay(value: unknown): string {
  const day = typeof value === 'string' ? value.slice(0, 10) : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return '';
  const date = new Date(day + 'T00:00:00');
  return Number.isFinite(date.getTime()) && localDay(date) === day ? day : '';
}
export function blankFilters(): DashboardFilters { return { project: '', rubro: '', responsible: '', contractor: '', estado: '', search: '', from: '', to: '', dateField: 'ingreso' }; }
export function newBlock(): DashboardBlock { return { id: crypto.randomUUID(), title: 'OT por estado', type: 'bars', group: 'estado', measure: 'count', condition: 'all', width: 6, rubro: '', colors: {} }; }
export function createBoard(name = 'Seguimiento de obra', empty = false): PersonalBoard {
  const block = (title: string, type: ChartType, group: GroupBy, condition: Condition = 'all', measure: Measure = 'count'): DashboardBlock => ({ ...newBlock(), title, type, group, condition, measure, width: type === 'metric' ? 3 : 6 });
  return { id: crypto.randomUUID(), name, filters: blankFilters(), blocks: empty ? [] : [
    block('OT en alcance', 'metric', 'estado'), block('Pendientes', 'metric', 'estado', 'pending'),
    block('En proceso', 'metric', 'estado', 'progress'), block('Cerradas', 'metric', 'estado', 'closed'),
    block('Distribución de OT', 'donut', 'estado'), block('OT por rubro', 'bars', 'rubro'),
    { ...block('Ingresos y cierres', 'line', 'semana'), width: 12, temporal: { grain: 'auto', series: ['ingresos', 'cierres'], points: true, values: false, grid: true, height: 270, description: 'Movimiento de OT dentro del período' } }, block('Carga por responsable', 'table', 'responsable', 'active'),
  ] };
}
export function initialDocument(): DashboardDocument { const board = createBoard(); return { version: 1, defaultId: board.id, boards: [board] }; }
export function validateDocument(value: unknown): DashboardDocument {
  if (!value || typeof value !== 'object') throw Error('Configuración no válida.');
  const d = value as DashboardDocument;
  if (d.version !== 1 || !Array.isArray(d.boards) || !d.boards.length || d.boards.length > 20) throw Error('La configuración tiene una versión o cantidad de dashboards no válida.');
  const ids = new Set<string>();
  const text = (v: unknown, max: number) => typeof v === 'string' && v.length <= max;
  for (const board of d.boards) {
    if (!board || !text(board.id, 100) || ids.has(board.id) || !text(board.name, 80) || !board.name.trim() || !Array.isArray(board.blocks) || board.blocks.length > 30) throw Error('Revisá el nombre y los bloques del dashboard.');
    ids.add(board.id); const f = board.filters;
    if (board.reading !== undefined) {
      const r = board.reading;
      if (!r || ![3, 6, 12].includes(r.limit) || !Array.isArray(r.disabled) || r.disabled.length > 100 || r.disabled.some(id => !text(id, 160)) || new Set(r.disabled).size !== r.disabled.length || !r.labels || typeof r.labels !== 'object' || Array.isArray(r.labels) || Object.keys(r.labels).length > 100 || Object.entries(r.labels).some(([id, label]) => id.length > 160 || !text(label, 100)) || r.explain !== undefined && typeof r.explain !== 'boolean') throw Error('Revisá las preferencias de lectura operativa.');
    }
    if (!f || !['ingreso', 'fin'].includes(f.dateField) || ['project', 'rubro', 'responsible', 'contractor', 'estado', 'search'].some(k => !text(f[k as keyof DashboardFilters], 300)) || [f.from, f.to].some(v => v !== '' && !validDay(v)) || (f.from && f.to && f.from > f.to)) throw Error('Revisá los filtros y el intervalo de fechas.');
    const blockIds = new Set<string>();
    for (const b of board.blocks) {
      if (!b || !text(b.id, 100) || blockIds.has(b.id) || !text(b.title, 100) || !b.title.trim() || !Object.hasOwn(TYPE_LABELS, b.type) || !Object.hasOwn(GROUP_LABELS, b.group) || !Object.hasOwn(CONDITION_LABELS, b.condition) || !['count', 'entities', 'duration'].includes(b.measure) || ![3, 6, 12].includes(b.width) || !text(b.rubro, 300) || !b.colors || typeof b.colors !== 'object' || Array.isArray(b.colors) || Object.keys(b.colors).length > 100 || Object.entries(b.colors).some(([key, color]) => key.length > 400 || typeof color !== 'string' || !/^#[0-9a-f]{6}$/i.test(color))) throw Error('Hay un bloque con opciones no válidas.');
      blockIds.add(b.id);
      if (b.temporal !== undefined) {
        const t = b.temporal;
        if (!t || !['auto', 'day', 'week', 'month'].includes(t.grain) || !Array.isArray(t.series) || !t.series.length || t.series.length > 2 || new Set(t.series).size !== t.series.length || t.series.some(s => !['ingresos', 'cierres'].includes(s)) || ['points', 'values', 'grid'].some(k => typeof t[k as keyof TemporalOptions] !== 'boolean') || ![230, 270, 320].includes(t.height) || !text(t.description, 100) || t.area !== undefined && typeof t.area !== 'boolean') throw Error('Revisá las opciones del gráfico temporal.');
      }
    }
  }
  if (!ids.has(d.defaultId)) throw Error('Elegí un dashboard inicial válido.');
  return structuredClone(d);
}
export const normalized = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es');
export function projectScope(project: string, projects: Proyecto[]): Set<string> | null {
  if (!project) return null;
  const ids = new Set([project]); let previous = 0;
  while (previous !== ids.size) { previous = ids.size; for (const p of projects) if (p.proyecto_padre_id && ids.has(p.proyecto_padre_id)) ids.add(p.id); }
  return ids;
}
export function responsibleKey(o: OrdenLocal): string { return o.responsable_id ? `id:${o.responsable_id}` : `texto:${normalized(o.responsable?.trim() || 'Sin asignar')}`; }
export function contractorNames(o: OrdenLocal): string[] { return [...new Set((o.contratistas ?? []).map(v => v.trim()).filter(Boolean))]; }
export function matchesCondition(o: OrdenLocal, condition: Condition, today = localDay()): boolean {
  if (condition === 'pending') return o.estado === 'Pendiente';
  if (condition === 'progress') return o.estado === 'En proceso';
  if (condition === 'closed') return o.estado === 'Cerrada';
  if (condition === 'active') return ['Pendiente', 'En proceso'].includes(o.estado);
  if (condition === 'overdue') { const end = validDay(o.fecha_fin_trabajos); return !!end && end < today && ['Pendiente', 'En proceso'].includes(o.estado); }
  return true;
}
export function filterOrders(orders: OrdenLocal[], projects: Proyecto[], f: DashboardFilters): OrdenLocal[] {
  const ids = projectScope(f.project, projects), query = normalized(f.search.trim());
  return orders.filter(o => {
    if (ids && !ids.has(o.proyecto_id) || f.rubro && o.rubro !== f.rubro || f.estado && o.estado !== f.estado || f.responsible && responsibleKey(o) !== f.responsible || f.contractor && !contractorNames(o).includes(f.contractor)) return false;
    const day = validDay(f.dateField === 'fin' ? o.fecha_fin_trabajos : (o.fecha_ingreso || o.created_at));
    if ((f.from || f.to) && !day || f.from && day < f.from || f.to && day > f.to) return false;
    return !query || normalized([o.ot, o.descripcion, o.ubicacion, o.rubro, o.responsable, ...contractorNames(o)].filter(Boolean).join(' ')).includes(query);
  });
}
export function blockOrders(orders: OrdenLocal[], b: DashboardBlock, today = localDay()): OrdenLocal[] {
  return orders.filter(o => {
    if (!matchesCondition(o, b.condition, today) || b.rubro && o.rubro !== b.rubro) return false;
    if (b.measure === 'duration') {
      const start = validDay(o.fecha_ingreso || o.created_at), end = validDay(o.fecha_fin_trabajos);
      return o.estado === 'Cerrada' && !!start && !!end && end >= start;
    }
    if (b.measure === 'entities' && b.group === 'contratista') return contractorNames(o).length > 0;
    if (b.group === 'semana') return !!validDay(o.fecha_ingreso || o.created_at);
    return true;
  });
}
function projectGroup(id: string, projects: Proyecto[]): [string, string] {
  let p = projects.find(v => v.id === id); const seen = new Set<string>();
  while (p?.proyecto_padre_id && !p.es_ficha_obra && !seen.has(p.id)) {
    seen.add(p.id); const parent = projects.find(v => v.id === p!.proyecto_padre_id);
    if (!parent) break; p = parent;
  }
  return [p?.id ?? id, p?.nombre ?? 'Obra'];
}
function weekKey(o: OrdenLocal): string {
  const day = validDay(o.fecha_ingreso || o.created_at); if (!day) return '';
  const monday = new Date(day + 'T00:00:00'); monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7)); return localDay(monday);
}
export interface DashboardGroup { key: string; label: string; orders: OrdenLocal[]; value: number | null; sample: number }
export function measureOrders(orders: OrdenLocal[], b: DashboardBlock, projects: Proyecto[] = []): { value: number | null; sample: number } {
  if (b.measure === 'entities') {
    const keys = orders.flatMap(o => b.group === 'contratista' ? contractorNames(o) : b.group === 'responsable' ? [responsibleKey(o)] : b.group === 'rubro' ? [o.rubro || 'Sin rubro'] : b.group === 'obra' ? [projectGroup(o.proyecto_id, projects)[0]] : b.group === 'semana' ? [weekKey(o)] : [o.estado]);
    return { value: new Set(keys.filter(Boolean)).size, sample: orders.length };
  }
  if (b.measure === 'duration') {
    const durations = orders.filter(o => o.estado === 'Cerrada').flatMap(o => {
      const start = validDay(o.fecha_ingreso || o.created_at), end = validDay(o.fecha_fin_trabajos);
      if (!start || !end || end < start) return [];
      // UTC arithmetic on already validated local date components avoids DST-length days.
      return [(Date.parse(end + 'T00:00:00Z') - Date.parse(start + 'T00:00:00Z')) / 86400000 + 1];
    });
    return { value: durations.length ? Math.round(durations.reduce((s, n) => s + n, 0) / durations.length * 10) / 10 : null, sample: durations.length };
  }
  return { value: orders.length, sample: orders.length };
}
export function groupOrders(orders: OrdenLocal[], projects: Proyecto[], b: DashboardBlock): DashboardGroup[] {
  const map = new Map<string, DashboardGroup>();
  for (const o of orders) {
    let entries: [string, string][];
    switch (b.group) {
      case 'responsable': entries = [[responsibleKey(o), o.responsable?.trim() || 'Sin asignar']]; break;
      case 'contratista': entries = contractorNames(o).map(n => [n, n]); if (!entries.length) entries = [['Sin asignar', 'Sin asignar']]; break;
      case 'obra': entries = [projectGroup(o.proyecto_id, projects)]; break;
      case 'semana': {
        const key = weekKey(o); if (!key) { entries = []; break; }
        entries = [[key, key.slice(8) + '/' + key.slice(5, 7) + '/' + key.slice(0, 4)]]; break;
      }
      default: { const value = o[b.group] || 'Sin dato'; entries = [[value, value]]; }
    }
    for (const [key, label] of entries) { const row = map.get(key) ?? { key, label, orders: [], value: 0, sample: 0 }; row.orders.push(o); map.set(key, row); }
  }
  const rows = [...map.values()].map(row => ({ ...row, ...measureOrders(row.orders, b, projects) }));
  return rows.sort((a, z) => b.group === 'semana' ? a.key.localeCompare(z.key) : (z.value ?? -1) - (a.value ?? -1) || a.label.localeCompare(z.label, 'es'));
}
export function groupColor(b: DashboardBlock, key: string, _index = 0): string {
  const own = (map: Record<string, string>, k: string) => Object.hasOwn(map, k) ? map[k] : undefined;
  const hash = [...key].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 0);
  return own(b.colors, key) ?? (b.group === 'estado' ? own(STATUS_COLORS, key) : undefined) ?? own(b.colors, 'accent') ?? (b.group === 'semana' ? PALETTE[0] : PALETTE[hash % PALETTE.length]);
}
