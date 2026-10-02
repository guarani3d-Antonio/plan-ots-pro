import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Module } from 'node:module';
import ts from 'typescript';

const source = readFileSync('src/services/portableReportService.ts', 'utf8');
const mod = new Module('portable-report-test');
mod._compile(ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
} }).outputText, 'portable-report-test.cjs');
const { hacerInformePortable } = mod.exports;
const html = (...urls) => `<html><head></head><body>${urls.map(url => `<img src="${url}">`).join('')}</body></html>`;
const limits = { imageTimeoutMs: 25, totalTimeoutMs: 60 };
const bytes = new Uint8Array([137, 80, 78, 71]);
const valid = () => new Response(bytes, { headers: { 'content-type': 'image/png' } });

// Guard the test itself against the original indefinite-wait regression.
const watchdog = setTimeout(() => { console.error('FAIL: informe bloqueado'); process.exit(1); }, 5000);
try {
  let calls = 0;
  const good = await hacerInformePortable(html('https://photo/1', 'https://photo/1'), async () => { calls++; return valid(); });
  assert.equal(calls, 1);
  assert.equal(good.embeddedBytes, 4);
  assert.equal(good.missingImages, 0);
  assert.ok(good.html.includes('data:image/png;base64,iVBORw=='));
  console.log('PASS: foto incorporada sin alterar bytes; duplicados descargados una vez');

  let signal;
  const stalled = await hacerInformePortable(html('https://photo/stalled'), (_url, options) => {
    signal = options.signal; return new Promise(() => {});
  }, limits);
  assert.equal(stalled.missingImages, 1);
  assert.equal(signal.aborted, true);
  console.log('PASS: descarga que nunca responde termina y se cancela');

  let cancelled = false;
  const stream = new ReadableStream({ pull() { return new Promise(() => {}); }, cancel() { cancelled = true; } });
  const bodyStalled = await hacerInformePortable(html('https://photo/body'), async () => new Response(stream, {
    headers: { 'content-type': 'image/jpeg' },
  }), limits);
  assert.equal(bodyStalled.missingImages, 1);
  assert.equal(cancelled, true);
  console.log('PASS: cuerpo de imagen detenido termina y libera la lectura');

  let oversizeCancelled = false;
  const oversize = new ReadableStream({ start(controller) {
    controller.enqueue(new Uint8Array(30 * 1024 * 1024 + 1));
  }, cancel() { oversizeCancelled = true; } });
  const big = await hacerInformePortable(html('https://photo/big'), async () => new Response(oversize, {
    headers: { 'content-type': 'image/jpeg' },
  }));
  assert.equal(big.missingImages, 1);
  assert.equal(big.embeddedBytes, 0);
  assert.equal(oversizeCancelled, true);
  console.log('PASS: foto excesiva sin Content-Length se rechaza durante la descarga');

  for (const response of [new Response('', { status: 404 }), new Response('', { headers: { 'content-type': 'image/png' } }), new Response('bad', { headers: { 'content-type': 'text/html' } })]) {
    const result = await hacerInformePortable(html('https://photo/bad'), async () => response);
    assert.equal(result.missingImages, 1);
  }
  console.log('PASS: archivo ausente, vacío o no imagen queda señalado');

  calls = 0;
  const many = await hacerInformePortable(html(...Array.from({ length: 20 }, (_, i) => `https://photo/${i}`)), () => {
    calls++; return new Promise(() => {});
  }, limits);
  assert.equal(many.missingImages, 20);
  assert.ok(calls <= 4, `se iniciaron ${calls} descargas después del presupuesto global`);
  const retry = await hacerInformePortable(html('https://photo/stalled'), async () => valid(), limits);
  assert.equal(retry.missingImages, 0);
  console.log('PASS: plazo global acotado y reintento posterior exitoso');
} finally { clearTimeout(watchdog); }
