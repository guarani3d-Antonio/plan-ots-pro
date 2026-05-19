// src/components/informes/ModalInformeOT.tsx
//
// Modal fullscreen para previsualizar/exportar informes de OT. Soporta 5
// tipos: 'cierre' | 'ficha' | 'relevamiento' | 'avance' | 'acta'.
//
// Layout: panel izquierdo (datos read-only + observaciones editable + opciones),
// panel derecho (iframe srcdoc con el HTML generado).
//
// Carga inicial varía según tipo:
//   cierre       → comentario "En proceso → Cerrada" + fotos ANTES y DESPUÉS.
//   ficha        → orden.comentarios (sin fetch) + sin fotos.
//   relevamiento → comentario "Pendiente → En proceso" + fotos ANTES.
//   avance       → comentario "Pendiente → En proceso" + fotos ANTES + DURANTE.
//   acta         → sin texto editable + sin fotos.
//
// Estrategia de actualización del preview:
// - Tipeo en observaciones → parche directo del <p> dentro del DOM del iframe
//   (sin recargar). Cero parpadeo, latencia inmediata.
// - Cambio de opciones (incluirFotos), carga inicial, cambio de OT/tipo → regen
//   completa del HTML y reload del iframe via srcDoc.
import { useEffect, useRef, useState } from 'react';
import type { OrdenLocal } from '../../types/orden';
import {
  generarInformeCierre,
  generarInformeFichaVisita,
  generarInformeRelevamiento,
  generarInformeAvance,
  generarInformeActaConformidad,
} from '../../services/reportService';
import { fetchComentarioTransicion } from '../../services/comentariosService';
import { cargarFotosDeOrden } from '../../services/fotosService';
import { colorEstado } from '../../utils/calculos';
import styles from './ModalInformeOT.module.css';

export type TipoInforme = 'cierre' | 'ficha' | 'relevamiento' | 'avance' | 'acta';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  orden: OrdenLocal;
  proyectoNombre: string;
  tipo: TipoInforme;
}

