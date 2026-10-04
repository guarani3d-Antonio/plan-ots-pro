// El limite se mide sobre el cuerpo recibido, incluso sin Content-Length.
export async function leerSolicitudDocumento(request) {
  const limite = 4096;
  if (!request.body || Number(request.headers.get('content-length') ?? 0) > limite)
    throw new Error('Solicitud invalida');
  const reader = request.body.getReader();
  const buffer = new Uint8Array(limite);
  let longitud = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (longitud + value.length > limite) {
        await reader.cancel();
        throw new Error('Solicitud demasiado extensa');
      }
      buffer.set(value, longitud);
      longitud += value.length;
    }
  } finally {
    reader.releaseLock();
  }
  const body = JSON.parse(new TextDecoder('utf-8', { fatal: true })
    .decode(buffer.subarray(0, longitud)));
  if (!body || typeof body !== 'object' || Array.isArray(body))
    throw new Error('Solicitud invalida');
  return body;
}
