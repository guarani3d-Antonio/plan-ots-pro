import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { createRequire, Module } from 'node:module';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const cache = new Map();
async function loadTs(path) {
  const absolute = resolve(path);
  if (cache.has(absolute)) return cache.get(absolute).exports;
  const source = await readFile(absolute, 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText;
  const mod = new Module(absolute);
  mod.filename = absolute;
  mod.paths = Module._nodeModulePaths(dirname(absolute));
  cache.set(absolute, mod);
  // Los tres modulos del generador solo importan otros modulos locales.
  mod.require = specifier => {
    if (!specifier.startsWith('.')) return require(specifier);
    const filename = resolve(dirname(absolute), `${specifier}.ts`);
    const cached = cache.get(filename);
    if (cached) return cached.exports;
    const text = require('node:fs').readFileSync(filename, 'utf8');
    const compiled = ts.transpileModule(text, { compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
    } }).outputText;
    const child = new Module(filename);
    child.filename = filename;
    child.paths = Module._nodeModulePaths(dirname(filename));
    cache.set(filename, child);
    child.require = mod.require;
    child._compile(compiled, filename);
    return child.exports;
  };
  mod._compile(code, absolute);
  return mod.exports;
}

const report = await loadTs('src/services/reportService.ts');
const orden = {
  id: '00000000-0000-4000-8000-000000000001',
  proyecto_id: '00000000-0000-4000-8000-000000000002',
  ot: 'OT-PRUEBA', estado: 'En proceso', prioridad: 'Media',
  obra: 'Obra de prueba', ubicacion: 'Unidad de prueba',
  unidad_amenities: 'Departamento de prueba', rubro: 'Climatización',
  responsable: 'Equipo de prueba', descripcion: 'Reclamo de prueba',
  comentarios: '', campos: {}, fecha_ingreso: '2026-09-29',
};
const codigo = 'POT-2026-OS-00000001';
const contexto = { codigo, revision: 0, anio: 2026 };
const casos = [
  ['orden de servicio', report.generarInformeOrdenServicio(orden, '', undefined, codigo, [], contexto)],
  ['visita', report.generarFichaVisita(orden, undefined, [], codigo, contexto)],
  ['relevamiento', report.generarInformeRelevamiento(orden, '', [], undefined, codigo, [], contexto)],
  ['avance', report.generarInformeAvance(orden, '', [], [], undefined, codigo, [], contexto)],
  ['cierre', report.generarInformeCierre(orden, 'Obra de prueba', '', [], [], undefined, codigo, [], contexto)],
  ['acta', report.generarInformeActaConformidad(orden, undefined, codigo, contexto)],
  ['encuesta', report.generarEncuestaSatisfaccion(orden, undefined, codigo, contexto)],
];
if (process.argv.includes('--write-qa-html')) await mkdir('tmp/pdfs', { recursive: true });
let numero = 0;
for (const [nombre, html] of casos) {
  assert.match(html, /Revisión documental: R00/);
  assert.match(html, /Estado de emisión verificable en Plan-OTs/);
  const marca = /\bborrador\b|sin emitir|sin emisión/i.exec(html);
  assert.equal(marca, null, `${nombre}: ${marca?.[0]} cerca de ${marca ? html.slice(Math.max(0, marca.index - 100), marca.index + 120) : ''}`);
  assert.match(html, new RegExp(codigo));
}
const borrador = report.generarInformeOrdenServicio(orden, '', undefined, codigo);
assert.match(borrador, /BORRADOR · SIN EMISIÓN NI APROBACIÓN/);
const ordenConFotos = report.generarInformeOrdenServicio(orden, '', undefined, codigo,
  [{ id: 'foto-a', file_url: 'data:image/png;base64,AA==', descripcion: 'Primera' },
    { id: 'foto-b', file_url: 'data:image/png;base64,AA==', descripcion: 'Segunda' }], contexto);
assert.match(ordenConFotos, /Ref\. evidencia: foto-a/);
assert.match(ordenConFotos, /Ref\. evidencia: foto-b/);
const { materializarHtmlControlado, PLANTILLA_CONTROLADA_VERSION } =
  await loadTs('src/services/controlledReportService.ts');
