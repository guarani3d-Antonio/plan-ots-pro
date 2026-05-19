// src/components/plano/PanelResumen.tsx
import { useMemo, useState } from 'react';
import type { OrdenLocal, EstadoOT, PrioridadOT } from '../../types/orden';
import type { AccionesProyecto } from '../../hooks/useAccionesProyecto';
import styles from './PanelResumen.module.css';
import { ESTADO_COLOR, ESTADOS_ORDEN } from '../../constants/estados';

const LABEL_ESTADO_CORTO: Record<EstadoOT, string> = {
  'Pendiente':  'Pendiente',
  'En proceso': 'En proceso',
  'Cerrada':    'Cerrada',
  'No aplica':  'N/A',
};

const PRIORIDADES: PrioridadOT[] = ['Alta', 'Media', 'Baja'];

const COLOR_PRIORIDAD: Record<PrioridadOT, string> = {
  'Alta':  '#DC2626',
  'Media': '#D97706',
  'Baja':  '#94A3B8',
};

interface ProyectoBasico {
  id: string;
  nombre: string;
  cliente?: string | null;
  plano_url: string;
  created_at?: string;
  updated_at?: string;
}

interface PanelResumenProps {
  // Datos
  ordenes: OrdenLocal[];                    // total (para stats)
  ordenesFiltradas: OrdenLocal[];           // filtradas (para la lista)
  rubrosUnicos: string[];

  // Filtros controlados desde VistaPlano (single source of truth)
  filtrosEstado:    Set<string>;
  filtrosRubro:     Set<string>;
  filtrosPrioridad: Set<string>;
  onToggleEstado:    (estado: string) => void;
  onToggleRubro:     (rubro: string)  => void;
  onTogglePrioridad: (prio: string)   => void;

  // Selección y misc
  ordenSeleccionadaId?: string;
  onSeleccionar: (orden: OrdenLocal) => void;
  proyecto: ProyectoBasico | null;
  acciones: AccionesProyecto;
  cargando: string | null;
}

