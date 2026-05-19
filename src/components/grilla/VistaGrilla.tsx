import React, { Fragment, useEffect, useMemo, useState, useRef, useCallback } from 'react';
import type { CSSProperties } from 'react';
import Papa from 'papaparse';
import styles from './VistaGrilla.module.css';
import { useOrdenesStore } from '../../stores/ordenesStore';
import { ModalDetalleOT } from './ModalDetalleOT';
import { getCamposDeProyecto, type CampoDefinicion } from '../../services/camposService';
import { colorEstado } from '../../utils/calculos';

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
  proyectoId: string;
  proyectoNombre: string;
  onBack: () => void;
  onSwitchToPlano: () => void;
}

// ─────────────────────────────────────────────── Constantes ──

const LS_COLS_KEY = 'grilla_columnas_visibles';
const LS_COLS_OCULTAS_KEY = 'grilla_columnas_ocultas';
const RIESGOS = ['Bajo', 'Medio', 'Alto', 'Extremo'] as const;

const ESTADOS: EstadoOT[]       = ['Pendiente', 'En proceso', 'Cerrada', 'No aplica'];
const PRIORIDADES: PrioridadOT[] = ['Alta', 'Media', 'Baja'];

const COLOR_PRIORIDAD: Record<PrioridadOT, { color: string; bold: boolean }> = {
  'Alta':  { color: '#EF4444', bold: true  },
  'Media': { color: '#F59E0B', bold: false },
  'Baja':  { color: '#6B7280', bold: false },
};

const COLOR_RIESGO: Record<string, string> = {
  Bajo: '#16A34A', Medio: '#D97706', Alto: '#EA580C', Extremo: '#DC2626',
};

const AVATAR_PALETTE = ['#1E40AF', '#15803D', '#C2410C', '#7C3AED', '#0E7490', '#BE123C', '#B45309'];

interface Columna {
  key: string;
  label: string;
  minWidth: number;
  fija?: boolean;
}

const COLUMNAS: Columna[] = [
  { key: 'ot',                         label: 'OT',            minWidth: 90,  fija: true },
  { key: 'fecha_ingreso',              label: 'F. Ingreso',    minWidth: 120 },
  { key: 'obra',                       label: 'Obra',          minWidth: 140 },
  { key: 'unidad_amenities',           label: 'Unidad',        minWidth: 120 },
  { key: 'estado',                     label: 'Estado',        minWidth: 110 },
  { key: 'prioridad',                  label: 'Prioridad',     minWidth: 90  },
  { key: 'rubro',                      label: 'Rubro',         minWidth: 140 },
  { key: 'rubro_secundario',           label: 'Rubro sec.',    minWidth: 140 },
  { key: 'nivel_riesgo',               label: 'Riesgo',        minWidth: 90  },
  { key: 'responsable',                label: 'Responsable',   minWidth: 150 },
  { key: 'contratistas',               label: 'Contratistas',  minWidth: 150 },
  { key: 'fecha_inicio_trabajos',      label: 'Inicio',        minWidth: 100 },
  { key: 'fecha_fin_trabajos',         label: 'Fin',           minWidth: 100 },
  { key: 'porcentaje_avance',          label: 'Avance',        minWidth: 110 },
  { key: 'costo',                      label: 'Costo (Gs.)',   minWidth: 130 },
  { key: 'en_garantia',                label: 'Garantía',      minWidth: 80  },
  { key: 'asiste_facility',            label: 'Facility',      minWidth: 80  },
  { key: 'reincidencia',               label: 'Reincidencia',  minWidth: 90  },
  { key: 'potencialmente_conflictivo', label: 'Conflictivo',   minWidth: 90  },
  { key: 'acta_conformidad',           label: 'Acta',          minWidth: 100 },
  { key: 'informe_relevamiento',       label: 'Relevamiento',  minWidth: 110 },
  { key: 'informe_avance',             label: 'Avance doc.',   minWidth: 100 },
  { key: 'informe_cierre',             label: 'Cierre',        minWidth: 90  },
  { key: 'descripcion',                label: 'Descripción',   minWidth: 200 },
  { key: 'comentarios',                label: 'Observaciones', minWidth: 200 },
  { key: 'created_at',                 label: 'Creado',        minWidth: 100 },
];

const FECHA_KEYS = new Set([
  'fecha_ingreso', 'fecha_inicio_trabajos', 'fecha_fin_trabajos', 'created_at',
]);
const BOOL_KEYS = new Set([
  'en_garantia', 'asiste_facility', 'reincidencia', 'potencialmente_conflictivo',
]);
const DOC_KEYS = new Set([
  'acta_conformidad', 'informe_relevamiento', 'informe_avance', 'informe_cierre',
]);
const ARR_KEYS = new Set(['rubro_secundario', 'contratistas']);

// Columnas fijas de la vista Kanban — una por cada EstadoOT.
const KANBAN_COLUMNAS: { estado: EstadoOT; label: string; color: string }[] = [
  { estado: 'Pendiente',  label: 'PENDIENTE',  color: '#DC2626' },
  { estado: 'En proceso', label: 'EN PROCESO', color: '#2563EB' },
  { estado: 'Cerrada',    label: 'CERRADA',    color: '#16A34A' },
  { estado: 'No aplica',  label: 'NO APLICA',  color: '#6B7280' },
];

// Campos opcionables para cada KanbanCard. `default: true` define el subset
// inicial cuando el usuario nunca personalizó. Persistido en localStorage.
const CAMPOS_TARJETA: { key: string; label: string; default: boolean }[] = [
  { key: 'descripcion',           label: 'Descripción',         default: false },
  { key: 'obra',                  label: 'Obra',                default: true  },
  { key: 'unidad_amenities',      label: 'Unidad / Amenities',  default: false },
  { key: 'rubro',                 label: 'Rubro',               default: true  },
  { key: 'rubro_secundario',      label: 'Rubro Secundario',    default: false },
  { key: 'nivel_riesgo',          label: 'Nivel de Riesgo',     default: false },
  { key: 'responsable',           label: 'Responsable',         default: true  },
  { key: 'contratistas',          label: 'Contratistas',        default: false },
  { key: 'fecha_ingreso',         label: 'Fecha de ingreso',    default: true  },
  { key: 'fecha_inicio_trabajos', label: 'Fecha inicio',        default: false },
  { key: 'fecha_fin_trabajos',    label: 'Fecha fin',           default: false },
  { key: 'costo',                 label: 'Costo (Gs.)',         default: false },
  { key: 'en_garantia',           label: 'Garantía con BBC',    default: false },
  { key: 'asiste_facility',       label: 'Asiste Facility',     default: false },
  { key: 'porcentaje_avance',     label: 'Barra de avance',     default: true  },
  { key: 'comentarios',           label: 'Observaciones',       default: false },
];
const LS_CAMPOS_TARJETA_KEY = 'kanban_campos_tarjeta';

// Columnas por las que se puede agrupar.
const AGRUPABLES: { key: string; label: string }[] = [
  { key: 'obra',         label: 'Obra' },
  { key: 'estado',       label: 'Estado' },
  { key: 'rubro',        label: 'Rubro' },
  { key: 'nivel_riesgo', label: 'Riesgo' },
  { key: 'responsable',  label: 'Responsable' },
  { key: 'prioridad',    label: 'Prioridad' },
];

// ─────────────────────────────────────────────── Helpers ──

function colorFromName(nombre: string): string {
  if (!nombre) return AVATAR_PALETTE[0];
  let h = 0;
  for (let i = 0; i < nombre.length; i++) h = (h * 31 + nombre.charCodeAt(i)) >>> 0;
  return AVATAR_PALETTE[h % AVATAR_PALETTE.length];
}

const inicial = (n: string) => n ? n.trim().charAt(0).toUpperCase() : '?';

function formatFecha(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('es-PY', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

function formatFechaHora(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleString('es-PY', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

function formatGuaranies(v?: number | null): string {
  if (v == null) return '—';
  return new Intl.NumberFormat('es-PY').format(v) + ' Gs.';
}

// Logo Guaraní 3D — duplicado de reportService.ts a propósito para no
// importar todo el módulo de reportes pesados sólo por el SVG.
const LOGO_G3D_SVG = `
<svg width="160" height="44" viewBox="0 0 160 44" xmlns="http://www.w3.org/2000/svg">
  <text x="0" y="34" font-family="Georgia, serif" font-size="38" font-weight="700" fill="#C9922A">g</text>
  <rect x="30" y="4" width="2" height="36" fill="#C9922A"/>
  <text x="38" y="22" font-family="Arial, sans-serif" font-size="16" font-weight="700" fill="#FFFFFF">Guaraní</text>
  <text x="38" y="38" font-family="Arial, sans-serif" font-size="16" font-weight="700" fill="#C9922A">3d</text>
  <text x="72" y="28" font-family="Arial, sans-serif" font-size="6.5" font-weight="600" fill="#C9922A" letter-spacing="0.5">DE DIAZ VILLAVERDE</text>
  <text x="72" y="37" font-family="Arial, sans-serif" font-size="6.5" font-weight="600" fill="#C9922A" letter-spacing="0.5">CONSTRUCTORA</text>
</svg>`;

// ─────────────────────────────────────────────── Sub-celdas ──

const EstadoBadge: React.FC<{ estado: EstadoOT }> = ({ estado }) => {
  const cls = {
    'Cerrada':    styles.badgeCerrada,
    'En proceso': styles.badgeEnProceso,
    'Pendiente':  styles.badgePendiente,
    'No aplica':  styles.badgeNoAplica,
  }[estado];
  const label = estado === 'En proceso' ? 'En Proceso' : estado.toUpperCase();
  return <span className={`${styles.badge} ${cls}`} style={{ padding: '2px 8px', fontSize: 11 }}>{label}</span>;
};

const AvatarCell: React.FC<{ nombre: string }> = ({ nombre }) => {
  if (!nombre) return <span className={styles.cellDash}>—</span>;
  return (
    <div className={styles.avatarCell} style={{ gap: 6 }}>
      <div
        className={styles.avatarCircle}
        style={{
          background: colorFromName(nombre),
          width: 26, height: 26,
          fontSize: 11, fontWeight: 700,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', borderRadius: '50%',
          flexShrink: 0,
        }}
      >
        {inicial(nombre)}
      </div>
      <span className={styles.avatarNombre} style={{ fontSize: 12 }}>{nombre}</span>
    </div>
  );
};

// Barra de avance: 1.5px thin bar + porcentaje, color según valor.
const ProgressCell: React.FC<{ avance: number }> = ({ avance }) => {
  const pct = Math.max(0, Math.min(100, avance));
  const color =
    pct >= 100 ? '#16A34A' :
    pct >= 70  ? '#16A34A' :
    pct >= 30  ? '#D97706' :
    pct > 0    ? '#EF4444' : '#94A3B8';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 80 }}>
      <span style={{ fontSize: 11, fontWeight: 600, color: '#0F172A' }}>{pct}%</span>
      <div style={{ height: 4, background: '#E2E2E7', borderRadius: 2 }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 2, transition: 'width .2s' }} />
      </div>
    </div>
  );
};

