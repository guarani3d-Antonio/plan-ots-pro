import { supabase } from '../db/supabase';
import { assertSession, sessionTicket } from '../security/sessionScope';
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


export async function getCamposDeProyecto(proyectoId:string):Promise<CampoDefinicion[]> {
  const ticket=sessionTicket();
  const {data,error}=await supabase.from('campos_definicion').select('*').eq('proyecto_id',proyectoId).order('orden',{ascending:true});
  assertSession(ticket);if(error)throw new Error(error.message);return data as CampoDefinicion[];
}
export async function crearCampo(payload:NuevoCampoPayload):Promise<CampoDefinicion> {
  const ticket=sessionTicket(),existing=await getCamposDeProyecto(payload.proyecto_id);
  const nuevo={id:uuidv4(),...payload,obligatorio:payload.obligatorio??false,opciones:payload.opciones??null,formula:null,orden:Math.max(0,...existing.map(c=>c.orden))+1,created_at:new Date().toISOString()};
  const {data,error}=await supabase.from('campos_definicion').insert(nuevo).select().single();
  assertSession(ticket);if(error||!data)throw new Error(error?.message??'No se confirmó la creación.');return data as CampoDefinicion;
}
export async function actualizarCampo(id:string,cambios:Partial<Pick<CampoDefinicion,'nombre'|'obligatorio'|'opciones'|'orden'>>):Promise<void> {
  const ticket=sessionTicket();const {data,error}=await supabase.from('campos_definicion').update(cambios).eq('id',id).select('id').single();
  assertSession(ticket);if(error||!data)throw new Error(error?.message??'No se confirmó la edición.');
}
export async function eliminarCampo(id:string):Promise<void> {
  const ticket=sessionTicket();const {data,error}=await supabase.from('campos_definicion').delete().eq('id',id).select('id').single();
  assertSession(ticket);if(error||!data)throw new Error(error?.message??'No se confirmó el borrado.');
}
export async function reordenarCampos(ids:string[]):Promise<void> {
  for(let i=0;i<ids.length;i++)await actualizarCampo(ids[i],{orden:i+1});
}
