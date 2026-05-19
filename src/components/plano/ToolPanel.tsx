import { useState, useEffect } from 'react'
import type { OrdenLocal } from '../../types/orden'
import { emojiRubro, colorEstado } from '../../utils/calculos'
import styles from './ToolPanel.module.css'

interface ToolPanelProps {
  ordenessinUbicar: OrdenLocal[]
}

export default function ToolPanel({ ordenessinUbicar }: ToolPanelProps) {
  const [collapsed, setCollapsed] = useState(false)

  // Si llegan OTs sin ubicar (p.ej. tras importar CSV) y el panel estaba
  // colapsado, lo reabrimos automáticamente para que el usuario las vea.
  useEffect(() => {
    if (ordenessinUbicar.length > 0) setCollapsed(false)
  }, [ordenessinUbicar.length])

  // Early return DESPUÉS de los hooks (React requiere orden estable).
  // Sin OTs sin ubicar el panel no aporta valor — las acciones globales
  // (exportar, importar, versionar) viven en la topBar.
  if (ordenessinUbicar.length === 0) return null

  function handleDragStart(e: React.DragEvent, ordenId: string) {
    e.dataTransfer.setData('text/ot-id', ordenId)
    e.dataTransfer.effectAllowed = 'move'
  }

  return (
    <div
      className={`${styles.panel} ${collapsed ? styles.collapsed : ''}`}
      style={{ position: 'relative' }}
    >
      <button
        className={styles.toggleBtn}
        onClick={() => setCollapsed(c => !c)}
        title={collapsed ? 'Expandir panel' : 'Colapsar panel'}
      >
        {collapsed ? '►' : '◄'}
      </button>

      {!collapsed && (
        <div className={styles.panelInner}>
          {/* SIN UBICAR — única sección del panel */}
          <div className={styles.section}>
            <div className={styles.sectionTitle}>
              <span>📋 Sin ubicar</span>
              <span className={styles.badge}>{ordenessinUbicar.length}</span>
            </div>
            {ordenessinUbicar.map(orden => (
              <div
                key={orden.id}
                className={styles.otCard}
                draggable
                onDragStart={e => handleDragStart(e, orden.id)}
              >
                <span className={styles.otEmoji}>
                  {emojiRubro(orden.rubro)}
                </span>
                <span className={styles.otCode}>
                  {orden.ot || 'Sin código'}
                </span>
                <span
                  className={styles.otDot}
                  style={{ background: colorEstado(orden.estado) }}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
