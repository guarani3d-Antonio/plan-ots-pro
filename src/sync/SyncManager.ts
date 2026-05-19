// src/sync/SyncManager.ts
import { db } from '../db/dexie';
import { supabase } from '../db/supabase';
import type { OrdenLocal } from '../types/orden';

// ─── Tipos internos ───────────────────────────────────────────────────────────
interface QueueItemCreate { tipo: 'CREATE_OT'; payload: OrdenLocal; }
interface QueueItemUpdate { tipo: 'UPDATE_OT'; payload: { id: string; campos: Partial<OrdenLocal> }; }
interface QueueItemDelete { tipo: 'DELETE_OT'; payload: { id: string }; }
type QueueItem = QueueItemCreate | QueueItemUpdate | QueueItemDelete;

const MAX_INTENTOS = 3;

// ─── Mapper local → Supabase (igual que en ordenesStore) ─────────────────────
function ordenToRow(o: OrdenLocal) {
  return {
    id:            o.id,
    proyecto_id:   o.proyecto_id,
    ot:            o.ot,
    ubicacion:     o.ubicacion ?? '',
    comentarios:   o.descripcion,
    estado:        o.estado,
    prioridad:     o.prioridad,
    responsable:   o.responsable,
    rubro:         o.rubro,
    pos_x:         o.pos_x,
    pos_y:         o.pos_y,
    plano_ref_url: o.plano_ref_url,
    campos:        o.campos,
    conflict_flag: o.conflict_flag,
  };
}

// ─── Procesar un item de la cola ──────────────────────────────────────────────
async function procesarItem(item: QueueItem & { id?: number }): Promise<boolean> {
  try {
    if (item.tipo === 'CREATE_OT') {
      const { error } = await supabase
        .from('ordenes')
        .insert(ordenToRow(item.payload));
      if (error) throw error;

    } else if (item.tipo === 'UPDATE_OT') {
      const { id, campos } = item.payload;
      // Construir payload limpio para Supabase
      const patch: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };
      const camposPublicos: (keyof OrdenLocal)[] = [
        'ot', 'estado', 'prioridad', 'responsable',
        'rubro', 'pos_x', 'pos_y', 'plano_ref_url',
        'campos', 'conflict_flag',
      ];
      camposPublicos.forEach(k => {
        if (k in campos) patch[k] = campos[k as keyof typeof campos];
      });
      if ('descripcion' in campos) patch['comentarios'] = campos.descripcion;
      if ('ubicacion'   in campos) patch['ubicacion']   = campos.ubicacion;

      const { error } = await supabase
        .from('ordenes')
        .update(patch)
        .eq('id', id);
      if (error) throw error;

    } else if (item.tipo === 'DELETE_OT') {
      const { error } = await supabase
        .from('ordenes')
        .delete()
        .eq('id', item.payload.id);
      if (error) throw error;
    }

    return true; // éxito

  } catch (err) {
    console.error(`[SyncManager] Error procesando ${item.tipo}:`, err);
    return false; // fallo
  }
}

// ─── Función principal: procesar toda la cola ─────────────────────────────────
export async function procesarSyncQueue(): Promise<void> {
  if (!navigator.onLine) return;

  const items = await db.syncQueue.orderBy('id').toArray();
  if (items.length === 0) return;

  console.log(`[SyncManager] Procesando ${items.length} item(s) en cola...`);

  for (const item of items) {
    const exito = await procesarItem(item as QueueItem & { id?: number });

    if (exito) {
      // Eliminar de la cola
      if (item.id !== undefined) await db.syncQueue.delete(item.id);
    } else {
      // Incrementar intentos; si supera el límite, descartar con log
      const intentos = (item.intentos ?? 0) + 1;
      if (intentos >= MAX_INTENTOS) {
        console.warn(`[SyncManager] Item ${item.id} descartado tras ${MAX_INTENTOS} intentos.`);
        if (item.id !== undefined) await db.syncQueue.delete(item.id);
      } else {
        await db.syncQueue.update(item.id!, { intentos });
      }
    }
  }

  console.log('[SyncManager] Cola procesada.');
}

// ─── Inicializar listeners de conectividad ────────────────────────────────────
export function iniciarSyncManager(): () => void {
  const handleOnline = () => {
    console.log('[SyncManager] Conexión recuperada → procesando cola...');
    procesarSyncQueue();
  };

  window.addEventListener('online', handleOnline);

  // Procesar al iniciar si ya hay conexión y hay items pendientes
  procesarSyncQueue();

  // Retorna función de cleanup para usar en useEffect
  return () => {
    window.removeEventListener('online', handleOnline);
  };
}