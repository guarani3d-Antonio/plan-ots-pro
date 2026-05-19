// src/components/views/Gantt.tsx
//
// Diagrama de Gantt profesional con:
//   - Toolbar (48px): navegación de mes ‹ › + toggle día/semana/mes + leyenda +
//     zoom + filtro de proyecto.
//   - Gantt grid (flex 1): panel izq 280px sticky + timeline scroll horizontal.
//     thead sticky top. Línea HOY vertical roja punteada con badge.
//   - Footer (160px): cards de OTs sin fechas asignadas con scroll horizontal.

import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { useOrdenesStore } from '../../stores/ordenesStore';
import { useProyectosStore } from '../../stores/proyectosStore';
import { ModalDetalleOT } from '../grilla/ModalDetalleOT';
import type { OrdenLocal } from '../../types/orden';
import { colorEstado } from '../../utils/calculos';

const DAY_MS = 86400000;

// Ancho base por columna según escala (multiplica por zoomFactor).
const ANCHO_BASE: Record<'dia' | 'semana' | 'mes', number> = {
  dia: 60, semana: 120, mes: 160,
};
// Días promedio por columna (para conversión px↔día).
const DIAS_POR_COLUMNA: Record<'dia' | 'semana' | 'mes', number> = {
  dia: 1, semana: 7, mes: 30,
};

// ─── Helpers de fecha ───────────────────────────────────────────────────────
function startOfDay(d: Date): Date {
  const x = new Date(d); x.setHours(0, 0, 0, 0); return x;
}
function startOfWeek(d: Date): Date {
  // Lunes como inicio de semana (es-PY).
  const x = startOfDay(d);
  const dow = x.getDay(); // 0=Dom, 1=Lun, ..., 6=Sab
  const offset = (dow === 0 ? -6 : 1 - dow);
  x.setDate(x.getDate() + offset);
  return x;
}
function startOfMonth(d: Date): Date {
  const x = startOfDay(d); x.setDate(1); return x;
}
function endOfMonth(d: Date): Date {
  const x = startOfMonth(d); x.setMonth(x.getMonth() + 1); x.setDate(0); return x;
}
function addDays(d: Date, n: number): Date {
  const x = new Date(d); x.setDate(x.getDate() + n); return x;
}
function addMonths(d: Date, n: number): Date {
  const x = new Date(d); x.setMonth(x.getMonth() + n); return x;
}
function diffDays(a: Date, b: Date): number {
  return (startOfDay(a).getTime() - startOfDay(b).getTime()) / DAY_MS;
}

interface ColumnaGantt {
  inicio: Date;
  fin:    Date; // exclusivo
  label:  string;
  esHoy:  boolean;
}

function generarColumnas(
  escala: 'dia' | 'semana' | 'mes',
  fechaMin: Date,
  fechaMax: Date,
): ColumnaGantt[] {
  const out: ColumnaGantt[] = [];
  const hoyMs = startOfDay(new Date()).getTime();

  if (escala === 'dia') {
    let cur = startOfDay(fechaMin);
    const end = startOfDay(fechaMax);
    while (cur.getTime() <= end.getTime()) {
      const next = addDays(cur, 1);
      out.push({
        inicio: cur,
        fin: next,
        label: cur.toLocaleDateString('es-PY', { day: '2-digit', month: 'short' }).toUpperCase().replace('.', ''),
        esHoy: cur.getTime() === hoyMs,
      });
      cur = next;
    }
  } else if (escala === 'semana') {
    let cur = startOfWeek(fechaMin);
    const end = startOfWeek(fechaMax);
    while (cur.getTime() <= end.getTime()) {
      const next = addDays(cur, 7);
      const finSem = addDays(cur, 6);
      const mes = cur.toLocaleDateString('es-PY', { month: 'short' }).toUpperCase().replace('.', '');
      out.push({
        inicio: cur,
        fin: next,
        label: `${mes} ${cur.getDate()}-${finSem.getDate()}`,
        esHoy: hoyMs >= cur.getTime() && hoyMs < next.getTime(),
      });
      cur = next;
    }
  } else {
    let cur = startOfMonth(fechaMin);
    const end = startOfMonth(fechaMax);
    while (cur.getTime() <= end.getTime()) {
      const next = addMonths(cur, 1);
      out.push({
        inicio: cur,
        fin: next,
        label: cur.toLocaleDateString('es-PY', { month: 'long' }).toUpperCase(),
        esHoy: hoyMs >= cur.getTime() && hoyMs < next.getTime(),
      });
      cur = next;
    }
  }
  return out;
}

interface EstiloBarra {
  bg:     string;
  border: string;
  label:  string;
  dashed: boolean;
  glow:   boolean;
  avance: string;
}

