import { useEffect, useState } from 'react'

interface ToastProps {
  mensaje: string
  tipo?: 'success' | 'error' | 'info'
  duracion?: number
  onClose: () => void
}

export function Toast({ mensaje, tipo = 'success', duracion = 3000, onClose }: ToastProps) {
  useEffect(() => {
    const t = setTimeout(onClose, duracion)
    return () => clearTimeout(t)
  }, [duracion, onClose])

  const colores = {
    success: { bg: '#F0FDF4', border: '#86EFAC', text: '#166534', icon: '✓' },
    error:   { bg: '#FEF2F2', border: '#FECACA', text: '#DC2626', icon: '✕' },
    info:    { bg: '#EFF6FF', border: '#BFDBFE', text: '#1D4ED8', icon: 'ℹ' },
  }
  const c = colores[tipo]

  return (
    <div style={{
      position:   'fixed',
      bottom:     24,
      right:      24,
      zIndex:     9999,
      background: c.bg,
      border:     `1px solid ${c.border}`,
      color:      c.text,
      borderRadius: 10,
      padding:    '12px 18px',
      display:    'flex',
      alignItems: 'center',
      gap:        10,
      boxShadow:  '0 4px 16px rgba(0,0,0,0.12)',
      fontSize:   14,
      fontWeight: 500,
      animation:  'slideUp 200ms ease',
      maxWidth:   360,
    }}>
      <span style={{ fontWeight: 700, fontSize: 16 }}>{c.icon}</span>
      <span style={{ flex: 1 }}>{mensaje}</span>
      <button onClick={onClose} style={{
        marginLeft: 8,
        background: 'none',
        border:     'none',
        cursor:     'pointer',
        color:      c.text,
        opacity:    0.6,
        fontSize:   16,
        fontFamily: 'inherit',
        padding:    0,
        lineHeight: 1,
      }}>×</button>
    </div>
  )
}

/** Hook para usar el toast desde cualquier componente.
 *  Uso:
 *    const { mostrar, ToastComponent } = useToast()
 *    // ... mostrar('Versión guardada', 'success')
 *    return <>{...JSX} {ToastComponent}</>
 */
export function useToast() {
  const [toast, setToast] = useState<{
    mensaje: string;
    tipo: 'success' | 'error' | 'info';
  } | null>(null)

  const mostrar = (
    mensaje: string,
    tipo: 'success' | 'error' | 'info' = 'success',
  ) => setToast({ mensaje, tipo })

  const ToastComponent = toast ? (
    <Toast {...toast} onClose={() => setToast(null)} />
  ) : null

  return { mostrar, ToastComponent }
}
