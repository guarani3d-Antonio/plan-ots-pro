import { supabase } from '../db/supabase';
import type { EstadoOT } from '../types/orden';

// ─── Tipos exportados (usados por ComparadorVersiones) ───────────────────────

export interface OrdenSnap {
  id:          string;
  ot:          string;
  ubicacion:   string;
  rubro:       string;
  estado:      EstadoOT;
  responsable: string;
  prioridad:   string;
  pos_x:       number;
  pos_y:       number;
  comentarios: string;
  campos?:     Record<string, unknown>;
}

export interface VersionSnapshot {
  ordenes: OrdenSnap[];
  total:   number;
  fecha:   string;
}

export interface Version {
  id:          string;
  nombre:      string;
  descripcion?: string | null;
  snapshot:    VersionSnapshot;
  created_at:  string;
  created_by?: string;
}

// ─── Tipo local para guardarVersion ──────────────────────────────────────────

interface OrdenParaSnap {
  id:          string;
  ot:          string;
  ubicacion:   string;
  rubro:       string;
  estado:      EstadoOT;
  responsable: string;
  prioridad:   string;
  pos_x:       number;
  pos_y:       number;
  comentarios: string;
  campos?:     Record<string, unknown>;
}

// ─── Helper ──────────────────────────────────────────────────────────────────

function ordenToSnap(o: OrdenParaSnap): OrdenSnap {
  return {
    id:          o.id,
    ot:          o.ot,
    ubicacion:   o.ubicacion,
    rubro:       o.rubro,
    estado:      o.estado,
    responsable: o.responsable,
    prioridad:   o.prioridad,
    pos_x:       o.pos_x,
    pos_y:       o.pos_y,
    comentarios: o.comentarios,
    campos:      o.campos ?? {},
  };
}

// ─── API ─────────────────────────────────────────────────────────────────────

/**
 * Guarda un snapshot. Retorna Version en éxito, null en error.
 * descripcion acepta null (campo opcional en UI).
 */
export async function guardarVersion(
  proyectoId:  string,
  nombre:      string,
  descripcion: string | null,   // ← acepta null (PanelResumen pasa null cuando está vacío)
  ordenes:     OrdenParaSnap[]
): Promise<Version | null> {    // ← retorna null en error (PanelResumen hace if (resultado))
  try {
    const snapshot: VersionSnapshot = {
      ordenes: ordenes.map(ordenToSnap),
      total:   ordenes.length,
      fecha:   new Date().toISOString(),
    };

    const { data: userData } = await supabase.auth.getUser();

    const { data, error } = await supabase
      .from('versiones')
      .insert({
        proyecto_id: proyectoId,
        nombre:      nombre.trim(),
        descripcion: descripcion?.trim() ?? null,
        snapshot,
        created_by:  userData.user?.id ?? null,
      })
      .select()
      .single();

    if (error) throw error;
    return data as Version;
  } catch (e) {
    console.error('[versionesService] guardarVersion:', e);
    return null;
  }
}

/**
 * Lista versiones de un proyecto, de más nueva a más antigua.
 */
export async function listarVersiones(proyectoId: string): Promise<Version[]> {
  try {
    const { data, error } = await supabase
      .from('versiones')
      .select('id, nombre, descripcion, created_at, created_by, snapshot')
      .eq('proyecto_id', proyectoId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return (data ?? []) as Version[];
  } catch (e) {
    console.error('[versionesService] listarVersiones:', e);
    return [];
  }
}

/**
 * Carga una versión completa por ID.
 */
export async function cargarVersion(versionId: string): Promise<Version> {
  const { data, error } = await supabase
    .from('versiones')
    .select('*')
    .eq('id', versionId)
    .single();

  if (error) throw error;
  return data as Version;
}

/**
 * Elimina una versión. Retorna true en éxito, false en error.
 * (PanelResumen hace: const ok = await eliminarVersion(...); if (ok) { ... })
 */
export async function eliminarVersion(versionId: string): Promise<boolean> {  // ← retorna boolean
  try {
    const { error } = await supabase
      .from('versiones')
      .delete()
      .eq('id', versionId);

    if (error) throw error;
    return true;
  } catch (e) {
    console.error('[versionesService] eliminarVersion:', e);
    return false;
  }
}