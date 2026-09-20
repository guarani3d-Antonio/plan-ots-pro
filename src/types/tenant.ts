export const TENANT_ROLES = ['administrador', 'supervisor', 'tecnico', 'viewer'] as const;

export type TenantRole = typeof TENANT_ROLES[number];

export interface Tenant {
  id: string;
  slug: string;
  nombre: string;
  activo: boolean;
  created_at: string;
  updated_at: string;
}

export interface TenantMembership {
  tenant_id: string;
  user_id: string;
  rol: TenantRole;
  activo: boolean;
  created_at: string;
  updated_at: string;
}

export const SPATIAL_ENTITY_TYPES = ['work_order', 'non_conformity'] as const;

export type SpatialEntityType = typeof SPATIAL_ENTITY_TYPES[number];

/**
 * Contrato compartible con Fio Pro. Las coordenadas u/v son normalizadas
 * dentro de la página o lámina y siempre permanecen en el rango 0..1.
 */
export interface SpatialAnchor {
  tenant_id: string;
  project_id: string;
  source_system: 'plan-ots' | 'fio-pro';
  entity_type: SpatialEntityType;
  entity_id: string;
  document_revision_id: string;
  sheet_id: string;
  u: number;
  v: number;
}
