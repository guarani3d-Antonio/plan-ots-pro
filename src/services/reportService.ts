// Borradores de los documentos de una OT. La emisión formal se implementa
// sobre revisiones y artefactos persistidos; imprimir aquí no equivale a emitir.

import type { OrdenLocal } from '../types/orden';
import type { ContextoReporteControlado } from './reportTemplates';
import { ETAPAS_OT, ENCUESTA_PREGUNTAS, TEXTO_ACTA } from './otStageSchema';
import {
  escapeHtml,
  formatearFechaCorta,
  generarGridFotos,
  _paginaHeader,
  _envolverInforme,
  _bloqueDatosCliente,
  _bloqueNaranjaIzquierdo,
  _seccionInforme,
} from './reportTemplates';

export type TipoInforme = 'orden_servicio' | 'visita' | 'relevamiento' | 'avance' | 'cierre' | 'acta_conformidad' | 'encuesta';

export interface OrigenOrdenServicio {
  canal: string;
  fechaRecepcion: string;
  solicitante: string;
  contacto: string;
  referencia: string;
  urgencia: string;
  proximoPaso: string;
}

export interface DatosVisita {
  tipoVisita?: string; horaAcordada?: string; horaLlegada?: string; horaSalida?: string;
  esperaMotivo?: string; acceso?: string; autorizaAcceso?: string; recibidoPor?: string;
  recorrido?: string; sectoresNoVisitados?: string; seguridad?: string; permiso?: string;
  riesgos?: string; medidasSeguridad?: string; actividad?: string; metodo?: string;
  resultado?: string; limitesVerificacion?: string;
  fechaVisita: string;
  horaInicio: string;
  horaFin: string;
  propietario: string;
  contacto: string;
  edificio: string;
  unidad: string;
  responsableVisita: string;
  participantes: string;
  descripcion: string;
  observacionesTecnicas: string;
  restricciones: string;
  compromisos: string;
  representantesPrevistos: string;
}

export interface DatosRelevamiento {
  visitaReferencia?: string; inicioPrevisto?: string; finPrevisto?: string;
  modalidad: string;
  fechaIntervencion: string;
  tecnico: string;
  participantes: string;
  antecedentes: string;
  condiciones: string;
  hallazgos: string;
  pruebas: string;
  causa: string;
  planoReferencia: string;
  alcance: string;
  exclusiones: string;
  criterios: string;
  cronograma: string;
  condicionesOperativas: string;
  decisionGarantia: string;
  fundamentoGarantia: string;
  decisionAlcance: string;
}

export interface ItemAlcance {
  rubro?: string; profesional?: string;
  id: string;
  trabajo: string;
  criterio: string;
}

export interface DatosAvance {
  periodoDesde: string;
  periodoHasta: string;
  alcanceReferencia: string;
  acumulado: string;
  porcentaje: string;
  metodoPorcentaje: string;
  desvios: string;
  proximoPeriodo: string;
}

export interface ItemAvance {
  id: string;
  previsto: string;
  realizado: string;
  saldo: string;
}

export interface DatosCierre {
  alcanceReferencia: string;
  cambiosAprobados: string;
  inicioReal: string;
  finReal: string;
  ejecucionPorItem: string;
  verificacion: string;
  planoReferencia: string;
  limpiezaVerificada: string;
  danosVerificados: string;
  pendientes: string;
  entregables: string;
  conclusion: string;
  autorizacionInterna: string;
}

export interface ItemCierre {
  id: string;
  trabajo: string;
  criterio: string;
  resultado: string;
  verificadorFecha: string;
}

export interface DatosActa {
  documentoReceptor?: string; fechaEntrega?: string;
  cierreReferencia: string;
  objetoEntrega: string;
  anexosEntregados: string;
  receptor: string;
  organizacion: string;
  cargo: string;
  facultad: string;
  decisionPreparada: string;
  observacionesCliente: string;
  reservas: string;
  garantiaReferencia: string;
  garantiaCondiciones: string;
}

export interface DatosEncuesta {
  confianza?: string; recontratacion?: string;
  fechaRespuesta: string;
  respondente: string;
  relacionConOT: string;
  modalidad: string;
  referenciaFuente: string;
  satisfaccionGeneral: string;
  resolucion: string;
  calidadTrabajo: string;
  plazoPrometido: string;
  comunicacion: string;
  profesionalismo: string;
  rapidez: string;
  expectativas: string;
  recomendacion: string;
  sugerencias: string;
}

