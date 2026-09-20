// src/stores/ordenesStore.ts
import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import { supabase } from '../db/supabase';
import { useAuthStore } from './authStore';
import { db } from '../db/dexie';
import type { OrdenLocal } from '../types/orden';
import { ordenPatchToRow, ordenToRow, rowToOrden } from '../data/ordenMapper';

export { rowToOrden } from '../data/ordenMapper';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function isOnline(): boolean {
  return navigator.onLine;
}

function nextCodigoOT(ordenes: OrdenLocal[]): string {
  const nums = ordenes
    .map(o => parseInt(o.ot.replace('OT-', ''), 10))
    .filter(n => !isNaN(n));
  const max = nums.length > 0 ? Math.max(...nums) : 0;
  return `OT-${String(max + 1).padStart(3, '0')}`;
}

async function encolarUpdate(
  ordenId: string,
  campos: Partial<OrdenLocal>
): Promise<void> {
  await db.syncQueue.add({
    tipo:       'UPDATE_OT',
    payload:    { id: ordenId, campos },
    created_at: new Date().toISOString(),
    intentos:   0,
  });
}

// ─── Tipos del store ──────────────────────────────────────────────────────────
interface OrdenesState {
  ordenes:           OrdenLocal[];
  ordenSeleccionada: string | null;
  cargando:          boolean;
  error:             string | null;

  // IDs de OTs recién importadas que todavía no fueron ubicadas + completadas
  // con fotos. El guard de navegación en App.tsx consulta este array antes de
  // permitir cambios de vista o salida de proyecto: si hay pendientes, abre
  // un modal pidiendo cancelar la importación o continuar cargándolas.
  otsPendientesImport: string[];

  cargarOrdenes:          (proyectoId: string) => Promise<void>;
  cargarTodasLasOrdenes:  () => Promise<void>;
  crearOrdenEnPosicion:   (proyectoId: string, posX: number, posY: number) => Promise<OrdenLocal>;
  crearOrdenDesdeImport:  (datos: Omit<OrdenLocal, 'id' | '_synced' | '_last_fetched'>) => Promise<string>;
  agregarOActualizarOrden:(orden: OrdenLocal) => void;
  aplicarEliminacionRemota:(id: string) => void;
  moverOrden:             (id: string, posX: number | null, posY: number | null) => Promise<void>;
  actualizarOrden:        (id: string, cambios: Partial<OrdenLocal>) => Promise<OrdenLocal | null>;
  eliminarOrden:          (id: string) => Promise<void>;
  seleccionar:            (id: string | null) => void;
  limpiar:                () => void;
  setOtsPendientesImport: (ids: string[]) => void;
  completarOtImport:      (id: string) => void;
}

