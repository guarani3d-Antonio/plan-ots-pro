import { registrarExportacion } from '../../services/trustService';
// src/components/informes/ModalInformeOT.tsx
//
// Modal fullscreen para previsualizar/exportar informes de OT. Soporta 5
// tipos: 'cierre' | 'orden_servicio' | 'relevamiento' | 'avance' | 'acta'.
//
// Layout: panel izquierdo (datos read-only + observaciones editable + opciones),
// panel derecho (iframe srcdoc con el HTML generado).
//
// Cada borrador empieza con su texto propio; los comentarios de transición
// permanecen en el historial y no se incorporan como hechos aprobados.
// Las fotos se muestran solo en la fase que corresponde a su categoría.
//
// Estrategia de actualización del preview:
// - Tipeo en observaciones → parche del bloque editable del iframe.
// - Cambio de opciones (incluirFotos), carga inicial, cambio de OT/tipo → regen
//   completa del HTML y reload del iframe via srcDoc.
//
// S33: FotoMin incluye descripcion_observacion (campo del EditorFoto).
//      Los tres mapeos de fotos ahora pasan ese campo al generador de informes.

import { useEffect, useRef, useState } from 'react';
import type { OrdenLocal } from '../../types/orden';
import {
  generarInformeCierre,
  generarInformeOrdenServicio,
  generarInformeRelevamiento,
  generarInformeAvance,
  generarInformeActaConformidad,
} from '../../services/reportService';
import { cargarFotosDeOrden } from '../../services/fotosService';
import { hacerInformePortable } from '../../services/portableReportService';
import {
  cargarBorradorDocumento, guardarBorradorDocumento, listarDocumentosDeOrden,
  reservarDocumento, type DocumentoRegistro,
} from '../../services/documentService';
import { colorEstado } from '../../utils/calculos';
import styles from './ModalInformeOT.module.css';
import { VoiceInputButton } from '../ui/VoiceInputButton';

export type TipoInforme = 'cierre' | 'orden_servicio' | 'relevamiento' | 'avance' | 'acta';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  orden: OrdenLocal;
  proyectoNombre: string;
  tipo: TipoInforme;
}

// S33: incluye descripcion_observacion para que aparezca en los informes
type FotoMin = {
  file_url: string;
  descripcion?: string | null;
  descripcion_observacion?: string | null;
};

interface TipoCfg {
  titulo: string;
  tituloDoc: string;
  fileSlug: string;
  labelTextarea: string | null;       // null => textarea oculto (caso 'acta')
  placeholderTextarea: string;
  necesitaFotosAntes: boolean;
  necesitaFotosDespues: boolean;
  necesitaFotosDurante: boolean;
}

const TIPO_CFG: Record<TipoInforme, TipoCfg> = {
  cierre: {
    titulo: 'Informe de Cierre',
    tituloDoc: 'Informe de Cierre - borrador',
    fileSlug: 'Informe_Cierre_Borrador',
    labelTextarea: 'Resultado técnico y pendientes',
    placeholderTextarea: 'Registrá resultados verificados y pendientes; no copies el relevamiento...',
    necesitaFotosAntes: true,
    necesitaFotosDespues: true,
    necesitaFotosDurante: false,
  },
  orden_servicio: {
    titulo: 'Orden de Servicio',
    tituloDoc: 'Orden de Servicio - borrador',
    fileSlug: 'Orden_Servicio_Borrador',
    labelTextarea: 'Aclaración posterior de la solicitud',
    placeholderTextarea: 'Solo si el pedido original fue aclarado después de recibirlo...',
    necesitaFotosAntes: false,
    necesitaFotosDespues: false,
    necesitaFotosDurante: false,
  },
  relevamiento: {
    titulo: 'Informe de Relevamiento',
    tituloDoc: 'Informe de Relevamiento - borrador',
    fileSlug: 'Informe_Relevamiento_Borrador',
    labelTextarea: 'Diagnóstico Inicial',
    placeholderTextarea: 'Detallá el diagnóstico técnico inicial...',
    necesitaFotosAntes: true,
    necesitaFotosDespues: false,
    necesitaFotosDurante: false,
  },
  avance: {
    titulo: 'Informe de Avance',
    tituloDoc: 'Informe de Avance - borrador',
    fileSlug: 'Informe_Avance_Borrador',
    labelTextarea: 'Estado Actual del Trabajo',
    placeholderTextarea: 'Describí el progreso actual de los trabajos...',
    necesitaFotosAntes: false,
    necesitaFotosDespues: false,
    necesitaFotosDurante: true,
  },
  acta: {
    titulo: 'Acta de Conformidad',
    tituloDoc: 'Acta de Conformidad - borrador',
    fileSlug: 'Acta_Conformidad_Borrador',
    labelTextarea: null,
    placeholderTextarea: '',
    necesitaFotosAntes: false,
    necesitaFotosDespues: false,
    necesitaFotosDurante: false,
  },
};

