import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useAuthStore } from '../../stores/authStore';
import { useAssistantStore } from '../../stores/assistantStore';
import { normalizeAssistantText } from '../../services/assistantCommands';
import { loadDashboardData } from '../../services/dashboardDataService';
import { loadPersonalDashboards, savePersonalDashboards, type PersonalDashboardState } from '../../services/personalDashboardService';
import {
  STATUS_COLORS, PALETTE, TYPE_LABELS, GROUP_LABELS, CONDITION_LABELS, blankFilters, newBlock, createBoard,
  validateDocument, localDay, filterOrders, blockOrders, groupOrders, measureOrders, groupColor, responsibleKey, contractorNames, normalized,
  type DashboardDocument, type PersonalBoard, type DashboardBlock, type DashboardFilters, type DashboardGroup,
} from '../../services/personalDashboardModel';
import type { OrdenLocal } from '../../types/orden';
import type { Proyecto } from '../../stores/proyectosStore';
import { ModalDetalleOT } from '../grilla/ModalDetalleOT';
import { ModalInformeOT } from '../informes/ModalInformeOT';
import type { TipoDocumento } from '../../services/documentService';
import styles from './PersonalDashboard.module.css';

const LIVE = { data: loadDashboardData, load: loadPersonalDashboards, save: savePersonalDashboards };
export default function PersonalDashboard({ onLegacy }: { onLegacy: () => void }) {
  const user = useAuthStore(s => s.user);
  return user ? <DashboardWorkspace key={user.id} userId={user.id} services={LIVE} onLegacy={onLegacy} /> : <p role="status">Iniciá sesión para consultar tus dashboards.</p>;
}
export interface DashboardServices {
  data: () => Promise<{ ordenes: OrdenLocal[]; proyectos: Proyecto[] }>;
  load: (userId: string) => Promise<PersonalDashboardState>;
  save: (userId: string, document: DashboardDocument, revision: number) => Promise<PersonalDashboardState>;
}
type Drilldown = { title: string; orders: OrdenLocal[] };
export function DashboardWorkspace({ userId, services, onLegacy }: { userId: string; services: DashboardServices; onLegacy?: () => void }) {
  const [saved, setSaved] = useState<PersonalDashboardState | null>(null);
  const [document, setDocument] = useState<DashboardDocument | null>(null);
  const [selected, setSelected] = useState('');
  const [data, setData] = useState<{ ordenes: OrdenLocal[]; proyectos: Proyecto[] }>({ ordenes: [], proyectos: [] });
  const [loading, setLoading] = useState(true), [error, setError] = useState(''), [message, setMessage] = useState('');
  const [editing, setEditing] = useState(false), [busy, setBusy] = useState(false), [reload, setReload] = useState(0);
  const [moreFilters, setMoreFilters] = useState(false), [block, setBlock] = useState<DashboardBlock | null>(null);
  const [dragged, setDragged] = useState<string | null>(null);
  const [newBoard, setNewBoard] = useState(false), [drill, setDrill] = useState<Drilldown | null>(null);
  const [drillQuery, setDrillQuery] = useState('');
  const [order, setOrder] = useState<OrdenLocal | null>(null);
  const [report, setReport] = useState<{ tipo: TipoDocumento; documentoId?: string } | null>(null);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    let current = true; setLoading(true); setError('');
    Promise.all([services.data(), services.load(userId)]).then(([rows, state]) => {
      if (!current) return;
      setData(rows); setSaved(state); setDocument(structuredClone(state.document)); setSelected(state.document.defaultId); setEditing(false);
    }).catch(e => { if (current) setError(e instanceof Error ? e.message : 'No se pudo cargar el dashboard.'); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [userId, services, reload]);
  const dirty = !!document && !!saved && JSON.stringify(document) !== JSON.stringify(saved.document);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    if (dirty) window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  const board = document?.boards.find(b => b.id === selected) ?? document?.boards[0];
  const updateBoard = (change: Partial<PersonalBoard>) => setDocument(d => d && ({ ...d, boards: d.boards.map(b => b.id === board?.id ? { ...b, ...change } : b) }));
  const updateFilters = (change: Partial<DashboardFilters>) => { if (board) updateBoard({ filters: { ...board.filters, ...change } }); };
  const rows = useMemo(() => board ? filterOrders(data.ordenes, data.proyectos, board.filters) : [], [board, data]);
  const options = useMemo(() => ({
    rubros: [...new Set(data.ordenes.map(o => o.rubro).filter(Boolean))].sort(),
    contractors: [...new Set(data.ordenes.flatMap(contractorNames))].sort(),
    people: [...new Map(data.ordenes.map(o => [responsibleKey(o), o.responsable?.trim() || 'Sin asignar'])).entries()].sort((a, b) => a[1].localeCompare(b[1], 'es')),
  }), [data.ordenes]);
  const assistantRequest = useAssistantStore(s => s.dashboardRequest);
  useEffect(() => {
    if (!assistantRequest || !board || loading) return;
    const store = useAssistantStore.getState();
    const request = assistantRequest.value;
    const append = (content: string) => store.append({ role: 'assistant', content });
    const clear = () => useAssistantStore.setState({ dashboardRequest: null });
    if (editing) { append('Terminá o cancelá la edición del dashboard antes de cambiar sus filtros.'); clear(); return; }
    const patch: Partial<DashboardFilters> = {};
    if (request.reset === 'all') Object.assign(patch, blankFilters());
    else if (request.reset === 'estado') patch.estado = '';
    if (request.estado) patch.estado = request.estado;
    if (request.rubro) {
      const matches = options.rubros.filter(r => normalizeAssistantText(r) === normalizeAssistantText(request.rubro!));
      if (matches.length !== 1) { append('No encontré un rubro único para aplicar ese filtro.'); clear(); return; }
      patch.rubro = matches[0];
    }
    updateFilters(patch); append('Filtros aplicados a tu dashboard personal.'); clear();
    // Requests are consumed once; UI changes must not replay them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assistantRequest, loading, editing, !!board, options.rubros]);

  async function persist() {
    if (!document || !saved || busy) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const state = await services.save(userId, validateDocument(document), saved.revision);
      if (mounted.current) { setSaved(state); setDocument(structuredClone(state.document)); setEditing(false); setMessage('Dashboard guardado · solo para tu cuenta.'); }
    } catch (e) { if (mounted.current) setError(e instanceof Error ? e.message : 'No se pudo guardar.'); }
    finally { if (mounted.current) setBusy(false); }
  }
  function discard() {
    if (!saved) return;
    setDocument(structuredClone(saved.document)); if (!saved.document.boards.some(b => b.id === selected)) setSelected(saved.document.defaultId);
    setEditing(false); setBlock(null); setError(''); setMessage('Cambios descartados.');
  }
  function switchBoard(id: string) {
    if (editing) return;
    setSelected(id); setMessage(''); setError('');
  }
  function move(id: string, delta: number) {
    if (!board) return; const blocks = [...board.blocks], from = blocks.findIndex(b => b.id === id), to = from + delta;
    if (to < 0 || to >= blocks.length) return;
    [blocks[from], blocks[to]] = [blocks[to], blocks[from]]; updateBoard({ blocks });
  }
  function dropBlock(target: string) {
    if (!board || !dragged || busy || !editing) return;
    const blocks = [...board.blocks], from = blocks.findIndex(b => b.id === dragged), to = blocks.findIndex(b => b.id === target);
    if (from >= 0 && to >= 0 && from !== to) { const [moving] = blocks.splice(from, 1); blocks.splice(to, 0, moving); updateBoard({ blocks }); }
    setDragged(null);
  }
  function duplicate() {
    if (!board || !document || document.boards.length >= 20) return;
    const copy = { ...structuredClone(board), id: crypto.randomUUID(), name: `${board.name.slice(0, 70)} · copia`, blocks: board.blocks.map(b => ({ ...structuredClone(b), id: crypto.randomUUID() })) };
    setDocument({ ...document, boards: [...document.boards, copy] }); setSelected(copy.id); setEditing(true);
  }
  function removeBoard() {
    if (!document || !board || document.boards.length < 2) return;
    const boards = document.boards.filter(b => b.id !== board.id);
    setDocument({ ...document, boards, defaultId: document.defaultId === board.id ? boards[0].id : document.defaultId });
    setSelected(boards[0].id); setEditing(true); setMessage(`«${board.name}» quitado del borrador. Guardá para confirmar o cancelá para recuperarlo.`);
  }
  function exportCSV() {
    const fields = [['OT', 'Estado', 'Rubro', 'Responsable', 'Contratistas', 'Ingreso', 'Fin de trabajos registrado'], ...rows.map(o => [o.ot, o.estado, o.rubro, o.responsable, contractorNames(o).join(' / '), o.fecha_ingreso || o.created_at?.slice(0, 10), o.fecha_fin_trabajos])];
    const csv = fields.map(row => row.map(v => `"${String(v ?? '').replace(/^[=+\-@\t\r]/, "'$&").replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' }));
    const a = window.document.createElement('a'); a.href = url; a.download = 'dashboard-ot.csv'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  if (!board || !document || !saved) return <section className={styles.page}><h1>Mis dashboards</h1>{loading ? <p role="status">Cargando tus dashboards y las OT autorizadas…</p> : <><p role="alert">{error}</p><button onClick={() => setReload(n => n + 1)}>Reintentar</button>{onLegacy && <button onClick={onLegacy}>Resumen general anterior</button>}</>}</section>;
  const f = board.filters;
  function openDrill(next: Drilldown) { setDrillQuery(''); setDrill(next); }
  const invalidRange = !!f.from && !!f.to && f.from > f.to;
  return <section className={styles.page} aria-label="Dashboards personales" aria-busy={loading || busy}>
    <header className={styles.header}><div><span className={styles.eyebrow}>MI ESPACIO · SOLO YO</span><h1>Mis dashboards</h1></div>
      <div className={styles.actions}>
        <label className={styles.srOnly} htmlFor="personal-board">Dashboard</label><select id="personal-board" value={board.id} disabled={editing || busy} onChange={e => switchBoard(e.target.value)}>{document.boards.map(b => <option key={b.id} value={b.id}>{b.name}{document.defaultId === b.id ? ' ★' : ''}</option>)}</select>
        {!editing && <><button onClick={() => setNewBoard(true)} disabled={busy || document.boards.length >= 20}>+ Nuevo</button><button className={styles.primary} disabled={busy} onClick={() => { setEditing(true); setMessage(''); }}>Editar dashboard</button>
          <details className={styles.menu}><summary aria-label="Más opciones del dashboard">···</summary><div><button onClick={duplicate} disabled={busy || document.boards.length >= 20}>Duplicar dashboard</button><button disabled={busy || document.boards.length < 2} onClick={removeBoard}>Quitar dashboard</button><button onClick={exportCSV}>Exportar OT · CSV</button>{onLegacy && <button disabled={dirty} onClick={onLegacy}>Resumen y exportaciones anteriores</button>}<button disabled={dirty || busy} onClick={() => setReload(n => n + 1)}>Actualizar datos</button></div></details></>}
      </div>
    </header>
    <div className={styles.filters} aria-label="Filtros del dashboard">
      <label>Obra<select value={f.project} disabled={busy} onChange={e => updateFilters({ project: e.target.value })}><option value="">Todas las obras autorizadas</option>{data.proyectos.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select></label>
      <label>Rubro<select value={f.rubro} disabled={busy} onChange={e => updateFilters({ rubro: e.target.value })}><option value="">Todos los rubros</option>{options.rubros.map(v => <option key={v}>{v}</option>)}</select></label>
      <label>Período<select aria-label="Período" disabled={busy} value="" onChange={e => { const today = new Date(); const end = localDay(today); if (e.target.value === 'all') updateFilters({ from: '', to: '' }); else { if (e.target.value === 'month') today.setDate(1); else today.setDate(today.getDate() - Number(e.target.value) + 1); updateFilters({ from: localDay(today), to: end }); } }}><option value="" disabled>{f.from || f.to ? 'Intervalo personalizado' : 'Todo el período'}</option><option value="all">Todo el período</option><option value="month">Este mes</option><option value="30">Últimos 30 días</option><option value="90">Últimos 90 días</option></select></label>
      <label className={styles.search}>Buscar<input type="search" placeholder="OT, persona, ubicación…" value={f.search} disabled={busy} onChange={e => updateFilters({ search: e.target.value })} /></label>
      <button aria-expanded={moreFilters} onClick={() => setMoreFilters(v => !v)}>Más filtros</button><button disabled={busy} onClick={() => updateBoard({ filters: blankFilters() })}>Limpiar</button>
      {moreFilters && <div className={styles.extra}>
        <label>Estado<select value={f.estado} disabled={busy} onChange={e => updateFilters({ estado: e.target.value })}><option value="">Todos</option>{Object.keys(STATUS_COLORS).map(v => <option key={v}>{v}</option>)}</select></label>
        <label>Responsable<select value={f.responsible} disabled={busy} onChange={e => updateFilters({ responsible: e.target.value })}><option value="">Todos</option>{options.people.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
        <label>Contratista<select value={f.contractor} disabled={busy} onChange={e => updateFilters({ contractor: e.target.value })}><option value="">Todos</option>{options.contractors.map(v => <option key={v}>{v}</option>)}</select></label>
        <label>Fecha de referencia<select value={f.dateField} disabled={busy} onChange={e => updateFilters({ dateField: e.target.value as DashboardFilters['dateField'] })}><option value="ingreso">Ingreso</option><option value="fin">Fin de trabajos registrado</option></select></label>
        <label>Desde<input type="date" value={f.from} disabled={busy} onChange={e => updateFilters({ from: e.target.value })} /></label><label>Hasta<input type="date" value={f.to} disabled={busy} onChange={e => updateFilters({ to: e.target.value })} /></label>
      </div>}
    </div>
    <div className={styles.context}><span>{rows.length} OT únicas · {f.from || 'Sin fecha inicial'} → {f.to || 'Hoy y posteriores'} · {f.dateField === 'ingreso' ? 'Ingreso' : 'Fin registrado'}</span>{dirty && !editing && <button disabled={busy || invalidRange} onClick={persist}>Guardar esta vista</button>}</div>
    {invalidRange && <p role="alert">La fecha inicial debe ser anterior o igual a la final.</p>}
    {error && <div className={styles.notice} role="alert">{error}<button disabled={busy} onClick={() => { if (!dirty || confirm('¿Descartar los cambios de esta ventana y cargar la versión guardada?')) { setEditing(false); setReload(n => n + 1); } }}>Descartar y recargar</button></div>}
    {(message || busy || loading) && <p className={styles.notice} role="status">{busy ? 'Guardando…' : loading ? 'Actualizando…' : message}</p>}
    {editing && <div className={styles.editbar}>
      <label>Nombre<input maxLength={80} value={board.name} disabled={busy} onChange={e => updateBoard({ name: e.target.value })} /></label>
      <label className={styles.check}><input type="checkbox" checked={document.defaultId === board.id} disabled={busy} onChange={e => { if (e.target.checked) setDocument({ ...document, defaultId: board.id }); }} /> Abrir al ingresar</label>
      <button disabled={busy || board.blocks.length >= 30} onClick={() => setBlock(newBlock())}>+ Agregar bloque</button>
      <div className={styles.actions}><button disabled={busy} onClick={discard}>Cancelar edición</button><button className={styles.primary} disabled={busy || invalidRange || !board.name.trim()} onClick={persist}>Guardar dashboard</button></div>
    </div>}
    {!board.blocks.length && <div className={styles.empty}>Tu dashboard está listo para personalizar. {editing ? <button onClick={() => setBlock(newBlock())}>Agregar primer bloque</button> : <button onClick={() => setEditing(true)}>Elegir indicadores y gráficos</button>}</div>}
    <div className={styles.grid}>
      {board.blocks.map((b, index) => {
        const source = blockOrders(rows, b), groups = groupOrders(source, data.proyectos, b), metric = measureOrders(source, b, data.proyectos);
        const accent = b.colors.accent ?? (b.condition === 'closed' ? STATUS_COLORS.Cerrada : b.condition === 'pending' ? STATUS_COLORS.Pendiente : b.condition === 'progress' ? STATUS_COLORS['En proceso'] : PALETTE[0]);
        return <article key={b.id} className={`${styles.card} ${b.type === 'metric' ? styles.metricCard : ''}`} style={{ '--span': b.width, '--block-accent': accent } as CSSProperties} onDragOver={e => { if (editing && dragged && !busy) e.preventDefault(); }} onDrop={e => { e.preventDefault(); dropBlock(b.id); }}>
          <div className={styles.cardHeader}><h2>{b.title}</h2>{editing && <div className={styles.tools}><button aria-label={`Arrastrar ${b.title}`} title="Arrastrá para ordenar o usá las flechas" disabled={busy} draggable onDragStart={e => { e.dataTransfer.setData('text/plain', b.id); e.dataTransfer.effectAllowed = 'move'; setDragged(b.id); }} onDragEnd={() => setDragged(null)}>⠿</button><button aria-label={`Mover ${b.title} antes`} disabled={busy || index === 0} onClick={() => move(b.id, -1)}>←</button><button aria-label={`Mover ${b.title} después`} disabled={busy || index === board.blocks.length - 1} onClick={() => move(b.id, 1)}>→</button><button aria-label={`Configurar ${b.title}`} disabled={busy} onClick={() => setBlock(structuredClone(b))}>Editar</button><button aria-label={`Quitar ${b.title}`} disabled={busy} onClick={() => updateBoard({ blocks: board.blocks.filter(v => v.id !== b.id) })}>×</button></div>}</div>
          {b.type === 'metric' ? <button className={styles.metric} onClick={() => openDrill({ title: b.title, orders: source })}><strong>{metric.value === null ? '—' : metric.value.toLocaleString('es-PY')}{b.measure === 'duration' && metric.value !== null ? ' d' : ''}</strong><span>{b.measure === 'entities' ? 'Categorías con OT' : CONDITION_LABELS[b.condition]} · ver {source.length} OT</span></button> : <DashboardChart block={b} groups={groups} onSelect={g => openDrill({ title: `${b.title} · ${g.label}`, orders: g.orders })} />}
          {b.measure === 'duration' && <p className={styles.footnote}>Ingreso → fin registrado, inclusive. {metric.sample} cerradas con fechas válidas; no acredita ejecución.</p>}
          {b.group === 'contratista' && b.type !== 'metric' && <p className={styles.footnote}>Una OT puede vincular varios contratistas. {source.length} OT únicas; las asignaciones no se suman como OT distintas.</p>}
          {b.group === 'semana' && <p className={styles.footnote}>Semanas con ingresos · lunes a domingo. Las OT sin fecha válida no forman puntos.</p>}
          {b.condition === 'overdue' && <p className={styles.footnote}>Solo activas con fecha de fin registrada anterior a hoy.</p>}
        </article>;
      })}
    </div>
    <p className={styles.footnote}>Preferencias privadas por cuenta · datos de las obras autorizadas · los gráficos no modifican las OT.</p>
    {newBoard && <NewBoardDialog onClose={() => setNewBoard(false)} onCreate={(name, empty) => { const next = createBoard(name, empty); setDocument({ ...document, boards: [...document.boards, next] }); setSelected(next.id); setEditing(true); setNewBoard(false); }} />}
    {block && <BlockEditor block={block} rubros={options.rubros} rows={rows} projects={data.proyectos} onClose={() => setBlock(null)} onApply={next => { const exists = board.blocks.some(b => b.id === next.id); updateBoard({ blocks: exists ? board.blocks.map(b => b.id === next.id ? next : b) : [...board.blocks, next] }); setBlock(null); }} />}
    {drill && !order && <OrderList drill={drill} query={drillQuery} setQuery={setDrillQuery} onClose={() => setDrill(null)} onSelect={setOrder} />}
    {order && <ModalDetalleOT orden={order} proyectoId={order.proyecto_id} onClose={() => { setOrder(null); setReport(null); }} onGuardado={() => { setOrder(null); setReload(n => n + 1); }} onVerInforme={(tipo, documentoId) => setReport({ tipo, documentoId })} />}
    {order && report && <ModalInformeOT isOpen orden={order} proyectoNombre={data.proyectos.find(p => p.id === order.proyecto_id)?.nombre ?? 'Obra'} tipo={report.tipo} documentoInicialId={report.documentoId} soloVistaPrevia onClose={() => setReport(null)} />}
  </section>;
}

function DashboardChart({ block: b, groups, onSelect }: { block: DashboardBlock; groups: DashboardGroup[]; onSelect: (g: DashboardGroup) => void }) {
  const max = Math.max(1, ...groups.map(g => g.value ?? 0));
  const sum = groups.reduce((s, g) => s + (g.value ?? 0), 0);
  const valueLabel = (g: DashboardGroup) => g.value === null ? 'Sin datos' : `${g.value.toLocaleString('es-PY')}${b.measure === 'duration' ? ' d' : ''}`;
  if (!groups.length) return <p className={styles.emptyChart}>Sin OT para esta selección.</p>;
  const legend = <ul className={styles.legend}>{groups.map((g, i) => <li key={g.key}><button onClick={() => onSelect(g)}><i style={{ background: groupColor(b, g.key, i) }} /><span>{g.label}</span><strong>{valueLabel(g)}</strong></button></li>)}</ul>;
  if (b.type === 'pie' || b.type === 'donut') {
    if (b.measure !== 'count') return <><p className={styles.footnote}>Las proporciones requieren cantidad de OT. Elegí esa medida o usá barras para promedios.</p>{legend}</>;
    let offset = 0;
    const stops = groups.map((g, i) => { const from = offset; offset += (g.value ?? 0) / (sum || 1) * 100; return `${groupColor(b, g.key, i)} ${from}% ${offset}%`; });
    return <div className={styles.roundChart}><div className={`${styles.disc} ${b.type === 'donut' ? styles.donut : ''}`} role="img" aria-label={`${TYPE_LABELS[b.type]}: ${groups.map(g => `${g.label} ${valueLabel(g)}`).join(', ')}`} style={{ background: `conic-gradient(${stops.join(',')})` }}>{b.type === 'donut' && <span>{sum}<small>{b.group === 'contratista' ? 'asignaciones' : 'OT'}</small></span>}</div>{legend}</div>;
  }
  if (b.type === 'line') {
    const height = 155, width = Math.max(440, groups.length * 50), point = (g: DashboardGroup, i: number) => `${24 + i * (width - 48) / Math.max(1, groups.length - 1)},${height - 24 - (g.value ?? 0) / max * (height - 48)}`;
    // Null averages are gaps, not invented zero measurements.
    const paths: string[] = []; let current = '';
    groups.forEach((g, i) => { if (g.value === null) { if (current) paths.push(current); current = ''; } else current += `${current ? ' L' : 'M'}${point(g, i)}`; }); if (current) paths.push(current);
    return <><div className={styles.lineScroll}><svg width={width} height={height} role="img" aria-label={b.title}>{paths.map((d, i) => <path key={i} d={d} fill="none" stroke={b.colors.accent ?? PALETTE[0]} strokeWidth="3" />)}{groups.map((g, i) => g.value === null ? null : <g key={g.key}><circle cx={point(g, i).split(',')[0]} cy={point(g, i).split(',')[1]} r="5" fill={groupColor(b, g.key, i)} /><text x={point(g, i).split(',')[0]} y={Number(point(g, i).split(',')[1]) - 10} textAnchor="middle" fill="currentColor" fontSize="11">{g.value}</text></g>)}</svg></div>{legend}</>;
  }
  if (b.type === 'table') return <div className={styles.chartScroll}><table><thead><tr><th>{GROUP_LABELS[b.group]}</th><th>{b.measure === 'duration' ? 'Días' : 'Cantidad'}</th><th>OT únicas</th></tr></thead><tbody>{groups.map(g => <tr key={g.key}><td><button className={styles.link} onClick={() => onSelect(g)}>{g.label}</button></td><td>{valueLabel(g)}</td><td>{g.orders.length}</td></tr>)}</tbody></table></div>;
  return <div className={styles.chartScroll}>{groups.map((g, i) => <button key={g.key} className={styles.barRow} onClick={() => onSelect(g)} aria-label={`${g.label}: ${valueLabel(g)}. Ver OT`}><span>{g.label}</span><span className={styles.barTrack}><i style={{ width: `${(g.value ?? 0) / max * 100}%`, background: groupColor(b, g.key, i) }} /></span><strong>{valueLabel(g)}</strong></button>)}</div>;
}
function Dialog({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null), titleId = useId();
  useEffect(() => { const el = ref.current; if (el?.isConnected && !el.open) el.showModal(); return () => { if (el?.open) el.close(); }; }, []);
  return <dialog ref={ref} aria-labelledby={titleId} className={styles.dialog} onCancel={e => { e.preventDefault(); onClose(); }}><header><h2 id={titleId}>{title}</h2><button aria-label={`Cerrar ${title}`} onClick={onClose}>×</button></header>{children}</dialog>;
}
function NewBoardDialog({ onClose, onCreate }: { onClose: () => void; onCreate: (name: string, empty: boolean) => void }) {
  const [name, setName] = useState('Mi dashboard'), [empty, setEmpty] = useState(false);
  return <Dialog title="Nuevo dashboard personal" onClose={onClose}><form onSubmit={e => { e.preventDefault(); if (name.trim()) onCreate(name.trim(), empty); }}><label>Nombre<input autoFocus maxLength={80} required value={name} onChange={e => setName(e.target.value)} /></label><label>Comenzar con<select value={String(empty)} onChange={e => setEmpty(e.target.value === 'true')}><option value="false">Seguimiento de obra · 8 bloques</option><option value="true">Dashboard vacío</option></select></label><footer><button type="button" onClick={onClose}>Cancelar</button><button className={styles.primary}>Crear dashboard</button></footer></form></Dialog>;
}
function BlockEditor({ block, rubros, rows, projects, onClose, onApply }: { block: DashboardBlock; rubros: string[]; rows: OrdenLocal[]; projects: Proyecto[]; onClose: () => void; onApply: (b: DashboardBlock) => void }) {
  const [b, setB] = useState(block), [search, setSearch] = useState('');
  const groups = groupOrders(blockOrders(rows, b), projects, b);
  const patch = (change: Partial<DashboardBlock>) => setB(current => ({ ...current, ...change }));
  const colors = b.group === 'estado' ? Object.keys(STATUS_COLORS).map(key => ({ key, label: key })) : groups.filter(g => normalized(g.label).includes(normalized(search))).map(g => ({ key: g.key, label: g.label }));
  return <Dialog title="Configurar bloque" onClose={onClose}><form onSubmit={e => { e.preventDefault(); if (b.title.trim()) onApply({ ...b, title: b.title.trim() }); }}>
    <label>Título<input autoFocus required maxLength={100} value={b.title} onChange={e => patch({ title: e.target.value })} /></label>
    <div className={styles.formGrid}><label>Visualización<select value={b.type} onChange={e => patch({ type: e.target.value as DashboardBlock['type'], measure: ['pie', 'donut'].includes(e.target.value) ? 'count' : b.measure })}>{Object.entries(TYPE_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><label>Agrupar por<select value={b.group} onChange={e => { patch({ group: e.target.value as DashboardBlock['group'] }); }}>{Object.entries(GROUP_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
    <label>Medida<select value={b.measure} onChange={e => patch({ measure: e.target.value as DashboardBlock['measure'] })}><option value="count">Cantidad de OT</option>{!['pie', 'donut'].includes(b.type) && <><option value="entities">Categorías distintas con OT</option><option value="duration">Duración registrada · cerradas</option></>}</select></label><label>Condición<select value={b.condition} onChange={e => patch({ condition: e.target.value as DashboardBlock['condition'] })}>{Object.entries(CONDITION_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
    <label>Ancho<select value={b.width} onChange={e => patch({ width: Number(e.target.value) as DashboardBlock['width'] })}><option value="3">¼ de fila</option><option value="6">½ fila</option><option value="12">Fila completa</option></select></label><label>Rubro de este bloque<select value={b.rubro} onChange={e => patch({ rubro: e.target.value })}><option value="">Todos dentro del filtro general</option>{rubros.map(r => <option key={r}>{r}</option>)}</select></label></div>
    <fieldset><legend>Colores del bloque</legend><ColorControl label="principal" value={b.colors.accent ?? PALETTE[0]} onChange={color => patch({ colors: { ...b.colors, accent: color } })} />
      {b.group !== 'estado' && <label>Buscar categoría<input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Nombre de rubro, persona u obra…" /></label>}
      <div className={styles.colorList}>{colors.map(({ key, label }, i) => <ColorControl key={key} label={label} value={groupColor(b, key, i)} onChange={color => patch({ colors: { ...b.colors, [key]: color } })} />)}</div><button type="button" onClick={() => patch({ colors: {} })}>Restablecer colores</button>
    </fieldset><p className={styles.footnote}>Los filtros de este bloque se combinan con los filtros generales. Los colores se guardan solo en este bloque.</p>
    <footer><button type="button" onClick={onClose}>Cancelar</button><button className={styles.primary}>Aplicar bloque</button></footer>
  </form></Dialog>;
}
function ColorControl({ label, value, onChange }: { label: string; value: string; onChange: (color: string) => void }) {
  const [hex, setHex] = useState(value);
  useEffect(() => setHex(value), [value]);
  return <div className={styles.colorRow}><span>{label === 'principal' ? 'Color principal' : label}</span><div className={styles.colorInputs}>
    <input type="color" aria-label={`Color ${label}`} value={value} onInput={e => onChange(e.currentTarget.value)} onChange={e => onChange(e.target.value)} />
    <input type="text" aria-label={`Código de color ${label}`} value={hex} maxLength={7} pattern="#[0-9a-fA-F]{6}" placeholder="#9BCB24" onChange={e => { setHex(e.target.value); if (/^#[0-9a-f]{6}$/i.test(e.target.value)) onChange(e.target.value); }} onBlur={() => { if (!/^#[0-9a-f]{6}$/i.test(hex)) setHex(value); }} />
  </div></div>;
}
function OrderList({ drill, query, setQuery, onClose, onSelect }: { drill: Drilldown; query: string; setQuery: (v: string) => void; onClose: () => void; onSelect: (o: OrdenLocal) => void }) {
  const filtered = drill.orders.filter(o => normalized(`${o.ot} ${o.descripcion || ''} ${o.rubro} ${o.responsable}`).includes(normalized(query)));
  return <Dialog title={drill.title} onClose={onClose}><div className={styles.listBody}><label>Buscar en las OT del indicador<input type="search" value={query} onChange={e => setQuery(e.target.value)} /></label><p>{filtered.length} de {drill.orders.length} OT únicas</p><div className={styles.orderList}>{filtered.map(o => <button key={o.id} onClick={() => onSelect(o)}><span><strong>{o.ot}</strong> · {o.rubro}<small>{o.descripcion || o.ubicacion || 'Sin descripción'} · {o.responsable || 'Sin asignar'}</small></span><span>{o.estado} →</span></button>)}</div></div></Dialog>;
}