type FotoMin = { file_url: string; descripcion?: string | null };

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
    tituloDoc: 'Informe de Cierre de OT - BBC Constructora',
    fileSlug: 'Informe_Cierre',
    labelTextarea: 'Antecedentes y Diagnóstico *',
    placeholderTextarea: 'Ingresá los antecedentes y diagnóstico de la OT...',
    necesitaFotosAntes: true,
    necesitaFotosDespues: true,
    necesitaFotosDurante: false,
  },
  ficha: {
    titulo: 'Ficha de Visita Técnica',
    tituloDoc: 'Ficha de Visita - BBC Constructora',
    fileSlug: 'Ficha_Visita',
    labelTextarea: 'Descripción del Trabajo',
    placeholderTextarea: 'Describí brevemente el trabajo a realizar...',
    necesitaFotosAntes: false,
    necesitaFotosDespues: false,
    necesitaFotosDurante: false,
  },
  relevamiento: {
    titulo: 'Informe de Relevamiento',
    tituloDoc: 'Informe de Relevamiento - BBC Constructora',
    fileSlug: 'Informe_Relevamiento',
    labelTextarea: 'Diagnóstico Inicial',
    placeholderTextarea: 'Detallá el diagnóstico técnico inicial...',
    necesitaFotosAntes: true,
    necesitaFotosDespues: false,
    necesitaFotosDurante: false,
  },
  avance: {
    titulo: 'Informe de Avance',
    tituloDoc: 'Informe de Avance - BBC Constructora',
    fileSlug: 'Informe_Avance',
    labelTextarea: 'Estado Actual del Trabajo',
    placeholderTextarea: 'Describí el progreso actual de los trabajos...',
    necesitaFotosAntes: true,
    necesitaFotosDespues: false,
    necesitaFotosDurante: true,
  },
  acta: {
    titulo: 'Acta de Conformidad',
    tituloDoc: 'Acta de Conformidad - BBC Constructora',
    fileSlug: 'Acta_Conformidad',
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

  // `firstRender` controla si el primer build del preview es inmediato o
  // pasa por el debounce. Tras el load inicial queremos ver el HTML ya;
  // toda edición posterior pasa por DEBOUNCE_MS.
  const firstRenderRef = useRef(true);

  // El toggle "Incluir fotos" debe regenerar el preview de inmediato (sin
  // esperar el debounce). Comparamos contra el valor previo dentro del effect
  // y forzamos delay=0 cuando cambia.
  const prevIncluirFotosRef = useRef(incluirFotos);

  // Acceso directo al iframe para parchar el DOM al tipear, sin reload.
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Reset de flags al cambiar de OT o tipo (cuando el modal se reabre).
  useEffect(() => {
    firstRenderRef.current = true;
    setHtmlPreview('');
    setObservaciones('');
    setFotosAntes([]);
    setFotosDespues([]);
    setFotosDurante([]);
  }, [orden.id, tipo]);

  // Construye el HTML actual según `tipo`. Función pura — todos los datos
  // vienen de state/props. Se llama desde el effect de regen, desde
  // handleActualizarAhora, y desde los handlers de export.
  const construirHtml = (textoActual: string): string => {
    const fa = incluirFotos ? fotosAntes : [];
    const fd = incluirFotos ? fotosDespues : [];
    const fdu = incluirFotos ? fotosDurante : [];
    switch (tipo) {
      case 'cierre':
        return generarInformeCierre(orden, proyectoNombre, textoActual, fa, fd);
      case 'ficha':
        return generarInformeFichaVisita(orden, textoActual);
      case 'relevamiento':
        return generarInformeRelevamiento(orden, textoActual, fa);
      case 'avance':
        return generarInformeAvance(orden, textoActual, fa, fdu);
      case 'acta':
        return generarInformeActaConformidad(orden);
    }
  };

  // Carga inicial: comentario (según tipo) + fotos (si las requiere el tipo).
  useEffect(() => {
    if (!isOpen) return;
    let cancelado = false;
    setCargandoComentario(true);

    // Fuente del comentario pre-llenado
    let promComentario: Promise<string>;
    switch (tipo) {
      case 'cierre':
        promComentario = fetchComentarioTransicion(orden.id, 'En proceso', 'Cerrada');
        break;
      case 'relevamiento':
      case 'avance':
        promComentario = fetchComentarioTransicion(orden.id, 'Pendiente', 'En proceso');
        break;
      case 'ficha':
        promComentario = Promise.resolve(orden.comentarios ?? '');
        break;
      case 'acta':
      default:
        promComentario = Promise.resolve('');
        break;
    }

    // Fotos sólo si las necesita el tipo
    const promFotos = necesitaFotos
      ? cargarFotosDeOrden(orden.id)
      : Promise.resolve([] as Awaited<ReturnType<typeof cargarFotosDeOrden>>);

    Promise.all([promComentario, promFotos])
      .then(([com, fotos]) => {
        if (cancelado) return;
        setObservaciones(com);
        if (cfg.necesitaFotosAntes) {
          setFotosAntes(
            fotos
              .filter(f => f.categoria === 'ANTES')
              .map(f => ({ file_url: f.url, descripcion: f.descripcion ?? null })),
          );
        }
        if (cfg.necesitaFotosDespues) {
          setFotosDespues(
            fotos
              .filter(f => f.categoria === 'DESPUES')
              .map(f => ({ file_url: f.url, descripcion: f.descripcion ?? null })),
          );
        }
        if (cfg.necesitaFotosDurante) {
          setFotosDurante(
            fotos
              .filter(f => f.categoria === 'DURANTE')
              .map(f => ({ file_url: f.url, descripcion: f.descripcion ?? null })),
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
  }, [isOpen, orden.id, tipo, necesitaFotos, cfg.necesitaFotosAntes, cfg.necesitaFotosDespues, cfg.necesitaFotosDurante, orden.comentarios]);

  // Regeneración del preview ante cambios que requieren rebuild completo.
  // Las ediciones del textarea NO disparan este effect — se patchea el DOM
  // del iframe directamente desde onChange para evitar el parpadeo del reload.
  useEffect(() => {
    if (!isOpen || cargandoComentario) return;
    const incluirFotosCambio = prevIncluirFotosRef.current !== incluirFotos;
    prevIncluirFotosRef.current = incluirFotos;
    const delay = firstRenderRef.current || incluirFotosCambio ? 0 : DEBOUNCE_MS;
    firstRenderRef.current = false;
    setGenerandoPreview(true);
    const t = window.setTimeout(() => {
      setHtmlPreview(construirHtml(observaciones));
      setGenerandoPreview(false);
    }, delay);
    return () => {
      window.clearTimeout(t);
    };
    // `observaciones` queda fuera de las deps a propósito: las edita el usuario
    // tipeando y la actualización va por DOM patch (ver onChange del textarea).
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

  const handleActualizarAhora = () => {
    if (cargandoComentario) return;
    setGenerandoPreview(true);
    setHtmlPreview(construirHtml(observaciones));
    setGenerandoPreview(false);
  };

  const handleExportarHTML = () => {
    if (cargandoComentario) return;
    const html = construirHtml(observaciones);
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const fecha = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `${cfg.fileSlug}_OT${orden.ot}_${fecha}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleExportarPDF = () => {
    if (cargandoComentario) return;
    const html = construirHtml(observaciones);
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.open();
    w.document.write(html);
    w.document.close();
    // Damos tiempo a las fotos (URLs públicas de Storage) a cargar antes de
    // abrir el diálogo de impresión. Si no, el PDF sale sin imágenes.
    w.onload = () => {
      w.document.title = cfg.tituloDoc;
      setTimeout(() => w.print(), 250);
    };
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
                <label className={styles.label} htmlFor="obs-informe">
                  {cfg.labelTextarea}
                </label>
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

                        // Patch directo del DOM del iframe — sin reload.
                        // Para Cierre el id es "antecedentes-texto"; para los
                        // otros informes (Ficha / Relevamiento / Avance) usan
                        // _bloqueNaranjaIzquierdo con id "bloque-texto-naranja".
                        const doc = iframeRef.current?.contentDocument;
                        const el =
                          doc?.getElementById('antecedentes-texto') ??
                          doc?.getElementById('bloque-texto-naranja');
                        if (el) {
                          el.textContent =
                            nuevoTexto || 'Sin observaciones registradas.';
                          return;
                        }

                        // Fallback: iframe aún no cargado — regen completa.
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
          <div className={styles.right}>
            {htmlPreview ? (
              <iframe
                key={`${orden.id}-${tipo}`}
                ref={iframeRef}
                className={styles.iframe}
                srcDoc={htmlPreview}
                title="preview-informe"
              />
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
          <button type="button" className={styles.btnCancelar} onClick={onClose}>
            Cancelar
          </button>
          <button
            type="button"
            className={styles.btnSecondary}
            onClick={handleExportarHTML}
            disabled={!htmlPreview || generandoPreview}
          >
            Exportar HTML
          </button>
          <button
            type="button"
            className={styles.btnPrimary}
            onClick={handleExportarPDF}
            disabled={!htmlPreview || generandoPreview}
          >
            Exportar PDF →
          </button>
        </div>
      </div>
    </div>
  );
}