function fechaCorta(fecha: string | null | undefined): string {
  if (!fecha) return '—';
  const d = new Date(fecha + 'T00:00:00');
  if (isNaN(d.getTime())) return '—';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
}

const DEBOUNCE_MS = 150;
const MAX_OBSERVACIONES = 2000;

export function ModalInformeOT({ isOpen, onClose, orden, proyectoNombre, tipo }: Props) {
  const cfg = TIPO_CFG[tipo];
  const necesitaFotos =
    cfg.necesitaFotosAntes || cfg.necesitaFotosDespues || cfg.necesitaFotosDurante;
  const muestraTextarea = cfg.labelTextarea !== null;

  const [observaciones, setObservaciones] = useState('');
  const [cargandoComentario, setCargandoComentario] = useState(true);
  const [htmlPreview, setHtmlPreview] = useState('');
  const [generandoPreview, setGenerandoPreview] = useState(false);
  const [incluirFotos, setIncluirFotos] = useState(true);
  const [fotosAntes, setFotosAntes] = useState<FotoMin[]>([]);
  const [fotosDespues, setFotosDespues] = useState<FotoMin[]>([]);
  const [fotosDurante, setFotosDurante] = useState<FotoMin[]>([]);
  const [errorInforme, setErrorInforme] = useState<string | null>(null);
  const [documento, setDocumento] = useState<DocumentoRegistro | null>(null);
  const [versionBorrador, setVersionBorrador] = useState(0);
  const [guardado, setGuardado] = useState<string | null>(null);
  const [persistenciaDisponible, setPersistenciaDisponible] = useState(false);
  const [guardandoBorrador, setGuardandoBorrador] = useState(false);
  const [errorBorrador, setErrorBorrador] = useState<string | null>(null);
  const solicitudGuardadoRef = useRef<{ id: string; datos: string; version: number } | null>(null);
  const solicitudReservaRef = useRef<string | null>(null);

  const firstRenderRef = useRef(true);
  const prevIncluirFotosRef = useRef(incluirFotos);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const [previewAncho, setPreviewAncho] = useState(794);
  const [previewAlto, setPreviewAlto] = useState(1123);

  useEffect(() => {
    if (!isOpen || !previewRef.current) return;
    const panel = previewRef.current;
    let frame = 0;
    const medir = () => {
      const ancho = Math.max(1, panel.clientWidth - 48);
      setPreviewAncho(actual => actual === ancho ? actual : ancho);
    };
    medir();
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(medir);
    });
    observer.observe(panel);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!htmlPreview || !iframeRef.current) return;
    const iframe = iframeRef.current;
    let observer: ResizeObserver | undefined;
    let frame = 0;
    const medir = () => {
      const doc = iframe.contentDocument;
      if (!doc?.body) return;
      const origen = doc.body.getBoundingClientRect().top;
      const altoContenido = Array.from(doc.body.children).reduce((alto, elemento) => {
        const rect = elemento.getBoundingClientRect();
        return Math.max(alto, rect.bottom - origen);
      }, 0);
      const alto = Math.max(1123, Math.ceil(altoContenido + 8));
      setPreviewAlto(actual => actual === alto ? actual : alto);
    };
    const alCargar = () => {
      observer?.disconnect();
      const doc = iframe.contentDocument;
      if (!doc) return;
      medir();
      observer = new ResizeObserver(() => {
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(medir);
      });
      observer.observe(doc.documentElement);
      if (doc.body) observer.observe(doc.body);
    };
    iframe.addEventListener('load', alCargar);
    if (iframe.contentDocument?.readyState === 'complete') alCargar();
    return () => {
      iframe.removeEventListener('load', alCargar);
      observer?.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [htmlPreview]);

  const escalaPreview = Math.min(1, previewAncho / 794);

  // Reset de flags al cambiar de OT o tipo
  useEffect(() => {
    firstRenderRef.current = true;
    setHtmlPreview('');
    setPreviewAlto(1123);
    setObservaciones('');
    setFotosAntes([]);
    setFotosDespues([]);
    setFotosDurante([]);
    setErrorInforme(null);
    setDocumento(null);
    setVersionBorrador(0);
    setGuardado(null);
    setPersistenciaDisponible(false);
    setErrorBorrador(null);
    solicitudGuardadoRef.current = null;
    solicitudReservaRef.current = null;
  }, [orden.id, tipo]);

  const construirHtml = (textoActual: string): string => {
    const fa  = incluirFotos ? fotosAntes   : [];
    const fd  = incluirFotos ? fotosDespues : [];
    const fdu = incluirFotos ? fotosDurante : [];
    switch (tipo) {
      case 'cierre':
        return generarInformeCierre(orden, proyectoNombre, textoActual, fa, fd);
      case 'orden_servicio':
        return generarInformeOrdenServicio(orden, textoActual);
      case 'relevamiento':
        return generarInformeRelevamiento(orden, textoActual, fa);
      case 'avance':
        return generarInformeAvance(orden, textoActual, fa, fdu);
      case 'acta':
        return generarInformeActaConformidad(orden);
    }
  };

  // Carga inicial: comentario + fotos
  useEffect(() => {
    if (!isOpen) return;
    let cancelado = false;
    setCargandoComentario(true);

    const promFotos = necesitaFotos
      ? cargarFotosDeOrden(orden.id)
      : Promise.resolve([] as Awaited<ReturnType<typeof cargarFotosDeOrden>>);
    const promBorrador = listarDocumentosDeOrden(orden.id).then(async documentos => {
      const vigente = documentos.filter(d => d.tipo === tipo && d.ciclo === 1).at(-1) ?? null;
      const borrador = vigente ? await cargarBorradorDocumento(vigente.id) : null;
      return { vigente, borrador };
    }).catch(() => null);

    Promise.all([promFotos, promBorrador])
      .then(([fotos, resultado]) => {
        if (cancelado) return;
        const datos = resultado?.borrador?.datos;
        const texto = typeof datos?.observaciones === 'string'
          ? datos.observaciones.slice(0, MAX_OBSERVACIONES) : '';
        setObservaciones(texto);
        setIncluirFotos(typeof datos?.incluirFotos === 'boolean' ? datos.incluirFotos : true);
        setDocumento(resultado?.vigente ?? null);
        setVersionBorrador(resultado?.borrador?.version ?? 0);
        setGuardado(resultado?.borrador ? JSON.stringify({ observaciones: texto, incluirFotos: datos?.incluirFotos !== false }) : null);
        setPersistenciaDisponible(resultado !== null);

        // S33: mapeo incluye descripcion_observacion además de descripcion
        if (cfg.necesitaFotosAntes) {
          setFotosAntes(
            fotos
              .filter(f => f.categoria === 'ANTES')
              .map(f => ({
                file_url: f.url,
                descripcion: f.descripcion ?? null,
                descripcion_observacion: f.descripcion_observacion ?? null,
              })),
          );
        }
        if (cfg.necesitaFotosDespues) {
          setFotosDespues(
            fotos
              .filter(f => f.categoria === 'DESPUES')
              .map(f => ({
                file_url: f.url,
                descripcion: f.descripcion ?? null,
                descripcion_observacion: f.descripcion_observacion ?? null,
              })),
          );
        }
        if (cfg.necesitaFotosDurante) {
          setFotosDurante(
            fotos
              .filter(f => f.categoria === 'DURANTE')
              .map(f => ({
                file_url: f.url,
                descripcion: f.descripcion ?? null,
                descripcion_observacion: f.descripcion_observacion ?? null,
              })),
          );
        }
        setCargandoComentario(false);
      })
      .catch(err => {
        console.error('[ModalInformeOT] carga inicial:', err);
        if (!cancelado) setCargandoComentario(false);
      });
    return () => {
      cancelado = true;
    };
  }, [isOpen, orden.id, tipo, necesitaFotos, cfg.necesitaFotosAntes, cfg.necesitaFotosDespues, cfg.necesitaFotosDurante]);

  // Regeneración del preview ante cambios que requieren rebuild completo
  useEffect(() => {
    if (!isOpen || cargandoComentario) return;
    const incluirFotosCambio = prevIncluirFotosRef.current !== incluirFotos;
    prevIncluirFotosRef.current = incluirFotos;
    const delay = firstRenderRef.current || incluirFotosCambio ? 0 : DEBOUNCE_MS;
    firstRenderRef.current = false;
    setGenerandoPreview(true);
    let cancelado = false;
    const t = window.setTimeout(() => {
      hacerInformePortable(construirHtml(observaciones))
        .then(result => {
          if (cancelado) return;
          setHtmlPreview(result.html);
          setErrorInforme(result.missingImages ? `${result.missingImages} imagen(es) no pudieron incorporarse y se reemplazaron por un aviso.` : null);
        })
        .catch(error => { if (!cancelado) setErrorInforme(error instanceof Error ? error.message : 'No se pudo preparar el informe.'); })
        .finally(() => { if (!cancelado) setGenerandoPreview(false); });
    }, delay);
    return () => {
      cancelado = true;
      window.clearTimeout(t);
    };
    // `observaciones` fuera de deps a propósito — se parchea el DOM directamente
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isOpen,
    cargandoComentario,
    incluirFotos,
    fotosAntes,
    fotosDespues,
    fotosDurante,
    orden,
    proyectoNombre,
    tipo,
  ]);

  if (!isOpen) return null;

  const handleActualizarAhora = async () => {
    if (cargandoComentario) return;
    setGenerandoPreview(true);
    try {
      const result = await hacerInformePortable(construirHtml(observaciones));
      setHtmlPreview(result.html);
      setErrorInforme(result.missingImages ? `${result.missingImages} imagen(es) no pudieron incorporarse y se reemplazaron por un aviso.` : null);
    } catch (error) {
      setErrorInforme(error instanceof Error ? error.message : 'No se pudo preparar el informe.');
    } finally { setGenerandoPreview(false); }
  };

  const datosBorrador = { observaciones, incluirFotos };
  const cambiosBorrador = guardado !== JSON.stringify(datosBorrador);

  const handleGuardarBorrador = async () => {
    if (cargandoComentario || guardandoBorrador || !persistenciaDisponible) return;
    const datos = { observaciones, incluirFotos };
    const contenido = JSON.stringify(datos);
    const intento = solicitudGuardadoRef.current;
    const solicitud = intento?.datos === contenido && intento.version === versionBorrador
      ? intento.id : crypto.randomUUID();
    solicitudGuardadoRef.current = { id: solicitud, datos: contenido, version: versionBorrador };
    setGuardandoBorrador(true);
    setErrorBorrador(null);
    try {
      const reserva = solicitudReservaRef.current ?? crypto.randomUUID();
      solicitudReservaRef.current = reserva;
      const vigente = documento ?? await reservarDocumento(orden.id, tipo, 1, reserva);
      setDocumento(vigente);
      const borrador = await guardarBorradorDocumento(vigente.id, datos, versionBorrador, solicitud);
      setVersionBorrador(borrador.version);
      setGuardado(JSON.stringify(datos));
      solicitudGuardadoRef.current = null;
    } catch (error) {
      setErrorBorrador(error instanceof Error ? error.message : 'No se pudo guardar el borrador.');
    } finally {
      setGuardandoBorrador(false);
    }
  };

  const handleExportarHTML = async () => {
    if (cargandoComentario) return;
    setGenerandoPreview(true);
    try {
      const result = await hacerInformePortable(construirHtml(observaciones));
      if (result.missingImages) throw new Error(`${result.missingImages} imagen(es) no están disponibles. No se descarga un borrador incompleto.`);
      await registrarExportacion(orden.id, tipo, 'HTML');
      const blob = new Blob([result.html], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const fecha = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `${cfg.fileSlug}_OT${orden.ot}_${fecha}.html`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
      setErrorInforme(result.missingImages ? `${result.missingImages} imagen(es) se exportaron como aviso porque no estaban disponibles.` : null);
    } catch (error) { setErrorInforme(error instanceof Error ? error.message : 'No se pudo exportar el informe.'); }
    finally { setGenerandoPreview(false); }
  };

  const handleExportarPDF = async () => {
    if (cargandoComentario) return;
    const w = window.open('', '_blank');
    if (!w) { setErrorInforme('El navegador bloqueó la ventana del PDF. Permití las ventanas emergentes para este sitio.'); return; }
    w.document.write('<p style="font-family:Arial;padding:24px">Preparando informe portable…</p>');
    setGenerandoPreview(true);
    try {
      const result = await hacerInformePortable(construirHtml(observaciones));
      if (result.missingImages) throw new Error(`${result.missingImages} imagen(es) no están disponibles. No se prepara un PDF incompleto.`);
      await registrarExportacion(orden.id, tipo, 'PDF');
      w.document.open(); w.document.write(result.html); w.document.close();
      w.onload = () => { w.document.title = cfg.tituloDoc; setTimeout(() => w.print(), 250); };
      setErrorInforme(result.missingImages ? `${result.missingImages} imagen(es) no estaban disponibles para el PDF.` : null);
    } catch (error) {
      w.close(); setErrorInforme(error instanceof Error ? error.message : 'No se pudo preparar el PDF.');
    } finally { setGenerandoPreview(false); }
  };

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        {/* HEADER */}
        <div className={styles.header}>
          <div className={styles.title}>{cfg.titulo}</div>
          <span className={`${styles.badge} ${styles.badgeOT}`}>OT {orden.ot}</span>
          <span className={styles.badge}>
            <span
              className={styles.badgeEstadoDot}
              style={{ background: colorEstado(orden.estado) }}
            />
            {orden.estado}
          </span>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={onClose}
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>

        {/* BODY */}
        <div className={styles.body}>
          {/* IZQUIERDA */}
          <div className={styles.left}>
            <div className={styles.section}>
              <div className={styles.sectionTitle}>Datos</div>
              <div className={styles.dataGrid}>
                <div className={styles.dataKey}>Rubro</div>
                <div className={styles.dataVal}>{orden.rubro || '—'}</div>
                <div className={styles.dataKey}>Responsable</div>
                <div className={styles.dataVal}>{orden.responsable || '—'}</div>
                <div className={styles.dataKey}>Fecha inicio</div>
                <div className={styles.dataVal}>{fechaCorta(orden.fecha_inicio_trabajos)}</div>
                <div className={styles.dataKey}>Fecha cierre</div>
                <div className={styles.dataVal}>{fechaCorta(orden.fecha_fin_trabajos)}</div>
                <div className={styles.dataKey}>Reincidente</div>
                <div className={styles.dataVal}>{orden.reincidencia ? 'Sí' : 'No'}</div>
              </div>
            </div>

            {muestraTextarea && (
              <div className={styles.section}>
                <div className={styles.voiceLabelRow}>
                  <label className={styles.label} htmlFor="obs-informe">{cfg.labelTextarea}</label>
                  <VoiceInputButton
                    value={observaciones}
                    onChange={value => {
                      const nuevoTexto = value.slice(0, MAX_OBSERVACIONES);
                      setObservaciones(nuevoTexto);
                      const doc = iframeRef.current?.contentDocument;
                      const el = doc?.getElementById('antecedentes-texto') ?? doc?.getElementById('bloque-texto-naranja');
                      if (el) el.textContent = nuevoTexto || (tipo === 'orden_servicio' ? 'Sin aclaraciones posteriores.' : 'Sin observaciones registradas.');
                      else setHtmlPreview(construirHtml(nuevoTexto));
                    }}
                    maxLength={MAX_OBSERVACIONES}
                  />
                </div>
                <div className={styles.sublabel}>
                  Texto que aparecerá en el informe. Editá libremente.
                </div>
                {cargandoComentario ? (
                  <div className={styles.skeletonLineas} aria-busy="true">
                    <div className={styles.skeletonLinea} />
                    <div className={styles.skeletonLinea} />
                    <div className={styles.skeletonLinea} />
                  </div>
                ) : (
                  <>
                    <textarea
                      id="obs-informe"
                      className={styles.textarea}
                      value={observaciones}
                      onChange={e => {
                        const nuevoTexto = e.target.value.slice(0, MAX_OBSERVACIONES);
                        setObservaciones(nuevoTexto);

                        // Patch directo del DOM del iframe — sin reload
                        const doc = iframeRef.current?.contentDocument;
                        const el =
                          doc?.getElementById('antecedentes-texto') ??
                          doc?.getElementById('bloque-texto-naranja');
                        if (el) {
                          el.textContent =
                            nuevoTexto || (tipo === 'orden_servicio' ? 'Sin aclaraciones posteriores.' : 'Sin observaciones registradas.');
                          return;
                        }

                        // Fallback: iframe aún no cargado — regen completa
                        setHtmlPreview(construirHtml(nuevoTexto));
                      }}
                      rows={7}
                      maxLength={MAX_OBSERVACIONES}
                      placeholder={cfg.placeholderTextarea}
                    />
                    <div className={styles.contador}>
                      {observaciones.length}/{MAX_OBSERVACIONES} caracteres
                    </div>
                  </>
                )}
              </div>
            )}

            {necesitaFotos && (
              <div className={styles.section}>
                <div className={styles.sectionTitle}>Opciones</div>
                <label className={styles.checkboxRow}>
                  <input
                    type="checkbox"
                    checked={incluirFotos}
                    onChange={e => setIncluirFotos(e.target.checked)}
                  />
                  <span className={styles.checkboxText}>
                    <span className={styles.checkboxLabel}>Incluir fotos</span>
                    <span className={styles.sublabel}>
                      Renderizar las fotos disponibles en el informe
                    </span>
                  </span>
                </label>
              </div>
            )}

            <div className={styles.section}>
              <button
                type="button"
                className={styles.btnRefresh}
                onClick={handleActualizarAhora}
                disabled={cargandoComentario || generandoPreview}
              >
                Actualizar preview
              </button>
            </div>
          </div>

          {/* DERECHA */}
          <div className={styles.right} ref={previewRef}>
            {htmlPreview ? (
              <div className={styles.previewSheet} style={{ width: 794 * escalaPreview, height: previewAlto * escalaPreview }}>
                <iframe
                  key={`${orden.id}-${tipo}`}
                  ref={iframeRef}
                  className={styles.iframe}
                  style={{ height: previewAlto, transform: `scale(${escalaPreview})` }}
                  srcDoc={htmlPreview}
                  sandbox="allow-same-origin"
                  scrolling="no"
                  title="Vista previa del informe"
                />
              </div>
            ) : !generandoPreview ? (
              <div className={styles.emptyState}>
                Hacé clic en <b>Actualizar preview</b>
              </div>
            ) : null}
            {generandoPreview && (
              <div className={styles.overlay}>
                <span className={styles.spinner} />
                <span>Actualizando preview...</span>
              </div>
            )}
          </div>
        </div>

        {/* FOOTER */}
        <div className={styles.footer}>
          <span className={styles.avisoImpresion}>
            {errorBorrador ?? errorInforme ?? (documento
              ? `${documento.codigo} · borrador v${versionBorrador}${cambiosBorrador ? ' · cambios sin guardar' : ''}`
              : 'Descargas de borrador. No son documentos emitidos ni aprobados.')}
          </span>
          {persistenciaDisponible && tipo !== 'acta' && (
            <button type="button" className={styles.btnSecondary} onClick={handleGuardarBorrador}
              disabled={cargandoComentario || guardandoBorrador || !cambiosBorrador}>
              {guardandoBorrador ? 'Guardando…' : 'Guardar borrador'}
            </button>
          )}
          <button type="button" className={styles.btnCancelar} onClick={onClose}>
            Cancelar
          </button>
          <button
            type="button"
            className={styles.btnSecondary}
            onClick={handleExportarHTML}
            disabled={!htmlPreview || generandoPreview}
          >
            Descargar HTML borrador
          </button>
          <button
            type="button"
            className={styles.btnPrimary}
            onClick={handleExportarPDF}
            disabled={!htmlPreview || generandoPreview}
          >
            Imprimir PDF borrador →
          </button>
        </div>
      </div>
    </div>
  );
}
