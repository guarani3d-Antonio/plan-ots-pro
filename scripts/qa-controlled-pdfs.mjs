// Solo transmite los siete expedientes sintéticos generados por test-report-control.
// El token se recibe por variable de entorno; nunca se imprime ni se guarda.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { opcionesPdfDocumento } from '../supabase/functions/_shared/document-pdf-options.mjs';

const cuenta = process.env.CLOUDFLARE_ACCOUNT_ID;
const token = process.env.CLOUDFLARE_BROWSER_TOKEN;
if (!/^[a-f0-9]{32}$/i.test(cuenta ?? '') || !token) {
  console.error('Se requieren CLOUDFLARE_ACCOUNT_ID y CLOUDFLARE_BROWSER_TOKEN.');
  process.exit(1);
}

execFileSync(process.execPath, ['scripts/test-report-control.mjs', '--write-qa-html'],
  { stdio: 'pipe' });
await mkdir('tmp/pdfs/rendered', { recursive: true });
const tipos = ['orden_servicio', 'visita', 'relevamiento', 'avance', 'cierre', 'acta', 'encuesta', 'cierre_largo'];
const resultados = [];
for (let i = 0; i < tipos.length; i++) {
  if (i) await new Promise(resolve => setTimeout(resolve, 10500));
  const html = await readFile(`tmp/pdfs/controlado-${i + 1}.html`, 'utf8');
  if (!html.includes('POT-2026-OS-00000001') || !html.includes('OT-PRUEBA'))
    throw new Error(`Fixture ${i + 1} no es sintético`);
  const respuesta = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${cuenta}/browser-run/pdf`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ html, pdfOptions: opcionesPdfDocumento('POT-2026-OS-00000001', 0) }),
      signal: AbortSignal.timeout(65000),
    });
  if (!respuesta.ok) throw new Error(`${tipos[i]}: Browser Run HTTP ${respuesta.status}`);
  const bytes = Buffer.from(await respuesta.arrayBuffer());
  if (bytes.length < 100 || bytes.subarray(0, 5).toString() !== '%PDF-')
    throw new Error(`${tipos[i]}: respuesta no es PDF`);
  const path = `tmp/pdfs/rendered/${i + 1}-${tipos[i]}.pdf`;
  await writeFile(path, bytes);
  resultados.push({ tipo: tipos[i], path, bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    browserMs: respuesta.headers.get('x-browser-ms-used') });
  console.log(`${tipos[i]}: PDF recibido y SHA-256 calculado`);
}
await writeFile('tmp/pdfs/rendered/manifest.json', JSON.stringify(resultados, null, 2));
console.log('Siete plantillas y un cierre largo listos para revisión visual en tmp/pdfs/rendered/.');
