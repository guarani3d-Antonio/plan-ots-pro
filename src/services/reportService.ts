// Borradores de los cinco documentos de una OT. La emisión formal se implementa
// sobre revisiones y artefactos persistidos; imprimir aquí no equivale a emitir.

import type { OrdenLocal } from '../types/orden';
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

export type TipoInforme = 'orden_servicio' | 'relevamiento' | 'avance' | 'cierre' | 'acta_conformidad';

export interface OrigenOrdenServicio {
  canal: string;
  fechaRecepcion: string;
  solicitante: string;
  contacto: string;
  referencia: string;
  urgencia: string;
  proximoPaso: string;
}

export interface DatosRelevamiento {
  modalidad: string;
  fechaIntervencion: string;
  tecnico: string;
  participantes: string;
  condiciones: string;
  hallazgos: string;
  pruebas: string;
  alcance: string;
  exclusiones: string;
  criterios: string;
  decisionAlcance: string;
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

export interface DatosCierre {
  alcanceReferencia: string;
  cambiosAprobados: string;
  inicioReal: string;
  finReal: string;
  ejecucionPorItem: string;
  verificacion: string;
  pendientes: string;
  entregables: string;
  conclusion: string;
  autorizacionInterna: string;
}

export interface DatosActa {
  cierreReferencia: string;
  objetoEntrega: string;
  anexosEntregados: string;
  receptor: string;
  organizacion: string;
  cargo: string;
  facultad: string;
  decisionPreparada: string;
  reservas: string;
  garantiaReferencia: string;
  garantiaCondiciones: string;
}

export function informeDisponible(tipo: TipoInforme, estadoOT: string): boolean {
  switch (tipo) {
    case 'orden_servicio':
    case 'relevamiento': return true;
    case 'avance': return estadoOT === 'En proceso' || estadoOT === 'Cerrada';
    case 'cierre':
    case 'acta_conformidad': return estadoOT === 'Cerrada';
  }
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
): string {
  const campo = (clave: keyof DatosCierre) =>
    `<p id="cie-${clave}" style="white-space:pre-line">${escapeHtml(datos?.[clave]?.trim() || 'No registrado')}</p>`;
  const bloque = (titulo: string, clave: keyof DatosCierre) =>
    `<section class="p-4 border border-outline-variant rounded-lg mb-4"><strong>${titulo}</strong>${campo(clave)}</section>`;
  const contenido = `<div class="a4-page">
${_paginaHeader(orden, 'INFORME DE CIERRE TÉCNICO', 'Resultados de la intervención y pendientes de verificación. La recepción del cliente corresponde al acta.', codigoDocumento)}
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
${bloque('Ejecución final por ítem del alcance', 'ejecucionPorItem')}
${bloque('Pruebas finales: criterio, método, resultado, verificador y fecha', 'verificacion')}
${bloque('Pendientes, restricciones y acciones acordadas', 'pendientes')}
${bloque('Entregables técnicos efectivamente entregados', 'entregables')}
${_seccionInforme(3, 'Pendientes y decisión técnica')}
${bloque('Conclusión técnica declarada', 'conclusion')}
${bloque('Autorización interna: actor y referencia', 'autorizacionInterna')}
<p class="text-xs text-on-surface-variant">El estado de la OT no acredita pruebas ni autorización. Este borrador no equivale a conformidad del cliente.</p>
${fotosDespues.length ? `<h3 class="font-section-header text-section-header text-primary uppercase tracking-widest">Evidencia final (después)</h3>
${generarGridFotos(fotosDespues)}` : ''}
</div>`;
  return _envolverInforme('Informe de cierre técnico — borrador', contenido);
}

// La orden de servicio documenta la solicitud recibida. No supone una visita.
export function generarInformeOrdenServicio(
  orden: OrdenLocal,
  aclaracion: string,
  origen?: OrigenOrdenServicio,
  codigoDocumento?: string,
  fotosCliente: { file_url: string; descripcion?: string | null; descripcion_observacion?: string | null }[] = [],
): string {
  const dato = (clave: keyof OrigenOrdenServicio, legado: string) => {
    const valor = origen ? origen[clave] : orden.campos?.[legado];
    return typeof valor === 'string' && valor.trim() ? valor.trim() : 'No registrado';
  };

  const contenido = `<div class="a4-page os-page">
${_paginaHeader(orden, 'ORDEN DE SERVICIO', 'Registro de apertura de la orden de trabajo y procedencia de la solicitud. No certifica una visita ni un diagnóstico.', codigoDocumento)}
${_bloqueDatosCliente(orden)}
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
${fotosCliente.length ? `<section class="os-evidence no-break"><strong>Evidencia aportada al ingreso · ${fotosCliente.length} foto(s)</strong>
  <div class="os-evidence-body"><img src="${escapeHtml(fotosCliente[0].file_url)}" alt="Evidencia aportada al ingreso" />
  <p>${escapeHtml(fotosCliente[0].descripcion_observacion || fotosCliente[0].descripcion || 'Sin descripción de origen')}
  <small>La imagen aportada no acredita por sí sola una visita técnica.</small></p></div></section>` : ''}
${_bloqueNaranjaIzquierdo('Aclaración posterior', aclaracion, 'Sin aclaraciones posteriores.')}
${_seccionInforme(2, 'Clasificación y derivación')}
<section class="p-4 border border-outline-variant rounded-lg no-break"><strong>Clasificación inicial</strong><p>${escapeHtml(orden.rubro || 'Sin clasificar')} · Prioridad ${escapeHtml(orden.prioridad || 'No registrada')} · Responsable ${escapeHtml(orden.responsable || 'No asignado')}</p></section>
<section class="p-4 border border-outline-variant rounded-lg no-break mt-4"><strong>Próximo paso acordado</strong><p id="os-proximoPaso">${escapeHtml(dato('proximoPaso', 'proximo_paso'))}</p></section>
</div>`;

  return _envolverInforme('Orden de servicio — borrador', contenido);
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
): string {
  const campo = (clave: keyof DatosRelevamiento) => {
    const valor = datos?.[clave]?.trim();
    return `<p id="rel-${clave}" style="white-space:pre-line">${escapeHtml(valor || 'No registrado')}</p>`;
  };
  const bloque = (titulo: string, clave: keyof DatosRelevamiento) =>
    `<section class="p-4 border border-outline-variant rounded-lg mb-4"><strong>${titulo}</strong>${campo(clave)}</section>`;

  const contenido = `<div class="a4-page relevamiento-page">
${_paginaHeader(orden, 'INFORME DE RELEVAMIENTO', 'Diagnóstico técnico inicial y detección del alcance de la intervención requerida.', codigoDocumento)}
${_bloqueDatosCliente(orden)}
${_seccionInforme(1, 'Hallazgo y diagnóstico')}
<section class="grid grid-cols-2 gap-4 mb-6">
  <div class="p-4 border border-outline-variant rounded-lg"><strong>Modalidad (visita o remota)</strong>${campo('modalidad')}</div>
  <div class="p-4 border border-outline-variant rounded-lg"><strong>Fecha de intervención declarada</strong>${campo('fechaIntervencion')}</div>
  <div class="p-4 border border-outline-variant rounded-lg"><strong>Técnico interviniente</strong>${campo('tecnico')}</div>
  <div class="p-4 border border-outline-variant rounded-lg"><strong>Participantes</strong>${campo('participantes')}</div>
</section>
${bloque('Condiciones, acceso y límites de observación', 'condiciones')}
${bloque('Hallazgos y evidencia relacionada', 'hallazgos')}
${bloque('Pruebas y mediciones realizadas', 'pruebas')}
${_bloqueNaranjaIzquierdo('Diagnóstico Inicial', comentarioInicial, 'Sin diagnóstico registrado.')}
${_seccionInforme(2, 'Alcance y criterios propuestos')}
${bloque('Alcance propuesto', 'alcance')}
${bloque('Exclusiones y supuestos', 'exclusiones')}
${bloque('Criterios de aceptación propuestos', 'criterios')}
${bloque('Estado declarado del alcance', 'decisionAlcance')}
<p class="text-xs text-on-surface-variant">Este borrador no acredita aprobación del alcance. La autorización debe vincularse a una revisión y a su actor con facultades.</p>
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

  return _envolverInforme('Informe de relevamiento — borrador', contenido);
}

// El indicador operativo no se presenta como avance aprobado.

export function generarInformeAvance(
  orden: OrdenLocal,
  comentarioAvance: string,
  _fotosAntes: { file_url: string; descripcion?: string | null; descripcion_observacion?: string | null }[],
  fotosDurante: { file_url: string; descripcion?: string | null; descripcion_observacion?: string | null }[],
  datos?: DatosAvance,
  codigoDocumento?: string,
): string {
  const campo = (clave: keyof DatosAvance) =>
    `<p id="av-${clave}" style="white-space:pre-line">${escapeHtml(datos?.[clave]?.trim() || 'No registrado')}</p>`;
  const bloque = (titulo: string, clave: keyof DatosAvance) =>
    `<section class="p-4 border border-outline-variant rounded-lg mb-4"><strong>${titulo}</strong>${campo(clave)}</section>`;
  const contenido = `<div class="a4-page">
${_paginaHeader(orden, 'INFORME DE AVANCE', 'Estado de la ejecución durante un período determinado. El corte y su revisión deberán quedar identificados al emitir.', codigoDocumento)}
${_seccionInforme(1, 'Resultado del período')}
<section class="grid grid-cols-2 gap-4 mb-6">
  <div class="p-4 border border-outline-variant rounded-lg"><strong>Período desde</strong>${campo('periodoDesde')}</div>
  <div class="p-4 border border-outline-variant rounded-lg"><strong>Corte hasta</strong>${campo('periodoHasta')}</div>
</section>
${bloque('Alcance aprobado de referencia (código y revisión)', 'alcanceReferencia')}
${_bloqueNaranjaIzquierdo('Trabajo observado en este corte', comentarioAvance, 'Sin avance técnico registrado para este corte.')}
${bloque('Avance acumulado y saldo por ítem', 'acumulado')}
${_seccionInforme(2, 'Previsto frente a realizado')}
<section class="grid grid-cols-2 gap-4 mb-6">
  <div class="p-4 border border-outline-variant rounded-lg"><strong>Porcentaje declarado al corte</strong>${campo('porcentaje')}</div>
  <div class="p-4 border border-outline-variant rounded-lg"><strong>Método y base de cálculo</strong>${campo('metodoPorcentaje')}</div>
</section>
${bloque('Desvíos, impacto y acciones', 'desvios')}
${_seccionInforme(3, 'Desvíos y siguiente decisión')}
${bloque('Objetivos y dependencias del próximo período', 'proximoPeriodo')}
<p class="text-xs text-on-surface-variant">Un porcentaje sin método, base y alcance aprobado no acredita el progreso. Este borrador no certifica ejecución ni recepción.</p>
${fotosDurante.length ? `<h3 class="font-section-header text-section-header text-primary uppercase tracking-widest">Evidencia de ejecución (durante)</h3>
${generarGridFotos(fotosDurante)}` : ''}
</div>`;
  return _envolverInforme('Informe de avance — borrador', contenido);
}

// Acta sin decisión/firma: siempre borrador. La recepción vinculante requerirá
// una revisión emitida y la manifestación verificable del receptor autorizado.

export function generarInformeActaConformidad(orden: OrdenLocal, datos?: DatosActa, codigoDocumento?: string): string {
  const campo = (clave: keyof DatosActa) =>
    `<p id="act-${clave}" style="white-space:pre-line">${escapeHtml(datos?.[clave]?.trim() || 'No registrado')}</p>`;
  const bloque = (titulo: string, clave: keyof DatosActa) =>
    `<section class="p-4 border border-outline-variant rounded-lg mb-4"><strong>${titulo}</strong>${campo(clave)}</section>`;
  const contenido = `<div class="a4-page acta-page">
${_paginaHeader(orden, 'ACTA DE CONFORMIDAD', 'Instrumento de recepción pendiente de decisión expresa del cliente.', codigoDocumento)}
${_bloqueDatosCliente(orden)}
${_seccionInforme(1, 'Objeto de recepción')}
${bloque('Objeto breve de la entrega', 'objetoEntrega')}
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
${_seccionInforme(3, 'Condiciones y formalización')}
<section class="grid grid-cols-2 gap-4 mb-6">
  <div class="p-4 border border-outline-variant rounded-lg"><strong>Garantía contractual de referencia</strong>${campo('garantiaReferencia')}</div>
  <div class="p-4 border border-outline-variant rounded-lg"><strong>Cobertura y condiciones acordadas</strong>${campo('garantiaCondiciones')}</div>
</section>
<section class="p-4 border border-outline-variant rounded-lg mb-4"><strong>Decisión y formalización</strong><p>Pendientes de manifestación expresa del receptor autorizado y vínculo con la revisión exacta del acta. Este borrador no acredita aceptación, firma ni garantía nueva.</p></section>
</div>`;

  return _envolverInforme('Acta de Conformidad — borrador', contenido);
}
