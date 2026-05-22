import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import styles from './TooltipAyuda.module.css';

type Posicion = 'top' | 'bottom' | 'left' | 'right';

interface TooltipAyudaProps {
  texto: string;
  titulo?: string;
  /** Aceptado por compatibilidad; el posicionamiento ahora es automático con clamp al viewport. */
  posicion?: Posicion;
  size?: number;
}

/**
 * Reusable contextual help tooltip.
 * Renders a "?" badge. The bubble is portaled to document.body and positioned
 * with fixed coordinates clamped to the viewport, so it is never clipped by a
 * scroll container or a transformed ancestor (e.g. the sliding PanelOT panel).
 */
export default function TooltipAyuda({ texto, titulo, size = 16 }: TooltipAyudaProps) {
  const [abierto, setAbierto] = useState(false);
  const iconRef = useRef<HTMLButtonElement>(null);
  const globoRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);

  // Posiciona el globo: arriba del icono si entra, si no abajo; centrado
  // horizontalmente y clampeado a los bordes del viewport.
  useLayoutEffect(() => {
    if (!abierto) { setCoords(null); return; }
    const calc = () => {
      const icon = iconRef.current?.getBoundingClientRect();
      if (!icon) return;
      const gw = globoRef.current?.offsetWidth ?? 240;
      const gh = globoRef.current?.offsetHeight ?? 80;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const M = 8;
      let left = icon.left + icon.width / 2 - gw / 2;
      left = Math.max(M, Math.min(left, vw - gw - M));
      let top = icon.top - gh - 8;
      if (top < M) top = icon.bottom + 8;
      top = Math.min(top, vh - gh - M);
      setCoords({ top, left });
    };
    calc();
    window.addEventListener('resize', calc);
    window.addEventListener('scroll', calc, true);
    return () => {
      window.removeEventListener('resize', calc);
      window.removeEventListener('scroll', calc, true);
    };
  }, [abierto]);

  // Cerrar al click fuera o Escape.
  useEffect(() => {
    if (!abierto) return;
    const onClickFuera = (e: MouseEvent) => {
      const t = e.target as Node;
      if (
        iconRef.current && !iconRef.current.contains(t) &&
        globoRef.current && !globoRef.current.contains(t)
      ) setAbierto(false);
    };
    const onEscape = (e: KeyboardEvent) => { if (e.key === 'Escape') setAbierto(false); };
    document.addEventListener('mousedown', onClickFuera);
    document.addEventListener('keydown', onEscape);
    return () => {
      document.removeEventListener('mousedown', onClickFuera);
      document.removeEventListener('keydown', onEscape);
    };
  }, [abierto]);

  return (
    <span
      className={styles.wrapper}
      onMouseEnter={() => setAbierto(true)}
      onMouseLeave={() => setAbierto(false)}
    >
      <button
        ref={iconRef}
        type="button"
        className={styles.icono}
        style={{ width: size, height: size, fontSize: size * 0.7 }}
        aria-label={titulo || 'Ayuda'}
        onClick={(e) => { e.stopPropagation(); setAbierto(v => !v); }}
      >
        ?
      </button>

      {abierto && createPortal(
        <div
          ref={globoRef}
          className={styles.globo}
          role="tooltip"
          style={{
            position: 'fixed',
            top: coords?.top ?? -9999,
            left: coords?.left ?? -9999,
            visibility: coords ? 'visible' : 'hidden',
          }}
        >
          {titulo && <span className={styles.globoTitulo}>{titulo}</span>}
          <span className={styles.globoTexto}>{texto}</span>
        </div>,
        document.body
      )}
    </span>
  );
}