import {supabase} from '../db/supabase';
import {assertSession,sessionTicket} from '../security/sessionScope';
import type {ConformidadRegistrada,SeguimientoConformidad} from './customerConformityModel';
export interface EstadoConformidad {conformidad:ConformidadRegistrada|null;pendientes:SeguimientoConformidad[]}
export async function cargarConformidad(revision:string):Promise<EstadoConformidad>{const ticket=sessionTicket();const {data,error}=await supabase.rpc('plan_documento_conformidad_leer',{p_revision:revision});assertSession(ticket);if(error)throw new Error(error.message);return data as EstadoConformidad;}
export async function resolverPendienteConformidad(pendiente:string,constancia:string,solicitud:string):Promise<void>{const ticket=sessionTicket();const {error}=await supabase.rpc('plan_documento_pendiente_resolver',{p_pendiente:pendiente,p_constancia:constancia,p_solicitud:solicitud});assertSession(ticket);if(error)throw new Error(error.message);}
