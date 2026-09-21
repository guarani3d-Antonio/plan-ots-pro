import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

const results = [];
async function test(name, fn) {
  try { await fn(); results.push({ name, ok: true }); }
  catch (error) { results.push({ name, ok: false, error: error.message.split('\n')[0] }); }
}
async function load(path, extra = {}) {
  const source = await readFile(path, 'utf8'), module = { exports: {} };
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(compiled, { module, exports: module.exports, console, ...extra });
  return { source, exports: module.exports };
}
async function filesBelow(directory) {
  const found = [];
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, item.name);
    if (item.isDirectory()) found.push(...await filesBelow(path)); else found.push(path);
  }
  return found;
}

const ia = await load('src/services/iaService.ts', { fetch: () => { throw new Error('No debe llamar a la red'); } });
await test('descripción de foto abre el modo manual sin red', async () => {
  assert.equal(await ia.exports.describirFotoConIA('https://private.example/foto'), '');
  assert(!ia.source.includes('VITE_ANTHROPIC_API_KEY'));
  assert(!ia.source.includes('api.anthropic.com'));
});

await test('la interfaz separa cámara trasera y galería', async () => {
  const panel = await readFile('src/components/plano/PanelOT.tsx', 'utf8');
  assert.match(panel, /capture="environment"/);
  assert.match(panel, />Cámara</);
  assert.match(panel, />Galería</);
  assert.match(panel, /accept="image\/\*"/);
});

await test('la detección conserva la Samsung Tab FE horizontal y vertical', async () => {
  const hook = await readFile('src/hooks/useModoTablet.ts', 'utf8');
  assert.match(hook, /ANCHO_MAX_TABLET = 1400/);
  assert.match(hook, /pointer: coarse/);
  assert.match(hook, /window\.innerHeight > window\.innerWidth/);
  assert.match(hook, /orientationchange/);
});

await test('el build no contiene la clave ni el endpoint directo de IA', async () => {
  const env = await readFile('.env.local', 'utf8');
  const secret = env.match(/^VITE_ANTHROPIC_API_KEY\s*=\s*["']?([^\r\n"']+)/m)?.[1] ?? '';
  const text = (await Promise.all((await filesBelow('dist')).filter(path => /\.(?:js|html)$/.test(path)).map(path => readFile(path, 'utf8')))).join('\n');
  if (secret.length >= 20) assert(!text.includes(secret));
  assert(!text.includes('api.anthropic.com/v1/messages'));
  assert(!text.includes('anthropic-dangerous-direct-browser-access'));
});

await mkdir('docs/estabilizacion-2026-09-20/dia-9', { recursive: true });
const report = {
  testedAt: new Date().toISOString(),
  scope: 'Cámara/galería, modo Samsung Tab FE y ausencia de credenciales de IA en el cliente compilado.',
  passed: results.filter(result => result.ok).length,
  total: results.length,
  results,
};
await writeFile('docs/estabilizacion-2026-09-20/dia-9/client-tests.json', `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (results.some(result => !result.ok)) process.exitCode = 1;
