// Borradores de los cinco documentos de una OT. La emisión formal se implementa
// sobre revisiones y artefactos persistidos; imprimir aquí no equivale a emitir.

import type { OrdenLocal } from '../types/orden';
import {
  escapeHtml,
  formatearFechaCorta,
  generarGridFotos,
  _estadoBadgeCfg,
  _paginaHeader,
  _envolverInforme,
  _bloqueDatosCliente,
  _bloqueDatosOT,
  _bloqueNaranjaIzquierdo,
} from './reportTemplates';

// Identificadores de interfaz heredados. La ficha ahora es una orden de servicio;
// el cambio del identificador interno se hará junto con el contrato de auditoría.
export type TipoInforme = 'ficha_visita' | 'relevamiento' | 'avance' | 'cierre' | 'acta_conformidad';

export function informeDisponible(tipo: TipoInforme, estadoOT: string): boolean {
  switch (tipo) {
    case 'ficha_visita':
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
<section class="p-4 border border-outline-variant rounded-lg mb-6 no-break">
  <h3>Recepción</h3><p>Pendiente de decisión expresa del cliente en el acta de conformidad. Este borrador no acredita aceptación ni garantía contractual.</p>
</section>
<h3 class="font-section-header text-section-header text-primary uppercase tracking-widest">Evidencia final (después)</h3>
${generarGridFotos(fotosDespues)}
</div>`;
  return _envolverInforme('Informe de cierre técnico — borrador', contenido);
}

// La orden de servicio documenta la solicitud recibida. No supone una visita.
export function generarInformeOrdenServicio(
  orden: OrdenLocal,
  aclaracion: string,
): string {
  const dato = (clave: string) => {
    const valor = orden.campos?.[clave];
    return typeof valor === 'string' && valor.trim() ? valor.trim() : 'No registrado';
  };

  const contenido = `<div class="a4-page">
${_paginaHeader(orden, 'ORDEN DE SERVICIO', 'Registro de apertura de la orden de trabajo y procedencia de la solicitud. No certifica una visita ni un diagnóstico.')}
${_bloqueDatosCliente(orden)}
<section class="grid grid-cols-2 gap-4 mb-6 no-break">
  <div class="p-4 border border-outline-variant rounded-lg"><strong>Fecha de ingreso de OT</strong><p>${escapeHtml(formatearFechaCorta(orden.fecha_ingreso))}</p></div>
  <div class="p-4 border border-outline-variant rounded-lg"><strong>Canal de solicitud</strong><p>${escapeHtml(dato('canal_solicitud'))}</p></div>
  <div class="p-4 border border-outline-variant rounded-lg"><strong>Fecha y hora recibida · Paraguay</strong><p>${escapeHtml(dato('fecha_solicitud'))}</p></div>
  <div class="p-4 border border-outline-variant rounded-lg"><strong>Solicitante</strong><p>${escapeHtml(dato('solicitante'))}</p></div>
  <div class="p-4 border border-outline-variant rounded-lg"><strong>Referencia de origen</strong><p>${escapeHtml(dato('referencia_solicitud'))}</p></div>
</section>
${_bloqueNaranjaIzquierdo('Solicitud original', orden.descripcion ?? '', 'No se ha registrado el reclamo original.')}
${aclaracion.trim() ? _bloqueNaranjaIzquierdo('Aclaración posterior', aclaracion, '') : ''}
<section class="p-4 border border-outline-variant rounded-lg no-break"><strong>Clasificación inicial</strong><p>${escapeHtml(orden.rubro || 'Sin clasificar')} · Prioridad ${escapeHtml(orden.prioridad || 'No registrada')} · Responsable ${escapeHtml(orden.responsable || 'No asignado')}</p></section>
<p class="mt-6 text-xs text-on-surface-variant">La evidencia aportada por el cliente debe vincularse con su mensaje de origen. Los datos faltantes impiden considerar completa esta orden.</p>
</div>`;

  return _envolverInforme('Orden de servicio — borrador', contenido);
}

// Compatibilidad con llamadas antiguas mientras se migra el identificador interno.
export const generarInformeFichaVisita = generarInformeOrdenServicio;

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
${_bloqueDatosOT(orden)}
${_bloqueNaranjaIzquierdo('Diagnóstico Inicial', comentarioInicial, 'Sin diagnóstico registrado.')}
<section class="grid grid-cols-3 gap-4 mb-8 no-break">
  ${bloquesAlcance}
</section>
<p class="text-xs text-on-surface-variant">Alcance y autorización: pendientes de registrar en una revisión vinculada.</p>
</div>
<div class="a4-page">
<div>
  <div class="flex items-center gap-2.5 mb-5 border-b border-outline-variant pb-2">
    <h3 class="font-section-header text-section-header text-primary uppercase tracking-widest">Evidencia del relevamiento (Antes)</h3>
  </div>
  ${generarGridFotos(fotosAntes)}
</div>
</div>`;

  return _envolverInforme('Informe de relevamiento — borrador', contenido);
}

// ───────────────────────────────────────── Informe de Avance de Obra ──
//
// Página 1: datos OT + estado actual + métricas (% completado con barra,
// días en ejecución, estado, prioridad) + observaciones + firmas.
// Página 2: filmografía ANTES + DURANTE juntas (sin break entre ellas).

export function generarInformeAvance(
  orden: OrdenLocal,
  comentarioAvance: string,
  fotosAntes: { file_url: string; descripcion?: string | null; descripcion_observacion?: string | null }[],
  fotosDurante: { file_url: string; descripcion?: string | null; descripcion_observacion?: string | null }[],
): string {
  const porcentaje = Math.max(0, Math.min(100, orden.porcentaje_avance ?? 0));
  const diasEnEjecucion = orden.fecha_inicio_trabajos
    ? Math.floor((Date.now() - new Date(orden.fecha_inicio_trabajos + 'T00:00:00').getTime()) / 86400000)
    : null;
  const badge = _estadoBadgeCfg(orden.estado);

  const contenido = `<div class="a4-page">
${_paginaHeader(orden, 'INFORME DE AVANCE DE OBRA', 'Progreso de ejecución de los trabajos, métricas y estado actual de la obra.')}
${_bloqueDatosCliente(orden)}
${_bloqueDatosOT(orden)}
${_bloqueNaranjaIzquierdo('Estado Actual del Trabajo', comentarioAvance, 'Sin observación de estado registrada.')}
<section class="grid grid-cols-2 gap-4 mb-8 no-break">
  <div style="background: #fffbf5; border: 1px solid #f0e0c0; padding: 14px; border-radius: 8px;">
    <h4 style="font-size: 10px; font-weight: 700; color: #888; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px;">% Completado</h4>
    <div style="font-size: 28px; font-weight: 700; color: #CC7A00; margin-bottom: 6px;">${porcentaje}%</div>
    <div style="width: 100%; height: 8px; background: #f0e0c0; border-radius: 4px; overflow: hidden;">
      <div style="width: ${porcentaje}%; height: 100%; background: #CC7A00;"></div>
    </div>
  </div>
  <div style="background: #fffbf5; border: 1px solid #f0e0c0; padding: 14px; border-radius: 8px;">
    <h4 style="font-size: 10px; font-weight: 700; color: #888; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px;">Días en ejecución</h4>
    <div style="font-size: 28px; font-weight: 700; color: #003366;">${diasEnEjecucion !== null ? `${diasEnEjecucion} día${diasEnEjecucion === 1 ? '' : 's'}` : 'No registrado'}</div>
  </div>
  <div style="background: ${badge.bg}; border: 1px solid ${badge.border}33; padding: 14px; border-radius: 8px;">
    <h4 style="font-size: 10px; font-weight: 700; color: ${badge.text}; opacity: 0.7; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px;">Estado</h4>
    <div style="font-size: 20px; font-weight: 700; color: ${badge.text};">${badge.texto}</div>
  </div>
  <div style="background: #eef2ff; border: 1px solid #c7d2fe; padding: 14px; border-radius: 8px;">
    <h4 style="font-size: 10px; font-weight: 700; color: #4338ca; opacity: 0.7; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px;">Prioridad</h4>
    <div style="font-size: 20px; font-weight: 700; color: #4338ca;">${escapeHtml((orden.prioridad ?? 'Media').toUpperCase())}</div>
  </div>
</section>
<section class="mb-8 no-break">
  <div class="flex items-center gap-2.5 mb-3 border-b border-outline-variant pb-2">
    <span class="material-symbols-outlined text-secondary text-xl">edit_note</span>
    <h3 class="font-section-header text-xs text-primary uppercase tracking-widest">Observaciones de Avance</h3>
  </div>
  <p class="text-xs text-on-surface-variant">No se agregaron observaciones adicionales.</p>
</section>
<p class="text-xs text-on-surface-variant">Avance informado en borrador; pendiente de revisión y autorización.</p>
</div>
<div class="a4-page">
<div>
  ${fotosAntes.length ? `<p class="text-xs text-on-surface-variant">Evidencia inicial: consultar relevamiento; ${fotosAntes.length} foto(s) vinculadas a la OT.</p>` : ''}
  <div class="flex items-center gap-2.5 mb-5 border-b border-outline-variant pb-2" style="margin-top: 20px;">
    <span class="material-symbols-outlined text-secondary" style="font-variation-settings:'FILL' 1;">construction</span>
    <h3 class="font-section-header text-section-header text-primary uppercase tracking-widest">Evidencia fotográfica: Trabajo en Ejecución (Durante)</h3>
  </div>
  ${generarGridFotos(fotosDurante)}
</div>
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
