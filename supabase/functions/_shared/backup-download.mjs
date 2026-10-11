const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function boundedBody(request) {
  if (Number(request.headers.get('content-length')) > 1024) throw new Error('size');
  if (!request.body) throw new Error('body');
  const reader = request.body.getReader();
  let bytes = 0, chunks = [];
  const timer = setTimeout(() => { void reader.cancel(); }, 10000);
  try {
    while (true) {
      const {value, done} = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 1024) { await reader.cancel(); throw new Error('size'); }
      chunks.push(value);
    }
    const content = new Uint8Array(bytes);
    let offset = 0;
    for (const chunk of chunks) { content.set(chunk, offset); offset += chunk.length; }
    return JSON.parse(new TextDecoder('utf-8', {fatal:true}).decode(content));
  } finally { clearTimeout(timer); reader.releaseLock(); }
}

// Authorization and RLS use the caller's JWT. This function needs no database
// password, service-role key or backup encryption key.
export function backupDownloadHandler({origin, endpoint, authorize, findJob, headObject, signObject}) {
  const destination = new URL(endpoint);
  if (destination.protocol !== 'https:' || destination.username || destination.password ||
      !/^[0-9a-f]{32}\.r2\.cloudflarestorage\.com$/.test(destination.hostname) ||
      destination.pathname !== '/' || destination.search || destination.hash)
    throw new Error('Invalid R2 endpoint');
  if (new URL(origin).origin !== origin || !origin.startsWith('https://')) throw new Error('Invalid origin');
  return async request => {
    const allowedOrigin = request.headers.get('origin') === origin;
    const headers = {'Content-Type':'application/json', 'Cache-Control':'no-store', 'Vary':'Origin'};
    if (allowedOrigin) Object.assign(headers, {
      'Access-Control-Allow-Origin':origin,
      'Access-Control-Allow-Headers':'authorization, apikey, x-client-info, content-type',
      'Access-Control-Allow-Methods':'POST, OPTIONS',
    });
    const json = (body, status=200) => new Response(JSON.stringify(body), {status, headers});
    if (!allowedOrigin) return json({error:'Origen no permitido'},403);
    if (request.method === 'OPTIONS') return new Response(null,{status:204,headers});
    if (request.method !== 'POST') return json({error:'Método no permitido'},405);
    const authorization = request.headers.get('authorization') ?? '';
    if (!/^Bearer \S+$/.test(authorization)) return json({error:'Sesión requerida'},401);
    try {
      if (!await authorize(authorization)) return json({error:'Sin permiso de Creador'},403);
      let body;
      try { body = await boundedBody(request); }
      catch { return json({error:'Solicitud inválida'},400); }
      if (!body || Array.isArray(body) || typeof body.id !== 'string' || !uuid.test(body.id) ||
          Object.keys(body).some(k => k !== 'id')) return json({error:'Copia inválida'},400);
      const id = body.id.toLowerCase();
      const job = await findJob(authorization,id);
      if (!job || job.id !== id || job.estado !== 'creada' || !job.integridad_en ||
          !Number.isSafeInteger(job.bytes) || job.bytes <= 0 ||
          !/^[0-9a-f]{64}$/.test(job.paquete_sha256 ?? '') ||
          !new RegExp(`^plan-ots/${id}/[0-9a-f-]{36}\\.potbackup$`).test(job.paquete_path ?? ''))
        return json({error:'Copia no disponible'},409);
      // HEAD compares the persisted object with the verified database record.
      // Signing never downloads or decrypts the archive inside the Edge Function.
      const remote = await headObject(job.paquete_path);
      if (remote.bytes !== job.bytes || remote.sha256 !== job.paquete_sha256)
        return json({error:'La copia remota no coincide; solicitá una verificación'},409);
      const url = await signObject(job.paquete_path,`plan-ots-${id}.potbackup`,60);
      const signed = new URL(url);
      if (signed.origin !== destination.origin || signed.username || signed.password ||
          signed.searchParams.get('X-Amz-Expires') !== '60') throw new Error('Invalid signed URL');
      return json({url,sha256:job.paquete_sha256,expires_in:60});
    } catch {
      // Do not disclose SDK errors, credentials, signed URLs or object paths.
      return json({error:'No se pudo autorizar la descarga segura'},503);
    }
  };
}
