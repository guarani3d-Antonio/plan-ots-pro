import { supabase } from '../db/supabase';
import { assertSession, identityId, sessionTicket } from '../security/sessionScope';
import { initialDocument, validateDocument, type DashboardDocument } from './personalDashboardModel';

export interface PersonalDashboardState { document: DashboardDocument; revision: number }
function requireOwner(userId: string): number {
  const ticket = sessionTicket();
  if (identityId() !== userId) throw Error('La cuenta cambió. Volvé a abrir tus dashboards.');
  return ticket;
}
export async function loadPersonalDashboards(userId: string): Promise<PersonalDashboardState> {
  const ticket = requireOwner(userId);
  const { data, error } = await supabase.from('plan_dashboards_personales').select('config,revision').eq('user_id', userId).maybeSingle();
  assertSession(ticket);
  if (error) throw Error('No se pudieron cargar tus dashboards personales. Volvé a intentar.');
  return data ? { document: validateDocument(data.config), revision: Number(data.revision) } : { document: initialDocument(), revision: 0 };
}
export async function savePersonalDashboards(userId: string, document: DashboardDocument, revision: number): Promise<PersonalDashboardState> {
  const config = validateDocument(document), ticket = requireOwner(userId);
  const { data, error } = await supabase.rpc('plan_guardar_dashboards_personales', { p_config: config, p_revision: revision });
  assertSession(ticket);
  if (error) {
    if (error.message.includes('DASHBOARD_CONFLICT')) throw Error('Tus dashboards cambiaron en otra ventana. Conservá esta ventana abierta y volvé a cargar la versión guardada antes de reemplazarla.');
    throw Error('No se pudo guardar. Tus cambios siguen en esta ventana; revisá la conexión y reintentá.');
  }
  return { document: config, revision: Number(data) };
}