const Dash = () => <span className={styles.cellDash}>—</span>;

const SiNoChip: React.FC<{ v?: boolean }> = ({ v }) =>
  v ? <span className={styles.chipSi}>Sí</span> : <span className={styles.chipNo}>No</span>;

const DocChip: React.FC<{ v?: string }> = ({ v }) => {
  if (!v) return <Dash />;
  const norm = v.toLowerCase();
  const map: Record<string, { cls: string; label: string }> = {
    'pendiente': { cls: styles.docPendiente, label: 'Pendiente' },
    'enviada':   { cls: styles.docEnviada,   label: 'Enviada'   },
    'firmada':   { cls: styles.docFirmada,   label: 'Firmada'   },
    'no aplica': { cls: styles.docNoAplica,  label: 'N.A.'      },
  };
  const s = map[norm] ?? map['no aplica'];
  return <span className={`${styles.docChip} ${s.cls}`}>{s.label}</span>;
};

// Obra como pill verde (FM Manager style).
const ObraPill: React.FC<{ obra?: string }> = ({ obra }) => {
  if (!obra) return <Dash />;
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 8px',
      background: '#DCFCE7',
      color: '#166534',
      fontWeight: 700,
      fontSize: 11,
      borderRadius: 4,
      whiteSpace: 'nowrap',
    }}>{obra}</span>
  );
};

// Fecha ingreso con created_at en gris debajo.
const FechaIngresoCell: React.FC<{ fechaIngreso?: string; createdAt?: string }> = ({ fechaIngreso, createdAt }) => {
  const principal = formatFecha(fechaIngreso ?? createdAt);
  const sub = createdAt ? formatFechaHora(createdAt) : '';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2 }}>
      <span style={{ fontSize: 12, color: '#0F172A', fontWeight: 600 }}>{principal}</span>
      {sub && <span style={{ fontSize: 10, color: '#94A3B8' }}>{sub}</span>}
    </div>
  );
};

// Render principal de cada celda según la key de la columna.
function renderizarCelda(key: string, orden: OrdenTrabajo): React.ReactNode {
  const v = (orden as unknown as Record<string, unknown>)[key];

  if (key === 'ot') return (
    <span style={{
      fontFamily: 'Menlo, Monaco, Consolas, monospace',
      fontWeight: 700,
      color: '#001E40',
      fontSize: 12,
    }}>{orden.ot}</span>
  );
  if (key === 'fecha_ingreso') return <FechaIngresoCell fechaIngreso={orden.fecha_ingreso} createdAt={orden.created_at} />;
  if (key === 'obra') return <ObraPill obra={orden.obra} />;
  if (key === 'estado') return <EstadoBadge estado={orden.estado} />;
  if (key === 'prioridad') {
    const c = COLOR_PRIORIDAD[orden.prioridad];
    return <span style={{ color: c.color, fontWeight: c.bold ? 700 : 500 }}>{orden.prioridad}</span>;
  }
  if (key === 'nivel_riesgo') {
    if (!orden.nivel_riesgo) return <Dash />;
    return <span style={{ color: COLOR_RIESGO[orden.nivel_riesgo] ?? '#64748B', fontWeight: 700, fontSize: 12 }}>{orden.nivel_riesgo}</span>;
  }
  if (key === 'responsable') return <AvatarCell nombre={orden.responsable} />;
  if (key === 'porcentaje_avance') return <ProgressCell avance={orden.porcentaje_avance ?? 0} />;
  if (key === 'costo') {
    return orden.costo != null && orden.costo > 0
      ? <span style={{ fontWeight: 600, color: '#1E293B' }}>{formatGuaranies(orden.costo)}</span>
      : <Dash />;
  }
  if (key === 'descripcion') {
    const txt = orden.descripcion;
    if (!txt) return <Dash />;
    return (
      <span
        title={txt}
        style={{
          fontStyle: 'italic',
          color: '#43474F',
          fontSize: 12,
          display: 'block',
          maxWidth: 200,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >{txt}</span>
    );
  }
  if (key === 'comentarios') {
    const txt = orden.comentarios;
    if (!txt) return <Dash />;
    return <span className={styles.cellDesc} title={txt}>{txt}</span>;
  }
  if (FECHA_KEYS.has(key)) {
    return <span className={styles.tdFecha}>{formatFecha(v as string | undefined)}</span>;
  }
  if (BOOL_KEYS.has(key)) {
    return <SiNoChip v={v as boolean | undefined} />;
  }
  if (DOC_KEYS.has(key)) {
    return <DocChip v={v as string | undefined} />;
  }
  if (ARR_KEYS.has(key)) {
    const arr = v as string[] | undefined;
    if (!arr || arr.length === 0) return <Dash />;
    return <span className={styles.tdRubro}>{arr.join(', ')}</span>;
  }

  if (v === null || v === undefined || v === '') return <Dash />;
  return <span style={{ fontSize: 12, color: '#374151' }}>{String(v)}</span>;
}

function renderizarCampoCustom(campo: CampoDefinicion, orden: OrdenTrabajo): React.ReactNode {
  const valor = orden.campos?.[campo.id];
  if (valor == null || valor === '') return <Dash />;
  if (campo.tipo === 'fecha' && typeof valor === 'string') return <span className={styles.tdFecha}>{formatFecha(valor)}</span>;
  if (campo.tipo === 'booleano') return <SiNoChip v={!!valor} />;
  if (campo.tipo === 'seleccion_multiple' && Array.isArray(valor)) return <span>{valor.join(', ')}</span>;
  if (campo.tipo === 'url' && typeof valor === 'string') {
    return <a href={valor} target="_blank" rel="noreferrer" style={{ color: '#1E3A5F', textDecoration: 'underline' }}>{valor}</a>;
  }
  return <span style={{ fontSize: 12, color: '#374151' }}>{String(valor)}</span>;
}

// Render como texto plano para la exportación a PDF (sin JSX).
function celdaATexto(key: string, orden: OrdenTrabajo): string {
  const v = (orden as unknown as Record<string, unknown>)[key];
  if (key === 'porcentaje_avance') return `${orden.porcentaje_avance ?? 0}%`;
  if (key === 'costo')             return orden.costo != null && orden.costo > 0 ? formatGuaranies(orden.costo) : '—';
  if (FECHA_KEYS.has(key))         return formatFecha(v as string | undefined);
  if (BOOL_KEYS.has(key))          return v ? 'Sí' : 'No';
  if (ARR_KEYS.has(key)) {
    const arr = v as string[] | undefined;
    return arr && arr.length > 0 ? arr.join(', ') : '—';
  }
  if (v == null || v === '') return '—';
  return String(v);
}

// ─────────────────────────────────────────────── Filtro Pill ──

interface FiltroPillProps {
  label:     string;
  opciones:  string[];
  seleccion: Set<string>;
  onToggle:  (valor: string) => void;
  onClear:   () => void;
  abierto:   boolean;
  onToggleAbierto: () => void;
}

const FiltroPill: React.FC<FiltroPillProps> = ({
  label, opciones, seleccion, onToggle, onClear, abierto, onToggleAbierto,
}) => {
  const activo = seleccion.size > 0;
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!abierto) return;
    const fn = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onToggleAbierto();
    };
    document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, [abierto, onToggleAbierto]);
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={onToggleAbierto}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '3px 8px', height: 26, fontSize: 11, fontWeight: 600,
          background: activo ? '#1E3A5F' : '#fff',
          color:      activo ? '#fff'    : '#43474F',
          border:     `1px solid ${activo ? '#1E3A5F' : '#E2E2E7'}`,
          borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit',
          whiteSpace: 'nowrap', flexShrink: 0,
        }}
      >
        {label}{activo && ` · ${seleccion.size}`} {abierto ? '▴' : '▾'}
        {activo && (
          <span
            role="button"
            onClick={(e) => { e.stopPropagation(); onClear(); }}
            style={{ marginLeft: 4, fontWeight: 700, opacity: 0.85 }}
          >✕</span>
        )}
      </button>
      {abierto && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, marginTop: 6,
          background: '#fff', border: '1px solid #E2E2E7', borderRadius: 10,
          boxShadow: '0 8px 24px rgba(0,51,102,0.12)',
          minWidth: 200, maxHeight: 320, overflow: 'auto', zIndex: 50,
          padding: 6,
        }}>
          {opciones.length === 0 ? (
            <div style={{ padding: 10, fontSize: 12, color: '#94A3B8' }}>Sin opciones</div>
          ) : opciones.map(op => {
            const checked = seleccion.has(op);
            return (
              <label key={op} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '6px 8px', fontSize: 12, cursor: 'pointer',
                borderRadius: 6,
                background: checked ? '#EEF2FA' : 'transparent',
              }}>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => onToggle(op)}
                  style={{ accentColor: '#1E3A5F' }}
                />
                <span style={{ color: '#0F172A' }}>{op}</span>
              </label>
            );
          })}
          {seleccion.size > 0 && (
            <button
              type="button"
              onClick={onClear}
              style={{
                width: '100%', marginTop: 4, padding: '6px 8px',
                fontSize: 11, fontWeight: 600, color: '#64748B',
                background: 'transparent', border: 'none', cursor: 'pointer',
                fontFamily: 'inherit', textAlign: 'left',
              }}
            >Limpiar selección</button>
          )}
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────── Group-by Pill ──

