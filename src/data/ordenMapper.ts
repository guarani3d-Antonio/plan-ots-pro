import type { OrdenLocal } from '../types/orden';
export const ORDEN_SELECT = '*,orden_costos(costo)';

const MUTABLE_COLUMNS: readonly (keyof OrdenLocal)[] = [
  'ubicacion',
  'comentarios',
  'estado',
  'prioridad',
  'responsable',
  'responsable_id',
  'rubro',
  'pos_x',
  'pos_y',
  'plano_ref_url',
  'campos',
  'conflict_flag',
  'fecha_ingreso',
  'obra',
  'unidad_amenities',
  'descripcion',
  'en_garantia',
  'asiste_facility',
  'costo',
  'nivel_riesgo',
  'rubro_secundario',
  'contratistas',
  'fecha_inicio_trabajos',
  'porcentaje_avance',
  'fecha_fin_trabajos',
  'reincidencia',
  'potencialmente_conflictivo',
  'acta_conformidad',
  'informe_relevamiento',
  'informe_avance',
  'informe_cierre',
  'acta_conformidad_url',
  'informe_relevamiento_url',
  'informe_avance_url',
  'informe_cierre_url',
];

function nullablePosition(value: unknown): number {
  // OrdenLocal conserva por ahora el tipo histórico `number`, aunque la base y
  // la UI aceptan null para una OT sin ubicar. El cast mantiene null en runtime
  // y evita convertirlo en la coordenada válida (0,0).
  return (value == null ? null : value) as unknown as number;
}

export function rowToOrden(row: Record<string, unknown>): OrdenLocal {
  const relation = row.orden_costos as { costo?: number } | { costo?: number }[] | null | undefined;
  const costo = Array.isArray(relation) ? relation[0]?.costo : relation?.costo;
  return {
    id:                         row.id as string,
    proyecto_id:                row.proyecto_id as string,
    ot:                         row.ot as string,
    ubicacion:                  (row.ubicacion as string) ?? '',
    comentarios:                (row.comentarios as string) ?? '',
    estado:                     (row.estado as OrdenLocal['estado']) ?? 'Pendiente',
    prioridad:                  (row.prioridad as OrdenLocal['prioridad']) ?? 'Media',
    responsable:                (row.responsable as string) ?? '',
    responsable_id:             (row.responsable_id as string) ?? null,
    rubro:                      (row.rubro as string) ?? '',
    pos_x:                      nullablePosition(row.pos_x),
    pos_y:                      nullablePosition(row.pos_y),
    plano_ref_url:              (row.plano_ref_url as string) ?? '',
    campos:                     (row.campos as Record<string, unknown>) ?? {},
    conflict_flag:              (row.conflict_flag as boolean) ?? false,
    created_at:                 row.created_at as string,
    updated_at:                 row.updated_at as string,
    created_by:                 (row.created_by as string) ?? null,
    updated_by:                 (row.updated_by as string) ?? null,
    _synced:                    true,
    _last_fetched:              Date.now(),
    fotos_pendientes_upload:    [],
    fecha_ingreso:              (row.fecha_ingreso as string) ?? undefined,
    obra:                       (row.obra as string) ?? undefined,
    unidad_amenities:           (row.unidad_amenities as string) ?? undefined,
    descripcion:                (row.descripcion as string) ?? undefined,
    en_garantia:                (row.en_garantia as boolean) ?? false,
    asiste_facility:            (row.asiste_facility as boolean) ?? false,
    costo:                      costo ?? (row.costo as number) ?? undefined,
    nivel_riesgo:               (row.nivel_riesgo as OrdenLocal['nivel_riesgo']) ?? null,
    rubro_secundario:           (row.rubro_secundario as string[]) ?? [],
    contratistas:               (row.contratistas as string[]) ?? [],
    fecha_inicio_trabajos:      (row.fecha_inicio_trabajos as string) ?? undefined,
    porcentaje_avance:          (row.porcentaje_avance as number) ?? 0,
    fecha_fin_trabajos:         (row.fecha_fin_trabajos as string) ?? undefined,
    reincidencia:               (row.reincidencia as boolean) ?? false,
    potencialmente_conflictivo: (row.potencialmente_conflictivo as boolean) ?? false,
    acta_conformidad:           (row.acta_conformidad as OrdenLocal['acta_conformidad']) ?? 'Pendiente',
    informe_relevamiento:       (row.informe_relevamiento as OrdenLocal['informe_relevamiento']) ?? 'Pendiente',
    informe_avance:             (row.informe_avance as OrdenLocal['informe_avance']) ?? 'Pendiente',
    informe_cierre:             (row.informe_cierre as OrdenLocal['informe_cierre']) ?? 'Pendiente',
    acta_conformidad_url:       (row.acta_conformidad_url as string) ?? undefined,
    informe_relevamiento_url:   (row.informe_relevamiento_url as string) ?? undefined,
    informe_avance_url:         (row.informe_avance_url as string) ?? undefined,
    informe_cierre_url:         (row.informe_cierre_url as string) ?? undefined,
  };
}

