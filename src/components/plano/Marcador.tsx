import type { OrdenLocal } from '../../types/orden'
import { emojiRubro, colorEstado } from '../../utils/calculos'
import styles from './Marcador.module.css'

interface MarcadorProps {
  orden: OrdenLocal
  isSelected: boolean
  onClick: () => void
}

export default function Marcador({ orden, isSelected, onClick }: MarcadorProps) {
  // OTs sin ubicar no se renderizan en el plano
  if (orden.pos_x == null || orden.pos_y == null) return null

  const emoji = emojiRubro(orden.rubro)
  const color = colorEstado(orden.estado)
  const tooltip = `${orden.ot ?? 'Sin código'} · ${orden.rubro ?? 'Sin rubro'} · ${orden.estado}`

  return (
    <div
      className={`${styles.wrapper} ${isSelected ? styles.selected : ''}`}
      style={{
        left: `${orden.pos_x * 100}%`,
        top: `${orden.pos_y * 100}%`,
      }}
      // data-marcador: usado por VistaPlano para que pan/click del plano
      // ignoren cualquier evento que provenga de un marcador.
      data-marcador="true"
      // Drag-to-move: el dataTransfer "text/ot-move" lo diferencia del
      // "text/ot-id" que viene del ToolPanel (placement de OTs sin ubicar).
      draggable={true}
      onDragStart={(e) => {
        e.stopPropagation()
        e.dataTransfer.setData('text/ot-move', orden.id)
        e.dataTransfer.effectAllowed = 'move'
      }}
      onDragEnd={(e) => e.stopPropagation()}
      onClick={(e) => {
        // stopPropagation evita que el click suba al .planArea y dispare
        // creación de OT nueva. preventDefault por defensa adicional contra
        // comportamientos default del navegador en draggables.
        e.stopPropagation()
        e.preventDefault()
        onClick()
      }}
      title={tooltip}
    >
      <div
        className={styles.pin}
        style={{ background: color }}
      >
        <span className={styles.pinEmoji}>{emoji}</span>
      </div>
      <div className={styles.shadow} />
    </div>
  )
}
