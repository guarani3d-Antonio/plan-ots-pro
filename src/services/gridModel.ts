import { diasAbierto } from '../utils/calculos';

export const GRID_PAGE_SIZE = 75;
export const GRID_GROUP_FIELDS = new Set(['empresa_nombre','obra_proyecto','plano_nombre','obra','estado','rubro','nivel_riesgo','responsable','prioridad']);
const collator = new Intl.Collator('es', { numeric: true, sensitivity: 'base' });
export function normalizarBusqueda(value: unknown): string {
  if (Array.isArray(value)) return value.map(normalizarBusqueda).join(' ');
  if (value && typeof value === 'object') return Object.values(value).map(normalizarBusqueda).join(' ');
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es').trim().replace(/\s+/g, ' ');
}
export function diasOrden(o: { estado: string; fecha_ingreso?: string; created_at?: string; fecha_fin_trabajos?: string }): number {
  return diasAbierto(o.fecha_ingreso || o.created_at, ['Cerrada','No aplica'].includes(o.estado) ? o.fecha_fin_trabajos : undefined);
}
export function compararValores(a: unknown, b: unknown): number {
  const empty = (v: unknown) => v === null || v === undefined || v === '';
  if (empty(a) || empty(b)) return empty(a) === empty(b) ? 0 : empty(a) ? 1 : -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'boolean' && typeof b === 'boolean') return Number(a) - Number(b);
  return collator.compare(Array.isArray(a) ? a.join(', ') : String(a), Array.isArray(b) ? b.join(', ') : String(b));
}
export function agruparOrdenes<T extends object>(items: T[], key: string): [string, T[]][] {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const value = item[key as keyof T];
    const label = value == null || value === '' ? '— Sin valor —' : String(value);
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label)!.push(item);
  }
  return [...groups].sort(([a],[b]) => collator.compare(a,b));
}
export function paginaGrilla<T>(items: T[], requested: number) {
  const total = Math.max(1, Math.ceil(items.length / GRID_PAGE_SIZE));
  const page = Math.max(1, Math.min(total, Math.floor(requested) || 1));
  return { page, total, items: items.slice((page - 1) * GRID_PAGE_SIZE, page * GRID_PAGE_SIZE) };
}
