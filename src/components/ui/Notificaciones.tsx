import { useEffect, useState, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../db/supabase';
import { useAccessStore } from '../../stores/accessStore';
import { ORDEN_SELECT, rowToOrden } from '../../data/ordenMapper';
import { assertSession, sessionTicket } from '../../security/sessionScope';
import { cargarEventos, marcarEventosLeidos, tituloEvento, type EventoOT } from '../../services/trustService';
import { HistorialComentarios } from '../plano/HistorialComentarios';
import { ModalDetalleOT } from '../grilla/ModalDetalleOT';
import type { OrdenLocal } from '../../types/orden';
import styles from './Notificaciones.module.css';

export function Notificaciones({ collapsed }: { collapsed: boolean }) {
  const disponible = useAccessStore(s => s.disponible);
  const [notifs, setNotifs] = useState<EventoOT[]>([]);
  const [open, setOpen] = useState(false);
  const [sinLeer, setSinLeer] = useState(0);
  const [hayMas, setHayMas] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<EventoOT | null>(null);
  const [orden, setOrden] = useState<OrdenLocal | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const request = useRef(0);
  const panelRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const refresh = useCallback(async () => {
    if (!useAccessStore.getState().disponible) return;
    const sequence = ++request.current;
    try {
      const p = await cargarEventos();
      if (sequence === request.current) { setNotifs(p.eventos); setSinLeer(p.sinLeer); setHayMas(p.hayMas); setError(null); }
    } catch (e) {
      if (sequence === request.current) { setNotifs([]); setSinLeer(0); setSelected(null); setOrden(null); setError(e instanceof Error ? e.message : 'No se pudieron consultar las notificaciones.'); }
    }
  }, []);
  useEffect(() => {
    if (!disponible) return;
    const initial = window.setTimeout(() => void refresh(), 0);
    const reload = () => { if (document.visibilityState !== 'hidden' && !busyRef.current) void refresh(); };
    const timer = window.setInterval(reload, 60_000);
    window.addEventListener('online', reload); window.addEventListener('focus', reload);
    return () => { window.clearTimeout(initial); request.current++; window.clearInterval(timer); window.removeEventListener('online', reload); window.removeEventListener('focus', reload); };
  }, [disponible, refresh]);
  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => {
      const node = e.target as Node;
      if (!panelRef.current?.contains(node) && !btnRef.current?.contains(node)) setOpen(false);
    };
    const escape = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', outside); document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); };
  }, [open]);
  const action = async (fn: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true);
    try { await fn(); }
    catch (e) { setError(e instanceof Error ? e.message : 'No se pudo completar la operación.'); }
    finally { busyRef.current = false; setBusy(false); }
  };
  const ver = (n: EventoOT) => action(async () => {
    await marcarEventosLeidos([n.id]); setSelected(n); setOrden(null); setOpen(false); await refresh();
  });
  const verOrden = () => action(async () => {
    if (!selected) return;
    const ticket = sessionTicket();
    const { data, error: err } = await supabase.from('ordenes').select(ORDEN_SELECT).eq('id', selected.orden_id).is('deleted_at', null).maybeSingle();
    assertSession(ticket);
    if (err) throw new Error(err.message);
    if (!data) throw new Error('La OT fue eliminada o ya no tenés acceso. El historial disponible se conserva.');
    setOrden(rowToOrden(data)); setSelected(null); setError(null);
  });
  const mas = () => action(async () => {
    const p = await cargarEventos(undefined, notifs.at(-1));
    setNotifs(prev => [...prev, ...p.eventos.filter(n => !prev.some(v => v.id === n.id))]); setHayMas(p.hayMas); setSinLeer(p.sinLeer);
  });
  return <>
    <div className={styles.wrapper}>
      <button ref={btnRef} type="button" className={`${styles.bellBtn} ${collapsed ? styles.bellBtnCollapsed : ''}`} aria-label="Notificaciones" aria-expanded={open}
        onClick={() => { setOpen(v => !v); if (!open) void refresh(); }}>
        <span className={styles.bellIcon}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 8.5h18C21 16 18 16 18 9ZM10 21h4" /></svg></span>{!collapsed && <span className={styles.bellLabel}>Notificaciones</span>}
        {disponible && sinLeer > 0 && <span className={styles.badge}>{sinLeer > 99 ? '99+' : sinLeer}</span>}
      </button>
      {open && <div ref={panelRef} className={`${styles.panel} ${collapsed ? styles.panelCollapsed : ''}`} role="dialog" aria-label="Notificaciones">
        <div className={styles.panelHeader}><span className={styles.panelTitle}>Notificaciones</span>
          <button type="button" className={styles.markAllBtn} disabled={busy || !disponible || !notifs.some(n => !n.leida)}
            onClick={() => action(async () => { await marcarEventosLeidos(notifs.filter(n => !n.leida).map(n => n.id)); await refresh(); })}>Marcar visibles leídas</button>
        </div>
        <div className={styles.panelBody}>
          {error && <p role="alert">{error}</p>}
          {!disponible ? <p>Esperando validación de permisos.</p> : notifs.length === 0 ? <p className={styles.empty}>Sin actividad nueva disponible.</p> : notifs.map(n =>
            <button type="button" key={n.id} disabled={busy} className={`${styles.notifItem} ${styles.eventButton} ${n.leida ? styles.notifLeida : ''}`} onClick={() => ver(n)}>
              <span className={styles.notifDot} /><span className={styles.notifContent}>
                <span className={styles.notifOt}>{n.ot} · {tituloEvento(n)}</span>
                <span className={styles.notifBody}>{n.actor_email ?? 'Sistema'}</span>
                <time className={styles.notifTime} dateTime={n.created_at}>{new Date(n.created_at).toLocaleString('es-PY')}</time>
              </span>
            </button>)}
          {disponible && hayMas && <button disabled={busy} onClick={mas}>Ver anteriores</button>}
        </div>
        <div className={styles.panelFooter}><button className={styles.clearBtn} onClick={() => void refresh()}>Actualizar</button><span>Se actualiza al volver y cada minuto.</span></div>
      </div>}
    </div>
    {selected && disponible && createPortal(<div className={styles.historyBackdrop}>
      <section className={styles.historyDialog} role="dialog" aria-modal="true" aria-label={`Actividad de ${selected.ot}`}>
        <header><strong>{selected.ot} · Historial</strong><button onClick={() => { setSelected(null); setError(null); }}>Cerrar</button><button disabled={busy} onClick={verOrden}>Ver OT</button></header>
        {error && <p role="alert">{error}</p>}
        <HistorialComentarios key={selected.orden_id} ordenId={selected.orden_id} proyectoId={selected.proyecto_id} />
      </section>
    </div>, document.body)}
    {orden && disponible && createPortal(<ModalDetalleOT orden={orden} proyectoId={orden.proyecto_id} onClose={() => setOrden(null)} onGuardado={() => void refresh()} />, document.body)}
  </>;
}
export default Notificaciones;
