import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { OrdenLocal } from '../../types/orden';
import { PALETTE, STATUS_COLORS, type DashboardBlock } from '../../services/personalDashboardModel';
import { EVENT_LABELS, fullDate, shortDate, temporalOptions, uniqueEvents, type EventKey, type TemporalBucket, type temporalData } from '../../services/dashboardOperationalModel';
import s from './TemporalChart.module.css';

export function TemporalChart({ block, result, onSelect, onSeries }: { block: DashboardBlock; result: ReturnType<typeof temporalData>; onSelect: (title: string, orders: OrdenLocal[], reason: string) => void; onSeries?: (series: EventKey[]) => void }) {
  const ref = useRef<HTMLDivElement>(null), [width, setWidth] = useState(0), [selected, setSelected] = useState('');
  const [hover, setHover] = useState<{ i: number; x: number; y: number } | null>(null);
  const options = temporalOptions(block), { buckets, grain } = result;
  const series = options.series;
  const color = (key: EventKey) => block.colors[key] ?? (key === 'ingresos' ? block.colors.accent ?? PALETTE[0] : STATUS_COLORS.Cerrada);
  useEffect(() => { const el = ref.current; if (!el) return; const observer = new ResizeObserver(([e]) => setWidth(Math.round(e.contentRect.width))); observer.observe(el); return () => observer.disconnect(); }, []);
  const max = Math.max(1, ...buckets.flatMap(b => series.map(key => b[key].length))), step = Math.max(1, Math.ceil(max / 4)), ceiling = Math.ceil(max / step) * step;
  const h = options.height, left = width < 350 ? 36 : 46, right = 18, top = 40, bottom = 48, plotWidth = Math.max(1, width - left - right), plotHeight = h - top - bottom;
  const bar = block.type === 'bars', slot = plotWidth / Math.max(1, buckets.length), pad = bar ? 0 : Math.min(8, plotWidth / 5);
  const x = (i: number) => left + (bar ? slot * (i + .5) : buckets.length === 1 ? plotWidth / 2 : pad + i * (plotWidth - 2 * pad) / (buckets.length - 1));
  const y = (value: number) => top + plotHeight * (1 - value / ceiling);
  const ticks = useMemo(() => {
    const maxTicks = Math.max(2, Math.floor(plotWidth / 85)), every = Math.max(1, Math.ceil((buckets.length - 1) / (maxTicks - 1)));
    return buckets.map((_, i) => i).filter(i => i === 0 || i === buckets.length - 1 || i % every === 0 && x(buckets.length - 1) - x(i) > 62);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buckets, plotWidth, bar]);
  const chosen = buckets.find(b => b.key === selected), pointed = hover && buckets[hover.i];
  const detail = (b: TemporalBucket) => `${shortDate(b.from)}–${shortDate(b.to)} · ${series.map(key => `${b[key].length} ${key === 'ingresos' ? 'ingresos' : 'cierres'}`).join(' · ')}`;
  const drill = (b: TemporalBucket) => onSelect(`${block.title} · ${shortDate(b.from)}–${shortDate(b.to)}`, uniqueEvents([b], series), `Eventos entre ${fullDate(b.from)} y ${fullDate(b.to)}, inclusive. Ingreso: fecha de ingreso; cierre: OT actualmente Cerrada con fin válido. Una OT que aporta a ambas series se muestra una sola vez.`);
  return <div className={s.root}>
    <div className={s.chart} ref={ref} style={{ height: h }} onPointerLeave={() => setHover(null)}>
      {result.error ? <p role="alert" className={s.empty}>{result.error}</p> : width > 0 && <>
        <svg className={s.plot} viewBox={`0 0 ${width} ${h}`} role="img" aria-label={`${block.title}. ${buckets.length} ${buckets.length === 1 ? 'intervalo' : 'intervalos'}. ${series.map(key => EVENT_LABELS[key]).join(' y ')}. Escala de 0 a ${ceiling} OT.`} onPointerMove={e => {
          if (e.pointerType === 'touch') return; const rect = e.currentTarget.getBoundingClientRect(), px = e.clientX - rect.left, py = e.clientY - rect.top;
          if (px < left || px > width - right || py < top || py > h - bottom) { setHover(null); return; }
          const i = buckets.reduce((best, _, index) => Math.abs(x(index) - px) < Math.abs(x(best) - px) ? index : best, 0);
          setHover({ i, x: px, y: py });
        }} onClick={e => { const rect = e.currentTarget.getBoundingClientRect(), px = e.clientX - rect.left, py = e.clientY - rect.top; if (px < left || px > width - right || py < top || py > h - bottom) return; const i = buckets.reduce((best, _, index) => Math.abs(x(index) - px) < Math.abs(x(best) - px) ? index : best, 0); setSelected(buckets[i].key); }}>
          <title>{block.title}</title><desc>Los intervalos completos sin eventos muestran cero. Los extremos se ajustan a las fechas elegidas.</desc>
          <text className="axis-title" data-axis="y" x={left} y={13}>Cantidad de OT</text>
          {Array.from({ length: ceiling / step + 1 }, (_, i) => i * step).map(value => <g key={value}>{(options.grid || value === 0) && <line x1={left} x2={width - right} y1={y(value)} y2={y(value)} stroke="var(--border-default)" />}<text x={left - 9} y={y(value) + 4} textAnchor="end">{value}</text></g>)}
          {series.map((key, si) => {
            const path = buckets.map((b, i) => `${i ? 'L' : 'M'}${x(i)},${y(b[key].length)}`).join(' '), barWidth = Math.max(.5, Math.min(24, slot / (series.length + 1)));
            return <g key={key}>
              {bar ? buckets.map((b, i) => <rect key={b.key} x={x(i) + (si - (series.length - 1) / 2) * barWidth - barWidth / 2} y={y(b[key].length)} width={Math.max(.5, barWidth - Math.min(2, barWidth / 4))} height={y(0) - y(b[key].length)} fill={color(key)} rx="1" />) : <>
                {options.area && <path d={`${path} L${x(buckets.length - 1)},${y(0)} L${x(0)},${y(0)} Z`} fill={color(key)} opacity=".10" />}
                <path d={path} fill="none" stroke={color(key)} strokeWidth="2.5" strokeDasharray={si ? '6 3' : undefined} />
                {options.points && buckets.length < 100 && buckets.map((b, i) => si ? <rect key={b.key} x={x(i) - 3} y={y(b[key].length) - 3} width="6" height="6" rx="1" fill={color(key)} /> : <circle key={b.key} cx={x(i)} cy={y(b[key].length)} r="3.5" fill={color(key)} />)}
              </>}
              {options.values && plotWidth / buckets.length > (bar ? 80 : 38) && (!bar || max < 100 || series.length === 1) && buckets.map((b, i) => !bar && si && Math.abs(y(b[key].length) - y(b[series[0]].length)) < 18 ? null : <text key={b.key} x={x(i) + (bar ? (si - (series.length - 1) / 2) * barWidth : 0)} y={y(b[key].length) - 11} textAnchor={bar ? 'middle' : i === 0 ? 'start' : i === buckets.length - 1 ? 'end' : 'middle'}>{b[key].length}</text>)}
            </g>;
          })}
          {ticks.map(i => <text key={buckets[i].key} x={x(i)} y={h - 26} textAnchor={i === 0 ? 'start' : i === buckets.length - 1 ? 'end' : 'middle'}>{grain === 'month' ? new Date(buckets[i].key + 'T00:00:00').toLocaleDateString('es-PY', { month: 'short', year: '2-digit' }) : shortDate(buckets[i].from)}</text>)}
          <text className="axis-title" data-axis="x" x={left + plotWidth / 2} y={h - 5} textAnchor="middle">{grain === 'day' ? 'Día' : grain === 'week' ? 'Semana de ingreso / cierre' : 'Mes'}</text>
          {pointed && hover && <line x1={x(hover.i)} x2={x(hover.i)} y1={top} y2={y(0)} stroke="var(--text-tertiary)" />}
        </svg>
        {plotWidth / buckets.length >= 32 && buckets.map((b, i) => <button key={b.key} className={s.point} style={{ left: x(i), top: y(Math.max(...series.map(key => b[key].length))) }} aria-label={`${detail(b)}. Seleccionar intervalo`} onFocus={() => setHover({ i, x: x(i), y: y(Math.max(...series.map(key => b[key].length))) })} onClick={() => setSelected(b.key)} />)}
        {pointed && hover && <div className={s.tooltip} role="tooltip" style={{ left: Math.max(0, Math.min(hover.x + 10, width - Math.min(200, width))), top: Math.max(20, Math.min(hover.y + 10, h - 100)) }}><strong>{shortDate(pointed.from)} → {shortDate(pointed.to)}</strong>{series.map(key => <span key={key}>{EVENT_LABELS[key]} <b>{pointed[key].length}</b></span>)}</div>}
      </>}
    </div>
    <div className={s.legend}>{(['ingresos', 'cierres'] as EventKey[]).map(key => <button key={key} aria-pressed={series.includes(key)} disabled={!onSeries || series.length === 1 && series[0] === key} onClick={() => onSeries?.(series.includes(key) ? series.filter(s => s !== key) : [...series, key])}><i style={{ background: color(key) } as CSSProperties} />{EVENT_LABELS[key]}</button>)}</div>
    {!result.error && <div className={s.explore}><label>Explorar intervalo<select aria-label={`Explorar intervalo de ${block.title}`} value={chosen?.key || ''} onChange={e => setSelected(e.target.value)}><option value="">Elegir fecha…</option>{buckets.map(b => <option key={b.key} value={b.key}>{detail(b)}</option>)}</select></label>{chosen && <button onClick={() => drill(chosen)}>Ver OT</button>}<span>{fullDate(result.from)} → {fullDate(result.to)}</span></div>}
    <p className={s.note}>Extremos incluidos y períodos parciales. Sin eventos: 0. Cada serie usa su fecha de evento.{result.missingIn > 0 && series.includes('ingresos') ? ` ${result.missingIn} OT del alcance sin ingreso válido.` : ''}{result.missingOut > 0 && series.includes('cierres') ? ` ${result.missingOut} cerradas del alcance sin fin válido; excluidas de cierres.` : ''}</p>
  </div>;
}
