import type { OrdenLocal } from '../types/orden';
import type { Proyecto } from '../stores/proyectosStore';
import { blockOrders, filterOrders, groupOrders, measureOrders, localDay, normalized, validDay, newBlock, type DashboardBlock, type DashboardFilters, type TemporalOptions, type PersonalBoard, type ReadingOptions } from './personalDashboardModel';

export const EVENT_LABELS = { ingresos: 'Ingresadas', cierres: 'Cerradas · fin registrado' };
export type EventKey = keyof typeof EVENT_LABELS;
export const temporalOptions = (b: DashboardBlock): TemporalOptions => b.temporal ?? { grain: 'week', series: ['ingresos'], points: true, values: false, grid: true, height: 270, description: 'Ingresos de OT' };
export const isTemporal = (b: DashboardBlock) => b.group === 'semana' && b.measure === 'count' && ['line', 'bars'].includes(b.type);
export function ingreso(o: OrdenLocal): string { return validDay(o.fecha_ingreso || o.created_at); }
export function cierre(o: OrdenLocal): string {
  const end = validDay(o.fecha_fin_trabajos), start = ingreso(o);
  return o.estado === 'Cerrada' && end && (!start || end >= start) ? end : '';
}
export function addDays(value: string, n: number): string { const d = new Date(value + 'T00:00:00'); d.setDate(d.getDate() + n); return localDay(d); }
export const shortDate = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('es-PY', { day: '2-digit', month: '2-digit' });
export const fullDate = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('es-PY', { day: 'numeric', month: 'short', year: 'numeric' });
export function eventPool(orders: OrdenLocal[], projects: Proyecto[], f: DashboardFilters): OrdenLocal[] {
  return filterOrders(orders, projects, { ...f, from: '', to: '' });
}
export interface TemporalBucket { key: string; from: string; to: string; ingresos: OrdenLocal[]; cierres: OrdenLocal[] }
export function temporalData(orders: OrdenLocal[], projects: Proyecto[], f: DashboardFilters, b: DashboardBlock, today = localDay()) {
  const pool = eventPool(orders, projects, f).filter(o => (!b.rubro || o.rubro === b.rubro));
  // Missing ingress must not hide a verifiable closure. Do not borrow updated_at as an event date.
  const source = blockOrders(pool, { ...b, group: 'estado' }, today), options = temporalOptions(b);
  const dates = source.flatMap(o => options.series.map(s => s === 'ingresos' ? ingreso(o) : cierre(o))).filter(Boolean).sort();
  const first = dates[0] || f.to || today;
  const from = f.from || (f.to && first > f.to ? f.to : first);
  const to = f.to || [today, dates.at(-1) || '', from].sort().at(-1)!;
  const days = (Date.parse(to + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z')) / 86400000 + 1;
  const grain = options.grain === 'auto' ? days <= 45 ? 'day' : days <= 370 ? 'week' : 'month' : options.grain;
  let error = !validDay(from) || !validDay(to) || from > to ? 'Elegí una fecha desde anterior o igual a hasta.' : '';
  const start = new Date(from + 'T00:00:00');
  if (grain === 'week') start.setDate(start.getDate() - (start.getDay() + 6) % 7);
  if (grain === 'month') start.setDate(1);
  const buckets: TemporalBucket[] = [];
  if (!error) for (let key = localDay(start); key <= to;) {
    if (buckets.length >= 730) { error = 'El intervalo tiene demasiados puntos. Elegí semanas, meses o agrupación automática.'; break; }
    const next = new Date(key + 'T00:00:00');
    if (grain === 'month') next.setMonth(next.getMonth() + 1); else next.setDate(next.getDate() + (grain === 'week' ? 7 : 1));
    const nextKey = localDay(next);
    buckets.push({ key, from: key < from ? from : key, to: addDays(nextKey, -1) > to ? to : addDays(nextKey, -1), ingresos: [], cierres: [] }); key = nextKey;
  }
  if (!error) {
    const byKey = new Map(buckets.map(bucket => [bucket.key, bucket]));
    for (const o of source) for (const s of options.series) {
      const event = s === 'ingresos' ? ingreso(o) : cierre(o); if (!event || event < from || event > to) continue;
      const date = new Date(event + 'T00:00:00'); if (grain === 'week') date.setDate(date.getDate() - (date.getDay() + 6) % 7); if (grain === 'month') date.setDate(1);
      byKey.get(localDay(date))?.[s].push(o);
    }
  }
  return { buckets: error ? [] : buckets, from, to, grain, error, source, missingIn: source.filter(o => !ingreso(o)).length, missingOut: source.filter(o => o.estado === 'Cerrada' && !cierre(o)).length };
}
export function uniqueEvents(buckets: TemporalBucket[], series: EventKey[]): OrdenLocal[] {
  return [...new Map(buckets.flatMap(b => series.flatMap(s => b[s])).map(o => [o.id, o])).values()];
}
export interface OperationalSignal { id: string; title: string; detail: string; reason: string; orders: OrdenLocal[]; tone: 'danger' | 'warning' | 'info' | 'success' }
export function operationalSignals(orders: OrdenLocal[], projects: Proyecto[], filters: DashboardFilters, today = localDay()): OperationalSignal[] {
  const rows = filterOrders(orders, projects, filters), active = rows.filter(o => ['Pendiente', 'En proceso'].includes(o.estado));
  const risky = active.filter(o => ['Alto', 'Extremo'].includes(o.nivel_riesgo || '')), missing = active.filter(o => !o.responsable_id && !o.responsable?.trim()), undated = rows.filter(o => o.estado === 'Cerrada' && !cierre(o));
  const signals: OperationalSignal[] = [];
  if (risky.length) signals.push({ id: 'risk', title: `${risky.length} OT activas con riesgo alto o extremo`, detail: 'Revisar riesgo y atención asignada', orders: risky, tone: 'danger', reason: 'Estado actual Pendiente o En proceso y nivel de riesgo Alto o Extremo. Corresponde a las OT y fechas filtradas; no es una predicción.' });
  if (missing.length) signals.push({ id: 'person', title: `${missing.length} OT activas sin responsable`, detail: 'Revisar su asignación', orders: missing, tone: 'warning', reason: 'OT actualmente activa sin cuenta responsable ni nombre registrado. Se respeta el alcance completo de los filtros.' });
  if (undated.length) signals.push({ id: 'date', title: `${undated.length} cerradas sin fin válido`, detail: 'Completar o revisar las fechas', orders: undated, tone: 'warning', reason: 'Estado Cerrada y fin registrado ausente, inválido o anterior al ingreso. Se excluyen de la serie de cierres; nunca se usa updated_at como fecha de cierre.' });
  const temporal = temporalData(orders, projects, filters, { ...newBlock(), group: 'semana', temporal: { ...temporalOptions(newBlock()), series: ['ingresos', 'cierres'] } }, today);
  const ins = temporal.buckets.reduce((n, b) => n + b.ingresos.length, 0), outs = temporal.buckets.reduce((n, b) => n + b.cierres.length, 0);
  const delta = ins - outs;
  if (!temporal.error) signals.push({ id: 'flow', title: ins + outs === 0 ? 'Sin movimientos fechados en el período' : delta > 0 ? 'Ingresan más OT de las que cierran' : delta < 0 ? 'Más cierres registrados que ingresos' : 'Ingresos y cierres equilibrados', detail: `${ins} ingresos · ${outs} cierres → ver fundamento`, tone: delta > 0 ? 'info' : 'success', orders: uniqueEvents(temporal.buckets, ['ingresos', 'cierres']), reason: `Entre ${fullDate(temporal.from)} y ${fullDate(temporal.to)} inclusive: ${ins} ingresos y ${outs} cierres con fin válido. Cada serie usa su propia fecha; el selector de referencia de las demás tarjetas no cambia estos eventos. El saldo no prueba calidad, plazos ni cumplimiento.` });
  if (!signals.length) signals.push({ id: 'empty', title: 'Sin OT para este alcance', detail: 'Revisar filtros y fechas', orders: [], tone: 'info', reason: 'No hay OT coincidentes. Esto no permite concluir que la operación esté sin problemas.' });
  return signals;
}
export const READING_TOPICS = { risk: 'Riesgo registrado', person: 'Asignación de responsables', date: 'Calidad de fechas de cierre', flow: 'Ingresos frente a cierres', priority: 'Prioridad alta pendiente de atención', contractor: 'Contratistas en trabajos activos' };
export function readingOptions(board: PersonalBoard): ReadingOptions { return board.reading ?? { limit: 6, disabled: board.blocks.filter(b => b.type === 'metric').map(b => 'block:' + b.id), labels: {} }; }
export function readingCatalog(board: PersonalBoard) { return [...Object.entries(READING_TOPICS).map(([id, label]) => ({ id, label })), ...board.blocks.map(b => ({ id: 'block:' + b.id, label: b.title }))]; }
export function dashboardReadings(orders: OrdenLocal[], projects: Proyecto[], board: PersonalBoard, today = localDay()): OperationalSignal[] {
  const rows = filterOrders(orders, projects, board.filters), active = rows.filter(o => ['Pendiente', 'En proceso'].includes(o.estado));
  const signals = operationalSignals(orders, projects, board.filters, today).filter(s => s.id !== 'empty');
  const highest = active.filter(o => o.prioridad === 'Alta'), noContractor = active.filter(o => !(o.contratistas ?? []).some(n => n.trim()));
  if (highest.length) signals.push({ id: 'priority', title: `${highest.length} activas con prioridad alta`, detail: 'Revisar atención y distribución de carga', reason: 'OT filtradas actualmente Pendiente o En proceso con prioridad Alta. No se infiere una fecha comprometida ni un incumplimiento.', orders: highest, tone: 'warning' });
  if (noContractor.length) signals.push({ id: 'contractor', title: `${noContractor.length} activas sin contratista vinculado`, detail: 'Revisar si requieren contratación o atención interna', reason: 'No hay nombres de contratistas vinculados en la OT. Puede corresponder a trabajo interno; no se considera por sí solo una falta.', orders: noContractor, tone: 'info' });
  for (const b of board.blocks) {
    const id = 'block:' + b.id;
    if (isTemporal(b)) {
      const data = temporalData(orders, projects, board.filters, b, today), series = temporalOptions(b).series;
      if (data.error) { signals.push({ id, title: b.title, detail: data.error, reason: data.error, orders: [], tone: 'info' }); continue; }
      const counts = series.map(s => `${data.buckets.reduce((n, bucket) => n + bucket[s].length, 0)} ${s === 'ingresos' ? 'ingresos' : 'cierres con fin válido'}`).join(' · ');
      const incoming = data.buckets.reduce((n, bucket) => n + bucket.ingresos.length, 0), outgoing = data.buckets.reduce((n, bucket) => n + bucket.cierres.length, 0);
      const review = series.length === 2 && incoming > outgoing ? 'Conviene revisar la carga que queda abierta.' : 'Abrí el detalle para revisar los movimientos.';
      signals.push({ id, title: b.title, detail: counts, orders: uniqueEvents(data.buckets, series), tone: 'info', reason: `${counts}, entre ${fullDate(data.from)} y ${fullDate(data.to)}, inclusive. Cada serie aplica su propia fecha de evento y el filtro del bloque. ${review} El saldo no mide por sí solo calidad ni cumplimiento. ${data.missingOut} cerradas del alcance sin fin válido quedan fuera de la serie de cierres.` }); continue;
    }
    const source = blockOrders(rows, b, today), groups = groupOrders(source, projects, b), metric = measureOrders(source, b, projects), top = groups[0];
    let detail: string;
    if (metric.value === null) detail = 'Sin fechas válidas para calcular esta medida';
    else if (b.measure === 'duration') detail = `${metric.value.toLocaleString('es-PY')} días registrados en promedio · ${metric.sample} cerradas válidas`;
    else if (b.measure === 'entities') detail = `${metric.value} categorías distintas · ${source.length} OT únicas`;
    else detail = b.type !== 'metric' && top ? `${top.label}: ${top.value ?? 'sin dato'} · ${source.length} OT únicas en el bloque` : `${source.length} OT únicas en el bloque`;
    let reason = `${b.title}. Se aplican la obra, fechas, filtros generales, condición y rubro propios del bloque. ${detail}.`;
    if (b.measure === 'duration') reason += ' Ingreso a fin registrado, ambos días incluidos; no acredita horas trabajadas ni ejecución.';
    else if (b.group === 'contratista') reason += ' Una OT puede tener varios contratistas; las asignaciones no se suman como OT distintas. Revisar su carga antes de asignar nuevos trabajos.';
    else if (b.condition === 'active' && b.group === 'responsable') reason += ' Revisar la distribución de carga y los trabajos sin asignación; la cantidad no califica el desempeño.';
    else if (b.condition === 'pending') reason += ' Revisar prioridad, riesgo y atención asignada antes de decidir el orden de trabajo.';
    else if (top && source.length) reason += ` ${top.label} encabeza los grupos por la medida elegida; conviene abrir sus registros para conocer las causas.`;
    else if (!source.length) reason += ' La ausencia de coincidencias no demuestra ausencia de problemas; revisá los filtros.';
    signals.push({ id, title: b.title, detail, reason, orders: source, tone: 'info' });
  }
  const disabled = new Set(readingOptions(board).disabled);
  return signals.filter(s => !disabled.has(s.id));
}
// Assisted creation is local and bounded. No model response, SQL or record mutation is executed.
export function proposeTemporalBlock(prompt: string, original?: DashboardBlock): DashboardBlock {
  const text = normalized(prompt.trim());
  if (!text || !/(ingres|cierr|cierre|barra|linea|area|diari|seman|mensual|\bmes\b|\bdia\b)/.test(text) || /\b(borrar|eliminar|enviar|publicar|sql)\b/.test(text)) throw Error('Puedo preparar ingresos y cierres en líneas, barras o áreas por día, semana o mes. Probá uno de los ejemplos.');
  const b = original ? structuredClone(original) : { ...newBlock(), width: 12 as const };
  const series: EventKey[] = /(solo|unicamente|solamente).*cierr|(solo|unicamente|solamente).*cierre/.test(text) ? ['cierres'] : /(solo|unicamente|solamente).*ingres/.test(text) ? ['ingresos'] : ['ingresos', 'cierres'];
  return { ...b, title: series.length === 2 ? 'Ingresos y cierres' : series[0] === 'cierres' ? 'Cierres registrados' : 'Ingresos de OT', group: 'semana', measure: 'count', condition: 'all', type: /barra/.test(text) ? 'bars' : 'line', temporal: { ...temporalOptions(b), series, area: /area/.test(text), grain: /mensual|\bmes\b/.test(text) ? 'month' : /diari|\bdia\b/.test(text) ? 'day' : /seman/.test(text) ? 'week' : 'auto', description: 'Movimiento de OT dentro del período' } };
}
