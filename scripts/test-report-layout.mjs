import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { build } from 'vite';

await build({
  configFile: false,
  build: {
    lib: { entry: 'src/services/reportService.ts', formats: ['es'], fileName: 'report-service-fixture' },
    outDir: 'tmp/report-layout', emptyOutDir: false, minify: false,
  },
});
await build({
  configFile: false,
  build: {
    lib: { entry: 'src/services/portableReportService.ts', formats: ['es'], fileName: 'portable-report-fixture' },
    outDir: 'tmp/report-layout', emptyOutDir: false, minify: false,
  },
});
const reports = await import('../tmp/report-layout/report-service-fixture.js');
const { hacerInformePortable } = await import('../tmp/report-layout/portable-report-fixture.js');
const image = (index) => `data:image/svg+xml;base64,${Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900"><rect width="1200" height="900" fill="#eef3f9"/><text x="90" y="460" font-family="Arial" font-size="100">Evidencia ${index}</text></svg>`).toString('base64')}`;
const photos = Array.from({ length: 8 }, (_, index) => ({
  file_url: image(index + 1),
  descripcion: `Evidencia ${index + 1}. ` + 'Texto de prueba para comprobar el flujo de una leyenda extensa. '.repeat(index % 3 ? 3 : 14),
}));
const orden = {
  id: '00000000-0000-4000-8000-000000000001', proyecto_id: '00000000-0000-4000-8000-000000000002',
  ot: 'OT-PRUEBA', ubicacion: 'Sector de prueba', rubro: 'Aire acondicionado',
  estado: 'En proceso', responsable: 'Técnica de prueba', prioridad: 'Media',
  pos_x: .5, pos_y: .5, plano_ref_url: '', comentarios: '', campos: {},
  created_by: null, updated_by: null, created_at: '2026-09-23T00:00:00Z',
  updated_at: '2026-09-23T00:00:00Z', _synced: true, _last_fetched: 0,
  fotos_pendientes_upload: [], conflict_flag: false, fecha_ingreso: '2026-09-23',
  obra: 'Obra de prueba', unidad_amenities: 'Unidad 204', descripcion: 'Solicitud original.',
};
const html = reports.generarInformeRelevamiento(orden, 'Diagnóstico de prueba. '.repeat(80), photos);
assert.equal((html.match(/class="evidencia-bloque"/g) ?? []).length, 8);
assert.equal((html.match(/break-inside: avoid; page-break-inside: avoid; margin: 0 0 18px/g) ?? []).length, 8);
assert.deepEqual(
  [...html.matchAll(/alt="Evidencia fotográfica (\d+)"/g)].map(match => Number(match[1])),
  [1, 2, 3, 4, 5, 6, 7, 8],
);
assert.doesNotMatch(html, /<div class="page-break"><\/div>/);
assert.doesNotMatch(html, /break-before: page; page-break-before: always/);
const relevamiento = reports.generarInformeRelevamiento(orden, 'Causa probable: filtro obstruido.', [], {
  modalidad: 'Remota', fechaIntervencion: '2026-09-23', tecnico: 'Técnica de prueba',
  participantes: 'Cliente', condiciones: 'Acceso limitado',
  hallazgos: 'H-1: presión baja', pruebas: 'Medición informada: 2 bar',
  alcance: 'A-1: reemplazar filtro', exclusiones: 'Sin pintura',
  criterios: 'C-1: presión ≥ 3 bar', decisionAlcance: 'Propuesto',
});
assert.match(relevamiento, /id="rel-modalidad"[^>]*>Remota<\/p>/);
assert.match(relevamiento, /id="rel-hallazgos"[^>]*>H-1: presión baja<\/p>/);
assert.match(relevamiento, /id="rel-criterios"[^>]*>C-1: presión ≥ 3 bar<\/p>/);
assert.doesNotMatch(relevamiento, /Trabajos requeridos|Materiales estimados|Tiempo estimado/);
assert.doesNotMatch(relevamiento, /Solicitud original\./);
const apertura = reports.generarInformeOrdenServicio(orden, 'Aclaración posterior.');
assert.equal((apertura.match(/id="bloque-texto-naranja"/g) ?? []).length, 1);
assert.match(apertura, /Solicitud original\./);
assert.match(apertura, /Aclaración posterior\./);
assert.doesNotMatch(apertura, /CHECKLIST DE VERIFICACIÓN PRE-TRABAJO/i);
const origen = {
  canal: 'WhatsApp', fechaRecepcion: '2026-09-23T09:30',
  solicitante: 'Cliente de prueba', contacto: '+595 000 000',
  referencia: '<mensaje #42>', urgencia: 'Alta', proximoPaso: 'Agendar relevamiento',
};
const aperturaConOrigen = reports.generarInformeOrdenServicio(orden, '', origen);
assert.match(aperturaConOrigen, /id="os-canal">WhatsApp<\/p>/);
assert.match(aperturaConOrigen, /id="os-fechaRecepcion">2026-09-23 09:30<\/p>/);
assert.match(aperturaConOrigen, /id="os-referencia">&lt;mensaje #42&gt;<\/p>/);
assert.match(aperturaConOrigen, /id="os-proximoPaso">Agendar relevamiento<\/p>/);
assert.doesNotMatch(aperturaConOrigen, /<mensaje #42>|diagnóstico técnico inicial/i);
const cierre = reports.generarInformeCierre(orden, 'Obra de prueba', 'Resultado técnico.', [], []);
assert.doesNotMatch(cierre, /<h3>Recepción<\/h3>|Evidencia final \(después\)/);
const portable = await hacerInformePortable(html);
assert.equal(portable.embeddedImages, 8);
assert.equal(portable.missingImages, 0);
assert.doesNotMatch(portable.html, /\.no-break,section,header/);
await mkdir('tmp/report-layout', { recursive: true });
await writeFile('tmp/report-layout/relevamiento-8-fotos.html', html);
await writeFile('tmp/report-layout/relevamiento-8-fotos-portable.html', portable.html);
console.log('Fixture de 8 imágenes y texto largo generado para revisión visual.');
