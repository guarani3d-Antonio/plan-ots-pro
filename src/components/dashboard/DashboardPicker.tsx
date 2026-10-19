import { useEffect, useId, useRef, useState } from 'react';
import { normalized, type PersonalBoard } from '../../services/personalDashboardModel';
import s from './PersonalDashboard.module.css';

export function DashboardPicker({ boards, active, defaultId, disabled, canCreate, onSelect, onNew }: { boards: PersonalBoard[]; active: string; defaultId: string; disabled: boolean; canCreate: boolean; onSelect: (id: string) => void; onNew: () => void }) {
  const [opened, setOpened] = useState<string[]>([]), [searching, setSearching] = useState(false);
  const ids = [...new Set([...opened.filter(id => boards.some(b => b.id === id)), active])].slice(-4);
  function choose(id: string) { setOpened([...new Set([...ids, id])].slice(-4)); onSelect(id); setSearching(false); }
  function close(id: string) { const rest = ids.filter(key => key !== id); if (!rest.length) return; setOpened(rest); if (id === active) onSelect(rest.at(-1)!); }
  return <div className={s.boardPicker} aria-label="Navegación de dashboards">
    <div className={s.boardTabs} role="tablist" aria-label="Dashboards abiertos">{ids.map(id => { const board = boards.find(b => b.id === id)!; return <div className={s.boardTab} key={id} data-active={id === active}>
      <button role="tab" aria-selected={id === active} disabled={disabled} title={board.name} onClick={() => choose(id)}>{board.name}{id === defaultId ? ' ★' : ''}</button>
      {ids.length > 1 && <button aria-label={'Cerrar pestaña '+board.name} title="Cerrar pestaña; conserva el dashboard" disabled={disabled} onClick={() => close(id)}>×</button>}
    </div>; })}</div>
    <button aria-label="Buscar dashboards" disabled={disabled} onClick={() => setSearching(true)}>Buscar dashboards <span>{boards.length}</span></button>
    <button aria-label="Nuevo dashboard" disabled={disabled || !canCreate} onClick={onNew}>+ Nuevo</button>
    {searching && <SearchDashboards boards={boards} active={active} canCreate={canCreate} onSelect={choose} onClose={() => setSearching(false)} onNew={() => { setSearching(false); onNew(); }} />}
  </div>;
}
function SearchDashboards({ boards, active, canCreate, onSelect, onClose, onNew }: { boards: PersonalBoard[]; active: string; canCreate: boolean; onSelect: (id: string) => void; onClose: () => void; onNew: () => void }) {
  const [query, setQuery] = useState(''), ref = useRef<HTMLDialogElement>(null), id = useId();
  useEffect(() => { const el = ref.current; if (el && !el.open) el.showModal(); return () => { if (el?.open) el.close(); }; }, []);
  const filtered = boards.filter(b => normalized(b.name).includes(normalized(query.trim())));
  return <dialog ref={ref} className={`${s.dialog} ${s.searchBoards}`} aria-labelledby={id} onCancel={e => { e.preventDefault(); onClose(); }}>
    <header><h2 id={id}>Mis dashboards</h2><button aria-label="Cerrar búsqueda de dashboards" onClick={onClose}>×</button></header>
    <div className={s.listBody}><label>Buscar por nombre<input autoFocus type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Nombre del dashboard…" /></label><p>{filtered.length} de {boards.length} dashboards · privados de tu cuenta</p>
      <div className={s.boardResults}>{filtered.map(b => <button key={b.id} aria-current={b.id === active ? 'page' : undefined} onClick={() => onSelect(b.id)}><span><strong>{b.name}</strong><small>{b.blocks.length} bloques{b.filters.from || b.filters.to ? ` · ${b.filters.from || 'Inicio'} → ${b.filters.to || 'Sin límite'}` : ''}</small></span><span>{b.id === active ? 'Abierto' : 'Abrir →'}</span></button>)}{!filtered.length && <p>No hay dashboards con ese nombre.</p>}</div>
      <footer><button className={s.primary} disabled={!canCreate} onClick={onNew}>+ Nuevo dashboard</button></footer>
    </div>
  </dialog>;
}
