import { useState, useRef, useEffect } from 'react';
import styles from './MultiSelectRubro.module.css';

interface MultiSelectRubroProps {
  opciones: string[];
  seleccionados: string[];
  onChange: (vals: string[]) => void;
  emojiMap?: (rubro: string) => string;
}

/**
 * Dropdown multi-select con el mismo look que un <select> nativo.
 * Al abrirse muestra la lista completa con checkboxes y emojis.
 * Cierra al hacer clic fuera o al presionar Escape.
 */
export default function MultiSelectRubro({
  opciones,
  seleccionados,
  onChange,
  emojiMap,
}: MultiSelectRubroProps) {
  const [abierto, setAbierto] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierto) return;
    const onClickFuera = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
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

  const toggle = (opcion: string) => {
    const nuevo = seleccionados.includes(opcion)
      ? seleccionados.filter(x => x !== opcion)
      : [...seleccionados, opcion];
    onChange(nuevo);
  };

  const etiqueta = () => {
    if (seleccionados.length === 0) return '— Seleccionar —';
    if (seleccionados.length === 1) {
      const r = seleccionados[0];
      return `${emojiMap ? emojiMap(r) : ''} ${r}`.trim();
    }
    if (seleccionados.length === 2) {
      return seleccionados
        .map(r => `${emojiMap ? emojiMap(r) : ''} ${r}`.trim())
        .join(', ');
    }
    return `${seleccionados.length} rubros seleccionados`;
  };

  return (
    <div ref={wrapRef} className={styles.wrap}>
      {/* Trigger — mismo look que <select> */}
      <button
        type="button"
        className={`${styles.trigger} ${abierto ? styles.triggerOpen : ''}`}
        onClick={() => setAbierto(v => !v)}
      >
        <span className={styles.triggerLabel}>{etiqueta()}</span>
        <span className={styles.chevron}>{abierto ? '▲' : '▼'}</span>
      </button>

      {/* Dropdown */}
      {abierto && (
        <div className={styles.dropdown}>
          {opciones.length === 0 ? (
            <div className={styles.vacio}>Sin opciones disponibles</div>
          ) : (
            opciones.map(op => {
              const sel = seleccionados.includes(op);
              return (
                <button
                  key={op}
                  type="button"
                  className={`${styles.opcion} ${sel ? styles.opcionSel : ''}`}
                  onClick={() => toggle(op)}
                >
                  <span className={styles.check}>{sel ? '✓' : ''}</span>
                  <span className={styles.opcionEmoji}>
                    {emojiMap ? emojiMap(op) : ''}
                  </span>
                  <span className={styles.opcionNombre}>{op}</span>
                </button>
              );
            })
          )}
          {seleccionados.length > 0 && (
            <button
              type="button"
              className={styles.btnLimpiar}
              onClick={() => onChange([])}
            >
              ✕ Limpiar selección
            </button>
          )}
        </div>
      )}
    </div>
  );
}