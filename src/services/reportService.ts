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

export function informeDisponible(tipo: TipoInforme, estadoOT: string): boolean {
  switch (tipo) {
    case 'orden_servicio':
    case 'relevamiento': return true;
    case 'avance': return estadoOT === 'En proceso' || estadoOT === 'Cerrada';
    case 'cierre':
    case 'acta_conformidad': return estadoOT === 'Cerrada';
  }
}

// ───────────────────────────────────────── Informe de Cierre (preview) ──
//
// Template A4 de dos páginas (estado inicial / trabajo concluido + firma).
// Usa Tailwind por CDN + fuentes Inter/Sora + Material Symbols. Pensado para
// renderizarse dentro de un iframe srcdoc en ModalInformeOT y para impresión
// via window.print en una nueva ventana.

export function generarInformeCierre(
  orden: OrdenLocal & { proyecto_nombre?: string },
  proyectoNombre: string,
  observaciones: string,
  _fotosAntes: { file_url: string; descripcion?: string | null; descripcion_observacion?: string | null }[],
  fotosDespues: { file_url: string; descripcion?: string | null; descripcion_observacion?: string | null }[],
): string {
  const contenido = `<div class="a4-page">
${_paginaHeader(orden, 'INFORME DE CIERRE TÉCNICO', 'Resultados de la intervención y pendientes de verificación. La recepción del cliente corresponde al acta.')}
<section class="grid grid-cols-2 gap-4 mb-6 no-break">
  <div class="p-4 border border-outline-variant rounded-lg"><strong>Proyecto</strong><p>${escapeHtml(proyectoNombre)}</p></div>
  <div class="p-4 border border-outline-variant rounded-lg"><strong>Orden de trabajo</strong><p>${escapeHtml(orden.ot || 'Sin código')}</p></div>
</section>
${_bloqueNaranjaIzquierdo('Resultados y pendientes técnicos', observaciones, 'No se registraron resultados técnicos verificables.')}
<section class="p-4 border border-outline-variant rounded-lg mb-6 no-break">
  <h3>Verificación y autorización</h3>
  <p>Las pruebas, sus criterios, resultados, responsable y autorización técnica están pendientes de registrar y vincular a una revisión documental. El estado operativo de la OT no sustituye esta verificación.</p>
</section>
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
): string {
  const dato = (clave: keyof OrigenOrdenServicio, legado: string) => {
    const valor = origen ? origen[clave] : orden.campos?.[legado];
    return typeof valor === 'string' && valor.trim() ? valor.trim() : 'No registrado';
  };

  const contenido = `<div class="a4-page">
${_paginaHeader(orden, 'ORDEN DE SERVICIO', 'Registro de apertura de la orden de trabajo y procedencia de la solicitud. No certifica una visita ni un diagnóstico.')}
${_bloqueDatosCliente(orden)}
<section class="grid grid-cols-2 gap-4 mb-6 no-break">
  <div class="p-4 border border-outline-variant rounded-lg"><strong>Fecha de ingreso de OT</strong><p>${escapeHtml(formatearFechaCorta(orden.fecha_ingreso))}</p></div>
  <div class="p-4 border border-outline-variant rounded-lg"><strong>Canal de solicitud</strong><p id="os-canal">${escapeHtml(dato('canal', 'canal_solicitud'))}</p></div>
  <div class="p-4 border border-outline-variant rounded-lg"><strong>Fecha y hora de recepción declarada</strong><p id="os-fechaRecepcion">${escapeHtml(dato('fechaRecepcion', 'fecha_solicitud').replace('T', ' '))}</p></div>
  <div class="p-4 border border-outline-variant rounded-lg"><strong>Solicitante</strong><p id="os-solicitante">${escapeHtml(dato('solicitante', 'solicitante'))}</p></div>
  <div class="p-4 border border-outline-variant rounded-lg"><strong>Contacto de origen</strong><p id="os-contacto">${escapeHtml(dato('contacto', 'contacto_solicitante'))}</p></div>
  <div class="p-4 border border-outline-variant rounded-lg"><strong>Referencia del mensaje</strong><p id="os-referencia">${escapeHtml(dato('referencia', 'referencia_solicitud'))}</p></div>
  <div class="p-4 border border-outline-variant rounded-lg"><strong>Urgencia manifestada</strong><p id="os-urgencia">${escapeHtml(dato('urgencia', 'urgencia_solicitada'))}</p></div>
</section>
${_bloqueNaranjaIzquierdo('Solicitud original', orden.descripcion ?? '', 'No se ha registrado el reclamo original.', '')}
${_bloqueNaranjaIzquierdo('Aclaración posterior', aclaracion, 'Sin aclaraciones posteriores.')}
<section class="p-4 border border-outline-variant rounded-lg no-break"><strong>Clasificación inicial</strong><p>${escapeHtml(orden.rubro || 'Sin clasificar')} · Prioridad ${escapeHtml(orden.prioridad || 'No registrada')} · Responsable ${escapeHtml(orden.responsable || 'No asignado')}</p></section>
<section class="p-4 border border-outline-variant rounded-lg no-break mt-4"><strong>Próximo paso acordado</strong><p id="os-proximoPaso">${escapeHtml(dato('proximoPaso', 'proximo_paso'))}</p></section>
<p class="mt-6 text-xs text-on-surface-variant">La evidencia aportada por el cliente debe vincularse con su mensaje de origen. Los datos faltantes impiden considerar completa esta orden.</p>
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
): string {
  const bloquesAlcance = ['Trabajos requeridos', 'Materiales estimados', 'Tiempo estimado'].map(titulo => `<div style="background: #fffbf5; border-top: 3px solid #CC7A00; padding: 12px; border-radius: 4px;">
    <h4 style="font-size: 11px; font-weight: 700; color: #CC7A00; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px;">${escapeHtml(titulo)}</h4>
    <p style="font-size:11px;color:#64748b">Pendiente de documentar</p>
  </div>`).join('');

  const contenido = `<div class="a4-page">
${_paginaHeader(orden, 'INFORME DE RELEVAMIENTO', 'Diagnóstico técnico inicial y detección del alcance de la intervención requerida.')}
${_bloqueDatosCliente(orden)}
${_bloqueNaranjaIzquierdo('Diagnóstico Inicial', comentarioInicial, 'Sin diagnóstico registrado.')}
<section class="grid grid-cols-3 gap-4 mb-8 no-break">
  ${bloquesAlcance}
</section>
<p class="text-xs text-on-surface-variant">Alcance y autorización: pendientes de registrar en una revisión vinculada.</p>
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
): string {
  const porcentaje = orden.porcentaje_avance == null
    ? null : Math.max(0, Math.min(100, orden.porcentaje_avance));
  const contenido = `<div class="a4-page">
${_paginaHeader(orden, 'INFORME DE AVANCE', 'Estado de la ejecución durante un período determinado. El corte y su revisión deberán quedar identificados al emitir.')}
${_bloqueNaranjaIzquierdo('Trabajo observado en este corte', comentarioAvance, 'Sin avance técnico registrado para este corte.')}
<section class="grid grid-cols-2 gap-4 mb-6 no-break">
  <div class="p-4 border border-outline-variant rounded-lg"><strong>Período y fecha de corte</strong><p>Pendientes de registrar</p></div>
  <div class="p-4 border border-outline-variant rounded-lg"><strong>Avance operativo de la OT</strong><p>${porcentaje === null ? 'No registrado' : `${porcentaje}%`}</p></div>
</section>
<p class="text-xs text-on-surface-variant">El porcentaje proviene de la OT y es provisional: falta vincular base de cálculo, hitos del alcance aprobado y verificador. No acredita finalización ni recepción.</p>
<section class="p-4 border border-outline-variant rounded-lg mb-6 no-break"><h3>Desvíos y siguiente paso</h3><p>Pendientes de documentar para este corte. Consultar el relevamiento para el diagnóstico y las fotografías iniciales.</p></section>
${fotosDurante.length ? `<h3 class="font-section-header text-section-header text-primary uppercase tracking-widest">Evidencia de ejecución (durante)</h3>
${generarGridFotos(fotosDurante)}` : ''}
</div>`;
  return _envolverInforme('Informe de avance — borrador', contenido);
}

// Acta sin decisión/firma: siempre borrador. La recepción vinculante requerirá
// una revisión emitida y la manifestación verificable del receptor autorizado.

export function generarInformeActaConformidad(orden: OrdenLocal): string {
  const otLabel = orden.ot ?? 'Sin código';
  const contenido = `<div class="a4-page">
${_paginaHeader(orden, 'ACTA DE CONFORMIDAD · BORRADOR', 'Instrumento de recepción pendiente de decisión expresa del cliente.')}
${_bloqueDatosCliente(orden)}
<section class="p-5 border border-outline-variant rounded-xl mb-6"><h3 class="font-section-header text-xs text-primary uppercase">Objeto de recepción</h3><p>Servicio referido a la OT ${escapeHtml(otLabel)}. La revisión exacta del cierre técnico debe vincularse antes de formalizar el acta.</p></section>
<section class="p-5 border border-outline-variant rounded-xl mb-6"><h3 class="font-section-header text-xs text-primary uppercase">Decisión del cliente</h3><p>Pendiente: aceptar, aceptar con reservas o rechazar. No hay manifestación registrada.</p></section>
<section class="p-5 border border-outline-variant rounded-xl mb-6"><h3 class="font-section-header text-xs text-primary uppercase">Reservas y condiciones</h3><p>Sin decisión registrada. La garantía contractual requiere referencia y aprobación propias; no se presume a partir de la OT.</p></section>
<section class="p-5 border border-outline-variant rounded-xl mb-6"><h3 class="font-section-header text-xs text-primary uppercase">Formalización</h3><p>Receptor, autoridad, método de firma, fecha y revisión exacta: pendientes de registrar y verificar.</p></section>
</div>`;

  return _envolverInforme('Acta de Conformidad — borrador', contenido);
}
