import { supabase } from '../db/supabase';
import { assertSession, sessionTicket } from '../security/sessionScope';

export interface ContactoObra { id:string; nombre:string; cargo:string|null; telefono:string|null; correo:string|null }
export interface FichaObra { id:string; nombre:string; proyecto_nombre:string; direccion:string|null; contactos:ContactoObra[] }
export interface FichaContratista { id:string; nombre:string; identificacion:string|null; contacto:string|null; telefono:string|null; correo:string|null; direccion:string|null; activo:boolean; nombre_ot?:string }
export interface FichaCliente extends FichaContratista { tenant_id:string }
export async function fichaCliente(clienteId:string,proyectoId:string):Promise<FichaCliente> {
 const ticket=sessionTicket();const {data,error}=await supabase.rpc('plan_ficha_cliente',{p_cliente:clienteId,p_proyecto:proyectoId});assertSession(ticket);
 if(error)throw new Error(error.message);return data as FichaCliente;
}
export async function fichaObra(proyectoId:string):Promise<FichaObra> {
 const ticket=sessionTicket();const {data,error}=await supabase.rpc('plan_ficha_obra',{p_proyecto:proyectoId});assertSession(ticket);
 if(error)throw new Error(error.message);return data as FichaObra;
}
export async function fichasContratista(proyectoId:string):Promise<FichaContratista[]> {
 const ticket=sessionTicket();const {data,error}=await supabase.rpc('plan_fichas_contratistas_obra',{p_proyecto:proyectoId});assertSession(ticket);
 if(error)throw new Error(error.message);return (data??[]) as FichaContratista[];
}
export async function contratistasDeOT(ordenId:string):Promise<FichaContratista[]> {
 const ticket=sessionTicket();const {data,error}=await supabase.rpc('plan_contratistas_vinculados_ot',{p_orden:ordenId});assertSession(ticket);
 if(error)throw new Error(error.message);return (data??[]) as FichaContratista[];
}
