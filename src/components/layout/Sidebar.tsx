import { useEffect, useState, type ReactNode } from 'react';
import styles from './Sidebar.module.css';
import { useAuthStore } from '../../stores/authStore';
import { useAccessStore } from '../../stores/accessStore';
import { Notificaciones } from '../ui/Notificaciones';
import { usePantallaCompleta } from '../../hooks/usePantallaCompleta';
import type { TemaTablet } from '../../hooks/useTemaTablet';

export type Vista =
  | 'dashboard'
  | 'proyectos'
  | 'grilla'
  | 'plano'
  | 'responsables'
  | 'gantt'
  | 'calendario'
  | 'contratistas'
  | 'configuracion'
  | 'ayuda';

interface SidebarProps {
  vistaActiva: string;
  onCambiarVista: (vista: Vista) => void;
  hidden?: boolean;
  /** S37-T · Solo en tablet se ofrece el botón de pantalla completa: en
   *  notebook el F11 del sistema ya cumple esa función. */
  modoTablet?: boolean;
  /** S37-T F2 · Tema tablet. 'campo' es el tema actual de la app tal cual. */
  tema?: TemaTablet;
  onCambiarTema?: (t: TemaTablet) => void;
}

const LS_COLLAPSED_KEY = 'sidebar_collapsed';

interface NavItem {
  vista: Vista;
  icon: ReactNode;
  label: string;
}

function NavIcon({ children }: { children: ReactNode }) {
  return <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">{children}</svg>;
}

const ICONS = {
  dashboard: <NavIcon><path d="M4 13h6V4H4v9Zm0 7h6v-4H4v4Zm10 0h6v-9h-6v9Zm0-16v4h6V4h-6Z" /></NavIcon>,
  proyectos: <NavIcon><path d="M3.75 6.75A1.75 1.75 0 0 1 5.5 5h4l1.65 2h7.35a1.75 1.75 0 0 1 1.75 1.75v8.75a1.75 1.75 0 0 1-1.75 1.75h-13a1.75 1.75 0 0 1-1.75-1.75V6.75Z" /></NavIcon>,
  responsables: <NavIcon><path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8a7 7 0 0 1 14 0H5Z" /></NavIcon>,
  contratistas: <NavIcon><path d="M4 20V7h6V4h4v3h6v13h-6v-4h-4v4H4Zm3-9h2V9H7v2Zm0 4h2v-2H7v2Zm8-4h2V9h-2v2Zm0 4h2v-2h-2v2Z" /></NavIcon>,
  gantt: <NavIcon><path fill="none" d="M5 4v16M3 18h18M8 7h7v3H8V7Zm3 5h9v3h-9v-3Z" /></NavIcon>,
  calendario: <NavIcon><path fill="none" d="M6 3v3m12-3v3M4 9h16M5.5 5h13A1.5 1.5 0 0 1 20 6.5v12a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5v-12A1.5 1.5 0 0 1 5.5 5Z" /></NavIcon>,
  ayuda: <NavIcon><path fill="none" d="M9.4 9a2.75 2.75 0 1 1 4.35 2.24C12.7 12 12 12.55 12 14m0 4h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></NavIcon>,
  configuracion: <NavIcon><path fill="none" d="M12 15.25A3.25 3.25 0 1 0 12 8.75a3.25 3.25 0 0 0 0 6.5Zm7.1-1.37 1.15 1.02-1.8 3.12-1.48-.5a7.9 7.9 0 0 1-2.17 1.26L14.5 20h-5l-.3-1.22a7.9 7.9 0 0 1-2.17-1.26l-1.48.5-1.8-3.12 1.15-1.02a8.2 8.2 0 0 1 0-2.76L3.75 10.1l1.8-3.12 1.48.5A7.9 7.9 0 0 1 9.2 6.22L9.5 5h5l.3 1.22a7.9 7.9 0 0 1 2.17 1.26l1.48-.5 1.8 3.12-1.15 1.02a8.2 8.2 0 0 1 0 2.76Z" /></NavIcon>,
};

const NAV_PRINCIPAL: NavItem[] = [
  { vista: 'dashboard', icon: ICONS.dashboard, label: 'Dashboard' },
  { vista: 'proyectos', icon: ICONS.proyectos, label: 'Proyectos' },
];

const NAV_GLOBALES: NavItem[] = [
  { vista: 'responsables', icon: ICONS.responsables, label: 'Responsables' },
  { vista: 'contratistas', icon: ICONS.contratistas, label: 'Contratistas' },
  { vista: 'gantt',        icon: ICONS.gantt, label: 'Gantt' },
  { vista: 'calendario',   icon: ICONS.calendario, label: 'Calendario' },
];

const ITEM_AYUDA:  NavItem = { vista: 'ayuda', icon: ICONS.ayuda, label: 'Ayuda' };
const ITEM_CONFIG: NavItem = { vista: 'configuracion', icon: ICONS.configuracion, label: 'Configuración' };

const AVATAR_PALETTE = ['#1E40AF', '#15803D', '#C2410C', '#7C3AED', '#0E7490', '#BE123C', '#B45309'];

function colorFromName(n: string): string {
  if (!n) return AVATAR_PALETTE[0];
  let h = 0;
  for (let i = 0; i < n.length; i++) h = (h * 31 + n.charCodeAt(i)) >>> 0;
  return AVATAR_PALETTE[h % AVATAR_PALETTE.length];
}

const inicial = (n: string) => n ? n.trim().charAt(0).toUpperCase() : '?';

