import { useEffect, useState, useCallback, useRef } from 'react';
import type { CSSProperties } from 'react';
import { flushSync } from 'react-dom';
import { useAuthStore } from './stores/authStore';
import { useProyectosStore } from './stores/proyectosStore';
import { useOrdenesStore } from './stores/ordenesStore';
import { AuthForm } from './components/ui/AuthForm';
import { SelectorProyectos } from './components/proyecto/SelectorProyectos';
import VistaPlano from './components/plano/VistaPlano';
import { iniciarSyncManager } from './sync/SyncManager';
import { VistaGrilla } from './components/grilla/VistaGrilla';
import { Sidebar, type Vista } from './components/layout/Sidebar';
import Dashboard      from './components/views/Dashboard';
import Responsables   from './components/views/Responsables';
import Gantt          from './components/views/Gantt';
import Calendario     from './components/views/Calendario';
import Contratistas   from './components/views/Contratistas';
import Configuracion  from './components/views/Configuracion';
import ModalImportPendiente, { type OTPendienteResumen } from './components/plano/ModalImportPendiente';

const FADE_OUT_MS = 180;

// Vistas que requieren un proyecto activo para tener sentido. El resto
// maneja internamente el estado "sin proyecto" o no lo necesita.
const VISTAS_CON_PROYECTO = new Set<Vista>(['grilla', 'plano']);

