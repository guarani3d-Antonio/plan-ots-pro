// Public route: deliberately no auth client, private stores or session sync.
import type {ContextoPortal} from './portalPilot';
export interface ContactoReclamo {nombre:string;telefono:string;correo:string;relacion:string;unidad:string;descripcion:string;atencion:string;previo:string}
export interface ReciboReclamo {numero:string;recibido_en:string}
export interface PortalPublico extends ContextoPortal {disponible:boolean;vence_en:string;cupo:number}
export const portalConectado = () => import.meta.env.VITE_PORTAL_FUNCTION_ENABLED === 'true';
async function request<T>(portal:string, body:FormData|string):Promise<T> {
  if (!portalConectado()) throw new Error('La recepción del piloto todavía no está conectada.');
  const base=String(import.meta.env.VITE_SUPABASE_URL||'');
  if (!/^https:\/\/[^/]+\.supabase\.co\/?$/.test(base)) throw new Error('Portal sin configurar.');
  const headers:Record<string,string>={'x-plan-portal':portal};
  if(typeof body==='string')headers['Content-Type']='application/json';
  const response=await fetch(base.replace(/\/$/,'')+'/functions/v1/portal-reclamos',{method:'POST',headers,body,cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(45000)});
  const result=await response.json() as T & {error?:string};
  if(!response.ok)throw new Error(result.error||'No se pudo confirmar la solicitud.');
  return result;
}
export const cargarPortalPublico=(id:string)=>request<PortalPublico>(id,JSON.stringify({accion:'contexto'}));
export function enviarReclamoPublico(id:string,data:ContactoReclamo,photos:File[],requestId:string) {
  const body=new FormData();
  body.append('solicitud',JSON.stringify({...data,solicitud_id:requestId,consentimiento:true,aviso:'piloto-qr-v1'}));
  photos.forEach(file=>body.append('foto',file));
  return request<ReciboReclamo>(id,body);
}
