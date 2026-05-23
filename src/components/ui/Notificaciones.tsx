import { useEffect, useState, useRef, useCallback } from 'react';
import { supabase } from '../../db/supabase';
import { useProyectosStore } from '../../stores/proyectosStore';
import styles from './Notificaciones.module.css';

// ─── Tipos ───────────────────────────────────────────────────────────────────

interface Notificacion {
  id: string;
  ordenId: string;
  otCode: string;
  campo: string;
  valorAnterior: string;
  valorNuevo: string;
  timestamp: Date;
  leida: boolean;
}

interface NotificacionesProps {
  collapsed: boolean;
}

// ─── Constantes ──────────────────────────────────────────────────────────────

const MAX_NOTIFS = 30;

const CAMPOS_WATCH = ['estado', 'responsable', 'prioridad', 'rubro'] as const;

const CAMPO_LABELS: Record<string, string> = {
  estado:       'Estado',
  responsable:  'Responsable',
  prioridad:    'Prioridad',
  rubro:        'Rubro',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function detectarCambio(
  oldRec: Record<string, unknown>,
  newRec: Record<string, unknown>,
): { campo: string; anterior: string; nuevo: string } | null {
  for (const campo of CAMPOS_WATCH) {
    if (oldRec[campo] !== newRec[campo]) {
      return {
        campo,
        anterior: String(oldRec[campo] ?? '—'),
        nuevo:    String(newRec[campo] ?? '—'),
      };
    }
  }
  return null;
}

function timeAgo(date: Date): string {
  const diff = (Date.now() - date.getTime()) / 1000;
  if (diff < 60)    return 'ahora';
  if (diff < 3600)  return `hace ${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `hace ${Math.floor(diff / 3600)}h`;
  return date.toLocaleDateString('es-PY', { day: '2-digit', month: '2-digit' });
}

// ─── Componente ──────────────────────────────────────────────────────────────

export function Notificaciones({ collapsed }: NotificacionesProps) {
  const [notifs, setNotifs]   = useState<Notificacion[]>([]);
  const [open, setOpen]       = useState(false);
  const panelRef              = useRef<HTMLDivElement>(null);
  const btnRef                = useRef<HTMLButtonElement>(null);
  const channelRef            = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const proyectoActivo = useProyectosStore(s => s.proyectoActivo);
  const unreadCount    = notifs.filter(n => !n.leida).length;

  // ── Suscripción Realtime ──────────────────────────────────────────────────
  useEffect(() => {
    // Limpiar canal anterior
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    if (!proyectoActivo?.id) return;

    const channel = supabase
      .channel(`notif-ordenes-${proyectoActivo.id}`)
      .on(
        'postgres_changes',
        {
          event:  'UPDATE',
          schema: 'public',
          table:  'ordenes',
          filter: `proyecto_id=eq.${proyectoActivo.id}`,
        },
        (payload) => {
          const oldRec = (payload.old ?? {}) as Record<string, unknown>;
          const newRec = (payload.new ?? {}) as Record<string, unknown>;

          const cambio = detectarCambio(oldRec, newRec);
          if (!cambio) return; // nada relevante cambió

          const notif: Notificacion = {
            id:            `${Date.now()}-${Math.random().toString(36).slice(2)}`,
            ordenId:       String(newRec.id ?? ''),
            otCode:        String(newRec.ot ?? newRec.id ?? '?'),
            campo:         cambio.campo,
            valorAnterior: cambio.anterior,
            valorNuevo:    cambio.nuevo,
            timestamp:     new Date(),
            leida:         false,
          };

          setNotifs(prev => [notif, ...prev].slice(0, MAX_NOTIFS));
        },
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
    };
  }, [proyectoActivo?.id]);

  // ── Cerrar panel al hacer clic fuera ─────────────────────────────────────
  useEffect(() => {
    if (!open) return;

    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      const outsidePanel = panelRef.current && !panelRef.current.contains(target);
      const outsideBtn   = btnRef.current   && !btnRef.current.contains(target);
      if (outsidePanel && outsideBtn) setOpen(false);
    };

    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // ── Acciones ─────────────────────────────────────────────────────────────
  const markAllRead = useCallback(() => {
    setNotifs(prev => prev.map(n => ({ ...n, leida: true })));
  }, []);

  const clearAll = useCallback(() => {
    setNotifs([]);
    setOpen(false);
  }, []);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className={styles.wrapper}>

      {/* Botón campanita */}
      <button
        ref={btnRef}
        type="button"
        className={`${styles.bellBtn} ${open ? styles.bellBtnActive : ''}`}
        onClick={() => setOpen(o => !o)}
        title={collapsed
          ? `Notificaciones${unreadCount ? ` (${unreadCount})` : ''}`
          : undefined}
        aria-label="Notificaciones"
      >
        <span className={styles.bellIcon}>🔔</span>
        {!collapsed && (
          <span className={styles.bellLabel}>Notificaciones</span>
        )}
        {unreadCount > 0 && (
          <span className={styles.badge} aria-label={`${unreadCount} sin leer`}>
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Panel dropdown */}
      {open && (
        <div
          ref={panelRef}
          className={`${styles.panel} ${collapsed ? styles.panelCollapsed : ''}`}
          role="dialog"
          aria-label="Panel de notificaciones"
        >
          {/* Header */}
          <div className={styles.panelHeader}>
            <span className={styles.panelTitle}>Notificaciones</span>
            {unreadCount > 0 && (
              <button
                type="button"
                className={styles.markAllBtn}
                onClick={markAllRead}
              >
                Marcar leídas
              </button>
            )}
          </div>

          {/* Lista */}
          <div className={styles.panelBody}>
            {notifs.length === 0 ? (
              <div className={styles.empty}>
                <span className={styles.emptyIcon}>🔔</span>
                <span className={styles.emptyTitle}>Sin notificaciones</span>
                <span className={styles.emptyHint}>
                  Los cambios en OTs del proyecto activo aparecen aquí en tiempo real
                </span>
              </div>
            ) : (
              notifs.map(n => (
                <div
                  key={n.id}
                  className={`${styles.notifItem} ${n.leida ? styles.notifLeida : ''}`}
                >
                  <div className={styles.notifDot} />
                  <div className={styles.notifContent}>
                    <div className={styles.notifTop}>
                      <span className={styles.notifOt}>OT {n.otCode}</span>
                      <span className={styles.notifTime}>{timeAgo(n.timestamp)}</span>
                    </div>
                    <div className={styles.notifBody}>
                      <span className={styles.notifCampo}>
                        {CAMPO_LABELS[n.campo] ?? n.campo}
                      </span>
                      {' cambió: '}
                      <span className={styles.notifAnterior}>{n.valorAnterior}</span>
                      <span className={styles.notifArrow}> → </span>
                      <span className={styles.notifNuevo}>{n.valorNuevo}</span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          {notifs.length > 0 && (
            <div className={styles.panelFooter}>
              <button type="button" className={styles.clearBtn} onClick={clearAll}>
                Limpiar historial
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default Notificaciones;