// src/services/fotosService.ts
import { supabase } from '../db/supabase';

export type CategoriaFoto = 'ANTES' | 'DURANTE' | 'DESPUES' | 'ADJUNTO';

export interface FotoSubida {
  url:         string;
  path:        string;
  categoria:   CategoriaFoto;
  orden_id:    string;
  proyecto_id: string;
  file_type:   string;
  nombre:      string;
  descripcion?: string | null;
}

// ─── Subir archivo a Storage ──────────────────────────────────────────────────
export async function subirFoto(
  file:      File,
  ordenId:   string,
  categoria: CategoriaFoto
): Promise<Omit<FotoSubida, 'proyecto_id'>> {

  if (!file.type.startsWith('image/')) {
    throw new Error('Solo se permiten imágenes (JPG, PNG, WEBP)');
  }
  if (file.size > 10 * 1024 * 1024) {
    throw new Error('La imagen no puede superar 10 MB');
  }

  const ext       = file.name.split('.').pop() ?? 'jpg';
  const timestamp = Date.now();
  const path      = `${ordenId}/${categoria}/${timestamp}.${ext}`;

  const { error } = await supabase.storage
    .from('fotos')
    .upload(path, file, { cacheControl: '3600', upsert: false });

  if (error) throw new Error(`Error al subir foto: ${error.message}`);

  const { data } = supabase.storage.from('fotos').getPublicUrl(path);

  return {
    url:      data.publicUrl,
    path,
    categoria,
    orden_id:  ordenId,
    file_type: file.type,
    nombre:    file.name,
  };
}

// ─── Eliminar foto de Storage + DB ──────────────────────────────────────────
export async function eliminarFoto(id: string, path: string): Promise<void> {
  // 1. Borrar archivo de Storage
  const { error: storageError } = await supabase.storage.from('fotos').remove([path]);
  if (storageError) throw new Error(`Error al eliminar foto de Storage: ${storageError.message}`);

  // 2. Borrar registro de la tabla fotos
  const { error: dbError } = await supabase.from('fotos').delete().eq('id', id);
  if (dbError) throw new Error(`Error al eliminar foto de DB: ${dbError.message}`);
}

// ─── Registrar foto en tabla fotos ────────────────────────────────────────────
export async function registrarFotoEnDB(foto: FotoSubida): Promise<string> {
  const fileTypeBD = foto.file_type.startsWith('video/') ? 'video'
                 : foto.file_type.startsWith('image/') ? 'imagen'  // ← 'foto' → 'imagen'
                 : foto.file_type === 'application/pdf' ? 'pdf'
                 : 'imagen';

  const { data, error } = await supabase
    .from('fotos')
    .insert({
      orden_id:    foto.orden_id,
      proyecto_id: foto.proyecto_id,
      categoria:   foto.categoria,
      file_url:    foto.url,
      file_path:   foto.path,
      file_type:   fileTypeBD,
    })
    .select('id')
    .single();

  if (error) throw new Error(`Error al registrar foto: ${error.message}`);
  return data.id as string;
}

// ─── Subir + registrar (operación completa) ───────────────────────────────────
export async function subirYRegistrarFoto(
  file:       File,
  ordenId:    string,
  proyectoId: string,
  categoria:  CategoriaFoto
): Promise<FotoSubida & { id: string }> {
  const fotoBase = await subirFoto(file, ordenId, categoria);
  const foto: FotoSubida = { ...fotoBase, proyecto_id: proyectoId }; // ← proyecto_id inyectado aquí
  const id = await registrarFotoEnDB(foto);
  return { ...foto, id };
}

// ─── Cargar fotos de una orden ────────────────────────────────────────────────
export async function cargarFotosDeOrden(
  ordenId: string
): Promise<(FotoSubida & { id: string })[]> {
  const { data, error } = await supabase
    .from('fotos')
    .select('id, orden_id, proyecto_id, categoria, file_url, file_path, file_type, descripcion')
    .eq('orden_id', ordenId);

  if (error) throw new Error(`Error al cargar fotos: ${error.message}`);

  return (data ?? []).map(row => ({
    id:          row.id         as string,
    url:         row.file_url   as string,
    path:        row.file_path  as string,
    categoria:   row.categoria  as CategoriaFoto,
    orden_id:    row.orden_id   as string,
    proyecto_id: row.proyecto_id as string,  // ← añadido
    file_type:   row.file_type  as string,
    nombre:      (row.file_path as string).split('/').pop() ?? '',
    descripcion: (row.descripcion as string | null) ?? null,
  }));
}