const nombres = ['orden_servicio', 'visita', 'relevamiento', 'avance', 'cierre', 'acta', 'encuesta'];
const claves = ['origen', 'visita', 'relevamiento', 'avance', 'cierre', 'acta', 'encuesta'];
for (let i = 0; i < nombres.length; i++) {
  const revision = {
    id: '00000000-0000-4000-8000-000000000003',
    documento_id: '00000000-0000-4000-8000-000000000004',
    revision: 0, contenido_sha256: 'a'.repeat(64),
    plantilla_version: PLANTILLA_CONTROLADA_VERSION,
    datos: { observaciones: '', incluirFotos: false, [claves[i]]: {} },
  };
  const fuentes = {
    version: 1,
    empresa: {id:'tenant-qa',nombre:'Emisor de prueba <literal>'},
    documento: { id: revision.documento_id, codigo, tipo: nombres[i],
      orden_id: orden.id, proyecto_id: orden.proyecto_id, tenant_id: 'tenant-qa' },
    revision: { id: revision.id, numero: 0, datos_sha256: revision.contenido_sha256,
      plantilla_version: revision.plantilla_version },
    orden, proyecto: { id: orden.proyecto_id, tenant_id: 'tenant-qa', nombre: 'Obra de prueba' },
    fotos: [],
  };
  const materializado = materializarHtmlControlado(revision, fuentes, {});
  assert.match(materializado, /Estado de emisión verificable en Plan-OTs/);
  assert.match(materializado, /Emisor: Emisor de prueba &lt;literal&gt;/);
  assert.throws(() => materializarHtmlControlado(revision, {...fuentes,empresa:{id:'ajena',nombre:'Otra'}}, {}), /Empresa emisora ajena/);
  assert.doesNotMatch(materializado, /\bborrador\b|sin emitir|sin emisión/i);
  const originales = JSON.stringify({ revision, fuentes });
  const editada = { ...revision, datos: { ...revision.datos, identificacion: {
    obra: 'OBRA CORREGIDA QA', cliente: 'CLIENTE CORREGIDO QA',
    telefono: 'TEL CORREGIDO QA', descripcion: 'SOLICITUD CORREGIDA QA',
    unidad_amenities: '', responsable: '',
  } } };
  const conEdiciones = materializarHtmlControlado(editada, fuentes, {});
  assert.match(conEdiciones, /OBRA CORREGIDA QA/, nombres[i]);
  assert.match(conEdiciones, /CLIENTE CORREGIDO QA/, nombres[i]);
  assert.match(conEdiciones, /TEL CORREGIDO QA/, nombres[i]);
  if (nombres[i] === 'orden_servicio') assert.match(conEdiciones, /SOLICITUD CORREGIDA QA/);
  assert.doesNotMatch(conEdiciones, /Departamento de prueba|Equipo de prueba/, nombres[i]);
  assert.equal(JSON.stringify({ revision, fuentes }), originales, 'No modificar las fuentes');
  assert.throws(() => materializarHtmlControlado({ ...editada, datos: {
    ...editada.datos, identificacion: { cliente: 123 },
  } }, fuentes, {}), /Identificación.cliente inválido/);
  const legacy = { ...editada, plantilla_version: 'expediente-controlado-2026-09-29' };
  const htmlLegacy = materializarHtmlControlado(legacy, { ...fuentes,
    revision: { ...fuentes.revision, plantilla_version: legacy.plantilla_version } }, {});
  assert.doesNotMatch(htmlLegacy, /OBRA CORREGIDA QA/);
  if (process.argv.includes('--write-qa-html')) {
    numero++;
    await writeFile(`tmp/pdfs/controlado-${numero}.html`, materializado);
    if (nombres[i] === 'cierre') {
      const imagen = `data:image/png;base64,${(await readFile('scripts/fixtures/document-photo-qa.png')).toString('base64')}`;
      const fotos = Array.from({ length: 8 }, (_, j) => ({
        id: `00000000-0000-4000-8000-${String(j + 10).padStart(12, '0')}`,
        categoria: 'DESPUES',
        original_path: `tenant/proyecto/original-${j}.png`,
        edicion_path: `tenant/proyecto/foto-${j}.png`,
        descripcion: `Evidencia sintética ${j + 1} de 8. Verificación de imagen completa y descripción legible.`,
      }));
      const revisionLarga = { ...revision, datos: { ...revision.datos,
        incluirFotos: true, fotoIds: fotos.map(f => f.id),
        observaciones: 'Prueba de paginación y conservación de evidencias. '.repeat(30),
        cierre: { alcanceReferencia: 'Alcance ficticio QA R00',
          verificacion: 'Inspección sintética sin efectos sobre clientes reales. '.repeat(20),
          conclusion: 'Última conclusión de prueba: todas las evidencias deben conservarse.' },
        itemsCierre: Array.from({ length: 18 }, (_, j) => ({
          id: `QA-${j + 1}`, trabajo: `Trabajo ficticio ${j + 1}`,
          criterio: 'Verificación visual de la tabla y de sus saltos de página.',
          resultado: 'Conforme únicamente para el ensayo de impresión.',
          verificadorFecha: 'Equipo QA · 29/09/2026',
        })),
      } };
      const htmlLargo = materializarHtmlControlado(revisionLarga,
        { ...fuentes, fotos }, Object.fromEntries(fotos.map(f => [f.edicion_path, imagen])));
      for (const foto of fotos) assert.ok(htmlLargo.includes(foto.id));
      assert.match(htmlLargo, /QA-18/);
      await writeFile('tmp/pdfs/controlado-8.html', htmlLargo);
    }
  }
  assert.throws(() => materializarHtmlControlado(revision,
    { ...fuentes, documento: { ...fuentes.documento, orden_id: 'ajena' } }, {}),
  /no corresponden/);
  if (i === 0) {
    revision.datos.incluirFotos = true;
    revision.datos.fotoIds = ['00000000-0000-4000-8000-000000000005'];
    fuentes.fotos = [{ id: revision.datos.fotoIds[0], categoria: 'ANTES',
      edicion_path: 'tenant/proyecto/foto.jpg', original_path: 'tenant/proyecto/original.jpg' }];
    assert.throws(() => materializarHtmlControlado(revision, fuentes, {}), /Falta la imagen/);
    assert.throws(() => materializarHtmlControlado(revision,
      { ...fuentes, fotos: [{ ...fuentes.fotos[0], categoria: 'DESPUES' }] }, {}),
    /categoría de foto/);
  }
}
console.log('Siete plantillas, fuentes congeladas y controles de identidad: OK');
