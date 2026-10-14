import {supabase} from '../db/supabase';
import {assertSession,sessionTicket} from '../security/sessionScope';
import type {DatosMaestros,FichaMaestra} from './masterDirectoryService';
import type {EstadoOT,PrioridadOT} from '../types/orden';

export interface ObraCliente {id:string;obra_id:string;nombre:string;proyecto_nombre:string;direccion:string|null;ciudad:string|null;tipo:string|null;activo:boolean}
export interface UbicacionCliente {id:string;cliente_id:string;proyecto_id:string;obra_id:string;nombre_obra:string;proyecto_nombre:string;direccion:string|null;ciudad:string|null;obra_tipo:string|null;tipo_inmueble:string;piso:string|null;unidad:string|null;sector:string|null;activo:boolean;datos_adicionales:DatosMaestros}
export interface FichaCliente extends FichaMaestra {ubicaciones:UbicacionCliente[]}
export interface ClienteDirectorio extends FichaCliente {indicadores:{total:number;abiertas:number;ultima:string|null;encuestasRespondidas:number;satisfaccion:number|null}}
export interface AtencionCliente {id:string;ot:string;proyecto_id:string;obra:string;unidad:string|null;torre:string|null;sector:string|null;descripcion:string|null;rubro:string;estado:EstadoOT;prioridad:PrioridadOT;ubicacion:string;responsable:string;recepcion:string;cierre:string|null;comentarios:string|null;reclamos_qr:{numero:string;fecha:string;estado:string}[]}
export interface EncuestaCliente {id:string;codigo:string;orden_id:string;ot:string;obra:string;revision_id:string|null;revision:number|null;fecha:string;datos:Record<string,string>;guardada:boolean}
export interface PerfilCliente {resumen:{total:number;pendiente:number;enProceso:number;cerrada:number;noAplica:number;diasCierre:number|null;cierresConFecha:number};meses:{mes:string;cantidad:number}[];ordenes:AtencionCliente[];encuestas:EncuestaCliente[];valoraciones:Record<string,string>[];totalOrdenes:number;totalEncuestas:number;pagina:number;tamanoPagina:number}
async function rpc<T>(name:string,args:Record<string,unknown>):Promise<T>{const ticket=sessionTicket();const r=await supabase.rpc(name,args);assertSession(ticket);if(r.error)throw new Error(r.error.message);return r.data as T}
export const listarClientes=(tenant:string)=>rpc<FichaCliente[]>('plan_clientes_fichas',{p_tenant:tenant});
export const listarDirectorioClientes=(tenant:string)=>rpc<ClienteDirectorio[]>('plan_clientes_directorio',{p_tenant:tenant});
export const listarObrasCliente=(tenant:string)=>rpc<ObraCliente[]>('plan_cliente_obras',{p_tenant:tenant});
export const listarUbicacionesCliente=(tenant:string,cliente:string)=>rpc<UbicacionCliente[]>('plan_cliente_ubicaciones_listar',{p_tenant:tenant,p_cliente:cliente});
export function guardarFichaCliente(tenant:string,id:string,datos:DatosMaestros,completa:boolean,proyecto:string,ubicacion:string,lugar:DatosMaestros,solicitud:string){
 return rpc<string>('plan_cliente_ficha_guardar',{p_tenant:tenant,p_id:id||null,p_datos:datos,p_completa:completa,p_proyecto:proyecto||null,p_ubicacion:ubicacion||null,p_lugar:lugar,p_solicitud:solicitud});
}
export function cargarPerfilCliente(tenant:string,cliente:string,desde:string|null,hasta:string|null,tab:string,pagina:number,estado:string){
 return rpc<PerfilCliente>('plan_cliente_perfil',{p_tenant:tenant,p_cliente:cliente,p_desde:desde,p_hasta:hasta,p_tab:tab,p_pagina:pagina,p_estado:estado==='Todos'?null:estado});
}
