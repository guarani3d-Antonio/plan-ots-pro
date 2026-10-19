// Solo pruebas: sustituye el transporte completo. Nunca contiene credenciales.
import { supabase as base } from './qa-grid-local-mock';
import { identityId } from '../src/security/sessionScope';
import { validateDocument } from '../src/services/personalDashboardModel';
type Saved = { config: unknown; revision: number };
const key = 'qa-personal-dashboards-ficticios-v1';
let configs: Record<string, Saved> = JSON.parse(localStorage.getItem(key) || '{}');
let failNext = false;
export function simulateFailure() { failNext = true; }
export function simulateConflict() {
  const id = identityId()!;
  if (configs[id]) { configs[id].revision++; localStorage.setItem(key, JSON.stringify(configs)); }
}
export const supabase: typeof base = {
 ...base,
 from(name: string) {
  if (name !== 'plan_dashboards_personales') return base.from(name);
  let requested = '';
  return { select() { return this; }, eq(_column: string, id: string) { requested = id; return this; }, async maybeSingle() {
   if (requested !== identityId()) throw Error('Aislamiento ficticio');
   return { data: structuredClone(configs[requested] ?? null), error: null };
  }};
 },
 rpc(name: string, args: Record<string, unknown> = {}) {
  if (name !== 'plan_guardar_dashboards_personales') return base.rpc(name, args);
  const id = identityId()!;
  if (failNext) { failNext = false; return Promise.resolve({ data: null, error: { message: 'Fallo de conexión ficticio' } }); }
  if ((configs[id]?.revision ?? 0) !== args.p_revision) return Promise.resolve({ data: null, error: { message: 'DASHBOARD_CONFLICT' } });
  const config = validateDocument(args.p_config), revision = Number(args.p_revision) + 1;
  configs = { ...configs, [id]: { config, revision } }; localStorage.setItem(key, JSON.stringify(configs));
  return Promise.resolve({ data: revision, error: null });
 },
};
