import {useEffect, useRef, type ReactNode} from 'react';
import s from './PortalReclamos.module.css';
export function PortalDialog({title, onClose, children}: {title: string; onClose: () => void; children: ReactNode}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {const dialog = ref.current; dialog?.showModal(); return () => {dialog?.close();};}, []);
  return <dialog ref={ref} className={`${s.root} ${s.dialog}`} onCancel={e => {e.preventDefault(); onClose();}}><header className={s.dialogHeader}><h2>{title}</h2><button type="button" aria-label="Cerrar" onClick={onClose}>×</button></header><div className={s.dialogBody}>{children}</div></dialog>;
}