export function informeDisponible(tipo: TipoInforme, estadoOT: string): boolean {
  switch (tipo) {
    case 'orden_servicio':
    case 'visita':
    case 'encuesta':
    case 'relevamiento': return true;
    case 'avance': return estadoOT === 'En proceso' || estadoOT === 'Cerrada';
    case 'cierre':
    case 'acta_conformidad': return estadoOT === 'Cerrada';
  }
}

// La encuesta es una pieza independiente del acta. El borrador puede transcribir
// respuestas, pero no atribuye identidad o firma verificada al respondente.
export function generarEncuestaSatisfaccion(
  orden: OrdenLocal,
  datos?: DatosEncuesta,
  codigoDocumento?: string,
  contexto?: ContextoReporteControlado,
): string {
  const campo = (clave: keyof DatosEncuesta) =>
    `<p id="enc-${clave}" style="white-space:pre-line">${escapeHtml(datos?.[clave] || 'Sin respuesta')}</p>`;
  const pregunta = (numero: number, titulo: string, escala: string, clave: keyof DatosEncuesta) =>
    `<section class="p-4 border border-outline-variant rounded-lg mb-4 no-break"><strong>${numero}. ${escapeHtml(titulo)}</strong><small style="display:block;color:#64748B;margin-top:4px">${escapeHtml(escala)}</small>${campo(clave)}</section>`;
  const contenido = `<div class="a4-page">
${_paginaHeader(orden, 'ENCUESTA DE SATISFACCIÓN', 'Experiencia declarada sobre la atención de Facility Services; no reemplaza el acta de conformidad.', codigoDocumento, contexto)}
${_bloqueDatosCliente(orden)}
${_seccionInforme(1, 'Procedencia de las respuestas')}
<section class="grid grid-cols-2 gap-4 mb-6">
  <div class="p-4 border border-outline-variant rounded-lg"><strong>Fecha de respuesta declarada</strong>${campo('fechaRespuesta')}</div>
  <div class="p-4 border border-outline-variant rounded-lg"><strong>Persona consultada (verificar al responder)</strong>${campo('respondente')}</div>
  <div class="p-4 border border-outline-variant rounded-lg"><strong>Relación con la OT</strong>${campo('relacionConOT')}</div>
  <div class="p-4 border border-outline-variant rounded-lg"><strong>Modalidad de captura</strong>${campo('modalidad')}</div>
</section>
<section class="p-4 border border-outline-variant rounded-lg mb-4"><strong>Referencia al formulario o comunicación de origen</strong>${campo('referenciaFuente')}</section>
${_seccionInforme(2, 'Evaluación de la atención')}
${ENCUESTA_PREGUNTAS.map(([clave,titulo],i)=>pregunta(i+1,titulo,'1 = valoración mínima · 10 = máxima · N/A = no corresponde',clave)).join('')}
${pregunta(8, 'Sugerencias o comentarios adicionales', 'Respuesta libre', 'sugerencias')}
${(['satisfaccionGeneral','resolucion','comunicacion','expectativas'] as const).filter(k=>datos?.[k]).map(k=>pregunta(0,`Registro anterior: ${k}`,'Respuesta anterior conservada sin conversión de escala',k)).join('')}
<p class="text-xs text-on-surface-variant">${contexto ? 'Respuestas registradas. Este documento no acredita por sí solo autoría verificada del cliente, firma, conformidad con el trabajo ni decisión sobre el acta.' : 'Borrador de respuestas registradas. No acredita autoría verificada del cliente, firma, conformidad con el trabajo ni decisión sobre el acta.'}</p>
</div>`;
  return _envolverInforme(`Encuesta de satisfacción${contexto ? '' : ' — borrador'}`, contenido, contexto);
}