export default function App() {
  const { user, initialize }          = useAuthStore();
  const proyectoActivo                = useProyectosStore(s => s.proyectoActivo);
  const setProyectoActivo             = useProyectosStore(s => s.setProyectoActivo);
  const [vista, setVista]             = useState<Vista>('proyectos');

  // ── Overlay de transición ──────────────────────────────────────
  const [coverVisible, setCoverVisible] = useState(false);
  const [coverFading, setCoverFading]   = useState(false);
  const timerRef                        = useRef<ReturnType<typeof setTimeout> | null>(null);

  const navigate = useCallback((action: () => void) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    flushSync(() => {
      setCoverVisible(true);
      setCoverFading(false);
    });
    requestAnimationFrame(() => {
      action();
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setCoverFading(true);
          timerRef.current = setTimeout(() => {
            setCoverVisible(false);
            setCoverFading(false);
            timerRef.current = null;
          }, FADE_OUT_MS);
        });
      });
    });
  }, []);

  useEffect(() => { initialize(); }, []);

  useEffect(() => {
    if (!user) return;
    const cleanup = iniciarSyncManager();
    return cleanup;
  }, [user]);

  // Cuando se abre un proyecto, default a vista 'plano'.
  useEffect(() => {
    if (proyectoActivo && !VISTAS_CON_PROYECTO.has(vista)) {
      setVista('plano');
    }
  }, [proyectoActivo?.id]);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  // ── Guard de importación pendiente ─────────────────────────────
  // Si hay OTs recién importadas que el usuario no terminó de ubicar +
  // completar con fotos, interceptamos la navegación con un modal antes de
  // dejarlo salir del plano (sidebar, salir de proyecto, toggle grilla).
  const otsPendientesImport = useOrdenesStore(s => s.otsPendientesImport);
  const ordenes              = useOrdenesStore(s => s.ordenes);
  const completarOtImport    = useOrdenesStore(s => s.completarOtImport);
  const eliminarOrdenStore   = useOrdenesStore(s => s.eliminarOrden);
  const setOtsPendientesImport = useOrdenesStore(s => s.setOtsPendientesImport);
  const [accionPendiente, setAccionPendiente] = useState<(() => void) | null>(null);

  const pendientesResumen: OTPendienteResumen[] = otsPendientesImport.flatMap(id => {
    const o = ordenes.find(x => x.id === id);
    if (!o) return [];
    const item: OTPendienteResumen = { id: o.id, ot: o.ot };
    if (o.descripcion) item.descripcion = o.descripcion;
    return [item];
  });

  // Envuelve cualquier acción de "salir del plano" — si hay pendientes, parquea
  // la acción y abre el modal; si no, navega directo.
  const intentarNavegar = useCallback((action: () => void) => {
    if (useOrdenesStore.getState().otsPendientesImport.length > 0) {
      setAccionPendiente(() => action);
      return;
    }
    navigate(action);
  }, [navigate]);

  const handleContinuarCargando = () => {
    setAccionPendiente(null);
  };

  const handleCancelarImportacion = async () => {
    // Borrar todas las pendientes (las que no aparecen en el store ya no se
    // pueden borrar; las filtramos para evitar errores).
    const idsBorrar = useOrdenesStore.getState().otsPendientesImport;
    for (const id of idsBorrar) {
      try { await eliminarOrdenStore(id); } catch { completarOtImport(id); }
    }
    setOtsPendientesImport([]);
    const accion = accionPendiente;
    setAccionPendiente(null);
    if (accion) navigate(accion);
  };

  // ── Handlers globales ──────────────────────────────────────────
  const cambiarVista = useCallback((v: Vista) => {
    intentarNavegar(() => setVista(v));
  }, [intentarNavegar]);

  // ── Render guards ──────────────────────────────────────────────
  if (!user) {
    return (
      <>
        <AuthForm />
        {coverVisible && <OverlayFade fading={coverFading} />}
      </>
    );
  }

  const requiereProyecto = VISTAS_CON_PROYECTO.has(vista) && !proyectoActivo;

  // ── Contenido principal según vista ────────────────────────────
  const renderContenido = () => {
    if (requiereProyecto) {
      return (
        <SinProyectoPlaceholder
          vista={vista}
          onIrAProyectos={() => cambiarVista('proyectos')}
        />
      );
    }

    switch (vista) {
      case 'dashboard':     return <Dashboard />;
      case 'proyectos':
        return (
          <SelectorProyectos
            onOpenDashboard={() => cambiarVista('dashboard')}
            onAbrirProyecto={(p) => navigate(() => {
              setProyectoActivo(p);
              setVista('plano');
            })}
          />
        );
      case 'grilla':
        return (
          <VistaGrilla
            proyectoId={proyectoActivo!.id}
            proyectoNombre={proyectoActivo!.nombre}
            onBack={() => navigate(() => setProyectoActivo(null))}
            onSwitchToPlano={() => cambiarVista('plano')}
          />
        );
      case 'plano':         return <VistaPlano onSwitchToGrilla={() => cambiarVista('grilla')} />;
      case 'responsables':  return <Responsables />;
      case 'gantt':         return <Gantt />;
      case 'calendario':    return <Calendario />;
      case 'contratistas':  return <Contratistas />;
      case 'configuracion': return <Configuracion />;
    }
  };

  // ── Layout ─────────────────────────────────────────────────────
  // Sidebar permanente a la izquierda. Cuando hay proyectoActivo, un topbar
  // global muestra el nombre del proyecto + toggle Plano/Grilla + Salir.
  return (
    <>
      <div style={{
        display: 'flex',
        flex: '1 1 auto',
        minHeight: 0,
        width: '100%',
        overflow: 'hidden',
      }}>
        <Sidebar vistaActiva={vista} onCambiarVista={cambiarVista} />

        <main style={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'auto',
        }}>
          {/* TopBar Plano/Grilla/Salir — sólo en las vistas project-scoped
              (plano y grilla). En vistas globales (dashboard, gantt, calendario,
              responsables, contratistas, configuracion, proyectos) no tiene
              contexto, así que se oculta aunque haya proyecto activo. */}
          {proyectoActivo && (vista === 'plano' || vista === 'grilla') && (
            <ProyectoTopBar
              nombreProyecto={proyectoActivo.nombre}
              vista={vista}
              onIrAPlano={() => cambiarVista('plano')}
              onIrAGrilla={() => cambiarVista('grilla')}
              onSalir={() => intentarNavegar(() => {
                setProyectoActivo(null);
                setVista('proyectos');
              })}
            />
          )}
          {renderContenido()}
        </main>
      </div>

      {coverVisible && <OverlayFade fading={coverFading} />}

      {/* Guard de importación incompleta — se monta cuando el usuario intenta
          salir del plano con OTs pendientes de ubicar/completar. */}
      {accionPendiente && pendientesResumen.length > 0 && (
        <ModalImportPendiente
          pendientes={pendientesResumen}
          onContinuar={handleContinuarCargando}
          onCancelar={handleCancelarImportacion}
        />
      )}
    </>
  );
}

