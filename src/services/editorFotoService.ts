import { supabase } from '../db/supabase';
import { subirArchivo } from './storageService';
import { assertSession, sessionTicket } from '../security/sessionScope';

export type TipoAnotacion = 'lapiz' | 'flecha' | 'circulo' | 'texto';
export interface PuntoAnotacion { x: number; y: number }
export interface AnotacionGuardada { id: string; tipo: TipoAnotacion; color: string; puntos: PuntoAnotacion[]; texto?: string; visible: boolean }
export interface AjustesFoto { espacio: 'ancho1000'; brillo: number; contraste: number }
export interface EdicionFoto {
  anotaciones: AnotacionGuardada[];
  descripcion: string;
  original: string;
  revision: number;
  ajustes: AjustesFoto;
  marcasAnterioresIntegradas: boolean;
}
export async function cargarEdicionFoto(fotoId: string): Promise<EdicionFoto> {
  const ticket = sessionTicket();
  const [{ data, error }, original] = await Promise.all([
    supabase.from('fotos').select('anotaciones,descripcion,edicion,revision').eq('id',fotoId).single(),
    supabase.from('plan_foto_originales').select('file_url').eq('foto_id',fotoId).single(),
  ]);
  assertSession(ticket);
  if (error || original.error || !data || !original.data) throw new Error(error?.message ?? original.error?.message ?? 'No se pudo recuperar el original.');
  const editable = data.edicion?.espacio === 'ancho1000';
  return {
    anotaciones: editable ? data.anotaciones ?? [] : [],
    descripcion: data.descripcion ?? '', original: original.data.file_url, revision: data.revision,
    ajustes: { espacio:'ancho1000', brillo: editable ? data.edicion.brillo ?? 0 : 0, contraste: editable ? data.edicion.contraste ?? 0 : 0 },
    marcasAnterioresIntegradas: !editable && (data.anotaciones?.length ?? 0) > 0,
  };
}
export async function subirImagenAnotada(
  fotoId: string, ordenId: string, proyectoId: string, blob: Blob,
  anotaciones: AnotacionGuardada[], descripcion: string, ajustes: AjustesFoto, revision: number,
): Promise<number> {
  const ticket = sessionTicket();
  const {path, ref} = await subirArchivo('fotos',proyectoId,blob,'jpg',ordenId);
  assertSession(ticket);
  const {data,error} = await supabase.from('fotos').update({
    file_url:ref,file_path:path,anotaciones,descripcion,descripcion_observacion:descripcion,edicion:ajustes,
  }).eq('id',fotoId).eq('revision',revision).select('revision').maybeSingle();
  assertSession(ticket);
  if (error || !data) {
    // A lost response can occur after the update committed. Never delete a file
    // on an ambiguous network/server error: it may already be the saved image.
    const cleanup = !error ? await supabase.storage.from('fotos').remove([path]) : null;
    throw new Error((error?.message ?? 'La foto cambió en otra sesión. Cerrá y volvé a abrirla antes de guardar.') + (cleanup?.error ? ' La copia nueva requiere limpieza administrativa.' : ''));
  }
  // Never delete the original or an earlier derivative from this save path.
  return data.revision;
}