// La ficha prepara el registro de una visita; su borrador no acredita que haya
// ocurrido. La fecha de apertura y el estado de la OT no prueban la visita.
export function generarFichaVisita(
  orden: OrdenLocal,
  datos?: DatosVisita,
  fotosVisita: { id?: string; file_url: string; descripcion?: string | null; descripcion_observacion?: string | null }[] = [],
  codigoDocumento?: string,
  contexto?: ContextoReporteControlado,
): string {
  const campo = (clave: keyof DatosVisita) =>
    `<p id="vis-${clave}" style="white-space:pre-line">${escapeHtml(datos?.[clave] || 'No registrado')}</p>`;
  const bloque = (titulo: string, clave: keyof DatosVisita) =>
    `<section class="p-4 border border-outline-variant rounded-lg mb-4"><strong>${titulo}</strong>${campo(clave)}</section>`;
  const contenido = `<div class="a4-page">
${_paginaHeader(orden, 'FICHA DE VISITA TÉCNICA', contexto ? 'Registro de la visita técnica documentada.' : 'Registro de visita en preparación. Debe completarse con lo observado cuando la visita haya ocurrido.', codigoDocumento, contexto)}
${_bloqueDatosCliente(orden)}
${ETAPAS_OT.find(e=>e.tipo==='visita')!.groups.map((g,i)=>`${_seccionInforme(i+1,g.title.replace(/^\d+ · /,''))}<section class="grid grid-cols-2 gap-4 mb-6">${g.fields.map(f=>bloque(f.label,f.key as keyof DatosVisita)).join('')}</section>`).join('')}
<p class="text-xs text-on-surface-variant">${contexto ? 'Esta ficha no acredita firma ni conformidad del propietario. Las firmas requieren un registro vinculado a esta revisión exacta.' : 'Este borrador no acredita firma, conformidad del propietario ni aprobación técnica. Las firmas requieren un registro vinculado a esta revisión exacta.'}</p>
${fotosVisita.length ? `<h3 class="font-section-header text-section-header text-primary uppercase tracking-widest">Evidencia vinculada a la visita</h3>${generarGridFotos(fotosVisita)}` : ''}
</div>`;
  return _envolverInforme(`Ficha de visita técnica${contexto ? '' : ' — borrador'}`, contenido, contexto);
}

// Cierre técnico: resultados finales frente al alcance aprobado, sin recepción.

