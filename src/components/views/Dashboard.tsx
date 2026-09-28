// src/components/views/Dashboard.tsx
// Dashboard con KPIs en tiempo real + exportación CSV / HTML / PDF + widgets configurables

import { useEffect, useMemo, useState, useCallback } from 'react';
import { useOrdenesStore } from '../../stores/ordenesStore';
import { useProyectosStore } from '../../stores/proyectosStore';
import { useAuthStore } from '../../stores/authStore';
import { ESTADO_COLOR } from '../../constants/estados';
import { getWidgetConfig, DEFAULT_WIDGETS, type WidgetConfig, type WidgetId } from '../../services/dashboardConfigService';
import { usePuedeVerCostosMultiple } from '../../hooks/usePuedeVerCostos';

const ESTADOS = ['Pendiente', 'En proceso', 'Cerrada', 'No aplica'] as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

function fechaCorta(iso?: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-PY', {
    day: 'numeric', month: 'numeric', year: 'numeric',
  });
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function Dashboard() {
  const ordenes               = useOrdenesStore(s => s.ordenes);
  const cargarTodasLasOrdenes = useOrdenesStore(s => s.cargarTodasLasOrdenes);
  const proyectos             = useProyectosStore(s => s.proyectos);
  const cargarProyectos       = useProyectosStore(s => s.cargarProyectos);
  const user                  = useAuthStore(s => s.user);

  const [filtroProyecto, setFiltroProyecto] = useState<string>('');
  const [filtroEstado, setFiltroEstado] = useState('');
  const [filtroRiesgo, setFiltroRiesgo] = useState('');
  const [filtroRubro, setFiltroRubro] = useState('');
  const [filtroResponsable, setFiltroResponsable] = useState('');
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');
  const [periodo, setPeriodo] = useState<'semana' | 'mes'>('mes');
  const [ahora] = useState(() => Date.now());
  const [colapsado, setColapsado]           = useState(false);
  const [widgetConfig, setWidgetConfig]     = useState<WidgetConfig[]>(DEFAULT_WIDGETS);

  useEffect(() => {
    cargarProyectos();
    cargarTodasLasOrdenes();
  }, [cargarProyectos, cargarTodasLasOrdenes]);

  // Cargar config de widgets al montar
  useEffect(() => {
    if (user?.id) {
      getWidgetConfig(user.id).then(setWidgetConfig);
    }
  }, [user?.id]);

  const userName = user?.email?.split('@')[0] ?? 'Usuario';

  const proyectoLabel = filtroProyecto
    ? (proyectos.find(p => p.id === filtroProyecto)?.nombre ?? 'Proyecto')
    : 'Todos los proyectos';

  // ── Datos filtrados ────────────────────────────────────────────────────────

  const opcionesRubro = useMemo(() => [...new Set(ordenes.map(o => o.rubro).filter(Boolean))].sort(), [ordenes]);
  const opcionesResponsable = useMemo(() => [...new Set(ordenes.map(o => o.responsable).filter(Boolean))].sort(), [ordenes]);
  const ordenesFiltradas = useMemo(() => ordenes.filter(o => {
    if (filtroProyecto && o.proyecto_id !== filtroProyecto) return false;
    if (filtroEstado && o.estado !== filtroEstado) return false;
    if (filtroRiesgo && o.nivel_riesgo !== filtroRiesgo) return false;
    if (filtroRubro && o.rubro !== filtroRubro) return false;
    if (filtroResponsable && o.responsable !== filtroResponsable) return false;
    const fecha = (o.fecha_ingreso || o.created_at || '').slice(0, 10);
    if (fechaDesde && fecha < fechaDesde) return false;
    if (fechaHasta && fecha > fechaHasta) return false;
    return true;
  }), [ordenes, filtroProyecto, filtroEstado, filtroRiesgo, filtroRubro, filtroResponsable, fechaDesde, fechaHasta]);

  // P0-6: Dashboard agrega OTs de varios proyectos a la vez — solo se ven
  // costos si el usuario es supervisor en TODOS los proyectos que aportan
  // datos al filtro actual (fail-closed, sin totales parciales).
  const proyectoIdsFiltrados = useMemo(
    () => Array.from(new Set(ordenesFiltradas.map(o => o.proyecto_id))),
    [ordenesFiltradas],
  );
  const puedeVerCostos = usePuedeVerCostosMultiple(proyectoIdsFiltrados);

  const kpi = useMemo(() => {
    const total = ordenesFiltradas.length;
    const avanceSum = ordenesFiltradas.reduce((s, o) => s + (o.porcentaje_avance ?? 0), 0);
    const avancePromedio = total > 0 ? Math.round(avanceSum / total) : 0;
    const riesgo = ordenesFiltradas.filter(o => o.nivel_riesgo === 'Alto' || o.nivel_riesgo === 'Extremo').length;
    const costoTotal = ordenesFiltradas.reduce((s, o) => s + (o.costo ?? 0), 0);
    const haceSemana = ahora - 7 * 86400000;
    const modificadasUltSem = ordenesFiltradas.filter(o => {
      const t = new Date(o.updated_at ?? o.created_at ?? 0).getTime();
      return t >= haceSemana;
    }).length;
    return { total, avancePromedio, riesgo, costoTotal, modificadasUltSem };
  }, [ordenesFiltradas, ahora]);

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

  const tendencia = useMemo(() => {
    const conteo = new Map<string, number>();
    for (const o of ordenesFiltradas) {
      const fecha = (o.fecha_ingreso || o.created_at || '').slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) continue;
      let clave = fecha.slice(0, 7);
      if (periodo === 'semana') {
        const dia = new Date(`${fecha}T00:00:00`);
        dia.setDate(dia.getDate() - ((dia.getDay() + 6) % 7));
        clave = `${dia.getFullYear()}-${String(dia.getMonth() + 1).padStart(2, '0')}-${String(dia.getDate()).padStart(2, '0')}`;
      }
      conteo.set(clave, (conteo.get(clave) ?? 0) + 1);
    }
    return [...conteo].sort(([a], [b]) => a.localeCompare(b)).slice(-12);
  }, [ordenesFiltradas, periodo]);

  const costosPorObra = useMemo(() => {
    const totales = new Map<string, number>();
    for (const o of ordenesFiltradas) if ((o.costo ?? 0) > 0) totales.set(o.proyecto_id, (totales.get(o.proyecto_id) ?? 0) + (o.costo ?? 0));
    return [...totales].map(([id, monto]) => ({ label: proyectos.find(p => p.id === id)?.nombre ?? 'Obra', monto })).sort((a, b) => b.monto - a.monto);
  }, [ordenesFiltradas, proyectos]);
  const costosPorRubro = useMemo(() => {
    const totales = new Map<string, number>();
    for (const o of ordenesFiltradas) if ((o.costo ?? 0) > 0) {
      const rubro = o.rubro || 'Sin rubro';
      totales.set(rubro, (totales.get(rubro) ?? 0) + (o.costo ?? 0));
    }
    return [...totales].map(([label, monto]) => ({ label, monto })).sort((a, b) => b.monto - a.monto);
  }, [ordenesFiltradas]);

  const ultimas = useMemo(() => {
    return [...ordenesFiltradas]
      .sort((a, b) => {
        const ta = new Date(a.updated_at ?? a.created_at ?? 0).getTime();
        const tb = new Date(b.updated_at ?? b.created_at ?? 0).getTime();
        return tb - ta;
      })
      .slice(0, 8);
  }, [ordenesFiltradas]);

  const maxRubro = porRubro[0]?.[1] ?? 1;
  const { total, avancePromedio, riesgo, costoTotal, modificadasUltSem } = kpi;

  const lectura = useMemo(() => {
    if (ordenesFiltradas.length === 0) return [];
    const abiertas = ordenesFiltradas.filter(o => o.estado === 'Pendiente' || o.estado === 'En proceso');
    const vencidas = abiertas.filter(o => {
      const fecha = o.fecha_ingreso ? new Date(`${o.fecha_ingreso.slice(0, 10)}T00:00:00`).getTime() : new Date(o.created_at).getTime();
      return Number.isFinite(fecha) && ahora - fecha > 7 * 86400000;
    });
    const riesgos = abiertas.filter(o => o.nivel_riesgo === 'Alto' || o.nivel_riesgo === 'Extremo');
    const reincidencias = abiertas.filter(o => o.reincidencia);
    const mensajes = [
      { titulo: 'Dónde atender primero', detalle: riesgos.length
        ? `${riesgos.length} ${riesgos.length === 1 ? 'OT abierta tiene' : 'OTs abiertas tienen'} riesgo alto o extremo. Revisá su responsable y el próximo paso.`
        : 'No hay OTs abiertas con riesgo alto o extremo.', tono: riesgos.length ? '#B91C1C' : '#15803D' },
      { titulo: 'Demoras', detalle: vencidas.length
        ? `${vencidas.length} ${vencidas.length === 1 ? 'OT abierta lleva' : 'OTs abiertas llevan'} más de 7 días desde el ingreso.`
        : 'Ninguna OT abierta supera 7 días desde el ingreso.', tono: vencidas.length ? '#B45309' : '#15803D' },
      { titulo: 'Reclamos repetidos', detalle: reincidencias.length
        ? `${reincidencias.length} ${reincidencias.length === 1 ? 'OT abierta está marcada' : 'OTs abiertas están marcadas'} como reincidencia.`
        : 'No hay OTs abiertas marcadas como reincidencia.', tono: reincidencias.length ? '#B45309' : '#15803D' },
    ];
    const [rubroTop, cantidadRubro] = porRubro[0] ?? [];
    if (rubroTop) mensajes.push({ titulo: 'Rubro con más reclamos', detalle: `${rubroTop}: ${cantidadRubro} ${cantidadRubro === 1 ? 'OT' : 'OTs'} en la selección actual.`, tono: '#1E40AF' });
    if (puedeVerCostos) {
      const porObra = new Map<string, number>();
      for (const o of ordenesFiltradas) if ((o.costo ?? 0) > 0) porObra.set(o.proyecto_id, (porObra.get(o.proyecto_id) ?? 0) + (o.costo ?? 0));
      const [obraId, monto] = [...porObra].sort((a, b) => b[1] - a[1])[0] ?? [];
      mensajes.push({ titulo: 'Dónde se concentra el costo', detalle: obraId
        ? `${proyectos.find(p => p.id === obraId)?.nombre ?? 'Una obra'} concentra ${formatGs(monto)} de ${formatGs(costoTotal)} registrados. Es costo acumulado, no margen ni presupuesto.`
        : 'Todavía no hay costos registrados para comparar obras.', tono: '#1E40AF' });
    }
    return mensajes;
  }, [ordenesFiltradas, proyectos, puedeVerCostos, costoTotal, ahora, porRubro]);

  // ── Widget helpers ─────────────────────────────────────────────────────────

  const isVisible = (id: WidgetId) =>
    widgetConfig.find(w => w.id === id)?.visible ?? true;

  const sortedWidgetIds = [...widgetConfig]
    .sort((a, b) => a.orden - b.orden)
    .map(w => w.id)
    .filter(id => !id.startsWith('kpi_'));

  // ── Export CSV ─────────────────────────────────────────────────────────────

  const handleExportCSV = useCallback(() => {
    const headers = [
      'OT', 'Estado', 'Rubro', 'Prioridad', 'Responsable',
      ...(puedeVerCostos ? ['Costo (Gs.)'] : []),
      'Avance %', 'Nivel Riesgo', 'Última Modificación',
    ];
    const rows = ordenesFiltradas.map(o => [
      o.ot, o.estado, o.rubro ?? '', o.prioridad ?? '', o.responsable ?? '',
      ...(puedeVerCostos ? [o.costo != null ? String(o.costo) : ''] : []),
      o.porcentaje_avance != null ? String(o.porcentaje_avance) : '0',
      o.nivel_riesgo ?? '', fechaCorta(o.updated_at ?? o.created_at),
    ]);
    const csv = [headers, ...rows]
      .map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dashboard_${proyectoLabel.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [ordenesFiltradas, proyectoLabel, puedeVerCostos]);

  // ── Export HTML ────────────────────────────────────────────────────────────

  const handleExportHTML = useCallback(() => {
    const fechaHoy = new Date().toLocaleDateString('es-PY', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const estadoRows = [...ESTADOS.map(e => ({ estado: e, count: porEstado[e] ?? 0 })), { estado: 'Sin estado', count: sinEstado }];

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Dashboard Plan-OTs — ${proyectoLabel}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Arial,sans-serif;background:#F8FAFC;color:#1E293B;padding:24px}
h1{font-size:22px;font-weight:900;color:#2563EB;margin-bottom:4px}
.sub{font-size:12px;color:#94A3B8;margin-bottom:24px}
.row{display:flex;gap:12px;margin-bottom:20px;flex-wrap:wrap}
.card{background:#fff;border:1px solid #E2E8F0;border-radius:8px;padding:16px 18px;flex:1;min-width:160px}
.lbl{font-size:10px;font-weight:700;color:#94A3B8;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px}
.val{font-size:26px;font-weight:800;color:#1E293B}
.val.blue{color:#2563EB}.val.red{color:#EF4444}
.stitle{font-size:11px;font-weight:700;color:#64748B;text-transform:uppercase;letter-spacing:.5px;border-bottom:1.5px solid #E2E8F0;padding-bottom:8px;margin-bottom:12px;margin-top:20px}
.bar-row{display:flex;align-items:center;gap:10px;margin-bottom:5px;font-size:12px}
.bar-label{width:150px;flex-shrink:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#475569;font-weight:600}
.bar-track{flex:1;height:8px;background:#F1F5F9;border-radius:4px;overflow:hidden}
.bar-fill{height:100%;background:linear-gradient(90deg,#2462C9,#1E3A5F);border-radius:4px}
table{width:100%;border-collapse:collapse;font-size:12px;margin-top:4px}
th{background:#F1F5F9;padding:8px 10px;text-align:left;font-size:10px;font-weight:700;color:#64748B;text-transform:uppercase;letter-spacing:.3px}
td{padding:7px 10px;border-bottom:1px solid #F1F5F9;color:#1E293B}
footer{margin-top:28px;font-size:10px;color:#CBD5E1;text-align:center;padding-top:12px;border-top:1px solid #E2E8F0}
</style>
</head>
<body>
<h1>Plan-OTs · Dashboard de Indicadores</h1>
<div class="sub">${proyectoLabel} · ${fechaHoy} · BBC Facility Services · Guaraní 3D</div>
<div class="stitle">KPIs Principales</div>
<div class="row">
  <div class="card"><div class="lbl">Total OTs</div><div class="val">${total}</div></div>
  <div class="card"><div class="lbl">Avance General</div><div class="val blue">${avancePromedio}%</div></div>
  <div class="card"><div class="lbl">OTs en Riesgo</div><div class="val ${riesgo > 0 ? 'red' : ''}">${riesgo}</div></div>
  ${puedeVerCostos ? `<div class="card"><div class="lbl">Costo Total</div><div class="val" style="font-size:18px">${formatGs(costoTotal)}</div></div>` : ''}
</div>
<div class="stitle">Por Estado</div>
<div class="row">
${estadoRows.map(({ estado, count }) =>
  `<div class="card"><div class="lbl">${estado}</div><div class="val">${count}</div></div>`
).join('\n')}
</div>
<div class="stitle">Por Rubro</div>
${porRubro.map(([rubro, count]) => {
  const pct = total ? Math.round(count / total * 100) : 0;
  return `<div class="bar-row">
  <div class="bar-label">${rubro}</div>
  <div class="bar-track"><div class="bar-fill" style="width:${Math.round(count / maxRubro * 100)}%"></div></div>
  <span style="font-weight:700;min-width:20px;text-align:right">${count}</span>
  <span style="color:#94A3B8;min-width:32px;text-align:right">${pct}%</span>
</div>`;
}).join('')}
<div class="stitle">Últimas OTs Modificadas</div>
<table>
<thead><tr><th>OT</th><th>Estado</th><th>Responsable</th><th>Última Mod.</th></tr></thead>
<tbody>
${ultimas.map(o => `<tr>
  <td><strong>${o.ot}</strong></td>
  <td style="color:${ESTADO_COLOR[o.estado] ?? '#6B7280'};font-weight:600">${o.estado}</td>
  <td>${o.responsable ?? '—'}</td>
  <td style="color:#94A3B8">${fechaCorta(o.updated_at ?? o.created_at)}</td>
</tr>`).join('')}
</tbody>
</table>
<footer>Plan-OTs · Guaraní 3D · Grupo Díaz Villaverde · ${fechaHoy}</footer>
</body>
</html>`;

    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dashboard_${proyectoLabel.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.html`;
    a.click();
    URL.revokeObjectURL(url);
  }, [porRubro, porEstado, sinEstado, proyectoLabel, maxRubro, ultimas, puedeVerCostos, total, avancePromedio, riesgo, costoTotal]);

  // ── Export PDF ─────────────────────────────────────────────────────────────

  const handleExportPDF = useCallback(() => {
    const fechaHoy = new Date().toLocaleDateString('es-PY', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const estadoRows = [...ESTADOS.map(e => ({ estado: e, count: porEstado[e] ?? 0 })), { estado: 'Sin estado', count: sinEstado }];

    const estColors: Record<string, string> = {
      'Pendiente': '#EF4444', 'En proceso': '#3B82F6',
      'Cerrada': '#22C55E', 'No aplica': '#6B7280',
    };

    const hdr = () => `
      <div style="background:#0B1929;display:flex;align-items:center;justify-content:space-between;padding:0 14mm;height:18mm;box-sizing:border-box;flex-shrink:0">
        <div>
          <div style="font-family:Arial,sans-serif;font-size:17pt;font-weight:900;color:#2563EB;line-height:1">Plan-OTs</div>
          <div style="font-family:Arial,sans-serif;font-size:7pt;color:rgba(255,255,255,.45);letter-spacing:1.5px;text-transform:uppercase;margin-top:2px">Dashboard de Indicadores</div>
        </div>
        <div style="text-align:right">
          <div style="font-family:Arial,sans-serif;font-size:9pt;font-weight:700;color:#fff">${proyectoLabel}</div>
          <div style="font-family:Arial,sans-serif;font-size:7pt;color:rgba(255,255,255,.4);margin-top:2px">${fechaHoy} · BBC Facility Services</div>
        </div>
      </div>
      <div style="height:2px;background:#2563EB;flex-shrink:0"></div>`;

    const ftr = (n: number) => `
      <div style="height:2px;background:#2563EB;flex-shrink:0"></div>
      <div style="background:#0B1929;padding:3mm 14mm;display:flex;align-items:center;justify-content:space-between;flex-shrink:0">
        <div style="font-family:Arial,sans-serif;font-size:6pt;color:rgba(255,255,255,.3)">BBC Facility Services · Guaraní 3D · Grupo Díaz Villaverde · Plan-OTs</div>
        <div style="font-family:Arial,sans-serif;font-size:7pt;font-weight:700;color:rgba(255,255,255,.6)">Pág. ${n}</div>
      </div>`;

    const page = (body: string, n: number) =>
      `<div style="width:210mm;height:297mm;display:flex;flex-direction:column;background:#fff;page-break-after:always;box-sizing:border-box">
        ${hdr()}
        <div style="flex:1;padding:7mm 14mm;overflow:hidden;box-sizing:border-box">${body}</div>
        ${ftr(n)}
      </div>`;

    const secTitle = (t: string) =>
      `<div style="font-family:Arial,sans-serif;font-size:8pt;font-weight:800;color:#64748B;text-transform:uppercase;letter-spacing:.5px;border-bottom:1.5px solid #E2E8F0;padding-bottom:3mm;margin-bottom:5mm">${t}</div>`;

    const kpiCard = (lbl: string, val: string, sub: string, color = '#1E293B') =>
      `<div style="flex:1;background:#F8FAFC;border:1px solid #E2E8F0;border-radius:8px;padding:10px 12px">
        <div style="font-family:Arial,sans-serif;font-size:7pt;font-weight:700;color:#94A3B8;text-transform:uppercase;letter-spacing:.5px;margin-bottom:5px">${lbl}</div>
        <div style="font-family:Arial,sans-serif;font-size:16pt;font-weight:800;color:${color};line-height:1;margin-bottom:3px">${val}</div>
        <div style="font-family:Arial,sans-serif;font-size:7pt;color:#94A3B8">${sub}</div>
      </div>`;

    const body1 = `
      ${secTitle('KPIs Principales')}
      <div style="display:flex;gap:8px;margin-bottom:6mm">
        ${kpiCard('Total OTs', String(total), `${modificadasUltSem} act. esta semana`)}
        ${kpiCard('Avance General', `${avancePromedio}%`, 'promedio del proyecto', '#2563EB')}
        ${kpiCard('OTs en Riesgo', String(riesgo), riesgo > 0 ? 'requieren atención' : 'sin alertas', riesgo > 0 ? '#EF4444' : '#16A34A')}
        ${puedeVerCostos ? kpiCard('Costo Total', formatGs(costoTotal), 'acumulado del proyecto') : ''}
      </div>
      ${secTitle('Por Estado')}
      <div style="display:flex;gap:8px;margin-bottom:6mm">
        ${estadoRows.map(({ estado, count }) =>
          `<div style="flex:1;background:#F8FAFC;border:1px solid #E2E8F0;border-radius:8px;padding:8px 10px">
            <div style="display:flex;align-items:center;gap:4px;margin-bottom:4px">
              <div style="width:7px;height:7px;border-radius:50%;background:${estColors[estado] ?? '#CBD5E1'}"></div>
              <div style="font-family:Arial,sans-serif;font-size:6.5pt;font-weight:700;color:#64748B;text-transform:uppercase">${estado}</div>
            </div>
            <div style="font-family:Arial,sans-serif;font-size:17pt;font-weight:800;color:#1E293B">${count}</div>
          </div>`
        ).join('')}
      </div>
      ${secTitle('Por Rubro')}
      <div style="display:flex;flex-direction:column;gap:5px">
        ${porRubro.slice(0, 18).map(([rubro, count]) => {
          const pct = total ? Math.round(count / total * 100) : 0;
          return `<div style="display:flex;align-items:center;gap:8px">
            <div style="font-family:Arial,sans-serif;font-size:8pt;color:#475569;width:130px;flex-shrink:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${rubro}</div>
            <div style="flex:1;height:7px;background:#F1F5F9;border-radius:4px;overflow:hidden">
              <div style="height:100%;background:linear-gradient(90deg,#2462C9,#1E3A5F);width:${Math.round(count / maxRubro * 100)}%;border-radius:4px"></div>
            </div>
            <div style="font-family:Arial,sans-serif;font-size:8pt;font-weight:700;color:#1E293B;width:18px;text-align:right">${count}</div>
            <div style="font-family:Arial,sans-serif;font-size:7pt;color:#94A3B8;width:28px;text-align:right">${pct}%</div>
          </div>`;
        }).join('')}
      </div>`;

    const body2 = `
      ${secTitle('Últimas OTs Modificadas')}
      <table style="width:100%;border-collapse:collapse;font-size:8.5pt">
        <thead>
          <tr style="background:#0B1929">
            ${['OT', 'ESTADO', 'RESPONSABLE', 'ÚLTIMA MOD.'].map(h =>
              `<th style="padding:6px 8px;text-align:left;font-family:Arial,sans-serif;font-size:7pt;font-weight:700;color:#fff;letter-spacing:.3px">${h}</th>`
            ).join('')}
          </tr>
        </thead>
        <tbody>
          ${ultimas.map((o, i) =>
            `<tr style="background:${i % 2 === 0 ? '#fff' : '#F8FAFC'}">
              <td style="padding:6px 8px;font-family:Arial,sans-serif;font-size:8.5pt;font-weight:700;color:#1E293B;border-bottom:1px solid #F1F5F9">${o.ot}</td>
              <td style="padding:6px 8px;border-bottom:1px solid #F1F5F9">
                <span style="font-family:Arial,sans-serif;font-size:8pt;color:${estColors[o.estado] ?? '#6B7280'};font-weight:600">${o.estado}</span>
              </td>
              <td style="padding:6px 8px;font-family:Arial,sans-serif;font-size:8pt;color:#475569;border-bottom:1px solid #F1F5F9">${o.responsable ?? '—'}</td>
              <td style="padding:6px 8px;font-family:Arial,sans-serif;font-size:8pt;color:#94A3B8;border-bottom:1px solid #F1F5F9">${fechaCorta(o.updated_at ?? o.created_at)}</td>
            </tr>`
          ).join('')}
        </tbody>
      </table>`;

    const allHtml = page(body1, 1) + page(body2, 2);
    const pw = window.open('', '_blank', 'width=900,height=700,scrollbars=yes');
    if (!pw) { alert('Habilitá ventanas emergentes para generar el PDF.'); return; }
    pw.document.open();
    pw.document.write(`<!DOCTYPE html>
<html lang="es"><head>
<meta charset="UTF-8">
<title>Dashboard_Plan-OTs_${new Date().toISOString().slice(0, 10)}.pdf</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#888;font-family:Arial,sans-serif}
@media screen{body{padding:10px;display:flex;flex-direction:column;align-items:center;gap:6px}}
@media print{@page{size:A4 portrait;margin:0}body{background:#fff;padding:0;display:block}}
</style>
</head><body>${allHtml}</body></html>`);
    pw.document.close();
    setTimeout(() => {
      pw.focus();
      pw.print();
      pw.addEventListener('afterprint', () => setTimeout(() => pw.close(), 400));
    }, 600);
  }, [porRubro, porEstado, sinEstado, proyectoLabel, maxRubro, ultimas, puedeVerCostos, total, avancePromedio, riesgo, costoTotal, modificadasUltSem]);

  // ── Render de widgets por orden ────────────────────────────────────────────

  const renderWidget = (id: WidgetId) => {
    switch (id) {
      case 'lectura':
        return <Seccion key="lectura" titulo="Lectura de la operación">
          {lectura.length === 0
            ? <p style={{ margin: 0, color: '#64748B', fontSize: 14 }}>Todavía no hay OTs visibles. Si vas a probar en campo, pedile al Creador acceso a una obra y registrá una OT para empezar a medir la operación.</p>
            : <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 12 }}>
              {lectura.map(item => <div key={item.titulo} style={{ ...smallCard, borderTop: `3px solid ${item.tono}` }}>
                <strong style={{ display: 'block', fontSize: 13, color: item.tono, marginBottom: 7 }}>{item.titulo}</strong>
                <span style={{ fontSize: 13, lineHeight: 1.5, color: '#334155' }}>{item.detalle}</span>
              </div>)}
            </div>}
        </Seccion>;
      case 'kpis':
        return (
          <div key="kpis" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 14 }}>
            {isVisible('kpi_total') && <KPICard label="Total OTs" valor={total} subtitle={modificadasUltSem > 0 ? `${modificadasUltSem} actualizadas última semana` : 'Sin cambios esta semana'} />}
            {isVisible('kpi_avance') && <KPICard label="Avance general" valor={`${avancePromedio}%`} color={avancePromedio >= 80 ? '#15803D' : '#2563EB'} bar={avancePromedio} />}
            {isVisible('kpi_riesgo') && <KPICard label="OTs en riesgo" valor={riesgo} color={riesgo > 0 ? '#DC2626' : '#15803D'} badge={riesgo > 0 ? { text: 'Crítico', color: '#DC2626' } : { text: 'OK', color: '#15803D' }} />}
            {puedeVerCostos && isVisible('kpi_costo') && <KPICard label="Costo total" valor={formatGs(costoTotal)} fontSize={20} />}
          </div>
        );

      case 'por_estado':
        return (
          <Seccion key="por_estado" titulo="Por Estado">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8 }}>
              {ESTADOS.map(e => (
                <div key={e} style={smallCard}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 9, height: 9, borderRadius: '50%', background: ESTADO_COLOR[e] }} />
                    <span style={{ fontSize: 11, color: '#6B7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4 }}>{e}</span>
                  </div>
                  <div style={{ fontSize: 24, fontWeight: 800, color: '#0F172A', marginTop: 4 }}>{porEstado[e] ?? 0}</div>
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
        );

      case 'por_rubro':
        return (
          <Seccion key="por_rubro" titulo="Por Rubro">
            {porRubro.length === 0 ? (
              <div style={{ fontSize: 13, color: '#94A3B8', padding: 12, textAlign: 'center' }}>Sin rubros</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {porRubro.map(([rubro, count]) => {
                  const pct = Math.round((count / total) * 100);
                  const barPct = (count / maxRubro) * 100;
                  return (
                    <div key={rubro} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: 12, color: '#374151', fontWeight: 600, minWidth: 150, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{rubro}</span>
                      <div style={{ flex: 1, height: 10, background: '#F1F5F9', borderRadius: 999, overflow: 'hidden' }}>
                        <div style={{ width: `${barPct}%`, height: '100%', background: 'linear-gradient(90deg, #2462C9, #1E3A5F)', borderRadius: 999 }} />
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#0F172A', minWidth: 36, textAlign: 'right' }}>{count}</span>
                      <span style={{ fontSize: 11, color: '#94A3B8', minWidth: 36, textAlign: 'right' }}>{pct}%</span>
                    </div>
                  );
                })}
              </div>
            )}
          </Seccion>
        );

      case 'tendencia': {
        const max = Math.max(1, ...tendencia.map(([, cantidad]) => cantidad));
        const peor = [...tendencia].sort((a, b) => b[1] - a[1])[0];
        return <Seccion key="tendencia" titulo="Ingresos de reclamos en el tiempo">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
            <span style={{ color: '#475569', fontSize: 13 }}>{peor ? `Mayor volumen: ${peor[0]} · ${peor[1]} ${peor[1] === 1 ? 'reclamo' : 'reclamos'}` : 'Sin ingresos para los filtros seleccionados.'}</span>
            <select className="app-select" aria-label="Agrupar reclamos por" value={periodo} onChange={e => setPeriodo(e.target.value as 'semana' | 'mes')}><option value="mes">Por mes</option><option value="semana">Por semana</option></select>
          </div>
          <div style={{ display: 'grid', gap: 9 }}>
            {tendencia.map(([clave, cantidad]) => <div key={clave} style={{ display: 'grid', gridTemplateColumns: '90px minmax(0,1fr) 35px', alignItems: 'center', gap: 10, fontSize: 12 }}>
              <span style={{ color: '#475569' }}>{clave}</span>
              <div style={{ height: 12, borderRadius: 999, background: '#F1F5F9', overflow: 'hidden' }}><div style={{ height: '100%', width: `${cantidad / max * 100}%`, background: '#3B599B' }} /></div>
              <strong style={{ textAlign: 'right' }}>{cantidad}</strong>
            </div>)}
          </div>
        </Seccion>;
      }

      case 'costos':
        return puedeVerCostos ? <Seccion key="costos" titulo="Costo registrado por obra y rubro">
          {costosPorObra.length === 0 ? <p style={{ margin: 0, fontSize: 13, color: '#64748B' }}>Todavía no hay costos registrados en esta selección.</p>
            : <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 22 }}>
              {[{ titulo: 'Obras', datos: costosPorObra }, { titulo: 'Rubros', datos: costosPorRubro }].map(grupo => <div key={grupo.titulo}>
                <strong style={{ display: 'block', marginBottom: 10, fontSize: 13 }}>{grupo.titulo}</strong>
                <div style={{ display: 'grid', gap: 12 }}>{grupo.datos.map(d => <div key={d.label}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12, marginBottom: 4 }}><span>{d.label}</span><strong style={{ whiteSpace: 'nowrap' }}>{formatGs(d.monto)}</strong></div>
                  <div style={{ height: 9, background: '#F1F5F9', borderRadius: 999, overflow: 'hidden' }}><div style={{ width: `${d.monto / grupo.datos[0].monto * 100}%`, height: '100%', background: '#3B599B' }} /></div>
                </div>)}</div>
              </div>)}
            </div>}
        </Seccion> : null;

      case 'ultimas_ots':
        return (
          <Seccion key="ultimas_ots" titulo="Últimas OTs modificadas">
            {ultimas.length === 0 ? (
              <div style={{ fontSize: 13, color: '#94A3B8', padding: 12, textAlign: 'center' }}>Sin OTs todavía</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr>
                    {['OT', 'Estado', 'Responsable', 'Última mod.'].map(h => (
                      <th key={h} style={{ textAlign: 'left', padding: '8px 6px', fontSize: 10, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.4, borderBottom: '1px solid #E5E7EB' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ultimas.map(o => (
                    <tr key={o.id} style={{ borderBottom: '1px solid #F3F4F6' }}>
                      <td style={{ padding: '10px 6px', fontFamily: 'monospace', fontWeight: 700, color: '#0F172A' }}>{o.ot}</td>
                      <td style={{ padding: '10px 6px' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: ESTADO_COLOR[o.estado], fontWeight: 600 }}>
                          <span style={{ width: 8, height: 8, borderRadius: '50%', background: ESTADO_COLOR[o.estado] }} />
                          {o.estado}
                        </span>
                      </td>
                      <td style={{ padding: '10px 6px', color: '#475569' }}>{o.responsable || '—'}</td>
                      <td style={{ padding: '10px 6px', color: '#94A3B8' }}>{fechaCorta(o.updated_at ?? o.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Seccion>
        );

      default:
        return null;
    }
  };

  // ── Render principal ───────────────────────────────────────────────────────

  return (
    <div style={{ padding: 28, background: '#F9FAFB', minHeight: '100%', overflowY: 'auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 22, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: '#0F172A', margin: 0 }}>
            {saludo()}, {userName} 👋
          </h1>
          <p style={{ fontSize: 13, color: '#6B7280', margin: '4px 0 0', textTransform: 'capitalize' }}>
            {fechaLarga()}
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 6 }}>
            <button type="button" onClick={handleExportCSV} style={btnSecundario}>CSV</button>
            <button type="button" onClick={handleExportHTML} style={btnSecundario}>HTML</button>
            <button type="button" onClick={handleExportPDF} style={btnPrimario}>🖨 PDF</button>
          </div>
          <FiltroProyecto value={filtroProyecto} onChange={setFiltroProyecto} proyectos={proyectos} />
        </div>
      </div>

      <section aria-label="Filtros del dashboard" style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, padding: 14, marginBottom: 18 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, alignItems: 'end' }}>
          <label style={filterLabel}>Estado<select className="app-select" value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)}><option value="">Todos</option>{ESTADOS.map(e => <option key={e} value={e}>{e}</option>)}</select></label>
          <label style={filterLabel}>Riesgo<select className="app-select" value={filtroRiesgo} onChange={e => setFiltroRiesgo(e.target.value)}><option value="">Todos</option>{['Bajo', 'Medio', 'Alto', 'Extremo'].map(e => <option key={e} value={e}>{e}</option>)}</select></label>
          <label style={filterLabel}>Rubro<select className="app-select" value={filtroRubro} onChange={e => setFiltroRubro(e.target.value)}><option value="">Todos</option>{opcionesRubro.map(e => <option key={e} value={e}>{e}</option>)}</select></label>
          <label style={filterLabel}>Encargado<select className="app-select" value={filtroResponsable} onChange={e => setFiltroResponsable(e.target.value)}><option value="">Todos</option>{opcionesResponsable.map(e => <option key={e} value={e}>{e}</option>)}</select></label>
          <label style={filterLabel}>Desde<input type="date" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)} style={filterDate} /></label>
          <label style={filterLabel}>Hasta<input type="date" min={fechaDesde || undefined} value={fechaHasta} onChange={e => setFechaHasta(e.target.value)} style={filterDate} /></label>
          <button type="button" style={{ ...btnSecundario, height: 42 }} onClick={() => { setFiltroProyecto(''); setFiltroEstado(''); setFiltroRiesgo(''); setFiltroRubro(''); setFiltroResponsable(''); setFechaDesde(''); setFechaHasta(''); }}>Limpiar filtros</button>
        </div>
      </section>

      {/* KPI Section header con colapso */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #E5E7EB', paddingBottom: 8, marginBottom: 14 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          Dashboard de indicadores
        </span>
        <button type="button" onClick={() => setColapsado(c => !c)} style={btnColapsar}>
          {colapsado ? '▼ EXPANDIR' : '▲ COLAPSAR'}
        </button>
      </div>

      {/* Widgets en orden configurado */}
      {!colapsado && sortedWidgetIds.map(id => isVisible(id) ? renderWidget(id) : null)}

    </div>
  );
}

// ─── Estilos inline compartidos ───────────────────────────────────────────────

const btnSecundario: React.CSSProperties = {
  height: 32, padding: '0 14px',
  border: '1px solid #E5E7EB', borderRadius: 7,
  background: '#fff', color: '#475569',
  fontSize: 12, fontWeight: 600, cursor: 'pointer',
  fontFamily: 'inherit', transition: 'all 150ms',
};

const btnPrimario: React.CSSProperties = {
  height: 32, padding: '0 16px',
  border: 'none', borderRadius: 7,
  background: '#2563EB', color: '#fff',
  fontSize: 12, fontWeight: 700, cursor: 'pointer',
  fontFamily: 'inherit', boxShadow: '0 1px 4px rgba(37,99,235,.3)',
};

const btnColapsar: React.CSSProperties = {
  fontSize: 11, fontWeight: 700,
  color: '#2563EB', background: 'none',
  border: 'none', cursor: 'pointer',
  letterSpacing: '0.05em', fontFamily: 'inherit',
  textTransform: 'uppercase',
};

const smallCard: React.CSSProperties = {
  background: '#F8FAFC',
  border: '1px solid #E5E7EB',
  borderRadius: 10,
  padding: '12px 14px',
};

const filterLabel: React.CSSProperties = { display: 'grid', gap: 5, color: '#475569', fontSize: 12, fontWeight: 600 };
const filterDate: React.CSSProperties = { minHeight: 42, minWidth: 0, width: '100%', padding: '8px 12px', border: '1px solid var(--border-default)', borderRadius: 8, background: 'var(--bg-surface)', color: 'var(--text-primary)', font: '500 13px var(--font-sans)' };

// ─── Sub-componentes ──────────────────────────────────────────────────────────

export function FiltroProyecto({
  value, onChange, proyectos,
}: { value: string; onChange: (v: string) => void; proyectos: { id: string; nombre: string }[] }) {
  return (
    <select
      className="app-select"
      value={value}
      onChange={e => onChange(e.target.value)}
      style={{
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
      <h2 style={{ fontSize: 11, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.5, margin: '0 0 12px' }}>
        {titulo}
      </h2>
      {children}
    </section>
  );
}

function KPICard({
  label, valor, subtitle, color = '#0F172A', bar, badge, fontSize = 30,
}: {
  label: string; valor: string | number; subtitle?: string;
  color?: string; bar?: number; badge?: { text: string; color: string }; fontSize?: number;
}) {
  return (
    <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, padding: '16px 18px', boxShadow: '0 1px 2px rgba(15,23,42,0.04)' }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <div style={{ fontSize, fontWeight: 800, color, lineHeight: 1 }}>{valor}</div>
        {badge && (
          <span style={{ fontSize: 10, fontWeight: 700, color: badge.color, background: badge.color + '18', border: `1px solid ${badge.color}40`, borderRadius: 999, padding: '3px 9px', textTransform: 'uppercase', letterSpacing: 0.4 }}>
            {badge.text}
          </span>
        )}
      </div>
      {bar != null && (
        <div style={{ marginTop: 10, height: 6, background: '#F1F5F9', borderRadius: 999, overflow: 'hidden' }}>
          <div style={{ width: `${Math.max(0, Math.min(100, bar))}%`, height: '100%', background: 'linear-gradient(90deg, #2462C9, #1E3A5F)' }} />
        </div>
      )}
      {subtitle && <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 8 }}>{subtitle}</div>}
    </div>
  );
}
