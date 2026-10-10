import { useAccessStore } from '../../stores/accessStore';
import { useEffect, useState, useRef, useMemo, type PointerEvent } from 'react';
import { MenuAccionesProyecto } from './MenuAccionesProyecto';
import { useArrastreProyectos } from './useArrastreProyectos';
import { errorDestinoMovimiento, restriccionesCarpeta, type ElementoMovimiento } from '../../utils/moverElementosProyecto';
import { useProyectosStore, PLANO_PENDIENTE, type Proyecto } from '../../stores/proyectosStore';
import { validarCalidadPlano } from '../../utils/validarCalidadPlano';
import { ImagenPrivada } from './ImagenPrivada';
import { cargarStatsProyectos, type ProyectoStats } from '../../services/statsService';
import { generarThumbnailPDF, obtenerThumbnailPDFCache } from '../../services/pdfThumbnailService';
import { procesarPlanoCanvas, esPDFFile } from '../../utils/planoScanner';
import { supabase } from '../../db/supabase';
import { assertSession, identityId, sessionTicket } from '../../security/sessionScope';
import styles from './SelectorProyectos.module.css';

interface Carpeta { id: string; tenant_id: string; padre_id: string | null; nombre: string; profundidad: number; created_by: string }

function rutaDeCarpeta(carpetas: Carpeta[], id: string | null): Carpeta[] {
  const porId = new Map(carpetas.map(c => [c.id, c]));
  const ruta: Carpeta[] = [];
  const visitados = new Set<string>();
  let actual = id;
  while (actual && !visitados.has(actual) && ruta.length < 5) {
    visitados.add(actual);
    const carpeta = porId.get(actual);
    if (!carpeta) break;
    ruta.unshift(carpeta);
    actual = carpeta.padre_id;
  }
  return ruta;
}

function normalizarBusqueda(valor: string): string {
  return valor.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es').trim();
}

// Stats por defecto cuando un proyecto aún no fue cargado en statsMap.
const STATS_VACIO: ProyectoStats = {
  proyecto_id: '',
  pendiente:   0,
  en_proceso:  0,
  cerrada:     0,
  no_aplica:   0,
  total:       0,
  pct_cerrada: 0,
};
const statsCache = new Map<string, ProyectoStats>();
const VISTA_PROYECTOS_KEY = 'plan-ots-proyectos-vista-v1';
type VistaProyectos = 'tarjetas' | 'lista';

interface SelectorProyectosProps {
  onOpenDashboard?: () => void;
  /** Permite que App.tsx abra el proyecto y cambie a la vista de plano juntos. */
  onAbrirProyecto?: (proyecto: Proyecto) => void;
}

// Colores de cada estado de OT (para los stat dots de la card)
const COLOR_PENDIENTE  = '#EF4444';
const COLOR_EN_PROCESO = '#3B82F6';
const COLOR_CERRADA    = '#22C55E';
const COLOR_NO_APLICA  = '#6B7280';