function obtenerEstiloBarra(o: OrdenLocal, retrasada: boolean): EstiloBarra {
  const pct = o.porcentaje_avance ?? 0;
  if (o.estado === 'Cerrada') {
    return { bg: '#16A34A', border: '#16A34A', label: 'COMPLETO',
             dashed: false, glow: false, avance: '#15803D' };
  }
  if (retrasada) {
    return { bg: '#DC2626', border: '#DC2626', label: `RETRASADO: ${pct}%`,
             dashed: true, glow: true, avance: '#991B1B' };
  }
  if (o.estado === 'En proceso') {
    return { bg: '#2563EB', border: '#2563EB', label: `EN PROCESO${pct > 0 ? `: ${pct}%` : ''}`,
             dashed: false, glow: false, avance: '#1E40AF' };
  }
  if (o.estado === 'Pendiente') {
    return { bg: '#EF4444', border: '#EF4444', label: 'PENDIENTE',
             dashed: false, glow: false, avance: '#B91C1C' };
  }
  // No aplica u otros
  return { bg: '#6B7280', border: '#6B7280', label: o.estado.toUpperCase(),
           dashed: false, glow: false, avance: '#4B5563' };
}

function esRetrasada(o: OrdenLocal): boolean {
  if (o.estado !== 'En proceso') return false;
  if (!o.fecha_fin_trabajos) return false;
  return Date.now() > new Date(o.fecha_fin_trabajos).getTime();
}