export function generarInformeCierre(
  orden: OrdenLocal & { proyecto_nombre?: string },
  proyectoNombre: string,
  observaciones: string,
  _fotosAntes: { file_url: string; descripcion?: string | null; descripcion_observacion?: string | null }[],
  fotosDespues: { file_url: string; descripcion?: string | null; descripcion_observacion?: string | null }[],
  datos?: DatosCierre,
  codigoDocumento?: string,
  itemsCierre: ItemCierre[] = [],
  contexto?: ContextoReporteControlado,
): string {
  const campo = (clave: keyof DatosCierre) =>
    `<p id="cie-${clave}" style="white-space:pre-line">${escapeHtml(datos?.[clave] || 'No registrado')}</p>`;
  const bloque = (titulo: string, clave: keyof DatosCierre) =>
    `<section class="p-4 border border-outline-variant rounded-lg mb-4"><strong>${titulo}</strong>${campo(clave)}</section>`;
  const tablaCierre = itemsCierre.length ? `<table class="report-data-table report-data-table-wide">
  <thead><tr><th>Ítem</th><th>Trabajo</th><th>Criterio</th><th>Resultado</th><th>Verificador y fecha</th></tr></thead>
  <tbody>${itemsCierre.map((item, index) => `<tr><td>${escapeHtml(item.id)}</td><td id="cie-item-${index}-trabajo">${escapeHtml(item.trabajo.trim() || 'No registrado')}</td><td id="cie-item-${index}-criterio">${escapeHtml(item.criterio.trim() || 'No registrado')}</td><td id="cie-item-${index}-resultado">${escapeHtml(item.resultado.trim() || 'No registrado')}</td><td id="cie-item-${index}-verificadorFecha">${escapeHtml(item.verificadorFecha.trim() || 'No registrado')}</td></tr>`).join('')}</tbody>
</table>` : '';
  const contenido = `<div class="a4-page">
${_paginaHeader(orden, 'INFORME DE CIERRE TÉCNICO', 'Resultados de la intervención y pendientes de verificación. La recepción del cliente corresponde al acta.', codigoDocumento, contexto)}
${_bloqueDatosCliente(orden)}
${_seccionInforme(1, 'Base y ejecución final')}
<section class="grid grid-cols-2 gap-4 mb-6">
  <div class="p-4 border border-outline-variant rounded-lg"><strong>Proyecto</strong><p>${escapeHtml(proyectoNombre)}</p></div>
  <div class="p-4 border border-outline-variant rounded-lg"><strong>Alcance aprobado de referencia</strong>${campo('alcanceReferencia')}</div>
  <div class="p-4 border border-outline-variant rounded-lg"><strong>Inicio real declarado</strong>${campo('inicioReal')}</div>
  <div class="p-4 border border-outline-variant rounded-lg"><strong>Fin real declarado</strong>${campo('finReal')}</div>
</section>
${bloque('Cambios de alcance aprobados (referencias)', 'cambiosAprobados')}
${_bloqueNaranjaIzquierdo('Síntesis del resultado técnico', observaciones, 'No se registró una síntesis técnica.')}
${_seccionInforme(2, 'Comprobación de criterios')}
${tablaCierre}
${itemsCierre.length ? (datos?.ejecucionPorItem?.trim() ? bloque('Notas generales de ejecución final', 'ejecucionPorItem') : '') : bloque('Ejecución final por ítem del alcance', 'ejecucionPorItem')}
${itemsCierre.length ? (datos?.verificacion?.trim() ? bloque('Pruebas y verificaciones adicionales', 'verificacion') : '') : bloque('Pruebas finales: criterio, método, resultado, verificador y fecha', 'verificacion')}
${bloque('Ubicación y referencia en plano', 'planoReferencia')}
${bloque('Limpieza: comprobación, responsable y fecha', 'limpiezaVerificada')}
${bloque('Daños: comprobación, responsable y fecha', 'danosVerificados')}
${bloque('Pendientes, restricciones y acciones acordadas', 'pendientes')}
${bloque('Entregables técnicos efectivamente entregados', 'entregables')}
${_seccionInforme(3, 'Pendientes y decisión técnica')}
${bloque('Conclusión técnica declarada', 'conclusion')}
${bloque('Autorización interna: actor y referencia', 'autorizacionInterna')}
<p class="text-xs text-on-surface-variant">El estado de la OT no acredita pruebas ni autorización. ${contexto ? 'Este informe no equivale a conformidad del cliente.' : 'Este borrador no equivale a conformidad del cliente.'}</p>
${fotosDespues.length ? `<h3 class="font-section-header text-section-header text-primary uppercase tracking-widest">Evidencia final (después)</h3>
${generarGridFotos(fotosDespues)}` : ''}
</div>`;
  return _envolverInforme(`Informe de cierre técnico${contexto ? '' : ' — borrador'}`, contenido, contexto);
}

