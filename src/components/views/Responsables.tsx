import { useEffect, useMemo, useState } from 'react';
import { useOrdenesStore } from '../../stores/ordenesStore';
import { useProyectosStore } from '../../stores/proyectosStore';
import { ESTADO_COLOR } from '../../constants/estados';
import { ModalDetalleOT } from '../grilla/ModalDetalleOT';
import type { OrdenLocal } from '../../types/orden';
import { FiltroProyecto } from './Dashboard';

const PALETTE = ['#1E40AF', '#15803D', '#C2410C', '#7C3AED', '#0E7490', '#BE123C', '#B45309'];

function colorFromName(n: string): string {
  if (!n) return PALETTE[0];
  let h = 0;
  for (let i = 0; i < n.length; i++) h = (h * 31 + n.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}
const inicial = (n: string) => n ? n.trim().charAt(0).toUpperCase() : '?';

const ESTADOS = ['Pendiente', 'En proceso', 'Cerrada', 'No aplica'] as const;

interface AgrupResp {
  nombre: string;
  total: number;
  porEstado: Record<string, number>;
  rubroTop: string | null;
  prioridadTop: string | null;
  ots: OrdenLocal[];
}

function topDe<T extends string>(arr: T[]): T | null {
  if (arr.length === 0) return null;
  const c = new Map<T, number>();
  for (const v of arr) c.set(v, (c.get(v) ?? 0) + 1);
  let best: T | null = null, bestN = 0;
  for (const [k, n] of c) { if (n > bestN) { best = k; bestN = n; } }
  return best;
}

export default function Responsables() {
  const ordenes = useOrdenesStore(s => s.ordenes);
  const cargarTodasLasOrdenes = useOrdenesStore(s => s.cargarTodasLasOrdenes);
  const proyectos = useProyectosStore(s => s.proyectos);
  const cargarProyectos = useProyectosStore(s => s.cargarProyectos);

  const [filtroProyecto, setFiltroProyecto] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [expandido, setExpandido] = useState<string | null>(null);
  const [modalOrden, setModalOrden] = useState<OrdenLocal | null>(null);

  useEffect(() => {
    cargarProyectos();
    cargarTodasLasOrdenes();
  }, [cargarProyectos, cargarTodasLasOrdenes]);

  const ordenesFiltradas = useMemo(
    () => filtroProyecto ? ordenes.filter(o => o.proyecto_id === filtroProyecto) : ordenes,
    [ordenes, filtroProyecto],
  );

  const responsables: AgrupResp[] = useMemo(() => {
    const map = new Map<string, OrdenLocal[]>();
    for (const o of ordenesFiltradas) {
      const nombre = (o.responsable ?? '').trim();
      if (!nombre) continue;
      if (!map.has(nombre)) map.set(nombre, []);
      map.get(nombre)!.push(o);
    }
    return [...map.entries()].map(([nombre, ots]) => {
      const porEstado: Record<string, number> = { Pendiente: 0, 'En proceso': 0, Cerrada: 0, 'No aplica': 0 };
      for (const o of ots) porEstado[o.estado] = (porEstado[o.estado] ?? 0) + 1;
      return {
        nombre,
        total: ots.length,
        porEstado,
        rubroTop:     topDe(ots.map(o => o.rubro).filter(Boolean) as string[]),
        prioridadTop: topDe(ots.map(o => o.prioridad).filter(Boolean) as string[]),
        ots,
      };
    }).sort((a, b) => b.total - a.total);
  }, [ordenesFiltradas]);

  const visibles = useMemo(() => {
    if (!busqueda.trim()) return responsables;
    const q = busqueda.toLowerCase();
    return responsables.filter(r => r.nombre.toLowerCase().includes(q));
  }, [responsables, busqueda]);

  return (
    <div style={{ padding: 28, background: '#F9FAFB', minHeight: '100%' }}>
      <header style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14, marginBottom: 18, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0F172A', margin: 0 }}>Responsables</h1>
          <p style={{ fontSize: 13, color: '#6B7280', margin: '4px 0 0' }}>
            Carga de trabajo y asignaciones por responsable.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <input
            type="text"
            placeholder="🔍 Buscar responsable..."
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            style={{
              height: 34, padding: '0 12px',
              border: '1px solid #E5E7EB', borderRadius: 8,
              fontSize: 13, background: '#fff', color: '#1E293B',
              outline: 'none', fontFamily: 'inherit', minWidth: 220,
            }}
          />
          <FiltroProyecto value={filtroProyecto} onChange={setFiltroProyecto} proyectos={proyectos} />
        </div>
      </header>

      {visibles.length === 0 ? (
        <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, padding: 30, textAlign: 'center', color: '#94A3B8', fontSize: 14 }}>
          {responsables.length === 0 ? 'Sin OTs con responsable asignado.' : 'Sin coincidencias.'}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 12 }}>
          {visibles.map(r => {
            const isOpen = expandido === r.nombre;
            return (
              <div key={r.nombre} style={{
                background: '#fff', border: '1px solid #E5E7EB',
                borderRadius: 12, padding: 0,
                gridColumn: isOpen ? '1 / -1' : 'auto',
                transition: 'all 0.15s',
                boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
              }}>
                <button
                  type="button"
                  onClick={() => setExpandido(isOpen ? null : r.nombre)}
                  style={{
                    width: '100%', background: 'transparent', border: 'none',
                    padding: 16, cursor: 'pointer', fontFamily: 'inherit',
                    textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 12,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{
                      width: 44, height: 44, borderRadius: '50%',
                      background: colorFromName(r.nombre),
                      color: '#fff', fontSize: 16, fontWeight: 700,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0,
                    }}>{inicial(r.nombre)}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {r.nombre}
                      </div>
                      <div style={{ fontSize: 11, color: '#6B7280' }}>
                        {r.total} {r.total === 1 ? 'OT asignada' : 'OTs asignadas'}
                      </div>
                    </div>
                    <span style={{ fontSize: 12, color: '#94A3B8' }}>{isOpen ? '▴' : '▾'}</span>
                  </div>

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                    {ESTADOS.map(e => {
                      const c = r.porEstado[e] ?? 0;
                      if (c === 0) return null;
                      return (
                        <span key={e} style={{
                          display: 'inline-flex', alignItems: 'center', gap: 5,
                          fontSize: 10, fontWeight: 700,
                          padding: '3px 8px', borderRadius: 999,
                          background: ESTADO_COLOR[e] + '18',
                          color: ESTADO_COLOR[e],
                          border: `1px solid ${ESTADO_COLOR[e]}40`,
                          textTransform: 'uppercase', letterSpacing: 0.3,
                        }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: ESTADO_COLOR[e] }} />
                          {e}: {c}
                        </span>
                      );
                    })}
                  </div>

                  <div style={{ display: 'flex', gap: 16, fontSize: 11, color: '#475569' }}>
                    <span><strong style={{ color: '#0F172A' }}>Rubro top:</strong> {r.rubroTop ?? '—'}</span>
                    <span><strong style={{ color: '#0F172A' }}>Prio. top:</strong> {r.prioridadTop ?? '—'}</span>
                  </div>
                </button>

                {isOpen && (
                  <div style={{ borderTop: '1px solid #F1F5F9', padding: 12 }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                      <thead>
                        <tr>
                          {['OT', 'Estado', 'Prioridad', 'Rubro', 'Avance', ''].map(h => (
                            <th key={h} style={{ textAlign: 'left', padding: '6px 8px', fontSize: 10, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', borderBottom: '1px solid #E5E7EB' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {r.ots.map(o => (
                          <tr key={o.id} style={{ borderBottom: '1px solid #F3F4F6', cursor: 'pointer' }}
                              onClick={() => setModalOrden(o)}>
                            <td style={{ padding: '8px', fontFamily: 'monospace', fontWeight: 700, color: '#0F172A' }}>{o.ot}</td>
                            <td style={{ padding: '8px', color: ESTADO_COLOR[o.estado], fontWeight: 600 }}>{o.estado}</td>
                            <td style={{ padding: '8px', color: '#475569' }}>{o.prioridad}</td>
                            <td style={{ padding: '8px', color: '#475569' }}>{o.rubro || '—'}</td>
                            <td style={{ padding: '8px', color: '#475569' }}>{o.porcentaje_avance ?? 0}%</td>
                            <td style={{ padding: '8px', color: '#94A3B8', fontSize: 11 }}>›</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {modalOrden && (
        <ModalDetalleOT
          orden={modalOrden}
          proyectoId={modalOrden.proyecto_id}
          onClose={() => setModalOrden(null)}
          onGuardado={() => { setModalOrden(null); cargarTodasLasOrdenes(); }}
        />
      )}
    </div>
  );
}
