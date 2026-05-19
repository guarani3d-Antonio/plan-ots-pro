import { supabase } from '../db/supabase';
import { useAuthStore } from '../stores/authStore';

export interface OtComentario {
  id: string;
  orden_id: string;
  proyecto_id: string;
  user_id: string | null;
  user_email: string | null;
  estado_anterior: string | null;
  estado_nuevo: string | null;
  comentario: string;
  created_at: string;
}

export interface NuevoComentario {
  orden_id: string;
  proyecto_id: string;
  estado_anterior: string | null;
  estado_nuevo: string | null;
  comentario: string;
}

export async function fetchComentariosOrden(ordenId: string): Promise<OtComentario[]> {
  const { data, error } = await supabase
    .from('ot_comentarios')
    .select('*')
    .eq('orden_id', ordenId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[comentariosService] fetchComentariosOrden:', error);
    return [];
  }
  return data ?? [];
}

// Devuelve el comentario más reciente que registra una transición específica
// (estado_anterior → estado_nuevo) para esta OT. Cadena vacía si no existe.
// Usado por el preview del Informe de Cierre para pre-llenar las observaciones
// con el comentario que el usuario escribió al cerrar la OT.
export async function fetchComentarioTransicion(
  ordenId: string,
  estadoAnterior: string,
  estadoNuevo: string,
): Promise<string> {
  const { data, error } = await supabase
    .from('ot_comentarios')
    .select('comentario')
    .eq('orden_id', ordenId)
    .eq('estado_anterior', estadoAnterior)
    .eq('estado_nuevo', estadoNuevo)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('[comentariosService] fetchComentarioTransicion:', error);
    return '';
  }
  return data?.comentario ?? '';
}

export async function crearComentario(nuevo: NuevoComentario): Promise<OtComentario | null> {
  const user = useAuthStore.getState().user;

  const { data, error } = await supabase
    .from('ot_comentarios')
    .insert({
      orden_id:        nuevo.orden_id,
      proyecto_id:     nuevo.proyecto_id,
      user_id:         user?.id ?? null,
      user_email:      user?.email ?? null,
      estado_anterior: nuevo.estado_anterior ?? null,
      estado_nuevo:    nuevo.estado_nuevo ?? null,
      comentario:      nuevo.comentario.trim(),
    })
    .select()
    .single();

  if (error) {
    console.error('[comentariosService] crearComentario:', error);
    return null;
  }
  return data;
}
