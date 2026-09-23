import { useEffect, useState, useCallback } from 'react';
import type { CSSProperties } from 'react';
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
import { useModoTablet } from './hooks/useModoTablet';
import { useHeartbeat } from './hooks/useHeartbeat';
import ModalImportPendiente, { type OTPendienteResumen } from './components/plano/ModalImportPendiente';
import VisorPlano3D from './components/plano3d/VisorPlano3D';
import PantallaAyuda from './components/ayuda/PantallaAyuda';
import TourGuiado from './components/ayuda/TourGuiado';
import { SessionGate } from './components/ui/SessionGate';

const VISTAS_CON_PROYECTO = new Set<Vista>(['grilla', 'plano']);

export default function App() {
  return <SessionGate><ContenidoApp /></SessionGate>;
}

function ContenidoApp() {
  const { user }                     = useAuthStore();
  const proyectoActivo                = useProyectosStore(s => s.proyectoActivo);
  const setProyectoActivo             = useProyectosStore(s => s.setProyectoActivo);
  const [vista, setVista]             = useState<Vista>('proyectos');
  const [fullscreen, setFullscreen]   = useState(false);

  const navigate = useCallback((action: () => void) => action(), []);

  // ── S37-T · Modo tablet ────────────────────────────────────────────────────
  // El hook se llama antes de cualquier return condicional, así que corre en
  // cada arranque de la app y no solo después del login: el usuario que vuelve
  // con sesión guardada también entra ya en el modo correcto.
  const { modoTablet, orientacion } = useModoTablet();
  useHeartbeat(proyectoActivo?.id ?? null);

  useEffect(() => {
    const b = document.body;
    // toggle (no add/remove en cleanup) para que rotar no produzca un frame sin
    // clases — eso causaría un parpadeo del layout en cada giro.
    b.classList.toggle('modo-tablet', modoTablet);
    b.classList.toggle('orient-h',    orientacion === 'h');
    b.classList.toggle('orient-v',    orientacion === 'v');
    b.classList.remove('tema-vidrio');
    try { localStorage.removeItem('planots_tema_tablet'); } catch { /* almacenamiento no disponible */ }
  }, [modoTablet, orientacion]);

  useEffect(() => {
    if (!user) return;
    const cleanup = iniciarSyncManager();
    return cleanup;
  }, [user]);

  useEffect(() => {
    if (proyectoActivo && !VISTAS_CON_PROYECTO.has(vista)) {
      setVista('plano');
    }
  }, [proyectoActivo?.id]);

  // Seguridad: si salimos de la vista plano, nunca dejar el Sidebar oculto.
  useEffect(() => {
    if (vista !== 'plano' && fullscreen) setFullscreen(false);
  }, [vista, fullscreen]);

  const otsPendientesImport    = useOrdenesStore(s => s.otsPendientesImport);
  const ordenes                = useOrdenesStore(s => s.ordenes);
  const completarOtImport      = useOrdenesStore(s => s.completarOtImport);
  const eliminarOrdenStore     = useOrdenesStore(s => s.eliminarOrden);
  const setOtsPendientesImport = useOrdenesStore(s => s.setOtsPendientesImport);
  const [accionPendiente, setAccionPendiente] = useState<(() => void) | null>(null);

  const pendientesResumen: OTPendienteResumen[] = otsPendientesImport.flatMap(id => {
    const o = ordenes.find(x => x.id === id);
    if (!o) return [];
    const item: OTPendienteResumen = { id: o.id, ot: o.ot };
    if (o.descripcion) item.descripcion = o.descripcion;
    return [item];
  });

  const intentarNavegar = useCallback((action: () => void) => {
    if (useOrdenesStore.getState().otsPendientesImport.length > 0) {
      setAccionPendiente(() => action);
      return;
    }
    navigate(action);
  }, [navigate]);

  const handleContinuarCargando = () => { setAccionPendiente(null); };

  const handleCancelarImportacion = async () => {
    const idsBorrar = useOrdenesStore.getState().otsPendientesImport;
    for (const id of idsBorrar) {
      try { await eliminarOrdenStore(id); } catch { completarOtImport(id); }
    }
    setOtsPendientesImport([]);
    const accion = accionPendiente;
    setAccionPendiente(null);
    if (accion) navigate(accion);
  };

  const cambiarVista = useCallback((v: Vista) => {
    if (v === vista) return;
    intentarNavegar(() => setVista(v));
  }, [intentarNavegar, vista]);

  if (!user) {
    return (
      <>
        <AuthForm />
      </>
    );
  }

  const requiereProyecto = VISTAS_CON_PROYECTO.has(vista) && !proyectoActivo;

  const renderContenido = () => {
    if (requiereProyecto) {
      return (
        <SinProyectoPlaceholder
          vista={vista}
          onIrAProyectos={() => cambiarVista('proyectos')}
        />
      );
    }

    if (proyectoActivo && VISTAS_CON_PROYECTO.has(vista)) {
      return (
        <>
          <div style={{ display: vista === 'plano' ? 'contents' : 'none' }}>
            <VistaPlano
              onSwitchToGrilla={() => cambiarVista('grilla')}
              fullscreen={fullscreen}
              onToggleFullscreen={() => setFullscreen(f => !f)}
              visible={vista === 'plano'}
            />
          </div>
          {vista === 'grilla' && (
            <VistaGrilla
              proyectoId={proyectoActivo.id}
              proyectoNombre={proyectoActivo.nombre}
              onBack={() => navigate(() => setProyectoActivo(null))}
              onSwitchToPlano={() => cambiarVista('plano')}
            />
          )}
        </>
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
      case 'responsables':  return <Responsables />;
      case 'gantt':         return <Gantt />;
      case 'calendario':    return <Calendario />;
      case 'contratistas':  return <Contratistas />;
      case 'configuracion': return <Configuracion />;
      case 'ayuda':         return <PantallaAyuda />;
      case '3d-test' as Vista: return <VisorPlano3D />;
    }
  };

  return (
    <>
      <div style={{
        display: 'flex',
        flex: '1 1 auto',
        minHeight: 0,
        width: '100%',
        overflow: 'hidden',
      }}>
        <Sidebar
          vistaActiva={vista}
          onCambiarVista={cambiarVista}
          hidden={fullscreen}
          modoTablet={modoTablet}
        />

        <main style={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'auto',
        }}>
          {!fullscreen && proyectoActivo && (vista === 'plano' || vista === 'grilla') && (
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

      <TourGuiado />

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
    background:   activo ? '#1E3A5F' : 'transparent',
    color:        activo ? '#fff'    : '#475569',
    border:       `1px solid ${activo ? '#1E3A5F' : '#E5E7EB'}`,
    borderRadius: 8,
    padding:      '6px 12px',
    fontSize:     13,
    fontWeight:   600,
    cursor:       'pointer',
    fontFamily:   'inherit',
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
