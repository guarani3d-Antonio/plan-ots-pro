import { useEffect } from 'react';
import { supabase } from '../db/supabase';
import { useOrdenesStore } from '../stores/ordenesStore';
import type { OrdenLocal, EstadoOT, PrioridadOT } from '../types/orden';

function mapRowToOrdenLocal(row: Record<string, unknown>): OrdenLocal {
  return {
    id:                      row.id as string,
    proyecto_id:             row.proyecto_id as string,
    ot:                      row.ot as string,
    ubicacion:               (row.ubicacion as string) ?? '',
    rubro:                   (row.rubro as string) ?? '',
    estado:                  row.estado as EstadoOT,
    responsable:             (row.responsable as string) ?? '',
    prioridad:               (row.prioridad as PrioridadOT) ?? 'Media',
    pos_x:                   row.pos_x as number,
    pos_y:                   row.pos_y as number,
    plano_ref_url:           (row.plano_ref_url as string) ?? '',
    comentarios:             (row.comentarios as string) ?? '',
    campos:                  (row.campos as Record<string, unknown>) ?? {},
    created_by:              (row.created_by as string) ?? null,
    updated_by:              (row.updated_by as string) ?? null,
    created_at:              row.created_at as string,
    updated_at:              row.updated_at as string,
    _synced:                 true,
    _last_fetched:           Date.now(),
    fotos_pendientes_upload: [],
    conflict_flag:           (row.conflict_flag as boolean) ?? false,
  };
}

export function useRealtimeOrdenes(proyectoId: string | null) {
  const { agregarOActualizarOrden, eliminarOrden } = useOrdenesStore();

  useEffect(() => {
    if (!proyectoId) return;

    const channel = supabase
      .channel(`ordenes-${proyectoId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'ordenes', filter: `proyecto_id=eq.${proyectoId}` },
        (payload) => {
          agregarOActualizarOrden(mapRowToOrdenLocal(payload.new as Record<string, unknown>));
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'ordenes', filter: `proyecto_id=eq.${proyectoId}` },
        (payload) => {
          agregarOActualizarOrden(mapRowToOrdenLocal(payload.new as Record<string, unknown>));
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'ordenes', filter: `proyecto_id=eq.${proyectoId}` },
        (payload) => {
          const id = (payload.old as { id?: string }).id;
          if (id) eliminarOrden(id);
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [proyectoId, agregarOActualizarOrden, eliminarOrden]);
}