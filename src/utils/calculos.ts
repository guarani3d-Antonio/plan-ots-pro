export function diasAbierto(fechaIngreso?: string, fechaFin?: string): number {
  const inicio = fechaIngreso ? new Date(fechaIngreso) : new Date()
  const fin = fechaFin ? new Date(fechaFin) : new Date()
  return Math.max(0, Math.floor((fin.getTime() - inicio.getTime()) / 86400000))
}

export function formatearGuaranies(valor?: number | null): string {
  if (valor == null) return ''
  return valor.toLocaleString('es-PY') + ' Gs.'
}

export function parsearGuaranies(texto: string): number {
  return parseInt(texto.replace(/\D/g, ''), 10) || 0
}

export const EMOJIS_RUBRO: Record<string, string> = {
  // ── Ya existían ──
  'Impermeabilización': '💧',
  'Eléctrica':          '⚡',
  'Plomería':           '🔧',
  'Aire Acondicionado': '❄️',
  'Vidrios':            '🪟',
  'Herrería':           '🚪',
  'Pintura':            '🎨',
  // ── Imagen 1 ──
  'Albañilería':        '🧱',
  'Carpintería':        '🪚',
  'Jardinería':         '🌿',
  'Limpieza':           '🧹',
  'Seguridad':          '🔒',
  'Ascensores':         '🛗',
  'Gas':                '🔥',
  'Red contra incendio':'🚒',
  // ── Imagen 2 ──
  'Aislación':          '🧊',
  'PCI':                '🧯',
  'Climatización':      '🌡️',
  'Sanitarios':         '🚿',
  'Estructura':         '🏗️',
  'Revestimientos':     '🪵',
}

export function emojiRubro(rubro?: string | null): string {
  if (!rubro) return '📌'
  return EMOJIS_RUBRO[rubro] ?? '📌'
}

export const COLOR_ESTADO: Record<string, string> = {
  'Pendiente': '#EF4444',
  'En proceso': '#3B82F6',
  'Cerrada': '#22C55E',
  'No aplica': '#6B7280',
}

export function colorEstado(estado?: string | null): string {
  return COLOR_ESTADO[estado ?? ''] ?? '#6B7280'
}
