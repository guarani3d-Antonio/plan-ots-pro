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

/**
 * Anclaje local de una OT de Plan-OTs. Fio Pro implementará su propio modelo
 * independiente para no conformidades, reutilizando el patrón y no los datos.
 */
export interface SpatialAnchor {
  tenant_id: string;
  project_id: string;
  work_order_id: string;
  document_revision_id: string;
  sheet_id: string;
  u: number;
  v: number;
}
