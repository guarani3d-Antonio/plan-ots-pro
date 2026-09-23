import { useEffect, useLayoutEffect, useMemo, useRef, useState, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { useProyectosStore } from '../../stores/proyectosStore';
import { usePermisoObra } from '../../stores/accessStore';
import { useArchivoPrivadoEstado } from '../../hooks/useArchivoPrivado';
import { useOrdenesStore } from '../../stores/ordenesStore';
import type { OrdenLocal } from '../../types/orden';
import Marcador from './Marcador';
import { PanelOT } from './PanelOT';
import { PanelResumen } from './PanelResumen';
import { useRealtimeOrdenes } from '../../hooks/useRealtimeOrdenes';
import { useAccionesProyecto } from '../../hooks/useAccionesProyecto';
import InformePanel from '../informes/InformePanel';
import { ModalVersiones } from './ModalVersiones';
import type { Version } from '../../services/versionesService';
import { restaurarVersion, listarVersiones } from '../../services/versionesService';
import { obtenerThumbnailPDFCache } from '../../services/pdfThumbnailService';
import styles from './VistaPlano.module.css';

pdfjsLib.GlobalWorkerOptions.workerSrc =
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

const MIN_SCALE = 0.05;
const MAX_SCALE = 12;

interface VistaPlanoProps {
  onSwitchToGrilla?: () => void;
  fullscreen?: boolean;
  onToggleFullscreen?: () => void;
  visible?: boolean;
}

export default function VistaPlano({ fullscreen = false, onToggleFullscreen, visible = true }: VistaPlanoProps) {
  const proyecto = useProyectosStore(s => s.proyectoActivo);
  const permiso = usePermisoObra(proyecto?.id);
  const puedeEditar = !!permiso?.editar;
  const puedeAdministrar = !!permiso?.administrar;
  const [errorAccion, setErrorAccion] = useState<string | null>(null);
  const { url: planoPrivado, error: errorAccesoPlano } = useArchivoPrivadoEstado(proyecto?.plano_url);
  const ordenes              = useOrdenesStore((s) => s.ordenes);
  const cargarOrdenes        = useOrdenesStore((s) => s.cargarOrdenes);
  const asegurarOrdenes      = useOrdenesStore((s) => s.asegurarOrdenes);
  const crearOrdenEnPosicion = useOrdenesStore((s) => s.crearOrdenEnPosicion);
  const actualizarOrden      = useOrdenesStore((s) => s.actualizarOrden);
  useRealtimeOrdenes(proyecto?.id ?? null);

  // Pre-carga versiones en background — modal abre instantáneo
  useEffect(() => {
    if (!proyecto?.id || !puedeAdministrar) return;
    void listarVersiones(proyecto.id).then(v => setVersionesCached(v));
  }, [proyecto?.id, puedeAdministrar]);

  // ── Fullscreen: ESC para salir ──
  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onToggleFullscreen?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fullscreen, onToggleFullscreen]);

  const {
    acciones,
    cargando: cargandoAcciones,
    modales:  modalesAcciones,
  } = useAccionesProyecto(proyecto, ordenes);

  const planAreaRef   = useRef<HTMLDivElement>(null);
  const planWrapRef   = useRef<HTMLDivElement>(null);
  const canvasRef     = useRef<HTMLCanvasElement>(null);
  const imgRef        = useRef<HTMLImageElement>(null);
  const renderTaskRef = useRef<ReturnType<pdfjsLib.PDFPageProxy['render']> | null>(null);

  const [planoListo, setPlanoListo]         = useState(false);
  const [esImagen, setEsImagen]             = useState(false);
  const [planoDims, setPlanoDims]           = useState({ w: 0, h: 0 });
  const [errorPlano, setErrorPlano]         = useState<string | null>(null);
  const [ordenSeleccionada, setOrdenSeleccionada] = useState<OrdenLocal | null>(null);
  const [modoForzadoFotos, setModoForzadoFotos] = useState(false);
  const [esNuevaOT, setEsNuevaOT] = useState(false);
  const [mostrarInforme, setMostrarInforme]           = useState(false);
  const [modalVersionesAbierto, setModalVersionesAbierto] = useState(false);
  const [versionesCached, setVersionesCached]           = useState<import('../../services/versionesService').Version[]>([]);
  const [panelLateralVisible, setPanelLateralVisible] = useState(false);
  const [accionesVisibles, setAccionesVisibles] = useState(false);
  const accionesMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!accionesVisibles) return;
    const cerrar = (event: MouseEvent) => {
      if (!accionesMenuRef.current?.contains(event.target as Node)) setAccionesVisibles(false);
    };
    document.addEventListener('mousedown', cerrar);
    return () => document.removeEventListener('mousedown', cerrar);
  }, [accionesVisibles]);

  // ── Filtros visuales ──
  const [filtrosEstado, setFiltrosEstado] = useState<Set<string>>(
    () => new Set(['Pendiente', 'En proceso', 'Cerrada', 'No aplica']),
  );
  const [filtrosRubro, setFiltrosRubro]     = useState<Set<string>>(new Set());
  const [filtrosPrioridad, setFiltrosPrioridad] = useState<Set<string>>(
    () => new Set(['Alta', 'Media', 'Baja']),
  );

  const toggleEstado = useCallback((estado: string) => {
    setFiltrosEstado(prev => {
      const next = new Set(prev);
      next.has(estado) ? next.delete(estado) : next.add(estado);
      return next;
    });
  }, []);
  const toggleRubro = useCallback((rubro: string) => {
    setFiltrosRubro(prev => {
      const next = new Set(prev);
      next.has(rubro) ? next.delete(rubro) : next.add(rubro);
      return next;
    });
  }, []);
  const togglePrioridad = useCallback((p: string) => {
    setFiltrosPrioridad(prev => {
      const next = new Set(prev);
      next.has(p) ? next.delete(p) : next.add(p);
      return next;
    });
  }, []);

  const rubrosUnicos = useMemo(() => {
    const s = new Set<string>();
    for (const o of ordenes) if (o.rubro) s.add(o.rubro);
    return [...s].sort();
  }, [ordenes]);

  const rubrosKey = useMemo(() => rubrosUnicos.join(','), [rubrosUnicos]);

  useEffect(() => {
    setFiltrosRubro(prev => {
      const next = new Set(prev);
      let cambio = false;
      for (const r of rubrosUnicos) {
        if (!next.has(r)) {
          next.add(r);
          cambio = true;
        }
      }
      return cambio ? next : prev;
    });
  }, [rubrosKey]);

  const ordenesFiltradas = useMemo(() => ordenes.filter(o => {
    const estadoOk    = filtrosEstado.size === 0 || filtrosEstado.has(o.estado ?? '');
    const rubroOk     = filtrosRubro.size === 0 || !o.rubro || filtrosRubro.has(o.rubro);
    const prioridadOk = filtrosPrioridad.size === 0 || !o.prioridad || filtrosPrioridad.has(o.prioridad);
    return estadoOk && rubroOk && prioridadOk;
  }), [ordenes, filtrosEstado, filtrosRubro, filtrosPrioridad]);

  const scRef = useRef(1);
  const txRef = useRef(0);
  const tyRef = useRef(0);
  const [transform, setTransform] = useState({ sc: 1, tx: 0, ty: 0 });

  const applyTransform = useCallback((sc: number, tx: number, ty: number) => {
    scRef.current = sc; txRef.current = tx; tyRef.current = ty;
    setTransform({ sc, tx, ty });
  }, []);

  const fitView = useCallback(() => {
    const area = planAreaRef.current;
    if (!area || area.clientWidth <= 48 || area.clientHeight <= 48 || !planoDims.w || !planoDims.h) return;
    const sc = Math.min(
      (area.clientWidth  - 48) / planoDims.w,
      (area.clientHeight - 48) / planoDims.h
    );
    applyTransform(
      sc,
      (area.clientWidth  - planoDims.w * sc) / 2,
      (area.clientHeight - planoDims.h * sc) / 2
    );
  }, [planoDims, applyTransform]);

  // ── Carga del plano ──────────────────────────────────────
  useEffect(() => {
    if (!planoPrivado) { setPlanoListo(false); setErrorPlano(errorAccesoPlano); return; }
    const url = planoPrivado;
    const isPdf = url.toLowerCase().includes('.pdf');
    setEsImagen(!isPdf);
    setPlanoListo(false);
    setErrorPlano(null);
    if (isPdf) cargarPDF(url);
    else       cargarImagen(url);
  }, [planoPrivado, errorAccesoPlano]);

  async function cargarPDF(url: string) {
    try {
      if (renderTaskRef.current) { renderTaskRef.current.cancel(); renderTaskRef.current = null; }
      const doc   = await pdfjsLib.getDocument({ url, disableRange: true, disableStream: true, isEvalSupported: false }).promise;
      const page  = await doc.getPage(1);
      const vp0   = page.getViewport({ scale: 1 });
      const area  = planAreaRef.current;
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
      const scale = Math.max((area?.clientWidth ?? 1200) * pixelRatio, 1600) / vp0.width;
      const vp    = page.getViewport({ scale });
      const canvas = canvasRef.current!;
      canvas.width = vp.width; canvas.height = vp.height;
      const task = page.render({ canvasContext: canvas.getContext('2d')!, viewport: vp });
      renderTaskRef.current = task;
      await task.promise;
      renderTaskRef.current = null;
      setPlanoDims({ w: vp.width, h: vp.height });
      setPlanoListo(true);
    } catch (e: unknown) {
      if ((e as { name?: string })?.name === 'RenderingCancelledException') return;
      setErrorPlano('No se pudo cargar el PDF.');
    }
  }

  function cargarImagen(url: string) {
    const img   = imgRef.current!;
    img.onload  = () => { setPlanoDims({ w: img.naturalWidth, h: img.naturalHeight }); setPlanoListo(true); };
    img.onerror = () => setErrorPlano('No se pudo cargar la imagen.');
    img.src     = url;
  }

  useLayoutEffect(() => { if (visible && planoListo) fitView(); }, [visible, planoListo, fitView]);

  useEffect(() => {
    if (proyecto?.id) void asegurarOrdenes(proyecto.id);
  }, [proyecto?.id, asegurarOrdenes]);

  // ── Zoom ─────────────────────────────────────────────────
  const doZoom = useCallback((factor: number, cx?: number, cy?: number) => {
    const area = planAreaRef.current;
    if (!area) return;
    const ox    = cx ?? area.clientWidth  / 2;
    const oy    = cy ?? area.clientHeight / 2;
    const oldSc = scRef.current;
    const newSc = Math.max(MIN_SCALE, Math.min(MAX_SCALE, oldSc * factor));
    const ratio = newSc / oldSc;
    applyTransform(newSc, ox - (ox - txRef.current) * ratio, oy - (oy - tyRef.current) * ratio);
  }, [applyTransform]);

  useEffect(() => {
    const area = planAreaRef.current;
    if (!area) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const rect = area.getBoundingClientRect();
      doZoom(e.deltaY < 0 ? 1.1 : 0.9, e.clientX - rect.left, e.clientY - rect.top);
    };
    area.addEventListener('wheel', handler, { passive: false });
    return () => area.removeEventListener('wheel', handler);
  }, [doZoom]);

  // ── Pan ──────────────────────────────────────────────────
  const [modoPlano, setModoPlano] = useState<'navegar' | 'crear' | 'mover'>('navegar');
  const [ordenAMover, setOrdenAMover] = useState<string | null>(null);
  const accionPlanoRef = useRef(false);
  const panRef = useRef({ active: false, pointerId: -1, sx: 0, sy: 0, ox: 0, oy: 0 });
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const pinchRef = useRef<{ distance: number; scale: number; tx: number; ty: number; cx: number; cy: number } | null>(null);
  const didDragRef = useRef(false);
  const gestoBloqueadoRef = useRef(false);
  const [isPanning, setIsPanning] = useState(false);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (target.closest('[data-no-pan]') || (e.pointerType === 'mouse' && e.button !== 0)) return;
    if (pointersRef.current.size === 0) didDragRef.current = false;
    if (e.pointerType !== 'mouse') {
      pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointersRef.current.size > 2) { gestoBloqueadoRef.current = true; return; }
      if (pointersRef.current.size === 2) {
        e.currentTarget.setPointerCapture(e.pointerId);
        const [a, b] = [...pointersRef.current.values()];
        const rect = e.currentTarget.getBoundingClientRect();
        pinchRef.current = {
          distance: Math.hypot(a.x - b.x, a.y - b.y), scale: scRef.current,
          tx: txRef.current, ty: tyRef.current,
          cx: (a.x + b.x) / 2 - rect.left, cy: (a.y + b.y) / 2 - rect.top,
        };
        panRef.current.active = false;
        didDragRef.current = true;
        setIsPanning(true);
        return;
      }
    }
    const t = e.target as HTMLElement;
    if (e.pointerType !== 'mouse' && t.closest('[data-marcador]')) t.setPointerCapture(e.pointerId);
    if (t.closest('[data-marcador]') || t.closest('[data-no-pan]')) return;
    panRef.current = { active: true, pointerId: e.pointerId, sx: e.clientX, sy: e.clientY, ox: txRef.current, oy: tyRef.current };
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
    setIsPanning(true);
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (gestoBloqueadoRef.current) return;
    if (pointersRef.current.has(e.pointerId)) {
      pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinchRef.current && pointersRef.current.size >= 2) {
        const [a, b] = [...pointersRef.current.values()];
        const pinch = pinchRef.current;
        const rect = e.currentTarget.getBoundingClientRect();
        const ratio = Math.hypot(a.x - b.x, a.y - b.y) / Math.max(1, pinch.distance);
        const scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, pinch.scale * ratio));
        const zoomRatio = scale / pinch.scale;
        applyTransform(scale,
          (a.x + b.x) / 2 - rect.left - (pinch.cx - pinch.tx) * zoomRatio,
          (a.y + b.y) / 2 - rect.top - (pinch.cy - pinch.ty) * zoomRatio);
        didDragRef.current = true;
        return;
      }
    }
    const p = panRef.current;
    if (!p.active || e.pointerId !== p.pointerId || pinchRef.current) return;
    const dx = e.clientX - p.sx, dy = e.clientY - p.sy;
    if (Math.hypot(dx, dy) > 4) didDragRef.current = true;
    applyTransform(scRef.current, p.ox + dx, p.oy + dy);
  }, [applyTransform]);

  const onPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size === 0) gestoBloqueadoRef.current = false;
    if (pinchRef.current) {
      panRef.current.active = false;
      if (pointersRef.current.size === 0) { pinchRef.current = null; setIsPanning(false); }
      return;
    }
    panRef.current.active = false;
    setIsPanning(false);
  }, []);

  useEffect(() => {
    const reset = () => {
      pointersRef.current.clear(); pinchRef.current = null;
      panRef.current.active = false; gestoBloqueadoRef.current = false;
      didDragRef.current = true; setIsPanning(false);
    };
    window.addEventListener('resize', reset);
    return () => window.removeEventListener('resize', reset);
  }, []);

  // ── Click → crear OT ─────────────────────────────────────
  const onPlanClick = useCallback(async (e: React.MouseEvent<HTMLDivElement>) => {
    if (accionPlanoRef.current || didDragRef.current || !puedeEditar || modoPlano === 'navegar' || (modoPlano === 'mover' && !ordenAMover)) return;
    const t = e.target as HTMLElement;
    if (t.closest('[data-marcador]') || t.closest('[data-no-pan]')) return;
    if (!planoListo || !planoDims.w || !proyecto) return;
    const area = planAreaRef.current!;
    const rect = area.getBoundingClientRect();
    const posX = (e.clientX - rect.left - txRef.current) / scRef.current / planoDims.w;
    const posY = (e.clientY - rect.top  - tyRef.current) / scRef.current / planoDims.h;
    if (posX < 0 || posX > 1 || posY < 0 || posY > 1) return;
    accionPlanoRef.current = true;
    try {
      if (modoPlano === 'mover' && ordenAMover) {
        if (!ordenes.some(o => o.id === ordenAMover && o.proyecto_id === proyecto.id)) return;
        await actualizarOrden(ordenAMover, { pos_x: posX, pos_y: posY });
        setOrdenAMover(null); setModoPlano('navegar'); setErrorAccion(null); return;
      }
      const nueva = await crearOrdenEnPosicion(proyecto.id, posX, posY);
      setModoPlano('navegar');
      setOrdenSeleccionada(nueva); setEsNuevaOT(true); setErrorAccion(null);
    } catch(e) { setErrorAccion(e instanceof Error ? e.message : 'No se pudo completar la acción en el plano.'); }
    finally { accionPlanoRef.current = false; }
  }, [planoListo, planoDims, proyecto, crearOrdenEnPosicion, puedeEditar, modoPlano, ordenAMover, actualizarOrden, ordenes]);

  const handleSeleccionar = useCallback((orden: OrdenLocal) => {
    setOrdenSeleccionada(orden);
    setEsNuevaOT(false);
  }, []);

  // ── Drag & Drop ──────────────────────────────────────────
  const handleDropOT = useCallback(async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!puedeEditar) return;
    const contenedor = planWrapRef.current;
    if (!contenedor) return;
    const rect = contenedor.getBoundingClientRect();
    const pos_x = Math.max(0.01, Math.min(0.99, (e.clientX - rect.left) / rect.width));
    const pos_y = Math.max(0.01, Math.min(0.99, (e.clientY - rect.top)  / rect.height));
    const moveId = e.dataTransfer.getData('text/ot-move');
    if (moveId) {
      if (modoPlano !== 'mover' || !ordenes.some(o => o.id === moveId && o.proyecto_id === proyecto?.id)) return;
      try{await actualizarOrden(moveId,{pos_x,pos_y});setErrorAccion(null);}
      catch(err){setErrorAccion(err instanceof Error?err.message:'No se pudo mover la orden.');}
      return;
    }
    const placeId = e.dataTransfer.getData('text/ot-id');
    if (placeId) {
      if (!ordenes.some(o => o.id === placeId && o.proyecto_id === proyecto?.id)) return;
      try{
        const ordenObjetivo=await actualizarOrden(placeId,{pos_x,pos_y});setErrorAccion(null);
        if(ordenObjetivo){setOrdenSeleccionada(ordenObjetivo);
        setModoForzadoFotos(true);
        }
      }catch(err){setErrorAccion(err instanceof Error?err.message:'No se pudo ubicar la orden.');}
      return;
    }
  }, [actualizarOrden, puedeEditar, modoPlano, ordenes, proyecto?.id]);

  if (!proyecto) return null;

  // ── Restaurar versión ──────────────────────────────────────────────────────
  async function handleRestaurar(v: Version) {
    if (!proyecto) return;
    try {
      await restaurarVersion(v, proyecto.id);
      await cargarOrdenes(proyecto.id);
      setModalVersionesAbierto(false);
      setErrorAccion(null);
    } catch (error) {
      const mensaje=error instanceof Error?error.message:'No se pudo restaurar la versión.';
      setErrorAccion(mensaje);window.alert(mensaje);
    }
  }

  const ordenActualizada = ordenSeleccionada
    ? ordenes.find(o => o.id === ordenSeleccionada.id) ?? null
    : null;

  return (
    <div className={styles.vistaPlano}>

      {/* ── Top Bar: se oculta en fullscreen ── */}
      {!fullscreen && (
        <div className={styles.topBar}>
          <span className={styles.statBadge}>{ordenes.length} OTs</span>
          <button
            type="button"
            className={`${styles.btnPanel} ${panelLateralVisible ? styles.btnPanelActive : ''}`}
            onClick={() => setPanelLateralVisible(v => !v)}
            aria-expanded={panelLateralVisible}
          >
            <span aria-hidden="true">☷</span> Panel y filtros
          </button>
          <div style={{ flex: 1 }} />
          <div className={styles.actionsMenuWrap} ref={accionesMenuRef}>
            <button type="button" className={styles.btnVolver} onClick={() => setAccionesVisibles(v => !v)} aria-expanded={accionesVisibles}>
              Acciones <span aria-hidden="true">▾</span>
            </button>
            {accionesVisibles && (
              <div className={styles.actionsMenu} role="menu">
                <button onClick={() => { acciones.abrirImportarCSV(); setAccionesVisibles(false); }} disabled={!!cargandoAcciones || !puedeEditar}>📥 <span><b>Importar OTs</b><small>Desde un archivo CSV</small></span></button>
                <button onClick={() => { setModalVersionesAbierto(true); setAccionesVisibles(false); }} disabled={ordenes.length === 0 || !puedeAdministrar}>💾 <span><b>Versiones</b><small>Guardar o restaurar</small></span></button>
                <button onClick={() => { acciones.abrirComparador(); setAccionesVisibles(false); }} disabled={!puedeAdministrar}>🔀 <span><b>Comparar</b><small>Revisar cambios entre versiones</small></span></button>
                <button onClick={() => { acciones.exportarCSV(); setAccionesVisibles(false); }} disabled={!!cargandoAcciones || ordenes.length === 0}>↑ <span><b>Exportar CSV</b><small>Descargar las órdenes</small></span></button>
                <button onClick={() => { setMostrarInforme(true); setAccionesVisibles(false); }}>📄 <span><b>Generar informe</b><small>Vista general del proyecto</small></span></button>
              </div>
            )}
          </div>
          <div className={styles.topGroup}>
            <button
              className={styles.btnIcon}
              onClick={() => onToggleFullscreen?.()}
              title="Pantalla completa"
            >
              ⛶
            </button>
          </div>
        </div>
      )}

      {/* ── Botón flotante para salir de fullscreen (tablet en obra) ── */}
      {fullscreen && (
        <button
          type="button"
          onClick={() => onToggleFullscreen?.()}
          title="Salir de pantalla completa (ESC)"
          style={{
            position: 'fixed',
            top: 12,
            right: 12,
            zIndex: 9000,
            width: 40,
            height: 40,
            borderRadius: 10,
            border: '1px solid #E5E7EB',
            background: 'rgba(255,255,255,0.92)',
            color: '#0F172A',
            fontSize: 18,
            cursor: 'pointer',
            boxShadow: '0 2px 8px rgba(15,23,42,0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          ✕
        </button>
      )}

      {/* Layout principal */}
      <div className={styles.main}>

        {/* Cajón superpuesto: no cambia el tamaño ni el zoom del plano. */}
        {!fullscreen && (
          <div className={`${styles.panelDrawer} ${panelLateralVisible ? styles.panelDrawerOpen : ''}`} aria-hidden={!panelLateralVisible}>
            <PanelResumen
              ordenes={ordenes}
              ordenesFiltradas={ordenesFiltradas}
              rubrosUnicos={rubrosUnicos}
              filtrosEstado={filtrosEstado}
              filtrosRubro={filtrosRubro}
              filtrosPrioridad={filtrosPrioridad}
              onToggleEstado={toggleEstado}
              onToggleRubro={toggleRubro}
              onTogglePrioridad={togglePrioridad}
              ordenSeleccionadaId={ordenSeleccionada?.id}
              onSeleccionar={handleSeleccionar}
              proyecto={proyecto}
              acciones={acciones}
              cargando={cargandoAcciones}
            />
          </div>
        )}

        {/* Wrapper del área del plano */}
        <div
          style={{
            flex: 1,
            position: 'relative',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          }}
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
          }}
          onDrop={handleDropOT}
        >

        {/* Plan Area */}
        <div
          ref={planAreaRef}
          className={styles.planArea}
          style={{ cursor: isPanning ? 'grabbing' : 'crosshair' }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={e => { didDragRef.current = true; onPointerUp(e); }}
          onClick={onPlanClick}
        >
          {!planoListo && !errorPlano && (
            <div className={styles.emptyState}>
              {proyecto.plano_url.toLowerCase().includes('.pdf') && obtenerThumbnailPDFCache(proyecto.plano_url) && (
                <img className={styles.loadingPreview} src={obtenerThumbnailPDFCache(proyecto.plano_url)!} alt="Vista previa del plano" />
              )}
              <div className={styles.spinner} />
              <p>Preparando plano…</p>
            </div>
          )}
          {errorPlano && (
            <div className={styles.emptyState}>
              <span>⚠️</span>
              <p className={styles.errorMsg}>{errorPlano}</p>
            </div>
          )}
          {planoListo && ordenes.length === 0 && (
            <div className={styles.hintOverlay}>
              Clic en el plano para colocar una OT
            </div>
          )}

          <div
            ref={planWrapRef}
            className={styles.planWrap}
            style={{
              transform: `translate(${transform.tx}px,${transform.ty}px) scale(${transform.sc})`,
            }}
          >
            <canvas
              ref={canvasRef}
              className={styles.planoCanvas}
              style={{ display: esImagen ? 'none' : 'block' }}
            />
            <img
              ref={imgRef}
              className={styles.planoImg}
              style={{ display: esImagen ? 'block' : 'none' }}
              alt="Plano"
              draggable={false}
            />

            {planoListo && ordenesFiltradas.map(orden => (
              <Marcador
                key={orden.id}
                orden={orden}
                isSelected={ordenSeleccionada?.id === orden.id || ordenAMover === orden.id}
                movible={puedeEditar && modoPlano === 'mover'}
                onClick={() => { if (didDragRef.current) return; if (modoPlano === 'mover') setOrdenAMover(orden.id); else handleSeleccionar(orden); }}
              />
            ))}
          </div>

          {/* Zoom controls */}
          <div className={styles.zoomCtrl} data-no-pan>
            {puedeEditar && <button type="button" aria-pressed={modoPlano === 'crear'} onClick={() => { setModoPlano(modoPlano === 'crear' ? 'navegar' : 'crear'); setOrdenAMover(null); }}>Nueva OT</button>}
            {puedeEditar && <button type="button" aria-pressed={modoPlano === 'mover'} onClick={() => { setModoPlano(modoPlano === 'mover' ? 'navegar' : 'mover'); setOrdenAMover(null); }}>Mover OT</button>}
            {modoPlano !== 'navegar' && <span role="status">{modoPlano === 'crear' ? 'Tocá el lugar de la nueva OT' : ordenAMover ? 'Tocá el destino' : 'Seleccioná un pin'}</span>}
            <button
              className={styles.zbtn}
              onClick={() => {
                const area = planAreaRef.current;
                if (!area || area.clientWidth <= 48 || area.clientHeight <= 48 || !planoDims.w || !planoDims.h) return;
                const sc = scRef.current;
                applyTransform(
                  sc,
                  (area.clientWidth  - planoDims.w * sc) / 2,
                  (area.clientHeight - planoDims.h * sc) / 2,
                );
              }}
              title="Centrar"
            >🎯</button>
            <button className={styles.zbtn} onClick={() => doZoom(1.25)} title="Acercar">+</button>
            <span className={styles.zoomLbl}>{Math.round(transform.sc * 100)}%</span>
            <button className={styles.zbtn} onClick={() => doZoom(0.8)} title="Alejar">−</button>
            <button className={styles.zbtn} onClick={fitView} title="Ajustar al área">⊡</button>
          </div>

        </div>
        {/* /wrapper drop */}
        </div>
      </div>

      {/* Panel OT derecho */}
      {errorAccion && <div role="alert">{errorAccion}</div>}
      <PanelOT
        orden={ordenActualizada}
        modoForzadoFotos={modoForzadoFotos}
        esNueva={esNuevaOT}
        onCerrar={() => {
          setOrdenSeleccionada(null);
          setModoForzadoFotos(false);
          setEsNuevaOT(false);
        }}
      />

      {/* Panel de informe */}
      {modalVersionesAbierto && proyecto && (
        <ModalVersiones
          proyectoId={proyecto.id}
          ordenes={ordenes}
          versionesInicial={versionesCached}
          onCerrar={() => setModalVersionesAbierto(false)}
          onComparar={(versionId) => { setModalVersionesAbierto(false); acciones.abrirComparador(versionId); }}
          onRestaurar={(v) => void handleRestaurar(v)}
        />
      )}
      {mostrarInforme && (
        <InformePanel onClose={() => setMostrarInforme(false)} />
      )}

      {/* Modales del hook useAccionesProyecto */}
      {modalesAcciones}

    </div>
  );
}
