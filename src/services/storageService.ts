import { supabase } from '../db/supabase';

export type StorageBucket = 'planos' | 'fotos' | 'exports';
export const ARCHIVO_TTL_SEGUNDOS = 300;
const buckets = new Set<StorageBucket>(['planos', 'fotos', 'exports']);
const storageOrigin = new URL(import.meta.env.VITE_SUPABASE_URL).origin;

/** Referencia durable: jamás persistir tokens temporales en filas/snapshots. */
export function referenciaArchivo(bucket: StorageBucket, path: string): string {
  return `storage://${bucket}/${path}`;
}

export function identificarArchivo(ref: string): { bucket: StorageBucket; path: string } | null {
  if (ref.startsWith('storage://')) {
    const parts = ref.slice(10).split('/');
    const bucket = parts.shift() as StorageBucket;
    if (!buckets.has(bucket) || !parts.length || parts.some(p => !p || p === '..' || p === '.')) throw new Error('Referencia de archivo inválida');
    return { bucket, path: parts.join('/') };
  }
  try {
    const url = new URL(ref);
    if (url.origin !== storageOrigin) return null;
    const match = url.pathname.match(/^\/storage\/v1\/object\/(?:public|sign|authenticated)\/(planos|fotos|exports)\/(.+)$/);
    if (!match) return null;
    return { bucket: match[1] as StorageBucket, path: decodeURIComponent(match[2]) };
  } catch { return null; }
}

/** No reutiliza firmas ni caché entre identidades. RLS autoriza cada emisión. */
export async function resolverArchivo(ref: string): Promise<string> {
  if (ref === '/fixtures/plano-prueba.svg' || ref.startsWith('blob:') || ref.startsWith('data:image/')) return ref;
  const file = identificarArchivo(ref);
  if (!file) throw new Error(ref.startsWith('pending:') ? 'Esta obra todavía no tiene plano cargado' : 'Referencia de archivo no admitida');
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Inicia sesión para acceder al archivo');
  const { data, error } = await supabase.storage.from(file.bucket).createSignedUrl(file.path, ARCHIVO_TTL_SEGUNDOS);
  if (error) throw new Error(`No se pudo acceder al archivo: ${error.message}`);
  const { data: { session: current } } = await supabase.auth.getSession();
  if (current?.user.id !== session.user.id) throw new Error('La sesión cambió durante la carga');
  return data.signedUrl;
}

export async function rutaArchivo(bucket: StorageBucket, proyectoId: string, extension: string, ordenId?: string): Promise<string> {
  const { data, error } = await supabase.from('proyectos').select('id,tenant_id').eq('id', proyectoId).single();
  if (error || !data) throw new Error('No tienes acceso a esta obra');
  if (bucket === 'fotos' && !ordenId) throw new Error('Falta la orden del archivo');
  const ext = extension.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 10) || 'bin';
  return `${data.tenant_id ?? 'legacy'}/${proyectoId}/${ordenId ? ordenId + '/' : ''}${crypto.randomUUID()}.${ext}`;
}

export async function subirArchivo(bucket: StorageBucket, proyectoId: string, file: Blob, extension: string, ordenId?: string): Promise<{ path: string; ref: string }> {
  const path = await rutaArchivo(bucket, proyectoId, extension, ordenId);
  const { error } = await supabase.storage.from(bucket).upload(path, file, { cacheControl: '0', upsert: false, contentType: file.type });
  if (error) throw new Error(`No se pudo subir el archivo: ${error.message}`);
  return { path, ref: referenciaArchivo(bucket, path) };
}
