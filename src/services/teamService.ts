import {supabase} from '../db/supabase';
import {assertSession,sessionTicket} from '../security/sessionScope';
import {prepararFotoDirectorio} from './directoryPhotoService';
export interface TeamPermission {clave:string;permitido:boolean;delegable:boolean;efectivo:boolean;editable:boolean}
export interface TeamPerson {id:string;nombre:string;email:string;avatar_path?:string;superior_id:string|null;perfil:'jefe'|'tecnico'|'ayudante'|'lector';cargo:string;activo:boolean;revision:number;cupos_tecnicos:number;cupos_ayudantes:number;editable:boolean;obras:string[];permisos:TeamPermission[]}
export interface TeamInvitation {id:string;email:string;superior_id:string;perfil:string;estado:string;usuario_id:string|null}
export interface TeamSnapshot {usuarios:TeamPerson[];obras:{id:string;nombre:string}[];invitaciones:TeamInvitation[];puede_invitar:boolean}
export async function loadTeam(tenant:string):Promise<TeamSnapshot>{const ticket=sessionTicket();const r=await supabase.rpc('plan_equipo_listar',{p_tenant:tenant});assertSession(ticket);if(r.error)throw new Error(r.error.message);return r.data as TeamSnapshot}
export async function saveTeamPermissions(tenant:string,people:TeamPerson[]):Promise<TeamSnapshot>{const ticket=sessionTicket();const r=await supabase.rpc('plan_equipo_matriz_guardar',{p_tenant:tenant,p_cambios:people.map(p=>({usuario:p.id,revision:p.revision,permisos:p.permisos.map(({clave,permitido,delegable})=>({clave,permitido,delegable}))}))});assertSession(ticket);if(r.error)throw new Error(r.error.message);return r.data as TeamSnapshot}
export async function saveTeamPerson(tenant:string,p:TeamPerson){const ticket=sessionTicket();const r=await supabase.rpc('plan_equipo_guardar',{p_tenant:tenant,p_usuario:p.id,p_revision:p.revision,p_datos:{superior_id:p.superior_id,perfil:p.perfil,cargo:p.cargo,activo:p.activo,cupos_tecnicos:p.cupos_tecnicos,cupos_ayudantes:p.cupos_ayudantes,obras:p.obras,permisos:p.permisos.map(({clave,permitido,delegable})=>({clave,permitido,delegable}))}});assertSession(ticket);if(r.error)throw new Error(r.error.message)}
export async function inviteTeam(tenant:string,superior:string,perfil:string,obras:string[],email:string,nombre:string,apellidos:string){const ticket=sessionTicket();const r=await supabase.functions.invoke('invitar-usuario',{body:{tenantId:tenant,superiorId:superior,perfil,obras,email:email.trim(),nombre:nombre.trim(),apellidos:apellidos.trim(),equipo:true,rol:perfil==='lector'?'viewer':'tecnico'}});assertSession(ticket);if(r.error){let message=r.error.message;try{const body=await r.error.context?.json();message=body?.error??message}catch{/* Response may already be consumed. */}throw new Error(message)}if(r.data?.error)throw new Error(r.data.error)}
export async function cancelTeamInvitation(id:string){const ticket=sessionTicket();const r=await supabase.rpc('plan_equipo_cancelar',{p_reserva:id});assertSession(ticket);if(r.error)throw new Error(r.error.message)}
export async function saveTeamPhoto(tenant:string,user:string,file:File){
 const ticket=sessionTicket(),blob=await prepararFotoDirectorio(file);assertSession(ticket);
 if(blob.size>1048576)throw new Error('La foto pesa demasiado. Elegí una imagen más pequeña.');
 const path=`${user}/${crypto.randomUUID()}.jpg`;
 const upload=await supabase.storage.from('profile-photos').upload(path,blob,{contentType:'image/jpeg',upsert:false});assertSession(ticket);
 if(upload.error)throw new Error(upload.error.message);
 const r=await supabase.rpc('plan_equipo_foto_guardar',{p_tenant:tenant,p_usuario:user,p_path:path});assertSession(ticket);
 if(r.error)throw new Error(r.error.message);
 return path;
}
