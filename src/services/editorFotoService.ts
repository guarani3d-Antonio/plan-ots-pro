// src/services/editorFotoService.ts
// S32-A — Editor de Evidencia Fotográfica
// NUEVO ARCHIVO — no toca fotosService.ts (PROHIBIDO)

import { supabase } from '../db/supabase';
import { resolverArchivo, subirArchivo } from './storageService';

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type TipoAnotacion = 'lapiz' | 'flecha' | 'circulo' | 'texto';

export interface PuntoAnotacion { x: number; y: number; }

export interface AnotacionGuardada {
  id: string;
  tipo: TipoAnotacion;
  color: string;
  puntos: PuntoAnotacion[];
  texto?: string;
  visible: boolean;
}

export interface EdicionFoto {
  anotaciones: AnotacionGuardada[];
  descripcion_observacion: string;
}

// ─── Cargar ───────────────────────────────────────────────────────────────────

export async function cargarEdicionFoto(fotoId: string): Promise<EdicionFoto> {
  const { data, error } = await supabase
    .from('fotos')
    .select('anotaciones, descripcion_observacion')
    .eq('id', fotoId)
    .single();

  if (error) {
    console.warn('cargarEdicionFoto:', error.message);
    return { anotaciones: [], descripcion_observacion: '' };
  }

  return {
    anotaciones: (data?.anotaciones as AnotacionGuardada[]) ?? [],
    descripcion_observacion: data?.descripcion_observacion ?? '',
  };
}

// ─── Guardar solo metadatos (sin imagen nueva) ────────────────────────────────

export async function guardarEdicionFoto(
  fotoId: string,
  edicion: EdicionFoto,
): Promise<void> {
  const { error } = await supabase
    .from('fotos')
    .update({
      anotaciones: edicion.anotaciones,
      descripcion_observacion: edicion.descripcion_observacion,
    })
    .eq('id', fotoId).select('id').single();

  if (error) throw new Error(`guardarEdicionFoto: ${error.message}`);
}

// ─── Subir imagen anotada (burn-in) + actualizar registro ─────────────────────

export async function subirImagenAnotada(
  fotoId: string,
  ordenId: string,
  proyectoId: string,
  blob: Blob,
  anotaciones: AnotacionGuardada[],
  descripcion: string,
): Promise<string> {
  const actual=await supabase.from('fotos').select('file_path').eq('id',fotoId).single();
  if(actual.error||!actual.data)throw new Error(actual.error?.message??'La foto ya no está disponible');
  // 1. Upload al bucket 'fotos'
  const { path, ref } = await subirArchivo('fotos', proyectoId, blob, 'jpg', ordenId);

  // 3. Actualizar registro en tabla fotos
  const { error: dbError } = await supabase
    .from('fotos')
    .update({
      file_url: ref,
      file_path: path,
      anotaciones,
      descripcion_observacion: descripcion,
    })
    .eq('id', fotoId).select('id').single();

  if (dbError) {
    const cleanup=await supabase.storage.from('fotos').remove([path]);
    throw new Error(`DB: ${dbError.message}${cleanup.error?' El archivo nuevo quedó pendiente de limpieza administrativa.':''}`);
  }

  const anterior=actual.data.file_path as string;
  if(anterior&&anterior!==path&&/^(legacy|[0-9a-f-]{36})\/[0-9a-f-]{36}\/[0-9a-f-]{36}\//.test(anterior)){
    const cleanup=await supabase.storage.from('fotos').remove([anterior]);
    if(cleanup.error)console.warn('La edición se guardó; el archivo anterior queda pendiente de limpieza administrativa');
  }

  return resolverArchivo(ref);
}