export function ordenToRow(o: OrdenLocal): Record<string, unknown> {
  return {
    id:                         o.id,
    proyecto_id:                o.proyecto_id,
    ot:                         o.ot,
    ubicacion:                  o.ubicacion ?? '',
    comentarios:                o.comentarios,
    estado:                     o.estado,
    prioridad:                  o.prioridad,
    responsable:                o.responsable,
    responsable_id:             o.responsable_id ?? null,
    rubro:                      o.rubro,
    pos_x:                      o.pos_x,
    pos_y:                      o.pos_y,
    plano_ref_url:              o.plano_ref_url,
    campos:                     o.campos,
    conflict_flag:              o.conflict_flag,
    created_by:                 o.created_by ?? null,
    updated_by:                 o.updated_by ?? null,
    fecha_ingreso:              o.fecha_ingreso ?? null,
    obra:                       o.obra ?? null,
    unidad_amenities:           o.unidad_amenities ?? null,
    descripcion:                o.descripcion ?? null,
    en_garantia:                o.en_garantia ?? false,
    asiste_facility:            o.asiste_facility ?? false,
    costo:                      o.costo ?? null,
    nivel_riesgo:               o.nivel_riesgo ?? null,
    rubro_secundario:           o.rubro_secundario ?? [],
    contratistas:               o.contratistas ?? [],
    fecha_inicio_trabajos:      o.fecha_inicio_trabajos ?? null,
    porcentaje_avance:          o.porcentaje_avance ?? 0,
    fecha_fin_trabajos:         o.fecha_fin_trabajos ?? null,
    reincidencia:               o.reincidencia ?? false,
    potencialmente_conflictivo: o.potencialmente_conflictivo ?? false,
    acta_conformidad:           o.acta_conformidad ?? 'Pendiente',
    informe_relevamiento:       o.informe_relevamiento ?? 'Pendiente',
    informe_avance:             o.informe_avance ?? 'Pendiente',
    informe_cierre:             o.informe_cierre ?? 'Pendiente',
    acta_conformidad_url:       o.acta_conformidad_url ?? null,
    informe_relevamiento_url:   o.informe_relevamiento_url ?? null,
    informe_avance_url:         o.informe_avance_url ?? null,
    informe_cierre_url:         o.informe_cierre_url ?? null,
  };
}

export function ordenPatchToRow(
  changes: Partial<OrdenLocal>,
  metadata: { updated_at: string; updated_by?: string | null },
): Record<string, unknown> {
  const row: Record<string, unknown> = {
    updated_at: metadata.updated_at,
  };
  if ('updated_by' in metadata) row.updated_by = metadata.updated_by ?? null;

  for (const column of MUTABLE_COLUMNS) {
    if (!(column in changes)) continue;
    const value = changes[column];
    // `undefined` significa "no modificar". Para borrar un dato nullable el
    // caller debe enviar null explícito; cero, false y cadena vacía se conservan.
    if (value !== undefined) row[column] = value;
  }
  return row;
}
