import { supabase } from '../db/supabase';
import { assertSession, sessionTicket } from '../security/sessionScope';
import { ORDEN_SELECT, rowToOrden } from '../data/ordenMapper';
import type { Proyecto } from '../stores/proyectosStore';
import { leerPaginas } from './paginatedRead';

// El dashboard tiene su propia consulta. Los stores del plano y de Proyectos
// cambian de alcance al navegar y no son una fuente de totales globales.
export async function loadDashboardData() {
  const ticket = sessionTicket();
  // Ambas consultas conservan las políticas RLS de la cuenta autenticada.
  const [proyectos, rows] = await Promise.all([
    leerPaginas<Proyecto>((from, to) => supabase.from('proyectos').select('*', { count: 'exact' }).is('deleted_at', null).order('id').range(from, to), () => assertSession(ticket)),
    leerPaginas((from, to) => supabase.from('ordenes').select(ORDEN_SELECT, { count: 'exact' }).is('deleted_at', null).order('id').range(from, to), () => assertSession(ticket)),
  ]);
  const projectIds = new Set(proyectos.map(p => p.id));
  const ordenes = rows.map(rowToOrden).filter(o => projectIds.has(o.proyecto_id));
  return { proyectos, ordenes };
}

// Invalidate and refetch through RLS; never merge event payloads into the global scope.
export function watchDashboardData(onChange: () => void): () => void {
  const ticket = sessionTicket();
  let stopped = false, timer: ReturnType<typeof setTimeout> | undefined;
  const invalidate = () => {
    if (stopped) return;
    try { assertSession(ticket); } catch { return; }
    clearTimeout(timer); timer = setTimeout(() => { if (!stopped) onChange(); }, 400);
  };
  const channel = supabase.channel('dashboard-read-' + crypto.randomUUID())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'ordenes' }, invalidate)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'proyectos' }, invalidate).subscribe();
  return () => { stopped = true; clearTimeout(timer); void supabase.removeChannel(channel); };
}