export function Sidebar({
  vistaActiva, onCambiarVista, hidden,
  modoTablet = false, tema = 'campo', onCambiarTema,
}: SidebarProps) {
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem(LS_COLLAPSED_KEY) === '1'; }
    catch { return false; }
  });
  const user = useAuthStore(s => s.user);
  const contexto = useAccessStore(s => s.contexto);
  const empresaId = useAccessStore(s => s.empresaId);
  // S37-T · Pantalla completa real (Fullscreen API). Exclusiva de modo tablet:
  // en notebook el F11 del sistema ya cumple esa función y duplicarla solo
  // ensuciaría una UI que debe quedar intacta.
  const { activa: pantallaCompleta, alternar: alternarPantallaCompleta, soportada: fsSoportada } = usePantallaCompleta();

  useEffect(() => {
    try { localStorage.setItem(LS_COLLAPSED_KEY, collapsed ? '1' : '0'); }
    catch (e) { console.error('[Sidebar] localStorage:', e); }
  }, [collapsed]);

  const userName = user?.email?.split('@')[0] ?? 'Usuario';
  const userRole = contexto?.creador ? 'Creador' : contexto?.empresas.find(e => e.id === empresaId)?.rol ?? 'Sin acceso';

  if (hidden) return null;

  const renderItem = (it: NavItem) => {
    const activo = vistaActiva === it.vista;
    return (
      <button
        key={it.vista}
        type="button"
        className={`${styles.navItem} ${activo ? styles.navItemActive : ''}`}
        onClick={() => onCambiarVista(it.vista)}
        title={collapsed ? it.label : undefined}
        aria-label={it.label}
      >
        <span className={styles.navIcon}>{it.icon}</span>
        {!collapsed && <span className={styles.navLabel}>{it.label}</span>}
      </button>
    );
  };

  const renderSectionLabel = (label: string) => {
    if (collapsed) return <div className={styles.sectionSpacer} />;
    return <div className={styles.sectionLabel}>{label}</div>;
  };

  return (
    <aside className={`${styles.sidebar} ${collapsed ? styles.collapsed : ''}`}>

      {/* ─── Toggle circular en el borde derecho ─── */}
      <button
        type="button"
        className={styles.toggleBtn}
        onClick={() => setCollapsed(c => !c)}
        title={collapsed ? 'Expandir sidebar' : 'Colapsar sidebar'}
        aria-label={collapsed ? 'Expandir' : 'Colapsar'}
      >
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <path d={collapsed ? 'm8 5 5 5-5 5' : 'm12 5-5 5 5 5'} />
        </svg>
      </button>

      {/* ─── Top: logo ─── */}
      <div className={styles.top}>
        {collapsed ? (
          <div className={styles.logoMini} title="Plan-OTs">P</div>
        ) : (
          <div className={styles.logoBox}>
            <div className={styles.logoTitle}>Plan-OTs</div>
            <div className={styles.logoSubtitle}>BBC Facility Services</div>
          </div>
        )}
      </div>

      {/* ─── Nav (scroll si hace falta) ─── */}
      <nav className={styles.nav}>

        {renderSectionLabel('PRINCIPAL')}
        {NAV_PRINCIPAL.map(renderItem)}

        {renderSectionLabel('DATOS GLOBALES')}
        {NAV_GLOBALES.map(renderItem)}

        <div className={styles.divider} />

        {renderItem(ITEM_AYUDA)}
        {renderItem(ITEM_CONFIG)}
      </nav>

      {/* ─── Bottom: tema + pantalla completa + notificaciones + avatar ─── */}
      <div className={styles.bottom}>
        {modoTablet && onCambiarTema && (
          <div className={styles.temaToggle} role="group" aria-label="Tema de la interfaz">
            <button
              type="button"
              className={`${styles.temaBtn} ${tema === 'vidrio' ? styles.temaBtnActivo : ''}`}
              onClick={() => onCambiarTema('vidrio')}
              aria-pressed={tema === 'vidrio'}
              title="Tema Vidrio — superficie translúcida sobre foto de obra"
            >
              {collapsed ? '◧' : 'Vidrio'}
            </button>
            <button
              type="button"
              className={`${styles.temaBtn} ${tema === 'campo' ? styles.temaBtnActivo : ''}`}
              onClick={() => onCambiarTema('campo')}
              aria-pressed={tema === 'campo'}
              title="Tema Campo — el tema actual de la app, máxima legibilidad al sol"
            >
              {collapsed ? '☀' : 'Campo'}
            </button>
          </div>
        )}
        {modoTablet && fsSoportada && (
          <button
            type="button"
            className={styles.navItem}
            onClick={alternarPantallaCompleta}
            title={pantallaCompleta ? 'Salir de pantalla completa' : 'Pantalla completa'}
            aria-label={pantallaCompleta ? 'Salir de pantalla completa' : 'Pantalla completa'}
            aria-pressed={pantallaCompleta}
          >
            <span className={styles.navIcon}>{pantallaCompleta ? '⇲' : '⛶'}</span>
            {!collapsed && (
              <span className={styles.navLabel}>
                {pantallaCompleta ? 'Salir de pantalla completa' : 'Pantalla completa'}
              </span>
            )}
          </button>
        )}
        <Notificaciones collapsed={collapsed} />
        <div className={styles.userBox}>
          <div
            className={styles.userAvatar}
            style={{ background: colorFromName(userName) }}
            title={collapsed ? `${userName} · ${userRole}` : undefined}
          >
            {inicial(userName)}
          </div>
          {!collapsed && (
            <div className={styles.userInfo}>
              <div className={styles.userName}>{userName}</div>
              <div className={styles.userRole}>{userRole}</div>
            </div>
          )}
        </div>
      </div>

    </aside>
  );
}

export default Sidebar;