// La orden de servicio documenta la solicitud recibida. No supone una visita.
export function generarInformeOrdenServicio(
  orden: OrdenLocal,
  aclaracion: string,
  origen?: OrigenOrdenServicio,
  codigoDocumento?: string,
  fotosCliente: { file_url: string; descripcion?: string | null; descripcion_observacion?: string | null }[] = [],
  contexto?: ContextoReporteControlado,
): string {
  const dato = (clave: keyof OrigenOrdenServicio, legado: string) => {
    const valor = origen ? origen[clave] : orden.campos?.[legado];
    return typeof valor === 'string' && valor.trim() ? valor.trim() : 'No registrado';
  };

  const contenido = `<div class="a4-page os-page">
${_paginaHeader(orden, 'ORDEN DE SERVICIO', 'Registro de apertura de la orden de trabajo y procedencia de la solicitud. No certifica una visita ni un diagnóstico.', codigoDocumento, contexto)}
${_bloqueDatosCliente(orden, false)}
${_seccionInforme(1, 'Origen y solicitud')}
<section class="grid grid-cols-2 os-meta gap-4 mb-6 no-break">
  <div class="p-4 border border-outline-variant rounded-lg"><strong>Fecha de ingreso de OT</strong><p>${escapeHtml(formatearFechaCorta(orden.fecha_ingreso))}</p></div>
  <div class="p-4 border border-outline-variant rounded-lg"><strong>Canal de solicitud</strong><p id="os-canal">${escapeHtml(dato('canal', 'canal_solicitud'))}</p></div>
  <div class="p-4 border border-outline-variant rounded-lg"><strong>Fecha y hora de recepción declarada</strong><p id="os-fechaRecepcion">${escapeHtml(dato('fechaRecepcion', 'fecha_solicitud').replace('T', ' '))}</p></div>
  <div class="p-4 border border-outline-variant rounded-lg"><strong>Solicitante</strong><p id="os-solicitante">${escapeHtml(dato('solicitante', 'solicitante'))}</p></div>
  <div class="p-4 border border-outline-variant rounded-lg"><strong>Contacto de origen</strong><p id="os-contacto">${escapeHtml(dato('contacto', 'contacto_solicitante'))}</p></div>
  <div class="p-4 border border-outline-variant rounded-lg"><strong>Referencia del mensaje</strong><p id="os-referencia">${escapeHtml(dato('referencia', 'referencia_solicitud'))}</p></div>
  <div class="p-4 border border-outline-variant rounded-lg"><strong>Urgencia manifestada</strong><p id="os-urgencia">${escapeHtml(dato('urgencia', 'urgencia_solicitada'))}</p></div>
</section>
${_bloqueNaranjaIzquierdo('Solicitud original', orden.descripcion ?? '', 'No se ha registrado el reclamo original.', '')}
${fotosCliente.length ? `<section class="os-evidence"><strong>Evidencia aportada al ingreso · ${fotosCliente.length} foto(s)</strong>
  ${generarGridFotos(fotosCliente)}
  <p class="text-xs text-on-surface-variant">Las imágenes aportadas no acreditan por sí solas una visita técnica.</p></section>` : ''}
${_bloqueNaranjaIzquierdo('Aclaración posterior', aclaracion, 'Sin aclaraciones posteriores.')}
${_seccionInforme(2, 'Seguimiento del pedido')}
<section class="p-4 border border-outline-variant rounded-lg no-break mt-4"><strong>Próximo paso acordado</strong><p id="os-proximoPaso">${escapeHtml(dato('proximoPaso', 'proximo_paso'))}</p></section>
</div>`;

  return _envolverInforme(`Orden de servicio${contexto ? '' : ' — borrador'}`, contenido, contexto);
}

// ─────────────────────────────────────────── Informe de Relevamiento ──
//
// Página 1: datos OT + diagnóstico inicial + alcance detectado (3 bloques con
// líneas en blanco) + firmas.
// Página 2: filmografía ANTES (vía generarGridFotos).

