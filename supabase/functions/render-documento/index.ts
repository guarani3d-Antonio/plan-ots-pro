import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.105.4';
import { materializarHtmlControlado } from '../_shared/controlled-report.mjs';
import { leerSolicitudDocumento } from '../_shared/document-request.mjs';
import { opcionesPdfDocumento } from '../_shared/document-pdf-options.mjs';

const ORIGIN = 'https://plan-ots-pro.pages.dev';
const cors = {
  'Access-Control-Allow-Origin': ORIGIN,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};
const idValido = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const hashValido = /^[0-9a-f]{64}$/;
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: cors });

function necesario<T>(data: T | null, error: { message: string } | null, etiqueta: string): T {
  if (error || data == null) throw new Error(`${etiqueta}: ${error?.message ?? 'ausente'}`);
  return data;
}

type Bytes = Uint8Array<ArrayBuffer>;

async function sha256(bytes: Bytes): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function mimeImagen(bytes: Uint8Array): 'image/jpeg' | 'image/png' | 'image/webp' {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
  if (String.fromCharCode(...bytes.subarray(0, 4)) === 'RIFF' &&
      String.fromCharCode(...bytes.subarray(8, 12)) === 'WEBP') return 'image/webp';
  throw new Error('Formato de foto no admitido para emisión');
}

function base64(bytes: Uint8Array): string {
  const trozos: string[] = [];
  for (let i = 0; i < bytes.length; i += 32768)
    trozos.push(String.fromCharCode(...bytes.subarray(i, i + 32768)));
  return btoa(trozos.join(''));
}

async function descargar(admin: SupabaseClient, bucket: string, path: string,
  maxBytes: number): Promise<Bytes> {
  const { data, error } = await admin.storage.from(bucket).download(path);
  const blob = necesario(data, error, 'Archivo privado');
  if (blob.size < 1 || blob.size > maxBytes) throw new Error('Archivo fuera de límite');
  return new Uint8Array(await blob.arrayBuffer());
}

async function subirExacto(admin: SupabaseClient, path: string,
  bytes: Bytes, contentType: string, hash: string): Promise<void> {
  const { error } = await admin.storage.from('exports').upload(path,
    new Blob([bytes], { type: contentType }), { contentType, upsert: false });
  if (error) {
    // En un reintento solo se acepta un objeto previo con los mismos bytes.
    const anterior = await descargar(admin, 'exports', path, 50 * 1024 * 1024);
    if (anterior.length !== bytes.length || await sha256(anterior) !== hash)
      throw new Error('La ruta reservada contiene bytes distintos');
  }
  const guardado = await descargar(admin, 'exports', path, 50 * 1024 * 1024);
  if (guardado.length !== bytes.length || await sha256(guardado) !== hash)
    throw new Error('Los bytes guardados no coinciden');
}

