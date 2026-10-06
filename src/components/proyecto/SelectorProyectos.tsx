import { useAccessStore } from '../../stores/accessStore';
import { useEffect, useState, useRef, useMemo } from 'react';
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
  const [creandoCarpeta, setCreandoCarpeta] = useState(false);
  const [proyectoMover, setProyectoMover] = useState<Proyecto | null>(null);
  const [carpetaMover, setCarpetaMover] = useState<Carpeta | null>(null);
  const [menuCarpeta, setMenuCarpeta] = useState<string | null>(null);
  const [busquedaCarpeta, setBusquedaCarpeta] = useState('');
  const [creandoPlano, setCreandoPlano] = useState(false);
  const [subiendoPlano, setSubiendoPlano] = useState(false);
  const [busqueda,       setBusqueda]       = useState('');
  const [statsMap,       setStatsMap]       = useState<Record<string, ProyectoStats>>(() => Object.fromEntries(statsCache));
  const [thumbnails,     setThumbnails]     = useState<Record<string, string>>({});
  const menuRef    = useRef<HTMLDivElement>(null);

  function navegarCarpeta(id: string | null) {
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

  // Cerrar el dropdown ⋯ de cada card al hacer click fuera.
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const t = e.target as Node;
      if (menuRef.current && !menuRef.current.contains(t)) {
        setMenuAbierto(null);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const carpetaSeleccionada = carpetas.find(c => c.id === carpetaActual);
  const empresaDestino = carpetaSeleccionada?.tenant_id ?? empresaId ?? '';
  const empresaParaCrear = empresaDestino || (contexto?.empresas.length === 1 ? contexto.empresas[0].id : '');
  const obrasDisponibles = useMemo(() => proyectos.filter(p => !p.proyecto_padre_id &&
    (!empresaDestino || p.tenant_id === empresaDestino) &&
    contexto?.obras.some(o => o.id === p.id && o.editar)), [proyectos, empresaDestino, contexto]);
  const carpetasFiltradas = useMemo(() => carpetas.filter(c =>
    (!empresaId || c.tenant_id === empresaId) &&
    (busqueda ? c.nombre.toLocaleLowerCase().includes(busqueda.toLocaleLowerCase()) : c.padre_id === carpetaActual)
  ), [carpetas, empresaId, busqueda, carpetaActual]);
  const rutaCarpeta = useMemo(() => {
    const ruta: Carpeta[] = []; let actual = carpetaSeleccionada;
    while (actual && ruta.length < 5) { ruta.unshift(actual); actual = carpetas.find(c => c.id === actual?.padre_id); }
    return ruta;
  }, [carpetaSeleccionada, carpetas]);
  const destinosCarpeta = useMemo(() => {
    if (!carpetaMover) return { prohibidos: new Set<string>(), altura: 0 };
    const prohibidos = new Set<string>([carpetaMover.id]);
    let altura = 1;
    for (let nivel = 1; nivel <= 5; nivel++) {
      const hijos = carpetas.filter(c => c.padre_id && prohibidos.has(c.padre_id) && !prohibidos.has(c.id));
      if (!hijos.length) break;
      hijos.forEach(c => prohibidos.add(c.id));
      altura = Math.max(altura, ...hijos.map(c => c.profundidad - carpetaMover.profundidad + 1));
    }
    return { prohibidos, altura };
  }, [carpetaMover, carpetas]);

  // Filtro por nombre o cliente (case-insensitive)
  const proyectosFiltrados = useMemo(() => {
    const q = busqueda.toLowerCase();
    const visibles = empresaId ? proyectos.filter(p => p.tenant_id === empresaId) : proyectos;
    if (!q) return visibles.filter(p => (p.carpeta_id ?? null) === carpetaActual);
    return visibles.filter(p =>
      p.nombre.toLowerCase().includes(q) ||
      (p.cliente ?? '').toLowerCase().includes(q)
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
    if (!empresaParaCrear || !nombreCarpeta.trim() || creandoCarpeta) return;
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

  async function handleMoverProyecto(carpetaId: string | null) {
    if (!proyectoMover) return;
    setAccionError(null);
    try { await moverProyecto(proyectoMover.id, carpetaId); setProyectoMover(null); }
    catch (error) { setAccionError(error instanceof Error ? error.message : 'No se pudo mover el proyecto.'); }
  }
  async function handleMoverCarpeta(padreId: string | null) {
    if (!carpetaMover) return;
    setAccionError(null);
    try {
      const ticket = sessionTicket();
      const { error } = await supabase.rpc('plan_mover_carpeta', { p_carpeta: carpetaMover.id, p_padre: padreId });
      assertSession(ticket);
      if (error) throw new Error(error.message);
      const { data, error: cargaError } = await supabase.from('plan_carpetas').select('id,tenant_id,padre_id,nombre,profundidad,created_by').order('nombre');
      assertSession(ticket);
      if (cargaError) throw new Error(cargaError.message);
      setCarpetas(data as Carpeta[]); setCarpetaMover(null);
    } catch (error) { setAccionError(error instanceof Error ? error.message : 'No se pudo mover la carpeta.'); }
  }

  return (
    <div className={styles.page}>

      {/* ── Área scrollable — full width para que el scrollbar quede al
              borde derecho del viewport, no centrado por el max-width del
              .content. */}
      <div className={styles.scrollArea}>
      <div className={styles.content}>

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
          <button disabled={!empresaParaCrear || (carpetaSeleccionada?.profundidad ?? 0) >= 5} className={styles.secondaryBtn} onClick={() => { setAccionError(null); setModalCarpeta(true); }}>
            + Crear carpeta
          </button>
          <button disabled={obrasDisponibles.length === 0} className={styles.newBtn} onClick={() => {
            setAccionError(null); setArchivoNuevoPlano(null); setCarpetaNuevoPlano(carpetaActual);
            setTorreNuevoPlano(obrasDisponibles[0]);
          }}>
            <span className={styles.newBtnIcon}>+</span> Crear proyecto
          </button>
        </div>
        <nav className={styles.breadcrumbs} aria-label="Ruta de carpetas">
          <button type="button" className={styles.historyButton} aria-label="Atrás" title="Atrás" disabled={historialCarpetas.indice === 0}
            onClick={() => setHistorialCarpetas(prev => ({ ...prev, indice: prev.indice - 1 }))}>
            <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m12.5 4.5-5.5 5.5 5.5 5.5" /></svg>
          </button>
          <button type="button" className={styles.historyButton} aria-label="Adelante" title="Adelante" disabled={historialCarpetas.indice >= historialCarpetas.rutas.length - 1}
            onClick={() => setHistorialCarpetas(prev => ({ ...prev, indice: prev.indice + 1 }))}>
            <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m7.5 4.5 5.5 5.5-5.5 5.5" /></svg>
          </button>
          <button type="button" onClick={() => navegarCarpeta(null)}>Proyectos</button>
          {rutaCarpeta.map(c => <span key={c.id}> / <button type="button" onClick={() => navegarCarpeta(c.id)}>{c.nombre}</button></span>)}
          {busqueda && <span className={styles.searchHint}>Buscando en todas las carpetas</span>}
        </nav>

        {/* Errores / loading */}
        {(error || accionError) && (
          <div style={{
            background: '#FEF2F2', border: '1px solid #FECACA',
            color: '#DC2626', padding: '10px 14px', borderRadius: 8,
            fontSize: 14, marginBottom: 20,
          }}>
            {accionError || error}
          </div>
        )}

        {carpetasFiltradas.length > 0 && <div className={styles.folderGrid}>
          {carpetasFiltradas.map(c => <div key={c.id} className={`${styles.folderCard} ${menuCarpeta === c.id ? styles.folderCardOpen : ''}`}>
            <button type="button" className={styles.folderOpen} onClick={() => { setBusqueda(''); navegarCarpeta(c.id); }}>
              <svg className={styles.folderIcon} viewBox="0 0 96 80" aria-hidden="true">
                <path d="M8 15a7 7 0 0 1 7-7h22l9 9h35a7 7 0 0 1 7 7v43a7 7 0 0 1-7 7H15a7 7 0 0 1-7-7Z" fill="#5D79B0" />
                <path d="M8 32a7 7 0 0 1 7-7h66a7 7 0 0 1 7 7v35a7 7 0 0 1-7 7H15a7 7 0 0 1-7-7Z" fill="#91A9D3" />
              </svg>
              <span className={styles.folderName}>{c.nombre}</span>
            </button>
            {(contexto?.creador || c.created_by === identityId()) && <button type="button" className={styles.folderMenu} aria-label={`Opciones de ${c.nombre}`} aria-expanded={menuCarpeta === c.id}
              onClick={() => setMenuCarpeta(menuCarpeta === c.id ? null : c.id)}>···</button>
            }
            {menuCarpeta === c.id && <div className={styles.folderActions}>
              <button type="button" onClick={() => { setMenuCarpeta(null); setBusquedaCarpeta(''); setCarpetaMover(c); }}>Mover</button>
            </div>}
          </div>)}
        </div>}

        {/* Los planos mantienen sus tarjetas; las carpetas se leen como iconos. */}
        <div className={styles.grid}>
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
                className={styles.card}
                ref={menuAbierto === proyecto.id ? menuRef : null}
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

                  {/* El botón queda sobre la portada; las acciones se despliegan
                      debajo para no tapar la imagen ni el contenido de la tarjeta. */}
                  <div
                    style={{ position: 'absolute', top: 0, right: 0, zIndex: 5 }}
                    onClick={e => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      disabled={!contexto?.obras.find(p=>p.id===proyecto.id)?.editar}
                      className={styles.cardMenu}
                      onClick={() => setMenuAbierto(prev => prev === proyecto.id ? null : proyecto.id)}
                      title="Opciones"
                      aria-label={`Opciones de ${proyecto.nombre}`}
                      aria-expanded={menuAbierto === proyecto.id}
                      aria-controls={`acciones-proyecto-${proyecto.id}`}
                    >
                      ···
                    </button>
                  </div>
                </div>

                {menuAbierto === proyecto.id && <div id={`acciones-proyecto-${proyecto.id}`} className={styles.cardActions} onClick={e => e.stopPropagation()}>
                  {!proyecto.proyecto_padre_id && <button type="button" className={styles.cardAction} onClick={() => { setMenuAbierto(null); setCarpetaNuevoPlano(proyecto.carpeta_id ?? null); setArchivoNuevoPlano(null); setTorreNuevoPlano(proyecto); }}>
                    + Nuevo plano en esta obra
                  </button>}
                  {proyecto.plano_url === PLANO_PENDIENTE && (proyecto.proyecto_padre_id || contexto?.obras.find(p => p.id === proyecto.id)?.administrar) && <button type="button" className={styles.cardAction} onClick={() => { setMenuAbierto(null); setPlanoPendiente(proyecto); }}>
                    ↑ Cargar plano inicial
                  </button>}
                  {(proyecto.proyecto_padre_id || contexto?.obras.find(p => p.id === proyecto.id)?.administrar) && <button type="button" className={styles.cardAction} onClick={() => { setMenuAbierto(null); setBusquedaCarpeta(''); setProyectoMover(proyecto); }}>
                    ▣ Mover
                  </button>}
                  <button type="button" className={styles.cardAction} disabled={proyecto.plano_url === PLANO_PENDIENTE || !contexto?.obras.find(p => p.id === proyecto.id)?.administrar} onClick={() => handleDuplicar(proyecto)}>
                    ⧉ Duplicar proyecto
                  </button>
                  <button type="button" disabled={!contexto?.obras.find(p => p.id === proyecto.id)?.administrar} className={`${styles.cardAction} ${styles.cardActionDanger}`} onClick={() => { setMenuAbierto(null); setConfirmDelete(proyecto); }}>
                    🗑 Eliminar proyecto
                  </button>
                </div>}

                {/* Cuerpo */}
                <div className={styles.cardBody}>
                  {proyecto.proyecto_padre_id && <div style={{ color: 'var(--text-secondary)', fontSize: 12, marginBottom: 4 }}>
                    Plano de {proyectos.find(p => p.id === proyecto.proyecto_padre_id)?.nombre ?? 'obra asignada'}
                  </div>}
                  <div className={styles.cardName}>{proyecto.nombre}</div>
                  <div className={styles.cardClient}>
                    {proyecto.cliente ?? 'Sin cliente'}
                  </div>
                  {proyecto.plano_url === PLANO_PENDIENTE && <p style={{ margin: '8px 0', color: 'var(--text-secondary)', fontSize: 13 }}>Plano pendiente · {contexto?.obras.find(p => p.id === proyecto.id)?.editar ? 'tocá para cargarlo' : 'esperando al responsable'}</p>}
                  <div className={styles.cardDivider} />

                  {/* Stats por estado — vienen de statsService (Supabase) */}
                  <div className={styles.cardStats}>
                    <div className={styles.statRow}>
                      <span className={styles.statDot} style={{ background: COLOR_PENDIENTE }} />
                      Pendientes: {stats.pendiente}
                    </div>
                    <div className={styles.statRow}>
                      <span className={styles.statDot} style={{ background: COLOR_EN_PROCESO }} />
                      En proceso: {stats.en_proceso}
                    </div>
                    <div className={styles.statRow}>
                      <span className={styles.statDot} style={{ background: COLOR_CERRADA }} />
                      Cerradas: {stats.cerrada}
                    </div>
                    {stats.no_aplica > 0 && (
                      <div className={styles.statRow}>
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

      {modalCarpeta && <div style={{ ...modalOverlayStyle, padding: 16 }} onClick={() => !creandoCarpeta && setModalCarpeta(false)}>
        <div className={styles.newPlanDialog} role="dialog" aria-modal="true" aria-labelledby="nueva-carpeta-titulo" onClick={e => e.stopPropagation()}>
          <h3 id="nueva-carpeta-titulo" className={styles.newPlanTitle}>Crear carpeta</h3>
          <p className={styles.newPlanDescription}>Dentro de {carpetaSeleccionada?.nombre ?? 'Proyectos'} · nivel {(carpetaSeleccionada?.profundidad ?? 0) + 1} de 5</p>
          <label className={styles.newPlanField}>Nombre de la carpeta
            <input className={styles.newPlanInput} autoFocus maxLength={180} value={nombreCarpeta} onChange={e => setNombreCarpeta(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') void handleCrearCarpeta(); }} placeholder="Ej.: Distrito Perseverancia" />
          </label>
          {accionError && <p role="alert" style={{ color: '#b91c1c' }}>{accionError}</p>}
          <div className={styles.newPlanActions}>
            <button type="button" disabled={creandoCarpeta} onClick={() => setModalCarpeta(false)}>Cancelar</button>
            <button type="button" disabled={creandoCarpeta || !nombreCarpeta.trim()} onClick={() => void handleCrearCarpeta()}>{creandoCarpeta ? 'Creando…' : 'Crear carpeta'}</button>
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

      {(proyectoMover || carpetaMover) && <div style={{ ...modalOverlayStyle, padding: 16 }} onClick={() => { setProyectoMover(null); setCarpetaMover(null); }}>
        <div className={styles.newPlanDialog} role="dialog" aria-modal="true" aria-labelledby="mover-titulo" onClick={e => e.stopPropagation()}>
          <h3 id="mover-titulo" className={styles.newPlanTitle}>Mover {proyectoMover?.nombre ?? carpetaMover?.nombre}</h3>
          <p className={styles.newPlanDescription}>Elegí la carpeta de destino. Los permisos de las obras no cambian.</p>
          <input className={styles.newPlanInput} value={busquedaCarpeta} onChange={e => setBusquedaCarpeta(e.target.value)} placeholder="Buscar carpeta por nombre…" aria-label="Buscar carpeta" />
          <div className={styles.folderChoices}>
            <button type="button" onClick={() => void (proyectoMover ? handleMoverProyecto(null) : handleMoverCarpeta(null))}>Proyectos (nivel principal)</button>
            {carpetas.filter(c => c.tenant_id === (proyectoMover?.tenant_id ?? carpetaMover?.tenant_id) &&
              !destinosCarpeta.prohibidos.has(c.id) && c.profundidad + destinosCarpeta.altura <= 5 &&
              c.nombre.toLocaleLowerCase().includes(busquedaCarpeta.toLocaleLowerCase())).map(c =>
              <button type="button" key={c.id} onClick={() => void (proyectoMover ? handleMoverProyecto(c.id) : handleMoverCarpeta(c.id))}>▣ {c.nombre} <small>· nivel {c.profundidad}</small></button>)}
          </div>
          {accionError && <p role="alert" style={{ color: '#b91c1c' }}>{accionError}</p>}
          <div className={styles.newPlanActions}><button type="button" onClick={() => { setProyectoMover(null); setCarpetaMover(null); }}>Cancelar</button></div>
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