// ─── Store ────────────────────────────────────────────────────────────────────
export const useOrdenesStore = create<OrdenesState>((set, get) => ({
  ordenes:             [],
  ordenSeleccionada:   null,
  cargando:            false,
  error:               null,
  otsPendientesImport: [],

  // ── CARGAR TODAS LAS OTs (de todos los proyectos del usuario) ──────────────
  // Usado por las vistas globales (Dashboard, Gantt, Calendario, Responsables,
  // Contratistas). Trae las OTs vía .in('proyecto_id', [...]) — RLS limita los
  // proyectos visibles al usuario actual, así que el set efectivo es "todos los
  // proyectos accesibles". Cae a Dexie en offline.
  cargarTodasLasOrdenes: async () => {
    set({ cargando: true, error: null });
    try {
      // Asegurar que tenemos la lista de proyectos antes de pedir las OTs.
      const proyectosStoreRef = await import('./proyectosStore');
      const proyectosStore = proyectosStoreRef.useProyectosStore;
      let proyectos = proyectosStore.getState().proyectos;
      if (proyectos.length === 0) {
        await proyectosStore.getState().cargarProyectos();
        proyectos = proyectosStore.getState().proyectos;
      }
      const ids = proyectos.map(p => p.id);
      if (ids.length === 0) {
        set({ ordenes: [], cargando: false });
        return;
      }

      if (isOnline()) {
        const { data, error } = await supabase
          .from('ordenes')
          .select('*')
          .in('proyecto_id', ids)
          .order('updated_at', { ascending: false });
        if (error) throw error;

        const ordenes = (data ?? []).map(rowToOrden);

        // Reemplaza el cache local de OTs de proyectos del usuario.
        await db.transaction('rw', db.ordenes, async () => {
          for (const pid of ids) {
            await db.ordenes.where('proyecto_id').equals(pid).delete();
          }
          if (ordenes.length > 0) await db.ordenes.bulkPut(ordenes);
        });

        set({ ordenes, cargando: false });
      } else {
        const todas = await db.ordenes.toArray();
        const filtradas = todas.filter(o => ids.includes(o.proyecto_id));
        set({ ordenes: filtradas, cargando: false });
      }
    } catch (err) {
      console.error('[ordenesStore] cargarTodasLasOrdenes:', err);
      try {
        const todas = await db.ordenes.toArray();
        set({ ordenes: todas, cargando: false, error: 'Modo offline — mostrando datos locales' });
      } catch {
        set({ cargando: false, error: 'Error al cargar órdenes' });
      }
    }
  },

  // ── CARGAR (por proyecto) ──────────────────────────────────────────────────
  cargarOrdenes: async (proyectoId) => {
    set({ cargando: true, error: null });
    try {
      if (isOnline()) {
        const { data, error } = await supabase
          .from('ordenes')
          .select('*')
          .eq('proyecto_id', proyectoId)
          .order('ot', { ascending: true });

        if (error) throw error;

        const ordenes = (data ?? []).map(rowToOrden);

        await db.transaction('rw', db.ordenes, async () => {
          await db.ordenes.where('proyecto_id').equals(proyectoId).delete();
          if (ordenes.length > 0) await db.ordenes.bulkPut(ordenes);
        });

        set({ ordenes, cargando: false });
      } else {
        const ordenes = await db.ordenes
          .where('proyecto_id')
          .equals(proyectoId)
          .sortBy('ot');
        set({ ordenes, cargando: false });
      }
    } catch (err) {
      console.error('[ordenesStore] cargarOrdenes:', err);
      try {
        const ordenes = await db.ordenes
          .where('proyecto_id')
          .equals(proyectoId)
          .sortBy('ot');
        set({ ordenes, cargando: false, error: 'Modo offline — mostrando datos locales' });
      } catch {
        set({ cargando: false, error: 'Error al cargar órdenes' });
      }
    }
  },

  // ── CREAR (desde plano) ───────────────────────────────────────────────────────
  crearOrdenEnPosicion: async (proyectoId, posX, posY) => {
    const { ordenes } = get();
    const now = new Date().toISOString();
    const userId = useAuthStore.getState().user?.id ?? null;

    const nueva: OrdenLocal = {
      id:                      uuidv4(),
      proyecto_id:             proyectoId,
      ot:                      nextCodigoOT(ordenes),
      ubicacion:               '',
      comentarios:             '',
      estado:                  'Pendiente',
      prioridad:               'Media',
      responsable:             '',
      rubro:                   '',
      pos_x:                   posX,
      pos_y:                   posY,
      plano_ref_url:           '',
      campos:                  {},
      conflict_flag:           false,
      created_at:              now,
      updated_at:              now,
      created_by:              userId,
      updated_by:              userId,
      _synced:                 false,
      _last_fetched:           Date.now(),
      fotos_pendientes_upload: [],
    };

    set({ ordenes: [...ordenes, nueva] });
    await db.ordenes.put(nueva);

    if (isOnline()) {
      const { error } = await supabase
        .from('ordenes')
        .insert(ordenToRow(nueva));

      if (error) {
        console.error('[ordenesStore] crearOrden Supabase error:', error);
        await db.syncQueue.add({
          tipo:       'CREATE_OT',
          payload:    nueva,
          created_at: now,
          intentos:   0,
        });
      } else {
        await db.ordenes.update(nueva.id, { _synced: true });
        set(state => ({
          ordenes: state.ordenes.map(o =>
            o.id === nueva.id ? { ...o, _synced: true } : o
          ),
        }));
      }
    } else {
      await db.syncQueue.add({
        tipo:       'CREATE_OT',
        payload:    nueva,
        created_at: now,
        intentos:   0,
      });
    }

    return nueva;
  },

  // ── CREAR (desde importación CSV) ─────────────────────────────────────────────
  crearOrdenDesdeImport: async (datos) => {
    const now = new Date().toISOString();
    const nueva: OrdenLocal = {
      ...datos,
      id:                      uuidv4(),
      _synced:                 false,
      _last_fetched:           Date.now(),
      fotos_pendientes_upload: datos.fotos_pendientes_upload ?? [],
    };

    set(state => ({ ordenes: [...state.ordenes, nueva] }));
    await db.ordenes.put(nueva);

    if (isOnline()) {
      const { error } = await supabase
        .from('ordenes')
        .insert(ordenToRow(nueva));

      if (error) {
        console.error('[ordenesStore] crearOrdenDesdeImport error:', error);
        await db.syncQueue.add({
          tipo:       'CREATE_OT',
          payload:    nueva,
          created_at: now,
          intentos:   0,
        });
      } else {
        await db.ordenes.update(nueva.id, { _synced: true });
        set(state => ({
          ordenes: state.ordenes.map(o =>
            o.id === nueva.id ? { ...o, _synced: true } : o
          ),
        }));
      }
    } else {
      await db.syncQueue.add({
        tipo:       'CREATE_OT',
        payload:    nueva,
        created_at: now,
        intentos:   0,
      });
    }

    return nueva.id;
  },

  // ── UPSERT para Realtime ──────────────────────────────────────────────────────
  agregarOActualizarOrden: (orden) => {
    set(state => {
      const existe = state.ordenes.some(o => o.id === orden.id);
      if (existe) {
        return {
          ordenes: state.ordenes.map(o => o.id === orden.id ? orden : o),
        };
      }
      return { ordenes: [...state.ordenes, orden] };
    });
    // Actualizar caché local también
    db.ordenes.put(orden).catch(err =>
      console.error('[ordenesStore] agregarOActualizarOrden dexie:', err)
    );
  },

  aplicarEliminacionRemota: (id) => {
    set(state => ({
      ordenes: state.ordenes.filter(o => o.id !== id),
      ordenSeleccionada: state.ordenSeleccionada === id ? null : state.ordenSeleccionada,
    }));
    db.ordenes.delete(id).catch(err =>
      console.error('[ordenesStore] aplicarEliminacionRemota dexie:', err)
    );
  },

  // ── MOVER ────────────────────────────────────────────────────────────────────
  // posX/posY: number → reubicar | null → "desubicar" (volver al ToolPanel de
  // OTs sin ubicar). OrdenLocal.pos_x/pos_y se declaran `number` pero el runtime
  // acepta null para OTs importadas/desubicadas; el cast preserva esa convención.
  moverOrden: async (id, posX, posY) => {
    const now = new Date().toISOString();
    const patch = {
      pos_x: posX as unknown as number,
      pos_y: posY as unknown as number,
      updated_at: now,
      _synced: false,
    };

    set(state => ({
      ordenes: state.ordenes.map(o => o.id === id ? { ...o, ...patch } : o),
    }));
    await db.ordenes.update(id, patch);

    if (isOnline()) {
      const userId = useAuthStore.getState().user?.id ?? null;
      const { error } = await supabase
        .from('ordenes')
        .update({ pos_x: posX, pos_y: posY, updated_at: now, updated_by: userId })
        .eq('id', id);

      if (error) {
        console.error('[ordenesStore] moverOrden Supabase error:', error);
        await encolarUpdate(id, { pos_x: patch.pos_x, pos_y: patch.pos_y });
      } else {
        await db.ordenes.update(id, { _synced: true });
        set(state => ({
          ordenes: state.ordenes.map(o =>
            o.id === id ? { ...o, _synced: true } : o
          ),
        }));
      }
    } else {
      await encolarUpdate(id, { pos_x: patch.pos_x, pos_y: patch.pos_y });
    }
  },

  // ── ACTUALIZAR ───────────────────────────────────────────────────────────────
  actualizarOrden: async (id, cambios) => {
    const now = new Date().toISOString();
    const patch = { ...cambios, updated_at: now, _synced: false };

    set(state => ({
      ordenes: state.ordenes.map(o => o.id === id ? { ...o, ...patch } : o),
    }));
    await db.ordenes.update(id, patch);

    if (isOnline()) {
      const userId = useAuthStore.getState().user?.id ?? null;
      const supabasePatch = ordenPatchToRow(cambios, {
        updated_at: now,
        updated_by: userId,
      });

      // `.select().single()` devuelve la fila completa post-update — la fuente
      // de verdad autoritativa contra la que se reemplaza el snapshot local.
      const { data, error } = await supabase
        .from('ordenes')
        .update(supabasePatch)
        .eq('id', id)
        .select()
        .single();

      console.log('[DEBUG actualizarOrden] id:', id);
      console.log('[DEBUG actualizarOrden] supabasePatch enviado:', JSON.stringify(supabasePatch, null, 2));
      console.log('[DEBUG actualizarOrden] data recibido:', JSON.stringify(data, null, 2));
      console.log('[DEBUG actualizarOrden] error recibido:', error);

      if (error || !data) {
        console.error('[ordenesStore] actualizarOrden Supabase error:', error);
        await encolarUpdate(id, cambios);
        return null;
      }

      const ordenServidor = rowToOrden(data as Record<string, unknown>);
      set(state => ({
        ordenes: state.ordenes.map(o => o.id === id ? ordenServidor : o),
      }));
      await db.ordenes.put(ordenServidor);
      return ordenServidor;
    } else {
      // Offline: queda encolado para retry; devolvemos el snapshot optimista
      // (lo que ya se mostró tras el `set` de arriba) para que el caller pueda
      // hidratar su form local sin esperar al sync online.
      await encolarUpdate(id, cambios);
      return get().ordenes.find(o => o.id === id) ?? null;
    }
  },

  // ── ELIMINAR ─────────────────────────────────────────────────────────────────
  eliminarOrden: async (id) => {
    const now = new Date().toISOString();

    set(state => ({
      ordenes: state.ordenes.filter(o => o.id !== id),
      ordenSeleccionada:
        state.ordenSeleccionada === id ? null : state.ordenSeleccionada,
    }));
    await db.ordenes.delete(id);

    if (isOnline()) {
      const { error } = await supabase
        .from('ordenes')
        .delete()
        .eq('id', id);

      if (error) {
        console.error('[ordenesStore] eliminarOrden Supabase error:', error);
        await db.syncQueue.add({
          tipo:       'DELETE_OT',
          payload:    { id },
          created_at: now,
          intentos:   0,
        });
      }
    } else {
      await db.syncQueue.add({
        tipo:       'DELETE_OT',
        payload:    { id },
        created_at: now,
        intentos:   0,
      });
    }
  },

  // ── UI ───────────────────────────────────────────────────────────────────────
  seleccionar: (id) => set({ ordenSeleccionada: id }),
  limpiar:     ()   => set({ ordenes: [], ordenSeleccionada: null, error: null }),

  // ── Guard de importación ────────────────────────────────────────────────────
  // Tracking de OTs recién importadas que el usuario todavía no terminó de
  // ubicar + completar con fotos. App.tsx lee este array para mostrar el modal
  // de "Importación incompleta" si intenta navegar fuera del plano antes.
  setOtsPendientesImport: (ids) => set({ otsPendientesImport: ids }),
  completarOtImport:      (id)  => set(state => ({
    otsPendientesImport: state.otsPendientesImport.filter(x => x !== id),
  })),
}));
