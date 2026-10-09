import { supabase } from '../db/supabase';
import { assertSession, sessionTicket } from '../security/sessionScope';
import { ORDEN_SELECT, rowToOrden } from '../data/ordenMapper';
import type { Proyecto } from '../stores/proyectosStore';

// El dashboard tiene su propia consulta. Los stores del plano y de Proyectos
// cambian de alcance al navegar y no son una fuente de totales globales.
export async function loadDashboardData() {
  const ticket = sessionTicket();
  const pageSize = 1000;
  async function allPages<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>) {
    const rows: T[] = [];
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await page(from, from + pageSize - 1);
      assertSession(ticket);
      if (error) throw new Error(error.message);
      rows.push(...(data ?? []));
      if ((data?.length ?? 0) < pageSize) return rows;
    }
  }
  // Ambas consultas conservan las políticas RLS de la cuenta autenticada.
  const [proyectos, rows] = await Promise.all([
    allPages<Proyecto>((from, to) => supabase.from('proyectos').select('*').is('deleted_at', null).order('id').range(from, to)),
    allPages((from, to) => supabase.from('ordenes').select(ORDEN_SELECT).is('deleted_at', null).order('id').range(from, to)),
  ]);
  const projectIds = new Set(proyectos.map(p => p.id));
  const ordenes = rows.map(rowToOrden).filter(o => projectIds.has(o.proyecto_id));
  return { proyectos, ordenes };
}
