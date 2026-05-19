// src/components/views/Calendario.tsx
//
// Calendario operativo: vista mensual con eventos por día (INGRESO/INICIO/CIERRE),
// panel lateral con detalle del día seleccionado, y dos cards de resumen
// (mensual + stats rápidos) debajo del grid principal.

import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { useOrdenesStore } from '../../stores/ordenesStore';
import { useProyectosStore } from '../../stores/proyectosStore';
import { ModalDetalleOT } from '../grilla/ModalDetalleOT';
import type { OrdenLocal } from '../../types/orden';
import { useToast } from '../ui/Toast';

// ─── Constantes ───────────────────────────────────────────────────────────────
const DIAS_SEMANA  = ['LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB', 'DOM'];
const MESES        = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
                      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const DIAS_NOMBRE  = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

type TipoEvento = 'INGRESO' | 'INICIO' | 'CIERRE';
interface Evento {
  ot:     string;
  tipo:   TipoEvento;
  obra?:  string;
  rubro?: string;
  orden:  OrdenLocal;
}

const COLORES: Record<TipoEvento, string> = {
  INGRESO: '#001E40', // navy
  INICIO:  '#D97706', // orange
  CIERRE:  '#DC2626', // red
};
const PILL_BG: Record<TipoEvento, string> = {
  INGRESO: '#EFF6FF',
  INICIO:  '#FEF3C7',
  CIERRE:  '#FEE2E2',
};

// ─── Helpers de fecha ────────────────────────────────────────────────────────
function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function generarDiasMes(fecha: Date): Date[] {
  const año = fecha.getFullYear();
  const mes = fecha.getMonth();
  const primerDia = new Date(año, mes, 1);
  const ultimoDia = new Date(año, mes + 1, 0);
  // Lunes como inicio de semana: 0=Lun, ..., 6=Dom.
  let inicio = primerDia.getDay() - 1;
  if (inicio < 0) inicio = 6;
  const dias: Date[] = [];
  for (let i = inicio; i > 0; i--) dias.push(new Date(año, mes, 1 - i));
  for (let d = 1; d <= ultimoDia.getDate(); d++) dias.push(new Date(año, mes, d));
  while (dias.length % 7 !== 0) dias.push(new Date(año, mes + 1, dias.length - ultimoDia.getDate() - inicio + 1));
  return dias;
}

