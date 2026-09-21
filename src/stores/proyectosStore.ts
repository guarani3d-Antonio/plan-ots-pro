// src/stores/proyectosStore.ts
import { create } from 'zustand';
import { supabase } from '../db/supabase';
import { db } from '../db/dexie';
import { resolverArchivo, subirArchivo } from '../services/storageService';

export interface Proyecto {
  id: string;
  tenant_id?: string | null;
  nombre: string;
  cliente: string | null;
  descripcion: string | null;
  plano_url: string;
  plano_thumb_url: string | null;
  rubros: string[];
  tecnicos: string[];
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

async function crearConPlano(datos: { nombre: string; cliente: string | null; descripcion: string | null; rubros?: string[]; tecnicos?: string[] }, file: File): Promise<Proyecto> {
  const { data, error } = await supabase.rpc('plan_crear_proyecto', {
    p_nombre: datos.nombre, p_cliente: datos.cliente, p_descripcion: datos.descripcion,
    p_rubros: datos.rubros ?? [], p_tecnicos: datos.tecnicos ?? [],
    p_plano_url: 'pending://plan-upload-required',
  }).single();
  if (error) throw new Error(error.message);
  const proyecto = data as Proyecto;
  try {
    const { ref } = await subirArchivo('planos', proyecto.id, file, file.name.split('.').pop() ?? 'pdf');
    const updated = await supabase.from('proyectos').update({ plano_url: ref }).eq('id', proyecto.id).select().single();
    if (updated.error) throw new Error(updated.error.message);
    return updated.data as Proyecto;
  } catch (err) {
    const cleanup = await supabase.from('proyectos').update({ deleted_at: new Date().toISOString() }).eq('id', proyecto.id).select('id').single();
    if (cleanup.error) throw new Error('La obra quedó pendiente de plano. Revisa la conexión antes de volver a crearla.');
    throw err;
  }
}

interface ProyectosState {
  proyectos: Proyecto[];
  proyectoActivo: Proyecto | null;
  loading: boolean;
  error: string | null;
  cargarProyectos: () => Promise<void>;
  crearProyecto: (datos: { nombre: string; cliente: string; descripcion: string; planoFile: File }) => Promise<void>;
  eliminarProyecto: (id: string) => Promise<void>;
  duplicarProyecto: (proyecto: Proyecto) => Promise<void>;
  setProyectoActivo: (proyecto: Proyecto | null) => void;
}

export const useProyectosStore = create<ProyectosState>((set, _get) => ({
  proyectos: [],
  proyectoActivo: null,
  loading: false,
  error: null,

  cargarProyectos: async () => {
    set({ loading: true, error: null });
    try {
      const { data, error } = await supabase
        .from('proyectos')
        .select('*')
        .is('deleted_at', null)
        .order('updated_at', { ascending: false });

      if (error) throw error;

      const proyectos = data as Proyecto[];
      set({ proyectos, loading: false });

      for (const p of proyectos) {
        await db.proyectos.put({
          id:            p.id,
          nombre:        p.nombre,
          cliente:       p.cliente ?? undefined,
          descripcion:   p.descripcion ?? undefined,
          plano_url:     p.plano_url,
          created_at:    p.created_at,
          updated_at:    p.updated_at,
          _synced:       true,
          _last_fetched: Date.now(),
        });
      }
    } catch {
      const cached = await db.proyectos.toArray();
      const proyectos = cached.map((c) => ({
        id:             c.id,
        nombre:         c.nombre,
        cliente:        c.cliente ?? null,
        descripcion:    null,
        plano_url:      c.plano_url ?? '',
        plano_thumb_url: null,
        rubros:         [],
        tecnicos:       [],
        created_by:     null,
        created_at:     c.created_at,
        updated_at:     c.updated_at,
      }) as unknown as Proyecto);
      set({ proyectos, loading: false, error: 'Sin conexión — mostrando datos locales' });
    }
  },

  crearProyecto: async ({ nombre, cliente, descripcion, planoFile }) => {
    set({ loading: true, error: null });
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('No autenticado');

      const nuevo = await crearConPlano({ nombre, cliente: cliente || null, descripcion: descripcion || null }, planoFile);
      set(state => ({ proyectos: [nuevo, ...state.proyectos], loading: false }));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al crear proyecto';
      set({ error: msg, loading: false });
    }
  },

  eliminarProyecto: async (id: string) => {
    // Soft delete — preserva datos históricos y OTs asociadas
    const { error } = await supabase
      .from('proyectos')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id);

    if (error) throw new Error(error.message);

    // Quitar del estado local inmediatamente
    set(state => ({
      proyectos: state.proyectos.filter(p => p.id !== id),
    }));

    // Limpiar caché Dexie
    await db.proyectos.delete(id);
  },

  duplicarProyecto: async (original: Proyecto) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('No autenticado');

    const response = await fetch(await resolverArchivo(original.plano_url), { cache: 'no-store' });
    if (!response.ok) throw new Error('No se pudo descargar el plano para duplicarlo');
    const blob = await response.blob();
    const ext = original.plano_url.split('?')[0].split('.').pop() ?? 'pdf';
    const copia = await crearConPlano({ nombre: `${original.nombre} (copia)`, cliente: original.cliente,
      descripcion: original.descripcion, rubros: original.rubros, tecnicos: original.tecnicos },
      new File([blob], `plano.${ext}`, { type: blob.type }));
    set(state => ({ proyectos: [copia, ...state.proyectos] }));
  },

  setProyectoActivo: (proyecto) => set({ proyectoActivo: proyecto }),
}));
