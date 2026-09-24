// src/components/dashboard/ModalConfigWidgets.tsx
import { useState, useRef, useEffect, useCallback } from 'react';
import type { WidgetConfig, UsuarioDashboard } from '../../services/dashboardConfigService';
import styles from './ModalConfigWidgets.module.css';

interface Props {
  widgets: WidgetConfig[];
  onSave: (widgets: WidgetConfig[]) => Promise<void> | void;
  onClose: () => void;
  usuarios?: UsuarioDashboard[];
  usuarioId?: string;
  onUsuarioChange?: (id: string) => void;
  loading?: boolean;
}

export function ModalConfigWidgets({ widgets, onSave, onClose, usuarios, usuarioId, onUsuarioChange, loading = false }: Props) {
  const [local, setLocal] = useState<WidgetConfig[]>(
    [...widgets].sort((a, b) => a.orden - b.orden),
  );
  const panelRef = useRef<HTMLDivElement>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

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

  const handleSave = async () => {
    setSaving(true); setError('');
    try { await onSave(local); onClose(); }
    catch (err) { setError(err instanceof Error ? err.message : 'No se pudo guardar'); }
    finally { setSaving(false); }
  };

  return (
    <div ref={panelRef} className={styles.panel}>

      <div className={styles.header}>
        <span className={styles.title}>Indicadores visibles por usuario</span>
        {usuarios && <select aria-label="Usuario cuyos indicadores se configuran" value={usuarioId} onChange={e => onUsuarioChange?.(e.target.value)} style={{ width: '100%', marginTop: 8, padding: 8 }}>
          {usuarios.map(u => <option key={u.user_id} value={u.user_id}>{u.nombre} · {u.email}</option>)}
        </select>}
      </div>

      <div className={styles.body} aria-busy={loading}>
        {loading && <p style={{ padding: '0 14px' }}>Cargando indicadores…</p>}
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
                disabled={loading}
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
                disabled={loading || idx === 0}
                title="Subir"
              >▲</button>
              <button
                type="button"
                className={styles.arrow}
                onClick={() => move(w.id, 1)}
                disabled={loading || idx === local.length - 1}
                title="Bajar"
              >▼</button>
            </div>
          </div>
        ))}
      </div>

      <div className={styles.footer}>
        {error && <span role="alert">{error}</span>}
        <button type="button" className={styles.btnCancel} onClick={onClose}>
          Cancelar
        </button>
        <button type="button" className={styles.btnSave} onClick={() => void handleSave()} disabled={saving || loading}>
          {saving ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </div>
  );
}

export default ModalConfigWidgets;
