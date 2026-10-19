import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

const source = await readFile('src/services/reportPreviewReadiness.ts', 'utf8');
const exports = {};
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports });
const prepare = exports.preparacionVistaInforme;
let checks = 0;
function expect(input, state, message) {
  const result = prepare({ cargandoDatos: false, errorDatos: null, ...input });
  assert.equal(result.estado, state);
  if (message !== undefined) assert.equal(result.mensaje, message);
  checks++;
  return result;
}

expect({ cargandoDatos: true }, 'cargando');
expect({}, 'lista', null); // Versiones antiguas sin firmas ni marca.
expect({ errorDatos: 'Fuentes inaccesibles' }, 'error', 'Fuentes inaccesibles');
const signatures = { clave: 'revision-2', claveCargada: null, cargando: false };
const brand = { clave: 'empresa/revision-2', claveCargada: 'empresa/revision-1' };
expect({ firmas: signatures, marca: brand }, 'cargando'); // Antes del efecto de firmas.
expect({ firmas: { ...signatures, cargando: true } }, 'cargando');
expect({ firmas: { ...signatures, claveCargada: 'revision-1' } }, 'cargando');
expect({ firmas: { ...signatures, claveCargada: 'revision-2', cargando: true } }, 'cargando');
expect({ firmas: { ...signatures, claveCargada: 'revision-2' }, marca: brand }, 'cargando');
expect({ marca: { ...brand, error: 'Error de la marca anterior' } }, 'cargando');
expect({ firmas: { ...signatures, error: 'Sin permiso para consultar estas firmas' } }, 'error', 'Sin permiso para consultar estas firmas');
expect({ marca: { ...brand, claveCargada: brand.clave, error: 'No se pudo cargar el logo' } }, 'error', 'No se pudo cargar el logo');
expect({ cargandoDatos: true, errorDatos: 'Error anterior' }, 'cargando');

// Las lecturas pueden terminar en cualquier orden. El generador solo se habilita al completar ambas.
for (const order of [['firmas', 'marca'], ['marca', 'firmas']]) {
  const state = { firmas: { ...signatures }, marca: { ...brand } };
  expect(state, 'cargando');
  state[order[0]].claveCargada = state[order[0]].clave;
  expect(state, 'cargando');
  state[order[1]].claveCargada = state[order[1]].clave;
  expect(state, 'lista', null);
}
expect({ firmas: { ...signatures, claveCargada: signatures.clave, error: null } }, 'lista', null); // Reintento exitoso.
console.log(`PASS ${checks} casos: espera de datos, firmas y logo en ambos ordenes; revisiones anteriores no habilitan el render; errores reales conservados y reintento exitoso.`);
