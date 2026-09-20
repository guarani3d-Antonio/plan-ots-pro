import { useEffect } from 'react';
import { supabase } from '../db/supabase';
import { useOrdenesStore } from '../stores/ordenesStore';
import { rowToOrden } from '../data/ordenMapper';

export function useRealtimeOrdenes(proyectoId: string | null) {
  const { agregarOActualizarOrden, aplicarEliminacionRemota } = useOrdenesStore();

  useEffect(() => {
    if (!proyectoId) return;

    const channel = supabase
      .channel(`ordenes-${proyectoId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'ordenes', filter: `proyecto_id=eq.${proyectoId}` },
        (payload) => {
          agregarOActualizarOrden(rowToOrden(payload.new as Record<string, unknown>));
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'ordenes', filter: `proyecto_id=eq.${proyectoId}` },
        (payload) => {
          agregarOActualizarOrden(rowToOrden(payload.new as Record<string, unknown>));
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'ordenes', filter: `proyecto_id=eq.${proyectoId}` },
        (payload) => {
          const id = (payload.old as { id?: string }).id;
          if (id) aplicarEliminacionRemota(id);
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [proyectoId, agregarOActualizarOrden, aplicarEliminacionRemota]);
}
