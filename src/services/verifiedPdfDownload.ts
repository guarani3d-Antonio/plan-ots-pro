const MAX_PDF_BYTES = 50 * 1024 * 1024;

/** Verifies the private response before it can be opened, reviewed or downloaded. */
export async function descargarPdfVerificado(url: string, bytesEsperados: number | null,
  hashEsperado: string, timeoutMs = 45000): Promise<Blob> {
  if (!Number.isSafeInteger(bytesEsperados) || !bytesEsperados || bytesEsperados < 100 ||
    bytesEsperados > MAX_PDF_BYTES || !/^[a-f0-9]{64}$/.test(hashEsperado))
    throw new Error('Los datos de verificación del PDF no son válidos.');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {cache: 'no-store', signal: controller.signal});
    if (!response.ok || !response.body) throw new Error('No se pudo descargar el PDF privado.');
    const reader = response.body.getReader();
    const chunks: Uint8Array<ArrayBuffer>[] = [];
    let total = 0;
    try {
      while (true) {
        const {done, value} = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > bytesEsperados) throw new Error('El PDF supera el tamaño registrado.');
        chunks.push(new Uint8Array(value));
      }
    } catch (error) {
      await reader.cancel().catch(() => undefined);
      throw error;
    } finally { reader.releaseLock(); }
    const blob = new Blob(chunks, {type: 'application/pdf'});
    const bytes = await blob.arrayBuffer();
    const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
      .map(byte => byte.toString(16).padStart(2, '0')).join('');
    if (total !== bytesEsperados || hash !== hashEsperado)
      throw new Error('El PDF descargado no coincide con el archivo registrado.');
    return blob;
  } catch (error) {
    if (controller.signal.aborted) throw new Error('La descarga tardó demasiado. Revisá la conexión y volvé a abrir el PDF.', {cause: error});
    throw error;
  } finally { clearTimeout(timer); }
}
