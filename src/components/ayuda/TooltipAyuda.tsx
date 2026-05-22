import { useState, useRef, useEffect } from 'react';
import styles from './TooltipAyuda.module.css';

type Posicion = 'top' | 'bottom' | 'left' | 'right';

interface TooltipAyudaProps {
  /** Texto explicativo que se muestra dentro del globo */
  texto: string;
  /** Título opcional en negrita arriba del texto */
  titulo?: string;
  /** Lado donde aparece el globo respecto al icono. Default: 'top' */
  posicion?: Posicion;
  /** Tamaño del icono en px. Default: 16 */
  size?: number;
}

/**
 * Reusable contextual help tooltip.
 * Renders a small "?" badge. Opens on hover (desktop) and on click (touch).
 * Closes on outside click or Escape. Purely presentational, no store deps.
 */
export default function TooltipAyuda({
  texto,
  titulo,
  posicion = 'top',
  size = 16,
}: TooltipAyudaProps) {
  const [abierto, setAbierto] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!abierto) return;

    const onClickFuera = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setAbierto(false);
      }
    };
    const onEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAbierto(false);
    };

    document.addEventListener('mousedown', onClickFuera);
    document.addEventListener('keydown', onEscape);
    return () => {
      document.removeEventListener('mousedown', onClickFuera);
      document.removeEventListener('keydown', onEscape);
    };
  }, [abierto]);

  return (
    <span
      ref={ref}
      className={styles.wrapper}
      onMouseEnter={() => setAbierto(true)}
      onMouseLeave={() => setAbierto(false)}
    >
      <button
        type="button"
        className={styles.icono}
        style={{ width: size, height: size, fontSize: size * 0.7 }}
        aria-label={titulo || 'Ayuda'}
        onClick={(e) => {
          e.stopPropagation();
          setAbierto((v) => !v);
        }}
      >
        ?
      </button>

      {abierto && (
        <span className={`${styles.globo} ${styles[posicion]}`} role="tooltip">
          {titulo && <span className={styles.globoTitulo}>{titulo}</span>}
          <span className={styles.globoTexto}>{texto}</span>
        </span>
      )}
    </span>
  );
}