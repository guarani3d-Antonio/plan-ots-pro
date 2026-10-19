import { useEffect, useId, useRef, useState } from 'react';
import { normalized, type PersonalBoard, type ReadingOptions } from '../../services/personalDashboardModel';
import { dashboardReadings, readingCatalog, readingOptions, type OperationalSignal } from '../../services/dashboardOperationalModel';
import type { OrdenLocal } from '../../types/orden';
import type { Proyecto } from '../../stores/proyectosStore';
import s from './PersonalDashboard.module.css';

export function OperationalReading({ board, orders, projects, disabled, onApply, onSelect }: { board: PersonalBoard; orders: OrdenLocal[]; projects: Proyecto[]; disabled: boolean; onApply: (reading: ReadingOptions) => void; onSelect: (signal: OperationalSignal) => void }) {
  const [full, setFull] = useState(false), [configuring, setConfiguring] = useState(false);
  const settings = readingOptions(board), signals = dashboardReadings(orders, projects, board), shown = full ? signals : signals.slice(0, settings.limit);
  return <section className={s.operational} aria-label="Lectura operativa"><header><div><strong>Lectura operativa</strong><span>Según tus filtros y bloques · {signals.length} resúmenes disponibles</span></div><div className={s.readingActions}><button disabled={disabled} onClick={() => setConfiguring(true)}>Personalizar lectura</button>{signals.length > settings.limit && <button aria-expanded={full} onClick={() => setFull(v => !v)}>{full ? 'Contraer lectura' : `Ver todos (${signals.length})`}</button>}</div></header>
    <div>{shown.map(signal => <button key={signal.id} className={s.signal} data-tone={signal.tone} onClick={() => onSelect(signal)}><strong>{settings.labels[signal.id]?.trim() || signal.title}</strong><span>{settings.labels[signal.id]?.trim() ? signal.title + ' · ' : ''}{signal.detail} →</span>{settings.explain && <small>{signal.reason}</small>}</button>)}</div>
    {!signals.length && <p className={s.footnote}>Los temas elegidos no tienen coincidencias en este alcance. Podés agregar resúmenes de tus gráficos o revisar los filtros; esto no acredita ausencia de problemas.</p>}
    {signals.length > shown.length && <p className={s.footnote}>{signals.length - shown.length} resúmenes más disponibles. Ampliá la lectura cuando lo necesites.</p>}
    {configuring && <ReadingEditor board={board} onClose={() => setConfiguring(false)} onApply={next => { onApply(next); setConfiguring(false); setFull(false); }} />}
  </section>;
}
function ReadingEditor({ board, onClose, onApply }: { board: PersonalBoard; onClose: () => void; onApply: (next: ReadingOptions) => void }) {
  const [draft, setDraft] = useState(() => structuredClone(readingOptions(board))), [query, setQuery] = useState('');
  const ref = useRef<HTMLDialogElement>(null), id = useId();
  useEffect(() => { const el = ref.current; if (el && !el.open) el.showModal(); return () => { if (el?.open) el.close(); }; }, []);
  const catalog = readingCatalog(board), filtered = catalog.filter(item => normalized(item.label + ' ' + (draft.labels[item.id] || '')).includes(normalized(query)));
  return <dialog ref={ref} className={`${s.dialog} ${s.readingEditor}`} aria-labelledby={id} onCancel={e => { e.preventDefault(); onClose(); }}><header><h2 id={id}>Personalizar lectura operativa</h2><button aria-label="Cerrar personalización de lectura" onClick={onClose}>×</button></header>
    <form onSubmit={e => { e.preventDefault(); onApply(draft); }}><div className={s.formGrid}><label>Resúmenes visibles al entrar<select value={draft.limit} onChange={e => setDraft({ ...draft, limit: Number(e.target.value) as ReadingOptions['limit'] })}><option value="3">3 · mínimos</option><option value="6">6 · equilibrado</option><option value="12">12 · ampliado</option></select></label><label>Buscar tema o gráfico<input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Riesgo, responsable, rubro…" /></label></div>
      <label className={s.readingCheck}><input type="checkbox" checked={!!draft.explain} onChange={e => setDraft({ ...draft, explain: e.target.checked })} /> Mostrar explicaciones completas</label>
      <p className={s.footnote}>Elegí los temas y gráficos que querés interpretar. Los valores y fundamentos se recalculan con los datos; podés personalizar los títulos.</p>
      <div className={s.readingChoices}>{filtered.map(item => <div key={item.id}><label className={s.readingCheck}><input type="checkbox" aria-label={'Incluir '+item.label} checked={!draft.disabled.includes(item.id)} onChange={e => setDraft({ ...draft, disabled: e.target.checked ? draft.disabled.filter(id => id !== item.id) : [...draft.disabled, item.id] })} />{item.label}<small>{item.id.startsWith('block:') ? 'Bloque del dashboard' : 'Tema operativo'}</small></label><input aria-label={'Título del resumen '+item.label} maxLength={100} placeholder="Título personalizado (opcional)" value={draft.labels[item.id] || ''} onChange={e => setDraft({ ...draft, labels: { ...draft.labels, [item.id]: e.target.value } })} /></div>)}</div>
      {!filtered.length && <p className={s.footnote}>No hay temas que coincidan con esa búsqueda.</p>}
      <p className={s.footnote}>Al agregar gráficos se habilitan sus resúmenes. Los temas sin coincidencias no inventan alertas. Aplicar deja el cambio pendiente de guardar en tu cuenta.</p>
      <footer><button type="button" onClick={onClose}>Cancelar</button><button className={s.primary}>Aplicar lectura</button></footer>
    </form>
  </dialog>;
}
