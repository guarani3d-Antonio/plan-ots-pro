// src/stores/proyectosStore.ts
import { create } from 'zustand';
import { supabase } from '../db/supabase';
import { db } from '../db/dexie';

export interface Proyecto {
  id: string;
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

      const ext      = planoFile.name.split('.').pop();
      const filePath = `${user.id}/${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from('planos')
        .upload(filePath, planoFile);
      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('planos')
        .getPublicUrl(filePath);

      const { data, error } = await supabase
        .from('proyectos')
        .insert({
          nombre,
          cliente:     cliente     || null,
          descripcion: descripcion || null,
          plano_url:   publicUrl,
          created_by:  user.id,
        })
        .select()
        .single();

      if (error) throw error;

      const nuevo = data as Proyecto;
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

    const { data, error } = await supabase
      .from('proyectos')
      .insert({
        nombre:      `${original.nombre} (copia)`,
        cliente:     original.cliente,
        descripcion: original.descripcion,
        plano_url:   original.plano_url,   // comparte el mismo plano
        rubros:      original.rubros,
        tecnicos:    original.tecnicos,
        created_by:  user.id,
      })
      .select()
      .single();

    if (error) throw new Error(error.message);

    const copia = data as Proyecto;
    set(state => ({ proyectos: [copia, ...state.proyectos] }));
  },

  setProyectoActivo: (proyecto) => set({ proyectoActivo: proyecto }),
}));