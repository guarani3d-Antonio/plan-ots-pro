// src/services/informeService.ts
import { db } from '../db/dexie'
import { supabase } from '../db/supabase'
import { ESTADO_LABEL, ESTADO_COLOR } from '../constants/estados'
import type { EstadoOT } from '../constants/estados'

// ─── Tipos públicos ───────────────────────────────────────────────────────────

export interface FirmanteConfig {
  nombre: string
  cargo:  string
}

export interface InformeConfig {
  proyectoId:            string
  proyectoNombre:        string
  proyectoCliente:       string
  periodoLabel:          string
  logoB64?:              string
  filtroEstados:         EstadoOT[]
  incluirFotos:          boolean
  categoriasFotos:       string[]
  campoAvanceId?:        string
  evolucionGranularidad: 'dias' | 'semanas' | 'meses'
  firmantes:             FirmanteConfig[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fechaHoy(): string {
  return new Date().toLocaleDateString('es-PY', {
    day: '2-digit', month: 'short', year: 'numeric',
  })
}

function badgeEstado(estado: string): string {
  const clsMap: Record<string, string> = {
    'Pendiente':  'b-pending',
    'En proceso': 'b-proceso',
    'Cerrada':    'b-cerrado',
    'No aplica':  'b-na',
  }
  const label = ESTADO_LABEL[estado as EstadoOT] ?? estado
  const cls   = clsMap[estado] ?? 'b-na'
  return `<span class="badge ${cls}">${label}</span>`
}

function barraCSS(items: { label: string; count: number; color: string }[], total: number): string {
  if (!items.length) return '<p style="font-size:8pt;color:#9CA3AF">Sin datos</p>'
  return items.map(it => {
    const pct = total > 0 ? Math.round((it.count / total) * 100) : 0
    return `
      <table class="bar-row"><tr>
        <td class="bar-label">${it.label}</td>
        <td class="bar-track"><div class="bar-fill" style="width:${pct}%;background:${it.color}"></div></td>
        <td class="bar-count">${it.count}</td>
      </tr></table>`
  }).join('')
}

// ─── SVG Donut (sin canvas, compatible con print) ─────────────────────────────

function donutSVG(
  segments: { label: string; count: number; color: string }[],
  total: number,
  centerLabel: string,
  centerValue: string,
): string {
  const R = 52, CX = 70, CY = 70, STROKE = 20
  const r = R - STROKE / 2
  const circ = 2 * Math.PI * r

  let offset = 0
  const arcs = segments
    .filter(s => s.count > 0)
    .map(s => {
      const pct  = s.count / Math.max(total, 1)
      const dash = pct * circ
      const gap  = circ - dash
      const dOff = -(offset * circ - circ / 4)
      offset    += pct
      return `<circle cx="${CX}" cy="${CY}" r="${r.toFixed(1)}" fill="none" stroke="${s.color}"
        stroke-width="${STROKE}" stroke-dasharray="${dash.toFixed(1)} ${gap.toFixed(1)}"
        stroke-dashoffset="${dOff.toFixed(1)}" stroke-linecap="butt"/>`
    }).join('')

  const legendRows = segments.map(s => `
    <tr>
      <td style="padding:1px 4px 1px 0">
        <span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${s.color}"></span>
      </td>
      <td style="font-size:7pt;color:#374151;padding:1px 6px 1px 0">${s.label}</td>
      <td style="font-size:7pt;font-weight:700;color:#1A2B4A;text-align:right">${s.count}</td>
    </tr>`).join('')

  return `
    <div style="display:flex;align-items:center;gap:12px">
      <svg width="140" height="140" viewBox="0 0 140 140" style="flex-shrink:0">
        <circle cx="${CX}" cy="${CY}" r="${r.toFixed(1)}" fill="none" stroke="#E5E7EB" stroke-width="${STROKE}"/>
        ${arcs}
        <text x="${CX}" y="${CY - 5}" text-anchor="middle" dominant-baseline="middle"
          font-size="15" font-weight="700" fill="#1A2B4A" font-family="Calibri,Arial,sans-serif">
          ${centerValue}
        </text>
        <text x="${CX}" y="${CY + 12}" text-anchor="middle" dominant-baseline="middle"
          font-size="7" fill="#6B7280" font-family="Calibri,Arial,sans-serif">
          ${centerLabel}
        </text>
      </svg>
      <table style="border-collapse:collapse">${legendRows}</table>
    </div>`
}

// ─── Fotos desde Supabase ─────────────────────────────────────────────────────

async function fotosPorOrden(
  ordenId: string,
  categorias: string[],
): Promise<Record<string, string[]>> {
  const result: Record<string, string[]> = {}
  categorias.forEach(c => { result[c] = [] })
  try {
    const { data } = await supabase
      .from('fotos')
      .select('categoria, file_url, file_type')
      .eq('orden_id', ordenId)
      .in('categoria', categorias)
    data?.forEach(f => {
      if (result[f.categoria] && f.file_type === 'imagen') {
        result[f.categoria].push(f.file_url)
      }
    })
  } catch { /* sin conexión: fotos omitidas */ }
  return result
}

// ── FIX: fotos el doble de grandes (200×144 px en vez de 100×72) ─────────────
function htmlFotoRow(otCode: string, fotos: Record<string, string[]>, categorias: string[]): string {
  const tieneAlgo = categorias.some(c => fotos[c]?.length > 0)
  if (!tieneAlgo) {
    return `<tr class="photo-row"><td colspan="7">
      <div class="photo-inner">Sin fotos registradas para ${otCode}</div>
    </td></tr>`
  }
  let html = `<tr class="photo-row"><td colspan="7">
    <div style="display:flex;gap:16px;flex-wrap:wrap;padding:8px 10px">`
  categorias.forEach(cat => {
    const imgs = fotos[cat]
    if (!imgs?.length) return
    html += `<div>
      <div style="font-size:7pt;font-weight:700;color:#6B7280;text-transform:uppercase;margin-bottom:5px">${cat}</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">`
    imgs.forEach(url => {
      html += `<img src="${url}" style="width:340px;height:245px;object-fit:cover;border-radius:4px;border:1px solid #D1D5DB" loading="lazy"/>`
    })
    html += `</div></div>`
  })
  html += `</div></td></tr>`
  return html
}

// ─── CSS del documento ────────────────────────────────────────────────────────

const DOC_CSS = `
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Calibri','Segoe UI',Arial,sans-serif;font-size:10pt;color:#1A1A2E;background:#fff;padding:1.4cm 1.8cm;max-width:28cm;margin:0 auto}
.header-wrap{border-bottom:3px solid #1A2B4A;padding-bottom:12px;margin-bottom:20px}
.header-tbl{width:100%;border-collapse:collapse}
.header-tbl td{vertical-align:middle;padding:0}
.logo-box{width:115px;height:75px;border:2px dashed #9CA3AF;border-radius:6px;text-align:center;color:#9CA3AF;font-size:7.5pt;padding:8px}
.hd-title{padding-left:16px}
.hd-title h1{font-size:14.5pt;font-weight:700;color:#1A2B4A;line-height:1.2}
.hd-title h2{font-size:10pt;font-weight:400;color:#6B7280;margin-top:3px}
.hd-meta{text-align:right;font-size:7.5pt;color:#6B7280;min-width:165px;white-space:nowrap}
.hd-meta strong{color:#1A2B4A}
.doc-id{display:inline-block;margin-top:5px;background:#EFF6FF;color:#1E40AF;border-radius:4px;padding:3px 8px;font-size:8.5pt;font-weight:700}
.sec-title{font-size:11pt;font-weight:700;background:#1A2B4A;color:#fff;padding:7px 14px;margin:22px 0 12px;border-radius:4px}
.sec-sub{font-size:9.5pt;font-weight:700;border-left:4px solid #2563EB;padding:4px 10px;margin:18px 0 8px;background:#EFF6FF;color:#1E40AF;border-radius:0 4px 4px 0}
.sec-sub.s-cerrado{border-color:#15803D;background:#F0FDF4;color:#14532D}
.sec-sub.s-na{border-color:#6B7280;background:#F9FAFB;color:#374151}
.sec-sub.s-pending{border-color:#E53E3E;background:#FCEBEB;color:#A32D2D}
.sec-sub.s-proceso{border-color:#3B82F6;background:#EFF6FF;color:#1E40AF}
.kpi-grid{width:100%;border-collapse:separate;border-spacing:7px;margin-bottom:8px}
.kpi-card{border-radius:8px;padding:12px 8px;text-align:center;border:1px solid #D1D5DB}
.kpi-val{font-size:22pt;font-weight:800;line-height:1;margin-bottom:3px}
.kpi-lbl{font-size:7pt;font-weight:600;text-transform:uppercase;letter-spacing:.4px;line-height:1.3}
.kpi-navy{background:#1A2B4A;color:#fff;border-color:#1A2B4A}
.kpi-green{background:#F0FDF4;color:#15803D;border-color:#BBF7D0}
.kpi-blue{background:#EFF6FF;color:#1E40AF;border-color:#BFDBFE}
.kpi-red{background:#FCEBEB;color:#A32D2D;border-color:#F7C1C1}
.kpi-gray{background:#F9FAFB;color:#6B7280;border-color:#D1D5DB}
.charts-wrap{width:100%;border-collapse:collapse;margin:14px 0 20px}
.charts-wrap td{vertical-align:top;padding:0 6px}
.chart-box{border:1px solid #E5E7EB;border-radius:8px;padding:14px;background:#FAFAFA}
.chart-title{font-size:9pt;font-weight:700;color:#1A2B4A;margin-bottom:12px;text-align:center}
.bar-row{width:100%;border-collapse:collapse;margin-bottom:7px}
.bar-row td{padding:0;vertical-align:middle}
.bar-label{font-size:8pt;color:#374151;width:110px;white-space:nowrap;padding-right:8px;font-weight:600}
.bar-track{background:#E5E7EB;border-radius:6px;height:18px}
.bar-fill{border-radius:6px;height:18px;display:block}
.bar-count{font-size:8pt;font-weight:700;color:#1A2B4A;width:28px;text-align:right;padding-left:6px}
table.dt{width:100%;border-collapse:collapse;font-size:8.5pt;margin-bottom:14px}
table.dt thead tr{background:#1A2B4A;color:#fff}
table.dt thead th{padding:8px 9px;text-align:left;font-size:7.5pt;font-weight:600;border:1px solid #2D4A7A}
table.dt tbody tr:nth-child(even){background:#F8FAFC}
table.dt tbody tr:nth-child(odd){background:#fff}
table.dt tbody td{padding:6px 9px;border:1px solid #D1D5DB;vertical-align:top;line-height:1.35}
tr.photo-row td{background:#F9FAFB;border:1px dashed #D1D5DB;padding:8px 10px}
.photo-inner{color:#9CA3AF;font-size:8pt;font-style:italic}
.badge{display:inline-block;padding:2px 7px;border-radius:12px;font-size:7pt;font-weight:700;white-space:nowrap}
.b-proceso{background:#EFF6FF;color:#1E40AF;border:1px solid #93C5FD}
.b-cerrado{background:#D1FAE5;color:#065F46;border:1px solid #6EE7B7}
.b-pending{background:#FCEBEB;color:#A32D2D;border:1px solid #F7C1C1}
.b-na{background:#F3F4F6;color:#4B5563;border:1px solid #D1D5DB}
.pb-bg{background:#E5E7EB;border-radius:6px;height:8px;width:100%;margin-bottom:2px}
.pb-fill{border-radius:6px;height:8px}
.pb-pct{font-size:7.5pt;font-weight:700;color:#1A2B4A}
.ot-code{font-family:'Courier New',monospace;font-size:7.5pt;font-weight:700;color:#1A2B4A;white-space:nowrap}
.ot-loc{font-size:6.5pt;color:#6B7280}
.footer-tbl{width:100%;border-collapse:collapse;margin-top:30px;border-top:2px solid #1A2B4A;padding-top:10px}
.firma-bloque{text-align:center;padding:0 10px}
.firma-linea{border-top:1px solid #374151;margin-top:28px;padding-top:4px;font-size:7.5pt}
.firma-nombre{font-weight:700;font-size:8pt;color:#1A2B4A}
.firma-cargo{font-size:7pt;color:#6B7280}
@media print{body{padding:0.8cm 1cm}.page-break{page-break-before:always}}
`

// ─── Obtener órdenes: Supabase primero, Dexie fallback ───────────────────────

async function obtenerOrdenes(proyectoId: string) {
  try {
    const { data, error } = await supabase
      .from('ordenes')
      .select('id, ot, estado, rubro, responsable, ubicacion, comentarios, prioridad, porcentaje_avance, fecha_fin_trabajos, campos, created_at, updated_at, proyecto_id')
      .eq('proyecto_id', proyectoId)
      .order('ot', { ascending: true })
    if (error) throw error
    return data ?? []
  } catch {
    const local = await db.ordenes.where('proyecto_id').equals(proyectoId).toArray()
    return local
  }
}

// ─── Helper: extraer fecha de finalización ────────────────────────────────────
// fecha_fin_trabajos es columna top-level (lo que escribe PanelOT). Fallback a
// claves legacy dentro de campos JSONB, y por último updated_at.
function extraerFechaFin(
  o: Record<string, unknown>,
  updatedAt?: string | null,
): string {
  const fmt = (v: string) =>
    new Date(v).toLocaleDateString('es-PY', { day: '2-digit', month: 'short', year: 'numeric' })

  const top = o['fecha_fin_trabajos']
  if (top && typeof top === 'string' && top.trim()) {
    try { return fmt(top) } catch { /* ignorar fecha inválida */ }
  }

  const campos = (o['campos'] ?? {}) as Record<string, unknown>
  const candidatos = ['fecha_fin_trabajos', 'fecha_fin', 'fecha_finalizacion', 'fecha_cierre']
  for (const key of candidatos) {
    const val = campos[key]
    if (val && typeof val === 'string' && val.trim()) {
      try { return fmt(val) } catch { /* ignorar fecha inválida */ }
    }
  }

  if (updatedAt) {
    try { return fmt(updatedAt) } catch { /* ignorar fecha inválida */ }
  }
  return '—'
}

// ─── Helper: extraer % avance desde campos JSONB ──────────────────────────────
// Intenta campoAvanceId primero, luego claves estándar conocidas
function extraerAvance(o: Record<string, unknown>, campoAvanceId?: string): number {
  // porcentaje_avance es columna top-level, no está en campos
  const val = Number(o['porcentaje_avance'] ?? NaN)
  if (!isNaN(val) && val >= 0) return Math.min(100, Math.max(0, val))
  // fallback: si hay campoAvanceId buscar en campos
  if (campoAvanceId) {
    const campos = (o['campos'] ?? {}) as Record<string, unknown>
    const v2 = Number(campos[campoAvanceId] ?? NaN)
    if (!isNaN(v2) && v2 >= 0) return Math.min(100, Math.max(0, v2))
  }
  return -1
}

// ─── Generador principal ──────────────────────────────────────────────────────

export async function generarInformeHTML(config: InformeConfig): Promise<string> {
  const todasOrdenes = await obtenerOrdenes(config.proyectoId)
  const total        = todasOrdenes.length

  // Conteos por estado
  const porEstado: Record<string, number> = {
    'Pendiente': 0, 'En proceso': 0, 'Cerrada': 0, 'No aplica': 0,
  }
  todasOrdenes.forEach(o => {
    const e = o.estado ?? ''
    if (e in porEstado) porEstado[e]++
  })

  const cerradas  = porEstado['Cerrada']
  const avancePct = total > 0 ? Math.round((cerradas / total) * 100) : 0

  // Por rubro
  const porRubro: Record<string, number> = {}
  todasOrdenes.forEach(o => {
    const r = o.rubro || 'Sin rubro'
    porRubro[r] = (porRubro[r] ?? 0) + 1
  })
  const rubroItems = Object.entries(porRubro)
    .sort((a, b) => b[1] - a[1]).slice(0, 8)
    .map(([label, count]) => ({ label, count, color: '#185FA5' }))

  // Logo
  const logoHtml = config.logoB64
    ? `<img src="${config.logoB64}" style="width:115px;height:75px;object-fit:contain;border-radius:4px"/>`
    : `<div class="logo-box">LOGO<br>empresa</div>`

  // Segmentos para donuts
  const segEstado = [
    { label: 'Cerrada',    count: porEstado['Cerrada'],    color: ESTADO_COLOR['Cerrada']    ?? '#22C55E' },
    { label: 'En proceso', count: porEstado['En proceso'], color: ESTADO_COLOR['En proceso'] ?? '#2462C9' },
    { label: 'Pendiente',  count: porEstado['Pendiente'],  color: ESTADO_COLOR['Pendiente']  ?? '#EF4444' },
    { label: 'No aplica',  count: porEstado['No aplica'],  color: ESTADO_COLOR['No aplica']  ?? '#9CA3AF' },
  ]

  // Órdenes filtradas y ordenadas
  const ordenesVisibles = todasOrdenes
    .filter(o => config.filtroEstados.includes((o.estado ?? '') as EstadoOT))
    .sort((a, b) => {
      const na = parseInt(String(a.ot ?? '').replace(/\D/g, '') || '0')
      const nb = parseInt(String(b.ot ?? '').replace(/\D/g, '') || '0')
      return na - nb
    })

  // Agrupar por estado
  const grupos: Record<string, typeof ordenesVisibles> = {}
  config.filtroEstados.forEach(e => { grupos[e] = [] })
  ordenesVisibles.forEach(o => {
    const e = o.estado ?? ''
    if (grupos[e]) grupos[e].push(o)
  })

  const claseSeccion: Record<string, string> = {
    'Pendiente':  's-pending',
    'En proceso': 's-proceso',
    'Cerrada':    's-cerrado',
    'No aplica':  's-na',
  }

  // Secciones de detalle
  let seccionesHtml = ''
  for (const estado of config.filtroEstados) {
    const lista = grupos[estado]
    if (!lista?.length) continue

    let filas = ''
    for (const o of lista) {
      const campos = (o.campos ?? {}) as Record<string, unknown>

      // ── FIX: descripción toma comentarios (con fallback a campos.descripcion)
      const descripcion = (o.comentarios as string)
        ?? (campos['descripcion'] as string)
        ?? '—'

      // ── FIX: fecha = fecha de finalización (top-level o campos), fallback updated_at
      const fecha = extraerFechaFin(o as unknown as Record<string, unknown>, o.updated_at as string | null)

      // ── FIX: avance visible siempre (sin necesidad de campoAvanceId)
      const avVal    = extraerAvance(o as unknown as Record<string, unknown>, config.campoAvanceId)
      const avPct    = avVal
      const barColor = avPct >= 80 ? '#15803D' : avPct >= 40 ? '#D97706' : '#DC2626'
      const barHtml  = avVal >= 0
        ? `<div class="pb-bg"><div class="pb-fill" style="width:${avPct}%;background:${barColor}"></div></div>
           <span class="pb-pct">${avPct}%</span>`
        : '<span style="font-size:7pt;color:#9CA3AF">—</span>'

      filas += `<tr>
        <td><span class="ot-code">${o.ot ?? '—'}</span><br><span class="ot-loc">${o.ubicacion ?? ''}</span></td>
        <td>${o.rubro ?? '—'}</td>
        <td style="max-width:200px">${descripcion}</td>
        <td>${badgeEstado(o.estado ?? '')}</td>
        <td>${o.responsable || 'Facility Services'}</td>
        <td style="white-space:nowrap">${fecha}</td>
        <td style="min-width:90px">${barHtml}</td>
      </tr>`

      if (config.incluirFotos && config.categoriasFotos.length > 0) {
        const fotos = await fotosPorOrden(o.id, config.categoriasFotos)
        filas += htmlFotoRow(o.ot ?? o.id, fotos, config.categoriasFotos)
      }
    }

    seccionesHtml += `
      <div class="sec-sub ${claseSeccion[estado] ?? ''}">
        ${ESTADO_LABEL[estado as EstadoOT] ?? estado} — ${lista.length} OT${lista.length !== 1 ? 's' : ''}
      </div>
      <table class="dt">
        <thead><tr>
          <th>OT / Ubicación</th><th>Rubro</th><th>Descripción</th>
          <th>Estado</th><th>Responsable</th><th>Fecha fin</th><th>Avance</th>
        </tr></thead>
        <tbody>${filas}</tbody>
      </table>`
  }

  // Firmantes
  const firmantesCeldas = config.firmantes.length > 0
    ? config.firmantes.map(f => `
        <td class="firma-bloque">
          <div class="firma-linea">
            <div class="firma-nombre">${f.nombre}</div>
            <div class="firma-cargo">${f.cargo}</div>
          </div>
        </td>`).join('<td style="width:40px"></td>')
    : '<td></td>'

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Informe — ${config.proyectoNombre} — ${fechaHoy()}</title>
<style>${DOC_CSS}</style>
</head>
<body>

<div class="header-wrap">
  <table class="header-tbl"><tr>
    <td>${logoHtml}</td>
    <td class="hd-title">
      <h1>Informe de avance — ${config.proyectoNombre}</h1>
      <h2>${config.proyectoCliente} · ${config.periodoLabel}</h2>
    </td>
    <td class="hd-meta">
      <div>Generado: <strong>${fechaHoy()}</strong></div>
      <div>Estados: <strong>${config.filtroEstados.map(e => ESTADO_LABEL[e as EstadoOT]).join(', ')}</strong></div>
      <div class="doc-id">PLAN-OTS-${Date.now().toString(36).toUpperCase()}</div>
    </td>
  </tr></table>
</div>

<div class="sec-title">Resumen ejecutivo</div>
<table class="kpi-grid"><tr>
  <td><div class="kpi-card kpi-navy"><div class="kpi-val">${total}</div><div class="kpi-lbl">Total OTs</div></div></td>
  <td><div class="kpi-card kpi-green"><div class="kpi-val">${avancePct}%</div><div class="kpi-lbl">Avance general</div></div></td>
  <td><div class="kpi-card kpi-green"><div class="kpi-val">${cerradas}</div><div class="kpi-lbl">Cerradas</div></div></td>
  <td><div class="kpi-card kpi-blue"><div class="kpi-val">${porEstado['En proceso']}</div><div class="kpi-lbl">En proceso</div></div></td>
  <td><div class="kpi-card kpi-red"><div class="kpi-val">${porEstado['Pendiente']}</div><div class="kpi-lbl">Pendientes</div></div></td>
  <td><div class="kpi-card kpi-gray"><div class="kpi-val">${porEstado['No aplica']}</div><div class="kpi-lbl">No aplica</div></div></td>
</tr></table>

<div class="sec-title">Distribución</div>
<table class="charts-wrap"><tr>
  <td width="38%">
    <div class="chart-box">
      <div class="chart-title">Por estado</div>
      ${donutSVG(segEstado, total, 'cerradas', avancePct + '%')}
    </div>
  </td>
  <td width="62%">
    <div class="chart-box">
      <div class="chart-title">Por rubro</div>
      ${barraCSS(rubroItems, total)}
    </div>
  </td>
</tr></table>

<div class="sec-title">Detalle de órdenes de trabajo</div>
${seccionesHtml}

<div style="margin-top:40px"></div>
<table class="footer-tbl"><tr>${firmantesCeldas}</tr></table>

<div style="margin-top:24px;border-top:1px solid #E5E7EB;padding-top:8px;text-align:center;font-size:7pt;color:#9CA3AF">
  Documento confidencial — Facility Services / Grupo Díaz Villaverde · Generado por Plan-OTs · ${fechaHoy()}
</div>

</body></html>`
}

// ─── Export CSV ───────────────────────────────────────────────────────────────

export async function exportarCSV(proyectoId: string): Promise<void> {
  const ordenes = await obtenerOrdenes(proyectoId)
  const sorted  = [...ordenes].sort((a, b) => {
    const na = parseInt(String(a.ot ?? '').replace(/\D/g, '') || '0')
    const nb = parseInt(String(b.ot ?? '').replace(/\D/g, '') || '0')
    return na - nb
  })

  const cab   = ['OT', 'Rubro', 'Ubicacion', 'Estado', 'Responsable', 'Prioridad', 'Comentarios', 'Creada', 'Actualizada']
  const filas = sorted.map(o => [
    o.ot ?? '',
    o.rubro ?? '',
    o.ubicacion ?? '',
    ESTADO_LABEL[(o.estado ?? '') as EstadoOT] ?? o.estado ?? '',
    o.responsable ?? '',
    o.prioridad ?? '',
    String(o.comentarios ?? '').replace(/"/g, '""'),
    o.created_at ? new Date(o.created_at).toLocaleDateString('es-PY') : '',
    o.updated_at ? new Date(o.updated_at).toLocaleDateString('es-PY') : '',
  ].map(v => `"${v}"`).join(','))

  const csv  = [cab.join(','), ...filas].join('\n')
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = `plan-ots-${proyectoId.slice(0, 8)}-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// ─── Descarga HTML ────────────────────────────────────────────────────────────

export function descargarHTML(html: string, nombre: string): void {
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = nombre
  a.click()
  URL.revokeObjectURL(url)
}