import {supabase} from '../db/supabase';
import {sessionTicket,assertSession} from '../security/sessionScope';
import {tienePermiso} from '../stores/accessStore';
export interface Respaldo {id:string;tenant_id:string|null;creado_en:string;corte_en:string|null;estado:'pendiente'|'procesando'|'creada'|'incompleta'|'error';tarea:string;bytes:number|null;objetos:number|null;filas:number|null;integridad_en:string|null;recuperacion_en:string|null;informe:Record<string,unknown>|null;error:string|null}
export interface ConfigRespaldo {activo:boolean;intervalo_horas:number;destino:string;max_bytes:number;conservacion:{diarias:number;semanales:number;mensuales:number};siguiente_en:string|null;motor_en:string|null}
export interface EstadoRespaldo {destino:string;motor_en:string|null;motor_disponible:boolean;automatico:boolean;listo_para_piloto:boolean;puede_programar:boolean;copia_en:string|null;recuperacion_en:string|null}
export interface InventarioRespaldo {capturado_en:string;alcance:string;tablas:{nombre:string;filas:number;columnas:string[]}[];buckets:{id:string;objetos:number;bytes:number;sin_tamano:number}[]}
export async function cargarRespaldos(tenant:string|null){const ticket=sessionTicket();let q=supabase.from('plan_respaldos').select('id,tenant_id,creado_en,corte_en,estado,tarea,bytes,objetos,filas,integridad_en,recuperacion_en,informe,error').order('creado_en',{ascending:false}).limit(50);q=tenant?q.eq('tenant_id',tenant):q.is('tenant_id',null);const [jobs,cfg,state]=await Promise.all([q,supabase.from('plan_respaldo_config').select('*').eq('id',true).single(),supabase.rpc('plan_respaldo_estado',{p_tenant:tenant})]);assertSession(ticket);const failures=[['historial',jobs.error],['configuración',cfg.error],['estado',state.error]] as const;const failed=failures.filter(([,error])=>error);if(failed.length)throw new Error('No se pudo consultar el respaldo. '+failed.map(([name,error])=>name+': '+(error?.code||'sin respuesta de red')).join(' · ')+'. Usá Actualizar para reintentar.');return {jobs:jobs.data as Respaldo[],config:cfg.data as ConfigRespaldo,status:state.data as EstadoRespaldo};}
export async function inventarioRespaldo(){const ticket=sessionTicket();const r=await supabase.rpc('plan_respaldo_inventario');assertSession(ticket);if(r.error)throw new Error(r.error.message);return r.data as InventarioRespaldo;}
export async function solicitarRespaldo(tenant:string|null,solicitud:string){const ticket=sessionTicket();const r=await supabase.rpc('plan_respaldo_solicitar',{p_tenant:tenant,p_solicitud:solicitud});assertSession(ticket);if(r.error)throw new Error(r.error.message);return String(r.data);}
export async function verificarRespaldo(id:string){const ticket=sessionTicket();const r=await supabase.rpc('plan_respaldo_verificar',{p_id:id});assertSession(ticket);if(r.error)throw new Error(r.error.message);}
export async function programarRespaldo(activo:boolean,horas:number){const ticket=sessionTicket();const r=await supabase.rpc('plan_respaldo_programar',{p_activo:activo,p_horas:horas});assertSession(ticket);if(r.error)throw new Error(r.error.message);}
export function descargaRespaldoDisponible(){return !!import.meta.env.VITE_BACKUP_SERVICE_URL || import.meta.env.VITE_BACKUP_DOWNLOAD_FUNCTION_ENABLED === 'true';}
export async function descargarRespaldo(id:string){
 const ticket=sessionTicket();
 if(!tienePermiso('plataforma'))throw new Error('Sin permiso');
 if(!descargaRespaldoDisponible())throw new Error('Falta conectar el servicio de descarga segura.');
 const {data:{session}}=await supabase.auth.getSession();assertSession(ticket);
 if(!session)throw new Error('Iniciá sesión');
 const base=import.meta.env.VITE_BACKUP_SERVICE_URL;
 let result:unknown;
 if(base){
  if(new URL(base).protocol!=='https:')throw new Error('El servicio debe usar HTTPS.');
  const r=await fetch(base.replace(/\/$/,'')+'/download',{method:'POST',headers:{Authorization:'Bearer '+session.access_token,'Content-Type':'application/json'},body:JSON.stringify({id}),cache:'no-store',signal:AbortSignal.timeout(20000)});
  assertSession(ticket);if(!r.ok)throw new Error('No se pudo autorizar la descarga.');result=await r.json();
 }else{
  const r=await supabase.functions.invoke('descargar-respaldo',{body:{id},headers:{Authorization:'Bearer '+session.access_token},signal:AbortSignal.timeout(20000)});
  assertSession(ticket);if(r.error)throw new Error('No se pudo autorizar la descarga segura.');result=r.data;
 }
 assertSession(ticket);
 const url=result && typeof result==='object' && 'url' in result ? result.url : null;
 if(typeof url!=='string')throw new Error('Enlace de descarga inválido');
 const parsed=new URL(url);
 if(parsed.protocol!=='https:' || parsed.username || parsed.password)throw new Error('Enlace de descarga inválido');
 const a=document.createElement('a');a.href=url;a.rel='noopener';a.download=`plan-ots-${id}.potbackup`;a.click();
}
export function descargarInformeRespaldo(job:Respaldo){const blob=new Blob([JSON.stringify({respaldo:job.id,alcance:job.tenant_id??'plataforma',corte:job.corte_en,integridad:job.integridad_en,recuperacion:job.recuperacion_en,informe:job.informe},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`verificacion-${job.id}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
