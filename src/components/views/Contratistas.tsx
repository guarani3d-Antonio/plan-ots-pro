import { useAccessStore } from '../../stores/accessStore';
import { cargarContratistas, agregarContratistaCompartido } from '../../services/trustService';
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

function topDe<T extends string>(arr: T[]): T | null {
  if (arr.length === 0) return null;
  const c = new Map<T, number>();
  for (const v of arr) c.set(v, (c.get(v) ?? 0) + 1);
  let best: T | null = null, bestN = 0;
  for (const [k, n] of c) { if (n > bestN) { best = k; bestN = n; } }
  return best;
}

export default function Contratistas() {
  const ordenes = useOrdenesStore(s => s.ordenes);
  const cargarTodasLasOrdenes = useOrdenesStore(s => s.cargarTodasLasOrdenes);
  const proyectos = useProyectosStore(s => s.proyectos);
  const cargarProyectos = useProyectosStore(s => s.cargarProyectos);

  const contexto = useAccessStore(s => s.contexto);
  const empresaActiva = useAccessStore(s => s.empresaId);
  const [empresaElegida, setEmpresaElegida] = useState('');
  const empresaId = empresaElegida || empresaActiva || (contexto?.empresas.length === 1 ? contexto.empresas[0].id : '');
  const [errorDirectorio, setErrorDirectorio] = useState<string | null>(null);
  const [guardandoDirectorio, setGuardandoDirectorio] = useState(false);
  const [directorioEmpresa, setDirectorioEmpresa] = useState('');
  const puedeAgregar = !!empresaId && !!contexto && (contexto.creador || contexto.empresas.some(e => e.id === empresaId && e.rol === 'administrador') || contexto.obras.some(o => o.tenant_id === empresaId && o.editar));
  const [filtroProyecto, setFiltroProyecto] = useState('');
  const [nuevoNombre, setNuevoNombre]       = useState('');
  const [directorio, setDirectorio]         = useState<string[]>([]);
  const [expandido, setExpandido]           = useState<string | null>(null);
  const [modalOrden, setModalOrden]         = useState<OrdenLocal | null>(null);

  useEffect(() => {
    cargarProyectos();
    cargarTodasLasOrdenes();
  }, [cargarProyectos, cargarTodasLasOrdenes]);

  useEffect(() => {
    let active = true;
    if (empresaId) cargarContratistas(empresaId).then(rows => {
      if (active) { setDirectorio(rows.map(r => r.nombre)); setDirectorioEmpresa(empresaId); setErrorDirectorio(null); }
    }).catch(e => { if (active) { setDirectorio([]); setErrorDirectorio(e.message); } });
    return () => { active = false; };
  }, [empresaId]);

  const ordenesFiltradas = useMemo(
    () => ordenes.filter(o => (!filtroProyecto || o.proyecto_id === filtroProyecto) && !!empresaId
      && contexto?.obras.some(p => p.id === o.proyecto_id && p.tenant_id === empresaId)),
    [ordenes, filtroProyecto, empresaId, contexto],
  );

  // Mapa contratista → OTs en que aparece (iterando contratistas[]).
  const grupos = useMemo(() => {
    const map = new Map<string, OrdenLocal[]>();
    for (const o of ordenesFiltradas) {
      for (const c of o.contratistas ?? []) {
        if (!map.has(c)) map.set(c, []);
        map.get(c)!.push(o);
      }
    }
    // Incluir contratistas del directorio aunque no tengan OTs aún.
    for (const c of directorioEmpresa === empresaId ? directorio : []) if (!map.has(c)) map.set(c, []);
    return [...map.entries()].map(([nombre, ots]) => {
      const porEstado: Record<string, number> = { Pendiente: 0, 'En proceso': 0, Cerrada: 0, 'No aplica': 0 };
      for (const o of ots) porEstado[o.estado] = (porEstado[o.estado] ?? 0) + 1;
      return {
        nombre,
        total: ots.length,
        porEstado,
        rubroTop: topDe(ots.map(o => o.rubro).filter(Boolean) as string[]),
        ots,
      };
    }).sort((a, b) => b.total - a.total || a.nombre.localeCompare(b.nombre));
  }, [ordenesFiltradas, directorio, directorioEmpresa, empresaId]);

  const agregar = async () => {
    const nombre = nuevoNombre.trim();
    if (!nombre || guardandoDirectorio || !puedeAgregar || directorioEmpresa !== empresaId) return;
    setGuardandoDirectorio(true);
    try {
      const saved = await agregarContratistaCompartido(empresaId, nombre);
      setDirectorio(prev => [...new Set([...prev, saved.nombre])].sort((a,b) => a.localeCompare(b)));
      setDirectorioEmpresa(empresaId); setNuevoNombre(''); setErrorDirectorio(null);
    } catch (e) { setErrorDirectorio(e instanceof Error ? e.message : 'No se pudo guardar el contratista.'); }
    finally { setGuardandoDirectorio(false); }
  };

  return (
    <div style={{ padding: 28, background: '#F9FAFB', minHeight: '100%' }}>
      <header style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14, marginBottom: 18, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0F172A', margin: 0 }}>Contratistas</h1>
          <p style={{ fontSize: 13, color: '#6B7280', margin: '4px 0 0' }}>
            Directorio compartido de la empresa y carga de trabajo asignada.
          </p>
        </div>
        <FiltroProyecto value={filtroProyecto} onChange={setFiltroProyecto} proyectos={proyectos} />
      </header>

      <label>Empresa del directorio <select aria-label="Empresa del directorio" value={empresaId} disabled={guardandoDirectorio} onChange={e => { setEmpresaElegida(e.target.value); setFiltroProyecto(''); }}>
        <option value="">Seleccioná una empresa</option>
        {contexto?.empresas.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
      </select></label>
      {errorDirectorio && <p role="alert">No se pudo consultar o guardar el directorio: {errorDirectorio}</p>}
      {/* Agregar */}
      <section style={{
        background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12,
        padding: 16, marginBottom: 14, display: 'flex', gap: 8, alignItems: 'center',
      }}>
        <input
          type="text" maxLength={160} disabled={guardandoDirectorio || !puedeAgregar || directorioEmpresa !== empresaId}
          placeholder="Nombre del nuevo contratista..."
          value={nuevoNombre}
          onChange={e => setNuevoNombre(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') agregar(); }}
          style={{
            flex: 1, height: 34, padding: '0 12px',
            border: '1px solid #E5E7EB', borderRadius: 8,
            fontSize: 13, color: '#1E293B', outline: 'none', fontFamily: 'inherit',
          }}
        />
        <button
          type="button" onClick={agregar} disabled={!nuevoNombre.trim() || guardandoDirectorio || !puedeAgregar || directorioEmpresa !== empresaId}
          style={{
            height: 34, padding: '0 16px',
            background: '#1E3A5F', color: '#fff', border: 'none',
            borderRadius: 8, fontSize: 13, fontWeight: 700,
            cursor: nuevoNombre.trim() ? 'pointer' : 'not-allowed',
            opacity: nuevoNombre.trim() ? 1 : 0.45,
            fontFamily: 'inherit',
          }}
        >{guardandoDirectorio ? 'Guardando…' : '+ Agregar contratista'}</button>
      </section>

      {/* Cards */}
      {grupos.length === 0 ? (
        <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, padding: 30, textAlign: 'center', color: '#94A3B8', fontSize: 14 }}>
          Sin contratistas todavía. Agregá uno arriba o asigná desde una OT.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 12 }}>
          {grupos.map(g => {
            const isOpen = expandido === g.nombre;
            return (
              <div key={g.nombre} style={{
                background: '#fff', border: '1px solid #E5E7EB',
                borderRadius: 12,
                gridColumn: isOpen ? '1 / -1' : 'auto',
                transition: 'all 0.15s',
                boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
              }}>
                <button
                  type="button"
                  onClick={() => setExpandido(isOpen ? null : g.nombre)}
                  style={{
                    width: '100%', background: 'transparent', border: 'none',
                    padding: 16, cursor: 'pointer', fontFamily: 'inherit',
                    textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 12,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{
                      width: 44, height: 44, borderRadius: '50%',
                      background: colorFromName(g.nombre),
                      color: '#fff', fontSize: 16, fontWeight: 700,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0,
                    }}>{inicial(g.nombre)}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {g.nombre}
                      </div>
                      <div style={{ fontSize: 11, color: '#6B7280' }}>
                        {g.total} {g.total === 1 ? 'OT asignada' : 'OTs asignadas'}
                      </div>
                    </div>
                    <span style={{ fontSize: 12, color: '#94A3B8' }}>{isOpen ? '▴' : '▾'}</span>
                  </div>

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                    {ESTADOS.map(e => {
                      const c = g.porEstado[e] ?? 0;
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
                    <span><strong style={{ color: '#0F172A' }}>Rubro top:</strong> {g.rubroTop ?? '—'}</span>
                  </div>
                </button>

                {isOpen && g.ots.length > 0 && (
                  <div style={{ borderTop: '1px solid #F1F5F9', padding: 12 }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                      <thead>
                        <tr>
                          {['OT', 'Estado', 'Rubro', 'Responsable', 'Avance', ''].map(h => (
                            <th key={h} style={{ textAlign: 'left', padding: '6px 8px', fontSize: 10, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', borderBottom: '1px solid #E5E7EB' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {g.ots.map(o => (
                          <tr key={o.id} style={{ borderBottom: '1px solid #F3F4F6', cursor: 'pointer' }}
                              onClick={() => setModalOrden(o)}>
                            <td style={{ padding: '8px', fontFamily: 'monospace', fontWeight: 700, color: '#0F172A' }}>{o.ot}</td>
                            <td style={{ padding: '8px', color: ESTADO_COLOR[o.estado], fontWeight: 600 }}>{o.estado}</td>
                            <td style={{ padding: '8px', color: '#475569' }}>{o.rubro || '—'}</td>
                            <td style={{ padding: '8px', color: '#475569' }}>{o.responsable || '—'}</td>
                            <td style={{ padding: '8px', color: '#475569' }}>{o.porcentaje_avance ?? 0}%</td>
                            <td style={{ padding: '8px', color: '#94A3B8', fontSize: 11 }}>›</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {isOpen && g.ots.length === 0 && (
                  <div style={{ borderTop: '1px solid #F1F5F9', padding: 16, fontSize: 12, color: '#94A3B8', textAlign: 'center' }}>
                    Sin OTs asignadas a este contratista.
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
