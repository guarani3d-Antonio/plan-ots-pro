import React, { useEffect, useState } from 'react';
import styles from './ModalDetalleOT.module.css';
import {
  emojiRubro,
  colorEstado,
  diasAbierto,
  formatearGuaranies,
} from '../../utils/calculos';
import {
  cargarFotosDeOrden,
  type FotoSubida,
  type CategoriaFoto,
} from '../../services/fotosService';

// ─────────────────────────────────────────────────────── Types ──

type EstadoOT    = 'Pendiente' | 'En proceso' | 'Cerrada' | 'No aplica';
type PrioridadOT = 'Alta' | 'Media' | 'Baja';

interface OrdenTrabajo {
  id: string;
  proyecto_id: string;
  ot: string;
  estado: EstadoOT;
  prioridad: PrioridadOT;
  responsable: string;
  rubro: string;
  ubicacion: string;
  comentarios?: string;
  pos_x?: number;
  pos_y?: number;
  campos?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
  fecha_ingreso?: string;
  obra?: string;
  unidad_amenities?: string;
  descripcion?: string;
  en_garantia?: boolean;
  asiste_facility?: boolean;
  costo?: number;
  nivel_riesgo?: 'Bajo' | 'Medio' | 'Alto' | 'Extremo' | null;
  rubro_secundario?: string[];
  contratistas?: string[];
  fecha_inicio_trabajos?: string;
  porcentaje_avance?: number;
  fecha_fin_trabajos?: string;
  reincidencia?: boolean;
  potencialmente_conflictivo?: boolean;
  acta_conformidad?: 'Pendiente' | 'enviada' | 'firmada' | 'no aplica';
  informe_relevamiento?: 'Pendiente' | 'enviada' | 'no aplica';
  informe_avance?: 'Pendiente' | 'enviada' | 'no aplica';
  informe_cierre?: 'Pendiente' | 'enviada' | 'no aplica';
}

interface Props {
  orden: OrdenTrabajo | null;
  proyectoId: string;
  onClose: () => void;
  onGuardado: () => void;
  onEditar?: () => void;
}

// ───────────────────────────────────────────────────── Helpers ──

const COLOR_RIESGO: Record<string, string> = {
  Bajo:    '#16A34A',
  Medio:   '#D97706',
  Alto:    '#EA580C',
  Extremo: '#DC2626',
};

const formatFecha = (iso?: string): string => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('es-PY', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  });
};

const Dash: React.FC = () => <span className={styles.dash}>—</span>;

const SiNoChip: React.FC<{ valor?: boolean }> = ({ valor }) => (
  <span className={valor ? styles.chipSi : styles.chipNo}>
    {valor ? 'Sí' : 'No'}
  </span>
);

const DOC_LABEL: Record<string, string> = {
  'pendiente': 'Pendiente',
  'enviada':   'Enviada',
  'firmada':   'Firmada',
  'no aplica': 'N.A.',
};

const InformeChip: React.FC<{ valor?: string }> = ({ valor }) => {
  if (!valor) return <Dash />;
  const norm = valor.toLowerCase();
  const claseMap: Record<string, string> = {
    'pendiente': styles.docPendiente,
    'enviada':   styles.docEnviada,
    'firmada':   styles.docFirmada,
    'no aplica': styles.docNoAplica,
  };
  const cls = claseMap[norm] ?? styles.docNoAplica;
  return <span className={`${styles.docChip} ${cls}`}>{DOC_LABEL[norm] ?? valor}</span>;
};

const Campo: React.FC<{ label: string; children: React.ReactNode; full?: boolean }> = ({
  label, children, full,
}) => (
  <div className={`${styles.campo} ${full ? styles.campoFull : ''}`}>
    <div className={styles.campoLabel}>{label}</div>
    <div className={styles.campoValor}>{children}</div>
  </div>
);

const Seccion: React.FC<{ titulo: string; children: React.ReactNode }> = ({
  titulo, children,
}) => (
  <section className={styles.seccion}>
    <h3 className={styles.seccionTitulo}>{titulo}</h3>
    <div className={styles.grid}>{children}</div>
  </section>
);

type FotoConId = FotoSubida & { id: string };

