import {supabase} from '../db/supabase';
import {assertSession,sessionTicket} from '../security/sessionScope';
export interface ObraContacto {vinculo_id:string;id:string;nombre:string;direccion:string;funcion:string;activo:boolean;principal:boolean;tipo:string;entidad_id:string;referencia:string}
export interface DatosContacto {nombre:string;telefono:string;correo:string;telefono_alternativo:string;correo_alternativo:string;canal:string;horarios:string;observaciones:string;activo?:boolean}
export interface ContactoFicha {id:string;tenant_id:string;codigo:number|null;actualizado_en:string;datos:DatosContacto;obras:ObraContacto[];indicadores:{total:number;ultima:string|null;pendientes:number}}
export interface OpcionObraContacto {id:string;nombre:string;direccion:string}
export interface ComunicacionContacto {id:string;obra_id:string;obra:string;orden_id:string|null;ot:string|null;fecha:string;canal:string;direccion:string;asunto:string;resumen:string;resultado:string;estado_actual:string;seguimiento:string|null;actor_nombre:string;registrado_en:string;respuesta_a:string|null}
export interface DatosComunicacion {obra_id:string;orden_id:string|null;fecha:string;canal:string;direccion:string;asunto:string;resumen:string;resultado:string;seguimiento:string|null;respuesta_a:string|null}
export interface HistorialContacto {registros:ComunicacionContacto[];total:number;pagina:number}
async function rpc<T>(nombre:string,args:Record<string,unknown>):Promise<T>{const ticket=sessionTicket();const r=await supabase.rpc(nombre,args);assertSession(ticket);if(r.error)throw new Error(r.error.message);return r.data as T}
export const datosContacto=(d?:Partial<DatosContacto>):DatosContacto=>({nombre:'',telefono:'',correo:'',telefono_alternativo:'',correo_alternativo:'',canal:'WhatsApp',horarios:'',observaciones:'',...d});
export const listarContactos=(tenant:string)=>rpc<ContactoFicha[]>('plan_contactos_directorio',{p_tenant:tenant});
export const opcionesContacto=(tenant:string,obra?:string,buscar='')=>rpc<{obras:OpcionObraContacto[];ordenes:{id:string;nombre:string}[]}>('plan_contacto_opciones',{p_tenant:tenant,p_obra:obra||null,p_buscar:buscar});
export const guardarContacto=(tenant:string,id:string|null,actualizado:string|null,datos:DatosContacto,obra='',funcion='',solicitud?:string)=>rpc<string>('plan_contacto_ficha_guardar',{p_tenant:tenant,p_id:id,p_actualizado:actualizado,p_datos:Object.fromEntries(Object.entries(datos).filter(([k])=>k!=='activo')),p_obra:obra||null,p_funcion:funcion||null,p_solicitud:solicitud??null});
export const guardarVinculoContacto=(tenant:string,contacto:string,obra:string,funcion:string,principal:boolean,activo=true,tipo='obra')=>rpc<string>('plan_contacto_vinculo_guardar',{p_tenant:tenant,p_contacto:contacto,p_tipo:tipo,p_entidad:obra,p_funcion:funcion,p_principal:principal,p_activo:activo});
export const guardarComunicacion=(tenant:string,contacto:string,id:string,datos:DatosComunicacion)=>rpc<string>('plan_contacto_comunicacion_guardar',{p_tenant:tenant,p_contacto:contacto,p_id:id,p_datos:datos});
export const historialContacto=(tenant:string,contacto:string,obra='',canal='',pagina=0)=>rpc<HistorialContacto>('plan_contacto_historial',{p_tenant:tenant,p_contacto:contacto,p_obra:obra||null,p_canal:canal||null,p_pagina:pagina});
export const fechaContacto=(v:string|null)=>v?new Date(v.length===10?v+'T00:00:00':v).toLocaleDateString('es-PY'):'Sin registrar';
