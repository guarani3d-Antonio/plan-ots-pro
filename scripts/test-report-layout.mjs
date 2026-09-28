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
  id: `foto-prueba-${index + 1}`,
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
assert.match(html, /Ref\. evidencia: foto-prueba-1/);
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
  antecedentes: 'Reclamo previo OT-ANT-7', causa: 'Probable obstrucción; pendiente de desmontaje',
  planoReferencia: 'Plano AR-01, sector 204', cronograma: 'Propuesto: 24/09; sin aprobación',
  condicionesOperativas: 'Coordinar acceso con administración',
  decisionGarantia: 'Por determinar', fundamentoGarantia: 'Pendiente de revisar contrato y manual',
  alcance: 'A-1: reemplazar filtro', exclusiones: 'Sin pintura',
  criterios: 'C-1: presión ≥ 3 bar', decisionAlcance: 'Propuesto',
});
assert.match(relevamiento, /id="rel-modalidad"[^>]*>Remota<\/p>/);
assert.match(relevamiento, /id="rel-hallazgos"[^>]*>H-1: presión baja<\/p>/);
assert.match(relevamiento, /id="rel-criterios"[^>]*>C-1: presión ≥ 3 bar<\/p>/);
assert.match(relevamiento, /id="rel-decisionGarantia"[^>]*>Por determinar<\/p>/);
assert.match(relevamiento, /id="rel-planoReferencia"[^>]*>Plano AR-01, sector 204<\/p>/);
assert.doesNotMatch(relevamiento, /Trabajos requeridos|Materiales estimados|Tiempo estimado/);
assert.doesNotMatch(relevamiento, /Solicitud original\./);
const relevamientoConItems = reports.generarInformeRelevamiento(orden, '', [], {
  alcance: '', criterios: '', exclusiones: '',
}, undefined, [
  { id: 'A-01', trabajo: 'Reemplazar filtro', criterio: 'Presión estable: 3 bar' },
  { id: 'A-02', trabajo: '<Verificar fuga>', criterio: 'Sin pérdida visible' },
]);
assert.match(relevamientoConItems, /<table class="report-data-table">/);
assert.match(relevamientoConItems, /A-01<\/td><td id="rel-item-0-trabajo">Reemplazar filtro<\/td><td id="rel-item-0-criterio">Presión estable: 3 bar/);
assert.match(relevamientoConItems, /&lt;Verificar fuga&gt;/);
assert.doesNotMatch(relevamientoConItems, /<td><Verificar fuga><\/td>/);
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
const visita = reports.generarFichaVisita(orden, {
  fechaVisita: '2026-09-24', horaInicio: '09:00', horaFin: '09:45',
  propietario: 'Cliente de prueba', contacto: '+595 000 000',
  edificio: 'Obra de prueba', unidad: 'Unidad 204',
  responsableVisita: 'Técnica de prueba', participantes: 'Representante del cliente',
  descripcion: 'Inspección del equipo.', observacionesTecnicas: 'Ruido al encender.',
  restricciones: 'Sin acceso a sala técnica.', compromisos: 'Programar medición.',
  representantesPrevistos: 'BBC y propietario',
}, [photos[0]], 'POT-2026-VIS-00000002');
assert.equal(reports.informeDisponible('visita', 'Pendiente'), true);
assert.match(visita, /FICHA DE VISITA TÉCNICA/);
assert.match(visita, /id="vis-observacionesTecnicas"[^>]*>Ruido al encender\.<\/p>/);
assert.match(visita, /no acredita firma, conformidad del propietario/i);
assert.doesNotMatch(visita, /firmado por el cliente/i);
const aperturaConFoto = reports.generarInformeOrdenServicio(orden, '', origen, undefined, [photos[0]]);
assert.match(aperturaConFoto, /os-evidence-body/);
assert.match(aperturaConFoto, /Evidencia 1/);
const aperturaCodificada = reports.generarInformeOrdenServicio(orden, '', origen, 'POT-2026-OS-00000001');
assert.match(aperturaCodificada, /DOCUMENTO: POT-2026-OS-00000001/);
assert.match(aperturaConOrigen, /DOCUMENTO: Borrador sin reservar/);
assert.match(aperturaConOrigen, /id="os-canal">WhatsApp<\/p>/);
assert.match(aperturaConOrigen, /id="os-fechaRecepcion">2026-09-23 09:30<\/p>/);
assert.match(aperturaConOrigen, /id="os-referencia">&lt;mensaje #42&gt;<\/p>/);
assert.match(aperturaConOrigen, /id="os-proximoPaso">Agendar relevamiento<\/p>/);
assert.doesNotMatch(aperturaConOrigen, /<mensaje #42>|diagnóstico técnico inicial/i);
const avance = reports.generarInformeAvance({ ...orden, porcentaje_avance: 42 }, 'Trabajo del período.', [], [], {
  periodoDesde: '2026-09-20', periodoHasta: '2026-09-23',
  alcanceReferencia: 'POT-2026-REL-00000002 R01', acumulado: 'A-1: 2 de 4 unidades',
  porcentaje: '50', metodoPorcentaje: 'Unidades terminadas / 4',
  desvios: 'Sin desvíos informados al corte', proximoPeriodo: 'Completar 2 unidades',
});
assert.match(avance, /id="av-porcentaje"[^>]*>50<\/p>/);
assert.match(avance, /id="av-metodoPorcentaje"[^>]*>Unidades terminadas \/ 4<\/p>/);
assert.doesNotMatch(avance, /Avance operativo de la OT|>42%<|Diagnóstico Inicial/);
const avanceConItems = reports.generarInformeAvance(orden, '', [], [], undefined, undefined, [
  { id: 'A-01', previsto: '4 unidades', realizado: '2 unidades', saldo: '2 unidades' },
]);
assert.match(avanceConItems, /<table class="report-data-table report-data-table-wide">/);
assert.match(avanceConItems, /A-01<\/td><td id="av-item-0-previsto">4 unidades<\/td><td id="av-item-0-realizado">2 unidades<\/td><td id="av-item-0-saldo">2 unidades/);
const cierre = reports.generarInformeCierre(orden, 'Obra de prueba', 'Resultado técnico.', [], []);
assert.doesNotMatch(cierre, /<h3>Recepción<\/h3>|Evidencia final \(después\)/);
const cierreConItems = reports.generarInformeCierre(orden, 'Obra de prueba', '', [], [], undefined, undefined, [
  { id: 'A-01', trabajo: 'Filtro reemplazado', criterio: '3 bar', resultado: '3.2 bar', verificadorFecha: 'Técnica · 23/09' },
]);
assert.match(cierreConItems, /A-01<\/td><td id="cie-item-0-trabajo">Filtro reemplazado<\/td><td id="cie-item-0-criterio">3 bar<\/td><td id="cie-item-0-resultado">3.2 bar<\/td><td id="cie-item-0-verificadorFecha">Técnica · 23\/09/);
const cierreConDatos = reports.generarInformeCierre(
  { ...orden, fecha_inicio_trabajos: '2026-10-01' }, 'Obra de prueba',
  'Síntesis final.', [], [], {
    alcanceReferencia: 'POT-2026-REL-00000002 R01', cambiosAprobados: 'Sin cambios aprobados',
    inicioReal: '2026-09-21', finReal: '2026-09-23',
    ejecucionPorItem: 'A-1: cuatro unidades ejecutadas',
    verificacion: 'C-1: presión 3.2 bar; verificado por Técnica de prueba el 23/09',
    planoReferencia: 'Plano AR-01, sector 204',
    limpiezaVerificada: 'Revisada el 23/09 por Técnica de prueba',
    danosVerificados: 'Sin daños observados en revisión visual del 23/09',
    pendientes: 'P-1: entregar manual; responsable: Técnica; plazo: 25/09',
    entregables: 'Acta de prueba', conclusion: 'Con pendientes declarados',
    autorizacionInterna: 'Pendiente de autorización',
  },
);
assert.match(cierreConDatos, /id="cie-verificacion"[^>]*>C-1: presión 3.2 bar/);
assert.match(cierreConDatos, /id="cie-pendientes"[^>]*>P-1: entregar manual/);
assert.match(cierreConDatos, /id="cie-limpiezaVerificada"[^>]*>Revisada el 23\/09/);
assert.doesNotMatch(cierreConDatos, /2026-10-01|Aceptado por el cliente|Diagnóstico Inicial/);
const acta = reports.generarInformeActaConformidad(orden, {
  cierreReferencia: 'POT-2026-CIE-00000004 R01',
  objetoEntrega: 'Sistema de climatización reparado', anexosEntregados: 'Manual M-1',
  receptor: 'Representante de prueba', organizacion: 'Cliente de prueba',
  cargo: 'Administración', facultad: 'Pendiente de verificar',
  decisionPreparada: 'Aceptar con reservas', observacionesCliente: 'Solicita revisar ruido',
  reservas: 'Revisar ruido el 25/09',
  garantiaReferencia: 'Contrato C-1', garantiaCondiciones: 'Cobertura pendiente de confirmar',
});
assert.match(acta, /id="act-cierreReferencia"[^>]*>POT-2026-CIE-00000004 R01<\/p>/);
assert.match(acta, /Opción preparada \(sin manifestación\)/);
assert.match(acta, /id="act-observacionesCliente"[^>]*>Solicita revisar ruido<\/p>/);
assert.match(acta, /no acredita aceptación, firma ni garantía nueva/);
assert.doesNotMatch(acta, /Diagnóstico Inicial|pruebas finales|C-1: presión|firmado por el cliente/i);
const encuesta = reports.generarEncuestaSatisfaccion(orden, {
  fechaRespuesta: '2026-09-25', respondente: 'Cliente de prueba',
  relacionConOT: 'Propietario', modalidad: 'Formulario papel transcrito',
  referenciaFuente: 'Formulario F-1', satisfaccionGeneral: 'Satisfecho',
  resolucion: 'Parcialmente', calidadTrabajo: '8', plazoPrometido: 'Sí',
  comunicacion: 'Eficiente', profesionalismo: 'Sí', rapidez: 'Satisfecho',
  expectativas: 'Parcialmente', recomendacion: 'Probable',
  sugerencias: 'Mejorar los avisos de visita.',
}, 'POT-2026-ENC-00000007');
assert.match(encuesta, /ENCUESTA DE SATISFACCIÓN/);
assert.match(encuesta, /id="enc-resolucion"[^>]*>Parcialmente<\/p>/);
assert.match(encuesta, /no acreditan? autoría verificada/i);
assert.doesNotMatch(encuesta, /<title>Acta de conformidad|firmado por el cliente/i);
for (const documento of [aperturaConOrigen, visita, relevamiento, avance, cierreConDatos, acta, encuesta]) {
  assert.doesNotMatch(documento, /cdn\.tailwindcss\.com|fonts\.googleapis\.com|<script\b|<link\b[^>]*stylesheet/i);
  assert.match(documento, /@page\{/);
}
const portable = await hacerInformePortable(html);
assert.equal(portable.embeddedImages, 8);
assert.equal(portable.missingImages, 0);
assert.doesNotMatch(portable.html, /\.no-break,section,header/);
await mkdir('tmp/report-layout', { recursive: true });
await writeFile('tmp/report-layout/relevamiento-8-fotos.html', html);
await writeFile('tmp/report-layout/relevamiento-8-fotos-portable.html', portable.html);
await writeFile('tmp/report-layout/cierre-8-fotos.html', reports.generarInformeCierre(
  orden, 'Obra de prueba', 'Síntesis final. '.repeat(30), [], photos, {
    alcanceReferencia: 'POT-2026-REL-00000002 R01', cambiosAprobados: 'Sin cambios aprobados',
    inicioReal: '2026-09-21', finReal: '2026-09-23',
    ejecucionPorItem: 'A-1: cuatro unidades ejecutadas. '.repeat(15),
    verificacion: 'C-1: presión 3.2 bar, conforme. '.repeat(18),
    pendientes: 'Sin pendientes técnicos declarados', entregables: 'Manual M-1',
    conclusion: 'Conforme técnicamente, pendiente de autorización',
    autorizacionInterna: 'No registrada',
  },
));
await writeFile('tmp/report-layout/acta-borrador.html', acta);
await writeFile('tmp/report-layout/orden-servicio-borrador.html', aperturaConOrigen);
await writeFile('tmp/report-layout/orden-servicio-con-foto.html', aperturaConFoto);
await writeFile('tmp/report-layout/relevamiento-borrador.html', relevamiento);
await writeFile('tmp/report-layout/visita-borrador.html', visita);
await writeFile('tmp/report-layout/encuesta-borrador.html', encuesta);
await writeFile('tmp/report-layout/avance-borrador.html', avance);
console.log('Fixture de 8 imágenes y texto largo generado para revisión visual.');
