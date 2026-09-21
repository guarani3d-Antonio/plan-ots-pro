import assert from 'node:assert/strict';
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import ts from 'typescript';

// Inspección AST: cada punto de entrada real debe desactivar evaluación;
// una coincidencia en comentarios no satisface esta barrera de seguridad.
const entryPoints = [];
async function inspect(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) { await inspect(path); continue; }
    if (!/\.tsx?$/.test(path)) continue;
    const source = ts.createSourceFile(path, await readFile(path, 'utf8'), ts.ScriptTarget.Latest, true);
    function visit(node) {
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'getDocument') {
        const options = node.arguments[0];
        assert(options && ts.isObjectLiteralExpression(options), `Opciones PDF explícitas: ${path}`);
        const property = options.properties.find(p => ts.isPropertyAssignment(p) && p.name.getText(source) === 'isEvalSupported');
        assert(property && property.initializer.kind === ts.SyntaxKind.FalseKeyword, `PDF inseguro: ${path}`);
        entryPoints.push(path);
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
}
await inspect('src');
assert.equal(entryPoints.length, 4);
const headers = await readFile('public/_headers', 'utf8');
assert.match(headers, /X-Content-Type-Options: nosniff/);
assert.match(headers, /camera=\(self\)/);
assert.match(headers, /\/sw\.js\s+Cache-Control: no-cache/);
await mkdir('docs/estabilizacion-2026-09-20/dia-10', { recursive: true });
const report = { testedAt: new Date().toISOString(), entryPoints, allDisableEval: true, hostingHeadersPrepared: true, advisory: 'https://github.com/mozilla/pdf.js/security/advisories/GHSA-wgrm-67xf-hhpq', scope: 'Verificación AST de las opciones enviadas al visor. No sustituye render en navegador ni actualización de PDF.js.' };
await writeFile('docs/estabilizacion-2026-09-20/dia-10/pdf-security.json', JSON.stringify(report, null, 2) + '\n');
console.log('4/4 puntos PDF desactivan eval; cabeceras preparadas.');
