import { useEffect, useMemo, useState } from 'react';
import { useOrdenesStore } from '../../stores/ordenesStore';
import { useProyectosStore } from '../../stores/proyectosStore';
import { useAuthStore } from '../../stores/authStore';
import { ESTADO_COLOR } from '../../constants/estados';

const ESTADOS = ['Pendiente', 'En proceso', 'Cerrada', 'No aplica'] as const;

function saludo() {
  const h = new Date().getHours();
  if (h < 12) return 'Buenos días';
  if (h < 19) return 'Buenas tardes';
  return 'Buenas noches';
}
function fechaLarga() {
  return new Date().toLocaleDateString('es-PY', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}
function formatGs(n: number): string {
  return new Intl.NumberFormat('es-PY').format(Math.round(n)) + ' Gs.';
}

export default function Dashboard() {
  const ordenes = useOrdenesStore(s => s.ordenes);
  const cargarTodasLasOrdenes = useOrdenesStore(s => s.cargarTodasLasOrdenes);
  const proyectos = useProyectosStore(s => s.proyectos);
  const cargarProyectos = useProyectosStore(s => s.cargarProyectos);
  const user = useAuthStore(s => s.user);

  const [filtroProyecto, setFiltroProyecto] = useState<string>('');

  useEffect(() => {
    cargarProyectos();
    cargarTodasLasOrdenes();
  }, [cargarProyectos, cargarTodasLasOrdenes]);

  const userName = user?.email?.split('@')[0] ?? 'Usuario';

  const ordenesFiltradas = useMemo(
    () => filtroProyecto ? ordenes.filter(o => o.proyecto_id === filtroProyecto) : ordenes,
    [ordenes, filtroProyecto],
  );

  const kpi = useMemo(() => {
    const total = ordenesFiltradas.length;
    const avanceSum = ordenesFiltradas.reduce((s, o) => s + (o.porcentaje_avance ?? 0), 0);
    const avancePromedio = total > 0 ? Math.round(avanceSum / total) : 0;
    const riesgo = ordenesFiltradas.filter(o => o.nivel_riesgo === 'Alto' || o.nivel_riesgo === 'Extremo').length;
    const costoTotal = ordenesFiltradas.reduce((s, o) => s + (o.costo ?? 0), 0);

    // Delta vs semana pasada (modificadas)
    const haceSemana = Date.now() - 7 * 86400000;
    const modificadasUltSem = ordenesFiltradas.filter(o => {
      const t = new Date(o.updated_at ?? o.created_at ?? 0).getTime();
      return t >= haceSemana;
    }).length;

    return { total, avancePromedio, riesgo, costoTotal, modificadasUltSem };
  }, [ordenesFiltradas]);

  const porEstado = useMemo(() => {
    const c: Record<string, number> = {};
    for (const o of ordenesFiltradas) c[o.estado] = (c[o.estado] ?? 0) + 1;
    return c;
  }, [ordenesFiltradas]);

  const sinEstado = ordenesFiltradas.filter(o => !o.estado).length;

  const porRubro = useMemo(() => {
    const c: Record<string, number> = {};
    for (const o of ordenesFiltradas) {
      const r = o.rubro || 'Sin rubro';
      c[r] = (c[r] ?? 0) + 1;
    }
    return Object.entries(c).sort((a, b) => b[1] - a[1]);
  }, [ordenesFiltradas]);

  const ultimas5 = useMemo(() => {
    return [...ordenesFiltradas]
      .sort((a, b) => {
        const ta = new Date(a.updated_at ?? a.created_at ?? 0).getTime();
        const tb = new Date(b.updated_at ?? b.created_at ?? 0).getTime();
        return tb - ta;
      })
      .slice(0, 5);
  }, [ordenesFiltradas]);

  const maxRubro = porRubro[0]?.[1] ?? 1;

  return (
    <div style={{ padding: 28, background: '#F9FAFB', minHeight: '100%' }}>
      {/* Header con saludo + filtro */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 22, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: '#0F172A', margin: 0 }}>
            {saludo()}, {userName} 👋
          </h1>
          <p style={{ fontSize: 13, color: '#6B7280', margin: '4px 0 0', textTransform: 'capitalize' }}>
            {fechaLarga()}
          </p>
        </div>
        <FiltroProyecto value={filtroProyecto} onChange={setFiltroProyecto} proyectos={proyectos} />
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 18 }}>
        <KPICard
          label="Total OTs"
          valor={kpi.total}
          subtitle={kpi.modificadasUltSem > 0 ? `${kpi.modificadasUltSem} actualizadas última semana` : 'Sin cambios esta semana'}
        />
        <KPICard
          label="Avance general"
          valor={`${kpi.avancePromedio}%`}
          color={kpi.avancePromedio >= 80 ? '#15803D' : '#1E3A5F'}
          bar={kpi.avancePromedio}
        />
        <KPICard
          label="OTs en riesgo"
          valor={kpi.riesgo}
          color={kpi.riesgo > 0 ? '#DC2626' : '#15803D'}
          badge={kpi.riesgo > 0 ? { text: 'Crítico', color: '#DC2626' } : { text: 'OK', color: '#15803D' }}
        />
        <KPICard
          label="Costo total"
          valor={formatGs(kpi.costoTotal)}
          fontSize={20}
        />
      </div>

      {/* Por Estado */}
      <Seccion titulo="Por Estado">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8 }}>
          {ESTADOS.map(e => (
            <div key={e} style={smallCard}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 9, height: 9, borderRadius: '50%', background: ESTADO_COLOR[e] }} />
                <span style={{ fontSize: 11, color: '#6B7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4 }}>{e}</span>
              </div>
              <div style={{ fontSize: 24, fontWeight: 800, color: '#0F172A', marginTop: 4 }}>
                {porEstado[e] ?? 0}
              </div>
            </div>
          ))}
          <div style={smallCard}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#CBD5E1' }} />
              <span style={{ fontSize: 11, color: '#6B7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4 }}>Sin estado</span>
            </div>
            <div style={{ fontSize: 24, fontWeight: 800, color: '#0F172A', marginTop: 4 }}>{sinEstado}</div>
          </div>
        </div>
      </Seccion>

      {/* Por Rubro */}
      <Seccion titulo="Por Rubro">
        {porRubro.length === 0 ? (
          <div style={{ fontSize: 13, color: '#94A3B8', padding: 12, textAlign: 'center' }}>Sin rubros</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {porRubro.map(([rubro, count]) => {
              const pct = Math.round((count / kpi.total) * 100);
              const barPct = (count / maxRubro) * 100;
              return (
                <div key={rubro} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 12, color: '#374151', fontWeight: 600, minWidth: 140, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {rubro}
                  </span>
                  <div style={{ flex: 1, height: 10, background: '#F1F5F9', borderRadius: 999, overflow: 'hidden' }}>
                    <div style={{
                      width: `${barPct}%`, height: '100%',
                      background: 'linear-gradient(90deg, #2462C9, #1E3A5F)',
                      borderRadius: 999,
                    }} />
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#0F172A', minWidth: 36, textAlign: 'right' }}>{count}</span>
                  <span style={{ fontSize: 11, color: '#94A3B8', minWidth: 36, textAlign: 'right' }}>{pct}%</span>
                </div>
              );
            })}
          </div>
        )}
      </Seccion>

      {/* Últimas OTs modificadas */}
      <Seccion titulo="Últimas OTs modificadas">
        {ultimas5.length === 0 ? (
          <div style={{ fontSize: 13, color: '#94A3B8', padding: 12, textAlign: 'center' }}>Sin OTs todavía</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr>
                {['OT', 'Estado', 'Responsable', 'Última mod.'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '8px 6px', fontSize: 10, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.4, borderBottom: '1px solid #E5E7EB' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ultimas5.map(o => (
                <tr key={o.id} style={{ borderBottom: '1px solid #F3F4F6' }}>
                  <td style={{ padding: '10px 6px', fontFamily: 'monospace', fontWeight: 700, color: '#0F172A' }}>{o.ot}</td>
                  <td style={{ padding: '10px 6px' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: ESTADO_COLOR[o.estado], fontWeight: 600 }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: ESTADO_COLOR[o.estado] }} />
                      {o.estado}
                    </span>
                  </td>
                  <td style={{ padding: '10px 6px', color: '#475569' }}>{o.responsable || '—'}</td>
                  <td style={{ padding: '10px 6px', color: '#94A3B8' }}>
                    {new Date(o.updated_at ?? o.created_at ?? 0).toLocaleDateString('es-PY')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Seccion>
    </div>
  );
}

// ──────────────────────────────────────────── Sub-componentes ──

export function FiltroProyecto({
  value, onChange, proyectos,
}: { value: string; onChange: (v: string) => void; proyectos: { id: string; nombre: string }[] }) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      style={{
        height: 34, padding: '0 12px',
        border: '1px solid #E5E7EB', borderRadius: 8,
        fontSize: 13, color: '#1E293B', background: '#fff',
        outline: 'none', cursor: 'pointer', fontFamily: 'inherit',
        minWidth: 220,
      }}
    >
      <option value="">Todos los proyectos</option>
      {proyectos.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
    </select>
  );
}

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section style={{
      background: '#fff', border: '1px solid #E5E7EB',
      borderRadius: 12, padding: '16px 18px', marginBottom: 14,
      boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
    }}>
      <h2 style={{
        fontSize: 11, fontWeight: 700, color: '#6B7280',
        textTransform: 'uppercase', letterSpacing: 0.5,
        margin: '0 0 12px',
      }}>{titulo}</h2>
      {children}
    </section>
  );
}

function KPICard({
  label, valor, subtitle, color = '#0F172A', bar, badge, fontSize = 30,
}: {
  label: string;
  valor: string | number;
  subtitle?: string;
  color?: string;
  bar?: number;
  badge?: { text: string; color: string };
  fontSize?: number;
}) {
  return (
    <div style={{
      background: '#fff', border: '1px solid #E5E7EB',
      borderRadius: 12, padding: '16px 18px',
      boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <div style={{ fontSize, fontWeight: 800, color, lineHeight: 1 }}>{valor}</div>
        {badge && (
          <span style={{
            fontSize: 10, fontWeight: 700,
            color: badge.color,
            background: badge.color + '18',
            border: `1px solid ${badge.color}40`,
            borderRadius: 999, padding: '3px 9px',
            textTransform: 'uppercase', letterSpacing: 0.4,
          }}>{badge.text}</span>
        )}
      </div>
      {bar != null && (
        <div style={{ marginTop: 10, height: 6, background: '#F1F5F9', borderRadius: 999, overflow: 'hidden' }}>
          <div style={{
            width: `${Math.max(0, Math.min(100, bar))}%`,
            height: '100%',
            background: 'linear-gradient(90deg, #2462C9, #1E3A5F)',
          }} />
        </div>
      )}
      {subtitle && (
        <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 8 }}>{subtitle}</div>
      )}
    </div>
  );
}

const smallCard: React.CSSProperties = {
  background: '#F8FAFC',
  border: '1px solid #E5E7EB',
  borderRadius: 10,
  padding: '12px 14px',
};
