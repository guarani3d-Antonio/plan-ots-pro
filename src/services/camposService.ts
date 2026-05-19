import { supabase } from '../db/supabase';
import { db, type CampoDefinicionLocal } from '../db/dexie';
import { v4 as uuidv4 } from 'uuid';

// ─── Types ────────────────────────────────────────────────────────────────────

export type TipoCampo =
  | 'texto'
  | 'numero'
  | 'decimal'
  | 'fecha'
  | 'seleccion_unica'
  | 'booleano'
  | 'url'
  | 'seleccion_multiple'
  | 'fechahora'
  | 'hora'
  | 'firma'
  | 'video'

export interface CampoDefinicion {
  id: string;
  proyecto_id: string;
  nombre: string;
  tipo: TipoCampo;
  obligatorio: boolean;
  opciones: string[] | null;   // solo para tipo 'select'
  formula: string | null;      // reservado para tipo 'calculo' (Fase 4)
  orden: number;
  created_at: string;
}

export interface NuevoCampoPayload {
  proyecto_id: string;
  nombre: string;
  tipo: TipoCampo;
  obligatorio?: boolean;
  opciones?: string[];
}

// ─── Fetch ────────────────────────────────────────────────────────────────────

/**
 * Returns campos for a project. Uses Dexie cache; syncs from Supabase if online.
 */
export async function getCamposDeProyecto(
  proyectoId: string
): Promise<CampoDefinicion[]> {
  // Always try Supabase first if online
  if (navigator.onLine) {
    const { data, error } = await supabase
      .from('campos_definicion')
      .select('*')
      .eq('proyecto_id', proyectoId)
      .order('orden', { ascending: true });

    if (!error && data) {
      // Update local cache
      const locals: CampoDefinicionLocal[] = data.map((c) => ({
        ...c,
        _synced: true,
      }));
      await db.camposDefinicion
        .where('proyecto_id')
        .equals(proyectoId)
        .delete();
      await db.camposDefinicion.bulkPut(locals);
      return data as CampoDefinicion[];
    }
  }

  // Offline fallback
  const cached = await db.camposDefinicion
    .where('proyecto_id')
    .equals(proyectoId)
    .sortBy('orden');
  return cached as CampoDefinicion[];
}

// ─── Create ───────────────────────────────────────────────────────────────────

export async function crearCampo(
  payload: NuevoCampoPayload
): Promise<CampoDefinicion> {
  // Calculate next orden
  const existing = await db.camposDefinicion
    .where('proyecto_id')
    .equals(payload.proyecto_id)
    .toArray();
  const maxOrden = existing.length > 0
    ? Math.max(...existing.map((c) => c.orden))
    : 0;

  const nuevo: CampoDefinicion = {
    id: uuidv4(),
    proyecto_id: payload.proyecto_id,
    nombre: payload.nombre,
    tipo: payload.tipo,
    obligatorio: payload.obligatorio ?? false,
    opciones: payload.tipo === 'seleccion_unica' ? (payload.opciones ?? []) : null,
    formula: null,
    orden: maxOrden + 1,
    created_at: new Date().toISOString(),
  };

  // Save locally first
  await db.camposDefinicion.put({ ...nuevo, _synced: false });

  // Sync to Supabase
  if (navigator.onLine) {
    const { error } = await supabase
  .from('campos_definicion')
  .insert({
    id: nuevo.id,
    proyecto_id: nuevo.proyecto_id,
    nombre: nuevo.nombre,
    tipo: nuevo.tipo,
    obligatorio: nuevo.obligatorio,
    // Formato literal PostgreSQL para text[]: {val1,val2,val3}
    opciones: nuevo.opciones ? `{${nuevo.opciones.join(',')}}` : null,
    formula: nuevo.formula,
    orden: nuevo.orden,
  });

if (error) {
  console.error('[camposService] Insert error:', error.message, error.details, error.hint);
}
  }

  return nuevo;
}

// ─── Update ───────────────────────────────────────────────────────────────────

export async function actualizarCampo(
  id: string,
  cambios: Partial<Pick<CampoDefinicion, 'nombre' | 'obligatorio' | 'opciones' | 'orden'>>
): Promise<void> {
  await db.camposDefinicion.update(id, { ...cambios, _synced: false });

  if (navigator.onLine) {
    const { error } = await supabase
      .from('campos_definicion')
      .update(cambios)
      .eq('id', id);

    if (!error) {
      await db.camposDefinicion.update(id, { _synced: true });
    }
  }
}

// ─── Delete ───────────────────────────────────────────────────────────────────

export async function eliminarCampo(id: string): Promise<void> {
  await db.camposDefinicion.delete(id);

  if (navigator.onLine) {
    await supabase.from('campos_definicion').delete().eq('id', id);
  }
}

// ─── Reorder ──────────────────────────────────────────────────────────────────

/**
 * Receives the full ordered list of campo IDs and updates orden for each.
 */
export async function reordenarCampos(
  campoIds: string[]
): Promise<void> {
  const updates = campoIds.map((id, index) => ({
    id,
    orden: index + 1,
  }));

  // Update Dexie
  for (const u of updates) {
    await db.camposDefinicion.update(u.id, { orden: u.orden, _synced: false });
  }

  // Sync to Supabase
  if (navigator.onLine) {
    for (const u of updates) {
      await supabase
        .from('campos_definicion')
        .update({ orden: u.orden })
        .eq('id', u.id);
    }
    for (const u of updates) {
      await db.camposDefinicion.update(u.id, { _synced: true });
    }
  }
}