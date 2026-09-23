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
const reports = await import('../tmp/report-layout/report-service-fixture.js');
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
assert.doesNotMatch(html, /<div class="page-break"><\/div>/);
assert.doesNotMatch(html, /break-before: page; page-break-before: always/);
await mkdir('tmp/report-layout', { recursive: true });
await writeFile('tmp/report-layout/relevamiento-8-fotos.html', html);
console.log('Fixture de 8 imágenes y texto largo generado para revisión visual.');
