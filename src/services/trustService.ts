import { supabase } from '../db/supabase';
import { assertSession, sessionTicket } from '../security/sessionScope';

export interface Contratista { id: string; tenant_id: string; nombre: string }
export interface EventoOT {
  id: string; orden_id: string; proyecto_id: string; ot: string;
  actor_id: string | null; actor_email: string | null; tipo: string;
  cambios: Record<string, { antes: unknown; despues: unknown }>;
  created_at: string; legado: boolean; restringido: boolean; leida: boolean;
}
export interface PaginaEventos { eventos: EventoOT[]; hayMas: boolean; sinLeer: number }

export async function cargarContratistas(tenant: string): Promise<Contratista[]> {
  const ticket = sessionTicket();
  const result: Contratista[] = [];
  for (let from = 0; ; from += 500) {
    const { data, error } = await supabase.from('plan_contratistas').select('id,tenant_id,nombre')
      .eq('tenant_id', tenant).order('nombre').order('id').range(from, from + 499);
    assertSession(ticket);
    if (error) throw new Error(error.message);
    result.push(...data);
    if (data.length < 500) return result;
  }
}
export async function agregarContratistaCompartido(tenant: string, nombre: string): Promise<Contratista> {
  const ticket = sessionTicket();
  const { data, error } = await supabase.rpc('plan_agregar_contratista', { p_tenant: tenant, p_nombre: nombre.trim() });
  assertSession(ticket);
  if (error) throw new Error(error.message);
  return data as Contratista;
}
export async function cargarEventos(ordenId?: string, antes?: EventoOT): Promise<PaginaEventos> {
  const ticket = sessionTicket();
  const { data, error } = await supabase.rpc('plan_eventos_pagina', {
    p_orden: ordenId ?? null, p_antes: antes?.created_at ?? null, p_id: antes?.id ?? null,
  });
  assertSession(ticket);
  if (error) throw new Error(error.message);
  return data as PaginaEventos;
}
export async function marcarEventosLeidos(ids: string[]): Promise<void> {
  if (!ids.length) return;
  const ticket = sessionTicket();
  const { error } = await supabase.from('plan_eventos_lecturas').upsert(
    ids.map(evento_id => ({ evento_id })), { onConflict: 'evento_id,user_id', ignoreDuplicates: true },
  );
  assertSession(ticket);
  if (error) throw new Error(error.message);
}
export async function registrarExportacion(orden: string, tipo: string, formato: 'HTML' | 'PDF'): Promise<void> {
  const ticket = sessionTicket();
  const { error } = await supabase.rpc('plan_solicitar_exportacion', {
    p_orden: orden, p_tipo: tipo, p_formato: formato, p_solicitud: crypto.randomUUID(),
  });
  assertSession(ticket);
  if (error) throw new Error(`No se pudo registrar la solicitud de exportación: ${error.message}`);
}
export function tituloEvento(e: EventoOT): string {
  const titles: Record<string, string> = {
    'ordenes.insert': 'OT creada', 'ordenes.update': 'Datos de la OT actualizados', 'ordenes.delete': 'OT eliminada',
    'fotos.insert': 'Evidencia agregada', 'fotos.update': 'Evidencia editada', 'fotos.delete': 'Evidencia eliminada',
    'comentarios_ot.insert': 'Comentario agregado', 'comentarios_ot.update': 'Comentario editado', 'comentarios_ot.delete': 'Comentario eliminado',
    'ot_comentarios.insert': 'Comentario de cambio de estado', 'ot_comentarios.delete': 'Comentario de estado eliminado',
    'orden_costos.insert': 'Costo registrado', 'orden_costos.update': 'Costo actualizado', 'orden_costos.delete': 'Costo eliminado',
    'estado.legado': 'Cambio de estado anterior', 'informe.solicitado': 'Exportación solicitada',
  };
  if (e.tipo === 'ordenes.update' && e.cambios.estado) return 'Estado actualizado';
  return titles[e.tipo] ?? 'Actividad registrada';
}