// ─── Componente ─────────────────────────────────────────────────────────────
export default function Gantt() {
  const ordenes               = useOrdenesStore(s => s.ordenes);
  const cargarTodasLasOrdenes = useOrdenesStore(s => s.cargarTodasLasOrdenes);
  const proyectos             = useProyectosStore(s => s.proyectos);
  const cargarProyectos       = useProyectosStore(s => s.cargarProyectos);

  const [escala, setEscala]                 = useState<'dia' | 'semana' | 'mes'>('semana');
  const [zoomFactor, setZoomFactor]         = useState(1);
  const [mesActual, setMesActual]           = useState(() => startOfMonth(new Date()));
  const [filtroProyecto, setFiltroProyecto] = useState('');
  const [modalOrden, setModalOrden]         = useState<OrdenLocal | null>(null);

  // Filtros adicionales (mismo set que VistaGrilla.tsx)
  const [filtroBuscar, setFiltroBuscar]         = useState('');
  const [filtroEstado, setFiltroEstado]         = useState<string>('Todos');
  const [filtroPrioridad, setFiltroPrioridad]   = useState<string>('Todas');
  const [filtroRubro, setFiltroRubro]           = useState<string>('Todos');
  const [filtroRiesgo, setFiltroRiesgo]         = useState<string>('Todos');
  const [mostrarSinFechas, setMostrarSinFechas] = useState(false);

  const timelineRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    cargarProyectos();
    cargarTodasLasOrdenes();
  }, [cargarProyectos, cargarTodasLasOrdenes]);

  // ── Filtrado por proyecto ──
  const ordenesFiltradas = useMemo(
    () => filtroProyecto ? ordenes.filter(o => o.proyecto_id === filtroProyecto) : ordenes,
    [ordenes, filtroProyecto],
  );

  // ── Split: con fechas / sin fechas ──
  const otConFechas = useMemo(
    () => ordenesFiltradas.filter(o => o.fecha_inicio_trabajos && o.fecha_fin_trabajos),
    [ordenesFiltradas],
  );
  const otSinFechas = useMemo(
    () => ordenesFiltradas.filter(o => !o.fecha_inicio_trabajos || !o.fecha_fin_trabajos),
    [ordenesFiltradas],
  );

  // ── Rubros únicos para el select (basado en TODAS las del proyecto, no en las filtradas) ──
  const rubrosUnicos = useMemo(
    () => [...new Set(ordenesFiltradas.map(o => o.rubro).filter(Boolean))].sort(),
    [ordenesFiltradas],
  );

  // ── Aplica los 5 filtros (buscar/estado/prioridad/rubro/riesgo) a una lista. ──
  const aplicarFiltros = useMemo(() => {
    const q = filtroBuscar.toLowerCase();
    return (lista: OrdenLocal[]) => lista.filter(o => {
      const buscarOk = !q ||
        o.ot?.toLowerCase().includes(q) ||
        o.descripcion?.toLowerCase().includes(q) ||
        o.responsable?.toLowerCase().includes(q);
      const estadoOk    = filtroEstado    === 'Todos'  || o.estado    === filtroEstado;
      const prioridadOk = filtroPrioridad === 'Todas'  || o.prioridad === filtroPrioridad;
      const rubroOk     = filtroRubro     === 'Todos'  || o.rubro     === filtroRubro;
      const riesgoOk    = filtroRiesgo    === 'Todos'  || o.nivel_riesgo === filtroRiesgo;
      return buscarOk && estadoOk && prioridadOk && rubroOk && riesgoOk;
    });
  }, [filtroBuscar, filtroEstado, filtroPrioridad, filtroRubro, filtroRiesgo]);

  const otConFechasFiltradas = useMemo(() => aplicarFiltros(otConFechas), [aplicarFiltros, otConFechas]);
  const otSinFechasFiltradas = useMemo(() => aplicarFiltros(otSinFechas), [aplicarFiltros, otSinFechas]);

  // ── Rango de fechas del Gantt ──
  const { fechaMin, fechaMax } = useMemo(() => {
    if (otConFechas.length === 0) {
      return { fechaMin: startOfMonth(mesActual), fechaMax: endOfMonth(mesActual) };
    }
    let min = Infinity, max = -Infinity;
    for (const o of otConFechas) {
      const ti = new Date(o.fecha_inicio_trabajos!).getTime();
      const tf = new Date(o.fecha_fin_trabajos!).getTime();
      if (ti < min) min = ti;
      if (tf > max) max = tf;
    }
    return { fechaMin: new Date(min), fechaMax: new Date(max) };
  }, [otConFechas, mesActual]);

  // ── Anchos derivados (zoom × base) ──
  const anchoPorColumna = ANCHO_BASE[escala] * zoomFactor;
  const pxPorDia        = anchoPorColumna / DIAS_POR_COLUMNA[escala];

  // ── Columnas del header del timeline ──
  const columnas = useMemo(
    () => generarColumnas(escala, fechaMin, fechaMax),
    [escala, fechaMin, fechaMax],
  );
  const timelineWidthPx = columnas.length * anchoPorColumna;

  // ── Posición X de "hoy" dentro del timeline ──
  const hoyPx = useMemo(() => {
    const hoy = startOfDay(new Date());
    if (columnas.length === 0) return null;
    const tlInicio = columnas[0].inicio;
    const tlFin    = columnas[columnas.length - 1].fin;
    if (hoy.getTime() < tlInicio.getTime() || hoy.getTime() >= tlFin.getTime()) return null;
    return diffDays(hoy, tlInicio) * pxPorDia;
  }, [columnas, pxPorDia]);

  // ── Scroll del timeline al cambiar mesActual ──
  useEffect(() => {
    if (!timelineRef.current || columnas.length === 0) return;
    const offsetDias = diffDays(mesActual, columnas[0].inicio);
    if (offsetDias < 0) return;
    const left = offsetDias * pxPorDia;
    timelineRef.current.scrollTo({ left, behavior: 'smooth' });
  }, [mesActual, columnas, pxPorDia]);

  // ── Handlers ──
  const mesAnterior  = () => setMesActual(prev => addMonths(prev, -1));
  const mesSiguiente = () => setMesActual(prev => addMonths(prev, 1));
  const zoomIn       = () => setZoomFactor(z => Math.min(3, z * 1.3));
  const zoomOut      = () => setZoomFactor(z => Math.max(0.3, z / 1.3));

  // ── Exportación: CSV de la lista filtrada con fechas ──
  const exportarGanttCSV = () => {
    const filas: (string | number)[][] = [
      ['OT','Descripción','Estado','Prioridad','Rubro','Responsable',
       'Fecha Inicio','Fecha Fin','Duración (días)','% Avance'],
      ...otConFechasFiltradas.map(o => {
        const dias = o.fecha_inicio_trabajos && o.fecha_fin_trabajos
          ? Math.ceil((new Date(o.fecha_fin_trabajos).getTime()
                      - new Date(o.fecha_inicio_trabajos).getTime()) / DAY_MS)
          : '';
        return [
          o.ot, o.descripcion ?? '', o.estado, o.prioridad ?? '',
          o.rubro ?? '', o.responsable ?? '',
          o.fecha_inicio_trabajos ?? '', o.fecha_fin_trabajos ?? '',
          dias, o.porcentaje_avance ?? 0,
        ];
      }),
    ];
    // CSV plano — campos sin coma interna en este dataset. Para mayor seguridad
    // ante valores con comas, escapamos con comillas.
    const csv = filas.map(r => r.map(c => {
      const s = String(c);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(',')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'gantt_plan_ots.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  // ── Exportación: PDF imprimible (window.open + window.print) ──
  const exportarGanttPDF = () => {
    const escapeHtml = (s: string) => s.replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] ?? c));
    const filas = otConFechasFiltradas.map(o => {
      const dias = o.fecha_inicio_trabajos && o.fecha_fin_trabajos
        ? Math.ceil((new Date(o.fecha_fin_trabajos).getTime()
                    - new Date(o.fecha_inicio_trabajos).getTime()) / DAY_MS)
        : '—';
      const color = o.estado === 'Pendiente'  ? '#EF4444'
                  : o.estado === 'En proceso' ? '#3B82F6'
                  : o.estado === 'Cerrada'    ? '#22C55E' : '#6B7280';
      return `<tr style="border-bottom:1px solid #E5E7EB;">
        <td style="padding:8px;font-weight:700;color:#001E40;">${escapeHtml(o.ot ?? '')}</td>
        <td style="padding:8px;font-size:12px;">${escapeHtml(o.descripcion || o.rubro || '—')}</td>
        <td style="padding:8px;"><span style="background:${color}22;color:${color};padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700;">${escapeHtml(o.estado)}</span></td>
        <td style="padding:8px;font-size:12px;">${escapeHtml(o.rubro || '—')}</td>
        <td style="padding:8px;font-size:12px;">${escapeHtml(o.responsable || '—')}</td>
        <td style="padding:8px;font-size:12px;">${escapeHtml(o.fecha_inicio_trabajos || '—')}</td>
        <td style="padding:8px;font-size:12px;">${escapeHtml(o.fecha_fin_trabajos || '—')}</td>
        <td style="padding:8px;text-align:center;font-size:12px;">${dias}d</td>
        <td style="padding:8px;text-align:center;font-size:12px;">${o.porcentaje_avance ?? 0}%</td>
      </tr>`;
    }).join('');

    const html = `<!DOCTYPE html><html><head>
      <meta charset="UTF-8"/>
      <title>Cronograma Gantt — Plan-OTs</title>
      <style>
        body { font-family: Inter, sans-serif; margin: 0; padding: 20px; background: #F9F9FE; }
        @page { size: A4 landscape; margin: 15mm; }
        @media print { .no-print { display:none; } }
        body::before { content:'CONFIDENCIAL'; position:fixed; top:50%; left:50%;
          transform:translate(-50%,-50%) rotate(-35deg); font-size:80px;
          font-weight:900; color:rgba(200,200,200,0.1); pointer-events:none; z-index:0; }
      </style>
    </head><body>
      <div style="background:linear-gradient(135deg,#0B1929,#1E3A5F);color:white;padding:20px 28px;border-radius:8px 8px 0 0;display:flex;justify-content:space-between;align-items:center;margin-bottom:0;">
        <div>
          <div style="font-size:10px;opacity:0.6;text-transform:uppercase;letter-spacing:0.15em;">BBC FACILITY SERVICES</div>
          <div style="font-size:20px;font-weight:800;margin-top:4px;">Cronograma de Ejecución</div>
          <div style="font-size:11px;opacity:0.55;margin-top:2px;">${otConFechasFiltradas.length} órdenes · ${new Date().toLocaleDateString('es-PY')}</div>
        </div>
        <div style="font-size:22px;font-weight:900;color:#A7C8FF;">Plan-OTs</div>
      </div>
      <div style="background:white;border:1px solid #E5E7EB;border-top:none;border-radius:0 0 8px 8px;overflow:hidden;">
        <table style="width:100%;border-collapse:collapse;">
          <thead>
            <tr style="background:#F4F3F8;">
              <th style="padding:10px 8px;text-align:left;font-size:10px;color:#6B7280;text-transform:uppercase;letter-spacing:0.05em;">OT</th>
              <th style="padding:10px 8px;text-align:left;font-size:10px;color:#6B7280;text-transform:uppercase;">Descripción</th>
              <th style="padding:10px 8px;font-size:10px;color:#6B7280;text-transform:uppercase;">Estado</th>
              <th style="padding:10px 8px;font-size:10px;color:#6B7280;text-transform:uppercase;">Rubro</th>
              <th style="padding:10px 8px;font-size:10px;color:#6B7280;text-transform:uppercase;">Responsable</th>
              <th style="padding:10px 8px;font-size:10px;color:#6B7280;text-transform:uppercase;">Inicio</th>
              <th style="padding:10px 8px;font-size:10px;color:#6B7280;text-transform:uppercase;">Fin</th>
              <th style="padding:10px 8px;text-align:center;font-size:10px;color:#6B7280;text-transform:uppercase;">Días</th>
              <th style="padding:10px 8px;text-align:center;font-size:10px;color:#6B7280;text-transform:uppercase;">Avance</th>
            </tr>
          </thead>
          <tbody>${filas}</tbody>
        </table>
      </div>
      <div style="margin-top:20px;font-size:9px;color:#C4C4C4;text-align:center;">
        © Guaraní 3D del Grupo Díaz Villaverde — Propiedad Intelectual. Documento Confidencial.
      </div>
      <div class="no-print" style="position:fixed;bottom:24px;right:24px;display:flex;gap:10px;">
        <button onclick="window.close()" style="padding:10px 20px;border:1px solid #E5E7EB;border-radius:8px;background:white;cursor:pointer;font-size:13px;">Cerrar</button>
        <button onclick="window.print()" style="padding:10px 24px;background:linear-gradient(135deg,#2462C9,#1E3A5F);color:white;border:none;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;box-shadow:0 4px 16px rgba(36,98,201,0.4);">🖨️ Imprimir / Guardar PDF</button>
      </div>
    </body></html>`;

    const ventana = window.open('', '_blank', 'width=1100,height=700');
    if (ventana) { ventana.document.write(html); ventana.document.close(); }
  };

  // ── Estilos ──
  const PANEL_IZQ_WIDTH = 280;
  const ROW_HEIGHT      = 72;

  const containerStyle: CSSProperties = {
    display: 'flex', flexDirection: 'column',
    flex: 1, minHeight: 0,
    background: '#F9F9FE',
    height: '100%',
  };
  const mesLabel = mesActual.toLocaleDateString('es-PY', { month: 'long', year: 'numeric' });

  return (
    <div style={containerStyle}>

      {/* ───── TOOLBAR (2 filas compactas, sin scroll horizontal) ───── */}
      <div style={{
        borderBottom: '1px solid #E2E2E7',
        background: 'white',
        flexShrink: 0,
      }}>

        {/* FILA 1: navegación temporal + escala + leyenda + zoom */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '6px 16px', borderBottom: '1px solid #F3F4F6',
        }}>
          {/* Navegación de mes */}
          <button
            type="button"
            onClick={mesAnterior}
            title="Mes anterior"
            style={{
              width: 24, height: 24, border: '1px solid #E2E2E7', borderRadius: 5,
              background: 'white', cursor: 'pointer', fontSize: 12,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: 'inherit',
            }}
          >‹</button>
          <span style={{
            fontSize: 12, fontWeight: 600, color: '#001E40',
            whiteSpace: 'nowrap', textTransform: 'capitalize',
          }}>📅 {mesLabel}</span>
          <button
            type="button"
            onClick={mesSiguiente}
            title="Mes siguiente"
            style={{
              width: 24, height: 24, border: '1px solid #E2E2E7', borderRadius: 5,
              background: 'white', cursor: 'pointer', fontSize: 12,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: 'inherit',
            }}
          >›</button>

          {/* Divisor */}
          <div style={{ width: 1, height: 18, background: '#E2E2E7' }}/>

          {/* Escala día/semana/mes */}
          {(['Día', 'Semana', 'Mes'] as const).map(e => {
            const key = e === 'Día' ? 'dia' : e === 'Semana' ? 'semana' : 'mes';
            const activo = escala === key;
            return (
              <button
                key={e}
                type="button"
                onClick={() => setEscala(key)}
                style={{
                  height: 24, padding: '0 10px', fontSize: 11, fontWeight: 600,
                  border: '1px solid #E2E2E7', borderRadius: 5, cursor: 'pointer',
                  background: activo ? '#1E3A5F' : 'white',
                  color:      activo ? 'white'   : '#374151',
                  fontFamily: 'inherit',
                }}
              >{e}</button>
            );
          })}

          {/* Divisor */}
          <div style={{ width: 1, height: 18, background: '#E2E2E7' }}/>

          {/* Leyenda */}
          {[
            { label: 'Pendiente',  color: '#EF4444' },
            { label: 'En Proceso', color: '#3B82F6' },
            { label: 'Cerrada',    color: '#22C55E' },
          ].map(l => (
            <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: l.color }}/>
              <span style={{ fontSize: 10, color: '#6B7280', whiteSpace: 'nowrap' }}>{l.label}</span>
            </div>
          ))}

          {/* Spacer */}
          <div style={{ flex: 1 }}/>

          {/* Zoom */}
          <button
            type="button"
            onClick={zoomIn}
            title="Acercar (más detalle)"
            style={{
              width: 26, height: 26, border: '1px solid #E2E2E7', borderRadius: 5,
              background: 'white', cursor: 'pointer', fontSize: 14, fontWeight: 700,
              fontFamily: 'inherit',
            }}
          >+</button>
          <button
            type="button"
            onClick={zoomOut}
            title="Alejar (más rango)"
            style={{
              width: 26, height: 26, border: '1px solid #E2E2E7', borderRadius: 5,
              background: 'white', cursor: 'pointer', fontSize: 14, fontWeight: 700,
              fontFamily: 'inherit',
            }}
          >−</button>
        </div>

        {/* FILA 2: buscador + filtros + proyecto + exportar */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '5px 16px',
        }}>
          {/* Buscador */}
          <input
            value={filtroBuscar}
            onChange={e => setFiltroBuscar(e.target.value)}
            placeholder="Buscar OT..."
            style={{
              height: 26, width: 130, fontSize: 11, padding: '0 8px',
              border: '1px solid #E2E2E7', borderRadius: 5, outline: 'none',
              flexShrink: 0, fontFamily: 'inherit',
              color: '#0F172A', background: '#fff',
            }}
          />

          {/* Filtros etiquetados */}
          {([
            { label: 'Estado',    value: filtroEstado,    setter: setFiltroEstado,    ops: ['Todos', 'Pendiente', 'En proceso', 'Cerrada', 'No aplica'] },
            { label: 'Prioridad', value: filtroPrioridad, setter: setFiltroPrioridad, ops: ['Todas', 'Alta', 'Media', 'Baja'] },
            { label: 'Rubro',     value: filtroRubro,     setter: setFiltroRubro,     ops: ['Todos', ...rubrosUnicos] },
            { label: 'Riesgo',    value: filtroRiesgo,    setter: setFiltroRiesgo,    ops: ['Todos', 'Extremo', 'Alto', 'Medio', 'Bajo'] },
          ] as const).map(f => (
            <div key={f.label} style={{ display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>
              <span style={{
                fontSize: 9, fontWeight: 700, color: '#9CA3AF',
                textTransform: 'uppercase', letterSpacing: '0.06em',
              }}>{f.label}:</span>
              <select
                value={f.value}
                onChange={e => f.setter(e.target.value)}
                style={{
                  height: 26, fontSize: 11, padding: '0 4px', maxWidth: 85,
                  border: '1px solid #E2E2E7', borderRadius: 5,
                  background: 'white', cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                {f.ops.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
          ))}

          {/* Filtro Proyecto (inline, mismo formato etiquetado) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>
            <span style={{
              fontSize: 9, fontWeight: 700, color: '#9CA3AF',
              textTransform: 'uppercase', letterSpacing: '0.06em',
            }}>Proyecto:</span>
            <select
              value={filtroProyecto || 'Todos'}
              onChange={e => setFiltroProyecto(e.target.value === 'Todos' ? '' : e.target.value)}
              style={{
                height: 26, fontSize: 11, padding: '0 4px', maxWidth: 120,
                border: '1px solid #E2E2E7', borderRadius: 5,
                background: 'white', cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              <option value="Todos">Todos</option>
              {proyectos.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
          </div>

          {/* Spacer */}
          <div style={{ flex: 1 }}/>

          {/* Exportar CSV */}
          <button
            type="button"
            onClick={exportarGanttCSV}
            style={{
              height: 26, padding: '0 10px', fontSize: 11, fontWeight: 700,
              background: '#1E3A5F', color: 'white', border: 'none',
              borderRadius: 5, cursor: 'pointer',
              whiteSpace: 'nowrap', flexShrink: 0, fontFamily: 'inherit',
            }}
            title="Exportar lista de OTs a CSV"
          >↑ CSV</button>

          {/* Exportar PDF */}
          <button
            type="button"
            onClick={exportarGanttPDF}
            style={{
              height: 26, padding: '0 10px', fontSize: 11, fontWeight: 700,
              background: '#16A34A', color: 'white', border: 'none',
              borderRadius: 5, cursor: 'pointer',
              whiteSpace: 'nowrap', flexShrink: 0, fontFamily: 'inherit',
            }}
            title="Exportar cronograma como PDF"
          >📄 PDF</button>
        </div>
      </div>

      {/* ───── GANTT GRID ───── */}
      {otConFechasFiltradas.length === 0 ? (
        <div style={{
          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 28, background: '#F9F9FE',
        }}>
          <div style={{
            background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12,
            padding: '24px 28px', textAlign: 'center', maxWidth: 460,
          }}>
            <div style={{ fontSize: 28, marginBottom: 10 }}>📅</div>
            <p style={{ margin: 0, color: '#0F172A', fontSize: 14, fontWeight: 600, lineHeight: 1.4 }}>
              Ninguna OT tiene fechas de inicio y fin asignadas.
            </p>
            <p style={{ margin: '8px 0 0', color: '#64748B', fontSize: 12, lineHeight: 1.5 }}>
              Editá una OT desde el Plano o la Grilla para asignar fechas.
            </p>
          </div>
        </div>
      ) : (
        <div style={{
          flex: 1, minHeight: 0, display: 'flex',
          overflow: 'hidden',
          background: '#fff', borderTop: '1px solid #E2E2E7',
        }}>
          {/* PANEL IZQUIERDO 280px — scroll vertical sincronizado */}
          <div style={{
            width: PANEL_IZQ_WIDTH, flexShrink: 0,
            borderRight: '1px solid #E2E2E7',
            display: 'flex', flexDirection: 'column',
            background: '#fff',
          }}>
            {/* Header */}
            <div style={{
              height: 40, flexShrink: 0,
              padding: '0 12px',
              display: 'flex', alignItems: 'center',
              background: '#F4F3F8', borderBottom: '1px solid #E2E2E7',
              fontSize: 10, fontWeight: 700, color: '#43474F',
              textTransform: 'uppercase', letterSpacing: '0.05em',
            }}>
              ORDEN DE TRABAJO
            </div>
            {/* Filas — sincronizadas por scroll-y con el timeline */}
            <div
              style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}
              onScroll={(e) => {
                if (timelineRef.current) {
                  timelineRef.current.scrollTop = (e.currentTarget as HTMLDivElement).scrollTop;
                }
              }}
            >
              {otConFechasFiltradas.map(o => {
                const retrasada = esRetrasada(o);
                const dur = diffDays(new Date(o.fecha_fin_trabajos!), new Date(o.fecha_inicio_trabajos!)) + 1;
                return (
                  <div
                    key={o.id}
                    onClick={() => setModalOrden(o)}
                    style={{
                      height: ROW_HEIGHT, borderBottom: '1px solid #E2E2E7',
                      padding: '8px 12px', cursor: 'pointer',
                      background: retrasada ? '#FEF2F2' : 'white',
                      borderLeft: retrasada ? '3px solid #DC2626' : '3px solid transparent',
                      transition: 'background 0.12s',
                    }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = retrasada ? '#FEE2E2' : '#F9F9FE'; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = retrasada ? '#FEF2F2' : 'white'; }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{
                        fontWeight: 700, fontSize: 12,
                        color: retrasada ? '#DC2626' : '#001E40',
                        fontFamily: 'Menlo, Monaco, Consolas, monospace',
                      }}>{o.ot}</span>
                      <span style={{ fontSize: 10, color: '#9CA3AF' }}>{dur}d</span>
                    </div>
                    <div style={{
                      fontSize: 11, color: '#374151', marginTop: 2,
                      overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
                    }}>
                      {o.descripcion || o.rubro || '—'}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
                      <div style={{
                        width: 18, height: 18, borderRadius: '50%',
                        background: o.responsable ? colorEstado(o.estado) : '#9CA3AF',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: 'white', fontSize: 9, fontWeight: 700, flexShrink: 0,
                      }}>
                        {o.responsable?.[0]?.toUpperCase() ?? '?'}
                      </div>
                      <span style={{ fontSize: 10, color: '#6B7280' }}>{o.responsable || 'Sin asignar'}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* TIMELINE — scroll horizontal + vertical sincronizado */}
          <div
            ref={timelineRef}
            style={{ flex: 1, minWidth: 0, overflow: 'auto', position: 'relative' }}
            onScroll={(e) => {
              // Sync vertical con el panel izquierdo (no podemos hacerlo bidireccional
              // sin loops — el panel izq es el "master" del scroll vertical y le
              // hacemos echo desde acá hacia él).
              const tgt = e.currentTarget as HTMLDivElement;
              const izq = tgt.previousElementSibling?.querySelector('div[style*="overflow"]') as HTMLDivElement | undefined;
              if (izq && Math.abs(izq.scrollTop - tgt.scrollTop) > 1) {
                izq.scrollTop = tgt.scrollTop;
              }
            }}
          >
            {/* Header de fechas — sticky top */}
            <div style={{
              position: 'sticky', top: 0, zIndex: 10,
              display: 'flex', height: 40,
              background: '#F4F3F8', borderBottom: '1px solid #E2E2E7',
              width: timelineWidthPx,
            }}>
              {columnas.map((c, i) => (
                <div key={i} style={{
                  width: anchoPorColumna, flexShrink: 0,
                  padding: '0 6px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: c.esHoy ? '#E8F0FE' : 'transparent',
                  borderRight: '1px solid #E2E2E7',
                  fontSize: 10, fontWeight: 700,
                  color: c.esHoy ? '#1E3A5F' : '#43474F',
                  textTransform: 'uppercase', letterSpacing: '0.04em',
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>{c.label}</div>
              ))}
            </div>

            {/* Cuerpo de filas — barras */}
            <div style={{
              position: 'relative',
              width: timelineWidthPx,
              backgroundImage: `linear-gradient(to right, #F1F4F9 1px, transparent 1px)`,
              backgroundSize: `${anchoPorColumna}px 100%`,
            }}>
              {otConFechasFiltradas.map((o) => {
                const retrasada = esRetrasada(o);
                const ti = new Date(o.fecha_inicio_trabajos!);
                const tf = new Date(o.fecha_fin_trabajos!);
                const leftPx = diffDays(ti, columnas[0].inicio) * pxPorDia;
                const widthPx = Math.max(20, (diffDays(tf, ti) + 1) * pxPorDia);
                const estilo = obtenerEstiloBarra(o, retrasada);
                const pct = o.porcentaje_avance ?? 0;
                return (
                  <div key={o.id} style={{
                    height: ROW_HEIGHT, position: 'relative',
                    borderBottom: '1px solid #E2E2E7',
                  }}>
                    <div
                      onClick={() => setModalOrden(o)}
                      title={`${o.ot} · ${o.fecha_inicio_trabajos} → ${o.fecha_fin_trabajos}`}
                      style={{
                        position: 'absolute',
                        left: leftPx, width: widthPx,
                        height: 32, top: 20,
                        borderRadius: 6,
                        background: estilo.bg,
                        border: `1px solid ${estilo.border}`,
                        borderStyle: estilo.dashed ? 'dashed' : 'solid',
                        boxShadow: estilo.glow ? '0 0 8px rgba(220,38,38,0.4)' : 'none',
                        display: 'flex', alignItems: 'center',
                        overflow: 'hidden', cursor: 'pointer',
                      }}
                    >
                      {/* Barra de avance interior */}
                      {o.estado !== 'Cerrada' && pct > 0 && (
                        <div style={{
                          position: 'absolute', left: 0, top: 0, bottom: 0,
                          width: `${pct}%`, background: estilo.avance, opacity: 0.6,
                        }}/>
                      )}
                      {/* Texto */}
                      <span style={{
                        position: 'relative', zIndex: 1,
                        fontSize: 10, fontWeight: 700, color: 'white',
                        paddingLeft: 8, paddingRight: 8,
                        textShadow: '0 1px 2px rgba(0,0,0,0.3)',
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        maxWidth: '90%',
                      }}>{estilo.label}</span>
                    </div>
                  </div>
                );
              })}

              {/* Línea HOY — overlay vertical sobre todas las filas */}
              {hoyPx != null && (
                <>
                  <div style={{
                    position: 'absolute',
                    top: 0, bottom: 0,
                    left: hoyPx - 1, width: 2,
                    borderLeft: '2px dashed #DC2626',
                    zIndex: 20, pointerEvents: 'none',
                  }}/>
                  <div style={{
                    position: 'absolute',
                    top: -34, left: hoyPx - 18,
                    background: '#DC2626', color: '#fff',
                    fontSize: 10, fontWeight: 700, letterSpacing: '0.05em',
                    padding: '2px 8px', borderRadius: 4,
                    zIndex: 21, pointerEvents: 'none',
                  }}>HOY</div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ───── FOOTER COMPACTO: OTs SIN FECHAS (48px, chips horizontales) ───── */}
      {otSinFechasFiltradas.length > 0 && (
        <div style={{
          height: 48,
          borderTop: '1px solid #E2E2E7',
          background: '#FFFBEB',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '0 16px',
          flexShrink: 0,
          overflow: 'hidden',
        }}>
          {/* Label */}
          <span style={{
            fontSize: 11, fontWeight: 700, color: '#D97706',
            whiteSpace: 'nowrap', flexShrink: 0,
          }}>
            ⚠️ Sin fechas ({otSinFechasFiltradas.length}):
          </span>

          {/* Chips scrolleables — scrollbar oculta visualmente */}
          <div style={{
            display: 'flex', gap: 6, overflowX: 'auto', overflowY: 'hidden', flex: 1,
            scrollbarWidth: 'none',
            msOverflowStyle: 'none' as CSSProperties['msOverflowStyle'],
          }}>
            {otSinFechasFiltradas.map(o => (
              <div
                key={o.id}
                onClick={() => setModalOrden(o)}
                style={{
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  background: 'white',
                  border: '1px solid #FCD34D',
                  borderRadius: 20,
                  padding: '3px 10px',
                  cursor: 'pointer',
                  fontSize: 11,
                  fontWeight: 600,
                  color: '#374151',
                  whiteSpace: 'nowrap',
                  transition: 'background 0.1s',
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = '#FEF3C7'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'white'; }}
              >
                <span style={{
                  width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                  background: o.prioridad === 'Alta' ? '#DC2626' : '#9CA3AF',
                }}/>
                {o.ot}
                {o.rubro && <span style={{ color: '#9CA3AF', fontSize: 10 }}>· {o.rubro}</span>}
              </div>
            ))}
          </div>

          {/* "Ver todas" — sólo si hay más de 8. Abre modal con lista scrolleable. */}
          {otSinFechasFiltradas.length > 8 && (
            <span
              onClick={() => setMostrarSinFechas(true)}
              style={{
                fontSize: 11, color: '#2563EB', cursor: 'pointer',
                flexShrink: 0, fontWeight: 600,
              }}
            >
              Ver todas →
            </span>
          )}
        </div>
      )}

      {/* Modal "Ver todas" — lista completa de OTs sin fechas */}
      {mostrarSinFechas && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
            zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          onClick={() => setMostrarSinFechas(false)}
        >
          <div
            style={{
              background: 'white', borderRadius: 12, width: 560, maxHeight: '70vh',
              overflow: 'hidden', display: 'flex', flexDirection: 'column',
              boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{
              padding: '16px 20px', borderBottom: '1px solid #E2E2E7',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <div>
                <span style={{ fontWeight: 700, fontSize: 14, color: '#001E40' }}>
                  ⚠️ OTs sin fechas asignadas
                </span>
                <span style={{ fontSize: 12, color: '#9CA3AF', marginLeft: 8 }}>
                  ({otSinFechasFiltradas.length} órdenes)
                </span>
              </div>
              <button
                type="button"
                onClick={() => setMostrarSinFechas(false)}
                style={{
                  border: 'none', background: 'none', fontSize: 18, cursor: 'pointer',
                  color: '#6B7280', lineHeight: 1, fontFamily: 'inherit',
                }}
              >✕</button>
            </div>

            {/* Lista scrolleable */}
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {otSinFechasFiltradas.map((o, i) => (
                <div
                  key={o.id}
                  onClick={() => { setMostrarSinFechas(false); setModalOrden(o); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '10px 20px', cursor: 'pointer',
                    borderBottom: '1px solid #F3F4F6',
                    background: i % 2 === 0 ? 'white' : '#F9F9FE',
                    transition: 'background 0.1s',
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = '#EFF6FF'; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = i % 2 === 0 ? 'white' : '#F9F9FE'; }}
                >
                  <div style={{
                    width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                    background: o.estado === 'Pendiente'  ? '#EF4444'
                              : o.estado === 'En proceso' ? '#3B82F6'
                              : o.estado === 'Cerrada'    ? '#22C55E' : '#6B7280',
                  }} />
                  <span style={{
                    fontWeight: 700, fontSize: 12, color: '#001E40',
                    minWidth: 80, flexShrink: 0,
                    fontFamily: 'Menlo, Monaco, Consolas, monospace',
                  }}>{o.ot}</span>
                  <span style={{
                    fontSize: 12, color: '#374151', flex: 1,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {o.descripcion || o.rubro || '—'}
                  </span>
                  {o.rubro && (
                    <span style={{
                      fontSize: 10, padding: '2px 8px', borderRadius: 10,
                      background: '#EFF6FF', color: '#2563EB', fontWeight: 600,
                      flexShrink: 0, whiteSpace: 'nowrap',
                    }}>{o.rubro}</span>
                  )}
                  {o.prioridad === 'Alta' && (
                    <span style={{
                      fontSize: 10, padding: '2px 8px', borderRadius: 10,
                      background: '#FEE2E2', color: '#DC2626', fontWeight: 700,
                      flexShrink: 0,
                    }}>URGENTE</span>
                  )}
                  <span style={{ fontSize: 10, color: '#9CA3AF', flexShrink: 0 }}>→</span>
                </div>
              ))}
              {otSinFechasFiltradas.length === 0 && (
                <div style={{ padding: 40, textAlign: 'center', color: '#9CA3AF', fontSize: 13 }}>
                  No hay órdenes sin fechas con los filtros actuales.
                </div>
              )}
            </div>

            {/* Footer */}
            <div style={{
              padding: '12px 20px', borderTop: '1px solid #E2E2E7',
              fontSize: 11, color: '#9CA3AF', textAlign: 'center',
            }}>
              Click en una OT para ver su detalle completo
            </div>
          </div>
        </div>
      )}

      {/* Modal detalle */}
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
