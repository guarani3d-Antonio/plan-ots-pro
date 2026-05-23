import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { useProyectosStore } from '../../stores/proyectosStore';
import { useOrdenesStore } from '../../stores/ordenesStore';
import type { OrdenLocal } from '../../types/orden';
import Marcador from './Marcador';
import { PanelOT } from './PanelOT';
import { PanelResumen } from './PanelResumen';
import ToolPanel from './ToolPanel';
import { useRealtimeOrdenes } from '../../hooks/useRealtimeOrdenes';
import { useAccionesProyecto } from '../../hooks/useAccionesProyecto';
import InformePanel from '../informes/InformePanel';
import styles from './VistaPlano.module.css';

pdfjsLib.GlobalWorkerOptions.workerSrc =
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

const MIN_SCALE = 0.05;
const MAX_SCALE = 12;

// ── Prop nueva para toggle de vista ──────────────────────
interface VistaPlanoProps {
  onSwitchToGrilla?: () => void;
}

export default function VistaPlano({}: VistaPlanoProps) {
  const proyecto = useProyectosStore(s => s.proyectoActivo);
  const ordenes              = useOrdenesStore((s) => s.ordenes);
  const cargarOrdenes        = useOrdenesStore((s) => s.cargarOrdenes);
  const crearOrdenEnPosicion = useOrdenesStore((s) => s.crearOrdenEnPosicion);
  const actualizarOrden      = useOrdenesStore((s) => s.actualizarOrden);
  useRealtimeOrdenes(proyecto?.id ?? null);

  // Acciones compartidas por PanelResumen y ToolPanel — el hook maneja estado
  // (cargando, modales de import/version/historial/comparador) en un solo lugar.
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
  // Activo sólo cuando una OT recién ubicada (pos_x era null) abre el PanelOT.
  // Hace que el panel arranque en el tab Fotos y obligue a completar fotos antes
  // de poder guardar; "Cancelar ubicación" desubica la OT y la vuelve al ToolPanel.
  const [modoForzadoFotos, setModoForzadoFotos] = useState(false);
  const [mostrarInforme, setMostrarInforme] = useState(false);

  // ── Filtros visuales (afectan markers en el plano Y lista en PanelResumen) ──
  // Estado: explícito, todos arrancan seleccionados.
  // Rubro: empty Set = "todos pasan" (auto-poblado cuando aparecen rubros).
  // Prioridad: explícito, todos arrancan seleccionados.
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

  // Auto-poblar filtrosRubro cuando aparecen rubros nuevos en las OTs.
  const rubrosUnicos = useMemo(() => {
    const s = new Set<string>();
    for (const o of ordenes) if (o.rubro) s.add(o.rubro);
    return [...s].sort();
  }, [ordenes]);

  // Key que captura los VALORES (no sólo el length) de rubrosUnicos. Sin esto,
  // editar el rubro de una OT existente (mismo count, valor distinto) no
  // dispara el effect → el nuevo rubro queda fuera del Set y la OT desaparece
  // del plano hasta recargar.
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

  // Filtrado compartido — alimenta los marcadores del plano y la lista del panel.
  // Rubro vacío = pasa todo (consistente con el spec del usuario).
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
    if (!area || !planoDims.w || !planoDims.h) return;
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
    if (!proyecto?.plano_url) return;
    const url   = proyecto.plano_url;
    const isPdf = url.toLowerCase().includes('.pdf');
    setEsImagen(!isPdf);
    setPlanoListo(false);
    setErrorPlano(null);
    if (isPdf) cargarPDF(url);
    else       cargarImagen(url);
  }, [proyecto?.plano_url]);

  async function cargarPDF(url: string) {
    try {
      if (renderTaskRef.current) { renderTaskRef.current.cancel(); renderTaskRef.current = null; }
      const doc   = await pdfjsLib.getDocument({ url, disableRange: true, disableStream: true }).promise;
      const page  = await doc.getPage(1);
      const vp0   = page.getViewport({ scale: 1 });
      const area  = planAreaRef.current;
      const scale = Math.max((area?.clientWidth ?? 1200) * 2.5, 2800) / vp0.width;
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

  useEffect(() => { if (planoListo) fitView(); }, [planoListo, fitView]);

  useEffect(() => {
    if (proyecto?.id) cargarOrdenes(proyecto.id);
    return () => useOrdenesStore.getState().limpiar();
  }, [proyecto?.id]);

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
  const panRef     = useRef({ active: false, sx: 0, sy: 0, ox: 0, oy: 0 });
  const didDragRef = useRef(false);
  const [isPanning, setIsPanning] = useState(false);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    didDragRef.current = false;
    const t = e.target as HTMLElement;
    // No iniciar pan si el pointerdown ocurre sobre un marcador o sobre un
    // control de UI (zoom buttons, etc.). Sin esto, setPointerCapture redirige
    // todos los eventos posteriores al .planArea y los botones nunca reciben
    // el click → bug del zoom no funcional.
    if (t.closest('[data-marcador]') || t.closest('[data-no-pan]')) return;
    panRef.current = { active: true, sx: e.clientX, sy: e.clientY, ox: txRef.current, oy: tyRef.current };
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
    setIsPanning(true);
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.buttons > 0 && (Math.abs(e.movementX) + Math.abs(e.movementY)) > 1) {
      didDragRef.current = true;
    }
    const p = panRef.current;
    if (!p.active) return;
    const dx = e.clientX - p.sx, dy = e.clientY - p.sy;
    applyTransform(scRef.current, p.ox + dx, p.oy + dy);
  }, [applyTransform]);

  const onPointerUp = useCallback(() => {
    panRef.current.active = false;
    setIsPanning(false);
  }, []);

  // ── Click → crear OT ─────────────────────────────────────
  const onPlanClick = useCallback(async (e: React.MouseEvent<HTMLDivElement>) => {
    if (didDragRef.current) return;
    // Si el click proviene de un marcador o de cualquier UI marcado con
    // data-no-pan (zoom controls, etc.), no crear OT — esa interacción la
    // maneja el onClick del propio elemento.
    const t = e.target as HTMLElement;
    if (t.closest('[data-marcador]') || t.closest('[data-no-pan]')) return;
    if (!planoListo || !planoDims.w || !proyecto) return;
    const area = planAreaRef.current!;
    const rect = area.getBoundingClientRect();
    const posX = (e.clientX - rect.left - txRef.current) / scRef.current / planoDims.w;
    const posY = (e.clientY - rect.top  - tyRef.current) / scRef.current / planoDims.h;
    if (posX < 0 || posX > 1 || posY < 0 || posY > 1) return;
    const nueva = await crearOrdenEnPosicion(proyecto.id, posX, posY);
    setOrdenSeleccionada(nueva);
  }, [planoListo, planoDims, proyecto, crearOrdenEnPosicion]);

  const handleSeleccionar = useCallback((orden: OrdenLocal) => {
    setOrdenSeleccionada(orden);
  }, []);

  // ── Drag & Drop ──────────────────────────────────────────
  // OTs sin ubicar (pos_x null/undefined) — alimentan el ToolPanel izquierdo.
  // El tipo OrdenLocal.pos_x es `number`, pero runtime puede venir null
  // para OTs recién importadas vía CSV.
  const ordenessinUbicar = ordenes.filter(
    o => o.pos_x === null || o.pos_x === undefined || (o as any).pos_x === null
  );

  // Acepta dos tipos de drop:
  //   text/ot-move → drag de un Marcador existente sobre el plano (mover)
  //   text/ot-id   → drag de una card del ToolPanel (ubicar OT nueva)
  //
  // CRÍTICO: las coordenadas se calculan contra el .planWrap (mismo contenedor
  // donde los marcadores tienen left/top: pos_*100%), NO contra el wrapper
  // externo del onDrop. El .planWrap tiene `transform: translate + scale` por
  // el pan/zoom; getBoundingClientRect() devuelve la caja visual post-transform,
  // así (clientX - rect.left) / rect.width da el ratio correcto dentro del plano
  // sin tener que compensar tx/ty/sc manualmente.
  const handleDropOT = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();

    const contenedor = planWrapRef.current;
    if (!contenedor) return;

    const rect = contenedor.getBoundingClientRect();
    const pos_x = Math.max(0.01, Math.min(0.99, (e.clientX - rect.left) / rect.width));
    const pos_y = Math.max(0.01, Math.min(0.99, (e.clientY - rect.top)  / rect.height));

    // Mover OT existente
    const moveId = e.dataTransfer.getData('text/ot-move');
    if (moveId) {
      actualizarOrden(moveId, { pos_x, pos_y });
      return;
    }

    // Ubicar OT sin ubicar (desde ToolPanel) — es la PRIMERA ubicación de esta
    // OT. Después de persistir las coords, abrimos el PanelOT en modo forzado
    // para empujar al usuario a completar fotos antes de cerrar.
    const placeId = e.dataTransfer.getData('text/ot-id');
    if (placeId) {
      actualizarOrden(placeId, { pos_x, pos_y });
      const ordenObjetivo = useOrdenesStore.getState().ordenes.find(o => o.id === placeId);
      if (ordenObjetivo) {
        setOrdenSeleccionada(ordenObjetivo);
        setModoForzadoFotos(true);
      }
      return;
    }
  }, [actualizarOrden]);

  if (!proyecto) return null;

  const ordenActualizada = ordenSeleccionada
    ? ordenes.find(o => o.id === ordenSeleccionada.id) ?? null
    : null;

  return (
    <div className={styles.vistaPlano}>

      {/* ── Top Bar (acciones internas) ──
          El TopBar global (← Proyectos, nombre proyecto, toggle Plano/Grilla,
          Salir) vive en App.tsx. Acá quedan solo las acciones específicas
          de la vista Plano: badge de count + acciones de proyecto + Informe + Config. */}
      <div className={styles.topBar}>
        <span className={styles.statBadge}>{ordenes.length} OTs</span>

        <div className={styles.topGroup}>
          <button
            className={styles.btnVolver}
            onClick={acciones.abrirImportarCSV}
            title="Importar OTs desde CSV"
            disabled={!!cargandoAcciones}
          >
            📥 Importar
          </button>
          <button
            className={styles.btnVolver}
            onClick={acciones.abrirGuardarVersion}
            title="Guardar snapshot de versión"
            disabled={ordenes.length === 0}
          >
            💾 Versión
          </button>
          <button
            className={styles.btnVolver}
            onClick={acciones.abrirComparador}
            title="Comparar versiones"
          >
            🔀 Comparar
          </button>
        </div>

        <div style={{ flex: 1 }} />

        <div className={styles.topGroup}>
          <button
            className={styles.btnVolver}
            onClick={acciones.exportarCSV}
            title="Exportar CSV"
            disabled={!!cargandoAcciones || ordenes.length === 0}
          >
            ↑ CSV
          </button>
          <button
            className={styles.btnInforme}
            onClick={() => setMostrarInforme(true)}
            title="Generar informe del proyecto"
          >
            📄 Informe
          </button>
          <button
            className={styles.btnIcon}
            onClick={() => console.log('config')}
            title="Configuración"
          >
            ⚙
          </button>
        </div>
      </div>

      {/* Layout principal */}
      <div className={styles.main}>

        {/* Panel IZQUIERDO — Resumen del proyecto + filtros + lista de OTs.
            Recibe los filtros desde VistaPlano (single source of truth) para
            que checkboxes y markers permanezcan sincronizados. */}
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

        {/* Panel auxiliar — OTs sin ubicar (drag&drop al plano).
            Devuelve null si no hay OTs sin ubicar; queda invisible. */}
        <ToolPanel ordenessinUbicar={ordenessinUbicar} />

        {/* Wrapper del área del plano — captura el drop de OTs desde el ToolPanel.
            flex column para que el .planArea interno se estire vertical (flex:1)
            y horizontalmente (align-items:stretch por default). */}
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
          onPointerLeave={onPointerUp}
          onClick={onPlanClick}
        >
          {!planoListo && !errorPlano && (
            <div className={styles.emptyState}>
              <div className={styles.spinner} />
              <p>Cargando plano…</p>
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
                isSelected={ordenSeleccionada?.id === orden.id}
                onClick={() => handleSeleccionar(orden)}
              />
            ))}
          </div>

          {/* Zoom controls — esquina inferior derecha del .planArea.
              data-no-pan evita que .planArea capture los pointer events. */}
          <div className={styles.zoomCtrl} data-no-pan>
            <button
              className={styles.zbtn}
              onClick={() => {
                const area = planAreaRef.current;
                if (!area || !planoDims.w || !planoDims.h) return;
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
      <PanelOT
        orden={ordenActualizada}
        modoForzadoFotos={modoForzadoFotos}
        onCerrar={() => {
          setOrdenSeleccionada(null);
          setModoForzadoFotos(false);
        }}
      />

      {/* Panel de informe */}
      {mostrarInforme && (
        <InformePanel onClose={() => setMostrarInforme(false)} />
      )}

      {/* Modales del hook useAccionesProyecto:
          import CSV, guardar versión, historial, comparador, input file oculto. */}
      {modalesAcciones}

    </div>
  );
}