interface GroupByPillProps {
  agruparPor: string | null;
  onSet:      (key: string | null) => void;
  abierto:    boolean;
  onToggleAbierto: () => void;
}

const GroupByPill: React.FC<GroupByPillProps> = ({ agruparPor, onSet, abierto, onToggleAbierto }) => {
  const activo = !!agruparPor;
  const label = activo
    ? `Agrupado por: ${AGRUPABLES.find(a => a.key === agruparPor)?.label ?? agruparPor}`
    : 'Agrupar por';
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!abierto) return;
    const fn = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onToggleAbierto();
    };
    document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, [abierto, onToggleAbierto]);
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={onToggleAbierto}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '3px 8px', height: 26, fontSize: 11, fontWeight: 600,
          background: activo ? '#1E3A5F' : '#fff',
          color:      activo ? '#fff'    : '#43474F',
          border:     `1px solid ${activo ? '#1E3A5F' : '#E2E2E7'}`,
          borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit',
          whiteSpace: 'nowrap', flexShrink: 0,
        }}
      >
        ⊞ {label} {abierto ? '▴' : '▾'}
        {activo && (
          <span
            role="button"
            onClick={(e) => { e.stopPropagation(); onSet(null); }}
            style={{ marginLeft: 4, fontWeight: 700, opacity: 0.85 }}
          >✕</span>
        )}
      </button>
      {abierto && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, marginTop: 6,
          background: '#fff', border: '1px solid #E2E2E7', borderRadius: 10,
          boxShadow: '0 8px 24px rgba(0,51,102,0.12)',
          minWidth: 200, zIndex: 50, padding: 6,
        }}>
          <button
            type="button"
            onClick={() => { onSet(null); onToggleAbierto(); }}
            style={{
              width: '100%', padding: '6px 8px', fontSize: 12,
              background: agruparPor === null ? '#EEF2FA' : 'transparent',
              border: 'none', borderRadius: 6, textAlign: 'left',
              cursor: 'pointer', fontFamily: 'inherit', color: '#0F172A',
            }}
          >Sin agrupar</button>
          {AGRUPABLES.map(a => (
            <button
              key={a.key}
              type="button"
              onClick={() => { onSet(a.key); onToggleAbierto(); }}
              style={{
                width: '100%', padding: '6px 8px', fontSize: 12,
                background: agruparPor === a.key ? '#EEF2FA' : 'transparent',
                border: 'none', borderRadius: 6, textAlign: 'left',
                cursor: 'pointer', fontFamily: 'inherit', color: '#0F172A',
              }}
            >{a.label}</button>
          ))}
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────── Ocultar Columnas Pill ──

interface OcultarColumnasPillProps {
  columnasOcultas: Set<string>;
  setColumnasOcultas: React.Dispatch<React.SetStateAction<Set<string>>>;
  abierto: boolean;
  onToggleAbierto: () => void;
}

const OcultarColumnasPill: React.FC<OcultarColumnasPillProps> = ({
  columnasOcultas, setColumnasOcultas, abierto, onToggleAbierto,
}) => {
  // OT (col.fija) y la columna "Acciones" (no es parte de COLUMNAS) son fijas.
  const opcionables = COLUMNAS.filter(c => !c.fija);
  const activo = columnasOcultas.size > 0;
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!abierto) return;
    const fn = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onToggleAbierto();
    };
    document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, [abierto, onToggleAbierto]);
  const toggle = (key: string) => setColumnasOcultas(prev => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={onToggleAbierto}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '3px 8px', height: 26, fontSize: 11, fontWeight: 600,
          background: activo ? '#1E3A5F' : '#fff',
          color:      activo ? '#fff'    : '#43474F',
          border:     `1px solid ${activo ? '#1E3A5F' : '#E2E2E7'}`,
          borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit',
          whiteSpace: 'nowrap', flexShrink: 0,
        }}
      >
        👁 Ocultar{activo && ` · ${columnasOcultas.size}`} {abierto ? '▴' : '▾'}
      </button>
      {abierto && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, marginTop: 6,
          background: '#fff', border: '1px solid #E2E2E7', borderRadius: 10,
          boxShadow: '0 8px 24px rgba(0,51,102,0.12)',
          minWidth: 240, maxHeight: 320, overflowY: 'auto', zIndex: 50,
          padding: 6,
        }}>
          {opcionables.map(col => {
            const oculta = columnasOcultas.has(col.key);
            return (
              <label key={col.key} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '6px 8px', fontSize: 12, cursor: 'pointer',
                borderRadius: 6,
                background: !oculta ? '#EEF2FA' : 'transparent',
              }}>
                <input
                  type="checkbox"
                  checked={!oculta}
                  onChange={() => toggle(col.key)}
                  style={{ accentColor: '#1E3A5F' }}
                />
                <span style={{ color: '#0F172A' }}>{col.label}</span>
              </label>
            );
          })}
          <div style={{
            display: 'flex', gap: 8, marginTop: 6, paddingTop: 6,
            borderTop: '1px solid #E2E2E7',
          }}>
            <button
              type="button"
              onClick={() => setColumnasOcultas(new Set())}
              style={{
                flex: 1, padding: '6px 8px', fontSize: 11, fontWeight: 600,
                color: '#1E3A5F', background: 'transparent',
                border: '1px solid #E2E2E7', borderRadius: 6,
                cursor: 'pointer', fontFamily: 'inherit',
              }}
            >Mostrar todas</button>
            <button
              type="button"
              onClick={() => setColumnasOcultas(new Set(opcionables.map(c => c.key)))}
              style={{
                flex: 1, padding: '6px 8px', fontSize: 11, fontWeight: 600,
                color: '#64748B', background: 'transparent',
                border: '1px solid #E2E2E7', borderRadius: 6,
                cursor: 'pointer', fontFamily: 'inherit',
              }}
            >Ocultar todas</button>
          </div>
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────── PDF Export ──

