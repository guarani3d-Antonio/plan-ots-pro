import { useEffect, useState } from 'react';
import styles from './Sidebar.module.css';
import { useAuthStore } from '../../stores/authStore';

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
}

const LS_COLLAPSED_KEY = 'sidebar_collapsed';

interface NavItem {
  vista: Vista;
  icon: string;
  label: string;
}

const NAV_PRINCIPAL: NavItem[] = [
  { vista: 'dashboard', icon: '📊', label: 'Dashboard' },
  { vista: 'proyectos', icon: '📁', label: 'Proyectos' },
];

const NAV_GLOBALES: NavItem[] = [
  { vista: 'responsables', icon: '👤', label: 'Responsables' },
  { vista: 'contratistas', icon: '🏢', label: 'Contratistas' },
  { vista: 'gantt',        icon: '📅', label: 'Gantt'        },
  { vista: 'calendario',   icon: '🗓', label: 'Calendario'   },
];

const ITEM_AYUDA:  NavItem = { vista: 'ayuda',         icon: '❓', label: 'Ayuda'        };
const ITEM_CONFIG: NavItem = { vista: 'configuracion', icon: '⚙️', label: 'Configuración' };

const AVATAR_PALETTE = ['#1E40AF', '#15803D', '#C2410C', '#7C3AED', '#0E7490', '#BE123C', '#B45309'];

function colorFromName(n: string): string {
  if (!n) return AVATAR_PALETTE[0];
  let h = 0;
  for (let i = 0; i < n.length; i++) h = (h * 31 + n.charCodeAt(i)) >>> 0;
  return AVATAR_PALETTE[h % AVATAR_PALETTE.length];
}

const inicial = (n: string) => n ? n.trim().charAt(0).toUpperCase() : '?';

export function Sidebar({ vistaActiva, onCambiarVista }: SidebarProps) {
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem(LS_COLLAPSED_KEY) === '1'; }
    catch { return false; }
  });
  const user = useAuthStore(s => s.user);

  useEffect(() => {
    try { localStorage.setItem(LS_COLLAPSED_KEY, collapsed ? '1' : '0'); }
    catch (e) { console.error('[Sidebar] localStorage:', e); }
  }, [collapsed]);

  const userName = user?.email?.split('@')[0] ?? 'Usuario';

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
        {collapsed ? '►' : '◄'}
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

      {/* ─── Bottom: avatar ─── */}
      <div className={styles.bottom}>
        <div className={styles.userBox}>
          <div className={styles.userAvatar} style={{ background: colorFromName(userName) }}
               title={collapsed ? `${userName} · Operador` : undefined}>
            {inicial(userName)}
          </div>
          {!collapsed && (
            <div className={styles.userInfo}>
              <div className={styles.userName}>{userName}</div>
              <div className={styles.userRole}>Operador</div>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}

export default Sidebar;