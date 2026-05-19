import { supabase } from '../db/supabase'

export interface ProyectoStats {
  proyecto_id: string
  pendiente: number
  en_proceso: number
  cerrada: number
  no_aplica: number
  total: number
  pct_cerrada: number
}

export async function cargarStatsProyectos(
  proyectoIds: string[]
): Promise<Record<string, ProyectoStats>> {
  if (proyectoIds.length === 0) return {}

  const { data, error } = await supabase
    .from('ordenes')
    .select('proyecto_id, estado')
    .in('proyecto_id', proyectoIds)

  if (error || !data) return {}

  // Agrupar en memoria por proyecto_id
  const mapa: Record<string, ProyectoStats> = {}

  for (const row of data) {
    if (!mapa[row.proyecto_id]) {
      mapa[row.proyecto_id] = {
        proyecto_id: row.proyecto_id,
        pendiente: 0,
        en_proceso: 0,
        cerrada: 0,
        no_aplica: 0,
        total: 0,
        pct_cerrada: 0,
      }
    }
    const s = mapa[row.proyecto_id]
    s.total++
    if (row.estado === 'Pendiente') s.pendiente++
    else if (row.estado === 'En proceso') s.en_proceso++
    else if (row.estado === 'Cerrada') s.cerrada++
    else if (row.estado === 'No aplica') s.no_aplica++
  }

  // Calcular porcentaje
  for (const s of Object.values(mapa)) {
    s.pct_cerrada = s.total > 0
      ? Math.round((s.cerrada / s.total) * 100)
      : 0
  }

  return mapa
}
