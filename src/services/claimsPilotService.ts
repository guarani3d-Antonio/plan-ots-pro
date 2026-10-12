import {supabase} from '../db/supabase';
import {assertSession,sessionTicket} from '../security/sessionScope';
import type {ContactoReclamo} from './portalPublicService';
export interface PortalConfig {id:string;obra_id:string;sector:string;activo:boolean;vigente:boolean;vence_en:string;cupo:number;usados:number}
export interface PortalStatus {portal:PortalConfig|null;respaldo_listo:boolean}
export interface ReclamoArchivo {id:string;file_path:string;mime:string;bytes:number;sha256:string}
export interface ReclamoEvento {id:string;accion:string;creado_en:string;motivo:string|null;orden_id:string|null}
export interface Reclamo {id:string;numero:string;datos:ContactoReclamo;estado:string;version:number;recibido_en:string;orden_id:string|null;motivo:string|null;archivos:ReclamoArchivo[];eventos:ReclamoEvento[]}
async function rpc<T>(name:string,args:Record<string,unknown>):Promise<T> {
  const ticket=sessionTicket(),result=await supabase.rpc(name,args);assertSession(ticket);
  if(result.error)throw new Error(result.error.message);return result.data as T;
}
export const estadoPortal=(work:string)=>rpc<PortalStatus>('plan_portal_piloto_estado',{p_obra:work});
export const configurarPortal=(work:string,sector:string,active:boolean)=>rpc<PortalConfig>('plan_portal_piloto_guardar',{p_obra:work,p_sector:sector,p_activar:active});
export async function listarReclamos(work:string):Promise<Reclamo[]> {
  const ticket=sessionTicket();
  const result=await supabase.from('plan_reclamos').select('id,numero,datos,estado,version,recibido_en,orden_id,motivo,archivos:plan_reclamo_archivos(id,file_path,mime,bytes,sha256),eventos:plan_reclamo_eventos(id,accion,creado_en,motivo,orden_id)').eq('obra_id',work).not('recibido_en','is',null).order('recibido_en',{ascending:true}).order('numero',{ascending:true}).limit(100);
  assertSession(ticket);if(result.error)throw new Error(result.error.message);
  return (result.data||[]).map(r=>({...r,numero:'REC-'+r.numero,datos:r.datos as ContactoReclamo,eventos:r.eventos.slice().sort((a,b)=>a.creado_en.localeCompare(b.creado_en))}));
}
export const tecnicosParaReclamo=(work:string)=>rpc<{id:string;nombre:string;detalle:string}[]>('plan_reclamo_tecnicos',{p_obra:work});
export const resolverReclamo=(r:Reclamo,action:'revisar'|'crear'|'vincular'|'archivar',order:string|null=null,reason='',technician:string|null=null)=>rpc<{estado:string;orden_id:string|null;ot:string|null}>('plan_reclamo_resolver',{p_reclamo:r.id,p_version:r.version,p_accion:action,p_orden:order,p_motivo:reason,p_tecnico:technician});
export async function ordenesParaReclamo(work:string) {
  const ticket=sessionTicket(),projects=await supabase.from('proyectos').select('id').or(`id.eq.${work},proyecto_padre_id.eq.${work}`).is('deleted_at',null);assertSession(ticket);
  if(projects.error)throw new Error(projects.error.message);
  const result=await supabase.from('ordenes').select('id,ot,descripcion,unidad_amenities').in('proyecto_id',projects.data.map(p=>p.id)).is('deleted_at',null).order('created_at',{ascending:false}).limit(1000);assertSession(ticket);
  if(result.error)throw new Error(result.error.message);
  return result.data.map(o=>({id:o.id,nombre:o.ot,detalle:[o.unidad_amenities,o.descripcion].filter(Boolean).join(' · ')}));
}
export async function verEvidenciaReclamo(path:string) {
  const ticket=sessionTicket(),result=await supabase.storage.from('fotos').createSignedUrl(path,60);assertSession(ticket);
  if(result.error)throw new Error('No se pudo abrir la evidencia privada.');return result.data.signedUrl;
}
