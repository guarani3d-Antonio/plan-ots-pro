import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { OrdenLocal } from '../../types/orden';
import type { Proyecto } from '../../stores/proyectosStore';
import { CONDITION_LABELS, GROUP_LABELS, PALETTE, STATUS_COLORS, TYPE_LABELS, blockOrders, groupColor, groupOrders, normalized, type DashboardBlock, type TemporalOptions } from '../../services/personalDashboardModel';
import { isTemporal, proposeTemporalBlock, temporalOptions, type EventKey } from '../../services/dashboardOperationalModel';
import s from './PersonalDashboard.module.css';

export function ContextualBlockEditor({ block: b, left, assisted, rubros, rows, projects, onPreview, onClose, onApply }: { block: DashboardBlock; left?: number; assisted: boolean; rubros: string[]; rows: OrdenLocal[]; projects: Proyecto[]; onPreview: (b: DashboardBlock) => void; onClose: () => void; onApply: (b: DashboardBlock) => void }) {
  const panel = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = panel.current, previous = document.activeElement;
    el?.showPopover?.();
    el?.focus({ preventScroll: true });
    return () => { if (el?.matches(':popover-open')) el.hidePopover(); if (previous instanceof HTMLElement && previous.isConnected) previous.focus({ preventScroll: true }); };
  }, []);
  const [tab, setTab] = useState<'data' | 'chart' | 'look'>('chart'), [mia, setMia] = useState(assisted), [prompt, setPrompt] = useState('Compará ingresos y cierres por semana'), [proposal, setProposal] = useState(false), [error, setError] = useState(''), [search, setSearch] = useState('');
  const temporal = isTemporal(b), t = temporalOptions(b);
  const groups = groupOrders(blockOrders(rows, b), projects, b);
  const patch = (p: Partial<DashboardBlock>) => onPreview({ ...b, ...p });
  const patchTime = (p: Partial<TemporalOptions>) => patch({ temporal: { ...t, ...p } });
  function series(key: EventKey, checked: boolean) { if (!checked && t.series.length === 1) { setError('El gráfico necesita al menos una serie.'); return; } setError(''); patchTime({ series: checked ? [...t.series, key] : t.series.filter(s => s !== key) }); }
  const colors = b.group === 'estado' ? Object.keys(STATUS_COLORS).map(key => ({ key, label: key })) : groups.filter(g => normalized(g.label).includes(normalized(search))).map(g => ({ key: g.key, label: g.label }));
  return <aside ref={panel} popover="manual" tabIndex={-1} role="dialog" aria-modal="false" className={s.inspector} style={{ '--editor-left': left === undefined ? 'auto' : `${left}px`, '--editor-right': left === undefined ? '16px' : 'auto' } as CSSProperties} aria-label="Editor contextual" aria-describedby="dashboard-preview-note" onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(); } }}><header><strong>{mia ? 'Crear con MIA' : 'Editar bloque'}</strong><button type="button" aria-label="Cerrar editor contextual" onClick={onClose}>×</button></header>
    {mia ? <div className={s.editorFields}>
      <p className={s.footnote}>Asistente local de gráficos · sin consumo de API</p>
      <label>¿Qué querés ver?<textarea value={prompt} onChange={e => { setPrompt(e.target.value); setProposal(false); }} /></label>
      {['Compará ingresos y cierres por semana', 'Quiero barras mensuales con ingresos y cierres', 'Mostrá solo los cierres por día'].map(text => <button key={text} type="button" className={s.prompt} onClick={() => { setPrompt(text); setProposal(false); }}>{text}</button>)}
      <button className={s.primary} type="button" onClick={() => { try { onPreview(proposeTemporalBlock(prompt, b)); setProposal(true); setError(''); } catch (e) { setError((e as Error).message); } }}>Preparar propuesta</button>
      {proposal && <div className={s.proposal}><strong>Propuesta lista</strong><span>{b.type === 'line' && t.area ? 'Áreas' : TYPE_LABELS[b.type]} · {t.grain === 'auto' ? 'intervalo automático' : { day: 'por día', week: 'por semana', month: 'por mes' }[t.grain]}</span><span>Conserva obra y fechas seleccionadas.</span><button type="button" onClick={() => setMia(false)}>Ajustar manualmente</button></div>}
      <p className={s.footnote}>Interpreta tipo de gráfico, ingresos/cierres y agrupación temporal. No realiza consultas a IA ni cambia registros.</p>
    </div> : <>
      <div className={s.editorTabs} role="tablist" aria-label="Propiedades del bloque">{([['data', 'Datos'], ['chart', 'Gráfico'], ['look', 'Aspecto']] as const).map(([key, text]) => <button id={`dashboard-tab-${key}`} aria-controls="dashboard-editor-panel" type="button" role="tab" aria-selected={tab === key} key={key} onClick={() => setTab(key)}>{text}</button>)}</div>
      <form id="dashboard-block-form" className={s.editorFields} onSubmit={e => { e.preventDefault(); if (b.title.trim()) onApply({ ...b, title: b.title.trim() }); }}>
        <div id="dashboard-editor-panel" role="tabpanel" aria-labelledby={`dashboard-tab-${tab}`} className={s.editorFieldsInner}>
          {tab === 'data' && <>
            <div className={s.sourceLabel}>Fuente<strong>OT de las obras autorizadas</strong></div>
            <label>Agrupar por<select value={b.group} onChange={e => patch({ group: e.target.value as DashboardBlock['group'], ...(e.target.value === 'semana' ? { measure: 'count' } : {}) })}>{Object.entries(GROUP_LABELS).map(([key, name]) => <option value={key} key={key}>{name}</option>)}</select></label>
            <label>Medida<select value={b.measure} onChange={e => patch({ measure: e.target.value as DashboardBlock['measure'] })}><option value="count">Cantidad de OT</option>{b.group !== 'semana' && !['pie', 'donut'].includes(b.type) && <><option value="entities">Categorías distintas con OT</option><option value="duration">Duración registrada · cerradas</option></>}</select></label>
            <label>Condición<select value={b.condition} onChange={e => patch({ condition: e.target.value as DashboardBlock['condition'] })}>{Object.entries(CONDITION_LABELS).map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select></label>
            <label>Rubro de este bloque<select value={b.rubro} onChange={e => patch({ rubro: e.target.value })}><option value="">Todos dentro del alcance general</option>{rubros.map(r => <option key={r}>{r}</option>)}</select></label>
            {temporal && <><label className={s.toggle}>Ingresadas · fecha de ingreso<input type="checkbox" checked={t.series.includes('ingresos')} onChange={e => series('ingresos', e.target.checked)} /></label><label className={s.toggle}>Cerradas · fin registrado<input type="checkbox" checked={t.series.includes('cierres')} onChange={e => series('cierres', e.target.checked)} /></label></>}
            <p className={s.footnote}>Se combinan los filtros generales y los del bloque. Las series temporales aplican desde/hasta a su propia fecha de evento.</p>
          </>}
          {tab === 'chart' && <>
            <label>Título<input required aria-label="Título del bloque" maxLength={100} value={b.title} onChange={e => patch({ title: e.target.value })} /></label>
            <label>Visualización<select value={temporal && b.type === 'line' && t.area ? 'area' : b.type} onChange={e => patch({ type: (e.target.value === 'area' ? 'line' : e.target.value) as DashboardBlock['type'], ...(b.group === 'semana' ? { temporal: { ...t, area: e.target.value === 'area' } } : {}), ...(['pie', 'donut'].includes(e.target.value) ? { measure: 'count' } : {}) })}>{Object.entries(TYPE_LABELS).map(([key, name]) => <option key={key} value={key}>{name}</option>)}{b.group === 'semana' && <option value="area">Áreas</option>}</select></label>
            {temporal && <><label>Agrupar fechas por<select value={t.grain} onChange={e => patchTime({ grain: e.target.value as TemporalOptions['grain'] })}><option value="auto">Automático según el intervalo</option><option value="day">Día</option><option value="week">Semana</option><option value="month">Mes</option></select></label>{(['points', 'values', 'grid'] as const).map((key, i) => <label key={key} className={s.toggle}>{['Puntos visibles', 'Valores sobre el gráfico', 'Cuadrícula de referencia'][i]}<input type="checkbox" checked={t[key]} onChange={e => patchTime({ [key]: e.target.checked })} /></label>)}</>}
            <label>Ancho<select value={b.width} onChange={e => patch({ width: Number(e.target.value) as DashboardBlock['width'] })}><option value="3">¼ de fila</option><option value="6">½ fila</option><option value="12">Fila completa</option></select></label>
          </>}
          {tab === 'look' && <>
            {temporal && <><label>Descripción<input maxLength={100} value={t.description} onChange={e => patchTime({ description: e.target.value })} /></label><label>Altura<select value={t.height} onChange={e => patchTime({ height: Number(e.target.value) as TemporalOptions['height'] })}><option value="230">Compacta</option><option value="270">Equilibrada</option><option value="320">Ampliada</option></select></label></>}
            {temporal ? (['ingresos', 'cierres'] as const).map((key, i) => <ColorControl key={key} label={key === 'ingresos' ? 'Ingresadas' : 'Cerradas'} value={b.colors[key] ?? (i ? STATUS_COLORS.Cerrada : b.colors.accent ?? PALETTE[0])} onChange={color => patch({ colors: { ...b.colors, [key]: color } })} />) : <>
              <ColorControl label="principal" value={b.colors.accent ?? PALETTE[0]} onChange={color => patch({ colors: { ...b.colors, accent: color } })} />
              {b.group !== 'estado' && <label>Buscar categoría<input type="search" value={search} onChange={e => setSearch(e.target.value)} /></label>}
              <div className={s.colorList}>{colors.map(({ key, label }, i) => <ColorControl key={key} label={label} value={groupColor(b, key, i)} onChange={color => patch({ colors: { ...b.colors, [key]: color } })} />)}</div>
            </>}
            <button type="button" onClick={() => patch({ colors: {} })}>Restablecer colores</button>
          </>}
        </div>
      </form>
    </>}
    <p id="dashboard-preview-note" className={s.previewNote}>Vista previa · las OT no se modifican</p>
    {error && <p role="alert" className={s.notice}>{error}</p>}
    <footer><button type="button" onClick={onClose}>Cancelar</button>{mia ? <button type="button" className={s.primary} disabled={!proposal} onClick={() => onApply(b)}>Aplicar propuesta</button> : <button form="dashboard-block-form" type="submit" className={s.primary} disabled={!b.title.trim()}>Aplicar bloque</button>}</footer>
  </aside>;
}
function ColorControl({ label, value, onChange }: { label: string; value: string; onChange: (color: string) => void }) {
  const [draft, setDraft] = useState<{ base: string; text: string } | null>(null);
  const hex = draft?.base === value ? draft.text : value;
  // Preserve partially typed hex values; the validated color is the only previewed value.
  return <div className={s.colorRow}><span>{label === 'principal' ? 'Color principal' : label}</span><div className={s.colorInputs}><input type="color" aria-label={`Color ${label}`} value={value} onChange={e => { onChange(e.target.value); setDraft(null); }} /><input aria-label={`Código de color ${label}`} value={hex} maxLength={7} pattern="#[0-9a-fA-F]{6}" onChange={e => { setDraft({ base: value, text: e.target.value }); if (/^#[0-9a-f]{6}$/i.test(e.target.value)) onChange(e.target.value); }} onBlur={() => setDraft(null)} /></div></div>;
}