export function PanelResumen({
  ordenes,
  // `ordenesFiltradas` sigue declarada en la interface (VistaPlano la pasa)
  // pero la lista interna ahora muestra OTs sin ubicar (computadas desde
  // `ordenes`), no las filtradas. Se omite del destructure para no romper
  // `noUnusedParameters`.
  rubrosUnicos,
  filtrosEstado,
  filtrosRubro,
  filtrosPrioridad,
  onToggleEstado,
  onToggleRubro,
  onTogglePrioridad,
  ordenSeleccionadaId,
  onSeleccionar,
}: PanelResumenProps) {

  const [rubroOpen,     setRubroOpen]     = useState(true);
  const [prioridadOpen, setPrioridadOpen] = useState(false);

  // ── Stats (siempre sobre el total, no las filtradas) ───────────────────────
  const stats = useMemo(() => {
    const c: Record<string, number> = {
      Total: ordenes.length,
      Pendiente:  0,
      'En proceso': 0,
      Cerrada: 0,
      'No aplica': 0,
    };
    for (const o of ordenes) c[o.estado] = (c[o.estado] ?? 0) + 1;
    return c;
  }, [ordenes]);

  // La lista del panel muestra SÓLO las OTs sin ubicar (pos_x null/undefined).
  // Las OTs ya colocadas viven como marcadores en el plano — clickear un
  // marcador abre su panel, así que listarlas acá sería redundante.
  // pos_x runtime: el tipo declara `number` pero CSV/legacy pueden traer null.
  const otsSinUbicar = useMemo(() => {
    return ordenes
      .filter(o => o.pos_x === null || o.pos_x === undefined)
      .sort((a, b) => {
        const na = parseInt(a.ot?.replace(/\D/g, '') ?? '0');
        const nb = parseInt(b.ot?.replace(/\D/g, '') ?? '0');
        if (!isNaN(na) && !isNaN(nb)) return na - nb;
        return (a.ot ?? '').localeCompare(b.ot ?? '');
      });
  }, [ordenes]);

  return (
    <aside className={styles.panel}>

      {/* ─── Resumen + stats ─── */}
      <div className={styles.section}>
        <div className={styles.sectionHead}>
          <span className={styles.sectionTitle}>Resumen del proyecto</span>
          <span className={styles.totalPill}>{stats.Total}</span>
        </div>
        <div className={styles.statsGrid}>
          <div className={styles.statCard}>
            <div className={styles.statNum}>{stats.Total}</div>
            <div className={styles.statLabel}>Total</div>
          </div>
          {ESTADOS_ORDEN.map(est => (
            <div key={est} className={styles.statCard}>
              <div className={styles.statNum} style={{ color: ESTADO_COLOR[est] }}>
                {stats[est] ?? 0}
              </div>
              <div className={styles.statLabel}>{LABEL_ESTADO_CORTO[est]}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ─── Filtro Estado ─── */}
      <div className={styles.section}>
        <div className={styles.sectionHead}>
          <span className={styles.sectionTitle}>Estado</span>
        </div>
        <div className={styles.checkList}>
          {ESTADOS_ORDEN.map(est => {
            const on = filtrosEstado.has(est);
            return (
              <label key={est} className={styles.checkRow}>
                <input
                  type="checkbox"
                  className={styles.checkbox}
                  checked={on}
                  onChange={() => onToggleEstado(est)}
                  style={{ accentColor: ESTADO_COLOR[est] }}
                />
                <span className={styles.checkDot} style={{ background: ESTADO_COLOR[est] }} />
                <span className={styles.checkLabel}>{LABEL_ESTADO_CORTO[est]}</span>
                <span className={styles.checkCount}>{stats[est] ?? 0}</span>
              </label>
            );
          })}
        </div>
      </div>

      {/* ─── Filtro Rubro (colapsable) ─── */}
      <div className={styles.section}>
        <button
          className={styles.sectionHead + ' ' + styles.collapsible}
          onClick={() => setRubroOpen(o => !o)}
          type="button"
        >
          <span className={styles.sectionTitle}>Rubro</span>
          <span className={styles.chevron}>{rubroOpen ? '▾' : '▸'}</span>
        </button>
        {rubroOpen && (
          <div className={styles.checkList}>
            {rubrosUnicos.length === 0 ? (
              <div className={styles.empty}>Sin rubros</div>
            ) : (
              rubrosUnicos.map(r => {
                const on = filtrosRubro.has(r);
                const count = ordenes.filter(o => o.rubro === r).length;
                return (
                  <label key={r} className={styles.checkRow}>
                    <input
                      type="checkbox"
                      className={styles.checkbox}
                      checked={on}
                      onChange={() => onToggleRubro(r)}
                    />
                    <span className={styles.checkLabel}>{r}</span>
                    <span className={styles.checkCount}>{count}</span>
                  </label>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* ─── Filtro Prioridad (colapsable) ─── */}
      <div className={styles.section}>
        <button
          className={styles.sectionHead + ' ' + styles.collapsible}
          onClick={() => setPrioridadOpen(o => !o)}
          type="button"
        >
          <span className={styles.sectionTitle}>Prioridad</span>
          <span className={styles.chevron}>{prioridadOpen ? '▾' : '▸'}</span>
        </button>
        {prioridadOpen && (
          <div className={styles.checkList}>
            {PRIORIDADES.map(p => {
              const on = filtrosPrioridad.has(p);
              const count = ordenes.filter(o => o.prioridad === p).length;
              return (
                <label key={p} className={styles.checkRow}>
                  <input
                    type="checkbox"
                    className={styles.checkbox}
                    checked={on}
                    onChange={() => onTogglePrioridad(p)}
                    style={{ accentColor: COLOR_PRIORIDAD[p] }}
                  />
                  <span className={styles.checkDot} style={{ background: COLOR_PRIORIDAD[p] }} />
                  <span className={styles.checkLabel}>{p}</span>
                  <span className={styles.checkCount}>{count}</span>
                </label>
              );
            })}
          </div>
        )}
      </div>

      {/* ─── OTs sin ubicar — drag al plano ─── */}
      <div className={styles.listaSection}>
        <div className={styles.sectionHead}>
          <span className={styles.sectionTitle}>OTs sin ubicar</span>
          <span className={styles.totalPill}>{otsSinUbicar.length}</span>
        </div>
        <div className={styles.lista}>
          {otsSinUbicar.length === 0 ? (
            <div className={styles.empty}>Todas las OTs están ubicadas en el plano ✓</div>
          ) : (
            otsSinUbicar.map(o => (
              <div
                key={o.id}
                className={`${styles.item} ${ordenSeleccionadaId === o.id ? styles.itemActivo : ''}`}
                onClick={() => onSeleccionar(o)}
                draggable={true}
                onDragStart={e => {
                  // 'text/ot-id' es el contrato que espera VistaPlano.handleDropOT
                  // para ubicar una OT nueva (idéntico al usado por ToolPanel).
                  e.dataTransfer.setData('text/ot-id', o.id);
                  e.dataTransfer.effectAllowed = 'move';
                }}
              >
                <span className={styles.itemDot} style={{ background: ESTADO_COLOR[o.estado] }} />
                <div className={styles.itemInfo}>
                  <span className={styles.itemCodigo}>{o.ot}</span>
                  {o.rubro && (
                    <span className={styles.itemDesc}>{o.rubro}</span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

    </aside>
  );
}
