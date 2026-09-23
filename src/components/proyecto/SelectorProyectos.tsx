import { useAccessStore } from '../../stores/accessStore';
import { AdministracionCreador } from './AdministracionCreador';
import { useEffect, useState, useRef, useMemo } from 'react';
import { useProyectosStore, type Proyecto } from '../../stores/proyectosStore';
import { useAuthStore } from '../../stores/authStore';
import { ModalNuevoProyecto } from './ModalNuevoProyecto';
import { ImagenPrivada } from './ImagenPrivada';
import { cargarStatsProyectos, type ProyectoStats } from '../../services/statsService';
import { generarThumbnailPDF, obtenerThumbnailPDFCache } from '../../services/pdfThumbnailService';
import styles from './SelectorProyectos.module.css';

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
    eliminarProyecto, duplicarProyecto,
  } = useProyectosStore();

  const abrirProyecto = onAbrirProyecto ?? setProyectoActivo;
  const { contexto, empresaId } = useAccessStore();
  const puedeCrear = !!contexto?.empresas.find(e=>e.id===empresaId)?.puede_crear;
  const { user } = useAuthStore();

  const [modalAbierto,   setModalAbierto]   = useState(false);
  const [menuAbierto,    setMenuAbierto]    = useState<string | null>(null);
  const [confirmDelete,  setConfirmDelete]  = useState<Proyecto | null>(null);
  const [accionError,    setAccionError]    = useState<string | null>(null);
  const [busqueda,       setBusqueda]       = useState('');
  const [statsMap,       setStatsMap]       = useState<Record<string, ProyectoStats>>(() => Object.fromEntries(statsCache));
  const [thumbnails,     setThumbnails]     = useState<Record<string, string>>({});
  const menuRef    = useRef<HTMLDivElement>(null);

  useEffect(() => { void cargarProyectos(); }, [cargarProyectos, empresaId]);

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

  // Iniciales y nombre del usuario logueado
  const userMeta    = (user?.user_metadata ?? {}) as { name?: string; full_name?: string };
  const nombreUsuario = userMeta.name ?? userMeta.full_name ?? user?.email ?? 'Usuario';
  const iniciales   = (nombreUsuario.trim()[0] ?? '?').toUpperCase();

  // Filtro por nombre o cliente (case-insensitive)
  const proyectosFiltrados = useMemo(() => {
    const q = busqueda.toLowerCase();
    const visibles = empresaId ? proyectos.filter(p => p.tenant_id === empresaId) : proyectos;
    if (!q) return visibles;
    return visibles.filter(p =>
      p.nombre.toLowerCase().includes(q) ||
      (p.cliente ?? '').toLowerCase().includes(q)
    );
  }, [proyectos, busqueda, empresaId]);

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

  return (
    <div className={styles.page}>

      {/* ── Topbar ── */}
      <nav className={styles.topbar}>
        <div className={styles.brand}>
          <div className={styles.brandIcon}>P</div>
          <span className={styles.brandName}>Plan-<span>OTs</span></span>
        </div>
        <div className={styles.userInfo}>
          <div className={styles.avatar}>{iniciales}</div>
          <div className={styles.userText}>
            <span className={styles.userName}>{nombreUsuario}</span>
            {contexto?.creador && <span className={styles.userRole}>Creador</span>}
          </div>
          <button className={styles.signOutBtn} onClick={()=>void useAuthStore.getState().signOut()}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 5H6.5A1.5 1.5 0 0 0 5 6.5v11A1.5 1.5 0 0 0 6.5 19H10m4-4 3-3-3-3m3 3H9" /></svg>
            <span>Cerrar sesión</span>
          </button>
        </div>
      </nav>

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
              <select className={styles.companySelect} aria-label="Empresa" value={empresaId} onChange={e=>{setProyectoActivo(null);useAccessStore.setState({empresaId:e.target.value});}}>
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
          <button disabled={!puedeCrear} title={puedeCrear ? undefined : "Selecciona una empresa donde tengas permiso para crear obras"} className={styles.newBtn} onClick={() => setModalAbierto(true)}>
            <span className={styles.newBtnIcon}>+</span> Nuevo proyecto
          </button>
        </div>

        <AdministracionCreador />
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

        {/* Grid de proyectos */}
        <div className={styles.grid}>
          {loading && proyectosFiltrados.length === 0 ? (
            <div className={styles.empty}>Cargando proyectos…</div>
          ) : proyectosFiltrados.length === 0 ? (
            <div className={styles.empty}>
              {busqueda
                ? `No hay proyectos que coincidan con "${busqueda}".`
                : 'No hay obras asignadas en esta selección.'}
            </div>
          ) : proyectosFiltrados.map(proyecto => {
            const stats    = statsMap[proyecto.id] ?? STATS_VACIO;
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
                onClick={() => abrirProyecto(proyecto)}
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

                  {/* Menú ··· — botón con clase CSS nueva; el dropdown
                      con duplicar/eliminar mantiene styles inline porque
                      el spec no incluye CSS para ese popover. */}
                  <div
                    ref={menuAbierto === proyecto.id ? menuRef : null}
                    style={{ position: 'absolute', top: 0, right: 0, zIndex: 5 }}
                    onClick={e => e.stopPropagation()}
                  >
                    <button
                      disabled={!contexto?.obras.find(p=>p.id===proyecto.id)?.administrar}
                      className={styles.cardMenu}
                      onClick={() => setMenuAbierto(prev => prev === proyecto.id ? null : proyecto.id)}
                      title="Opciones"
                    >
                      ···
                    </button>
                    {menuAbierto === proyecto.id && (
                      <div style={{
                        position: 'absolute', top: 42, right: 10,
                        background: 'white', border: '1px solid #E2E8F0',
                        borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                        minWidth: 180, overflow: 'hidden', zIndex: 10,
                      }}>
                        <button onClick={() => handleDuplicar(proyecto)} style={dropdownItemStyle}>
                          ⧉ Duplicar proyecto
                        </button>
                        <button
                          onClick={() => { setMenuAbierto(null); setConfirmDelete(proyecto); }}
                          style={{ ...dropdownItemStyle, color: '#DC2626' }}
                        >
                          🗑 Eliminar proyecto
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Cuerpo */}
                <div className={styles.cardBody}>
                  <div className={styles.cardName}>{proyecto.nombre}</div>
                  <div className={styles.cardClient}>
                    {proyecto.cliente ?? 'Sin cliente'}
                  </div>
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

      {/* Modal nuevo proyecto */}
      {modalAbierto && (
        <ModalNuevoProyecto onCerrar={() => setModalAbierto(false)} />
      )}

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

// ─── Estilos inline compartidos por dropdowns y modal de confirmación ─────────
// Vienen acá porque el CSS module se mantiene exactamente como el spec lo pide.

const dropdownItemStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  padding: '10px 14px',
  background: 'none',
  border: 'none',
  textAlign: 'left',
  fontSize: 14,
  color: '#0F172A',
  cursor: 'pointer',
  fontFamily: 'inherit',
};

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
