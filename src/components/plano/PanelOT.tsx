// src/components/plano/PanelOT.tsx
import { useState, useEffect, useMemo, useRef } from 'react';
import type { CSSProperties } from 'react';
import type { OrdenLocal, EstadoOT, PrioridadOT } from '../../types/orden';
import { useOrdenesStore, rowToOrden } from '../../stores/ordenesStore';
import { supabase } from '../../db/supabase';
import { useAuthStore } from '../../stores/authStore';
import { useProyectosStore } from '../../stores/proyectosStore';
import {
  informeDisponible,
  type TipoInforme,
} from '../../services/reportService';
import { validarFotosParaEstado } from '../../utils/validaciones';
import {
  diasAbierto,
  parsearGuaranies,
  colorEstado,
  emojiRubro,
} from '../../utils/calculos';
import VisorFotos, { type FotoVisor } from './VisorFotos';
import {
  subirOEncolarFoto,
  cargarFotosDeOrden,
  cargarFotosPendientesDeOrden,
  eliminarFoto,
  type CategoriaFoto,
  type FotoResultado,
} from '../../services/fotosService';
import { useLiveQuery } from 'dexie-react-hooks';
import { procesarSyncQueue } from '../../sync/SyncManager';
import { db } from '../../db/dexie';
import type { FotoPendiente } from '../../db/dexie';
import {
  getCamposDeProyecto,
  type CampoDefinicion,
} from '../../services/camposService';
import CampoRenderer from './CampoRenderer';
import GestorCampos from './GestorCampos';
import { ModalComentarioEstado } from './ModalComentarioEstado';
import { HistorialComentarios } from './HistorialComentarios';
import { ModalFotoDetalle } from './ModalFotoDetalle';
import { ModalInformeOT, type TipoInforme as TipoInformeModal } from '../../components/informes/ModalInformeOT';
import { crearComentario } from '../../services/comentariosService';
import { useToast } from '../ui/Toast';
import styles from './PanelOT.module.css';
import TooltipAyuda from '../ayuda/TooltipAyuda';
import MultiSelectRubro from './MultiSelectRubro';
import PanelComentarios from './PanelComentarios';
import EditorFoto, { type FotoMinima } from './EditorFoto';
import ModalDescripcionFoto from './ModalDescripcionFoto';
import { describirFotoConIA } from '../../services/iaService';

interface PanelOTProps {
  orden: OrdenLocal | null;
  onCerrar: () => void;
  modoForzadoFotos?: boolean;
  esNueva?: boolean;
}

type Tab = 'datos' | 'fotos' | 'informes' | 'campos';
type NivelRiesgo = 'Bajo' | 'Medio' | 'Alto' | 'Extremo';

const RUBROS_LISTA = [
  'Impermeabilización', 'Eléctrica', 'Plomería',
  'Aire Acondicionado', 'Vidrios', 'Herrería', 'Pintura',
  'Albañilería', 'Carpintería', 'Jardinería', 'Limpieza',
  'Seguridad', 'Ascensores', 'Gas', 'Red contra incendio',
  'Aislación', 'PCI', 'Climatización', 'Sanitarios',
  'Estructura', 'Revestimientos',
];

const RUBROS_SINONIMOS: Record<string, string> = {
  'Electricidad': 'Eléctrica',
};

const stripAccents = (s: string) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

function matchEnum<T extends string>(
  raw: string | null | undefined,
  lista: readonly T[],
  sinonimos?: Record<string, T>,
): T | null {
  if (!raw) return null;
  const t = stripAccents(raw);
  if (!t) return null;
  const exact = lista.find(item => stripAccents(item) === t);
  if (exact) return exact;
  if (sinonimos) {
    for (const [alias, canonical] of Object.entries(sinonimos)) {
      if (stripAccents(alias) === t) return canonical;
    }
  }
  const swapped = t.endsWith('o') ? t.slice(0, -1) + 'a'
                : t.endsWith('a') ? t.slice(0, -1) + 'o'
                : t;
  if (swapped !== t) {
    const m = lista.find(item => stripAccents(item) === swapped);
    if (m) return m;
  }
  return null;
}

function normalizarRubro(r: string | null | undefined): string {
  if (!r) return '';
  return matchEnum(r, RUBROS_LISTA, RUBROS_SINONIMOS) ?? r.trim();
}

function toDateInput(val: string | null | undefined): string {
  if (!val) return '';
  return val.slice(0, 10);
}

const NIVELES_RIESGO = ['Bajo', 'Medio', 'Alto', 'Extremo'] as const;
function normalizarNivelRiesgo(r: string | null | undefined): typeof NIVELES_RIESGO[number] | null {
  return matchEnum(r, NIVELES_RIESGO);
}

const ESTADOS_OT: readonly EstadoOT[] = ['Pendiente', 'En proceso', 'Cerrada', 'No aplica'];
function normalizarEstado(r: string | null | undefined): EstadoOT | undefined {
  return matchEnum(r, ESTADOS_OT) ?? undefined;
}

const PRIORIDADES_OT: readonly PrioridadOT[] = ['Alta', 'Media', 'Baja'];
function normalizarPrioridad(r: string | null | undefined): PrioridadOT | undefined {
  return matchEnum(r, PRIORIDADES_OT) ?? undefined;
}

const COLOR_PRIORIDAD: Record<PrioridadOT, string> = {
  'Alta':  '#DC2626',
  'Media': '#F59E0B',
  'Baja':  '#64748B',
};

const ESTADOS_CON_FECHA_FIN = new Set<EstadoOT>(['Cerrada', 'No aplica']);

// El title nativo no se ve en Android (deuda #2 del Bloque A). Acá cumple para
// notebook; la señal real en tablet va a ser el badge de la Fase 4.
const TOOLTIP_FOTO_PENDIENTE = 'Disponible cuando la foto se sincronice';

// Ahora incluye las fotos pendientes de subir: `pendiente` y `fotoPendienteId`
// son el discriminante. Ver FotoResultado en fotosService.
type FotoConId = FotoResultado;

// C-2 — Estado de la lectura de fotos de la OT.
// 'listo' significa "la lista de abajo es completa y se puede validar contra ella".
// Mientras no lo sea, la UI no tiene derecho a afirmar que falta una foto.
type EstadoCargaFotos = 'cargando' | 'listo' | 'sin_conexion';

// Techo para declarar 'sin_conexion' cuando la lectura remota no resuelve NI
// rechaza. Red de seguridad redundante, a propósito: durante C-2 pareció que el
// .catch de recargarFotos no corría, pero era un bundle mezclado por HMR (Vite no
// aplica de forma confiable los cambios en .ts de servicios). Con el dev server
// reiniciado el .catch funciona. El timeout se conserva para el caso que el catch
// NO cubre: una promesa que no settlea nunca — ahí, sin esto, el panel quedaría en
// 'cargando' para siempre y los badges no dirían nada.
// 8 s: por encima del peor caso razonable de la consulta en 3G de obra, por
// debajo de lo que el técnico aguanta mirando el panel.
const TIMEOUT_SIN_CONEXION_MS = 8000;

// Cuántas categorías de foto exige un estado. Sirve para distinguir "subir de
// estado" de bajarlo o moverse en lateral, sin hardcodear un orden: las reglas
// siguen viviendo sólo en validarFotosParaEstado.
function exigenciaFotos(e: EstadoOT): number {
  const r = validarFotosParaEstado([], [], [], e);
  return [r.antesRequerida, r.duranteRequerida, r.despuesRequerida].filter(Boolean).length;
}
type FormState = Partial<OrdenLocal>;

function ordenToForm(orden: OrdenLocal | null): FormState {
  if (!orden) return {};
  return {
    ...orden,
    rubro: normalizarRubro(orden.rubro),
    rubro_secundario: (orden.rubro_secundario ?? []).map(normalizarRubro),
    nivel_riesgo: normalizarNivelRiesgo(orden.nivel_riesgo),
    estado: normalizarEstado(orden.estado) ?? orden.estado,
    prioridad: normalizarPrioridad(orden.prioridad) ?? orden.prioridad,
  };
}

function BtnEliminarFotoCard({ onClick }: { onClick: () => void }) {
  const [hover, setHover] = useState(false);
  return (
    <button onClick={onClick} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ flex: 1, minWidth: 0, padding: '3px 6px', background: hover ? 'rgba(239, 68, 68, 0.08)' : 'transparent', color: '#EF4444', border: 'none', borderTop: '1px solid var(--border-default)', borderRight: '1px solid var(--border-default)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', fontSize: '10px', fontWeight: 600, fontFamily: 'inherit', transition: 'background 0.15s' }}>
      🗑 Eliminar
    </button>
  );
}

