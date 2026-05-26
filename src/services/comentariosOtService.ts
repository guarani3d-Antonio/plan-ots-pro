import { supabase } from '../db/supabase';

export interface Comentario {
  id: string;
  orden_id: string;
  proyecto_id: string;
  user_id: string;
  user_name: string;
  texto: string;
  created_at: string;
}

export async function obtenerComentarios(ordenId: string): Promise<Comentario[]> {
  const { data, error } = await supabase
    .from('comentarios_ot')
    .select('*')
    .eq('orden_id', ordenId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function crearComentario(params: {
  orden_id: string;
  proyecto_id: string;
  user_id: string;
  user_name: string;
  texto: string;
}): Promise<Comentario> {
  const { data, error } = await supabase
    .from('comentarios_ot')
    .insert(params)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function eliminarComentario(id: string): Promise<void> {
  const { error } = await supabase
    .from('comentarios_ot')
    .delete()
    .eq('id', id);
  if (error) throw error;
}