function capitalizar(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ─── Componente ──────────────────────────────────────────────────────────────
export default function Calendario() {
  const ordenes               = useOrdenesStore(s => s.ordenes);
  const cargarTodasLasOrdenes = useOrdenesStore(s => s.cargarTodasLasOrdenes);
  const proyectos             = useProyectosStore(s => s.proyectos);
  const cargarProyectos       = useProyectosStore(s => s.cargarProyectos);
  const { ToastComponent } = useToast();

  const [mesActual, setMesActual]                 = useState<Date>(new Date());
  const [diaSeleccionado, setDiaSeleccionado]     = useState<Date>(new Date());
  const [vistaCalendario, setVistaCalendario]     = useState<'mes' | 'semana' | 'dia'>('mes');
  const [proyectoFiltro, setProyectoFiltro]       = useState<string>('todos');
  const [modalOrden, setModalOrden]               = useState<OrdenLocal | null>(null);

  useEffect(() => {
    cargarProyectos();
    cargarTodasLasOrdenes();
  }, [cargarProyectos, cargarTodasLasOrdenes]);

  // OTs filtradas por proyecto
  const ordenesFiltradas = useMemo(
    () => proyectoFiltro === 'todos' ? ordenes : ordenes.filter(o => o.proyecto_id === proyectoFiltro),
    [ordenes, proyectoFiltro],
  );

  // Mapa día (YYYY-MM-DD) → eventos
  const eventosPorDia = useMemo(() => {
    const map = new Map<string, Evento[]>();
    const push = (key: string, ev: Evento) => {
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(ev);
    };
    for (const o of ordenesFiltradas) {
      const fi = o.fecha_ingreso?.slice(0, 10);
      const fs = o.fecha_inicio_trabajos?.slice(0, 10);
      const ff = o.fecha_fin_trabajos?.slice(0, 10);
      if (fi) push(fi, { ot: o.ot, tipo: 'INGRESO', obra: o.obra, rubro: o.rubro, orden: o });
      if (fs) push(fs, { ot: o.ot, tipo: 'INICIO',  obra: o.obra, rubro: o.rubro, orden: o });
      if (ff) push(ff, { ot: o.ot, tipo: 'CIERRE',  obra: o.obra, rubro: o.rubro, orden: o });
    }
    return map;
  }, [ordenesFiltradas]);

  const eventosDelDia = (fecha: Date): Evento[] => eventosPorDia.get(ymd(fecha)) ?? [];

  // Predicados de celda
  const esMismoMes = (d: Date) => d.getMonth() === mesActual.getMonth() && d.getFullYear() === mesActual.getFullYear();
  const esHoy = (d: Date) => {
    const h = new Date();
    return d.getDate() === h.getDate() && d.getMonth() === h.getMonth() && d.getFullYear() === h.getFullYear();
  };
  const esSeleccionado = (d: Date) => d.toDateString() === diaSeleccionado.toDateString();

  // Cuadrícula del mes
  const diasMes = useMemo(() => generarDiasMes(mesActual), [mesActual]);

  // Stats del mes actual
  const statsMes = useMemo(() => {
    const yr = mesActual.getFullYear(), mo = mesActual.getMonth();
    const enEsteMes = (iso: string | undefined) => {
      if (!iso) return false;
      const d = new Date(iso.slice(0, 10) + 'T00:00:00');
      return d.getFullYear() === yr && d.getMonth() === mo;
    };
    let ingresos = 0, inicios = 0, cierres = 0, pendientes = 0, cerradasMes = 0, totalMes = 0;
    for (const o of ordenesFiltradas) {
      if (enEsteMes(o.fecha_ingreso))         ingresos++;
      if (enEsteMes(o.fecha_inicio_trabajos)) inicios++;
      if (enEsteMes(o.fecha_fin_trabajos))    cierres++;
      // Para % cierre, consideramos las OTs cuyo fecha_ingreso cae en el mes
      if (enEsteMes(o.fecha_ingreso)) {
        totalMes++;
        if (o.estado === 'Cerrada') cerradasMes++;
      }
      if (o.estado === 'Pendiente') pendientes++;
    }
    const pctCierre = totalMes > 0 ? Math.round((cerradasMes / totalMes) * 100) : 0;
    return { ingresos, inicios, cierres, pendientes, pctCierre, totalMes };
  }, [ordenesFiltradas, mesActual]);

  // Navegación
  const mesAnterior  = () => setMesActual(new Date(mesActual.getFullYear(), mesActual.getMonth() - 1, 1));
  const mesSiguiente = () => setMesActual(new Date(mesActual.getFullYear(), mesActual.getMonth() + 1, 1));
  const irHoy = () => {
    const h = new Date();
    setMesActual(new Date(h.getFullYear(), h.getMonth(), 1));
    setDiaSeleccionado(h);
  };

  // Exportar reporte mensual (window.open + HTML imprimible)
  const exportarReporteMes = () => {
    const mesNombre = MESES[mesActual.getMonth()];
    const año = mesActual.getFullYear();
    const prefijo = `${año}-${String(mesActual.getMonth() + 1).padStart(2, '0')}`;

    const ingresosMes = ordenesFiltradas.filter(o => o.fecha_ingreso?.startsWith(prefijo));
    const iniciosMes  = ordenesFiltradas.filter(o => o.fecha_inicio_trabajos?.startsWith(prefijo));
    const cierresMes  = ordenesFiltradas.filter(o => o.fecha_fin_trabajos?.startsWith(prefijo));
    const pendientes  = ordenesFiltradas.filter(o => o.estado === 'Pendiente');
    const cerradas    = ordenesFiltradas.filter(o => o.estado === 'Cerrada');

    const filaOT = (o: any, tipo: string, color: string) => `
      <tr style="border-bottom:1px solid #F3F4F6;">
        <td style="padding:8px 12px;font-weight:700;color:#001E40;">${o.ot}</td>
        <td style="padding:8px 12px;"><span style="background:${color}22;color:${color};
          padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700;">${tipo}</span></td>
        <td style="padding:8px 12px;font-size:12px;">${o.rubro ?? '—'}</td>
        <td style="padding:8px 12px;font-size:12px;">${o.obra ?? '—'}</td>
        <td style="padding:8px 12px;font-size:12px;">${o.responsable ?? '—'}</td>
        <td style="padding:8px 12px;font-size:12px;">${o.estado}</td>
      </tr>`;

    // Combinar todos los eventos del mes sin duplicar OTs
    const todasOTs = new Map<string, any>();
    ingresosMes.forEach(o => todasOTs.set(o.id, { ...o, _tipo: 'INGRESO', _color: '#001E40' }));
    iniciosMes.forEach(o  => todasOTs.set(o.id, { ...o, _tipo: 'INICIO',  _color: '#D97706' }));
    cierresMes.forEach(o  => todasOTs.set(o.id, { ...o, _tipo: 'CIERRE',  _color: '#DC2626' }));

    const html = `<!DOCTYPE html><html><head>
      <meta charset="UTF-8"/>
      <title>Reporte Mensual ${mesNombre} ${año} — Plan-OTs</title>
      <style>
        body { font-family: Inter, sans-serif; margin:0; padding:20px; background:#F9F9FE; }
        @page { size: A4 portrait; margin: 15mm; }
        @media print { .no-print { display:none; } }
        body::before { content:'BORRADOR'; position:fixed; top:50%; left:50%;
          transform:translate(-50%,-50%) rotate(-35deg); font-size:100px;
          font-weight:900; color:rgba(200,200,200,0.15); pointer-events:none; z-index:0;
          letter-spacing:0.1em; }
      </style>
    </head><body>

      <!-- Header -->
      <div style="background:linear-gradient(135deg,#0B1929,#1E3A5F);color:white;
        padding:24px 28px;border-radius:8px 8px 0 0;display:flex;
        justify-content:space-between;align-items:center;">
        <div>
          <div style="font-size:10px;opacity:0.6;text-transform:uppercase;
            letter-spacing:0.15em;">BBC FACILITY SERVICES · REPORTE MENSUAL</div>
          <div style="font-size:24px;font-weight:900;margin-top:6px;
            letter-spacing:-0.02em;">${mesNombre} ${año}</div>
          <div style="font-size:11px;opacity:0.5;margin-top:4px;">
            Generado el ${new Date().toLocaleDateString('es-PY')} · BORRADOR</div>
        </div>
        <div style="font-size:22px;font-weight:900;color:#A7C8FF;">Plan-OTs</div>
      </div>

      <!-- KPIs -->
      <div style="background:white;border:1px solid #E5E7EB;border-top:none;
        padding:20px 28px;display:grid;grid-template-columns:repeat(5,1fr);gap:16px;">
        ${[
          { label: 'Ingresos',   valor: ingresosMes.length, color: '#001E40' },
          { label: 'Inicios',    valor: iniciosMes.length,  color: '#D97706' },
          { label: 'Cierres',    valor: cierresMes.length,  color: '#DC2626' },
          { label: 'Pendientes', valor: pendientes.length,  color: '#EF4444' },
          { label: 'Cerradas',   valor: cerradas.length,    color: '#16A34A' },
        ].map(k => `
          <div style="text-align:center;padding:12px;background:#F9F9FE;
            border-radius:8px;border:1px solid #E5E7EB;">
            <div style="font-size:28px;font-weight:900;color:${k.color};">${k.valor}</div>
            <div style="font-size:10px;text-transform:uppercase;color:#9CA3AF;
              font-weight:700;margin-top:4px;">${k.label}</div>
          </div>`).join('')}
      </div>

      <!-- Tabla -->
      <div style="background:white;border:1px solid #E5E7EB;border-top:none;
        border-radius:0 0 8px 8px;overflow:hidden;margin-bottom:20px;">
        <div style="padding:14px 28px;background:#F4F3F8;border-bottom:1px solid #E5E7EB;
          font-size:11px;font-weight:700;color:#001E40;text-transform:uppercase;
          letter-spacing:0.08em;">
          Órdenes con actividad en ${mesNombre} ${año}
          (${todasOTs.size} órdenes)
        </div>
        <table style="width:100%;border-collapse:collapse;">
          <thead>
            <tr style="background:#F9F9FE;">
              ${['OT','Tipo','Rubro','Obra','Responsable','Estado'].map(h =>
                `<th style="padding:10px 12px;text-align:left;font-size:10px;
                  color:#6B7280;text-transform:uppercase;letter-spacing:0.05em;
                  border-bottom:1px solid #E5E7EB;">${h}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${[...todasOTs.values()].map(o =>
              filaOT(o, o._tipo, o._color)).join('')}
            ${todasOTs.size === 0 ?
              `<tr><td colspan="6" style="padding:32px;text-align:center;
                color:#9CA3AF;font-style:italic;">
                Sin actividad registrada para este mes</td></tr>` : ''}
          </tbody>
        </table>
      </div>

      <!-- Footer -->
      <div style="font-size:9px;color:#C4C4C4;text-align:center;margin-top:12px;">
        © Guaraní 3D del Grupo Díaz Villaverde — Propiedad Intelectual.
        Documento Confidencial. BORRADOR — Sujeto a revisión.
      </div>

      <!-- Botones -->
      <div class="no-print" style="position:fixed;bottom:24px;right:24px;display:flex;gap:10px;">
        <button onclick="window.close()"
          style="padding:10px 20px;border:1px solid #E5E7EB;border-radius:8px;
          background:white;cursor:pointer;font-size:13px;">Cerrar</button>
        <button onclick="window.print()"
          style="padding:10px 24px;background:linear-gradient(135deg,#2462C9,#1E3A5F);
          color:white;border:none;border-radius:8px;font-size:13px;font-weight:700;
          cursor:pointer;box-shadow:0 4px 16px rgba(36,98,201,0.4);">
          🖨️ Imprimir / Guardar PDF</button>
      </div>
    </body></html>`;

    const v = window.open('', '_blank', 'width=900,height=700');
    if (v) { v.document.write(html); v.document.close(); v.focus(); }
  };

  // ── Estilos compartidos ──
  const cardStyle: CSSProperties = {
    background: 'white', border: '1px solid #E2E2E7', borderRadius: 8,
    overflow: 'hidden',
  };
  const navBtn: CSSProperties = {
    height: 28, padding: '0 10px', borderRadius: 6,
    border: '1px solid #E2E2E7', background: 'white',
    color: '#43474F', fontSize: 12, fontWeight: 600,
    cursor: 'pointer', fontFamily: 'inherit',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  };
  const togglePill = (activo: boolean): CSSProperties => ({
    height: 28, padding: '0 14px', borderRadius: 6, border: 'none',
    background: activo ? 'white' : 'transparent',
    color: activo ? '#001E40' : '#6B7280',
    boxShadow: activo ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
    fontSize: 12, fontWeight: 700,
    cursor: 'pointer', fontFamily: 'inherit',
  });

  // Eventos del día seleccionado
  const eventosSel = eventosDelDia(diaSeleccionado);
  const fechaSelLabel = `${capitalizar(DIAS_NOMBRE[diaSeleccionado.getDay()])}, ${diaSeleccionado.getDate()} de ${MESES[diaSeleccionado.getMonth()]}`;
  const mesLabel = `${MESES[mesActual.getMonth()]} de ${mesActual.getFullYear()}`;

  return (
    <div style={{
      flex: 1, overflow: 'auto', background: '#F9F9FE',
      padding: 24,
    }}>
      {/* ── Fila 1: Título + toggle Mes/Semana/Día ── */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
        gap: 16, marginBottom: 14, flexWrap: 'wrap',
      }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0F172A', margin: 0 }}>Calendario Operativo</h1>
          <p style={{ fontSize: 13, color: '#6B7280', margin: '4px 0 0' }}>
            Gestión temporal de ingresos, inicios y cierres de OTs.
          </p>
        </div>
        <div style={{
          display: 'inline-flex', background: '#F4F3F8', borderRadius: 8, padding: 3,
          gap: 2,
        }}>
          <button type="button" style={togglePill(vistaCalendario === 'mes')}    onClick={() => setVistaCalendario('mes')}>Mes</button>
          <button type="button" style={togglePill(vistaCalendario === 'semana')} onClick={() => setVistaCalendario('semana')}>Semana</button>
          <button type="button" style={togglePill(vistaCalendario === 'dia')}    onClick={() => setVistaCalendario('dia')}>Día</button>
        </div>
      </div>

      {/* ── Fila 2: navegación + filtro proyecto ── */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        gap: 12, marginBottom: 16, flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button type="button" style={navBtn} onClick={mesAnterior} title="Mes anterior">‹</button>
          <button type="button" style={{ ...navBtn, fontWeight: 700 }} onClick={irHoy}>Hoy</button>
          <button type="button" style={navBtn} onClick={mesSiguiente} title="Mes siguiente">›</button>
          <span style={{
            fontSize: 18, fontWeight: 800, color: '#0F172A',
            textTransform: 'capitalize', marginLeft: 8,
          }}>{mesLabel}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{
            fontSize: 9, fontWeight: 700, color: '#9CA3AF',
            textTransform: 'uppercase', letterSpacing: '0.06em',
          }}>Proyecto:</span>
          <select
            value={proyectoFiltro}
            onChange={e => setProyectoFiltro(e.target.value)}
            style={{
              height: 28, fontSize: 12, padding: '0 8px',
              border: '1px solid #E2E2E7', borderRadius: 6,
              background: 'white', cursor: 'pointer', fontFamily: 'inherit',
              maxWidth: 200,
            }}
          >
            <option value="todos">Todos los proyectos</option>
            {proyectos.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
        </div>
      </div>

      {/* ═══ GRID 12 COLS ═══ */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 16,
      }}>

        {/* ── Calendario (cols 1-9) ── */}
        <div style={{ ...cardStyle, gridColumn: 'span 9' }}>
          {vistaCalendario === 'mes' ? (
            <>
              {/* Cabecera días de la semana */}
              <div style={{
                display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)',
                background: '#F4F3F8', borderBottom: '1px solid #E2E2E7',
              }}>
                {DIAS_SEMANA.map(d => (
                  <div key={d} style={{
                    padding: '10px 6px', textAlign: 'center',
                    fontSize: 11, fontWeight: 700, color: '#43474F',
                    textTransform: 'uppercase', letterSpacing: '0.05em',
                  }}>{d}</div>
                ))}
              </div>

              {/* Cuadrícula de días */}
              <div style={{
                display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)',
                gridAutoRows: 'minmax(100px, auto)',
              }}>
                {diasMes.map((d, i) => {
                  const mismoMes = esMismoMes(d);
                  const hoy      = esHoy(d);
                  const sel      = esSeleccionado(d);
                  const eventos  = eventosDelDia(d);
                  const inicios  = eventos.filter(e => e.tipo === 'INICIO').length;
                  return (
                    <div
                      key={i}
                      onClick={() => setDiaSeleccionado(d)}
                      style={{
                        position: 'relative',
                        padding: 8, cursor: 'pointer',
                        borderRight:  (i % 7 !== 6) ? '1px solid #E2E2E7' : 'none',
                        borderBottom: '1px solid #E2E2E7',
                        background:   sel ? 'rgba(0,30,64,0.04)' : mismoMes ? 'white' : '#F4F3F8',
                        boxShadow:    sel ? 'inset 0 0 0 2px #001E40' : 'none',
                        transition: 'background 0.1s',
                        minHeight: 100,
                      }}
                      onMouseEnter={(e) => { if (!sel) (e.currentTarget as HTMLDivElement).style.background = '#F9F9FE'; }}
                      onMouseLeave={(e) => { if (!sel) (e.currentTarget as HTMLDivElement).style.background = mismoMes ? 'white' : '#F4F3F8'; }}
                    >
                      {/* Número del día */}
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        width: hoy ? 24 : 'auto', height: hoy ? 24 : 'auto',
                        borderRadius: '50%',
                        background: hoy ? '#001E40' : 'transparent',
                        color:      hoy ? 'white' : mismoMes ? '#0F172A' : '#9CA3AF',
                        opacity:    mismoMes ? 1 : 0.4,
                        fontSize: 12, fontWeight: 700,
                        paddingLeft: hoy ? 0 : 2, paddingRight: hoy ? 0 : 2,
                      }}>{d.getDate()}</span>

                      {/* Dots de eventos */}
                      {eventos.length > 0 && (
                        <div style={{ display: 'flex', gap: 3, marginTop: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                          {eventos.slice(0, 3).map((ev, j) => (
                            <div
                              key={j}
                              title={`${ev.ot} · ${ev.tipo}`}
                              style={{ width: 8, height: 8, borderRadius: '50%', background: COLORES[ev.tipo] }}
                            />
                          ))}
                          {eventos.length > 3 && (
                            <span style={{ fontSize: 10, color: '#001E40', fontWeight: 700 }}>
                              +{eventos.length - 3} más
                            </span>
                          )}
                        </div>
                      )}

                      {/* Pill de "N INICIOS" si hay ≥ 2 inicios el mismo día */}
                      {inicios >= 2 && (
                        <span style={{
                          display: 'inline-block', marginTop: 6,
                          fontSize: 10, fontWeight: 700,
                          background: '#EFF6FF', color: '#1D4ED8',
                          padding: '2px 6px', borderRadius: 10,
                        }}>{inicios} INICIOS</span>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Leyenda */}
              <div style={{
                display: 'flex', gap: 16, alignItems: 'center',
                padding: '10px 16px', background: '#F4F3F8',
                borderTop: '1px solid #E2E2E7',
              }}>
                {(['INGRESO', 'INICIO', 'CIERRE'] as const).map(t => (
                  <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: COLORES[t] }}/>
                    <span style={{ fontSize: 11, color: '#43474F', fontWeight: 600 }}>{t}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div style={{
              padding: '60px 20px', textAlign: 'center', color: '#9CA3AF',
              fontSize: 13,
            }}>
              Vista {vistaCalendario === 'semana' ? 'semanal' : 'diaria'}: próximamente.
              <div style={{ marginTop: 6, fontSize: 11 }}>Usá la vista <strong>Mes</strong> por ahora.</div>
            </div>
          )}
        </div>

        {/* ── Panel lateral (cols 10-12) ── */}
        <aside style={{ ...cardStyle, gridColumn: 'span 3', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '14px 16px', borderBottom: '1px solid #F3F4F6' }}>
            <div style={{
              fontSize: 11, fontWeight: 700, color: '#001E40',
              textTransform: 'uppercase', letterSpacing: '0.06em',
            }}>Detalle del día</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', marginTop: 4 }}>
              {fechaSelLabel}
            </div>
          </div>

          <div style={{
            padding: 12, flex: 1, overflowY: 'auto',
            maxHeight: 460,
          }}>
            {eventosSel.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', fontSize: 13, color: '#9CA3AF' }}>
                Sin eventos para este día
              </div>
            ) : (
              eventosSel.map((ev, i) => (
                <div
                  key={i}
                  onClick={() => setModalOrden(ev.orden)}
                  style={{
                    border: '1px solid #E2E2E7', borderRadius: 8, padding: 12,
                    marginBottom: 8, cursor: 'pointer', background: 'white',
                    transition: 'border-color 0.15s',
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = '#001E40'; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = '#E2E2E7'; }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                    <span style={{
                      fontWeight: 700, fontSize: 13, color: '#001E40',
                      fontFamily: 'Menlo, Monaco, Consolas, monospace',
                    }}>{ev.ot}</span>
                    <span style={{
                      fontSize: 10, fontWeight: 700,
                      padding: '2px 8px', borderRadius: 10,
                      background: PILL_BG[ev.tipo], color: COLORES[ev.tipo],
                      letterSpacing: '0.04em',
                    }}>{ev.tipo}</span>
                  </div>
                  {ev.obra && (
                    <div style={{ fontSize: 12, color: '#6B7280', marginTop: 4 }}>📍 {ev.obra}</div>
                  )}
                  {ev.rubro && (
                    <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 2 }}>{ev.rubro}</div>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: COLORES[ev.tipo] }}/>
                    <span style={{ fontSize: 11, fontWeight: 700, color: COLORES[ev.tipo] }}>{ev.tipo}</span>
                  </div>
                </div>
              ))
            )}
          </div>

          <div style={{
            padding: '10px 16px', borderTop: '1px solid #F3F4F6',
            textAlign: 'center',
          }}>
            <span style={{ fontSize: 11, color: '#2563EB', fontWeight: 600 }}>
              Ver todas las órdenes ({ordenesFiltradas.length})
            </span>
          </div>
        </aside>

        {/* ═══ SECCIÓN INFERIOR ═══ */}

        {/* Card azul — Resumen Operativo Mensual (cols 1-8) */}
        <div style={{
          gridColumn: 'span 8',
          background: '#001E40', color: 'white',
          borderRadius: 16, padding: 24,
        }}>
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
            marginBottom: 18,
          }}>
            <div>
              <div style={{
                fontSize: 11, fontWeight: 700, opacity: 0.6,
                textTransform: 'uppercase', letterSpacing: '0.08em',
              }}>Resumen Operativo Mensual</div>
              <div style={{ fontSize: 20, fontWeight: 800, marginTop: 4, textTransform: 'capitalize' }}>
                {mesLabel}
              </div>
            </div>
            <button
              type="button"
              onClick={exportarReporteMes}
              style={{
                background: 'rgba(255,255,255,0.1)', color: 'white',
                border: '1px solid rgba(255,255,255,0.2)', borderRadius: 6,
                padding: '8px 14px', fontSize: 12, fontWeight: 600,
                cursor: 'pointer', fontFamily: 'inherit',
              }}
            >📊 Exportar reporte del mes</button>
          </div>

          {/* Métricas */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20, marginBottom: 16 }}>
            {([
              { label: 'Ingresos',    valor: statsMes.ingresos, color: '#A7C8FF' },
              { label: 'Inicios',     valor: statsMes.inicios,  color: '#FCD34D' },
              { label: 'Cierres',     valor: statsMes.cierres,  color: '#86EFAC' },
            ] as const).map(m => (
              <div key={m.label}>
                <div style={{ fontSize: 36, fontWeight: 900, color: m.color }}>{m.valor}</div>
                <div style={{ fontSize: 11, opacity: 0.7, textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 2 }}>{m.label}</div>
              </div>
            ))}
          </div>

          {/* Mini gráfico CSS — barras proporcionales */}
          {(() => {
            const max = Math.max(statsMes.ingresos, statsMes.inicios, statsMes.cierres, 1);
            const barras = [
              { label: 'Ingresos', valor: statsMes.ingresos, color: '#A7C8FF' },
              { label: 'Inicios',  valor: statsMes.inicios,  color: '#FCD34D' },
              { label: 'Cierres',  valor: statsMes.cierres,  color: '#86EFAC' },
            ];
            return (
              <div style={{
                display: 'flex', gap: 12, alignItems: 'flex-end',
                height: 80,
                padding: '10px 0 0', borderTop: '1px solid rgba(255,255,255,0.15)',
              }}>
                {barras.map(b => (
                  <div key={b.label} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                    <div style={{
                      width: '100%', height: `${(b.valor / max) * 60}px`,
                      minHeight: 2,
                      background: b.color, borderRadius: '4px 4px 0 0',
                      transition: 'height 0.2s',
                    }}/>
                    <span style={{ fontSize: 9, opacity: 0.7 }}>{b.label}</span>
                  </div>
                ))}
              </div>
            );
          })()}
        </div>

        {/* Card gris — Stats rápidos (cols 9-12) */}
        <div style={{
          gridColumn: 'span 4',
          background: 'white', border: '1px solid #E2E2E7',
          borderRadius: 16, padding: 24,
        }}>
          <div style={{
            fontSize: 11, fontWeight: 700, color: '#43474F',
            textTransform: 'uppercase', letterSpacing: '0.06em',
            marginBottom: 16,
          }}>Stats rápidos</div>

          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 11, color: '#6B7280', marginBottom: 4 }}>OTs Pendientes</div>
            <div style={{ fontSize: 32, fontWeight: 900, color: '#DC2626' }}>{statsMes.pendientes}</div>
          </div>

          <div>
            <div style={{
              display: 'flex', justifyContent: 'space-between',
              fontSize: 11, color: '#6B7280', marginBottom: 6,
            }}>
              <span>% de cierre (mes)</span>
              <span style={{ fontWeight: 700, color: '#0F172A' }}>{statsMes.pctCierre}%</span>
            </div>
            <div style={{ height: 8, background: '#F4F3F8', borderRadius: 4, overflow: 'hidden' }}>
              <div style={{
                width: `${statsMes.pctCierre}%`, height: '100%',
                background: 'linear-gradient(90deg, #16A34A, #22C55E)',
                borderRadius: 4,
                transition: 'width 0.3s',
              }}/>
            </div>
            <div style={{ fontSize: 10, color: '#9CA3AF', marginTop: 4 }}>
              {statsMes.totalMes > 0
                ? `${Math.round(statsMes.pctCierre * statsMes.totalMes / 100)} de ${statsMes.totalMes} OTs cerradas`
                : 'Sin OTs ingresadas este mes'}
            </div>
          </div>
        </div>

      </div>

      {/* Modal detalle */}
      {modalOrden && (
        <ModalDetalleOT
          orden={modalOrden}
          proyectoId={modalOrden.proyecto_id}
          onClose={() => setModalOrden(null)}
          onGuardado={() => { setModalOrden(null); cargarTodasLasOrdenes(); }}
        />
      )}

      {ToastComponent}
    </div>
  );
}