export function generarInformeRelevamiento(
  orden: OrdenLocal,
  comentarioInicial: string,
  fotosAntes: { file_url: string; descripcion?: string | null; descripcion_observacion?: string | null }[],
  datos?: DatosRelevamiento,
  codigoDocumento?: string,
  itemsAlcance: ItemAlcance[] = [],
  contexto?: ContextoReporteControlado,
): string {
  const campo = (clave: keyof DatosRelevamiento) => {
    const valor = datos?.[clave];
    return `<p id="rel-${clave}" style="white-space:pre-line">${escapeHtml(valor || 'No registrado')}</p>`;
  };
  const bloque = (titulo: string, clave: keyof DatosRelevamiento) =>
    `<section class="p-4 border border-outline-variant rounded-lg mb-4"><strong>${titulo}</strong>${campo(clave)}</section>`;
  const tablaAlcance = itemsAlcance.length ? `<table class="report-data-table">
  <thead><tr><th>Ítem</th><th>Trabajo propuesto</th><th>Rubro / profesional</th><th>Criterio de aceptación propuesto</th></tr></thead>
  <tbody>${itemsAlcance.map((item, index) => `<tr><td>${escapeHtml(item.id)}</td><td id="rel-item-${index}-trabajo">${escapeHtml(item.trabajo.trim() || 'No registrado')}</td><td>${escapeHtml(item.rubro || 'No registrado')}<br/>${escapeHtml(item.profesional || 'No registrado')}</td><td id="rel-item-${index}-criterio">${escapeHtml(item.criterio.trim() || 'No registrado')}</td></tr>`).join('')}</tbody>
</table>` : '';

  const contenido = `<div class="a4-page relevamiento-page">
${_paginaHeader(orden, 'INFORME DE RELEVAMIENTO', 'Diagnóstico técnico inicial y detección del alcance de la intervención requerida.', codigoDocumento, contexto)}
${_bloqueDatosCliente(orden)}
${_seccionInforme(1, 'Hallazgo y diagnóstico')}
<section class="grid grid-cols-2 gap-4 mb-6">
  <div class="p-4 border border-outline-variant rounded-lg"><strong>Modalidad (visita o remota)</strong>${campo('modalidad')}</div>
  <div class="p-4 border border-outline-variant rounded-lg"><strong>Fecha de intervención declarada</strong>${campo('fechaIntervencion')}</div>
  <div class="p-4 border border-outline-variant rounded-lg"><strong>Técnico interviniente</strong>${campo('tecnico')}</div>
  <div class="p-4 border border-outline-variant rounded-lg"><strong>Participantes</strong>${campo('participantes')}</div>
</section>
${bloque('Visita de referencia', 'visitaReferencia')}
${bloque('Antecedentes pertinentes de la solicitud', 'antecedentes')}
${bloque('Condiciones, acceso y límites de observación', 'condiciones')}
${bloque('Hallazgos y evidencia relacionada', 'hallazgos')}
${bloque('Pruebas y mediciones realizadas', 'pruebas')}
${_bloqueNaranjaIzquierdo('Diagnóstico Inicial', comentarioInicial, 'Sin diagnóstico registrado.')}
${bloque('Causa confirmada, probable o no determinada y sustento', 'causa')}
${bloque('Ubicación y referencia en plano', 'planoReferencia')}
${_seccionInforme(2, 'Plan de trabajo y cronograma previsto')}
${tablaAlcance}
${itemsAlcance.length ? (datos?.alcance?.trim() ? bloque('Notas generales del alcance', 'alcance') : '') : bloque('Alcance propuesto', 'alcance')}
${bloque('Exclusiones y supuestos', 'exclusiones')}
${itemsAlcance.length ? (datos?.criterios?.trim() ? bloque('Criterios adicionales', 'criterios') : '') : bloque('Criterios de aceptación propuestos', 'criterios')}
<section class="grid grid-cols-2 gap-4 mb-6">${bloque('Inicio previsto', 'inicioPrevisto')}${bloque('Fin previsto', 'finPrevisto')}</section>
${bloque('Cronograma propuesto o aprobado y su referencia', 'cronograma')}
${bloque('Condiciones operativas acordadas para esta intervención', 'condicionesOperativas')}
${_seccionInforme(3, 'Cobertura y decisión')}
${bloque('Aplicabilidad de garantía declarada', 'decisionGarantia')}
${bloque('Fundamento contractual o técnico de la cobertura', 'fundamentoGarantia')}
${bloque('Estado declarado del alcance', 'decisionAlcance')}
<p class="text-xs text-on-surface-variant">${contexto ? 'La aprobación del alcance se registra por separado y se vincula a esta revisión y a su actor autorizado.' : 'Este borrador no acredita aprobación del alcance. La autorización debe vincularse a una revisión y a su actor con facultades.'}</p>
</div>
${fotosAntes.length ? `<div class="a4-page">
<div>
  <div class="flex items-center gap-2.5 mb-5 border-b border-outline-variant pb-2">
    <h3 class="font-section-header text-section-header text-primary uppercase tracking-widest">Fotografías previas vinculadas a la OT</h3>
  </div>
  <p class="text-xs text-on-surface-variant">El origen, autor, fecha y relación con cada hallazgo deben verificarse antes de emitir. Una foto previa no acredita por sí sola una visita técnica.</p>
  ${generarGridFotos(fotosAntes)}
</div>
</div>` : ''}`;

  return _envolverInforme(`Informe de relevamiento${contexto ? '' : ' — borrador'}`, contenido, contexto);
}

// El indicador operativo no se presenta como avance aprobado.