function generarHTMLImprimible(
  ordenes:    OrdenTrabajo[],
  columnas:   Columna[],
  camposCustom: CampoDefinicion[],
  proyectoNombre: string,
): string {
  const fecha = new Date().toLocaleString('es-PY', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  // KPIs calculados sobre las OTs ya filtradas (lo que efectivamente se imprime).
  const total       = ordenes.length;
  const pendientes  = ordenes.filter(o => o.estado === 'Pendiente').length;
  const enProceso   = ordenes.filter(o => o.estado === 'En proceso').length;
  const cerradas    = ordenes.filter(o => o.estado === 'Cerrada').length;
  const costoTotal  = new Intl.NumberFormat('es-PY').format(
    ordenes.reduce((sum, o) => sum + (o.costo ?? 0), 0)
  );

  const rowsHtml = ordenes.map(o => {
    const cells = columnas.map(col => `<td>${escapeHtml(celdaATexto(col.key, o))}</td>`).join('');
    const customCells = camposCustom.map(c => {
      const v = o.campos?.[c.id];
      const txt = v == null || v === '' ? '—' : Array.isArray(v) ? v.join(', ') : String(v);
      return `<td>${escapeHtml(txt)}</td>`;
    }).join('');
    return `<tr>${cells}${customCells}</tr>`;
  }).join('');
  const headHtml = [
    ...columnas.map(c => `<th>${escapeHtml(c.label)}</th>`),
    ...camposCustom.map(c => `<th>${escapeHtml(c.nombre)}</th>`),
  ].join('');
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>OTs — ${escapeHtml(proyectoNombre)}</title>
<style>
  @page { size: A4 landscape; margin: 15mm; }
  * { box-sizing: border-box; }
  body {
    font-family: 'Helvetica Neue', Arial, sans-serif; color: #0F172A;
    background: #fff; margin: 0; padding: 20px;
  }
  .header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 14px 20px; background: linear-gradient(135deg, #001E40 0%, #1E3A5F 100%);
    color: #fff; border-radius: 8px; margin-bottom: 16px;
  }
  .header .titulo { font-size: 18px; font-weight: 700; margin: 0; }
  .header .sub    { font-size: 11px; opacity: 0.85; margin-top: 4px; }
  .meta {
    display: flex; gap: 24px; font-size: 11px; color: #64748B;
    margin-bottom: 12px;
  }
  table { width: 100%; border-collapse: collapse; font-size: 9px; }
  th, td { border: 1px solid #E2E2E7; padding: 5px 7px; text-align: left; }
  th {
    background: #F4F3F8; color: #43474F; font-size: 9px; font-weight: 700;
    text-transform: uppercase; letter-spacing: 0.04em;
  }
  tbody tr:nth-child(even) { background: #F8FAFC; }
  .watermark {
    position: fixed; top: 50%; left: 50%;
    transform: translate(-50%, -50%) rotate(-30deg);
    font-size: 100px; color: rgba(15, 23, 42, 0.05);
    font-weight: 900; pointer-events: none; z-index: 1;
    letter-spacing: 0.1em;
  }
  .footer {
    margin-top: 18px; padding: 10px 14px;
    border-top: 1px solid #E2E2E7;
    font-size: 10px; color: #64748B; text-align: center;
  }
  .toolbar-no-print {
    position: fixed; top: 16px; right: 16px; z-index: 100;
    display: flex; gap: 10px;
  }
  @media print {
    .no-print { display: none !important; }
    .toolbar-no-print { display: none !important; }
    body { padding: 0; }
  }
</style>
</head>
<body>

<div class="no-print" style="
  position: fixed;
  bottom: 24px;
  right: 24px;
  display: flex;
  gap: 10px;
  z-index: 999;
">
  <button onclick="window.close()"
    style="
      background: white;
      color: #374151;
      border: 2px solid #E5E7EB;
      padding: 12px 22px;
      border-radius: 10px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    "
  >Cerrar</button>

  <button onclick="window.print()"
    style="
      background: linear-gradient(135deg, #2462C9, #1E3A5F);
      color: white;
      border: none;
      padding: 12px 28px;
      border-radius: 10px;
      font-size: 14px;
      font-weight: 700;
      cursor: pointer;
      box-shadow: 0 4px 16px rgba(36,98,201,0.4);
      display: flex;
      align-items: center;
      gap: 8px;
    "
  >🖨️ Imprimir / Guardar PDF</button>
</div>

<div class="watermark">CONFIDENCIAL</div>
<div class="header">
  <div>
    <div class="titulo">Órdenes de Trabajo — ${escapeHtml(proyectoNombre)}</div>
    <div class="sub">BBC Facility Services · ${escapeHtml(fecha)}</div>
  </div>
  <div>${LOGO_G3D_SVG}</div>
</div>

<!-- KPIs -->
<div style="display:grid; grid-template-columns:repeat(5,1fr); gap:12px; margin:20px 0 24px;">

  <div style="background:#F0F4FF; border:1px solid #BFDBFE; border-radius:10px; padding:16px; text-align:center;">
    <div style="font-size:28px; font-weight:900; color:#1E3A5F;">${total}</div>
    <div style="font-size:11px; color:#6B7280; font-weight:600; text-transform:uppercase; margin-top:4px;">Total OTs</div>
    <div style="height:3px; background:#1E3A5F; border-radius:2px; margin-top:8px;"></div>
  </div>

  <div style="background:#FEF2F2; border:1px solid #FECACA; border-radius:10px; padding:16px; text-align:center;">
    <div style="font-size:28px; font-weight:900; color:#DC2626;">${pendientes}</div>
    <div style="font-size:11px; color:#6B7280; font-weight:600; text-transform:uppercase; margin-top:4px;">Pendientes</div>
    <div style="height:3px; background:#DC2626; border-radius:2px; margin-top:8px;"></div>
  </div>

  <div style="background:#EFF6FF; border:1px solid #BFDBFE; border-radius:10px; padding:16px; text-align:center;">
    <div style="font-size:28px; font-weight:900; color:#2563EB;">${enProceso}</div>
    <div style="font-size:11px; color:#6B7280; font-weight:600; text-transform:uppercase; margin-top:4px;">En Proceso</div>
    <div style="height:3px; background:#2563EB; border-radius:2px; margin-top:8px;"></div>
  </div>

  <div style="background:#F0FDF4; border:1px solid #BBF7D0; border-radius:10px; padding:16px; text-align:center;">
    <div style="font-size:28px; font-weight:900; color:#16A34A;">${cerradas}</div>
    <div style="font-size:11px; color:#6B7280; font-weight:600; text-transform:uppercase; margin-top:4px;">Cerradas</div>
    <div style="height:3px; background:#16A34A; border-radius:2px; margin-top:8px;"></div>
  </div>

  <div style="background:#FFFBEB; border:1px solid #FCD34D; border-radius:10px; padding:16px; text-align:center;">
    <div style="font-size:28px; font-weight:900; color:#D97706;">${costoTotal}</div>
    <div style="font-size:11px; color:#6B7280; font-weight:600; text-transform:uppercase; margin-top:4px;">Costo Total Gs.</div>
    <div style="height:3px; background:#D97706; border-radius:2px; margin-top:8px;"></div>
  </div>

</div>

<div class="meta">
  <span><strong>${ordenes.length}</strong> órdenes</span>
  <span><strong>${columnas.length + camposCustom.length}</strong> columnas</span>
</div>
<table>
  <thead><tr>${headHtml}</tr></thead>
  <tbody>${rowsHtml}</tbody>
</table>
<div class="footer">
  © Guaraní 3D del Grupo Díaz Villaverde — Propiedad Intelectual. Documento confidencial.
</div>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c] ?? c));
}

// ─────────────────────────────────────────────── Componente ──

export const VistaGrilla: React.FC<Props> = ({ proyectoId, proyectoNombre, onSwitchToPlano }) => {
  const { ordenes, cargarOrdenes } = useOrdenesStore();

  const [busqueda, setBusqueda]               = useState('');
  const [filtroEstados, setFiltroEstados]     = useState<Set<string>>(new Set());
  const [filtroPrioridades, setFiltroPrioridades] = useState<Set<string>>(new Set());
  const [filtroRubros, setFiltroRubros]       = useState<Set<string>>(new Set());
  const [filtroRiesgos, setFiltroRiesgos]     = useState<Set<string>>(new Set());

  const [agruparPor, setAgruparPor]           = useState<string | null>(null);
  const [gruposColapsados, setGruposColapsados] = useState<Set<string>>(new Set());
  const [dropdownAbierto, setDropdownAbierto] = useState<string | null>(null);

  const [sortKey, setSortKey]                 = useState<string>('ot');
  const [sortAsc, setSortAsc]                 = useState(true);
  const [modalOrden, setModalOrden]           = useState<OrdenTrabajo | null>(null);
  const [accionesMenuId, setAccionesMenuId]   = useState<string | null>(null);
  const [vistaActiva, setVistaActiva]         = useState<'tabla' | 'tarjetas'>('tabla');

  // ── Personalización de campos en KanbanCard (persistido en localStorage) ──
  const [camposTarjeta, setCamposTarjeta] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem(LS_CAMPOS_TARJETA_KEY);
      if (saved) return new Set(JSON.parse(saved));
    } catch { /* fallthrough */ }
    return new Set(CAMPOS_TARJETA.filter(c => c.default).map(c => c.key));
  });
  const [mostrarPersonalizar, setMostrarPersonalizar] = useState(false);
  const personalizarRef = useRef<HTMLDivElement>(null);

  const toggleCampoTarjeta = (key: string) => {
    setCamposTarjeta(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      try { localStorage.setItem(LS_CAMPOS_TARJETA_KEY, JSON.stringify([...next])); }
      catch (e) { console.error('[VistaGrilla] localStorage camposTarjeta:', e); }
      return next;
    });
  };

  useEffect(() => {
    if (!mostrarPersonalizar) return;
    const fn = (e: MouseEvent) => {
      if (personalizarRef.current && !personalizarRef.current.contains(e.target as Node)) {
        setMostrarPersonalizar(false);
      }
    };
    document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, [mostrarPersonalizar]);
  const accionesMenuRef                       = useRef<HTMLDivElement>(null);

  // ── Columnas custom: campos personalizados del proyecto ─────────
  const [camposDefinicion, setCamposDefinicion] = useState<CampoDefinicion[]>([]);
  const [columnasCustomVisibles, setColumnasCustomVisibles] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(LS_COLS_KEY) ?? '[]'); }
    catch { return []; }
  });
  const [popoverColsOpen, setPopoverColsOpen] = useState(false);
  const popoverColsRef = useRef<HTMLTableCellElement>(null);

  // ── Ocultar columnas estándar (persistido en localStorage) ──────
  const [columnasOcultas, setColumnasOcultas] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem(LS_COLS_OCULTAS_KEY) ?? '[]')); }
    catch { return new Set(); }
  });
  useEffect(() => {
    try { localStorage.setItem(LS_COLS_OCULTAS_KEY, JSON.stringify([...columnasOcultas])); }
    catch (e) { console.error('[VistaGrilla] localStorage cols ocultas:', e); }
  }, [columnasOcultas]);

  useEffect(() => {
    cargarOrdenes(proyectoId);
    getCamposDeProyecto(proyectoId).then(setCamposDefinicion).catch(err =>
      console.error('[VistaGrilla] campos:', err),
    );
  }, [proyectoId, cargarOrdenes]);

  useEffect(() => {
    try { localStorage.setItem(LS_COLS_KEY, JSON.stringify(columnasCustomVisibles)); }
    catch (e) { console.error('[VistaGrilla] localStorage cols:', e); }
  }, [columnasCustomVisibles]);

  useEffect(() => {
    if (!accionesMenuId && !popoverColsOpen) return;
    const fn = (e: MouseEvent) => {
      if (accionesMenuId && accionesMenuRef.current && !accionesMenuRef.current.contains(e.target as Node)) {
        setAccionesMenuId(null);
      }
      if (popoverColsOpen && popoverColsRef.current && !popoverColsRef.current.contains(e.target as Node)) {
        setPopoverColsOpen(false);
      }
    };
    document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, [accionesMenuId, popoverColsOpen]);

  const proyecto_ordenes = useMemo(
    () => ordenes.filter(o => o.proyecto_id === proyectoId) as unknown as OrdenTrabajo[],
    [ordenes, proyectoId],
  );

  const rubrosUnicos = useMemo(
    () => [...new Set(proyecto_ordenes.map(o => o.rubro).filter(Boolean))].sort(),
    [proyecto_ordenes],
  );

  // ── Filtrado (multi-select via Sets, mismo pipeline filter→search→sort) ──
  const filtradas = useMemo(() => {
    let lista = [...proyecto_ordenes];
    if (filtroEstados.size > 0)      lista = lista.filter(o => filtroEstados.has(o.estado));
    if (filtroPrioridades.size > 0)  lista = lista.filter(o => filtroPrioridades.has(o.prioridad));
    if (filtroRubros.size > 0)       lista = lista.filter(o => !!o.rubro && filtroRubros.has(o.rubro));
    if (filtroRiesgos.size > 0)      lista = lista.filter(o => !!o.nivel_riesgo && filtroRiesgos.has(o.nivel_riesgo));
    if (busqueda) {
      const q = busqueda.toLowerCase();
      lista = lista.filter(o =>
        o.ot.toLowerCase().includes(q) ||
        (o.descripcion  ?? '').toLowerCase().includes(q) ||
        (o.comentarios  ?? '').toLowerCase().includes(q) ||
        (o.responsable  ?? '').toLowerCase().includes(q) ||
        (o.ubicacion    ?? '').toLowerCase().includes(q) ||
        (o.rubro        ?? '').toLowerCase().includes(q) ||
        (o.obra         ?? '').toLowerCase().includes(q)
      );
    }
    lista.sort((a, b) => {
      const va = (a as unknown as Record<string, unknown>)[sortKey];
      const vb = (b as unknown as Record<string, unknown>)[sortKey];
      if (typeof va === 'number' && typeof vb === 'number') {
        return sortAsc ? va - vb : vb - va;
      }
      const sa = String(va ?? '');
      const sb = String(vb ?? '');
      return sortAsc ? sa.localeCompare(sb) : sb.localeCompare(sa);
    });
    return lista;
  }, [proyecto_ordenes, filtroEstados, filtroPrioridades, filtroRubros, filtroRiesgos, busqueda, sortKey, sortAsc]);

  // Sin paginación: mostramos todas las filas filtradas. El scroll vertical
  // del tableScrollStyle (overflow-y: auto) hace de virtualización implícita.
  const paginadas = filtradas;

  // ── Agrupar (preserva el orden actual de `filtradas`) ──
  const grupos = useMemo(() => {
    if (!agruparPor) return null;
    const map = new Map<string, OrdenTrabajo[]>();
    for (const o of filtradas) {
      const raw = (o as unknown as Record<string, unknown>)[agruparPor];
      const key = (raw == null || raw === '') ? '— Sin valor —' : String(raw);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(o);
    }
    return Array.from(map.entries());
  }, [filtradas, agruparPor]);

  const toggleGrupo = (key: string) =>
    setGruposColapsados(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });

  const toggleSort = (key: string) => {
    if (sortKey === key) setSortAsc(a => !a);
    else { setSortKey(key); setSortAsc(true); }
  };
  const sortIcon = (key: string) => sortKey === key ? (sortAsc ? '↑' : '↓') : '';

  const toggleSet = (setter: React.Dispatch<React.SetStateAction<Set<string>>>) =>
    (valor: string) => {
      setter(prev => {
        const next = new Set(prev);
        if (next.has(valor)) next.delete(valor); else next.add(valor);
        return next;
      });
    };
  const limpiarTodos = () => {
    setFiltroEstados(new Set());
    setFiltroPrioridades(new Set());
    setFiltroRubros(new Set());
    setFiltroRiesgos(new Set());
    setBusqueda('');
  };

  const filtrosActivos =
    filtroEstados.size + filtroPrioridades.size + filtroRubros.size + filtroRiesgos.size + (busqueda ? 1 : 0);

  const toggleCustomCol = (id: string) => {
    setColumnasCustomVisibles(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const camposCustomActivos = camposDefinicion.filter(c => columnasCustomVisibles.includes(c.id));
  const camposCustomDisponibles = camposDefinicion.filter(c => !columnasCustomVisibles.includes(c.id));

  // Columnas estándar realmente visibles: las fijas (OT) siempre se muestran;
  // el resto se filtra por columnasOcultas. Se usa para render del header,
  // del body, del PDF y del CSV.
  const visibleColumnas = useMemo(
    () => COLUMNAS.filter(c => c.fija || !columnasOcultas.has(c.key)),
    [columnasOcultas],
  );
  const totalColumnas = visibleColumnas.length + camposCustomActivos.length;

  // Conteos por columna (para el badge en el header).
  const conteos = useMemo(() => {
    return {
      estado:       new Set(proyecto_ordenes.map(o => o.estado)).size,
      prioridad:    new Set(proyecto_ordenes.map(o => o.prioridad)).size,
      rubro:        new Set(proyecto_ordenes.map(o => o.rubro).filter(Boolean)).size,
      nivel_riesgo: new Set(proyecto_ordenes.map(o => o.nivel_riesgo).filter(Boolean)).size,
      obra:         new Set(proyecto_ordenes.map(o => o.obra).filter(Boolean)).size,
      responsable:  new Set(proyecto_ordenes.map(o => o.responsable).filter(Boolean)).size,
    } as Record<string, number>;
  }, [proyecto_ordenes]);

  // ── Acciones de exportación ────────────────────────────────────
  // CSV local con Papa.unparse — respeta `columnasOcultas` (las ocultas no
  // aparecen) y los campos personalizados activos. Sin URLs de fotos: para
  // export con fotos completas usar el botón "↑ CSV" de la vista Plano.
  const handleExportarCSV = useCallback(() => {
    const fields: string[] = [
      ...visibleColumnas.map(c => c.label),
      ...camposCustomActivos.map(c => c.nombre),
    ];
    const data = filtradas.map(o => [
      ...visibleColumnas.map(c => celdaATexto(c.key, o)),
      ...camposCustomActivos.map(c => {
        const v = o.campos?.[c.id];
        if (v == null || v === '') return '';
        if (Array.isArray(v)) return v.join(', ');
        return String(v);
      }),
    ]);
    const csv = Papa.unparse({ fields, data }, { quotes: false, delimiter: ',' });
    const bom = '﻿';
    const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const fecha = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `${proyectoNombre}_${fecha}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [filtradas, visibleColumnas, camposCustomActivos, proyectoNombre]);

  const handleExportarPDF = useCallback(() => {
    const html = generarHTMLImprimible(filtradas, visibleColumnas, camposCustomActivos, proyectoNombre);
    const w = window.open('', '_blank');
    if (!w) { console.error('[VistaGrilla] popup bloqueado'); return; }
    w.document.open();
    w.document.write(html);
    w.document.close();
  }, [filtradas, visibleColumnas, camposCustomActivos, proyectoNombre]);

  const onRowClick = (o: OrdenTrabajo) => setModalOrden(o);
  // Nota: onSwitchToPlano queda disponible vía props pero no se usa internamente;
  // el sidebar global maneja la navegación entre vistas.
  void onSwitchToPlano;

  // ── Estilos compartidos ─────────────────────────────────────────
  // El layout es una cadena de flex columns que se constriñen entre sí:
  //   workspace (flex:1, hidden) → mainPanel (flex:1, hidden) → card (flex:1, hidden)
  //     → toolbar (flex-shrink:0) → tableWrap (flex:1, overflow auto) → paginación (flex-shrink:0)
  // El `minHeight: 0` en cada nivel intermedio es CRÍTICO; sin él, los hijos
  // flex no respetan el contenedor y el scroll vertical sale del wrap interno.
  const workspaceStyle: CSSProperties = {
    background: '#F9F9FE',
    flex: 1,
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  };
  const mainPanelStyle: CSSProperties = {
    flex: 1,
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  };
  const cardStyle: CSSProperties = {
    background: '#fff',
    border: '1px solid #E2E2E7',
    borderRadius: 12,
    boxShadow: '0 2px 8px rgba(0,51,102,0.08)',
    margin: '0 16px 12px',
    overflow: 'hidden',
    flex: 1,
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
  };
  const toolbarStyle: CSSProperties = {
    display: 'flex', flexWrap: 'nowrap', alignItems: 'center', gap: 5,
    padding: '6px 16px', height: 40,
    borderBottom: '1px solid #E2E2E7', background: '#fff',
    flexShrink: 0,
  };
  const tableScrollStyle: CSSProperties = {
    flex: 1,
    minHeight: 0,
    overflowX: 'auto',
    overflowY: 'auto',
    background: '#fff',
  };
  const paginacionStyle: CSSProperties = {
    display: 'flex', alignItems: 'center', justifyContent: 'flex-start',
    padding: '6px 24px', background: '#F4F3F8',
    borderTop: '1px solid #E2E2E7',
    flexShrink: 0,
  };
  const buscadorStyle: CSSProperties = {
    width: 160, height: 28, padding: '0 8px', fontSize: 11,
    border: '1px solid #E2E2E7', borderRadius: 6, background: '#fff',
    color: '#0F172A', fontFamily: 'inherit',
    flexShrink: 0,
  };
  const btnExportStyle = (color: string): CSSProperties => ({
    display: 'inline-flex', alignItems: 'center', gap: 4,
    padding: '3px 10px', height: 26, fontSize: 11, fontWeight: 600,
    background: color, color: '#fff', border: 'none',
    borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit',
    flexShrink: 0,
  });

  // Renderiza una fila de OT (compartido entre flat y agrupado).
  const renderFila = (o: OrdenTrabajo, idx: number) => (
    <tr
      key={o.id}
      onClick={() => onRowClick(o)}
      style={{
        background: idx % 2 === 1 ? '#F1F4F9' : '#fff',
        cursor: 'pointer',
        height: 40,
        fontSize: 12,
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLTableRowElement).style.background = '#EEF2FA'; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLTableRowElement).style.background = idx % 2 === 1 ? '#F1F4F9' : '#fff'; }}
    >
      {visibleColumnas.map(col => (
        <td
          key={col.key}
          style={{
            minWidth: col.minWidth,
            padding: '6px 12px',
            fontSize: 12,
            borderBottom: '1px solid #E2E2E7',
            borderRight: '1px solid #E2E2E7',
            verticalAlign: 'middle',
            ...(col.fija ? { position: 'sticky', left: 0, background: 'inherit', zIndex: 1 } : {}),
          }}
          className={col.fija ? styles.tdFija : undefined}
        >
          {renderizarCelda(col.key, o)}
        </td>
      ))}
      {camposCustomActivos.map(c => (
        <td key={c.id} style={{
          minWidth: 140, padding: '6px 12px', fontSize: 12,
          borderBottom: '1px solid #E2E2E7', borderRight: '1px solid #E2E2E7',
        }}>
          {renderizarCampoCustom(c, o)}
        </td>
      ))}
      <td style={{ minWidth: 40, padding: '6px 6px', borderBottom: '1px solid #E2E2E7' }} />
      <td
        onClick={e => e.stopPropagation()}
        style={{ minWidth: 60, padding: '6px 12px', borderBottom: '1px solid #E2E2E7', textAlign: 'right' }}
      >
        <div className={styles.accionesWrap}
          ref={accionesMenuId === o.id ? accionesMenuRef : undefined}>
          <button
            type="button"
            className={styles.btnAcciones}
            onClick={() => setAccionesMenuId(prev => prev === o.id ? null : o.id)}
            title="Acciones"
          >···</button>
          {accionesMenuId === o.id && (
            <div className={styles.accionesMenu}>
              <button type="button" onClick={() => { setAccionesMenuId(null); setModalOrden(o); }}>
                👁 Ver detalle
              </button>
              <button type="button" onClick={() => { setAccionesMenuId(null); setModalOrden(o); }}>
                ✎ Editar
              </button>
              <button type="button" onClick={() => { setAccionesMenuId(null); console.log('informe', o.id); }}>
                📄 Generar informe
              </button>
              <button type="button" className={styles.accionDanger}
                onClick={() => { setAccionesMenuId(null); console.log('eliminar', o.id); }}>
                🗑 Eliminar
              </button>
            </div>
          )}
        </div>
      </td>
    </tr>
  );

  // Fila de grupo (cuando agruparPor está activo).
  const renderFilaGrupo = (groupValue: string, count: number, colSpan: number) => {
    const colapsado = gruposColapsados.has(groupValue);
    const label = AGRUPABLES.find(a => a.key === agruparPor)?.label ?? agruparPor;
    return (
      <tr key={`__group__${groupValue}`} onClick={() => toggleGrupo(groupValue)}
        style={{ cursor: 'pointer', background: '#E8E8ED' }}>
        <td colSpan={colSpan} style={{
          padding: '10px 14px', fontSize: 12, fontWeight: 700, color: '#1E3A5F',
          borderBottom: '1px solid #D5D5DC', borderTop: '1px solid #D5D5DC',
        }}>
          <span style={{ display: 'inline-block', width: 16 }}>{colapsado ? '▶' : '▼'}</span>
          {label}: <span style={{ color: '#001E40' }}>{groupValue}</span>
          <span style={{ marginLeft: 8, color: '#64748B', fontWeight: 600 }}>({count} OT{count !== 1 ? 's' : ''})</span>
        </td>
      </tr>
    );
  };

  return (
    <div className={styles.workspace} style={workspaceStyle}>
      <main className={styles.mainPanel} style={mainPanelStyle}>

        {/* ─── Card tabla ─── */}
        <div style={cardStyle}>

          {/* TOOLBAR — header unificado: título compacto + filtros + acciones */}
          <div style={toolbarStyle}>
            {/* Buscador (icono removido para respetar padding 0 8 sin solapar texto) */}
            <input
              type="text"
              placeholder="Buscar OT, descripción..."
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
              style={buscadorStyle}
            />

            {/* Filter pills */}
            <FiltroPill
              label="Estado"
              opciones={ESTADOS as unknown as string[]}
              seleccion={filtroEstados}
              onToggle={toggleSet(setFiltroEstados)}
              onClear={() => setFiltroEstados(new Set())}
              abierto={dropdownAbierto === 'estado'}
              onToggleAbierto={() => setDropdownAbierto(d => d === 'estado' ? null : 'estado')}
            />
            <FiltroPill
              label="Prioridad"
              opciones={PRIORIDADES as unknown as string[]}
              seleccion={filtroPrioridades}
              onToggle={toggleSet(setFiltroPrioridades)}
              onClear={() => setFiltroPrioridades(new Set())}
              abierto={dropdownAbierto === 'prioridad'}
              onToggleAbierto={() => setDropdownAbierto(d => d === 'prioridad' ? null : 'prioridad')}
            />
            <FiltroPill
              label="Rubro"
              opciones={rubrosUnicos}
              seleccion={filtroRubros}
              onToggle={toggleSet(setFiltroRubros)}
              onClear={() => setFiltroRubros(new Set())}
              abierto={dropdownAbierto === 'rubro'}
              onToggleAbierto={() => setDropdownAbierto(d => d === 'rubro' ? null : 'rubro')}
            />
            <FiltroPill
              label="Riesgo"
              opciones={RIESGOS as unknown as string[]}
              seleccion={filtroRiesgos}
              onToggle={toggleSet(setFiltroRiesgos)}
              onClear={() => setFiltroRiesgos(new Set())}
              abierto={dropdownAbierto === 'riesgo'}
              onToggleAbierto={() => setDropdownAbierto(d => d === 'riesgo' ? null : 'riesgo')}
            />

            <GroupByPill
              agruparPor={agruparPor}
              onSet={setAgruparPor}
              abierto={dropdownAbierto === 'agruparPor'}
              onToggleAbierto={() => setDropdownAbierto(d => d === 'agruparPor' ? null : 'agruparPor')}
            />

            <OcultarColumnasPill
              columnasOcultas={columnasOcultas}
              setColumnasOcultas={setColumnasOcultas}
              abierto={dropdownAbierto === 'ocultar'}
              onToggleAbierto={() => setDropdownAbierto(d => d === 'ocultar' ? null : 'ocultar')}
            />

            {/* Personalizar tarjetas — sólo en vista Kanban */}
            {vistaActiva === 'tarjetas' && (
              <div ref={personalizarRef} style={{ position: 'relative', flexShrink: 0 }}>
                <button
                  type="button"
                  onClick={() => setMostrarPersonalizar(p => !p)}
                  style={{
                    fontSize: 11, padding: '3px 8px', height: 26,
                    border: '1px solid #E2E2E7', borderRadius: 6, background: 'white',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                    fontFamily: 'inherit', color: '#43474F', fontWeight: 600,
                    whiteSpace: 'nowrap',
                  }}
                >⚙️ Personalizar tarjetas</button>
                {mostrarPersonalizar && (
                  <div style={{
                    position: 'absolute', top: 44, right: 0, width: 280,
                    background: 'white', border: '1px solid #E2E2E7', borderRadius: 10,
                    boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 100, overflow: 'hidden',
                  }}>
                    <div style={{
                      padding: '10px 14px', borderBottom: '1px solid #F3F4F6',
                      fontSize: 12, fontWeight: 700, color: '#001E40',
                    }}>Campos visibles en tarjetas</div>
                    <div style={{ maxHeight: 320, overflowY: 'auto', padding: '6px 0' }}>
                      {CAMPOS_TARJETA.map(campo => {
                        const activo = camposTarjeta.has(campo.key);
                        return (
                          <div
                            key={campo.key}
                            onClick={() => toggleCampoTarjeta(campo.key)}
                            style={{
                              display: 'flex', alignItems: 'center',
                              justifyContent: 'space-between',
                              padding: '7px 14px', cursor: 'pointer',
                              background: activo ? '#F0F4FF' : 'white',
                              transition: 'background 0.1s',
                            }}
                          >
                            <span style={{ fontSize: 12, color: '#1a1c1f' }}>{campo.label}</span>
                            <div style={{
                              width: 32, height: 18, borderRadius: 9,
                              background: activo ? '#2563EB' : '#D1D5DB',
                              position: 'relative', transition: 'background 0.2s',
                              flexShrink: 0,
                            }}>
                              <div style={{
                                position: 'absolute', top: 2,
                                left: activo ? 16 : 2,
                                width: 14, height: 14, borderRadius: '50%',
                                background: 'white', transition: 'left 0.2s',
                              }}/>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div style={{
                      padding: '8px 14px', borderTop: '1px solid #F3F4F6',
                      display: 'flex', gap: 8,
                    }}>
                      <button
                        type="button"
                        onClick={() => {
                          const all = new Set(CAMPOS_TARJETA.map(c => c.key));
                          setCamposTarjeta(all);
                          try { localStorage.setItem(LS_CAMPOS_TARJETA_KEY, JSON.stringify([...all])); }
                          catch (e) { console.error('[VistaGrilla] localStorage camposTarjeta:', e); }
                        }}
                        style={{
                          flex: 1, padding: 5, fontSize: 11, fontFamily: 'inherit',
                          border: '1px solid #E2E2E7', borderRadius: 6,
                          cursor: 'pointer', background: 'white', color: '#1E3A5F',
                          fontWeight: 600,
                        }}
                      >Mostrar todo</button>
                      <button
                        type="button"
                        onClick={() => {
                          setCamposTarjeta(new Set());
                          try { localStorage.setItem(LS_CAMPOS_TARJETA_KEY, '[]'); }
                          catch (e) { console.error('[VistaGrilla] localStorage camposTarjeta:', e); }
                        }}
                        style={{
                          flex: 1, padding: 5, fontSize: 11, fontFamily: 'inherit',
                          border: '1px solid #E2E2E7', borderRadius: 6,
                          cursor: 'pointer', background: 'white', color: '#64748B',
                          fontWeight: 600,
                        }}
                      >Ocultar todos</button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {filtrosActivos > 0 && (
              <button
                type="button"
                onClick={limpiarTodos}
                style={{
                  padding: '3px 8px', height: 26, fontSize: 11, fontWeight: 600,
                  background: 'transparent', color: '#64748B',
                  border: '1px solid #E2E2E7', borderRadius: 6,
                  cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0,
                }}
              >Limpiar todos</button>
            )}

            <div style={{ flex: 1 }} />

            {/* Conteo + botones de export */}
            <span style={{ fontSize: 10, color: '#64748B', whiteSpace: 'nowrap', flexShrink: 0 }}>
              <strong style={{ color: '#0F172A' }}>{filtradas.length}</strong> de <strong style={{ color: '#0F172A' }}>{proyecto_ordenes.length}</strong> · {totalColumnas}col
            </span>
            <button
              type="button"
              onClick={handleExportarCSV}
              style={btnExportStyle('#1E3A5F')}
              disabled={filtradas.length === 0}
              title="Exportar a CSV"
            >↑ CSV</button>
            <button
              type="button"
              onClick={handleExportarPDF}
              style={btnExportStyle('#15803D')}
              disabled={filtradas.length === 0}
              title="Exportar a PDF imprimible"
            >📄 PDF</button>

            {/* Separador visual entre acciones de export y view toggle */}
            <div style={{ width: 1, height: 18, background: '#E2E2E7', flexShrink: 0 }} />

            {/* View toggle Tabla/Tarjetas — siempre visible, estilos inline */}
            <button
              type="button"
              onClick={() => setVistaActiva('tabla')}
              style={{
                fontSize: 11, padding: '3px 10px', height: 26, borderRadius: 6,
                background:  vistaActiva === 'tabla' ? '#1E3A5F' : 'white',
                color:       vistaActiva === 'tabla' ? 'white'   : '#6B7280',
                border:      vistaActiva === 'tabla' ? 'none'    : '1px solid #E2E2E7',
                cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600,
                whiteSpace: 'nowrap', flexShrink: 0,
              }}
            >□ Tabla</button>
            <button
              type="button"
              onClick={() => setVistaActiva('tarjetas')}
              style={{
                fontSize: 11, padding: '3px 10px', height: 26, borderRadius: 6,
                background:  vistaActiva === 'tarjetas' ? '#1E3A5F' : 'white',
                color:       vistaActiva === 'tarjetas' ? 'white'   : '#6B7280',
                border:      vistaActiva === 'tarjetas' ? 'none'    : '1px solid #E2E2E7',
                cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600,
                whiteSpace: 'nowrap', flexShrink: 0,
              }}
            >🃏 Tarjetas</button>
          </div>

          {/* TABLA — scroll horizontal + vertical independientes */}
          {vistaActiva === 'tabla' && (
          <div className={styles.tableWrap} style={tableScrollStyle}>
            <table className={styles.table} style={{
              borderCollapse: 'separate',
              borderSpacing: 0,
              width: 'max-content',
              minWidth: '100%',
            }}>
              <thead style={{ position: 'sticky', top: 0, zIndex: 2 }}>
                <tr>
                  {visibleColumnas.map(col => {
                    const conteo = conteos[col.key];
                    return (
                      <th
                        key={col.key}
                        style={{
                          minWidth: col.minWidth,
                          padding: '8px 12px',
                          height: 36,
                          background: '#F4F3F8',
                          color: '#43474F',
                          fontSize: 10,
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          letterSpacing: '0.05em',
                          textAlign: 'left',
                          borderBottom: '1px solid #E2E2E7',
                          borderRight: '1px solid #E2E2E7',
                          cursor: 'pointer',
                          whiteSpace: 'nowrap',
                          // z-index 3 cuando es header sticky Y columna sticky:
                          // queda por encima del thead (z:2) y por encima de
                          // las celdas sticky de body (z:1).
                          ...(col.fija ? { position: 'sticky', left: 0, zIndex: 3 } : {}),
                        }}
                        className={col.fija ? styles.thFija : undefined}
                        onClick={() => toggleSort(col.key)}
                        title={`Ordenar por ${col.label}`}
                      >
                        {col.label}
                        {conteo > 1 && (
                          <span style={{
                            marginLeft: 6, padding: '1px 5px', borderRadius: 8,
                            background: '#E2E2E7', color: '#64748B', fontSize: 10,
                          }}>{conteo}</span>
                        )}
                        {sortIcon(col.key) && <span style={{ marginLeft: 4, color: '#1E3A5F' }}>{sortIcon(col.key)}</span>}
                      </th>
                    );
                  })}
                  {camposCustomActivos.map(c => (
                    <th key={c.id} style={{
                      minWidth: 140, padding: '8px 12px', height: 36, background: '#F4F3F8',
                      color: '#43474F', fontSize: 10, fontWeight: 700,
                      textTransform: 'uppercase', letterSpacing: '0.05em',
                      borderBottom: '1px solid #E2E2E7', borderRight: '1px solid #E2E2E7',
                    }} className={styles.thCustom}>
                      {c.nombre}
                      <button
                        type="button"
                        className={styles.thCustomRemove}
                        onClick={(e) => { e.stopPropagation(); toggleCustomCol(c.id); }}
                        title="Quitar columna"
                      >×</button>
                    </th>
                  ))}
                  <th className={styles.thAddCol} ref={popoverColsRef} style={{ background: '#F4F3F8' }}>
                    <button
                      type="button"
                      className={styles.btnAddCol}
                      onClick={(e) => { e.stopPropagation(); setPopoverColsOpen(o => !o); }}
                      title="Agregar columna personalizada"
                    >+</button>
                    {popoverColsOpen && (
                      <div className={styles.popoverCols}>
                        <div className={styles.popoverTitle}>Campos personalizados</div>
                        {camposDefinicion.length === 0 ? (
                          <div className={styles.popoverHint}>
                            Sin campos personalizados. Creá uno desde el panel de una OT → tab Campos.
                          </div>
                        ) : (
                          <div className={styles.popoverList}>
                            {camposDefinicion.map(c => {
                              const visible = columnasCustomVisibles.includes(c.id);
                              return (
                                <label key={c.id} className={styles.popoverItem}>
                                  <input
                                    type="checkbox"
                                    checked={visible}
                                    onChange={() => toggleCustomCol(c.id)}
                                  />
                                  <span>{c.nombre}</span>
                                  <span className={styles.popoverTipo}>{c.tipo}</span>
                                </label>
                              );
                            })}
                          </div>
                        )}
                        {camposCustomDisponibles.length === 0 && camposDefinicion.length > 0 && (
                          <div className={styles.popoverHint}>Todos los campos ya están visibles.</div>
                        )}
                      </div>
                    )}
                  </th>
                  <th className={styles.thAcciones} style={{ background: '#F4F3F8' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {paginadas.length === 0 ? (
                  <tr>
                    <td colSpan={totalColumnas + 2} style={{
                      padding: 40, textAlign: 'center', color: '#94A3B8', fontSize: 13,
                    }}>
                      {filtradas.length === 0 && proyecto_ordenes.length > 0
                        ? 'No hay OTs que coincidan con los filtros.'
                        : 'No hay órdenes de trabajo en este proyecto.'}
                    </td>
                  </tr>
                ) : agruparPor && grupos ? (
                  grupos.map(([groupValue, items]) => (
                    <Fragment key={groupValue}>
                      {renderFilaGrupo(groupValue, items.length, totalColumnas + 2)}
                      {!gruposColapsados.has(groupValue) && items.map((o, idx) => renderFila(o, idx))}
                    </Fragment>
                  ))
                ) : (
                  paginadas.map((o, idx) => renderFila(o, idx))
                )}
              </tbody>
            </table>
          </div>
          )}

          {/* KANBAN — grid 4 columnas iguales, scroll vertical único */}
          {vistaActiva === 'tarjetas' && (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: 10,
              padding: '10px 16px',
              flex: 1,
              minHeight: 0,
              overflowY: 'auto',
              overflowX: 'hidden',
              background: '#F4F3F8',
            }}>
              {KANBAN_COLUMNAS.map(col => {
                const items = filtradas.filter(o => o.estado === col.estado);
                return (
                  <div key={col.estado} style={{
                    width: '100%', minWidth: 0,
                    display: 'flex', flexDirection: 'column',
                    background: 'rgba(255,255,255,0.6)',
                    borderRadius: 12,
                    overflow: 'hidden',
                  }}>
                    {/* Header de columna */}
                    <div style={{
                      padding: '8px 10px', display: 'flex',
                      alignItems: 'center', gap: 6, flexShrink: 0,
                      fontSize: 10,
                    }}>
                      <span style={{
                        background: col.color,
                        color: 'white',
                        padding: '2px 8px',
                        borderRadius: 20,
                        fontSize: 10,
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                      }}>{col.label}</span>
                      <span style={{
                        background: '#E2E2E7',
                        color: '#43474F',
                        padding: '1px 6px',
                        borderRadius: 10,
                        fontSize: 10,
                        fontWeight: 600,
                      }}>{items.length}</span>
                    </div>

                    {/* Lista de cards — sin scroll propio (el grid padre scrollea) */}
                    <div style={{
                      padding: '0 8px 8px',
                      display: 'flex', flexDirection: 'column', gap: 6,
                    }}>
                      {items.map(o => (
                        <div
                          key={o.id}
                          onClick={() => setModalOrden(o)}
                          style={{
                            background: 'white',
                            border: '1px solid #E2E2E7',
                            borderLeft: `4px solid ${colorEstado(o.estado)}`,
                            borderRadius: 8,
                            padding: '8px 10px',
                            cursor: 'pointer',
                            boxShadow: '0 1px 4px rgba(0,51,102,0.06)',
                            transition: 'box-shadow 0.15s',
                          }}
                          onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = '0 4px 12px rgba(0,51,102,0.12)'; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = '0 1px 4px rgba(0,51,102,0.06)'; }}
                        >
                          {/* Header card: código + prioridad */}
                          <div style={{
                            display: 'flex', justifyContent: 'space-between',
                            alignItems: 'flex-start', marginBottom: 6,
                          }}>
                            <span style={{ fontWeight: 700, fontSize: 12, color: '#001E40' }}>{o.ot}</span>
                            {o.prioridad && (
                              <span style={{
                                fontSize: 9, fontWeight: 700,
                                padding: '1px 5px', borderRadius: 6,
                                background: o.prioridad === 'Alta'  ? '#FEE2E2'
                                         : o.prioridad === 'Media' ? '#FEF3C7' : '#F3F4F6',
                                color:      o.prioridad === 'Alta'  ? '#DC2626'
                                         : o.prioridad === 'Media' ? '#D97706' : '#6B7280',
                              }}>{o.prioridad}</span>
                            )}
                          </div>

                          {/* Descripción truncada a 2 líneas */}
                          {camposTarjeta.has('descripcion') && o.descripcion && (
                            <p style={{
                              fontSize: 11, color: '#43474F', margin: '0 0 8px',
                              overflow: 'hidden',
                              display: '-webkit-box',
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: 'vertical',
                            }}>{o.descripcion}</p>
                          )}

                          {/* Observaciones (mismo formato que descripción) */}
                          {camposTarjeta.has('comentarios') && o.comentarios && (
                            <p style={{
                              fontSize: 11, color: '#43474F', margin: '0 0 8px',
                              fontStyle: 'italic',
                              overflow: 'hidden',
                              display: '-webkit-box',
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: 'vertical',
                            }}>{o.comentarios}</p>
                          )}

                          {/* Campos clave key-value: cada uno gateado por camposTarjeta */}
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 8 }}>
                            {camposTarjeta.has('obra') && o.obra && (
                              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                                <span style={{ color: '#9CA3AF' }}>Obra</span>
                                <span style={{ fontWeight: 500 }}>{o.obra}</span>
                              </div>
                            )}
                            {camposTarjeta.has('unidad_amenities') && o.unidad_amenities && (
                              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                                <span style={{ color: '#9CA3AF' }}>Unidad</span>
                                <span style={{ fontWeight: 500 }}>{o.unidad_amenities}</span>
                              </div>
                            )}
                            {camposTarjeta.has('rubro') && o.rubro && (
                              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                                <span style={{ color: '#9CA3AF' }}>Rubro</span>
                                <span style={{ fontWeight: 600, color: '#416181' }}>{o.rubro}</span>
                              </div>
                            )}
                            {camposTarjeta.has('rubro_secundario') && o.rubro_secundario && o.rubro_secundario.length > 0 && (
                              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                                <span style={{ color: '#9CA3AF' }}>Rubro sec.</span>
                                <span style={{ fontWeight: 500 }}>{o.rubro_secundario.join(', ')}</span>
                              </div>
                            )}
                            {camposTarjeta.has('nivel_riesgo') && o.nivel_riesgo && (
                              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                                <span style={{ color: '#9CA3AF' }}>Riesgo</span>
                                <span style={{ fontWeight: 700, color: COLOR_RIESGO[o.nivel_riesgo] ?? '#64748B' }}>{o.nivel_riesgo}</span>
                              </div>
                            )}
                            {camposTarjeta.has('responsable') && o.responsable && (
                              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                                <span style={{ color: '#9CA3AF' }}>Responsable</span>
                                <span style={{ fontWeight: 500 }}>{o.responsable}</span>
                              </div>
                            )}
                            {camposTarjeta.has('contratistas') && o.contratistas && o.contratistas.length > 0 && (
                              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                                <span style={{ color: '#9CA3AF' }}>Contratistas</span>
                                <span style={{ fontWeight: 500 }}>{o.contratistas.join(', ')}</span>
                              </div>
                            )}
                            {camposTarjeta.has('fecha_inicio_trabajos') && o.fecha_inicio_trabajos && (
                              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                                <span style={{ color: '#9CA3AF' }}>Inicio</span>
                                <span style={{ fontWeight: 500 }}>{formatFecha(o.fecha_inicio_trabajos)}</span>
                              </div>
                            )}
                            {camposTarjeta.has('fecha_fin_trabajos') && o.fecha_fin_trabajos && (
                              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                                <span style={{ color: '#9CA3AF' }}>Fin</span>
                                <span style={{ fontWeight: 500 }}>{formatFecha(o.fecha_fin_trabajos)}</span>
                              </div>
                            )}
                            {camposTarjeta.has('costo') && o.costo != null && o.costo > 0 && (
                              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                                <span style={{ color: '#9CA3AF' }}>Costo</span>
                                <span style={{ fontWeight: 600, color: '#1E293B' }}>{formatGuaranies(o.costo)}</span>
                              </div>
                            )}
                            {camposTarjeta.has('en_garantia') && (
                              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                                <span style={{ color: '#9CA3AF' }}>Garantía BBC</span>
                                <span style={{ fontWeight: 500 }}>{o.en_garantia ? 'Sí' : 'No'}</span>
                              </div>
                            )}
                            {camposTarjeta.has('asiste_facility') && (
                              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                                <span style={{ color: '#9CA3AF' }}>Asiste Facility</span>
                                <span style={{ fontWeight: 500 }}>{o.asiste_facility ? 'Sí' : 'No'}</span>
                              </div>
                            )}
                          </div>

                          {/* Footer card: barra de avance + % + fecha ingreso */}
                          {(camposTarjeta.has('porcentaje_avance') || (camposTarjeta.has('fecha_ingreso') && o.fecha_ingreso)) && (
                            <div style={{
                              borderTop: '1px solid #F3F4F6', paddingTop: 8,
                              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            }}>
                              {camposTarjeta.has('porcentaje_avance') && (
                                <>
                                  <div style={{ flex: 1, marginRight: 10 }}>
                                    <div style={{ background: '#E2E2E7', borderRadius: 4, height: 4, overflow: 'hidden' }}>
                                      <div style={{
                                        width: `${o.porcentaje_avance ?? 0}%`,
                                        background: colorEstado(o.estado),
                                        height: '100%', borderRadius: 4,
                                      }}/>
                                    </div>
                                  </div>
                                  <span style={{ fontSize: 10, color: '#9CA3AF', fontWeight: 600, flexShrink: 0 }}>
                                    {o.porcentaje_avance ?? 0}%
                                  </span>
                                </>
                              )}
                              {camposTarjeta.has('fecha_ingreso') && o.fecha_ingreso && (
                                <span style={{
                                  fontSize: 10, color: '#9CA3AF',
                                  marginLeft: camposTarjeta.has('porcentaje_avance') ? 10 : 0,
                                  flexShrink: 0,
                                  marginInlineStart: camposTarjeta.has('porcentaje_avance') ? 10 : 'auto',
                                }}>
                                  {new Date(o.fecha_ingreso).toLocaleDateString('es-PY', { day: '2-digit', month: '2-digit' })}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                      {items.length === 0 && (
                        <div style={{
                          border: '2px dashed #E2E2E7', borderRadius: 8, height: 80,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          color: '#9CA3AF', fontSize: 12,
                        }}>
                          Sin órdenes
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Footer compacto: sólo conteo. El scroll-y del tableWrap hace el rol
              de la paginación anterior (todas las filas siempre visibles). */}
          {filtradas.length > 0 && (
            <div style={paginacionStyle}>
              <span style={{ fontSize: 11, color: '#64748B' }}>
                Mostrando <strong style={{ color: '#0F172A' }}>{filtradas.length}</strong> orden{filtradas.length !== 1 ? 'es' : ''}
              </span>
            </div>
          )}
        </div>
      </main>

      {/* ═══ MODAL DETALLE ═══════════════════════════════════════ */}
      {modalOrden && (
        <ModalDetalleOT
          orden={modalOrden}
          proyectoId={proyectoId}
          onClose={() => setModalOrden(null)}
          onGuardado={() => {
            setModalOrden(null);
            cargarOrdenes(proyectoId);
          }}
        />
      )}
    </div>
  );
};