export function SelectorProyectos({ onAbrirProyecto }: SelectorProyectosProps) {
  const {
    proyectos, loading, error,
    cargarProyectos, setProyectoActivo,
    eliminarProyecto, duplicarProyecto, cargarPlanoInicial, crearPlanoEnObra, moverProyecto,
  } = useProyectosStore();

  const abrirProyecto = onAbrirProyecto ?? setProyectoActivo;
  const { contexto, empresaId } = useAccessStore();
  const [menuAbierto,    setMenuAbierto]    = useState<string | null>(null);
  const [confirmDelete,  setConfirmDelete]  = useState<Proyecto | null>(null);
  const [accionError,    setAccionError]    = useState<string | null>(null);
  const [planoPendiente, setPlanoPendiente] = useState<Proyecto | null>(null);
  const [torreNuevoPlano, setTorreNuevoPlano] = useState<Proyecto | null>(null);
  const [nombreNuevoPlano, setNombreNuevoPlano] = useState('');
  const [archivoNuevoPlano, setArchivoNuevoPlano] = useState<File | null>(null);
  const [carpetaNuevoPlano, setCarpetaNuevoPlano] = useState<string | null>(null);
  const [carpetas, setCarpetas] = useState<Carpeta[]>([]);
  const [historialCarpetas, setHistorialCarpetas] = useState<{ rutas: (string | null)[]; indice: number }>({ rutas: [null], indice: 0 });
  const carpetaActual = historialCarpetas.rutas[historialCarpetas.indice];
  const [modalCarpeta, setModalCarpeta] = useState(false);
  const [nombreCarpeta, setNombreCarpeta] = useState('');
  const [empresaNuevaCarpeta, setEmpresaNuevaCarpeta] = useState('');
  const [creandoCarpeta, setCreandoCarpeta] = useState(false);
  const [proyectoMover, setProyectoMover] = useState<Proyecto | null>(null);
  const [carpetaMover, setCarpetaMover] = useState<Carpeta | null>(null);
  const [destinoMover, setDestinoMover] = useState<string | null>(null);
  const [elementoMoviendo, setElementoMoviendo] = useState<string | null>(null);
  const moviendo = elementoMoviendo !== null;
  const [avisoAccion, setAvisoAccion] = useState<string | null>(null);
  const [menuCarpeta, setMenuCarpeta] = useState<string | null>(null);
  const [carpetaEliminable, setCarpetaEliminable] = useState<Record<string, boolean>>({});
  const [carpetaRenombrar, setCarpetaRenombrar] = useState<Carpeta | null>(null);
  const [nombreEditarCarpeta, setNombreEditarCarpeta] = useState('');
  const [carpetaEliminar, setCarpetaEliminar] = useState<Carpeta | null>(null);
  const [guardandoCarpeta, setGuardandoCarpeta] = useState(false);
  const [busquedaCarpeta, setBusquedaCarpeta] = useState('');
  const [creandoPlano, setCreandoPlano] = useState(false);
  const [subiendoPlano, setSubiendoPlano] = useState(false);
  const [busqueda,       setBusqueda]       = useState('');
  const [vistaProyectos, setVistaProyectos] = useState<VistaProyectos>(() => {
    try { return localStorage.getItem(VISTA_PROYECTOS_KEY) === 'lista' ? 'lista' : 'tarjetas'; }
    catch { return 'tarjetas'; }
  });
  const [statsMap,       setStatsMap]       = useState<Record<string, ProyectoStats>>(() => Object.fromEntries(statsCache));
  const [thumbnails,     setThumbnails]     = useState<Record<string, string>>({});
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const [espacioMovimiento, setEspacioMovimiento] = useState({ vista: '', altura: 0 });
  const vistaMovimiento = JSON.stringify([empresaId, carpetaActual, busqueda, vistaProyectos]);
  const arrastre = useArrastreProyectos();
  const arrastrando = arrastre.activo?.elemento;
  const destinoArrastre = arrastre.activo && !arrastre.activo.error && arrastre.activo.destino !== undefined
    ? arrastre.activo.destino ?? 'raiz' : undefined;
  const movimientoRef = useRef(false);

  function cerrarMenus() { setMenuAbierto(null); setMenuCarpeta(null); }

  useEffect(() => {
    try { localStorage.setItem(VISTA_PROYECTOS_KEY, vistaProyectos); }
    catch { /* La vista funciona igualmente si el almacenamiento está deshabilitado. */ }
  }, [vistaProyectos]);

  function navegarCarpeta(id: string | null) {
    setMenuCarpeta(null);
    setHistorialCarpetas(prev => {
      if (prev.rutas[prev.indice] === id) return prev;
      const rutas = [...prev.rutas.slice(0, prev.indice + 1), id];
      return { rutas, indice: rutas.length - 1 };
    });
  }

  useEffect(() => { void cargarProyectos(); }, [cargarProyectos, empresaId]);
  useEffect(() => {
    let vigente = true;
    const ticket = sessionTicket();
    let query = supabase.from('plan_carpetas').select('id,tenant_id,padre_id,nombre,profundidad,created_by').order('nombre');
    if (empresaId) query = query.eq('tenant_id', empresaId);
    void query.then(({ data, error }) => {
      if (!vigente) return;
      try { assertSession(ticket); } catch { return; }
      if (error) setAccionError(`No se pudieron cargar las carpetas: ${error.message}`);
      else setCarpetas(data as Carpeta[]);
    });
    return () => { vigente = false; };
  }, [empresaId]);

  // Cargar conteos reales de OTs por proyecto desde Supabase.
  // Una sola query con .in() agrupa todas las stats en memoria.
  useEffect(() => {
    if (proyectos.length === 0) return;
    const ids = proyectos.map(p => p.id);
    cargarStatsProyectos(ids).then(stats => {
      ids.forEach(id => statsCache.set(id, stats[id] ?? { ...STATS_VACIO, proyecto_id: id }));
      setStatsMap(Object.fromEntries(statsCache));
    }).catch(err => console.error('[SelectorProyectos] indicadores:', err));
  }, [proyectos]);

  // Generar thumbnails PNG de los planos PDF para mostrarlos como portada
  // de la card. El servicio cachea por URL, así que si el componente se
  // remonta los thumbs ya generados se devuelven al instante.
  useEffect(() => {
    proyectos.forEach(async (p) => {
      if (!p.plano_url) return;
      const esPdf = p.plano_url.toLowerCase().includes('.pdf');
      if (!esPdf) return;
      // Skip si ya está en el mapa local (evita re-generar entre re-renders).
      if (thumbnails[p.id]) return;

      const thumb = await generarThumbnailPDF(p.plano_url);
      if (thumb) {
        setThumbnails(prev => ({ ...prev, [p.id]: thumb }));
      }
    });
    // `thumbnails` no va en deps a propósito — el chequeo `thumbnails[p.id]`
    // ya filtra duplicados; agregarlo dispararía el effect en bucle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proyectos]);

  const carpetaSeleccionada = carpetas.find(c => c.id === carpetaActual);
  const empresaDestino = carpetaSeleccionada?.tenant_id ?? empresaId ?? '';
  const empresasParaCarpeta = (contexto?.empresas ?? []).filter(e => e.activa !== false &&
    (contexto?.creador || e.permisos?.includes('carpeta.crear')) && (!empresaDestino || e.id === empresaDestino));
  const empresaParaCrear = empresaDestino || empresaNuevaCarpeta;
  const obrasDisponibles = useMemo(() => proyectos.filter(p => !p.proyecto_padre_id &&
    (!empresaDestino || p.tenant_id === empresaDestino) &&
    contexto?.obras.some(o => o.id === p.id && o.editar)), [proyectos, empresaDestino, contexto]);
  const carpetasFiltradas = useMemo(() => carpetas.filter(c =>
    (!empresaId || c.tenant_id === empresaId) &&
    (busqueda ? normalizarBusqueda(c.nombre).includes(normalizarBusqueda(busqueda)) : c.padre_id === carpetaActual)
  ), [carpetas, empresaId, busqueda, carpetaActual]);
  const rutaCarpeta = useMemo(() => {
    const ruta: Carpeta[] = []; let actual = carpetaSeleccionada;
    while (actual && ruta.length < 5) { ruta.unshift(actual); actual = carpetas.find(c => c.id === actual?.padre_id); }
    return ruta;
  }, [carpetaSeleccionada, carpetas]);
  const destinosCarpeta = useMemo(() => {
    if (!carpetaMover) return { prohibidos: new Set<string>(), altura: 0 };
    return restriccionesCarpeta(carpetas, carpetaMover.id);
  }, [carpetaMover, carpetas]);
  const elementoMover = proyectoMover ?? carpetaMover;
  const empresaMover = contexto?.empresas.find(e => e.id === elementoMover?.tenant_id)?.nombre ?? 'Empresa';
  const origenMover = proyectoMover ? proyectoMover.carpeta_id ?? null : carpetaMover?.padre_id ?? null;
  const rutaDestinoMover = rutaDeCarpeta(carpetas, destinoMover);
  const rutaOrigenMover = rutaDeCarpeta(carpetas, origenMover);
  const carpetasPermitidasMover = useMemo(() => carpetas.filter(c =>
    c.tenant_id === elementoMover?.tenant_id && !destinosCarpeta.prohibidos.has(c.id) &&
    c.profundidad + destinosCarpeta.altura <= 5
  ), [carpetas, elementoMover?.tenant_id, destinosCarpeta]);
  const carpetasListaMover = useMemo(() => {
    const busquedaTexto = normalizarBusqueda(busquedaCarpeta);
    return carpetasPermitidasMover.filter(c => busquedaTexto
      ? normalizarBusqueda(rutaDeCarpeta(carpetas, c.id).map(parte => parte.nombre).join(' / ')).includes(busquedaTexto)
      : c.padre_id === destinoMover
    ).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  }, [carpetasPermitidasMover, carpetas, busquedaCarpeta, destinoMover]);

  // Filtro por nombre o cliente (case-insensitive)
  const proyectosFiltrados = useMemo(() => {
    const q = normalizarBusqueda(busqueda);
    const visibles = proyectos.filter(p => !p.es_ficha_obra && (!empresaId || p.tenant_id === empresaId));
    if (!q) return visibles.filter(p => (p.carpeta_id ?? null) === carpetaActual);
    return visibles.filter(p =>
      normalizarBusqueda(p.nombre).includes(q) ||
      normalizarBusqueda(p.cliente ?? '').includes(q)
    );
  }, [proyectos, busqueda, empresaId, carpetaActual]);

  async function handleEliminar(proyecto: Proyecto) {
    try {
      await eliminarProyecto(proyecto.id);
      setConfirmDelete(null);
    } catch (e: unknown) {
      setAccionError(e instanceof Error ? e.message : 'Error al eliminar');
    }
  }

  async function handleDuplicar(proyecto: Proyecto) {
    setMenuAbierto(null);
    try {
      await duplicarProyecto(proyecto);
    } catch (e: unknown) {
      setAccionError(e instanceof Error ? e.message : 'Error al duplicar');
    }
  }

  async function handleCargarPlano(file: File) {
    if (!planoPendiente || subiendoPlano) return;
    setAccionError(null);
    setSubiendoPlano(true);
    try {
      const validacion = await validarCalidadPlano(file);
      if (!validacion.valido) throw new Error(validacion.error ?? 'Plano inválido.');
      const planoFile = esPDFFile(file) ? file : new File([await procesarPlanoCanvas(file)], 'plano_procesado.png', { type: 'image/png' });
      await cargarPlanoInicial(planoPendiente.id, planoFile);
      setPlanoPendiente(null);
    } catch (error) { setAccionError(error instanceof Error ? error.message : 'No se pudo cargar el plano.'); }
    finally { setSubiendoPlano(false); }
  }

  async function handleNuevoPlano() {
    if (!torreNuevoPlano || !nombreNuevoPlano.trim() || !archivoNuevoPlano || creandoPlano) return;
    setCreandoPlano(true); setAccionError(null);
    try {
      const validacion = await validarCalidadPlano(archivoNuevoPlano);
      if (!validacion.valido) throw new Error(validacion.error ?? 'Plano inválido.');
      const planoFile = esPDFFile(archivoNuevoPlano) ? archivoNuevoPlano :
        new File([await procesarPlanoCanvas(archivoNuevoPlano)], 'plano_procesado.png', { type: 'image/png' });
      const resultado = await crearPlanoEnObra(torreNuevoPlano.id, nombreNuevoPlano, carpetaNuevoPlano, planoFile);
      setTorreNuevoPlano(null); setNombreNuevoPlano(''); setArchivoNuevoPlano(null);
      if (resultado.errorCarga) setAccionError(`El proyecto quedó creado, pero el plano no terminó de subir: ${resultado.errorCarga}. Abrí su tarjeta para reintentar.`);
    } catch (error) { setAccionError(error instanceof Error ? error.message : 'No se pudo crear el plano.'); }
    finally { setCreandoPlano(false); }
  }

  async function handleCrearCarpeta() {
    if (!empresaParaCrear || !empresasParaCarpeta.some(e => e.id === empresaParaCrear) || !nombreCarpeta.trim() || creandoCarpeta) return;
    setCreandoCarpeta(true); setAccionError(null);
    try {
      const ticket = sessionTicket();
      const { data, error } = await supabase.rpc('plan_crear_carpeta', {
        p_tenant: empresaParaCrear, p_padre: carpetaActual, p_nombre: nombreCarpeta.trim(),
      }).single();
      assertSession(ticket);
      if (error || !data) throw new Error(error?.message ?? 'No se pudo crear la carpeta.');
      setCarpetas(prev => [...prev, data as Carpeta]);
      setNombreCarpeta(''); setModalCarpeta(false);
    } catch (error) { setAccionError(error instanceof Error ? error.message : 'No se pudo crear la carpeta.'); }
    finally { setCreandoCarpeta(false); }
  }

  function puedeAdministrarCarpeta(carpeta: Carpeta): boolean {
    return Boolean(contexto?.creador || (carpeta.created_by === identityId() &&
      contexto?.empresas.some(empresa => empresa.id === carpeta.tenant_id)));
  }

  function abrirMenuCarpeta(carpeta: Carpeta, anchor: HTMLElement) {
    if (menuCarpeta === carpeta.id) { setMenuCarpeta(null); return; }
    setMenuAbierto(null); setMenuAnchor(anchor);
    setMenuCarpeta(carpeta.id);
    setCarpetaEliminable(prev => ({ ...prev, [carpeta.id]: false }));
    if (!puedeAdministrarCarpeta(carpeta)) return;
    const ticket = sessionTicket();
    void supabase.rpc('plan_puede_eliminar_carpeta', { p_carpeta: carpeta.id }).then(({ data, error }) => {
      try { assertSession(ticket); } catch { return; }
      if (error) setAccionError(`No se pudo verificar la carpeta: ${error.message}`);
      else setCarpetaEliminable(prev => ({ ...prev, [carpeta.id]: data === true }));
    });
  }

  async function handleRenombrarCarpeta() {
    if (!carpetaRenombrar || !nombreEditarCarpeta.trim() || guardandoCarpeta) return;
    setGuardandoCarpeta(true); setAccionError(null);
    try {
      const ticket = sessionTicket();
      const { data, error } = await supabase.rpc('plan_renombrar_carpeta', {
        p_carpeta: carpetaRenombrar.id, p_nombre: nombreEditarCarpeta.trim(),
      }).single();
      assertSession(ticket);
      if (error || !data) throw new Error(error?.message ?? 'No se pudo renombrar la carpeta.');
      setCarpetas(prev => prev.map(c => c.id === carpetaRenombrar.id ? data as Carpeta : c));
      setAvisoAccion(`Carpeta renombrada a «${(data as Carpeta).nombre}».`);
      setCarpetaRenombrar(null);
    } catch (error) { setAccionError(error instanceof Error ? error.message : 'No se pudo renombrar la carpeta.'); }
    finally { setGuardandoCarpeta(false); }
  }

  async function handleEliminarCarpeta() {
    if (!carpetaEliminar || guardandoCarpeta) return;
    setGuardandoCarpeta(true); setAccionError(null);
    try {
      const ticket = sessionTicket();
      const { error } = await supabase.rpc('plan_eliminar_carpeta', { p_carpeta: carpetaEliminar.id });
      assertSession(ticket);
      if (error) throw new Error(error.message);
      setCarpetas(prev => prev.filter(c => c.id !== carpetaEliminar.id));
      setHistorialCarpetas(prev => ({
        ...prev,
        rutas: prev.rutas.map(id => id === carpetaEliminar.id ? carpetaEliminar.padre_id : id),
      }));
      setCarpetaEliminable(prev => ({ ...prev, [carpetaEliminar.id]: false }));
      setAvisoAccion(`Carpeta «${carpetaEliminar.nombre}» eliminada.`);
      setCarpetaEliminar(null);
    } catch (error) {
      setCarpetaEliminable(prev => ({ ...prev, [carpetaEliminar.id]: false }));
      setAccionError(error instanceof Error ? error.message : 'No se pudo eliminar la carpeta.');
    } finally { setGuardandoCarpeta(false); }
  }

  function abrirMoverProyecto(proyecto: Proyecto) {
    setMenuAbierto(null); setCarpetaMover(null); setProyectoMover(proyecto);
    setDestinoMover(proyecto.carpeta_id ?? null); setBusquedaCarpeta('');
    setAccionError(null); setAvisoAccion(null);
  }

  function abrirMoverCarpeta(carpeta: Carpeta) {
    setMenuCarpeta(null); setProyectoMover(null); setCarpetaMover(carpeta);
    setDestinoMover(carpeta.padre_id); setBusquedaCarpeta('');
    setAccionError(null); setAvisoAccion(null);
  }

  function cerrarMover() {
    if (moviendo) return;
    setProyectoMover(null); setCarpetaMover(null); setBusquedaCarpeta('');
    setAccionError(null);
  }

  function abrirDestino(id: string | null) {
    setDestinoMover(id); setBusquedaCarpeta(''); setAccionError(null);
  }

  function puedeMoverProyecto(proyecto: Proyecto): boolean {
    const permiso = contexto?.obras.find(p => p.id === proyecto.id);
    return Boolean(proyecto.tenant_id && permiso?.editar && (proyecto.proyecto_padre_id || permiso.administrar));
  }

  function comenzarArrastre(event: PointerEvent<HTMLElement>, elemento: ElementoMovimiento, permitido: boolean) {
    arrastre.comenzar(event, elemento, {
      permitido: permitido && !movimientoRef.current,
      contenedor: scrollAreaRef.current,
      validar: destino => errorDestinoMovimiento(elemento, destino, carpetas),
      iniciar: cerrarMenus,
      mover: ejecutarMovimiento,
      rechazar: setAccionError,
    });
  }

  async function ejecutarMovimiento(elemento: ElementoMovimiento, destino: string | null): Promise<boolean> {
    if (movimientoRef.current) return false;
    const proyecto = elemento.tipo === 'proyecto' ? proyectos.find(p => p.id === elemento.id) : null;
    const carpeta = elemento.tipo === 'carpeta' ? carpetas.find(c => c.id === elemento.id) : null;
    if (!(proyecto ? puedeMoverProyecto(proyecto) : carpeta && puedeAdministrarCarpeta(carpeta))) {
      setAccionError('No tenés permiso para mover este elemento.'); return false;
    }
    const errorDestino = errorDestinoMovimiento(elemento, destino, carpetas);
    if (errorDestino) { setAccionError(errorDestino); return false; }
    const scroll = scrollAreaRef.current;
    if (scroll) {
      // Al quitar la última fila, no dejar que el navegador recorte el scroll.
      // Esta reserva deja de aplicarse al navegar, filtrar o cambiar de vista.
      setEspacioMovimiento(prev => ({ vista: vistaMovimiento,
        altura: Math.max(prev.vista === vistaMovimiento ? prev.altura : 0, scroll.scrollTop + scroll.clientHeight) }));
    }
    movimientoRef.current = true;
    setElementoMoviendo(elemento.id); setAccionError(null); setAvisoAccion(null);
    try {
      let requiereRecarga = false;
      if (elemento.tipo === 'proyecto') {
        await moverProyecto(elemento.id, destino);
      } else {
        const ticket = sessionTicket();
        const { error: movimientoError } = await supabase.rpc('plan_mover_carpeta', {
          p_carpeta: elemento.id, p_padre: destino,
        });
        assertSession(ticket);
        if (movimientoError) throw new Error(movimientoError.message);
        const { data, error: cargaError } = await supabase.from('plan_carpetas')
          .select('id,tenant_id,padre_id,nombre,profundidad,created_by').order('nombre');
        assertSession(ticket);
        if (cargaError) requiereRecarga = true;
        else setCarpetas(data as Carpeta[]);
      }
      setAvisoAccion(requiereRecarga
        ? `«${elemento.nombre}» se movió. Recargá la página para ver su nueva ubicación.`
        : null);
      return true;
    } catch (error) {
      setAccionError(error instanceof Error ? error.message : 'No se pudo mover el elemento.');
      return false;
    } finally { movimientoRef.current = false; setElementoMoviendo(null); }
  }

  async function confirmarMovimiento() {
    if (!elementoMover || moviendo || destinoMover === origenMover) return;
    const elemento: ElementoMovimiento = { tipo: proyectoMover ? 'proyecto' : 'carpeta',
      id: elementoMover.id, tenant_id: elementoMover.tenant_id ?? '', nombre: elementoMover.nombre, origen: origenMover };
    if (await ejecutarMovimiento(elemento, destinoMover)) {
      setProyectoMover(null); setCarpetaMover(null); setBusquedaCarpeta('');
    }
  }

  return (
    <div className={`${styles.page} ${arrastrando ? styles.arrastreActivo : ''}`} aria-busy={moviendo}
      onClickCapture={arrastre.evitarClickTrasArrastre} onDragStart={e => e.preventDefault()}>

      {/* ── Área scrollable — full width para que el scrollbar quede al
              borde derecho del viewport, no centrado por el max-width del
              .content. */}
      <div className={styles.scrollArea} ref={scrollAreaRef}>
      <div className={styles.content} style={{ minHeight: espacioMovimiento.vista === vistaMovimiento ? espacioMovimiento.altura : undefined }}>

        {/* Header con título, búsqueda y botón */}
        <div className={styles.header}>
          <h1 className={styles.title}>Mis proyectos</h1>
          <label className={styles.companyField}>
            <span className={styles.companyLabel}>Empresa activa</span>
            <span className={styles.companySelectWrap}>
              <svg className={styles.companyIcon} viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20V7h6V4h4v3h6v13h-6v-4h-4v4H4Zm3-9h2V9H7v2Zm0 4h2v-2H7v2Zm8-4h2V9h-2v2Zm0 4h2v-2h-2v2Z" /></svg>
              <select className={styles.companySelect} aria-label="Empresa" value={empresaId} onChange={e=>{setProyectoActivo(null);setHistorialCarpetas({ rutas: [null], indice: 0 });useAccessStore.setState({empresaId:e.target.value});}}>
                <option value="">Todas las obras autorizadas</option>
                {contexto?.empresas.map(e=><option key={e.id} value={e.id}>{e.nombre}</option>)}
              </select>
              <svg className={styles.companyChevron} viewBox="0 0 20 20" aria-hidden="true"><path d="m6 8 4 4 4-4" /></svg>
            </span>
          </label>
          <div className={styles.searchWrap}>
            <input
              className={styles.searchInput}
              placeholder="Buscar proyectos..."
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
            />
            <svg className={styles.searchIcon} viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4 4" /></svg>
          </div>
          <div className={styles.headerActions}>
            <button disabled={!empresasParaCarpeta.length || (carpetaSeleccionada?.profundidad ?? 0) >= 5} className={styles.secondaryBtn} onClick={() => {
              setAccionError(null); setNombreCarpeta('');
              setEmpresaNuevaCarpeta(empresaDestino || (empresasParaCarpeta.length === 1 ? empresasParaCarpeta[0].id : ''));
              setModalCarpeta(true);
            }}>
              + Crear carpeta
            </button>
            <button disabled={obrasDisponibles.length === 0} className={styles.newBtn} onClick={() => {
              setAccionError(null); setArchivoNuevoPlano(null); setCarpetaNuevoPlano(carpetaActual);
              setTorreNuevoPlano(obrasDisponibles[0]);
            }}>
              <span className={styles.newBtnIcon}>+</span> Crear proyecto
            </button>
          </div>
        </div>
        <div className={styles.navigationRow}>
          <nav className={styles.breadcrumbs} aria-label="Ruta de carpetas">
            <button type="button" className={styles.historyButton} aria-label="Atrás" title="Atrás" disabled={historialCarpetas.indice === 0}
              onClick={() => setHistorialCarpetas(prev => ({ ...prev, indice: prev.indice - 1 }))}>
              <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m12.5 4.5-5.5 5.5 5.5 5.5" /></svg>
            </button>
            <button type="button" className={styles.historyButton} aria-label="Adelante" title="Adelante" disabled={historialCarpetas.indice >= historialCarpetas.rutas.length - 1}
              onClick={() => setHistorialCarpetas(prev => ({ ...prev, indice: prev.indice + 1 }))}>
              <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m7.5 4.5 5.5 5.5-5.5 5.5" /></svg>
            </button>
            <button type="button" className={destinoArrastre === 'raiz' ? styles.dropTarget : undefined}
              data-destino-movimiento="raiz" onClick={() => navegarCarpeta(null)}>Proyectos</button>
            {rutaCarpeta.map(c => <span key={c.id}> / <button type="button" className={destinoArrastre === c.id ? styles.dropTarget : undefined}
              data-destino-movimiento={c.id} onClick={() => navegarCarpeta(c.id)}>{c.nombre}</button></span>)}
            {busqueda && <span className={styles.searchHint}>Buscando en todas las carpetas</span>}
          </nav>
          <div className={styles.viewToggle} role="group" aria-label="Presentación de proyectos">
            <button type="button" className={`${styles.viewButton} ${vistaProyectos === 'tarjetas' ? styles.viewButtonActive : ''}`}
              aria-pressed={vistaProyectos === 'tarjetas'} onClick={() => setVistaProyectos('tarjetas')}>
              <svg viewBox="0 0 20 20" aria-hidden="true"><rect x="2" y="2" width="6" height="6" rx="1" /><rect x="12" y="2" width="6" height="6" rx="1" /><rect x="2" y="12" width="6" height="6" rx="1" /><rect x="12" y="12" width="6" height="6" rx="1" /></svg>
              Tarjetas
            </button>
            <button type="button" className={`${styles.viewButton} ${vistaProyectos === 'lista' ? styles.viewButtonActive : ''}`}
              aria-pressed={vistaProyectos === 'lista'} onClick={() => setVistaProyectos('lista')}>
              <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M6 4h12M6 10h12M6 16h12" /><circle cx="2.5" cy="4" r=".8" /><circle cx="2.5" cy="10" r=".8" /><circle cx="2.5" cy="16" r=".8" /></svg>
              Lista
            </button>
          </div>
        </div>

        {arrastrando && <div className={styles.dragHint} role="status">{arrastre.activo?.error ?? (destinoArrastre !== undefined ? `Soltá para mover «${arrastrando.nombre}».` : `Arrastrá «${arrastrando.nombre}» a una carpeta o a la ruta superior. Esc para cancelar.`)}</div>}

        {carpetasFiltradas.length > 0 && <div className={`${styles.folderGrid} ${vistaProyectos === 'lista' ? styles.folderGridList : ''}`}>
          {carpetasFiltradas.map(c => <div key={c.id} data-carpeta-id={c.id}
            data-destino-movimiento={c.id} data-movible={puedeAdministrarCarpeta(c) && !moviendo}
            onPointerDown={e => comenzarArrastre(e, { tipo: 'carpeta', id: c.id, tenant_id: c.tenant_id, nombre: c.nombre, origen: c.padre_id }, puedeAdministrarCarpeta(c))}
            className={`${styles.folderCard} ${destinoArrastre === c.id ? styles.dropTarget : ''} ${arrastrando?.id === c.id || elementoMoviendo === c.id ? styles.dragging : ''}`}>
            <button type="button" className={styles.folderOpen} onClick={() => { setBusqueda(''); navegarCarpeta(c.id); }}>
              <svg className={styles.folderIcon} viewBox="0 0 96 80" aria-hidden="true">
                <path d="M8 15a7 7 0 0 1 7-7h22l9 9h35a7 7 0 0 1 7 7v43a7 7 0 0 1-7 7H15a7 7 0 0 1-7-7Z" fill="#5D79B0" />
                <path d="M8 32a7 7 0 0 1 7-7h66a7 7 0 0 1 7 7v35a7 7 0 0 1-7 7H15a7 7 0 0 1-7-7Z" fill="#91A9D3" />
              </svg>
              <span className={styles.folderName}>{c.nombre}</span>
            </button>
            <button type="button" data-no-drag className={styles.folderMenu} aria-label={`Opciones de ${c.nombre}`} aria-haspopup="menu" aria-expanded={menuCarpeta === c.id}
              aria-controls={menuCarpeta === c.id ? `acciones-carpeta-${c.id}` : undefined}
              onClick={e => abrirMenuCarpeta(c, e.currentTarget)}>···</button>
            {menuCarpeta === c.id && menuAnchor && <MenuAccionesProyecto anchor={menuAnchor} onClose={cerrarMenus} id={`acciones-carpeta-${c.id}`} label={`Acciones de ${c.nombre}`}>
              <button type="button" role="menuitem" disabled={!puedeAdministrarCarpeta(c)} onClick={() => { setMenuCarpeta(null); setAccionError(null); setNombreEditarCarpeta(c.nombre); setCarpetaRenombrar(c); }}>Renombrar</button>
              <button type="button" role="menuitem" disabled={!puedeAdministrarCarpeta(c) || moviendo} onClick={() => abrirMoverCarpeta(c)}>Mover</button>
              <button type="button" role="menuitem" data-danger disabled={!carpetaEliminable[c.id]} title={!puedeAdministrarCarpeta(c) ? 'No tenés permiso para eliminar esta carpeta.' : !carpetaEliminable[c.id] ? 'Solo se puede eliminar una carpeta vacía.' : undefined}
                onClick={() => { setMenuCarpeta(null); setAccionError(null); setCarpetaEliminar(c); }}>Eliminar carpeta</button>
            </MenuAccionesProyecto>}
          </div>)}
        </div>}

        {/* Ambas presentaciones conservan la misma navegación y las mismas acciones. */}
        <div className={`${styles.grid} ${vistaProyectos === 'lista' ? styles.gridList : ''}`}>
          {loading && proyectosFiltrados.length === 0 && carpetasFiltradas.length === 0 ? (
            <div className={styles.empty}>Cargando proyectos…</div>
          ) : proyectosFiltrados.length === 0 && carpetasFiltradas.length === 0 ? (
            <div className={styles.empty}>
              {busqueda
                ? `No hay proyectos que coincidan con "${busqueda}".`
                : 'Esta carpeta todavía no tiene proyectos ni subcarpetas.'}
            </div>
          ) : proyectosFiltrados.map(proyecto => {
            const hijos = proyecto.proyecto_padre_id ? [] : proyectos.filter(p => p.proyecto_padre_id === proyecto.id);
            const fuentes = [proyecto, ...hijos].map(p => statsMap[p.id] ?? STATS_VACIO);
            const stats = fuentes.reduce((acc, item) => ({
              ...acc,
              pendiente: acc.pendiente + item.pendiente,
              en_proceso: acc.en_proceso + item.en_proceso,
              cerrada: acc.cerrada + item.cerrada,
              no_aplica: acc.no_aplica + item.no_aplica,
              total: acc.total + item.total,
            }), { ...STATS_VACIO });
            stats.pct_cerrada = stats.total ? Math.round(stats.cerrada / stats.total * 100) : 0;
            const thumbUrl = thumbnails[proyecto.id] ?? obtenerThumbnailPDFCache(proyecto.plano_url);
            const planoUrl = proyecto.plano_url ?? '';
            const esPdf    = planoUrl.toLowerCase().includes('.pdf');
            const esImg    = !esPdf && (
              planoUrl.toLowerCase().includes('.jpg')  ||
              planoUrl.toLowerCase().includes('.jpeg') ||
              planoUrl.toLowerCase().includes('.png')  ||
              planoUrl.toLowerCase().includes('.webp') || planoUrl.toLowerCase().includes('.svg')
            );

            return (
              <div
                key={proyecto.id}
                data-proyecto-id={proyecto.id}
                className={`${styles.card} ${arrastrando?.id === proyecto.id || elementoMoviendo === proyecto.id ? styles.dragging : ''}`}
                data-movible={puedeMoverProyecto(proyecto) && !moviendo}
                onPointerDown={e => comenzarArrastre(e, { tipo: 'proyecto', id: proyecto.id, tenant_id: proyecto.tenant_id ?? '', nombre: proyecto.nombre, origen: proyecto.carpeta_id ?? null }, puedeMoverProyecto(proyecto))}
                onClick={() => {
                  if (menuAbierto === proyecto.id) { setMenuAbierto(null); return; }
                  if (proyecto.plano_url === PLANO_PENDIENTE) {
                    if (contexto?.obras.find(p => p.id === proyecto.id)?.editar &&
                      (proyecto.proyecto_padre_id || contexto?.obras.find(p => p.id === proyecto.id)?.administrar)) setPlanoPendiente(proyecto);
                    else setAccionError('Esta obra todavía no tiene plano. Pedí al supervisor que lo cargue.');
                  } else abrirProyecto(proyecto);
                }}
              >
                {/* Portada — thumb generado (PDF), imagen directa, o placeholder */}
                <div className={styles.cardImage}>
                  {thumbUrl || esImg ? (
                    <ImagenPrivada
                      referencia={thumbUrl ?? planoUrl}
                      alt={proyecto.nombre}
                      loading="lazy"
                      draggable={false}
                      style={{
                        maxWidth: '90%',
                        maxHeight: '90%',
                        objectFit: 'contain',
                        opacity: 0.95,
                        filter: 'drop-shadow(0 2px 12px rgba(0,0,0,0.5))',
                      }}
                    />
                  ) : esPdf && !thumbUrl ? (
                    // PDF cargando thumbnail
                    <div className={styles.pdfPlaceholder}>
                      <span className={styles.pdfIcon}>⏳</span>
                      <span className={styles.pdfLabel}>Generando vista previa...</span>
                    </div>
                  ) : (
                    // Sin plano
                    <div className={styles.pdfPlaceholder}>
                      <span className={styles.pdfIcon}>🏗️</span>
                      <span className={styles.pdfLabel}>Sin plano cargado</span>
                    </div>
                  )}

                  {/* Badge "16:9" sólo cuando todavía no hay imagen ni thumb */}
                  {!(thumbUrl || esImg) && (
                    <span className={styles.cardBadge}>16:9</span>
                  )}

                </div>

                {/* El menú permanece accesible junto a la portada en ambas vistas. */}
                <div className={styles.cardMenuWrap} data-no-drag onClick={e => e.stopPropagation()}>
                  <button
                    type="button"
                    disabled={!contexto?.obras.find(p=>p.id===proyecto.id)?.editar}
                    className={styles.cardMenu}
                    onClick={e => { setMenuCarpeta(null); setMenuAnchor(e.currentTarget); setMenuAbierto(prev => prev === proyecto.id ? null : proyecto.id); }}
                    title="Opciones"
                    aria-label={`Opciones de ${proyecto.nombre}`}
                    aria-expanded={menuAbierto === proyecto.id}
                    aria-haspopup="menu"
                    aria-controls={`acciones-proyecto-${proyecto.id}`}
                  >
                    ···
                  </button>
                </div>

                {menuAbierto === proyecto.id && menuAnchor && <MenuAccionesProyecto anchor={menuAnchor} onClose={cerrarMenus} id={`acciones-proyecto-${proyecto.id}`} label={`Acciones de ${proyecto.nombre}`}>
                  {!proyecto.proyecto_padre_id && <button type="button" role="menuitem" onClick={() => { setMenuAbierto(null); setCarpetaNuevoPlano(proyecto.carpeta_id ?? null); setArchivoNuevoPlano(null); setTorreNuevoPlano(proyecto); }}>
                    + Nuevo plano en esta obra
                  </button>}
                  {proyecto.plano_url === PLANO_PENDIENTE && (proyecto.proyecto_padre_id || contexto?.obras.find(p => p.id === proyecto.id)?.administrar) && <button type="button" role="menuitem" onClick={() => { setMenuAbierto(null); setPlanoPendiente(proyecto); }}>
                    ↑ Cargar plano inicial
                  </button>}
                  <button type="button" role="menuitem" disabled={!puedeMoverProyecto(proyecto) || moviendo} onClick={() => abrirMoverProyecto(proyecto)}>
                    ▣ Mover
                  </button>
                  <button type="button" role="menuitem" disabled={proyecto.plano_url === PLANO_PENDIENTE || !contexto?.obras.find(p => p.id === proyecto.id)?.administrar} onClick={() => handleDuplicar(proyecto)}>
                    ⧉ Duplicar proyecto
                  </button>
                  <button type="button" role="menuitem" data-danger disabled={!contexto?.obras.find(p => p.id === proyecto.id)?.administrar} onClick={() => { setMenuAbierto(null); setConfirmDelete(proyecto); }}>
                    🗑 Eliminar proyecto
                  </button>
                </MenuAccionesProyecto>}

                {/* Cuerpo */}
                <div className={styles.cardBody}>
                  <div className={styles.cardIdentity}>
                    {proyecto.proyecto_padre_id && <div className={styles.cardParentLabel} style={{ color: 'var(--text-secondary)', fontSize: 12, marginBottom: 4 }}>
                      Plano de {proyectos.find(p => p.id === proyecto.proyecto_padre_id)?.nombre ?? 'obra asignada'}
                    </div>}
                    <div className={styles.cardName} title={proyecto.nombre}>{proyecto.nombre}</div>
                    <div className={styles.cardClient} title={proyecto.cliente ?? 'Sin cliente'}>
                      {proyecto.cliente ?? 'Sin cliente'}
                    </div>
                    {proyecto.plano_url === PLANO_PENDIENTE && <p className={styles.cardPendingNote} style={{ margin: '8px 0', color: 'var(--text-secondary)', fontSize: 13 }}>Plano pendiente · {contexto?.obras.find(p => p.id === proyecto.id)?.editar ? 'tocá para cargarlo' : 'esperando al responsable'}</p>}
                  </div>
                  <div className={styles.cardDivider} />

                  {/* Stats por estado — vienen de statsService (Supabase) */}
                  <div className={styles.cardStats}>
                    <div className={styles.statRow} title={`Pendientes: ${stats.pendiente}`}>
                      <span className={styles.statDot} style={{ background: COLOR_PENDIENTE }} />
                      <span className={styles.statLabelFull}>Pendientes:</span><span className={styles.statLabelCompact}>Pend.</span>
                      <span className={styles.statValue}>{stats.pendiente}</span>
                    </div>
                    <div className={styles.statRow} title={`En proceso: ${stats.en_proceso}`}>
                      <span className={styles.statDot} style={{ background: COLOR_EN_PROCESO }} />
                      <span className={styles.statLabelFull}>En proceso:</span><span className={styles.statLabelCompact}>Proc.</span>
                      <span className={styles.statValue}>{stats.en_proceso}</span>
                    </div>
                    <div className={styles.statRow} title={`Cerradas: ${stats.cerrada}`}>
                      <span className={styles.statDot} style={{ background: COLOR_CERRADA }} />
                      <span className={styles.statLabelFull}>Cerradas:</span><span className={styles.statLabelCompact}>Cerr.</span>
                      <span className={styles.statValue}>{stats.cerrada}</span>
                    </div>
                    {stats.no_aplica > 0 && (
                      <div className={`${styles.statRow} ${styles.statNoAplica}`}>
                        <span className={styles.statDot} style={{ background: COLOR_NO_APLICA }} />
                        No aplica: {stats.no_aplica}
                      </div>
                    )}
                  </div>

                  {/* Progreso — barra + label dinámico ("Sin órdenes" si total=0) */}
                  <div className={styles.progressWrap}>
                    <div className={styles.progressBar}>
                      <div
                        className={styles.progressFill}
                        style={{ width: `${stats.pct_cerrada}%` }}
                      />
                    </div>
                    <span className={styles.progressLabel}>
                      {stats.total > 0
                        ? `Progreso: ${stats.pct_cerrada}% Cerrada`
                        : 'Sin órdenes registradas'}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      </div>
      {/* /scrollArea */}

      {!arrastrando && (error || accionError || avisoAccion || moviendo) &&
        <div className={`${styles.actionNotice} ${(error || accionError) ? styles.actionFailure : ''}`}
          role={(error || accionError) ? 'alert' : 'status'}>
          <span>{accionError || error || (moviendo ? 'Guardando ubicación…' : avisoAccion)}</span>
          {!moviendo && <button type="button" aria-label="Cerrar aviso" onClick={() => {
            setAccionError(null); setAvisoAccion(null);
            if (error) useProyectosStore.setState({ error: null });
          }}>×</button>}
        </div>}

      {modalCarpeta && <div style={{ ...modalOverlayStyle, padding: 16 }} onClick={() => !creandoCarpeta && setModalCarpeta(false)}>
        <div className={styles.newPlanDialog} role="dialog" aria-modal="true" aria-labelledby="nueva-carpeta-titulo" onClick={e => e.stopPropagation()}>
          <h3 id="nueva-carpeta-titulo" className={styles.newPlanTitle}>Crear carpeta</h3>
          <p className={styles.newPlanDescription}>Dentro de {carpetaSeleccionada?.nombre ?? 'Proyectos'} · nivel {(carpetaSeleccionada?.profundidad ?? 0) + 1} de 5</p>
          {!empresaDestino && <label className={styles.newPlanField}>Empresa de la carpeta
            <select className={styles.newPlanInput} value={empresaNuevaCarpeta} onChange={e => setEmpresaNuevaCarpeta(e.target.value)} disabled={creandoCarpeta || empresasParaCarpeta.length === 1}>
              <option value="">Seleccioná una empresa</option>
              {empresasParaCarpeta.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
            </select>
          </label>}
          <label className={styles.newPlanField}>Nombre de la carpeta
            <input className={styles.newPlanInput} autoFocus maxLength={180} value={nombreCarpeta} onChange={e => setNombreCarpeta(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') void handleCrearCarpeta(); }} placeholder="Ej.: Distrito Perseverancia" />
          </label>
          {accionError && <p role="alert" style={{ color: '#b91c1c' }}>{accionError}</p>}
          <div className={styles.newPlanActions}>
            <button type="button" disabled={creandoCarpeta} onClick={() => setModalCarpeta(false)}>Cancelar</button>
            <button type="button" disabled={creandoCarpeta || !nombreCarpeta.trim() || !empresasParaCarpeta.some(e => e.id === empresaParaCrear)} onClick={() => void handleCrearCarpeta()}>{creandoCarpeta ? 'Creando…' : 'Crear carpeta'}</button>
          </div>
        </div>
      </div>}

      {carpetaRenombrar && <div style={{ ...modalOverlayStyle, padding: 16 }} onClick={() => !guardandoCarpeta && setCarpetaRenombrar(null)}>
        <div className={styles.newPlanDialog} role="dialog" aria-modal="true" aria-labelledby="renombrar-carpeta-titulo" onClick={e => e.stopPropagation()}>
          <h3 id="renombrar-carpeta-titulo" className={styles.newPlanTitle}>Renombrar carpeta</h3>
          <label className={styles.newPlanField}>Nombre de la carpeta
            <input className={styles.newPlanInput} autoFocus maxLength={180} value={nombreEditarCarpeta} onChange={e => setNombreEditarCarpeta(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') void handleRenombrarCarpeta(); }} />
          </label>
          {accionError && <p role="alert" className={styles.moveError}>{accionError}</p>}
          <div className={styles.newPlanActions}>
            <button type="button" disabled={guardandoCarpeta} onClick={() => setCarpetaRenombrar(null)}>Cancelar</button>
            <button type="button" disabled={guardandoCarpeta || !nombreEditarCarpeta.trim() || nombreEditarCarpeta.trim() === carpetaRenombrar.nombre}
              onClick={() => void handleRenombrarCarpeta()}>{guardandoCarpeta ? 'Guardando…' : 'Guardar nombre'}</button>
          </div>
        </div>
      </div>}

      {carpetaEliminar && <div style={{ ...modalOverlayStyle, padding: 16 }} onClick={() => !guardandoCarpeta && setCarpetaEliminar(null)}>
        <div className={styles.newPlanDialog} role="alertdialog" aria-modal="true" aria-labelledby="eliminar-carpeta-titulo" onClick={e => e.stopPropagation()}>
          <h3 id="eliminar-carpeta-titulo" className={styles.newPlanTitle}>Eliminar carpeta vacía</h3>
          <p className={styles.newPlanDescription}>¿Eliminar «{carpetaEliminar.nombre}»? Esta acción no se puede deshacer.</p>
          {accionError && <p role="alert" className={styles.moveError}>{accionError}</p>}
          <div className={styles.newPlanActions}>
            <button type="button" disabled={guardandoCarpeta} onClick={() => setCarpetaEliminar(null)}>Cancelar</button>
            <button type="button" className={styles.folderDeleteConfirm} disabled={guardandoCarpeta || !carpetaEliminable[carpetaEliminar.id]}
              onClick={() => void handleEliminarCarpeta()}>{guardandoCarpeta ? 'Eliminando…' : 'Eliminar carpeta'}</button>
          </div>
        </div>
      </div>}

      {torreNuevoPlano && <div style={{ ...modalOverlayStyle, padding: 16 }} onClick={() => !creandoPlano && setTorreNuevoPlano(null)}>
        <div className={styles.newPlanDialog} role="dialog" aria-modal="true" aria-labelledby="nuevo-plano-titulo" onClick={e => e.stopPropagation()}>
          <h3 id="nuevo-plano-titulo" className={styles.newPlanTitle}>Crear proyecto</h3>
          <p className={styles.newPlanDescription}>Cada proyecto es un plano. Quedará en {carpetas.find(c => c.id === carpetaNuevoPlano)?.nombre ?? 'Proyectos'} y solo lo verá el equipo de la obra elegida.</p>
          <label className={styles.newPlanField}>Obra asignada
            <select className={styles.newPlanInput} value={torreNuevoPlano.id} onChange={e => setTorreNuevoPlano(obrasDisponibles.find(p => p.id === e.target.value) ?? null)}>
              {obrasDisponibles.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
          </label>
          <label className={styles.newPlanField}>Nombre del proyecto
            <input className={styles.newPlanInput} autoFocus value={nombreNuevoPlano} maxLength={180} onChange={e => setNombreNuevoPlano(e.target.value)} placeholder="Ej.: Piso 3 · instalaciones" />
          </label>
          <label className={styles.newPlanField}>Archivo del plano
            <input className={styles.newPlanInput} type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" onChange={e => setArchivoNuevoPlano(e.target.files?.[0] ?? null)} />
          </label>
          {accionError && <p role="alert" style={{ color: '#b91c1c' }}>{accionError}</p>}
          <div className={styles.newPlanActions}>
            <button type="button" disabled={creandoPlano} onClick={() => setTorreNuevoPlano(null)}>Cancelar</button>
            <button type="button" disabled={creandoPlano || !nombreNuevoPlano.trim() || !archivoNuevoPlano} onClick={() => void handleNuevoPlano()}>
              {creandoPlano ? 'Creando…' : 'Crear proyecto'}
            </button>
          </div>
        </div>
      </div>}

      {elementoMover && <div style={{ ...modalOverlayStyle, padding: 16 }} onClick={cerrarMover}>
        <div className={`${styles.newPlanDialog} ${styles.moveDialog}`} role="dialog" aria-modal="true" aria-labelledby="mover-titulo" onClick={e => e.stopPropagation()}>
          <div className={styles.moveHeader}>
            <h3 id="mover-titulo" className={styles.newPlanTitle}>Mover «{elementoMover.nombre}»</h3>
            <button type="button" className={styles.moveClose} aria-label="Cerrar" disabled={moviendo} onClick={cerrarMover}>×</button>
          </div>
          <p className={styles.newPlanDescription}>Abrí la carpeta donde querés guardarlo. Los permisos de la obra no cambian.</p>
          <div className={styles.moveOrigin}>
            <span className={styles.moveEyebrow}>Ubicación actual</span>
            <span>{[empresaMover, ...rutaOrigenMover.map(c => c.nombre)].join(' / ')}</span>
          </div>
          <input className={styles.newPlanInput} autoFocus value={busquedaCarpeta}
            onChange={e => setBusquedaCarpeta(e.target.value)} placeholder="Buscar carpeta por nombre o ruta…" aria-label="Buscar carpeta" />
          <span className={styles.moveEyebrow}>Destino</span>
          <nav className={styles.moveBreadcrumbs} aria-label="Ruta de destino">
            <button type="button" className={styles.moveBack} aria-label="Subir una carpeta" disabled={destinoMover === null}
              onClick={() => abrirDestino(rutaDestinoMover.at(-1)?.padre_id ?? null)}>‹</button>
            <button type="button" onClick={() => abrirDestino(null)}>{empresaMover}</button>
            {rutaDestinoMover.map(c => <span key={c.id}><button type="button" onClick={() => abrirDestino(c.id)}>{c.nombre}</button></span>)}
          </nav>
          <div className={styles.moveFolderList} aria-label={busquedaCarpeta ? 'Resultados de búsqueda' : 'Subcarpetas disponibles'}>
            {carpetasListaMover.length === 0
              ? <p className={styles.moveEmpty}>{busquedaCarpeta
                  ? 'No hay carpetas que coincidan con la búsqueda.'
                  : destinoMover === origenMover
                    ? 'Esta es la ubicación actual. Elegí otra carpeta para moverlo.'
                    : 'No hay subcarpetas aquí. Podés mover a esta ubicación.'}</p>
              : carpetasListaMover.map(c => <button type="button" key={c.id} className={styles.moveFolderRow} onClick={() => abrirDestino(c.id)}>
                  <svg viewBox="0 0 36 32" aria-hidden="true"><path d="M2 7a4 4 0 0 1 4-4h9l4 4h11a4 4 0 0 1 4 4v16a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4Z" fill="#5D79B0"/><path d="M2 13a4 4 0 0 1 4-4h24a4 4 0 0 1 4 4v14a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4Z" fill="#91A9D3"/></svg>
                  <span className={styles.moveFolderText}><strong>{c.nombre}</strong>
                    {busquedaCarpeta && <small>{[empresaMover, ...rutaDeCarpeta(carpetas, c.padre_id).map(parte => parte.nombre)].join(' / ')}</small>}
                  </span>
                  <span className={styles.moveChevron} aria-hidden="true">›</span>
                </button>)}
          </div>
          {accionError && <p role="alert" className={styles.moveError}>{accionError}</p>}
          <div className={styles.moveFooter}>
            <div className={styles.moveDestinationSummary}>
              <span className={styles.moveEyebrow}>Mover a</span>
              <strong>{[empresaMover, ...rutaDestinoMover.map(c => c.nombre)].join(' / ')}</strong>
            </div>
            <div className={styles.newPlanActions}>
              <button type="button" disabled={moviendo} onClick={cerrarMover}>Cancelar</button>
              <button type="button" disabled={moviendo || destinoMover === origenMover} onClick={() => void confirmarMovimiento()}>
                {moviendo ? 'Moviendo…' : 'Mover aquí'}
              </button>
            </div>
          </div>
        </div>
      </div>}

      {planoPendiente && <div style={modalOverlayStyle} onClick={() => !subiendoPlano && setPlanoPendiente(null)}>
        <div style={modalBoxStyle} onClick={e => e.stopPropagation()}>
          <h3 style={{ margin: 0, fontSize: 18 }}>Cargar plano inicial</h3>
          <p style={{ margin: 0, color: 'var(--text-secondary)' }}>{planoPendiente.nombre}</p>
          <p style={{ margin: 0, fontSize: 14 }}>Elegí un PDF, PNG, JPG o WebP de hasta 20 MB. Después podrás abrir la obra y ubicar OTs en el plano.</p>
          <input type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" disabled={subiendoPlano} onChange={e => { const file = e.target.files?.[0]; if (file) void handleCargarPlano(file); }} />
          {subiendoPlano && <p role="status" style={{ margin: 0 }}>Cargando plano…</p>}
          {accionError && <p role="alert" style={{ margin: 0, color: 'var(--text-danger, #b91c1c)' }}>{accionError}</p>}
          <button style={modalBtnCancelStyle} disabled={subiendoPlano} onClick={() => setPlanoPendiente(null)}>Cerrar</button>
        </div>
      </div>}

      {/* Modal confirmar eliminación */}
      {confirmDelete && (
        <div
          style={modalOverlayStyle}
          onClick={() => setConfirmDelete(null)}
        >
          <div
            style={modalBoxStyle}
            onClick={e => e.stopPropagation()}
          >
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#0F172A' }}>
              ¿Eliminar proyecto?
            </h3>
            <p style={{ margin: 0, fontSize: 14, color: '#475569', lineHeight: 1.5 }}>
              <strong>{confirmDelete.nombre}</strong> y todas sus OTs serán eliminados
              permanentemente. Esta acción no se puede deshacer.
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setConfirmDelete(null)} style={modalBtnCancelStyle}>
                Cancelar
              </button>
              <button onClick={() => handleEliminar(confirmDelete)} style={modalBtnDeleteStyle}>
                Sí, eliminar
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

// ─── Estilos inline del modal de confirmación ────────────────────────────────

const modalOverlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(15, 23, 42, 0.45)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 100,
};

const modalBoxStyle: React.CSSProperties = {
  background: 'white',
  border: '1px solid #E2E8F0',
  borderRadius: 14,
  padding: 24,
  width: '100%',
  maxWidth: 400,
  boxShadow: '0 24px 72px rgba(15, 23, 42, 0.18)',
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
};

const modalBtnCancelStyle: React.CSSProperties = {
  padding: '8px 16px',
  borderRadius: 8,
  border: '1px solid #E2E8F0',
  background: 'transparent',
  color: '#475569',
  fontSize: 14,
  fontWeight: 500,
  cursor: 'pointer',
  fontFamily: 'inherit',
};

const modalBtnDeleteStyle: React.CSSProperties = {
  padding: '8px 16px',
  borderRadius: 8,
  border: 'none',
  background: '#DC2626',
  color: 'white',
  fontSize: 14,
  fontWeight: 500,
  cursor: 'pointer',
  fontFamily: 'inherit',
};
