import { useContext, useEffect,useLayoutEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import styles from './AdministracionCreador.module.css';

import {PanelAdministracionContext} from './panelAdministracionContext';

/** Shared side editor. Master-data forms remain separate from the OT editor. */
export function PanelAdministracion({ titulo, onCerrar, busy = false, children,acciones,cancelarCompacto=false }: {
  titulo: string; onCerrar: () => void; busy?: boolean; children: ReactNode;acciones?:ReactNode;cancelarCompacto?:boolean;
}) {
  const destino = useContext(PanelAdministracionContext);
  const ref = useRef<HTMLElement>(null);
  const id = useId();
  useLayoutEffect(()=>{
    const panel=ref.current;if(!panel)return;
    const ajustar=()=>{const top=Math.max(0,panel.getBoundingClientRect().top);panel.style.setProperty('--panel-top',`${top}px`)};
    ajustar();const observer=new ResizeObserver(ajustar);observer.observe(panel);
    window.addEventListener('resize',ajustar);window.addEventListener('scroll',ajustar,true);
    return()=>{observer.disconnect();window.removeEventListener('resize',ajustar);window.removeEventListener('scroll',ajustar,true)};
  },[destino]);
  useEffect(() => {
    const anterior = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>('button:not(:disabled)')?.focus();
    return () => { if (anterior?.isConnected) anterior.focus(); };
  }, []);
  if (!destino) return null;
  return createPortal(<aside className={styles.sideEditor} ref={ref} role="dialog" aria-busy={busy} aria-labelledby={id}
    onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); if (!busy) onCerrar(); } }}>
    <header className={styles.editorHeader}><h3 id={id}>{titulo}</h3><button type="button" disabled={busy} aria-label={`Cerrar ${titulo}`} onClick={onCerrar}>✕</button></header>
    <div className={styles.editorBody}>{children}</div>
    <footer className={styles.editorFooter}><button className={styles.secondaryButton} type="button" aria-label={cancelarCompacto?'Cancelar':undefined} title={cancelarCompacto?'Cancelar':undefined} disabled={busy} onClick={onCerrar}>{cancelarCompacto?'✕':acciones?'Cancelar':'Cerrar ficha'}</button>{acciones}</footer>
  </aside>, destino);
}
