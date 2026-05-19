// src/constants/estados.ts

export type EstadoOT = 'Pendiente' | 'En proceso' | 'Cerrada' | 'No aplica'

// Valor DB → label display (aquí son casi iguales salvo 'Cerrada' → 'Cerrado')
export const ESTADO_LABEL: Record<EstadoOT, string> = {
  'Pendiente':  'Pendiente',
  'En proceso': 'En proceso',
  'Cerrada':    'Cerrado',
  'No aplica':  'No aplica',
}

export const ESTADO_COLOR: Record<EstadoOT, string> = {
  'Pendiente':  '#E53E3E',
  'En proceso': '#3B82F6',
  'Cerrada':    '#22C55E',
  'No aplica':  '#9CA3AF',
}

export const ESTADO_BG: Record<EstadoOT, string> = {
  'Pendiente':  '#FCEBEB',
  'En proceso': '#E6F1FB',
  'Cerrada':    '#EAF3DE',
  'No aplica':  '#F3F4F6',
}

export const ESTADO_TEXT: Record<EstadoOT, string> = {
  'Pendiente':  '#A32D2D',
  'En proceso': '#185FA5',
  'Cerrada':    '#3B6D11',
  'No aplica':  '#4B5563',
}

export const ESTADOS_ORDEN: EstadoOT[] = [
  'Pendiente', 'En proceso', 'Cerrada', 'No aplica',
]