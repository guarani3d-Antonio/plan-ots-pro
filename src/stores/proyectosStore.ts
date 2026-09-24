// src/stores/proyectosStore.ts
import { create } from 'zustand';
import { supabase } from '../db/supabase';
import { assertSession, sessionTicket } from '../security/sessionScope';
import { useAccessStore, exigirPermiso } from './accessStore';
import { useOrdenesStore } from './ordenesStore';
let loadSequence = 0;
let loadedEmpresa: string | null = null;
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
  const ticket = sessionTicket();
  const access = useAccessStore.getState();
  if (!access.empresaId || !access.contexto?.empresas.find(e=>e.id===access.empresaId)?.puede_crear) throw new Error('Selecciona una empresa donde puedas crear obras.');
  const { data, error } = await supabase.rpc('plan_crear_proyecto', {
    p_tenant_id: access.empresaId,
    p_nombre: datos.nombre, p_cliente: datos.cliente, p_descripcion: datos.descripcion,
    p_rubros: datos.rubros ?? [], p_tecnicos: datos.tecnicos ?? [],
    p_plano_url: 'pending://plan-upload-required',
  }).single();
  if (error) throw new Error(error.message);
  assertSession(ticket);
  const proyecto = data as Proyecto;
  try {
    const { ref } = await subirArchivo('planos', proyecto.id, file, file.name.split('.').pop() ?? 'pdf');
    const updated = await supabase.from('proyectos').update({ plano_url: ref }).eq('id', proyecto.id).select().single();
    if (updated.error) throw new Error(updated.error.message);
    assertSession(ticket);
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

export const useProyectosStore = create<ProyectosState>((set, get) => ({
  proyectos: [],
  proyectoActivo: null,
  loading: false,
  error: null,

  cargarProyectos: async () => {
    const request=++loadSequence;
    const empresa=useAccessStore.getState().empresaId;
    const proyectosPrevios=loadedEmpresa===empresa?get().proyectos:[];
    set({proyectos:proyectosPrevios,loading:true,error:null});
    try{
      const ticket=sessionTicket();
      let query=supabase.from('proyectos').select('*').is('deleted_at',null).order('updated_at',{ascending:false});
      if(empresa)query=query.eq('tenant_id',empresa);
      const {data,error}=await query;assertSession(ticket);
      if(error)throw new Error(error.message);
      if(request===loadSequence){loadedEmpresa=empresa;set({proyectos:data as Proyecto[],loading:false});}
    }catch(e){if(request===loadSequence)set({proyectos:proyectosPrevios,loading:false,error:e instanceof Error?e.message:'No se pudo cargar las obras.'});}
  },

  crearProyecto: async ({ nombre, cliente, descripcion, planoFile }) => {
    set({ loading: true, error: null });
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('No autenticado');

      const nuevo = await crearConPlano({ nombre, cliente: cliente || null, descripcion: descripcion || null }, planoFile);
      set(state => ({ proyectos: [nuevo, ...state.proyectos], loading: false }));
      await useAccessStore.getState().refresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al crear proyecto';
      set({ error: msg, loading: false });
    }
  },

  eliminarProyecto: async (id:string) => {
    exigirPermiso(id,'administrar');const ticket=sessionTicket();
    const {data,error}=await supabase.from('proyectos').update({deleted_at:new Date().toISOString()}).eq('id',id).select('id').single();
    assertSession(ticket);if(error||!data)throw new Error(error?.message??'No se confirmó el borrado.');
    set(state=>({proyectos:state.proyectos.filter(p=>p.id!==id)}));
    // La obra ya está borrada en el servidor. Actualizar el contexto local evita
    // que refresh interprete este cambio conocido de permisos como una sesión
    // alterada y fuerce una recarga completa de la pantalla.
    const access = useAccessStore.getState();
    if (access.contexto) useAccessStore.setState({
      contexto: { ...access.contexto, obras: access.contexto.obras.filter(p => p.id !== id) },
    });
    if (get().proyectoActivo?.id === id) set({ proyectoActivo: null });
  },

  duplicarProyecto: async (original: Proyecto) => {
    exigirPermiso(original.id, 'administrar');
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
    await useAccessStore.getState().refresh();
  },

  setProyectoActivo: (proyecto) => { useOrdenesStore.getState().limpiar(); set({ proyectoActivo: proyecto }); },
}));