// F4 — Tercer botón de la tarjeta, sólo para fotos en estadoSync 'ERROR'. El
// color sale de .btnReintentarCard y no inline como sus dos hermanos: la regla de
// cero hex en el componente pesa más que la simetría con código anterior.
function BtnReintentarFotoCard({ onClick, title }: { onClick: () => void; title?: string }) {
  return (
    <button onClick={onClick} title={title} className={styles.btnReintentarCard}>
      ↻ Reintentar
    </button>
  );
}

function BtnEditarFotoCard({ onClick, disabled = false, title }: { onClick: () => void; disabled?: boolean; title?: string }) {
  const [hover, setHover] = useState(false);
  return (
    <button onClick={onClick} disabled={disabled} title={title} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ flex: 1, minWidth: 0, padding: '3px 6px', background: hover && !disabled ? 'rgba(255, 255, 255, 0.05)' : 'transparent', color: 'var(--text-secondary)', border: 'none', borderTop: '1px solid var(--border-default)', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.45 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', fontSize: '10px', fontWeight: 600, fontFamily: 'inherit', transition: 'background 0.15s' }}>
      ✏️ Editar
    </button>
  );
}

export function PanelOT({ orden: ordenProp, onCerrar, modoForzadoFotos = false, esNueva = false }: PanelOTProps) {
  const { actualizarOrden, eliminarOrden, moverOrden } = useOrdenesStore();
  const { user } = useAuthStore();
  const proyectoActivo = useProyectosStore(s => s.proyectoActivo);
  const { mostrar, ToastComponent } = useToast();

  const ordenFresca = useOrdenesStore(
    s => ordenProp
      ? (s.ordenes.find(o => o.id === ordenProp.id) ?? ordenProp)
      : null
  );

  const [tab,             setTab]             = useState<Tab>('datos');
  const [form,            setForm]            = useState<FormState>(() => ordenToForm(ordenFresca));
  const [inputContratista, setInputContratista] = useState('');
  const [dropdownContratistasOpen, setDropdownContratistasOpen] = useState(false);
  const [contratistasGlobales, setContratistasGlobales] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('plan_ots_contratistas') ?? '[]'); }
    catch { return []; }
  });
  const [confirmEliminar, setConfirmEliminar] = useState(false);
  const [guardando,       setGuardando]       = useState(false);
  const [modalCierre,     setModalCierre]     = useState(false);
  const [tipoInforme,     setTipoInforme]     = useState<TipoInformeModal>('cierre');

  // ── Rol del usuario en el proyecto ──────────────────────
  const [esSupervisor, setEsSupervisor] = useState(false);

  useEffect(() => {
    if (!user?.id || !proyectoActivo?.id) return;
    supabase
      .from('proyecto_miembros')
      .select('rol')
      .eq('proyecto_id', proyectoActivo.id)
      .eq('user_id', user.id)
      .single()
      .then(({ data }) => {
        setEsSupervisor(data?.rol === 'supervisor');
      });
  }, [user?.id, proyectoActivo?.id]);

  // ── Fotos ────────────────────────────────────────────────
  const [fotosAntes,   setFotosAntes]   = useState<FotoConId[]>([]);
  const [fotosDurante, setFotosDurante] = useState<FotoConId[]>([]);
  const [fotosDespues, setFotosDespues] = useState<FotoConId[]>([]);
  const [subiendo,     setSubiendo]     = useState<CategoriaFoto | null>(null);
  const [errorFotos,   setErrorFotos]   = useState<string | null>(null);
  // C-2 — Se deriva del ÉXITO, no del error: sólo la resolución de la lectura
  // remota habilita 'listo'. Un rechazo adelanta 'sin_conexion'; si no llega ni
  // uno ni otro, lo cubre TIMEOUT_SIN_CONEXION_MS.
  const [estadoCarga,  setEstadoCarga]  = useState<EstadoCargaFotos>('cargando');
  const [modalDescIA,  setModalDescIA]  = useState<{ fotoId: string; fotoUrl: string; fotoPendienteId?: number } | null>(null);
  const [sugerenciaIA, setSugerenciaIA] = useState('');
  const [cargandoIA,   setCargandoIA]   = useState(false);
  const [editandoFoto, setEditandoFoto] = useState<{
    id: string; url: string; descripcion: string; categoria: 'ANTES' | 'DURANTE' | 'DESPUES';
  } | null>(null);
  const [visorAbierto, setVisorAbierto] = useState(false);
  const [visorIndex] = useState(0);
  const [visorFotos] = useState<FotoVisor[]>([]);

  const [fotoEditando, setFotoEditando] = useState<FotoMinima | null>(null);

  // Ledger de los objectURL creados para fotos pendientes. Regla: quien
  // renderiza, revoca. Sin esto cada Blob queda retenido en memoria hasta
  // recargar la app — con el tope de 10 MB por foto, una jornada de campo
  // termina en pestaña matada por el sistema.
  const objectUrls = useRef<Set<string>>(new Set());

  const revocarObjectUrls = () => {
    objectUrls.current.forEach(u => URL.revokeObjectURL(u));
    objectUrls.current.clear();
  };

  // OT cuya carga es la vigente. Una respuesta que vuelve con otro id es de una
  // OT que el técnico ya abandonó: se descarta en vez de pisar las listas nuevas.
  const cargaVigente = useRef<string | null>(null);
  const timeoutCarga = useRef<number | null>(null);

  const limpiarTimeoutCarga = () => {
    if (timeoutCarga.current !== null) {
      clearTimeout(timeoutCarga.current);
      timeoutCarga.current = null;
    }
  };

  // Recarga las tres listas fusionando Supabase + lo pendiente en Dexie.
  // Las pendientes van al final de cada categoría: son las más nuevas.
  const recargarFotos = async (ordenId: string) => {
    cargaVigente.current = ordenId;
    setEstadoCarga('cargando');

    // El timeout arranca ANTES del await: es la única red de contención si la
    // promesa remota no settlea nunca.
    limpiarTimeoutCarga();
    timeoutCarga.current = window.setTimeout(() => {
      timeoutCarga.current = null;
      if (cargaVigente.current !== ordenId) return;
      // Sólo degrada desde 'cargando'. Si ya resolvió, no lo pisa.
      setEstadoCarga(prev => (prev === 'cargando' ? 'sin_conexion' : prev));
    }, TIMEOUT_SIN_CONEXION_MS);

    // Secuencial y con catch propio a propósito: si la carga remota falla
    // (offline), las pendientes tienen que renderizarse igual. Con Promise.all
    // un rechazo de la remota se llevaría puesta también la lectura de Dexie.
    let remotaResolvio = false;
    const remotas = await cargarFotosDeOrden(ordenId)
      .then(r => { remotaResolvio = true; return r; })
      .catch(err => {
        console.error('[PanelOT] Error cargando fotos:', err);
        return [] as FotoConId[];
      });
    // La local también con catch: sin él, un fallo de Dexie rechaza toda esta
    // función y la llamada de arriba es `void` — rechazo sin manejador.
    const pendientes = await cargarFotosPendientesDeOrden(ordenId).catch(err => {
      console.error('[PanelOT] Error leyendo fotos pendientes:', err);
      return [] as FotoConId[];
    });

    if (cargaVigente.current !== ordenId) {
      // Respuesta vieja. cargarFotosPendientesDeOrden ya creó un objectURL por
      // foto y nadie los va a renderizar: se revocan acá o quedan colgados —
      // el ledger es de la OT vigente y no debe recibirlos.
      pendientes.forEach(f => URL.revokeObjectURL(f.url));
      return;
    }

    limpiarTimeoutCarga();
    pendientes.forEach(f => objectUrls.current.add(f.url));
    const todas = [...remotas, ...pendientes];
    setFotosAntes(  todas.filter(f => f.categoria === 'ANTES'));
    setFotosDurante(todas.filter(f => f.categoria === 'DURANTE'));
    setFotosDespues(todas.filter(f => f.categoria === 'DESPUES'));
    // Derivado del éxito: 'listo' sólo si la remota resolvió. Es la condición
    // que habilita a la UI a afirmar que falta una foto.
    setEstadoCarga(remotaResolvio ? 'listo' : 'sin_conexion');
  };

  // F4 — Conteo reactivo de las fotos sin sincronizar de ESTA OT. Va por
  // useLiveQuery y no por una lectura puntual porque quien cambia estos registros
  // es el SyncManager, que corre fuera de React: con lectura directa el badge
  // seguiría diciendo "⏳2" mucho después de que la foto ya subió.
  // El resultado viaja SELLADO con el ordenId que lo produjo. Al cambiar de OT hay
  // una ventana hasta que resuelve la query nueva, y qué devuelve el hook en esa
  // ventana es un detalle interno de la librería: el sello lo vuelve irrelevante.
  const syncFotos = useLiveQuery(
    async () => {
      const id = ordenProp?.id;
      if (!id) return { ordenId: null as string | null, regs: [] as FotoPendiente[] };
      const regs = await db.fotosPendientes.where('orden_id').equals(id).toArray();
      return { ordenId: id, regs: regs.filter(r => r.estadoSync !== 'COMPLETADO') };
    },
    [ordenProp?.id],
  );

  const regsSync = syncFotos && syncFotos.ordenId === ordenProp?.id ? syncFotos.regs : [];
  const nPendientes = regsSync.filter(r => r.estadoSync === 'PENDIENTE' || r.estadoSync === 'SUBIENDO').length;
  const nConError   = regsSync.filter(r => r.estadoSync === 'ERROR').length;
  // La tarjeta necesita estadoSync y ultimo_error, que fotoProvisional no expone y
  // fotosService está prohibido: se leen del registro de Dexie por su id.
  const regPorPendienteId = new Map(regsSync.map(r => [r.id as number, r]));

  // F4 — Reintento manual de una foto en ERROR. El barrido del SyncManager no la
  // toca a propósito: 'ERROR' significa "esperando decisión humana". Esta ES la
  // decisión humana.
  const handleReintentarFoto = async (fotoPendienteId: number) => {
    try {
      await db.fotosPendientes.update(fotoPendienteId, {
        estadoSync:     'PENDIENTE',
        intentos:       0,
        // undefined borra la propiedad en Dexie. El error viejo no debe sobrevivir
        // al reintento o el tooltip mostraría un motivo que ya no aplica.
        ultimo_error:   undefined,
        subiendo_desde: undefined,
      });
      // Defensivo: al llegar a ERROR su item ya se borró de la cola, pero si por
      // cualquier vía quedó uno, no se duplica.
      const yaEncolada = await db.syncQueue.where('tipo').equals('UPLOAD_FOTO')
        .filter(i => (i.payload as { fotoPendienteId?: number })?.fotoPendienteId === fotoPendienteId)
        .count();
      if (yaEncolada === 0) {
        await db.syncQueue.add({
          tipo:       'UPLOAD_FOTO',
          payload:    { fotoPendienteId },
          created_at: new Date().toISOString(),
          intentos:   0,
        });
      }
      if (navigator.onLine) {
        mostrar('Reintentando subida…', 'info');
        void procesarSyncQueue();   // sin esperar al próximo evento 'online'
      } else {
        mostrar('Sin conexión — se subirá al recuperar la señal.', 'info');
      }
    } catch (err) {
      setErrorFotos(err instanceof Error ? err.message : 'No se pudo reintentar la subida');
    }
  };

  const [camposDefinicion, setCamposDefinicion] = useState<CampoDefinicion[]>([]);
  const [valoresCampos,    setValoresCampos]    = useState<Record<string, unknown>>({});
  const [mostrarGestor,    setMostrarGestor]    = useState(false);

  const [modalComentario, setModalComentario] = useState<{
    abierto: boolean; estadoAnterior: string; estadoNuevo: string;
    esPorFoto: boolean;
    onConfirmar: ((comentario: string) => void) | null;
    onCancelar: (() => void) | null;
  }>({ abierto: false, estadoAnterior: '', estadoNuevo: '', esPorFoto: false, onConfirmar: null, onCancelar: null });
  const [historialRefresh, setHistorialRefresh] = useState(0);
  const [tabActivo, setTabActivo] = useState<'detalle' | 'historial'>('detalle');

  useEffect(() => {
    if (!ordenFresca) return;
    setForm(ordenToForm(ordenFresca));
    setValoresCampos(
      ordenFresca.campos && typeof ordenFresca.campos === 'object' ? ordenFresca.campos : {}
    );
  }, [ordenFresca?.id]);

  useEffect(() => {
    if (!ordenProp?.id) return;
    const capturedId = ordenProp.id;
    supabase.from('ordenes').select('*').eq('id', capturedId).single().then(({ data, error }) => {
      if (!error && data && ordenProp?.id === capturedId) {
        const fresh = rowToOrden(data as Record<string, unknown>);
        useOrdenesStore.getState().agregarOActualizarOrden(fresh);
        setForm(ordenToForm(fresh));
        setValoresCampos(fresh.campos && typeof fresh.campos === 'object' ? fresh.campos : {});
      }
    });
    setTab(modoForzadoFotos ? 'fotos' : 'datos');
    setConfirmEliminar(false);
    setErrorFotos(null);
    setInputContratista('');
    setDropdownContratistasOpen(false);
    // Las tres listas se vacían ANTES de pedir las nuevas. Sin esto sobreviven
    // las de la OT anterior mientras recargarFotos espera sus dos await, y el
    // cleanup de abajo ya revocó sus objectURL: React sigue renderizando
    // <img src="blob:…"> muerto y Chrome tira ERR_FILE_NOT_FOUND. Confirmado en
    // el Test A de C-2 (initiator react-dom, blobs con 200 conviviendo con los
    // fallados).
    setFotosAntes([]);
    setFotosDurante([]);
    setFotosDespues([]);
    // El modal de descripción guarda la fotoUrl de una foto pendiente, que es un
    // objectURL: el cleanup lo revoca al salir de la OT. Si el modal sobrevive al
    // salto queda mostrando un blob muerto y su Guardar escribe la descripción en
    // el registro de la OT anterior mientras el map recorre las listas de la
    // nueva — no falla, no se ve.
    setModalDescIA(null);
    setSugerenciaIA('');
    setCargandoIA(false);
    void recargarFotos(ordenProp.id);
    getCamposDeProyecto(ordenProp.proyecto_id).then(setCamposDefinicion).catch(err => {
      console.error('[PanelOT] Error cargando campos:', err);
    });
    // Revoca al desmontar Y al cambiar de OT: sin la segunda mitad, saltar de
    // OT en OT filtra los blobs de todas las anteriores.
    return () => {
      // El timeout se cancela acá o dispararía sobre una OT que ya no está.
      limpiarTimeoutCarga();
      revocarObjectUrls();
    };
  }, [ordenProp?.id]);

  const horaActualDefault = useMemo(
    () => new Date().toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit', hour12: false }),
    [ordenFresca?.id],
  );
  useEffect(() => {
    if (!ordenFresca) return;
    setValoresCampos(prev => {
      if (prev.hora_inicio_trabajos != null && prev.hora_fin_trabajos != null) return prev;
      return {
        ...prev,
        hora_inicio_trabajos: prev.hora_inicio_trabajos ?? horaActualDefault,
        hora_fin_trabajos:    prev.hora_fin_trabajos    ?? horaActualDefault,
      };
    });
  }, [ordenFresca?.id, valoresCampos, horaActualDefault]);

  if (!ordenFresca) return null;

  const estado = (form.estado ?? 'Pendiente') as EstadoOT;
  const validacion = validarFotosParaEstado(fotosAntes, fotosDurante, fotosDespues, estado);
  // "La lista de fotos NO es de fiar": cubre tanto la carga en curso como la
  // lectura remota que no llegó. Mientras sea true, la ausencia de una foto no
  // prueba nada — puede estar en el servidor sin que la hayamos podido leer.
  const fotosNoCargadas = estadoCarga !== 'listo';

  const set = (campo: string, valor: unknown) =>
    setForm(f => ({ ...f, [campo]: valor }));

  function pedirComentarioEstado(
    estadoAnterior: string, estadoNuevo: string, esPorFoto: boolean
  ): Promise<string | null> {
    return new Promise((resolve) => {
      setModalComentario({
        abierto: true, estadoAnterior, estadoNuevo, esPorFoto,
        onConfirmar: (texto) => { setModalComentario(prev => ({ ...prev, abierto: false })); resolve(texto); },
        onCancelar:  () =>      { setModalComentario(prev => ({ ...prev, abierto: false })); resolve(null); },
      });
    });
  }

  const onArchivoSeleccionado = (e: React.ChangeEvent<HTMLInputElement>, categoria: 'ANTES' | 'DURANTE' | 'DESPUES') => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    void procesarSubidaFoto(file, categoria);
  };

  const procesarSubidaFoto = async (file: File, categoria: 'ANTES' | 'DURANTE' | 'DESPUES') => {
    const estadoActual = (form.estado ?? ordenFresca?.estado) as EstadoOT;
    let estadoNuevo: EstadoOT | null = null;
    if (categoria === 'DURANTE' && estadoActual === 'Pendiente') estadoNuevo = 'En proceso';
    else if (categoria === 'DESPUES' && (estadoActual === 'Pendiente' || estadoActual === 'En proceso')) estadoNuevo = 'Cerrada';

    let comentarioAuto: string | null = null;
    if (estadoNuevo) {
      comentarioAuto = await pedirComentarioEstado(estadoActual, estadoNuevo, true);
      if (comentarioAuto === null) return;
    }
    setSubiendo(categoria);
    setErrorFotos(null);
    try {
      const foto = await subirOEncolarFoto(file, ordenFresca.id, ordenFresca.proyecto_id, categoria);
      if (foto.pendiente) objectUrls.current.add(foto.url);
      if (categoria === 'ANTES')   setFotosAntes(  prev => [...prev, foto]);
      if (categoria === 'DURANTE') setFotosDurante(prev => [...prev, foto]);
      if (categoria === 'DESPUES') setFotosDespues(prev => [...prev, foto]);
      setModalDescIA({ fotoId: foto.id, fotoUrl: foto.url, fotoPendienteId: foto.fotoPendienteId });
      setSugerenciaIA('');
      // El modal SIGUE offline: es el único momento en que el técnico describe la
      // foto frente al trabajo. La IA no: necesita URL pública y la API. Y el if
      // va ANTES de la llamada porque urlABase64 resuelve bien un blob: — sin
      // esto convertiría 10 MB a base64 en la tablet para fallar recién en el POST.
      if (foto.pendiente) {
        setCargandoIA(false);
      } else {
        setCargandoIA(true);
        describirFotoConIA(foto.url).then(desc => {
          setSugerenciaIA(desc);
          setCargandoIA(false);
        }).catch(() => setCargandoIA(false));
      }
      if (estadoNuevo && comentarioAuto !== null) {
        set('estado', estadoNuevo);
        await actualizarOrden(ordenFresca.id, { estado: estadoNuevo });
        await crearComentario({ orden_id: ordenFresca.id, proyecto_id: ordenFresca.proyecto_id, estado_anterior: estadoActual, estado_nuevo: estadoNuevo, comentario: comentarioAuto });
        setHistorialRefresh(prev => prev + 1);
      }
    } catch (err) {
      setErrorFotos(err instanceof Error ? err.message : 'Error al subir foto');
    } finally {
      setSubiendo(null);
    }
  };

  const handleGuardarDescripcionIA = async (descripcion: string) => {
    if (!modalDescIA) { setModalDescIA(null); return; }
    const { fotoId, fotoPendienteId } = modalDescIA;
    setModalDescIA(null);
    if (!descripcion.trim()) return;
    const desc = descripcion.trim();
    if (fotoPendienteId != null) {
      // Todavía no existe la fila en `fotos`: la descripción viaja con el
      // registro de Dexie y la escribe el SyncManager al subir (Fase 3).
      await db.fotosPendientes.update(fotoPendienteId, { descripcion: desc });
    } else {
      await supabase.from('fotos').update({ descripcion: desc }).eq('id', fotoId);
    }
    const actualizar = (arr: FotoConId[]) =>
      arr.map(f => f.id === fotoId ? { ...f, descripcion: desc } : f);
    setFotosAntes(prev => actualizar(prev));
    setFotosDurante(prev => actualizar(prev));
    setFotosDespues(prev => actualizar(prev));
  };

  const handleEliminarFoto = async (foto: FotoConId, categoria: CategoriaFoto) => {
    const fotosActuales = { ANTES: fotosAntes, DURANTE: fotosDurante, DESPUES: fotosDespues, ADJUNTO: [] as FotoConId[] }[categoria];
    if (fotosActuales.length === 1) {
      const val = validarFotosParaEstado(
        categoria === 'ANTES' ? [] : fotosAntes,
        categoria === 'DURANTE' ? [] : fotosDurante,
        categoria === 'DESPUES' ? [] : fotosDespues,
        estado
      );
      if (!val.valido) { setErrorFotos(`No podés eliminar la única foto ${categoria} — el estado actual la requiere.`); return; }
    }
    try {
      if (foto.pendiente && foto.fotoPendienteId != null) {
        // No existe en Supabase: se borra el binario de Dexie y su item de la
        // cola. Sin lo segundo, el SyncManager buscaría un registro inexistente.
        await db.fotosPendientes.delete(foto.fotoPendienteId);
        await db.syncQueue
          .where('tipo').equals('UPLOAD_FOTO')
          .filter(i => (i.payload as { fotoPendienteId?: number })?.fotoPendienteId === foto.fotoPendienteId)
          .delete();
        URL.revokeObjectURL(foto.url);
        objectUrls.current.delete(foto.url);
      } else {
        await eliminarFoto(foto.id, foto.path);
      }
      if (categoria === 'ANTES')   setFotosAntes(  prev => prev.filter(f => f.id !== foto.id));
      if (categoria === 'DURANTE') setFotosDurante(prev => prev.filter(f => f.id !== foto.id));
      if (categoria === 'DESPUES') setFotosDespues(prev => prev.filter(f => f.id !== foto.id));
    } catch (err) {
      setErrorFotos(err instanceof Error ? err.message : 'Error al eliminar foto');
    }
  };

  const handleGuardar = async () => {
    if (!ordenFresca) return;
    const v = validarFotosParaEstado(fotosAntes, fotosDurante, fotosDespues, estado);
    // Opción A de C-2. Con la lista de fotos en duda NO se bloquea el guardado,
    // salvo que el técnico esté subiendo de estado. Bloquear todo por un requisito
    // que no pudimos verificar le impedía guardar hasta una observación de texto en
    // una OT que sí tiene sus fotos en el servidor.
    let guardadoSinVerificar = false;
    if (!v.valido) {
      if (!fotosNoCargadas) {
        mostrar(v.errores.join(' · '), 'error'); setTab('fotos'); return;
      }
      const estadoOriginal = (ordenFresca.estado ?? 'Pendiente') as EstadoOT;
      if (exigenciaFotos(estado) > exigenciaFotos(estadoOriginal)) {
        mostrar(
          `Sin conexión: no se pueden verificar las fotos del servidor. Conectate para cambiar el estado a "${estado}".`,
          'error',
        );
        setTab('fotos');
        return;
      }
      guardadoSinVerificar = true;
    }

    const fechaFinFinal = (estado === 'No aplica' && !form.fecha_fin_trabajos)
      ? new Date().toISOString().slice(0, 10)
      : form.fecha_fin_trabajos;

    setGuardando(true);
    try {
      const actualizada = await actualizarOrden(ordenFresca.id, {
        ot:                         form.ot,
        descripcion:                form.descripcion ?? '',
        comentarios:                form.comentarios ?? '',
        obra:                       form.obra ?? '',
        unidad_amenities:           form.unidad_amenities ?? '',
        estado:                     form.estado,
        prioridad:                  form.prioridad,
        rubro:                      form.rubro ?? '',
        rubro_secundario:           form.rubro_secundario ?? [],
        nivel_riesgo:               form.nivel_riesgo ?? null,
        responsable:                form.responsable ?? '',
        contratistas:               form.contratistas ?? [],
        fecha_ingreso:              form.fecha_ingreso ?? undefined,
        fecha_inicio_trabajos:      estado === 'No aplica' ? undefined : (form.fecha_inicio_trabajos ?? undefined),
        fecha_fin_trabajos:         fechaFinFinal ?? undefined,
        porcentaje_avance:          form.porcentaje_avance ?? 0,
        costo:                      form.costo ?? undefined,
        en_garantia:                form.en_garantia ?? false,
        asiste_facility:            form.asiste_facility ?? false,
        reincidencia:               form.reincidencia ?? false,
        potencialmente_conflictivo: form.potencialmente_conflictivo ?? false,
        acta_conformidad:           form.acta_conformidad ?? 'Pendiente',
        informe_relevamiento:       form.informe_relevamiento ?? 'Pendiente',
        informe_avance:             form.informe_avance ?? 'Pendiente',
        informe_cierre:             form.informe_cierre ?? 'Pendiente',
        campos: valoresCampos,
      });
      if (actualizada) {
        setForm(ordenToForm(actualizada));
      } else {
        const fromStore = useOrdenesStore.getState().ordenes.find(o => o.id === ordenFresca.id);
        if (fromStore) setForm(ordenToForm(fromStore));
      }
      const ordenPersistida = actualizada ?? useOrdenesStore.getState().ordenes.find(o => o.id === ordenFresca.id);
      const posUbicada = ordenPersistida?.pos_x != null && ordenPersistida?.pos_y != null;
      const pendientes = useOrdenesStore.getState().otsPendientesImport;
      if (posUbicada && pendientes.includes(ordenFresca.id)) {
        useOrdenesStore.getState().completarOtImport(ordenFresca.id);
      }
      if (guardadoSinVerificar) {
        mostrar('Guardado. Las fotos obligatorias no se verificaron — sin conexión con el servidor.', 'info');
      }
      if (modoForzadoFotos) onCerrar();
    } finally {
      setGuardando(false);
    }
  };

  const handleEliminar = () => {
    if (!confirmEliminar) { setConfirmEliminar(true); return; }
    eliminarOrden(ordenFresca.id);
    onCerrar();
  };

  const handleCancelarNueva = () => {
    if (!ordenFresca) { onCerrar(); return; }
    eliminarOrden(ordenFresca.id);
    onCerrar();
  };

  const handleCancelarUbicacion = async () => {
    if (!ordenFresca) return;
    await moverOrden(ordenFresca.id, null, null);
    onCerrar();
  };

  const getValorCampo = (campoId: string): unknown => valoresCampos[campoId] ?? null;
  const setValorCampo = (campoId: string, valor: unknown) => {
    setValoresCampos(prev => ({ ...prev, [campoId]: valor }));
  };

  const diasAb = diasAbierto(
    form.fecha_ingreso || ordenFresca.created_at,
    ESTADOS_CON_FECHA_FIN.has(estado) ? form.fecha_fin_trabajos : undefined,
  );

  const creadoPor = ordenFresca.created_by
    ? (ordenFresca.created_by === user?.id ? (user?.email ?? ordenFresca.created_by) : ordenFresca.created_by)
    : (user?.email ?? '');

  const todasLasFotosParaEditor: FotoMinima[] = [
    ...fotosAntes.map(f   => ({ id: f.id, orden_id: ordenFresca.id, proyecto_id: ordenFresca.proyecto_id, categoria: 'ANTES'   as const, file_url: f.url })),
    ...fotosDurante.map(f => ({ id: f.id, orden_id: ordenFresca.id, proyecto_id: ordenFresca.proyecto_id, categoria: 'DURANTE' as const, file_url: f.url })),
    ...fotosDespues.map(f => ({ id: f.id, orden_id: ordenFresca.id, proyecto_id: ordenFresca.proyecto_id, categoria: 'DESPUES' as const, file_url: f.url })),
  ];

  const INFORMES_CONFIG: { tipo: TipoInforme; icono: string; nombre: string; codigo?: string; subtitulo: string }[] = [
    { tipo: 'ficha_visita',     icono: '📋', nombre: 'Ficha de Visita',         codigo: 'FOR-09-01', subtitulo: 'Registro inicial de OT' },
    { tipo: 'relevamiento',     icono: '🔍', nombre: 'Informe de Relevamiento',                      subtitulo: 'Diagnóstico técnico' },
    { tipo: 'avance',           icono: '📊', nombre: 'Informe de Avance',                            subtitulo: 'Progreso de ejecución' },
    { tipo: 'cierre',           icono: '✅', nombre: 'Informe de Cierre',                            subtitulo: 'KPIs · días · costo · avance' },
    { tipo: 'acta_conformidad', icono: '🏛️', nombre: 'Acta de Conformidad',                          subtitulo: 'Encuesta y firma del cliente' },
  ];

  const bloqueFotos = (
    categoria: CategoriaFoto, label: string,
    requerida: boolean, ok: boolean, fotos: FotoConId[]
  ) => {
    // Asimetría deliberada de C-2: ✓ OK sobrevive con la lista en duda porque una
    // foto local es evidencia POSITIVA de que el requisito está cumplido —
    // existe, sólo le falta subir. ⚠️ Requerida no sobrevive: es una afirmación
    // sobre algo que no pudimos ver, y era la que hacía salir tres badges rojos
    // en OT-009 teniendo sus tres fotos en el servidor.
    const cumplida = requerida && ok;
    const alerta   = requerida && !ok && !fotosNoCargadas;
    const neutro   = requerida && !ok && fotosNoCargadas;
    const wrapClass = [styles.fotoSeccion, alerta && styles.fotoSeccionAlerta, cumplida && styles.fotoSeccionOk].filter(Boolean).join(' ');
    // Caja punteada compartida por los dos triggers de carga. Es el mismo
    // tratamiento visual del "Agregar" único que reemplazan; sólo cambia que
    // ahora entran dos por celda del grid, así que van a flex 1 cada una.
    const cajaCarga: CSSProperties = {
      flex: 1, minWidth: 0, minHeight: '110px',
      border: '2px dashed #444', borderRadius: '8px',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: '5px',
      cursor: subiendo ? 'not-allowed' : 'pointer',
      background: 'transparent', color: 'var(--text-secondary)',
      opacity: subiendo ? 0.5 : 1,
    };
    return (
      <div className={wrapClass}>
        <div className={styles.fotoTitulo}>
          {label}
          {requerida && <span className={styles.required}>*</span>}
          {alerta  && <span className={`${styles.fotoEstadoBadge} ${styles.fotoEstadoAlerta}`}>⚠️ Requerida</span>}
          {cumplida && <span className={`${styles.fotoEstadoBadge} ${styles.fotoEstadoOk}`}>✓ OK</span>}
          {neutro && (
            <span className={`${styles.fotoEstadoBadge} ${styles.fotoEstadoNeutro}`}>
              {estadoCarga === 'cargando' ? '⟳ Verificando' : 'Sin verificar'}
            </span>
          )}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '6px' }}>
          {fotos.map((foto) => {
            const badgeColor = categoria === 'ANTES' ? 'rgba(220,50,50,0.9)' : categoria === 'DURANTE' ? 'rgba(37,99,235,0.9)' : categoria === 'DESPUES' ? 'rgba(22,163,74,0.9)' : 'rgba(100,116,139,0.9)';
            const badgeLabel = categoria === 'DESPUES' ? 'DESPUÉS' : categoria;
            const desc = (foto.descripcion ?? '').trim();
            // F4 — El estado de sync no viene en el objeto de UI: se busca en el
            // registro de Dexie por su id.
            const regPend = foto.fotoPendienteId != null ? regPorPendienteId.get(foto.fotoPendienteId) : undefined;
            const enError = regPend?.estadoSync === 'ERROR';
            return (
              <div key={foto.id} className={enError ? styles.fotoCardError : undefined} style={{ width: 'auto', background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: '8px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                <div style={{ position: 'relative', width: '100%', aspectRatio: '4 / 3' }}>
                  <img src={foto.url} alt={foto.nombre} title={foto.pendiente ? TOOLTIP_FOTO_PENDIENTE : undefined} onClick={() => { if (!foto.pendiente) setFotoEditando({ id: foto.id, orden_id: ordenFresca.id, proyecto_id: ordenFresca.proyecto_id, categoria: foto.categoria as 'ANTES' | 'DURANTE' | 'DESPUES' | 'ADJUNTO', file_url: foto.url }); }} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', cursor: foto.pendiente ? 'default' : 'pointer' }} />
                  <span style={{ position: 'absolute', top: '6px', left: '6px', background: badgeColor, color: '#FFFFFF', fontSize: '9px', fontWeight: 700, padding: '2px 5px', borderRadius: '4px', letterSpacing: '0.04em' }}>{badgeLabel}</span>
                  {/* F4 — El técnico escanea la grilla de miniaturas, no lee los
                      botones uno por uno: el error tiene que verse en la foto. */}
                  {enError && (
                    <span
                      className={`${styles.fotoEstadoBadge} ${styles.fotoEstadoAlerta}`}
                      style={{ position: 'absolute', top: '6px', right: '6px', margin: 0 }}
                    >
                      Error
                    </span>
                  )}
                </div>
                <div style={{ padding: '4px 6px 2px', flex: 1 }}>
                  <span style={{ fontSize: '10px', color: desc ? 'var(--text-primary)' : 'var(--text-secondary)', fontStyle: desc ? 'normal' : 'italic', lineHeight: 1.3, wordBreak: 'break-word', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{desc || '—'}</span>
                </div>
                <div style={{ display: 'flex', gap: 0 }}>
                  <BtnEliminarFotoCard onClick={() => handleEliminarFoto(foto, categoria)} />
                  <BtnEditarFotoCard disabled={!!foto.pendiente} title={foto.pendiente ? TOOLTIP_FOTO_PENDIENTE : undefined} onClick={() => setFotoEditando({ id: foto.id, orden_id: ordenFresca.id, proyecto_id: ordenFresca.proyecto_id, categoria: foto.categoria as 'ANTES' | 'DURANTE' | 'DESPUES' | 'ADJUNTO', file_url: foto.url })} />
                  {enError && (
                    <BtnReintentarFotoCard
                      title={`Reintentar subida — último error: ${regPend?.ultimo_error ?? 'desconocido'}`}
                      onClick={() => void handleReintentarFoto(foto.fotoPendienteId as number)}
                    />
                  )}
                </div>
              </div>
            );
          })}
          {/* Dos triggers explícitos en la misma celda del grid: en Android un
              input sin `capture` abre el selector genérico, nunca la cámara. */}
          <div style={{ display: 'flex', gap: '6px', width: 'auto' }}>
            {subiendo === categoria ? (
              <div style={{ ...cajaCarga, cursor: 'default' }}>
                <span style={{ fontSize: '20px', lineHeight: 1 }}>📷</span>
                <span style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>Subiendo…</span>
              </div>
            ) : (
              <>
                <label title={`Tomar foto ${label} con la cámara`} style={cajaCarga}>
                  <span style={{ fontSize: '20px', lineHeight: 1 }}>📷</span>
                  <span style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>Cámara</span>
                  <input type="file" accept="image/*" capture="environment" style={{ display: 'none' }} disabled={!!subiendo} onChange={e => onArchivoSeleccionado(e, categoria as 'ANTES' | 'DURANTE' | 'DESPUES')} />
                </label>
                <label title={`Elegir foto ${label} de la galería`} style={cajaCarga}>
                  <span style={{ fontSize: '20px', lineHeight: 1 }}>🖼️</span>
                  <span style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>Galería</span>
                  <input type="file" accept="image/*" style={{ display: 'none' }} disabled={!!subiendo} onChange={e => onArchivoSeleccionado(e, categoria as 'ANTES' | 'DURANTE' | 'DESPUES')} />
                </label>
              </>
            )}
          </div>
        </div>
      </div>
    );
  };

  const agregarContratista = (nombre: string) => {
    const trimmed = nombre.trim();
    if (!trimmed) return;
    if (!form.contratistas?.includes(trimmed)) {
      setForm(prev => ({ ...prev, contratistas: [...(prev.contratistas ?? []), trimmed] }));
    }
    if (!contratistasGlobales.includes(trimmed)) {
      const nueva = [...contratistasGlobales, trimmed].sort((a, b) => a.localeCompare(b));
      setContratistasGlobales(nueva);
      try { localStorage.setItem('plan_ots_contratistas', JSON.stringify(nueva)); } catch (e) { console.error('[PanelOT] localStorage contratistas:', e); }
    }
    setInputContratista('');
    setDropdownContratistasOpen(false);
  };

  const sugerenciasContratistas = contratistasGlobales.filter(c => {
    if (form.contratistas?.includes(c)) return false;
    if (!inputContratista.trim()) return true;
    return c.toLowerCase().includes(inputContratista.trim().toLowerCase());
  });

  const handleCambiarEstado = async (nuevoEstado: EstadoOT) => {
    const estadoAnterior = (form.estado ?? 'Pendiente') as EstadoOT;
    if (nuevoEstado === estadoAnterior) return;
    const validacion = validarFotosParaEstado(fotosAntes, fotosDurante, fotosDespues, nuevoEstado);
    if (!validacion.valido) {
      setTab('fotos');
      // El bloqueo NO cambia — sigue sin poder escalar sin fotos verificadas. Lo
      // que cambia es el mensaje: pedirle fotos al técnico cuando la OT ya las
      // tiene en el servidor y lo que falló fue nuestra lectura es una mentira.
      mostrar(
        fotosNoCargadas
          ? `Sin conexión: no se pueden verificar las fotos del servidor. Conectate para cambiar el estado a "${nuevoEstado}".`
          : `Subí las fotos requeridas para cambiar a "${nuevoEstado}" — el estado se actualizará automáticamente`,
        'info',
      );
      return;
    }
    const comentario = await pedirComentarioEstado(estadoAnterior, nuevoEstado, false);
    if (comentario === null) return;
    await crearComentario({
      orden_id: ordenFresca.id, proyecto_id: ordenFresca.proyecto_id,
      estado_anterior: estadoAnterior, estado_nuevo: nuevoEstado, comentario,
    });
    const extraFields: Partial<OrdenLocal> = {};
    if (nuevoEstado === 'No aplica') {
      const hoy = new Date().toISOString().slice(0, 10);
      set('fecha_fin_trabajos', hoy);
      extraFields.fecha_fin_trabajos = hoy;
    }
    set('estado', nuevoEstado);
    await actualizarOrden(ordenFresca.id, { estado: nuevoEstado, ...extraFields });
    setHistorialRefresh(prev => prev + 1);
  };

  const toggleRow = (campo: string, label: string) => {
    const on = !!(form as Record<string, unknown>)[campo];
    return (
      <div key={campo} className={styles.toggleRow}>
        <span className={styles.toggleLabel}>{label}</span>
        <button className={`${styles.toggleSwitch} ${on ? styles.on : ''}`} onClick={() => set(campo, !on)} type="button">
          <span className={styles.toggleThumb} />
        </button>
      </div>
    );
  };

  return (
    <>
      <div className={styles.backdrop} onClick={modoForzadoFotos ? undefined : onCerrar}>
        <div style={{ display: 'flex', flexDirection: 'row' }} onClick={e => e.stopPropagation()}>
        <div className={styles.panel} onClick={e => e.stopPropagation()}>

          <div className={styles.header}>
            <div className={styles.headerTitle}>
              <span style={{ color: colorEstado(estado), fontSize: '1em', lineHeight: 1 }}>◉</span>
              {' '}{form.ot || 'Nueva OT'}
              {(form.rubro || form.descripcion) ? ` — ${form.rubro ?? form.descripcion ?? ''}` : ''}
            </div>
            {!modoForzadoFotos && <button className={styles.closeBtn} onClick={onCerrar}>✕</button>}
          </div>

          <div style={{ display:'flex', borderBottom:'1px solid #2E3147', flexShrink: 0 }}>
            <button onClick={() => setTabActivo('detalle')} style={{ padding:'6px 14px', fontSize:'12px', fontWeight:600, background:'transparent', border:'none', cursor:'pointer', borderBottom: tabActivo==='detalle' ? '2px solid #2462C9' : '2px solid transparent', color: tabActivo==='detalle' ? '#E2E8F0' : '#64748B' }}>Detalle</button>
            <button onClick={() => setTabActivo('historial')} style={{ padding:'6px 14px', fontSize:'12px', fontWeight:600, background:'transparent', border:'none', cursor:'pointer', borderBottom: tabActivo==='historial' ? '2px solid #2462C9' : '2px solid transparent', color: tabActivo==='historial' ? '#E2E8F0' : '#64748B' }}>Historial</button>
          </div>

          {tabActivo === 'detalle' && (<>

          <div className={styles.tabs}>
            {(['datos', 'fotos', 'informes', 'campos'] as const).map(t => (
              <button key={t} className={`${styles.tab} ${tab === t ? styles.active : ''}`} onClick={() => setTab(t)}>
                {t === 'datos' ? 'Datos' : t === 'fotos' ? 'Fotos' : t === 'informes' ? 'Informes' : 'Campos'}
                {/* F4 — Visible desde las cuatro pestañas: el técnico pasa la
                    mayor parte del tiempo en Datos y tiene que enterarse ahí de
                    que le quedaron fotos sin salir. Sin nada pendiente no ocupa
                    lugar. */}
                {t === 'fotos' && nPendientes > 0 && (
                  <span className={`${styles.tabBadge} ${styles.tabBadgePend}`}>⏳{nPendientes}</span>
                )}
                {t === 'fotos' && nConError > 0 && (
                  <span className={`${styles.tabBadge} ${styles.fotoEstadoAlerta}`}>⚠{nConError}</span>
                )}
              </button>
            ))}
          </div>

          <div className={styles.body}>

            {tab === 'datos' && <>
              <div className={styles.section}>
                <div className={styles.sectionTitle}>Identificación</div>
                <div className={styles.field}>
                  <label className={styles.label}>Código OT</label>
                  <input className={styles.input} value={form.ot ?? ''} onChange={e => set('ot', e.target.value)} />
                </div>
                <div className={styles.field}>
                  <label className={styles.label}>Fecha de ingreso</label>
                  <input className={styles.input} type="date" value={toDateInput(form.fecha_ingreso)} onChange={e => set('fecha_ingreso', e.target.value)} />
                </div>
                <div className={styles.field}>
                  <label className={styles.label}>Obra</label>
                  <input className={styles.input} value={form.obra ?? ''} onChange={e => set('obra', e.target.value)} placeholder="Nombre de la obra" />
                </div>
                <div className={styles.field}>
                  <label className={styles.label}>Unidad / Amenities</label>
                  <input className={styles.input} value={form.unidad_amenities ?? ''} onChange={e => set('unidad_amenities', e.target.value)} placeholder="ej: Dpto 401 / Gym" />
                </div>
                <div className={styles.field}>
                  <label className={styles.label}>Descripción del reclamo</label>
                  <textarea className={styles.textarea} rows={3} placeholder="Descripción del problema según el cliente..." value={form.descripcion ?? ''} onChange={e => set('descripcion', e.target.value)} />
                </div>
                <div className={styles.field}>
                  <label className={styles.label}>Creado por</label>
                  <input className={styles.input} readOnly value={creadoPor} />
                </div>
                <div className={styles.field}>
                  <label className={styles.label}>Días abierto</label>
                  <input className={styles.input} readOnly value={`${diasAb} ${diasAb === 1 ? 'día' : 'días'}`} />
                </div>
              </div>

              <div className={styles.section}>
                <div className={styles.sectionTitle}>Clasificación</div>
                <div className={styles.field}>
                  <label className={styles.label}>
                    Estado{' '}
                    <TooltipAyuda titulo="Estado y fotos obligatorias" texto="Pendiente exige 1 foto ANTES · En proceso exige ANTES + DURANTE · Cerrada exige ANTES + DURANTE + DESPUÉS." posicion="top" />
                  </label>
                  <div className={styles.estadoBtns}>
                    {(['Pendiente', 'En proceso', 'Cerrada', 'No aplica'] as const).map(e => (
                      <button key={e} className={`${styles.estadoBtn} ${estado === e ? styles.active : ''}`} style={estado === e ? { color: colorEstado(e), borderColor: colorEstado(e) } : {}} onClick={() => handleCambiarEstado(e)}>{e}</button>
                    ))}
                  </div>
                </div>
                <div className={styles.field}>
                  <label className={styles.label}>Rubro Principal</label>
                  <select className={styles.select} value={form.rubro ?? ''} onChange={e => set('rubro', e.target.value)}>
                    <option value="">— Seleccionar —</option>
                    {[...RUBROS_LISTA, 'Otro'].map(r => <option key={r} value={r}>{emojiRubro(r)} {r}</option>)}
                  </select>
                </div>
                <div className={styles.field}>
                  <label className={styles.label}>Rubro Secundario</label>
                  <MultiSelectRubro opciones={RUBROS_LISTA.filter(r => r !== form.rubro)} seleccionados={form.rubro_secundario ?? []} onChange={vals => set('rubro_secundario', vals)} emojiMap={emojiRubro} />
                </div>
                <div className={styles.field}>
                  <label className={styles.label}>Nivel de Riesgo</label>
                  <select className={styles.select} value={form.nivel_riesgo ?? ''} onChange={e => set('nivel_riesgo', (e.target.value || null) as NivelRiesgo | null)}>
                    <option value="">— Seleccionar —</option>
                    <option value="Bajo">🟢 Bajo</option>
                    <option value="Medio">🟡 Medio</option>
                    <option value="Alto">🟠 Alto</option>
                    <option value="Extremo">🔴 Extremo</option>
                  </select>
                </div>
                <div className={styles.field}>
                  <label className={styles.label}>Prioridad</label>
                  <div className={styles.estadoBtns} style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
                    {(['Alta', 'Media', 'Baja'] as const).map(p => {
                      const on = form.prioridad === p;
                      return <button key={p} className={`${styles.estadoBtn} ${on ? styles.active : ''}`} style={on ? { color: COLOR_PRIORIDAD[p], borderColor: COLOR_PRIORIDAD[p] } : {}} onClick={() => set('prioridad', p)}>{p}</button>;
                    })}
                  </div>
                </div>
                {toggleRow('reincidencia',               'Reincidencia')}
                {toggleRow('en_garantia',                'En Garantía')}
                {toggleRow('potencialmente_conflictivo', 'Potencialmente Conflictivo')}
                {toggleRow('asiste_facility',            'Asiste Facility Services')}
              </div>

              <div className={styles.section}>
                <div className={styles.sectionTitle}>Ejecución</div>
                <div className={styles.field}>
                  <label className={styles.label}>Supervisor / Responsable</label>
                  <input className={styles.input} value={form.responsable ?? ''} onChange={e => set('responsable', e.target.value)} />
                </div>
                <div className={styles.field}>
                  <label className={styles.label}>Contratista(s)</label>
                  {(form.contratistas ?? []).length > 0 && (
                    <div className={styles.chipsWrap} style={{ marginBottom: 6 }}>
                      {(form.contratistas ?? []).map(c => (
                        <span key={c} className={styles.chip}>{c}<span className={styles.chipRemove} onClick={() => set('contratistas', (form.contratistas ?? []).filter(x => x !== c))} title="Quitar">×</span></span>
                      ))}
                    </div>
                  )}
                  <div className={styles.contratistaInputWrap}>
                    <input className={styles.input} value={inputContratista} placeholder="Nombre del contratista..." onChange={e => setInputContratista(e.target.value)} onFocus={() => setDropdownContratistasOpen(true)} onBlur={() => setTimeout(() => setDropdownContratistasOpen(false), 150)} onKeyDown={e => { if (e.key === 'Enter' && inputContratista.trim()) { e.preventDefault(); agregarContratista(inputContratista); } }} />
                    <button type="button" className={styles.contratistaAddBtn} onClick={() => agregarContratista(inputContratista)} disabled={!inputContratista.trim()}>Agregar</button>
                    {dropdownContratistasOpen && sugerenciasContratistas.length > 0 && (
                      <div className={styles.contratistaDropdown}>
                        {sugerenciasContratistas.map(c => <button key={c} type="button" className={styles.contratistaDropdownItem} onMouseDown={e => { e.preventDefault(); agregarContratista(c); }}>{c}</button>)}
                      </div>
                    )}
                  </div>
                </div>
                {estado !== 'No aplica' && (
                  <div className={styles.field}>
                    <label className={styles.label}>Fecha inicio trabajos</label>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <input className={styles.input} style={{ flex: 1 }} type="date" value={toDateInput(form.fecha_inicio_trabajos)} onChange={e => set('fecha_inicio_trabajos', e.target.value)} />
                      <input className={styles.input} style={{ flex: '0 0 100px' }} type="time" value={(valoresCampos.hora_inicio_trabajos as string | undefined) ?? horaActualDefault} onChange={e => setValorCampo('hora_inicio_trabajos', e.target.value)} />
                    </div>
                  </div>
                )}
                {estado !== 'No aplica' && (
                  <div className={styles.field}>
                    <label className={styles.label}>Fecha fin trabajos</label>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <input className={styles.input} style={{ flex: 1 }} type="date" value={toDateInput(form.fecha_fin_trabajos)} onChange={e => set('fecha_fin_trabajos', e.target.value)} />
                      <input className={styles.input} style={{ flex: '0 0 100px' }} type="time" value={(valoresCampos.hora_fin_trabajos as string | undefined) ?? horaActualDefault} onChange={e => setValorCampo('hora_fin_trabajos', e.target.value)} />
                    </div>
                  </div>
                )}
                <div className={styles.field}>
                  <label className={styles.label}>% Avance</label>
                  <div className={styles.sliderWrap}>
                    <input type="range" min={0} max={100} className={styles.slider} value={form.porcentaje_avance ?? 0} onChange={e => set('porcentaje_avance', +e.target.value)} style={{ accentColor: '#2563EB' }} />
                    <span className={styles.sliderValue}>{form.porcentaje_avance ?? 0}%</span>
                  </div>
                  <div style={{ background: '#E5E7EB', borderRadius: 4, height: 6, marginTop: 3 }}>
                    <div style={{ width: `${form.porcentaje_avance ?? 0}%`, background: '#3B82F6', height: '100%', borderRadius: 4, transition: 'width 0.2s' }} />
                  </div>
                </div>
                <div className={styles.field}>
                  <label className={styles.label}>Costo (Gs.)</label>
                  <input className={styles.input} value={form.costo != null && form.costo > 0 ? form.costo.toLocaleString('es-PY') : ''} onChange={e => set('costo', parsearGuaranies(e.target.value))} placeholder="0" />
                </div>
                <div className={styles.field}>
                  <label className={styles.label}>Observaciones del técnico</label>
                  <textarea className={styles.textarea} rows={3} placeholder="Notas y observaciones del técnico..." value={form.comentarios ?? ''} onChange={e => set('comentarios', e.target.value)} />
                </div>
              </div>

              {form.pos_x != null && form.pos_y != null && (
                <div className={styles.posicion}>
                  📍 {((form.pos_x ?? 0) * 100).toFixed(1)}% · {((form.pos_y ?? 0) * 100).toFixed(1)}%
                </div>
              )}
            </>}

            {tab === 'fotos' && (
              <div className={styles.section}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4, fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)' }}>
                  Fotos obligatorias según estado
                  <TooltipAyuda titulo="Reglas de fotos" texto="No podés cerrar una OT sin sus fotos. No podés borrar la única foto que el estado exige — bajá primero el estado." posicion="bottom" />
                </div>
                {errorFotos && <div className={styles.errorBox}>{errorFotos}</div>}
                {/* F4 — El detalle del badge de la pestaña: cuántas y de qué tipo.
                    Es el contexto donde vive el ↻ de cada tarjeta. */}
                {(nPendientes > 0 || nConError > 0) && (
                  <div className={styles.resumenSync}>
                    {nPendientes > 0 && <span>⏳ {nPendientes} esperando conexión</span>}
                    {nPendientes > 0 && nConError > 0 && <span> · </span>}
                    {nConError > 0 && (
                      <span className={styles.resumenSyncError}>⚠ {nConError} con error</span>
                    )}
                  </div>
                )}
                {estadoCarga === 'sin_conexion' && (
                  <div className={styles.avisoBox}>
                    <span>
                      📡 Sin conexión — no se pudieron leer las fotos guardadas en el
                      servidor. Abajo aparecen solo las que sacaste sin conexión. La
                      verificación de fotos obligatorias queda en pausa hasta recuperar
                      la señal.
                    </span>
                    <button type="button" onClick={() => { void recargarFotos(ordenFresca.id); }}>
                      Reintentar
                    </button>
                  </div>
                )}
                {bloqueFotos('ANTES',   'ANTES',   validacion.antesRequerida,   validacion.antesOk,   fotosAntes)}
                {bloqueFotos('DURANTE', 'DURANTE', validacion.duranteRequerida, validacion.duranteOk, fotosDurante)}
                {bloqueFotos('DESPUES', 'DESPUÉS', validacion.despuesRequerida, validacion.despuesOk, fotosDespues)}
              </div>
            )}

            {tab === 'informes' && (
              <div className={styles.section}>
                <p style={{ fontSize: '11px', color: '#94A3B8', marginBottom: '8px' }}>Los informes se generan con los datos y fotos de esta OT.</p>
                {INFORMES_CONFIG.map(({ tipo, icono, nombre, codigo, subtitulo }) => {
                  const disponible = informeDisponible(tipo, estado);
                  return (
                    <div key={tipo} className={styles.informeCard}>
                      <div className={styles.informeHeader}>
                        <span className={styles.informeIcono}>{icono}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div className={styles.informeNombre}>{nombre}{codigo && <span className={styles.informeCodigo}>{codigo}</span>}</div>
                          <div style={{ fontSize: 10, color: '#94A3B8', marginTop: 1 }}>{subtitulo}</div>
                        </div>
                        <span className={`${styles.informeEstado} ${disponible ? styles.informeOk : styles.informeNo}`}>{disponible ? 'Disponible' : 'No disponible'}</span>
                      </div>
                      <button className={styles.btnGenerar} onClick={() => { const tipoModal: TipoInformeModal = tipo === 'ficha_visita' ? 'ficha' : tipo === 'acta_conformidad' ? 'acta' : tipo; setTipoInforme(tipoModal); setModalCierre(true); }} disabled={!disponible} type="button">🖨️ Generar</button>
                    </div>
                  );
                })}
                <p className={styles.informeNota}>Si el navegador bloquea la ventana, habilitá los popups para este sitio.</p>
              </div>
            )}

            {tab === 'campos' && (
              <div className={`${styles.section} ${styles.camposWrap}`}>
                <button className={styles.gestorBtn} onClick={() => setMostrarGestor(true)}>⚙️ Gestionar campos</button>
                {camposDefinicion.length === 0 ? (
                  <div className={styles.posicion}>No hay campos personalizados definidos.</div>
                ) : (
                  camposDefinicion.map(c => <CampoRenderer key={c.id} campo={c} valor={getValorCampo(c.id)} onChange={val => setValorCampo(c.id, val)} ordenId={ordenFresca.id} proyectoId={ordenFresca.proyecto_id} />)
                )}
              </div>
            )}

          </div>
          </>)}

          {tabActivo === 'historial' && (
            <HistorialComentarios ordenId={ordenFresca.id} proyectoId={ordenFresca.proyecto_id} refreshTrigger={historialRefresh} />
          )}

          <div className={styles.footer}>
            {modoForzadoFotos ? (
              <button className={styles.cancelUbicacionBtn} onClick={handleCancelarUbicacion} disabled={guardando} type="button">Cancelar ubicación</button>
            ) : esNueva ? (
              <button className={styles.cancelUbicacionBtn} onClick={handleCancelarNueva} type="button">Cancelar</button>
            ) : esSupervisor ? (
              <button className={styles.deleteBtn} onClick={handleEliminar} type="button">
                {confirmEliminar ? '¿Confirmar?' : 'Borrar'}
              </button>
            ) : null}
            <button className={styles.saveBtn} onClick={handleGuardar} disabled={guardando || (modoForzadoFotos && !validacion.valido)}>
              {guardando ? 'Guardando...' : 'Guardar cambios'}
            </button>
          </div>

          {mostrarGestor && (
            <GestorCampos proyectoId={ordenFresca.proyecto_id} onClose={() => { setMostrarGestor(false); getCamposDeProyecto(ordenFresca.proyecto_id).then(setCamposDefinicion); }} />
          )}
        </div>
        <PanelComentarios ordenId={ordenFresca.id} proyectoId={ordenFresca.proyecto_id} />
        </div>
      </div>

      {/* Inalcanzable hoy: setVisorAbierto nunca se llama con true, así que este
          bloque —y su onFotoGuardada— no están probados. Se mantiene coherente
          con las otras rutas de recarga para que no sea una trampa si alguien
          conecta el visor. */}
      {visorAbierto && (
        <VisorFotos fotos={visorFotos} initialIndex={visorIndex} ordenId={ordenFresca.id} proyectoId={ordenFresca.proyecto_id} onClose={() => setVisorAbierto(false)}
          onFotoGuardada={() => { void recargarFotos(ordenFresca.id); }} />
      )}

      {ToastComponent}

      <ModalComentarioEstado isOpen={modalComentario.abierto} estadoAnterior={modalComentario.estadoAnterior} estadoNuevo={modalComentario.estadoNuevo} esPorFoto={modalComentario.esPorFoto} onConfirmar={modalComentario.onConfirmar ?? (() => {})} onCancelar={modalComentario.onCancelar ?? (() => {})} />

      {modalDescIA && (
        <ModalDescripcionFoto
          fotoUrl={modalDescIA.fotoUrl}
          sugerenciaIA={sugerenciaIA}
          cargandoIA={cargandoIA}
          onGuardar={handleGuardarDescripcionIA}
          onOmitir={() => setModalDescIA(null)}
        />
      )}

      {editandoFoto && (
        <ModalFotoDetalle modo="edicion" fotoUrl={editandoFoto.url} descripcionInicial={editandoFoto.descripcion} categoria={editandoFoto.categoria}
          onGuardar={async (desc) => {
            const { data, error } = await supabase.from('fotos').update({ descripcion: desc }).eq('id', editandoFoto!.id).select();
            if (error) { console.error('[Editar foto] ERROR:', error.message); }
            else {
              void data;
              const actualizar = (arr: FotoConId[]) => arr.map(f => f.id === editandoFoto!.id ? { ...f, descripcion: desc } : f);
              setFotosAntes(actualizar(fotosAntes)); setFotosDurante(actualizar(fotosDurante)); setFotosDespues(actualizar(fotosDespues));
            }
            setEditandoFoto(null);
          }}
          onCancelar={() => setEditandoFoto(null)} onEditarImagen={() => {}} />
      )}

      {modalCierre && (
        <ModalInformeOT isOpen={modalCierre} onClose={() => setModalCierre(false)} orden={ordenFresca} proyectoNombre={proyectoActivo?.nombre ?? ''} tipo={tipoInforme} />
      )}

      {fotoEditando && (
        <EditorFoto
          foto={fotoEditando}
          ordenCodigo={form.ot ?? ordenFresca.ot ?? ordenFresca.id}
          todasLasFotos={todasLasFotosParaEditor}
          onClose={() => setFotoEditando(null)}
          onGuardado={() => {
            void recargarFotos(ordenFresca.id);
          }}
        />
      )}
    </>
  );
}