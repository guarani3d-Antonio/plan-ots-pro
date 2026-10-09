import { supabase } from '../db/supabase';
import { assertSession, sessionTicket } from '../security/sessionScope';

export type TipoFicha = 'empresa' | 'obra' | 'cliente' | 'contratista' | 'contacto';
export const DIRECTORIO_FOTO_EVENTO = 'plan-directorio-foto';
const bucket = 'directory-photos';

export async function fotoDirectorio(tipo: TipoFicha, id: string) {
  const ticket = sessionTicket();
  const { data: path, error } = await supabase.rpc('plan_foto_directorio', { p_tipo: tipo, p_id: id });
  assertSession(ticket);
  if (error) throw new Error(error.message);
  if (!path) return { path: '', url: '' };
  const signed = await supabase.storage.from(bucket).createSignedUrl(path as string, 300);
  assertSession(ticket);
  if (signed.error) throw new Error(signed.error.message);
  return { path: path as string, url: signed.data.signedUrl };
}

/** Conserva proporciones y reduce peso. La foto no es evidencia técnica de la OT. */
export async function prepararFotoDirectorio(file: File): Promise<Blob> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 8 * 1024 * 1024) {
    throw new Error('Elegí una foto JPG, PNG o WebP de hasta 8 MB.');
  }
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 1024 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('No se pudo preparar la foto.');
    context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.85));
    if (!blob || blob.size > 2 * 1024 * 1024) throw new Error('No se pudo reducir la foto. Probá con otra imagen.');
    return blob;
  } finally { bitmap.close(); }
}

export async function guardarFotoDirectorio(tipo: TipoFicha, id: string, file: File): Promise<void> {
  const ticket = sessionTicket();
  const blob = await prepararFotoDirectorio(file);
  assertSession(ticket);
  const current = await supabase.rpc('plan_foto_directorio', { p_tipo: tipo, p_id: id });
  assertSession(ticket);
  if (current.error) throw new Error(current.error.message);
  const path = `${tipo}/${id}/${crypto.randomUUID()}.jpg`;
  const upload = await supabase.storage.from(bucket).upload(path, blob, { contentType: 'image/jpeg', upsert: false });
  assertSession(ticket);
  if (upload.error) throw new Error(upload.error.message);
  // No borrar el archivo ante una respuesta incierta: el servidor pudo vincularlo.
  const result = await supabase.rpc('plan_guardar_foto_directorio', { p_tipo: tipo, p_id: id, p_path: path });
  assertSession(ticket);
  if (result.error) throw new Error(result.error.message);
  window.dispatchEvent(new CustomEvent(DIRECTORIO_FOTO_EVENTO, { detail: { tipo, id } }));
  // El servidor impide borrar archivos que siguen asociados a una ficha.
  if (current.data) void supabase.storage.from(bucket).remove([current.data as string]).catch(() => {});
}
