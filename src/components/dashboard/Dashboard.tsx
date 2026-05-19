// src/components/dashboard/Dashboard.tsx
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../db/supabase';
import styles from './Dashboard.module.css';

interface Proyecto { id: string; nombre: string; cliente: string | null; }
interface Orden {
  id: string; ot: string | null; estado: string | null;
  responsable: string | null; rubro: string | null;
  prioridad: string | null; proyecto_id: string | null; updated_at: string | null;
}

const ESTADO_CFG: Record<string, { color: string; bg: string; text: string }> = {
  'Pendiente':  { color: '#EF4444', bg: '#FEF2F2', text: '#991B1B' },
  'En proceso': { color: '#2462C9', bg: '#EFF4FF', text: '#1E40AF' },
  'Cerrada':    { color: '#22C55E', bg: '#F0FDF4', text: '#166534' },
  'No aplica':  { color: '#9CA3AF', bg: '#F8FAFC', text: '#4B5563' },
};
const ESTADOS = Object.keys(ESTADO_CFG);

function fmt(n: number) { return n.toLocaleString('es-PY'); }
function trunc(s: string, max: number) { return s.length > max ? s.slice(0, max) + '…' : s; }

function DonutChart({ data, total }: { data: { label: string; value: number; color: string }[]; total: number }) {
  const R = 46, STROKE = 18, r = R - STROKE / 2;
  const circ = 2 * Math.PI * r;
  const pctCerr = total > 0 ? Math.round(((data.find(d => d.label === 'Cerrada')?.value || 0) / total) * 100) : 0;
  let offset = 0;
  const arcs = data.filter(d => d.value > 0).map((d, i) => {
    const pct = d.value / total;
    const dash = pct * circ, gap = circ - dash;
    const dOff = -(offset * circ - circ / 4);
    offset += pct;
    return <circle key={i} cx="56" cy="56" r={r} fill="none" stroke={d.color}
      strokeWidth={STROKE} strokeDasharray={`${dash.toFixed(2)} ${gap.toFixed(2)}`}
      strokeDashoffset={dOff} strokeLinecap="butt"/>;
  });
  return (
    <svg width="112" height="112" viewBox="0 0 112 112" style={{ flexShrink: 0 }}>
      <circle cx="56" cy="56" r={r} fill="none" stroke="var(--bg-subtle)" strokeWidth={STROKE}/>
      {arcs}
      <text x="56" y="52" textAnchor="middle" dominantBaseline="middle" fontSize="15"
        fontWeight="700" fill="var(--text-primary)" fontFamily="var(--font-sans)">{pctCerr}%</text>
      <text x="56" y="66" textAnchor="middle" dominantBaseline="middle" fontSize="9"
        fill="var(--text-tertiary)" fontFamily="var(--font-sans)">cerradas</text>
    </svg>
  );
}

interface DashboardProps { onBack?: () => void; }

