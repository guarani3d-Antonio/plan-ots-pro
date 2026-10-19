import type { TipoDocumento } from './documentService';
export type GridRoute = {
  detalle: string | null;
  editor: string | null;
  tab: 'datos' | 'informes';
  informe: { ordenId: string; tipo: TipoDocumento; documentoId?: string } | null;
};
export const GRID_ROOT: GridRoute = { detalle: null, editor: null, tab: 'datos', informe: null };
const tipos = new Set(['orden_servicio','visita','relevamiento','avance','cierre','acta','encuesta']);
export function leerRutaGrilla(value: unknown): GridRoute {
  if (!value || typeof value !== 'object') return GRID_ROOT;
  const route = value as GridRoute;
  return {
    detalle: typeof route.detalle === 'string' ? route.detalle : null,
    editor: typeof route.editor === 'string' ? route.editor : null,
    tab: route.tab === 'informes' ? 'informes' : 'datos',
    informe: route.informe && typeof route.informe.ordenId === 'string' && tipos.has(route.informe.tipo)
      ? { ordenId: route.informe.ordenId, tipo: route.informe.tipo, documentoId: typeof route.informe.documentoId === 'string' ? route.informe.documentoId : undefined } : null,
  };
}

export type ReportRoute = { tipo: TipoDocumento; documentoId?: string; revisionId?: string } | null;
export function leerRutaInforme(value: unknown): ReportRoute {
  if (!value || typeof value !== 'object') return null;
  const route = value as NonNullable<ReportRoute>;
  return tipos.has(route.tipo) ? { tipo: route.tipo, documentoId: typeof route.documentoId === 'string' ? route.documentoId : undefined, revisionId: typeof route.revisionId === 'string' ? route.revisionId : undefined } : null;
}
