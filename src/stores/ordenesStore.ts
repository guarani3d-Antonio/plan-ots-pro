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
  actualizarOrden:(id:string,cambios:Partial<OrdenLocal>,base?:OrdenLocal)=>Promise<OrdenLocal|null>;
  cambiarEstado:(id:string,estado:OrdenLocal['estado'],comentario:string,fechaFin?:string|null,base?:OrdenLocal)=>Promise<OrdenLocal>;
  cancelarOrdenNueva:(id:string)=>Promise<void>;
  eliminarOrden:(id:string)=>Promise<void>;
  seleccionar:(id:string|null)=>void;limpiar:()=>void;
  setOtsPendientesImport:(ids:string[])=>void;completarOtImport:(id:string)=>void;
}
let sequence=0,scope='*';
const message=(e:unknown)=>e instanceof Error?e.message:'No se pudo confirmar la operación en el servidor.';
const equal=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
const newer=(incoming:OrdenLocal,current:OrdenLocal)=>
  !current.updated_at||!incoming.updated_at||Date.parse(incoming.updated_at)>=Date.parse(current.updated_at);
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
    exigirPermiso(proyectoId,'editar');const ticket=sessionTicket();
    const {data:id,error}=await supabase.rpc('plan_crear_orden',{p_proyecto:proyectoId,p_pos_x:posX,p_pos_y:posY});
    assertSession(ticket);if(error||!id)throw new Error(error?.message??'El servidor no confirmó la creación.');
    const result=await supabase.from('ordenes').select(ORDEN_SELECT).eq('id',id).single();
    assertSession(ticket);if(result.error||!result.data)throw new Error(result.error?.message??'La orden se creó, pero no pudo recuperarse.');
    const saved=rowToOrden(result.data);if(scope==='*'||scope===saved.proyecto_id)set(s=>({ordenes:[...s.ordenes.filter(o=>o.id!==saved.id),saved]}));
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
    set(s=>({ordenes:s.ordenes.some(o=>o.id===orden.id)?s.ordenes.map(o=>o.id===orden.id&&newer(orden,o)?orden:o):[...s.ordenes,orden]}));
  },
  aplicarEliminacionRemota:id=>set(s=>({ordenes:s.ordenes.filter(o=>o.id!==id),ordenSeleccionada:s.ordenSeleccionada===id?null:s.ordenSeleccionada})),
  moverOrden:async(id,posX,posY)=>{await get().actualizarOrden(id,{pos_x:posX as number,pos_y:posY as number});},
  actualizarOrden:async(id,cambios,base)=>{
    const previous=get().ordenes.find(o=>o.id===id);if(!previous)throw new Error('Vuelve a cargar la orden.');
    const original=base??previous;exigirPermiso(previous.proyecto_id,'editar');const ticket=sessionTicket();
    const patch=ordenPatchToRow(cambios,{updated_at:new Date().toISOString(),updated_by:useAuthStore.getState().user?.id??null});
    const attempt=async(expected:string)=>supabase.from('ordenes').update(patch).eq('id',id).eq('updated_at',expected).select(ORDEN_SELECT);
    let result=await attempt(original.updated_at);assertSession(ticket);
    if(result.error)throw new Error(result.error.message);
    let row=result.data?.[0];
    if(!row){
      const freshResult=await supabase.from('ordenes').select(ORDEN_SELECT).eq('id',id).single();assertSession(ticket);
      if(freshResult.error||!freshResult.data)throw new Error(freshResult.error?.message??'La orden ya no está disponible.');
      const fresh=rowToOrden(freshResult.data);get().agregarOActualizarOrden(fresh);
      const conflicts=Object.keys(cambios).filter(key=>{
        const k=key as keyof OrdenLocal;return !equal(fresh[k],original[k])&&!equal(cambios[k],fresh[k]);
      });
      if(conflicts.length)throw new Error(`La orden cambió en otra sesión (${conflicts.join(', ')}). Se conservaron los datos del servidor; revisa y vuelve a guardar.`);
      result=await attempt(fresh.updated_at);assertSession(ticket);if(result.error)throw new Error(result.error.message);row=result.data?.[0];
      if(!row)throw new Error('La orden volvió a cambiar en otra sesión. Se conservaron los datos del servidor; vuelve a intentarlo.');
    }
    const saved=rowToOrden(row);set(s=>({ordenes:s.ordenes.map(o=>o.id===id?saved:o)}));return saved;
  },
  cambiarEstado:async(id,estado,comentario,fechaFin,base)=>{
    const previous=base??get().ordenes.find(o=>o.id===id);if(!previous)throw new Error('Vuelve a cargar la orden.');
    exigirPermiso(previous.proyecto_id,'editar');const ticket=sessionTicket();
    const {error}=await supabase.rpc('plan_cambiar_estado_orden',{p_orden:id,p_expected_at:previous.updated_at,p_estado:estado,p_fecha_fin:fechaFin??null,p_comentario:comentario});
    assertSession(ticket);if(error)throw new Error(error.message);
    const result=await supabase.from('ordenes').select(ORDEN_SELECT).eq('id',id).single();assertSession(ticket);
    if(result.error||!result.data)throw new Error(result.error?.message??'El estado cambió, pero no pudo recuperarse.');
    const saved=rowToOrden(result.data);set(s=>({ordenes:s.ordenes.map(o=>o.id===id?saved:o)}));return saved;
  },
  cancelarOrdenNueva:async(id)=>{
    const previous=get().ordenes.find(o=>o.id===id);if(!previous)throw new Error('Vuelve a cargar la orden.');
    exigirPermiso(previous.proyecto_id,'editar');const ticket=sessionTicket();
    const {error}=await supabase.rpc('plan_cancelar_orden_nueva',{p_orden:id});assertSession(ticket);
    if(error)throw new Error(error.message);get().aplicarEliminacionRemota(id);
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
