import assert from 'node:assert/strict';
import { leerSolicitudDocumento } from '../supabase/functions/_shared/document-request.mjs';

const request = body => new Request('https://example.test/render-documento', {
  method: 'POST', body,
});
const valido = { revisionId: 'revision', solicitudId: 'solicitud' };
assert.deepEqual(await leerSolicitudDocumento(request(JSON.stringify(valido))), valido);
for (const invalido of ['null', '[]', '"texto"', '{', '', ' '.repeat(4097)])
  await assert.rejects(() => leerSolicitudDocumento(request(invalido)));
// Cuerpo por partes sin cabecera: se cancela antes de recibir el resto.
let cancelado = false;
const stream = new ReadableStream({
  start(controller) {
    controller.enqueue(new Uint8Array(2048));
    controller.enqueue(new Uint8Array(2049));
  },
  cancel() { cancelado = true; },
});
await assert.rejects(() => leerSolicitudDocumento(new Request('https://example.test', {
  method: 'POST', body: stream, duplex: 'half',
})));
assert.equal(cancelado, true);
await assert.rejects(() => leerSolicitudDocumento(request(new Uint8Array([0xff]))));
console.log('Solicitud PDF: JSON invalido, limite real y cancelacion de stream OK');