async function pdfExistente(admin: SupabaseClient, prefijo: string):
  Promise<{ path: string; hash: string; bytes: Bytes } | null> {
  const { data, error } = await admin.storage.from('exports').list(prefijo, { limit: 100 });
  if (error) throw new Error(`No se pudo buscar el PDF previo: ${error.message}`);
  const archivos = (data ?? []).filter(item => hashValido.test(item.name.slice(0, -4)) &&
    item.name.endsWith('.pdf'));
  if (archivos.length > 1) throw new Error('Hay más de un PDF candidato: requiere revisión manual');
  if (!archivos.length) return null;
  const path = `${prefijo}/${archivos[0].name}`;
  const bytes = await descargar(admin, 'exports', path, 50 * 1024 * 1024);
  const hash = await sha256(bytes);
  if (hash !== archivos[0].name.slice(0, -4) || bytes.length < 100 ||
      String.fromCharCode(...bytes.subarray(0, 5)) !== '%PDF-')
    throw new Error('PDF previo alterado o inválido');
  return { path, hash, bytes };
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'POST') return json({ error: 'Método no permitido' }, 405);
  if (request.headers.get('origin') !== ORIGIN) return json({ error: 'Origen no permitido' }, 403);
  const authorization = request.headers.get('authorization') ?? '';
  if (!authorization.startsWith('Bearer ')) return json({ error: 'Sesión requerida' }, 401);
  let body: { revisionId?: unknown; solicitudId?: unknown };
  try {
    body = await leerSolicitudDocumento(request);
  } catch { return json({ error: 'Solicitud inválida' }, 400); }
  const revisionId = typeof body.revisionId === 'string' ? body.revisionId : '';
  const solicitudId = typeof body.solicitudId === 'string' ? body.solicitudId : '';
  if (!idValido.test(revisionId) || !idValido.test(solicitudId))
    return json({ error: 'Revisión o solicitud inválida' }, 400);

  const url = Deno.env.get('SUPABASE_URL');
  const anon = Deno.env.get('SUPABASE_ANON_KEY');
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const cuentaCloudflare = Deno.env.get('CLOUDFLARE_ACCOUNT_ID');
  const tokenCloudflare = Deno.env.get('CLOUDFLARE_BROWSER_TOKEN');
  if (!url || !anon || !service || !cuentaCloudflare || !tokenCloudflare)
    return json({ error: 'Renderizador sin configurar' }, 503);

  const cliente = createClient(url, anon, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: identidad, error: errorIdentidad } =
    await cliente.auth.getUser(authorization.slice(7));
  if (errorIdentidad || !identidad.user) return json({ error: 'Sesión inválida' }, 401);
  const { data: candidato, error: errorPreparacion } = await cliente.rpc('plan_documento_preparar', {
    p_revision: revisionId, p_solicitud: solicitudId,
  });
  if (errorPreparacion || !candidato?.id)
    return json({ error: errorPreparacion?.message ?? 'No se pudo preparar la revisión' }, 403);

  const admin = createClient(url, service, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  let renderToken: string | null = null;
  try {
    if (candidato.estado === 'listo') {
      const bytes = await descargar(admin, 'exports', candidato.pdf_path, 50 * 1024 * 1024);
      if (bytes.length !== candidato.pdf_bytes || await sha256(bytes) !== candidato.pdf_sha256)
        throw new Error('El PDF listo no coincide con el registro');
      return json({ candidatoId: candidato.id, estado: 'listo',
        pdfPath: candidato.pdf_path, pdfSha256: candidato.pdf_sha256 });
    }
    renderToken = crypto.randomUUID();
    const { data: reclamado, error: errorReclamo } = await admin.rpc(
      'plan_documento_render_reclamar', { p_candidato: candidato.id, p_token: renderToken });
    if (errorReclamo) throw new Error(errorReclamo.message);
    if (!reclamado) return json({ candidatoId: candidato.id, estado: 'procesando' }, 202);

    const { data: revision, error: errorRevision } = await admin.from('plan_documento_revisiones')
      .select('*').eq('id', revisionId).single();
    const { data: fuente, error: errorFuente } = await admin.from('plan_documento_fuentes')
      .select('fuentes,fuentes_sha256').eq('revision_id', revisionId).single();
    const rev = necesario(revision, errorRevision, 'Revisión');
    const congelado = necesario(fuente, errorFuente, 'Fuentes');
    if (rev.id !== candidato.revision_id || rev.contenido_sha256 !== candidato.datos_sha256 ||
        congelado.fuentes_sha256 !== candidato.fuentes_sha256)
      throw new Error('Las fuentes congeladas difieren del candidato');
    const fuentes = congelado.fuentes;
    const doc = fuentes?.documento;
    if (!doc || doc.id !== candidato.documento_id || doc.orden_id !== fuentes.orden?.id)
      throw new Error('Identidad documental inconsistente');
    const prefijo = `${doc.tenant_id}/${doc.proyecto_id}/documentos/${revisionId}`;
    const imagenes: Record<string, string> = {};
    const manifiesto = [];
    const cache = new Map<string, { bytes: Bytes; mime: string; hash: string }>();
    let totalImagenes = 0;
    let totalFuentes = 0;
    for (const foto of fuentes.fotos ?? []) {
      if (!idValido.test(foto.id)) throw new Error('ID de foto inválido');
      const item: Record<string, unknown> = { id: foto.id };
      for (const [tipo, fuentePath] of [
        ['original', foto.original_path], ['edicion', foto.edicion_path],
      ] as const) {
        if (typeof fuentePath !== 'string' ||
            !fuentePath.startsWith(`${doc.tenant_id}/${doc.proyecto_id}/`))
          throw new Error('Ruta de foto fuera del proyecto');
        let archivo = cache.get(fuentePath);
        if (!archivo) {
          const bytes = await descargar(admin, 'fotos', fuentePath, 30 * 1024 * 1024);
          totalFuentes += bytes.length;
          if (totalFuentes > 100 * 1024 * 1024)
            throw new Error('El expediente supera 100 MB de fuentes fotográficas');
          archivo = { bytes, mime: mimeImagen(bytes), hash: await sha256(bytes) };
          cache.set(fuentePath, archivo);
        }
        const path = `${prefijo}/fotos/${foto.id}/${tipo}/${archivo.hash}`;
        await subirExacto(admin, path, archivo.bytes, archivo.mime, archivo.hash);
        item[tipo] = { fuente_path: fuentePath, path, sha256: archivo.hash,
          bytes: archivo.bytes.length };
        if (tipo === 'edicion' && rev.datos?.incluirFotos) {
          totalImagenes += archivo.bytes.length;
          if (totalImagenes > 25 * 1024 * 1024)
            throw new Error('Las fotos del PDF superan 25 MB');
          imagenes[fuentePath] = `data:${archivo.mime};base64,${base64(archivo.bytes)}`;
        }
      }
      manifiesto.push(item);
    }
    const previo = await pdfExistente(admin, prefijo);
    let pdf = previo;
    if (!pdf) {
      const html = materializarHtmlControlado(rev, fuentes, imagenes);
      const payload = JSON.stringify({ html,
        pdfOptions: opcionesPdfDocumento(doc.codigo, rev.revision) });
      if (new TextEncoder().encode(payload).byteLength > 48 * 1024 * 1024)
        throw new Error('El expediente supera el límite del renderizador PDF');
      const respuesta = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${cuentaCloudflare}/browser-run/pdf`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${tokenCloudflare}`, 'Content-Type': 'application/json' },
          body: payload,
          signal: AbortSignal.timeout(65000),
        });
      if (!respuesta.ok) throw new Error(`Renderizador PDF: HTTP ${respuesta.status}`);
      const bytes = new Uint8Array(await respuesta.arrayBuffer());
      if (bytes.length < 100 || bytes.length > 50 * 1024 * 1024 ||
          String.fromCharCode(...bytes.subarray(0, 5)) !== '%PDF-')
        throw new Error('El renderizador no devolvió un PDF válido');
      const hash = await sha256(bytes);
      const path = `${prefijo}/${hash}.pdf`;
      await subirExacto(admin, path, bytes, 'application/pdf', hash);
      pdf = { path, hash, bytes };
    }
    const { data: listo, error: errorListo } = await admin.rpc('plan_documento_pdf_listo', {
      p_candidato: candidato.id, p_token: renderToken, p_path: pdf.path,
      p_sha256: pdf.hash, p_bytes: pdf.bytes.length, p_fuentes_binarias: manifiesto,
    });
    if (errorListo || !listo) throw new Error(`No se pudo registrar PDF: ${errorListo?.message}`);
    return json({ candidatoId: listo.id, estado: listo.estado,
      pdfPath: listo.pdf_path, pdfSha256: listo.pdf_sha256 });
  } catch (error) {
    console.error('render-documento', candidato.id, error instanceof Error ? error.message : 'error');
    return json({ error: 'No se pudo generar un PDF verificable. La revisión permanece sin emitir.' }, 503);
  } finally {
    if (renderToken) await admin.rpc('plan_documento_render_liberar',
      { p_candidato: candidato.id, p_token: renderToken });
  }
});