export function generarInformeAvance(
  orden: OrdenLocal,
  comentarioAvance: string,
  _fotosAntes: { file_url: string; descripcion?: string | null; descripcion_observacion?: string | null }[],
  fotosDurante: { file_url: string; descripcion?: string | null; descripcion_observacion?: string | null }[],
  datos?: DatosAvance,
  codigoDocumento?: string,
  itemsAvance: ItemAvance[] = [],
  contexto?: ContextoReporteControlado,
): string {
  const campo = (clave: keyof DatosAvance) =>
    `<p id="av-${clave}" style="white-space:pre-line">${escapeHtml(datos?.[clave] || 'No registrado')}</p>`;
  const bloque = (titulo: string, clave: keyof DatosAvance) =>
    `<section class="p-4 border border-outline-variant rounded-lg mb-4"><strong>${titulo}</strong>${campo(clave)}</section>`;
  const tablaAvance = itemsAvance.length ? `<table class="report-data-table report-data-table-wide">
  <thead><tr><th>Ítem</th><th>Previsto</th><th>Realizado en el corte</th><th>Saldo pendiente</th></tr></thead>
  <tbody>${itemsAvance.map((item, index) => `<tr><td>${escapeHtml(item.id)}</td><td id="av-item-${index}-previsto">${escapeHtml(item.previsto.trim() || 'No registrado')}</td><td id="av-item-${index}-realizado">${escapeHtml(item.realizado.trim() || 'No registrado')}</td><td id="av-item-${index}-saldo">${escapeHtml(item.saldo.trim() || 'No registrado')}</td></tr>`).join('')}</tbody>
</table>` : '';
  const contenido = `<div class="a4-page">
${_paginaHeader(orden, 'INFORME DE AVANCE', contexto ? 'Estado de la ejecución durante el período y corte identificados.' : 'Estado de la ejecución durante un período determinado. El corte y su revisión deberán quedar identificados al emitir.', codigoDocumento, contexto)}
${_bloqueDatosCliente(orden)}
${_seccionInforme(1, 'Resultado del período')}
<section class="grid grid-cols-2 gap-4 mb-6">
  <div class="p-4 border border-outline-variant rounded-lg"><strong>Período desde</strong>${campo('periodoDesde')}</div>
  <div class="p-4 border border-outline-variant rounded-lg"><strong>Corte hasta</strong>${campo('periodoHasta')}</div>
</section>
${bloque('Alcance aprobado de referencia (código y revisión)', 'alcanceReferencia')}
${_bloqueNaranjaIzquierdo('Trabajo observado en este corte', comentarioAvance, 'Sin avance técnico registrado para este corte.')}
${tablaAvance}
${itemsAvance.length ? (datos?.acumulado?.trim() ? bloque('Notas generales de avance acumulado', 'acumulado') : '') : bloque('Avance acumulado y saldo por ítem', 'acumulado')}
${_seccionInforme(2, 'Previsto frente a realizado')}
<section class="grid grid-cols-2 gap-4 mb-6">
  <div class="p-4 border border-outline-variant rounded-lg"><strong>Porcentaje declarado al corte</strong>${campo('porcentaje')}</div>
  <div class="p-4 border border-outline-variant rounded-lg"><strong>Método y base de cálculo</strong>${campo('metodoPorcentaje')}</div>
</section>
${bloque('Desvíos, impacto y acciones', 'desvios')}
${_seccionInforme(3, 'Desvíos y siguiente decisión')}
${bloque('Objetivos y dependencias del próximo período', 'proximoPeriodo')}
<p class="text-xs text-on-surface-variant">Un porcentaje sin método, base y alcance aprobado no acredita el progreso. ${contexto ? 'La recepción del cliente se documenta por separado.' : 'Este borrador no certifica ejecución ni recepción.'}</p>
${fotosDurante.length ? `<h3 class="font-section-header text-section-header text-primary uppercase tracking-widest">Evidencia de ejecución (durante)</h3>
${generarGridFotos(fotosDurante)}` : ''}
</div>`;
  return _envolverInforme(`Informe de avance${contexto ? '' : ' — borrador'}`, contenido, contexto);
}

// Acta sin decisión/firma: siempre borrador. La recepción vinculante requerirá
// una revisión emitida y la manifestación verificable del receptor autorizado.