// Topbar global contextual al proyecto activo. Se monta encima del contenido
// principal en `<main>` y se oculta cuando no hay proyectoActivo. Los botones
// Plano/Grilla son el toggle existente — reutilizan `cambiarVista()` (la misma
// función que antes usaba el Sidebar para esas dos vistas), así que conservan
// la transición con fade del navigate() y la lógica de carga de cada vista.
function ProyectoTopBar({
  nombreProyecto, vista, onIrAPlano, onIrAGrilla, onSalir,
}: {
  nombreProyecto: string;
  vista: Vista;
  onIrAPlano:  () => void;
  onIrAGrilla: () => void;
  onSalir:     () => void;
}) {
  const toggleBtn = (activo: boolean): CSSProperties => ({
    background:  activo ? '#1E3A5F' : 'transparent',
    color:       activo ? '#fff'    : '#475569',
    border:      `1px solid ${activo ? '#1E3A5F' : '#E5E7EB'}`,
    borderRadius: 8,
    padding:     '6px 12px',
    fontSize:    13,
    fontWeight:  600,
    cursor:      'pointer',
    fontFamily:  'inherit',
  });
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: '10px 16px',
      borderBottom: '1px solid #E5E7EB',
      background: '#fff',
      flexShrink: 0,
    }}>
      <span
        title={nombreProyecto}
        style={{
          flex: 1,
          minWidth: 0,
          fontSize: 14,
          fontWeight: 700,
          color: '#0F172A',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >{nombreProyecto}</span>

      <button type="button" onClick={onIrAPlano}  style={toggleBtn(vista === 'plano')}>🗺 Plano</button>
      <button type="button" onClick={onIrAGrilla} style={toggleBtn(vista === 'grilla')}>≡ Grilla</button>

      <div style={{ width: 1, height: 24, background: '#E5E7EB', margin: '0 4px' }} />

      <button
        type="button"
        onClick={onSalir}
        title="Salir de proyecto"
        style={{
          background:   'transparent',
          color:        '#64748B',
          border:       '1px solid #E5E7EB',
          borderRadius: 8,
          padding:      '6px 12px',
          fontSize:     13,
          fontWeight:   500,
          cursor:       'pointer',
          fontFamily:   'inherit',
        }}
      >Salir de proyecto</button>
    </div>
  );
}

// ───────────────────────────────────────────── Sub-componentes ──

function OverlayFade({ fading }: { fading: boolean }) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'var(--bg-app)',
        zIndex: 99999,
        opacity: fading ? 0 : 1,
        transition: fading ? `opacity ${FADE_OUT_MS}ms ease` : 'none',
        pointerEvents: 'none',
      }}
    />
  );
}

function SinProyectoPlaceholder({
  vista, onIrAProyectos,
}: { vista: Vista; onIrAProyectos: () => void }) {
  const labels: Partial<Record<Vista, string>> = {
    grilla: 'la grilla',
    plano:  'el plano',
  };
  const label = labels[vista] ?? 'esta vista';
  return (
    <div style={{
      flex: 1,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 40,
      background: '#F9FAFB',
    }}>
      <div style={{
        background: '#fff',
        border: '1px solid #E5E7EB',
        borderRadius: 14,
        padding: '36px 40px',
        textAlign: 'center',
        maxWidth: 420,
        boxShadow: '0 1px 3px rgba(15,23,42,0.04)',
      }}>
        <div style={{ fontSize: 40, marginBottom: 14 }}>📂</div>
        <h2 style={{ fontSize: 18, fontWeight: 800, color: '#0F172A', margin: '0 0 8px' }}>
          Sin proyecto seleccionado
        </h2>
        <p style={{ fontSize: 13, color: '#64748B', margin: '0 0 18px', lineHeight: 1.5 }}>
          Elegí un proyecto desde la lista para ver {label}.
        </p>
        <button
          type="button"
          onClick={onIrAProyectos}
          style={{
            background: '#1E3A5F',
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            padding: '9px 18px',
            fontSize: 13,
            fontWeight: 700,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >Ir a Proyectos</button>
      </div>
    </div>
  );
}

