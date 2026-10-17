import {supabase} from '../db/supabase';
import {assertSession,sessionTicket} from '../security/sessionScope';
import type {EstadoOT,PrioridadOT} from '../types/orden';
export interface DatosResponsable {documento:string;especialidad:string;telefono:string;observaciones:string}
export interface ObraResponsable {id:string;nombre:string}
export interface ResponsableFicha {id:string;nombre:string;email:string;avatar_path:string|null;activo:boolean;cargo:string;datos:Partial<DatosResponsable>;revision:number;vinculada_en:string;editable:boolean;obras:ObraResponsable[];indicadores:{total:number;abiertas:number;cerradas:number}}
export interface DirectorioResponsables {responsables:ResponsableFicha[];sinCuenta:number}
export interface CuentaResponsable {id:string;nombre:string;email:string}
export interface TrabajoResponsable {id:string;responsable_id:string;ot:string;proyecto_id:string;obra_id:string;obra:string;descripcion:string|null;rubro:string;estado:EstadoOT;prioridad:PrioridadOT;responsable:string;ubicacion:string;recepcion:string;inicio:string|null;fin:string|null;previsto:string|null}
export interface PerfilResponsable {resumen:{total:number;pendiente:number;enProceso:number;cerrada:number;noAplica:number;vencidas:number;diasEjecucion:number|null;cierresConFecha:number;cierresConPlazo:number;cierresEnPlazo:number};obras:(ObraResponsable&{cantidad:number;abiertas:number})[];ordenes:TrabajoResponsable[];totalOrdenes:number;pagina:number;tamanoPagina:number}
async function rpc<T>(name:string,args:Record<string,unknown>):Promise<T>{const ticket=sessionTicket();const r=await supabase.rpc(name,args);assertSession(ticket);if(r.error)throw Error(r.error.message);return r.data as T}
export const listarResponsables=(tenant:string)=>rpc<DirectorioResponsables>('plan_responsables_directorio',{p_tenant:tenant});
export const cuentasResponsables=(tenant:string)=>rpc<CuentaResponsable[]>('plan_responsables_cuentas',{p_tenant:tenant});
export const guardarResponsable=(tenant:string,user:string,revision:number,datos:DatosResponsable)=>rpc<number>('plan_responsable_guardar',{p_tenant:tenant,p_usuario:user,p_revision:revision,p_datos:datos});
export const cargarPerfilResponsable=(tenant:string,user:string,desde:string|null,hasta:string|null,pagina:number,estado:string,obra:string)=>rpc<PerfilResponsable>('plan_responsable_perfil',{p_tenant:tenant,p_usuario:user,p_desde:desde,p_hasta:hasta,p_pagina:pagina,p_estado:estado==='Todos'?null:estado,p_obra:obra||null});
export const datosResponsable=(p?:Partial<DatosResponsable>):DatosResponsable=>({documento:p?.documento??'',especialidad:p?.especialidad??'',telefono:p?.telefono??'',observaciones:p?.observaciones??''});