export function generarInformeActaConformidad(orden: OrdenLocal, datos?: DatosActa,
  codigoDocumento?: string, contexto?: ContextoReporteControlado): string {
  const campo = (clave: keyof DatosActa) =>
    `<p id="act-${clave}" style="white-space:pre-line">${escapeHtml(datos?.[clave] || 'No registrado')}</p>`;
  const bloque = (titulo: string, clave: keyof DatosActa) =>
    `<section class="p-4 border border-outline-variant rounded-lg mb-4"><strong>${titulo}</strong>${campo(clave)}</section>`;
  const contenido = `<div class="a4-page acta-page">
${_paginaHeader(orden, 'ACTA DE CONFORMIDAD', 'Instrumento de recepción pendiente de decisión expresa del cliente.', codigoDocumento, contexto)}
${_bloqueDatosCliente(orden)}
${_seccionInforme(1, 'Objeto de recepción')}
<p>Solicitud recibida el ${escapeHtml(String(orden.campos?.fecha_solicitud || orden.fecha_ingreso || 'No registrado'))}. Orden de trabajo: <strong>${escapeHtml(orden.ot)}</strong>. Alcance individualizado en los documentos referenciados a continuación.</p>
${bloque('Objeto breve de la entrega', 'objetoEntrega')}
${bloque('Fecha de entrega', 'fechaEntrega')}
${bloque('Documento del receptor', 'documentoReceptor')}
<section class="grid grid-cols-2 gap-4 mb-6">
  <div class="p-4 border border-outline-variant rounded-lg"><strong>Cierre técnico (código y revisión)</strong>${campo('cierreReferencia')}</div>
  <div class="p-4 border border-outline-variant rounded-lg"><strong>Anexos entregados</strong>${campo('anexosEntregados')}</div>
</section>
<section class="grid grid-cols-2 gap-4 mb-6">
  <div class="p-4 border border-outline-variant rounded-lg"><strong>Receptor previsto</strong>${campo('receptor')}</div>
  <div class="p-4 border border-outline-variant rounded-lg"><strong>Organización</strong>${campo('organizacion')}</div>
  <div class="p-4 border border-outline-variant rounded-lg"><strong>Cargo o calidad</strong>${campo('cargo')}</div>
  <div class="p-4 border border-outline-variant rounded-lg"><strong>Facultad para recibir (referencia)</strong>${campo('facultad')}</div>
</section>
${_seccionInforme(2, 'Decisión y reservas')}
<section class="grid grid-cols-2 gap-4 mb-6">
  <div class="p-4 border border-outline-variant rounded-lg"><strong>Opción preparada (sin manifestación)</strong>${campo('decisionPreparada')}</div>
  <div class="p-4 border border-outline-variant rounded-lg"><strong>Reservas propuestas y tratamiento</strong>${campo('reservas')}</div>
</section>
${bloque('Observaciones del cliente registradas para revisión', 'observacionesCliente')}
${_seccionInforme(3, 'Condiciones y formalización')}
<section class="grid grid-cols-2 gap-4 mb-6">
  <div class="p-4 border border-outline-variant rounded-lg"><strong>Garantía contractual de referencia</strong>${campo('garantiaReferencia')}</div>
  <div class="p-4 border border-outline-variant rounded-lg"><strong>Cobertura y condiciones acordadas</strong>${campo('garantiaCondiciones')}</div>
</section>
<section class="p-4 border border-outline-variant rounded-lg mb-4"><strong>Alcance de la conformidad</strong><p>${escapeHtml(TEXTO_ACTA)}</p><small>Texto sujeto a revisión jurídica de BBC.</small><p>Pendientes de manifestación expresa del receptor autorizado y vínculo con la revisión exacta del acta. ${contexto ? 'La emisión de esta acta no acredita por sí sola aceptación, firma ni garantía nueva.' : 'Este borrador no acredita aceptación, firma ni garantía nueva.'}</p></section>
<section class="grid grid-cols-2 gap-4 no-break" style="margin-top:40px"><div style="border-top:1px solid #94a3b8;padding-top:8px">Firma del cliente o representante<br/>Nombre y documento: ____________________<br/>Carácter: ____________________<br/>Fecha y hora: ____________________</div><div style="border-top:1px solid #94a3b8;padding-top:8px">Representante de la empresa<br/>Nombre y documento: ____________________<br/>Carácter: ____________________<br/>Fecha y hora: ____________________</div></section>
</div>`;

  return _envolverInforme(`Acta de Conformidad${contexto ? '' : ' — borrador'}`, contenido, contexto);
}
