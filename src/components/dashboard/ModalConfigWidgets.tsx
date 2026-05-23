// src/components/dashboard/ModalConfigWidgets.tsx
import { useState, useRef, useEffect, useCallback } from 'react';
import type { WidgetConfig } from '../../services/dashboardConfigService';
import styles from './ModalConfigWidgets.module.css';

interface Props {
  widgets: WidgetConfig[];
  onSave: (widgets: WidgetConfig[]) => void;
  onClose: () => void;
}

export function ModalConfigWidgets({ widgets, onSave, onClose }: Props) {
  const [local, setLocal] = useState<WidgetConfig[]>(
    [...widgets].sort((a, b) => a.orden - b.orden),
  );
  const panelRef = useRef<HTMLDivElement>(null);

  // Cerrar al hacer clic fuera
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const toggle = useCallback((id: string) => {
    setLocal(prev => prev.map(w => w.id === id ? { ...w, visible: !w.visible } : w));
  }, []);

  const move = useCallback((id: string, dir: -1 | 1) => {
    setLocal(prev => {
      const arr = [...prev].sort((a, b) => a.orden - b.orden);
      const idx = arr.findIndex(w => w.id === id);
      const next = idx + dir;
      if (next < 0 || next >= arr.length) return prev;
      [arr[idx], arr[next]] = [arr[next], arr[idx]];
      return arr.map((w, i) => ({ ...w, orden: i }));
    });
  }, []);

  const handleSave = () => {
    onSave(local);
    onClose();
  };

  return (
    <div ref={panelRef} className={styles.panel}>

      <div className={styles.header}>
        <span className={styles.title}>Configurar widgets</span>
      </div>

      <div className={styles.body}>
        {local.map((w, idx) => (
          <div
            key={w.id}
            className={`${styles.row} ${!w.visible ? styles.rowHidden : ''}`}
          >
            <div className={styles.rowLeft}>
              <button
                type="button"
                className={`${styles.toggle} ${w.visible ? styles.toggleOn : ''}`}
                onClick={() => toggle(w.id)}
                title={w.visible ? 'Ocultar' : 'Mostrar'}
              >
                {w.visible ? '✓' : '○'}
              </button>
              <span className={styles.label}>{w.label}</span>
            </div>

            <div className={styles.rowRight}>
              <button
                type="button"
                className={styles.arrow}
                onClick={() => move(w.id, -1)}
                disabled={idx === 0}
                title="Subir"
              >▲</button>
              <button
                type="button"
                className={styles.arrow}
                onClick={() => move(w.id, 1)}
                disabled={idx === local.length - 1}
                title="Bajar"
              >▼</button>
            </div>
          </div>
        ))}
      </div>

      <div className={styles.footer}>
        <button type="button" className={styles.btnCancel} onClick={onClose}>
          Cancelar
        </button>
        <button type="button" className={styles.btnSave} onClick={handleSave}>
          Guardar
        </button>
      </div>
    </div>
  );
}

export default ModalConfigWidgets;