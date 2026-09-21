import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import { supabase } from '../db/supabase';
import { useAuthStore } from './authStore';
import { exigirPermiso } from './accessStore';
import { assertSession, sessionTicket } from '../security/sessionScope';
import type { OrdenLocal } from '../types/orden';
import { ORDEN_SELECT, ordenPatchToRow, ordenToRow, rowToOrden } from '../data/ordenMapper';
export { rowToOrden } from '../data/ordenMapper';

interface OrdenesState {
  ordenes: OrdenLocal[]; ordenSeleccionada: string | null; cargando: boolean; error: string | null;
  otsPendientesImport: string[];
  cargarOrdenes: (proyectoId:string)=>Promise<void>;
  cargarTodasLasOrdenes: ()=>Promise<void>;
  crearOrdenEnPosicion: (proyectoId:string,posX:number,posY:number)=>Promise<OrdenLocal>;
  crearOrdenDesdeImport: (datos:Omit<OrdenLocal,'id'|'_synced'|'_last_fetched'>)=>Promise<string>;
  agregarOActualizarOrden:(orden:OrdenLocal)=>void;
  aplicarEliminacionRemota:(id:string)=>void;
  moverOrden:(id:string,posX:number|null,posY:number|null)=>Promise<void>;
  actualizarOrden:(id:string,cambios:Partial<OrdenLocal>)=>Promise<OrdenLocal|null>;
  eliminarOrden:(id:string)=>Promise<void>;
  seleccionar:(id:string|null)=>void;limpiar:()=>void;
  setOtsPendientesImport:(ids:string[])=>void;completarOtImport:(id:string)=>void;
}
let sequence=0,scope='*';
const message=(e:unknown)=>e instanceof Error?e.message:'No se pudo confirmar la operación en el servidor.';
export const useOrdenesStore=create<OrdenesState>((set,get)=>({
  ordenes:[],ordenSeleccionada:null,cargando:false,error:null,otsPendientesImport:[],
  cargarTodasLasOrdenes:async()=>{
    const request=++sequence;scope='*';set({ordenes:[],cargando:true,error:null});
    try {
      const ticket=sessionTicket();
      const {useProyectosStore}=await import('./proyectosStore');
      await useProyectosStore.getState().cargarProyectos();assertSession(ticket);
      const ids=useProyectosStore.getState().proyectos.map(p=>p.id);
      const {data,error}=ids.length?await supabase.from('ordenes').select(ORDEN_SELECT).in('proyecto_id',ids).is('deleted_at',null).order('updated_at',{ascending:false}):{data:[],error:null};
      assertSession(ticket);if(error)throw new Error(error.message);
      if(request===sequence)set({ordenes:(data??[]).map(rowToOrden),cargando:false});
    }catch(e){if(request===sequence)set({ordenes:[],cargando:false,error:message(e)});}
  },
  cargarOrdenes:async(proyectoId)=>{
    const request=++sequence;scope=proyectoId;set({ordenes:[],ordenSeleccionada:null,cargando:true,error:null});
    try{
      const ticket=sessionTicket();
      const {data,error}=await supabase.from('ordenes').select(ORDEN_SELECT).eq('proyecto_id',proyectoId).is('deleted_at',null).order('ot',{ascending:true});
      assertSession(ticket);if(error)throw new Error(error.message);
      if(request===sequence)set({ordenes:(data??[]).map(rowToOrden),cargando:false});
    }catch(e){if(request===sequence)set({ordenes:[],cargando:false,error:message(e)});}
  },
  crearOrdenEnPosicion:async(proyectoId,posX,posY)=>{
    const max=Math.max(0,...get().ordenes.map(o=>parseInt(o.ot.replace('OT-',''),10)||0));
    const now=new Date().toISOString(),userId=useAuthStore.getState().user?.id??null;
    const row={id:uuidv4(),proyecto_id:proyectoId,ot:'OT-'+String(max+1).padStart(3,'0'),ubicacion:'',comentarios:'',estado:'Pendiente',prioridad:'Media',responsable:'',rubro:'',pos_x:posX,pos_y:posY,plano_ref_url:'',campos:{},conflict_flag:false,created_at:now,updated_at:now,created_by:userId,updated_by:userId};
    const id=await get().crearOrdenDesdeImport(rowToOrden(row));
    const saved=get().ordenes.find(o=>o.id===id);
    if(!saved)throw new Error('La obra cambió. Vuelve a abrirla para ver la orden creada.');
    return saved;
  },
  crearOrdenDesdeImport:async(datos)=>{
    exigirPermiso(datos.proyecto_id,'editar');const ticket=sessionTicket();
    const nueva={...datos,id:uuidv4(),_synced:false,_last_fetched:Date.now()} as OrdenLocal;
    const {data,error}=await supabase.from('ordenes').insert(ordenToRow(nueva)).select(ORDEN_SELECT).single();
    assertSession(ticket);if(error||!data)throw new Error(error?.message??'El servidor no confirmó la creación.');
    const saved=rowToOrden(data);
    if(scope==='*'||scope===saved.proyecto_id)set(s=>({ordenes:[...s.ordenes.filter(o=>o.id!==saved.id),saved]}));
    return saved.id;
  },
  agregarOActualizarOrden:orden=>{
    if(scope!=='*'&&scope!==orden.proyecto_id)return;
    set(s=>({ordenes:s.ordenes.some(o=>o.id===orden.id)?s.ordenes.map(o=>o.id===orden.id?orden:o):[...s.ordenes,orden]}));
  },
  aplicarEliminacionRemota:id=>set(s=>({ordenes:s.ordenes.filter(o=>o.id!==id),ordenSeleccionada:s.ordenSeleccionada===id?null:s.ordenSeleccionada})),
  moverOrden:async(id,posX,posY)=>{await get().actualizarOrden(id,{pos_x:posX as number,pos_y:posY as number});},
  actualizarOrden:async(id,cambios)=>{
    const previous=get().ordenes.find(o=>o.id===id);if(!previous)throw new Error('Vuelve a cargar la orden.');
    exigirPermiso(previous.proyecto_id,'editar');const ticket=sessionTicket();
    const patch=ordenPatchToRow(cambios,{updated_at:new Date().toISOString(),updated_by:useAuthStore.getState().user?.id??null});
    const {data,error}=await supabase.from('ordenes').update(patch).eq('id',id).select(ORDEN_SELECT).single();
    assertSession(ticket);if(error||!data)throw new Error(error?.message??'El servidor no confirmó la edición.');
    const saved=rowToOrden(data);set(s=>({ordenes:s.ordenes.map(o=>o.id===id?saved:o)}));return saved;
  },
  eliminarOrden:async(id)=>{
    const previous=get().ordenes.find(o=>o.id===id);if(!previous)throw new Error('Vuelve a cargar la orden.');
    exigirPermiso(previous.proyecto_id,'administrar');const ticket=sessionTicket();
    const {error,data}=await supabase.from('ordenes').delete().eq('id',id).select('id').single();
    assertSession(ticket);if(error||!data)throw new Error(error?.message??'El servidor no confirmó el borrado.');
    get().aplicarEliminacionRemota(id);
  },
  seleccionar:id=>set({ordenSeleccionada:id}),
  limpiar:()=>{sequence++;scope='';set({ordenes:[],ordenSeleccionada:null,cargando:false,error:null,otsPendientesImport:[]});},
  setOtsPendientesImport:ids=>set({otsPendientesImport:ids}),
  completarOtImport:id=>set(s=>({otsPendientesImport:s.otsPendientesImport.filter(x=>x!==id)})),
}));
