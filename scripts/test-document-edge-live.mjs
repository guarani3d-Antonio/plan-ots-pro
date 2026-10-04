// Prueba negativa del endpoint publicado. No crea expedientes ni imprime claves.
import assert from 'node:assert/strict';
import { writeFile, mkdir } from 'node:fs/promises';

process.loadEnvFile('.env.local');
const endpoint = `${process.env.VITE_SUPABASE_URL}/functions/v1/render-documento`;
const key = process.env.VITE_SUPABASE_ANON_KEY;
const resultados = [];
for (const [caso, authorization, origin] of [
  ['sin sesion', null, 'https://plan-ots-pro.pages.dev'],
  ['JWT invalido', 'Bearer invalido', 'https://plan-ots-pro.pages.dev'],
  ['clave publica sin usuario', `Bearer ${key}`, 'https://plan-ots-pro.pages.dev'],
  ['origen ajeno', `Bearer ${key}`, 'https://example.test'],
]) {
  const headers = { 'Content-Type': 'application/json', Origin: origin };
  if (authorization) headers.Authorization = authorization;
  const response = await fetch(endpoint, { method: 'POST', headers,
    body: JSON.stringify({ revisionId: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001',
      solicitudId: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000002' }),
    signal: AbortSignal.timeout(20000),
  });
  const body = await response.json();
  assert.equal(response.status, caso === 'origen ajeno' ? 403 : 401, caso);
  resultados.push({ caso, status: response.status, rechazo: body.error ?? body.message });
}
await mkdir('tmp/pdfs/rendered', { recursive: true });
await writeFile('tmp/pdfs/rendered/edge-negative.json', JSON.stringify(resultados, null, 2));
console.log(JSON.stringify(resultados));
