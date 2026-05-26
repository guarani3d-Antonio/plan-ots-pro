// src/services/editorFotoService.ts
// S32-A — Editor de Evidencia Fotográfica
// NUEVO ARCHIVO — no toca fotosService.ts (PROHIBIDO)

import { supabase } from '../db/supabase';

// ─── Tipos exportados ────────────────────────────────────────────────────────

export type TipoAnotacion = 'lapiz' | 'flecha' | 'circulo' | 'texto';

export interface PuntoAnotacion {
  x: number;
  y: number;
}

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

// ─── API ─────────────────────────────────────────────────────────────────────

/**
 * Carga las anotaciones y descripción guardadas para una foto.
 * Retorna valores vacíos si no hay datos (primera vez que se abre).
 */
export async function cargarEdicionFoto(fotoId: string): Promise<EdicionFoto> {
  const { data, error } = await supabase
    .from('fotos')
    .select('anotaciones, descripcion_observacion')
    .eq('id', fotoId)
    .single();

  if (error) {
    // La foto existe pero las columnas pueden ser null (primera vez)
    console.warn('cargarEdicionFoto:', error.message);
    return { anotaciones: [], descripcion_observacion: '' };
  }

  return {
    anotaciones: (data?.anotaciones as AnotacionGuardada[]) ?? [],
    descripcion_observacion: data?.descripcion_observacion ?? '',
  };
}

/**
 * Persiste las anotaciones vectoriales y la descripción de observación.
 * No modifica ningún otro campo de la foto.
 */
export async function guardarEdicionFoto(
  fotoId: string,
  edicion: EdicionFoto
): Promise<void> {
  const { error } = await supabase
    .from('fotos')
    .update({
      anotaciones: edicion.anotaciones,
      descripcion_observacion: edicion.descripcion_observacion,
    })
    .eq('id', fotoId);

  if (error) throw new Error(`guardarEdicionFoto: ${error.message}`);
}