import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';
import qrcode from '../src/vendor/qrcode.js';

const source = await fs.readFile('src/services/portalPilot.ts', 'utf8');
const transpiled = ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2023}}).outputText.replace("'../vendor/qrcode'", JSON.stringify(pathToFileURL(path.resolve('src/vendor/qrcode.js')).href));
const {contextoPortal, enlacePortal, cartelPortal} = await import(`data:text/javascript;base64,${Buffer.from(transpiled).toString('base64')}`);
const context = {obraId: 'obra-piloto', obra: 'Obra de prueba · Ñandú', empresa: 'Empresa de prueba', sector: 'Recepción'};
const url = enlacePortal('https://plan-ots-pro.pages.dev', context);
assert.equal(new URL(url).searchParams.get('portal'), 'demo');
assert.deepEqual(contextoPortal(new URL(url).search), context);
assert.equal(new URL(url).pathname, '/');
assert.equal(contextoPortal('?obra=' + 'a'.repeat(500)).obra.length, 180);
assert(!/token|correo|telefono|storage/.test(url));
const svg = cartelPortal({...context, obra: '<script>" & obra'}, url, 'https://storage/private-url', 'data:image/svg+xml;base64,AAAA');
assert(svg.includes('&lt;script&gt;'));
assert(!svg.includes('<script>') && !svg.includes('https://storage') && !svg.includes('<image'));
assert(svg.includes('No recibe reclamos reales'));
const validAsset = 'data:image/png;base64,AAAA';
const branded = cartelPortal(context, url, validAsset, validAsset);
assert.equal((branded.match(/<image /g) || []).length, 2);
assert(branded.includes('preserveAspectRatio="xMidYMid meet"'));

// Optional independent decoder, unpacked only in tmp; not shipped in the application.
if (process.argv[2]) {
  const {default: jsQR} = await import(pathToFileURL(path.resolve(process.argv[2])).href);
  for (const link of [url, enlacePortal('https://plan-ots-pro.pages.dev', {...context, obra: 'Ñ'.repeat(180), sector: 'Zona norte'.repeat(18)})]) {
    const qr = qrcode(0, 'M'); qr.addData(link); qr.make();
    const modules = qr.getModuleCount(), scale = 5, quiet = 4, width = (modules + quiet * 2) * scale, pixels = new Uint8ClampedArray(width * width * 4).fill(255);
    for (let r = 0; r < modules; r++) for (let c = 0; c < modules; c++) if (qr.isDark(r, c)) {
      for (let y = 0; y < scale; y++) for (let x = 0; x < scale; x++) {const p = (((r + quiet) * scale + y) * width + (c + quiet) * scale + x) * 4; pixels[p] = pixels[p + 1] = pixels[p + 2] = 0;}
    }
    assert.equal(jsQR(pixels, width, width)?.data, link, 'El QR debe devolver el enlace exacto de su obra.');
  }
}
const entry = await fs.readFile('src/main.tsx', 'utf8');
assert(!entry.includes("import App from"));
assert(entry.includes("get('portal') === 'demo'"));
const admin = await fs.readFile('src/components/proyecto/AdministracionCreador.tsx', 'utf8');
assert(admin.includes("!['respaldos','portal'].includes(id)"));
assert(admin.includes("creator&&empresaId&&current==='portal'"));
console.log('Portal piloto: contexto, QR, identidad embebida, escape y aislamiento verificados.');