// ─────────────────────────────────────────────── Componente ──

export const ModalDetalleOT: React.FC<Props> = ({
  orden, onClose, onEditar,
}) => {
  const [fotos, setFotos] = useState<FotoConId[]>([]);

  useEffect(() => {
    if (!orden) return;
    cargarFotosDeOrden(orden.id)
      .then(setFotos)
      .catch(err => console.error('[ModalDetalleOT] fotos:', err));
  }, [orden?.id]);

  if (!orden) return null;

  const fotosPorCategoria = (cat: CategoriaFoto) =>
    fotos.filter(f => f.categoria === cat);

  const fotosAntes   = fotosPorCategoria('ANTES');
  const fotosDurante = fotosPorCategoria('DURANTE');
  const fotosDespues = fotosPorCategoria('DESPUES');
  const hayFotos = fotosAntes.length + fotosDurante.length + fotosDespues.length > 0;

  const dias = diasAbierto(
    orden.fecha_ingreso || orden.created_at,
    orden.estado === 'Cerrada' ? orden.fecha_fin_trabajos : undefined,
  );

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  const colorEst = colorEstado(orden.estado);

  return (
    <div className={styles.overlay} onClick={handleOverlayClick}>
      <div className={styles.modal}>

        {/* ─ Header ─ */}
        <header className={styles.header}>
          <div className={styles.headerLeft}>
            <span className={styles.rubroEmoji}>{emojiRubro(orden.rubro)}</span>
            <div className={styles.headerInfo}>
              <div className={styles.headerCodigo}>{orden.ot}</div>
              <div className={styles.headerObra}>
                {orden.obra || orden.ubicacion || 'Sin obra asignada'}
              </div>
            </div>
            <span
              className={styles.estadoBadge}
              style={{ background: colorEst, boxShadow: `0 0 0 3px ${colorEst}30` }}
            >
              {orden.estado}
            </span>
          </div>

          <div className={styles.headerActions}>
            {onEditar && (
              <button className={styles.btnEditar} onClick={onEditar} title="Editar OT">
                ✎ Editar
              </button>
            )}
            <button className={styles.btnCerrar} onClick={onClose} title="Cerrar">
              ✕
            </button>
          </div>
        </header>

        {/* ─ Body ─ */}
        <div className={styles.body}>

          {/* ────── Sección 1 — Identificación ────── */}
          <Seccion titulo="📋 Identificación">
            <Campo label="Código OT"><strong>{orden.ot}</strong></Campo>
            <Campo label="Fecha de ingreso">{formatFecha(orden.fecha_ingreso || orden.created_at)}</Campo>
            <Campo label="Días abierto">
              <strong>{dias}</strong> {dias === 1 ? 'día' : 'días'}
            </Campo>
            <Campo label="Obra">{orden.obra || <Dash />}</Campo>
            <Campo label="Unidad / Amenities">{orden.unidad_amenities || <Dash />}</Campo>
            <Campo label="Descripción" full>
              {orden.descripcion || orden.comentarios || <Dash />}
            </Campo>
          </Seccion>

          {/* ────── Sección 2 — Clasificación ────── */}
          <Seccion titulo="🔧 Clasificación">
            <Campo label="Estado">
              <span className={styles.estadoPill} style={{ background: colorEst }}>
                {orden.estado}
              </span>
            </Campo>
            <Campo label="Prioridad">
              <span className={`${styles.prioridadPill} ${styles[`prio${orden.prioridad}`]}`}>
                {orden.prioridad}
              </span>
            </Campo>
            <Campo label="Rubro principal">{orden.rubro || <Dash />}</Campo>
            <Campo label="Rubros secundarios">
              {orden.rubro_secundario && orden.rubro_secundario.length > 0
                ? <div className={styles.chipsRow}>
                    {orden.rubro_secundario.map(r => (
                      <span key={r} className={styles.chip}>{r}</span>
                    ))}
                  </div>
                : <Dash />}
            </Campo>
            <Campo label="Nivel de riesgo">
              {orden.nivel_riesgo
                ? <strong style={{ color: COLOR_RIESGO[orden.nivel_riesgo] }}>
                    {orden.nivel_riesgo}
                  </strong>
                : <Dash />}
            </Campo>
            <Campo label="En garantía"><SiNoChip valor={orden.en_garantia} /></Campo>
            <Campo label="Asiste Facility"><SiNoChip valor={orden.asiste_facility} /></Campo>
            <Campo label="Reincidencia"><SiNoChip valor={orden.reincidencia} /></Campo>
            <Campo label="Potenc. conflictivo"><SiNoChip valor={orden.potencialmente_conflictivo} /></Campo>
          </Seccion>

          {/* ────── Sección 3 — Ejecución ────── */}
          <Seccion titulo="🏗️ Ejecución">
            <Campo label="Responsable">{orden.responsable || <Dash />}</Campo>
            <Campo label="Contratistas">
              {orden.contratistas && orden.contratistas.length > 0
                ? <div className={styles.chipsRow}>
                    {orden.contratistas.map(c => (
                      <span key={c} className={styles.chip}>{c}</span>
                    ))}
                  </div>
                : <Dash />}
            </Campo>
            <Campo label="Fecha inicio">{formatFecha(orden.fecha_inicio_trabajos)}</Campo>
            <Campo label="Fecha fin">{formatFecha(orden.fecha_fin_trabajos)}</Campo>
            <Campo label="% Avance" full>
              <div className={styles.avanceWrap}>
                <div className={styles.avanceBar}>
                  <div
                    className={styles.avanceFill}
                    style={{ width: `${Math.max(0, Math.min(100, orden.porcentaje_avance ?? 0))}%` }}
                  />
                </div>
                <span className={styles.avanceNum}>{orden.porcentaje_avance ?? 0}%</span>
              </div>
            </Campo>
            <Campo label="Costo" full>
              <strong style={{ fontSize: 15 }}>
                {orden.costo != null && orden.costo > 0
                  ? formatearGuaranies(orden.costo)
                  : <Dash />}
              </strong>
            </Campo>
            <Campo label="Comentarios" full>
              {orden.comentarios
                ? <p className={styles.parrafo}>{orden.comentarios}</p>
                : <Dash />}
            </Campo>
          </Seccion>

          {/* ────── Sección 4 — Documentos ────── */}
          <Seccion titulo="📄 Documentos">
            <Campo label="Acta de conformidad"><InformeChip valor={orden.acta_conformidad} /></Campo>
            <Campo label="Informe relevamiento"><InformeChip valor={orden.informe_relevamiento} /></Campo>
            <Campo label="Informe avance"><InformeChip valor={orden.informe_avance} /></Campo>
            <Campo label="Informe cierre"><InformeChip valor={orden.informe_cierre} /></Campo>
          </Seccion>

          {/* ────── Sección 5 — Fotos ────── */}
          {hayFotos && (
            <section className={styles.seccion}>
              <h3 className={styles.seccionTitulo}>📷 Fotos</h3>

              {fotosAntes.length > 0 && (
                <div className={styles.fotoGrupo}>
                  <div className={styles.fotoCategoria}>ANTES</div>
                  <div className={styles.fotosGrid}>
                    {fotosAntes.map(f => (
                      <a key={f.id} href={f.url} target="_blank" rel="noreferrer" className={styles.fotoThumb}>
                        <img src={f.url} alt={f.nombre} loading="lazy" />
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {fotosDurante.length > 0 && (
                <div className={styles.fotoGrupo}>
                  <div className={styles.fotoCategoria}>DURANTE</div>
                  <div className={styles.fotosGrid}>
                    {fotosDurante.map(f => (
                      <a key={f.id} href={f.url} target="_blank" rel="noreferrer" className={styles.fotoThumb}>
                        <img src={f.url} alt={f.nombre} loading="lazy" />
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {fotosDespues.length > 0 && (
                <div className={styles.fotoGrupo}>
                  <div className={styles.fotoCategoria}>DESPUÉS</div>
                  <div className={styles.fotosGrid}>
                    {fotosDespues.map(f => (
                      <a key={f.id} href={f.url} target="_blank" rel="noreferrer" className={styles.fotoThumb}>
                        <img src={f.url} alt={f.nombre} loading="lazy" />
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </section>
          )}
        </div>
      </div>
    </div>
  );
};
