import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import styles from './MenuAccionesProyecto.module.css';

/** Fuera del flujo de las tarjetas y del recorte de sus contenedores. */
export function MenuAccionesProyecto({ anchor, onClose, children, id, label }: {
  anchor: HTMLElement; onClose: () => void; children: ReactNode; id: string; label: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const menu = ref.current;
    if (!menu) return;
    const rect = anchor.getBoundingClientRect();
    const width = menu.offsetWidth;
    const height = menu.offsetHeight;
    const margin = 8;
    const below = rect.bottom + 5;
    const top = below + height <= window.innerHeight - margin ? below : rect.top - height - 5;
    menu.style.left = `${Math.max(margin, Math.min(rect.right - width, window.innerWidth - width - margin))}px`;
    menu.style.top = `${Math.max(margin, Math.min(top, window.innerHeight - height - margin))}px`;
    menu.style.visibility = 'visible';
    menu.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus({ preventScroll: true });
  }, [anchor]);

  useLayoutEffect(() => {
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !ref.current?.contains(event.target) && !anchor.contains(event.target)) onClose();
    };
    const scroll = (event: Event) => {
      if (event.target instanceof Node && ref.current?.contains(event.target)) return;
      onClose();
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('scroll', scroll, true);
    window.addEventListener('resize', onClose);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('scroll', scroll, true);
      window.removeEventListener('resize', onClose);
    };
  }, [anchor, onClose]);

  return createPortal(<div id={id} ref={ref} className={styles.menu} role="menu" aria-label={label}
    onClick={event => event.stopPropagation()}
    onKeyDown={event => {
      if (event.key === 'Escape' || event.key === 'Tab') {
        onClose();
        if (event.key === 'Escape') { event.preventDefault(); anchor.focus({ preventScroll: true }); }
        return;
      }
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const buttons = Array.from(ref.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []);
      if (!buttons.length) return;
      const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1
        : (index + (event.key === 'ArrowUp' ? -1 : 1) + buttons.length) % buttons.length;
      buttons[next].focus();
    }}>{children}</div>, document.body);
}
