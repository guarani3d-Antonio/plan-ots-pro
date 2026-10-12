export const MAX_PHOTO_BYTES = 2 * 1024 * 1024;
export const MAX_BODY_BYTES = 3 * MAX_PHOTO_BYTES + 32768;
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export class PortalError extends Error { constructor(message, status = 400) { super(message); this.status = status; } }
export async function boundedBody(request, limit) {
  const length = request.headers.get('content-length');
  if (length && (!/^\d+$/.test(length) || Number(length) > limit)) throw new PortalError('La solicitud supera el tamaño permitido.', 413);
  if (!request.body) throw new PortalError('Solicitud vacía.');
  const reader = request.body.getReader(), chunks = []; let size = 0;
  try {
    while (true) {
      const part = await reader.read(); if (part.done) break;
      size += part.value.byteLength;
      if (size > limit) { await reader.cancel(); throw new PortalError('La solicitud supera el tamaño permitido.', 413); }
      chunks.push(part.value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}
export function validateContact(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new PortalError('Solicitud inválida.');
  const result = {};
  for (const field of ['nombre', 'telefono', 'correo', 'relacion', 'unidad', 'descripcion', 'atencion', 'previo']) {
    const value = raw[field];
    if (typeof value !== 'string' || value.length > (field === 'descripcion' ? 4000 : 180)) throw new PortalError('Revisá los datos de la solicitud.');
    result[field] = value.trim();
  }
  if (!result.nombre || !result.unidad || !result.descripcion || !/^\d{6,18}$/.test(result.telefono.replace(/\D/g, ''))) throw new PortalError('Completá nombre, teléfono, unidad y descripción.');
  if (result.correo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result.correo)) throw new PortalError('Revisá el correo.');
  for (const [key, allowed] of [['relacion',['Propietario/a','Inquilino/a','Administración','Otro']],['atencion',['No','Sí','No estoy seguro/a']],['previo',['No','Sí','No estoy seguro/a']]]) {
    if (!allowed.includes(result[key])) throw new PortalError('Revisá las opciones seleccionadas.');
  }
  if (raw.consentimiento !== true || raw.aviso !== 'piloto-qr-v1') throw new PortalError('Confirmá el aviso de esta prueba.');
  return {...result, consentimiento:true, aviso:'piloto-qr-v1'};
}
export function imageMatches(bytes, mime) {
  if (mime === 'image/jpeg') return bytes.length >= 4 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (mime === 'image/png') return bytes.length >= 8 && [137,80,78,71,13,10,26,10].every((v,i) => bytes[i] === v);
  if (mime === 'image/webp') return bytes.length >= 12 && new TextDecoder().decode(bytes.slice(0,4)) === 'RIFF' && new TextDecoder().decode(bytes.slice(8,12)) === 'WEBP';
  return false;
}
export function evidencePath(tenant, claim, index, mime) {
  if (!UUID.test(tenant) || !UUID.test(claim) || !Number.isInteger(index) || index < 0 || index > 2) throw new PortalError('Reserva inválida.', 502);
  const extension = {'image/jpeg':'jpg','image/png':'png','image/webp':'webp'}[mime];
  if (!extension) throw new PortalError('Formato no permitido.');
  return `${tenant}/reclamos/${claim}/${index}.${extension}`;
}
/** Dependency-injected HTTP boundary, also exercised with synthetic Storage. */
export function createPortalHandler(port, origin = 'https://plan-ots-pro.pages.dev') {
  const headers = {'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'content-type, x-plan-portal','Access-Control-Allow-Methods':'POST, OPTIONS','Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin','X-Content-Type-Options':'nosniff'};
  const json = (body,status=200) => new Response(JSON.stringify(body),{status,headers});
  return async request => {
    if (request.headers.get('origin') !== origin) return json({error:'Origen no permitido.'},403);
    if (request.method === 'OPTIONS') return new Response(null,{status:204,headers});
    if (request.method !== 'POST') return json({error:'Método no permitido.'},405);
    try {
      const portal = request.headers.get('x-plan-portal') || '';
      if (!UUID.test(portal)) throw new PortalError('Enlace de prueba inválido.');
      const type = request.headers.get('content-type') || '';
      if (type.startsWith('application/json')) {
        const bytes = await boundedBody(request,1024);
        const query = JSON.parse(new TextDecoder().decode(bytes));
        if (query.accion !== 'contexto') throw new PortalError('Acción inválida.');
        const context = await port.rpc('plan_portal_publico_contexto',{p_portal:portal});
        if (!context) throw new PortalError('Este portal está pausado o vencido.',410);
        return json(context);
      }
      if (!type.startsWith('multipart/form-data;')) throw new PortalError('Formato inválido.');
      const bytes = await boundedBody(request,MAX_BODY_BYTES);
      const form = await new Request('https://portal.invalid',{method:'POST',headers:{'Content-Type':type},body:bytes}).formData();
      const payload = form.get('solicitud');
      if (typeof payload !== 'string' || payload.length > 16000) throw new PortalError('Solicitud inválida.');
      const raw = JSON.parse(payload), nonce = raw.solicitud_id;
      if (!UUID.test(nonce || '')) throw new PortalError('Identificador de envío inválido.');
      const data = validateContact(raw), files = form.getAll('foto'), photos = [];
      if (files.length > 3 || [...form.keys()].some(key => !['solicitud','foto'].includes(key))) throw new PortalError('Hasta tres fotos por reclamo.');
      for (const file of files) {
        if (typeof file === 'string' || file.size < 1 || file.size > MAX_PHOTO_BYTES) throw new PortalError('Elegí fotos de hasta 2 MB cada una.');
        const content = new Uint8Array(await file.arrayBuffer());
        if (!imageMatches(content,file.type)) throw new PortalError('La foto debe ser JPG, PNG o WebP.');
        const hash = new Uint8Array(await crypto.subtle.digest('SHA-256',content));
        photos.push({content,mime:file.type,bytes:file.size,sha256:Array.from(hash,b=>b.toString(16).padStart(2,'0')).join('')});
      }
      const reservation = await port.rpc('plan_portal_reservar',{p_portal:portal,p_solicitud:nonce,p_datos:{...data,fotos:photos.map(({mime,bytes,sha256})=>({mime,bytes,sha256}))}});
      if (reservation.recibido_en) return json({numero:reservation.numero,recibido_en:reservation.recibido_en});
      for (const [index, photo] of photos.entries()) {
        const path = evidencePath(reservation.tenant_id,reservation.id,index,photo.mime);
        // A repeated reservation must match the exact hashes computed above.
        // Stable paths bound retries to the same bytes; never name from upload.
        await port.upload(path,photo.content,photo.mime);
      }
      const receipt = await port.rpc('plan_portal_confirmar',{p_portal:portal,p_solicitud:nonce});
      return json(receipt);
    } catch (error) {
      if (error instanceof PortalError) return json({error:error.message},error.status);
      if (error instanceof SyntaxError || error instanceof TypeError) return json({error:'Solicitud inválida.'},400);
      return json({error:'No se pudo confirmar el envío. Conservá los datos y reintentá. Si el piloto está pausado o agotado, consultá al administrador.'},409);
    }
  };
}
