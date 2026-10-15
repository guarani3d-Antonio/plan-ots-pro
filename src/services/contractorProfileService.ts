import {supabase} from '../db/supabase';
import {assertSession,sessionTicket} from '../security/sessionScope';
import type {FichaMaestra} from './masterDirectoryService';
import type {EstadoOT,PrioridadOT} from '../types/orden';
export interface ObraContratista {id:string;nombre:string;cantidad:number}
export interface ContratistaDirectorio extends FichaMaestra {obras:ObraContratista[];indicadores:{total:number;abiertas:number;ultima:string|null}}
export interface TrabajoContratista {id:string;contratista_id:string;ot:string;proyecto_id:string;obra_id:string;obra:string;descripcion:string|null;rubro:string;estado:EstadoOT;prioridad:PrioridadOT;responsable:string;ubicacion:string;recepcion:string;inicio:string|null;fin:string|null;previsto:string|null;compartida:boolean}
export interface PerfilContratistaDatos {resumen:{total:number;pendiente:number;enProceso:number;cerrada:number;noAplica:number;diasEjecucion:number|null;cierresConFecha:number};obras:ObraContratista[];ordenes:TrabajoContratista[];totalOrdenes:number;pagina:number;tamanoPagina:number}
async function rpc<T>(name:string,args:Record<string,unknown>):Promise<T>{const ticket=sessionTicket();const r=await supabase.rpc(name,args);assertSession(ticket);if(r.error)throw Error(r.error.message);return r.data as T}
export const listarDirectorioContratistas=(tenant:string)=>rpc<ContratistaDirectorio[]>('plan_contratistas_directorio',{p_tenant:tenant});
export const cargarPerfilContratista=(tenant:string,id:string,desde:string|null,hasta:string|null,pagina:number,estado:string)=>rpc<PerfilContratistaDatos>('plan_contratista_perfil',{p_tenant:tenant,p_contratista:id,p_desde:desde,p_hasta:hasta,p_pagina:pagina,p_estado:estado==='Todos'?null:estado});