export default function Dashboard({ onBack }: DashboardProps) {
  const [proyectos,  setProyectos]  = useState<Proyecto[]>([]);
  const [ordenes,    setOrdenes]    = useState<Orden[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState<string | null>(null);
  const [filtro,     setFiltro]     = useState<string>('todos');
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [{ data: proys, error: e1 }, { data: ords, error: e2 }] = await Promise.all([
        supabase.from('proyectos').select('id, nombre, cliente').is('deleted_at', null).order('nombre'),
        supabase.from('ordenes').select('id, ot, estado, responsable, rubro, prioridad, proyecto_id, updated_at').order('updated_at', { ascending: false }),
      ]);
      if (e1) throw new Error(e1.message);
      if (e2) throw new Error(e2.message);
      setProyectos(proys ?? []);
      setOrdenes(ords ?? []);
      setLastUpdate(new Date());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  }, []);

  // ← la línea que faltaba
  useEffect(() => { fetchAll(); }, [fetchAll]);

  const filtered = filtro === 'todos' ? ordenes : ordenes.filter(o => o.proyecto_id === filtro);
  const total    = filtered.length;
  const counts: Record<string, number> = {};
  ESTADOS.forEach(e => { counts[e] = filtered.filter(o => o.estado === e).length; });
  const pctCerr = total > 0 ? Math.round((counts['Cerrada'] / total) * 100) : 0;

  const respMap: Record<string, number> = {};
  filtered.forEach(o => { if (o.responsable) respMap[o.responsable] = (respMap[o.responsable] || 0) + 1; });
  const byResp  = Object.entries(respMap).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const maxResp = byResp[0]?.[1] || 1;

  const rubroMap: Record<string, number> = {};
  filtered.forEach(o => { if (o.rubro) rubroMap[o.rubro] = (rubroMap[o.rubro] || 0) + 1; });
  const byRubro  = Object.entries(rubroMap).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const maxRubro = byRubro[0]?.[1] || 1;

  const now   = Date.now();
  const weeks = Array.from({ length: 8 }, (_, i) => {
    const weekStart = new Date(now - (7 - i) * 7 * 86400000);
    const weekEnd   = new Date(now - (6 - i) * 7 * 86400000);
    const vals: Record<string, number> = {};
    ESTADOS.forEach(e => { vals[e] = 0; });
    filtered.forEach(o => {
      if (!o.updated_at || !o.estado) return;
      const d = new Date(o.updated_at);
      if (d >= weekStart && d < weekEnd && vals[o.estado] !== undefined) vals[o.estado]++;
    });
    return { label: weekStart.toLocaleDateString('es-PY', { day: '2-digit', month: '2-digit' }), vals };
  });
  const maxWeek  = Math.max(1, ...weeks.map(w => Object.values(w.vals).reduce((a, b) => a + b, 0)));
  const donutData = ESTADOS.map(e => ({ label: e, value: counts[e], color: ESTADO_CFG[e].color })).filter(d => d.value > 0);
  const recentOTs = filtered.slice(0, 10);

  return (
    <div className={styles.wrap}>
      <div className={styles.topBar}>
        <div className={styles.topBarLeft}>
          <div className={styles.logoBlock}>
            <div className={styles.logoIcon}>
              <svg viewBox="0 0 16 16" fill="none" stroke="#fff" strokeWidth="1.5">
                <rect x="1" y="1" width="14" height="14" rx="2"/>
                <line x1="4" y1="6" x2="12" y2="6" strokeLinecap="round"/>
                <line x1="4" y1="9" x2="9" y2="9" strokeLinecap="round"/>
                <circle cx="12" cy="11" r="2"/>
              </svg>
            </div>
            <span className={styles.logoName}>Plan-OTs</span>
          </div>
          <div className={styles.divider}/>
          <span className={styles.pageTitle}>Dashboard Ejecutivo</span>
        </div>
        <div className={styles.topBarRight}>
          {lastUpdate && (
            <span className={styles.lastUpdate}>
              Actualizado {lastUpdate.toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          {onBack && <button className={styles.btnBack} onClick={onBack}>← Volver</button>}
          <button className={styles.btnRefresh} onClick={fetchAll} disabled={loading}>
            <span className={loading ? styles.spin : undefined}>↻</span>
            {loading ? 'Cargando…' : 'Actualizar'}
          </button>
        </div>
      </div>

      <div className={styles.content}>
        {error && <div className={styles.errorBanner}>⚠ {error}</div>}

        {loading ? (
          <div className={styles.loadingState}>
            <div className={styles.loadingSpinner}/>
            <span>Cargando datos…</span>
          </div>
        ) : !error && (
          <>
            <div className={styles.projSection}>
              <span className={styles.projLabel}>Proyecto</span>
              <button className={`${styles.pill} ${filtro === 'todos' ? styles.pillActive : ''}`} onClick={() => setFiltro('todos')}>
                Todos ({ordenes.length})
              </button>
              {proyectos.map(p => (
                <button key={p.id} className={`${styles.pill} ${filtro === p.id ? styles.pillActive : ''}`} onClick={() => setFiltro(p.id)}>
                  {trunc(p.nombre, 24)}
                </button>
              ))}
            </div>

            <div className={styles.kpiRow}>
              {[
                { label: 'Total OTs',   value: fmt(total),                   sub: `${proyectos.length} proyecto${proyectos.length !== 1 ? 's' : ''}`, color: '#2462C9', progress: false },
                { label: 'Avance global', value: `${pctCerr}%`,              sub: '',                                                                  color: '#22C55E', progress: true  },
                { label: 'En proceso',  value: fmt(counts['En proceso']),     sub: `${total > 0 ? Math.round((counts['En proceso'] / total) * 100) : 0}% del total`, color: '#2462C9', progress: false },
                { label: 'Pendientes',  value: fmt(counts['Pendiente']),      sub: `${total > 0 ? Math.round((counts['Pendiente'] / total) * 100) : 0}% del total`,  color: '#EF4444', progress: false },
              ].map(k => (
                <div key={k.label} className={styles.kpiCard}>
                  <div className={styles.kpiAccent} style={{ background: k.color }}/>
                  <div className={styles.kpiLabel}>{k.label}</div>
                  <div className={styles.kpiValue}>{k.value}</div>
                  {k.progress ? (
                    <div className={styles.kpiProgress}>
                      <div className={styles.kpiProgressFill} style={{ width: `${pctCerr}%` }}/>
                    </div>
                  ) : k.sub ? <div className={styles.kpiSub}>{k.sub}</div> : null}
                </div>
              ))}
            </div>

            <div className={styles.chartsRow}>
              <div className={styles.card}>
                <div className={styles.cardTitle}>Distribución por estado <span className={styles.cardTitleSub}>{fmt(total)} OTs</span></div>
                {total > 0 ? (
                  <div className={styles.donutWrap}>
                    <DonutChart data={donutData} total={total}/>
                    <div className={styles.donutLegend}>
                      {ESTADOS.map(e => (
                        <div key={e} className={styles.donutLegItem}>
                          <div className={styles.donutLegLeft}>
                            <div className={styles.donutLegSq} style={{ background: ESTADO_CFG[e].color }}/>
                            {e}
                          </div>
                          <span className={styles.donutLegVal}>{fmt(counts[e])}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : <div style={{ textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 'var(--text-xs)', padding: '24px 0' }}>Sin OTs</div>}
              </div>

              <div className={styles.card}>
                <div className={styles.cardTitle}>Por estado</div>
                <div className={styles.stateGrid}>
                  {ESTADOS.map(e => {
                    const cfg = ESTADO_CFG[e];
                    return (
                      <div key={e} className={styles.stateCard} style={{ background: cfg.bg }}>
                        <div className={styles.stateN} style={{ color: cfg.color }}>{fmt(counts[e])}</div>
                        <div className={styles.stateL} style={{ color: cfg.text }}>{e}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className={styles.chartsRow}>
              <div className={styles.card}>
                <div className={styles.cardTitle}>Por responsable <span className={styles.cardTitleSub}>top {Math.min(byResp.length, 8)}</span></div>
                <div className={styles.barContainer}>
                  {byResp.length > 0 ? byResp.map(([name, val]) => (
                    <div key={name} className={styles.barRow}>
                      <div className={styles.barName}>{trunc(name, 16)}</div>
                      <div className={styles.barTrack}>
                        <div className={styles.barFill} style={{ width: `${Math.round((val / maxResp) * 100)}%`, background: '#2462C9' }}/>
                      </div>
                      <div className={styles.barVal}>{val}</div>
                    </div>
                  )) : <div className={styles.barEmpty}>Sin datos</div>}
                </div>
              </div>

              <div className={styles.card}>
                <div className={styles.cardTitle}>Por rubro <span className={styles.cardTitleSub}>top {Math.min(byRubro.length, 8)}</span></div>
                <div className={styles.barContainer}>
                  {byRubro.length > 0 ? byRubro.map(([name, val]) => (
                    <div key={name} className={styles.barRow}>
                      <div className={styles.barName}>{trunc(name, 16)}</div>
                      <div className={styles.barTrack}>
                        <div className={styles.barFill} style={{ width: `${Math.round((val / maxRubro) * 100)}%`, background: '#7C3AED' }}/>
                      </div>
                      <div className={styles.barVal}>{val}</div>
                    </div>
                  )) : <div className={styles.barEmpty}>Sin datos</div>}
                </div>
              </div>
            </div>

            <div className={styles.card}>
              <div className={styles.cardTitle}>Actividad — últimas 8 semanas <span className={styles.cardTitleSub}>por fecha de actualización</span></div>
              <div className={styles.timelineWrap}>
                {weeks.map((w, i) => {
                  const tot      = Object.values(w.vals).reduce((a, b) => a + b, 0);
                  const widthPct = tot > 0 ? Math.max((tot / maxWeek) * 100, 2) : 0;
                  return (
                    <div key={i} className={styles.tlRow}>
                      <div className={styles.tlWeek}>{w.label}</div>
                      <div className={styles.tlBars} style={{ width: `${widthPct}%`, minWidth: tot > 0 ? 4 : 0 }}>
                        {ESTADOS.map(e => {
                          const v   = w.vals[e] || 0;
                          const pct = tot > 0 ? (v / tot) * 100 : 0;
                          return v > 0 ? (
                            <div key={e} className={styles.tlSeg}
                              style={{ height: 12, width: `${pct}%`, minWidth: 3, background: ESTADO_CFG[e].color }}
                              title={`${e}: ${v}`}/>
                          ) : null;
                        })}
                      </div>
                      <div className={styles.tlCount}>{tot > 0 ? tot : ''}</div>
                    </div>
                  );
                })}
                <div className={styles.tlLegend}>
                  {ESTADOS.map(e => (
                    <div key={e} className={styles.tlLegItem}>
                      <div className={styles.tlLegDot} style={{ background: ESTADO_CFG[e].color }}/>
                      {e}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {recentOTs.length > 0 && (
              <div className={styles.recentCard}>
                <div className={styles.cardTitle}>Últimas OTs modificadas <span className={styles.cardTitleSub}>máx. 10</span></div>
                <table className={styles.otTable}>
                  <thead>
                    <tr><th>Código</th><th>Estado</th><th>Responsable</th><th>Rubro</th><th>Prioridad</th><th>Actualizado</th></tr>
                  </thead>
                  <tbody>
                    {recentOTs.map(o => {
                      const cfg   = ESTADO_CFG[o.estado || ''] || ESTADO_CFG['No aplica'];
                      const fecha = o.updated_at
                        ? new Date(o.updated_at).toLocaleDateString('es-PY', { day: '2-digit', month: '2-digit', year: '2-digit' })
                        : '—';
                      return (
                        <tr key={o.id}>
                          <td><span className={styles.otCode}>{o.ot || '—'}</span></td>
                          <td>
                            <span className={styles.estadoBadge} style={{ background: cfg.bg, color: cfg.text }}>
                              <span className={styles.estadoDot} style={{ background: cfg.color }}/>
                              {o.estado || '—'}
                            </span>
                          </td>
                          <td>{trunc(o.responsable || '—', 20)}</td>
                          <td>{trunc(o.rubro || '—', 20)}</td>
                          <td>{o.prioridad || '—'}</td>
                          <td style={{ fontFamily: 'var(--font-mono)', fontSize: 10 }}>{fecha}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}