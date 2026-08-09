// src/services/fotosService.ts
import { supabase } from '../db/supabase';
import { db } from '../db/dexie';
import type { FotoPendiente } from '../db/dexie';

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

/**
 * Resultado de una captura de foto: puede ser una foto ya registrada en Supabase
 * o una PENDIENTE, capturada sin conexión y guardada en Dexie.
 * Los dos campos opcionales son el discriminante — si `pendiente` es true, `id`
 * NO es un UUID de Supabase y `path` está vacío.
 */
export type FotoResultado = FotoSubida & {
  id:               string;
  pendiente?:       true;
  fotoPendienteId?: number;
};

// ─── Validación de archivo — compartida por la ruta online y la offline ───────
// Extraída de subirFoto sin cambiar mensajes ni umbrales: la ruta offline tiene
// que validar ANTES de encolar. Un archivo inválido encolado fallaría para
// siempre, gastando los 3 intentos y terminando en estadoSync 'ERROR'.
export function validarArchivoFoto(file: File): void {
  if (!file.type.startsWith('image/')) {
    throw new Error('Solo se permiten imágenes (JPG, PNG, WEBP)');
  }
  if (file.size > 10 * 1024 * 1024) {
    throw new Error('La imagen no puede superar 10 MB');
  }
}

// ─── Subir archivo a Storage ──────────────────────────────────────────────────
export async function subirFoto(
  file:      File,
  ordenId:   string,
  categoria: CategoriaFoto
): Promise<Omit<FotoSubida, 'proyecto_id'>> {

  validarArchivoFoto(file);

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
// NO borrar por "falta de uso": subirOEncolarFoto descompone estos dos pasos A
// PROPÓSITO, para poder anotar storage_path cuando el upload salió bien y el
// insert falló. Acá el path muere en el scope y ese caso queda irrecuperable.
// Esta sigue siendo la primitiva coherente para cualquier llamador nuevo online.
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

// ─── OFFLINE (B2) ─────────────────────────────────────────────────────────────
// Alcance: solo la captura de fotos de OT (PanelOT y VisorFotos).
// NO cubiertos, siguen sin soporte offline — deuda documentada de B2:
//   · CampoVideo.tsx — sube video directo a Storage, con su propio path
//   · editorFotoService.subirImagenAnotada — burn-in sobre una foto existente

/**
 * Arma el objeto provisional que consume la UI mientras la foto no subió.
 * CREA UN objectURL: el llamador es dueño de revocarlo (URL.revokeObjectURL).
 */
export function fotoProvisional(reg: FotoPendiente & { id: number }): FotoResultado {
  return {
    id:              `pend:${reg.id}`,
    url:             URL.createObjectURL(reg.blob),
    path:            '',
    categoria:       reg.categoria,
    orden_id:        reg.orden_id,
    proyecto_id:     reg.proyecto_id,
    file_type:       reg.file_type,
    nombre:          reg.nombre,
    descripcion:     reg.descripcion ?? null,
    pendiente:       true,
    fotoPendienteId: reg.id,
  };
}

/**
 * Guarda el binario en Dexie y encola el upload. No toca la red.
 * `storagePath` se pasa SOLO cuando el archivo ya está en Storage y lo que falló
 * fue el insert: así el reintento registra el archivo existente en vez de subir
 * un segundo y dejar el primero huérfano.
 */
export async function encolarFotoOffline(
  file:        File,
  ordenId:     string,
  proyectoId:  string,
  categoria:   CategoriaFoto,
  storagePath?: string
): Promise<FotoResultado> {
  validarArchivoFoto(file);

  // Duplicado: misma OT + categoría + nombre + tamaño, todavía sin subir.
  // Cubre el doble toque en el botón y el reintento del técnico que no vio la
  // miniatura. No usamos SHA-256: hashear 10 MB en la tablet no se justifica.
  const previas = await db.fotosPendientes.where('orden_id').equals(ordenId).toArray();
  const yaEncolada = previas.find(f =>
    f.categoria  === categoria &&
    f.nombre     === file.name &&
    f.size       === file.size &&
    f.estadoSync !== 'COMPLETADO'
  );
  if (yaEncolada) {
    // Si esta pasada dejó el archivo en Storage y la encolada previa todavía no
    // tenía path, se lo anotamos: si no, ese archivo quedaría huérfano igual.
    if (storagePath && !yaEncolada.storage_path) {
      yaEncolada.storage_path = storagePath;
      await db.fotosPendientes.update(yaEncolada.id as number, { storage_path: storagePath });
    }
    // Devolvemos la que ya está: un error en pantalla por una foto que SÍ está
    // guardada sería información falsa para el técnico.
    return fotoProvisional(yaEncolada as FotoPendiente & { id: number });
  }

  const now = new Date().toISOString();
  const registro: FotoPendiente = {
    orden_id:    ordenId,
    proyecto_id: proyectoId,
    categoria,
    blob:        file,
    nombre:      file.name,
    file_type:   file.type,
    size:        file.size,
    estadoSync:  'PENDIENTE',
    intentos:    0,
    created_at:  now,
    ...(storagePath ? { storage_path: storagePath } : {}),
  };
  const id = await db.fotosPendientes.add(registro);

  await db.syncQueue.add({
    tipo:       'UPLOAD_FOTO',
    payload:    { fotoPendienteId: id },
    created_at: now,
    intentos:   0,
  });

  return fotoProvisional({ ...registro, id });
}

/** Fotos pendientes de una OT, ya como objetos de UI. Crea objectURLs: revocarlos. */
export async function cargarFotosPendientesDeOrden(ordenId: string): Promise<FotoResultado[]> {
  const regs = await db.fotosPendientes.where('orden_id').equals(ordenId).toArray();
  return regs
    .filter(r => r.estadoSync !== 'COMPLETADO')
    .map(r => fotoProvisional(r as FotoPendiente & { id: number }));
}

/**
 * Punto de entrada único para capturar una foto de OT.
 * Patrón espejo de crearOrden (ordenesStore.ts:297-325): se INTENTA online y si
 * falla también se encola. No se decide solo por navigator.onLine, que miente en
 * redes cautivas y en el wifi de obra con señal pero sin salida a internet.
 *
 * Los dos pasos de subirYRegistrarFoto van SEPARADOS a propósito: si el upload
 * salió bien y falla el insert, hay que encolar anotando el path del archivo ya
 * subido. Con la función compuesta ese path muere en su scope y el archivo queda
 * huérfano en el bucket para siempre — sin fila en `fotos`, invisible en la app.
 */
export async function subirOEncolarFoto(
  file:       File,
  ordenId:    string,
  proyectoId: string,
  categoria:  CategoriaFoto
): Promise<FotoResultado> {
  validarArchivoFoto(file);   // un archivo inválido no se encola: fallaría siempre

  if (navigator.onLine) {
    let base: Omit<FotoSubida, 'proyecto_id'> | null = null;
    try {
      base = await subirFoto(file, ordenId, categoria);
    } catch (err) {
      console.warn('[fotosService] upload falló, encolando offline:', err);
    }

    if (base) {
      const foto: FotoSubida = { ...base, proyecto_id: proyectoId };
      try {
        return { ...foto, id: await registrarFotoEnDB(foto) };
      } catch (err) {
        console.warn('[fotosService] insert falló, archivo ya en Storage:', err);
        return encolarFotoOffline(file, ordenId, proyectoId, categoria, base.path);
      }
    }
  }
  return encolarFotoOffline(file, ordenId, proyectoId, categoria);
}