import { supabase } from '../db/supabase';
import { assertSession, sessionTicket } from '../security/sessionScope';

export type TipoMaestro = 'empresa'|'obra'|'cliente'|'contratista'|'contacto';
export type DatosMaestros = Record<string,string|boolean|null>;
export interface VinculoContacto {id:string;contacto_id:string;contacto_nombre:string;telefono:string|null;correo:string|null;contacto_activo:boolean;funcion:string;activo:boolean;principal:boolean;empresa_id:string|null;obra_id:string|null;cliente_id:string|null;contratista_id:string|null;ubicacion_id:string|null}
export interface FichaMaestra {id:string;tenant_id:string;datos:DatosMaestros;completa:boolean;codigo:number|null;actualizado_en:string|null;vinculos:VinculoContacto[]}
export interface CampoMaestro {key:string;label:string;ejemplo?:string;area?:boolean;full?:boolean;opciones?:readonly string[];max?:number}
export interface GrupoMaestro {nombre:string;extra?:boolean;campos:CampoMaestro[]}
const c=(key:string,label:string,ejemplo?:string,full=false):CampoMaestro=>({key,label,ejemplo,full});
const area=(key:string,label:string,ejemplo:string):CampoMaestro=>({...c(key,label,ejemplo,true),area:true,max:4000});
const canal:CampoMaestro={key:'canal',label:'Canal preferido',opciones:['Teléfono','WhatsApp','Correo']};
const domicilio=[c('direccion','Dirección','Ej.: Av. España 123',true),c('ciudad','Ciudad','Ej.: Asunción'),c('pais','País','Ej.: Paraguay')];
const contacto=[c('telefono','Teléfono','Ej.: +595 981 123 456'),c('correo','Correo','Ej.: contacto@ejemplo.com')];
export const gruposMaestros:Record<TipoMaestro,GrupoMaestro[]>={
 empresa:[{nombre:'Identificación',campos:[{...c('nombre','Nombre comercial','Ej.: BBC Facility Services',true),max:180},c('razon_social','Razón social','Ej.: BBC Servicios S.A.',true),c('identificacion','RUC','Ej.: 80000000-1'),c('rubro','Rubro','Ej.: Mantenimiento edilicio')]},{nombre:'Domicilio y contacto',campos:[...domicilio,...contacto]},{nombre:'Información adicional',extra:true,campos:[c('web','Sitio web','Ej.: https://ejemplo.com'),c('whatsapp','WhatsApp'),c('direccion_operativa','Dirección operativa',undefined,true),area('observaciones','Observaciones','Ej.: Datos adicionales para la gestión de la empresa.')]}],
 obra:[{nombre:'Identificación y ubicación',campos:[{...c('nombre','Nombre de la obra','Ej.: Distrito Perseverancia',true),max:180},{key:'tipo',label:'Tipo de obra',opciones:['Residencial','Oficinas','Industrial','Comercial','Otro']},c('ciudad','Ciudad','Ej.: Asunción'),c('direccion','Dirección','Ej.: Bernardino Caballero 236',true)]},{nombre:'Acceso y referencias',extra:true,campos:[c('barrio','Barrio'),c('mapa','Enlace de ubicación'),c('horarios','Horarios de acceso','Ej.: Lunes a viernes, 08:00 a 17:00',true),area('acceso','Indicaciones de acceso','Ej.: Anunciarse en recepción y coordinar con la administradora.'),area('descripcion','Descripción de la obra','Ej.: Torre residencial con áreas comunes.'),area('observaciones','Observaciones','Ej.: Recomendaciones para coordinar trabajos.')]}],
 cliente:[{nombre:'Identificación',campos:[{key:'tipo',label:'Tipo de cliente',opciones:['persona','empresa']},c('identificacion','CI / RUC','Ej.: Número de documento'),c('nombre','Nombre / nombre comercial','Ej.: Lucía Pérez',true),c('razon_social','Razón social','Ej.: Nombre legal de la empresa',true)]},{nombre:'Contacto',campos:[...contacto,canal,c('contacto','Representante / persona de contacto','Ej.: Nombre del representante')]},{nombre:'Domicilio y notas',extra:true,campos:[...domicilio,area('observaciones','Observaciones internas','Ej.: Preferencias para coordinar la atención.')]}],
 contratista:[{nombre:'Identificación',campos:[{key:'tipo',label:'Tipo de contratista',opciones:['independiente','empresa']},c('identificacion','CI / RUC','Ej.: Número de documento'),c('nombre','Nombre / nombre comercial','Ej.: Electricidad Pérez',true),c('razon_social','Razón social',undefined,true),c('especialidad','Especialidad principal','Ej.: Electricidad',true)]},{nombre:'Contacto',campos:contacto},{nombre:'Cobertura y notas',extra:true,campos:[...domicilio,c('especialidades','Otras especialidades','Ej.: Tableros, iluminación',true),c('zonas','Zonas de atención','Ej.: Asunción y Gran Asunción',true),area('observaciones','Observaciones','Ej.: Información para coordinar su contratación.')]}],
 contacto:[{nombre:'Identificación y comunicación',campos:[c('nombre','Nombre y apellido','Ej.: Ana López',true),...contacto,canal,c('horarios','Horario de contacto','Ej.: 08:00 a 17:00')]},{nombre:'Información adicional',extra:true,campos:[c('telefono_alternativo','Teléfono alternativo'),c('correo_alternativo','Correo alternativo'),area('observaciones','Observaciones','Ej.: Preferencias de contacto y referencias.')]}],
};
export const nombresMaestros:Record<TipoMaestro,{plural:string;singular:string;color:string}>={empresa:{plural:'Empresas',singular:'empresa',color:'#64748B'},obra:{plural:'Obras',singular:'obra',color:'#3B82F6'},cliente:{plural:'Clientes',singular:'cliente',color:'#A855F7'},contratista:{plural:'Contratistas',singular:'contratista',color:'#F59E0B'},contacto:{plural:'Contactos',singular:'contacto',color:'#14B8A6'}};
const claves=new Set([...Object.values(gruposMaestros).flatMap(gs=>gs.flatMap(g=>g.campos.map(f=>f.key))),'activo','color','contacto_principal_id','funcion_contacto','potencialmente_conflictivo','vinculo_tipo','vinculo_id','funcion']);
export function datosEditables(datos:DatosMaestros):DatosMaestros{return Object.fromEntries(Object.entries(datos).filter(([key])=>claves.has(key)))}
export function datosNuevos(tipo:TipoMaestro):DatosMaestros{return {nombre:'',activo:true,...(tipo==='obra'?{color:'#3B82F6'}:{}),...(tipo==='cliente'?{potencialmente_conflictivo:null}:{})}}
export function clavesRequeridasFicha(tipo:TipoMaestro,d:DatosMaestros):string[]{
 const requeridos=['nombre'];
 if(tipo==='empresa')requeridos.push('razon_social','identificacion','rubro','direccion','ciudad','pais','telefono','correo','contacto_principal_id','funcion_contacto');
 if(tipo==='obra')requeridos.push('tipo','direccion','ciudad','color','contacto_principal_id','funcion_contacto');
 if(tipo==='cliente'){requeridos.push('tipo');if(d.tipo==='empresa')requeridos.push('razon_social','identificacion')}
 if(tipo==='contratista'){requeridos.push('tipo','identificacion','especialidad','telefono','correo','contacto_principal_id','funcion_contacto');if(d.tipo==='empresa')requeridos.push('razon_social')}
 if(tipo==='contacto')requeridos.push('vinculo_tipo','vinculo_id','funcion');
 return requeridos;
}
export function faltantesFicha(tipo:TipoMaestro,d:DatosMaestros):string[]{
 const requeridos=clavesRequeridasFicha(tipo,d);
 const labels=gruposMaestros[tipo].flatMap(g=>g.campos);
 const missing=requeridos.filter(k=>!String(d[k]??'').trim()).map(k=>labels.find(f=>f.key===k)?.label??({contacto_principal_id:'Contacto principal',funcion_contacto:'Función del contacto',vinculo_tipo:'Entidad vinculada',vinculo_id:'Registro vinculado',funcion:'Función'}[k]??k));
 if((tipo==='cliente'||tipo==='contacto')&&!String(d.telefono??'').trim()&&!String(d.correo??'').trim())missing.push('Teléfono o correo');
 if(tipo==='cliente'&&typeof d.potencialmente_conflictivo!=='boolean')missing.push('Potencialmente conflictivo: Sí o No');
 return missing;
}
export const normalizarMaestro=(v:string)=>v.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('es');
export async function listarMaestros(tipo:TipoMaestro,tenant:string):Promise<FichaMaestra[]>{const ticket=sessionTicket();const r=await supabase.rpc('plan_directorio_listar',{p_tipo:tipo,p_tenant:tenant||null});assertSession(ticket);if(r.error)throw new Error(r.error.message);return (r.data??[]) as FichaMaestra[]}
export async function guardarMaestro(tipo:TipoMaestro,tenant:string,id:string,datos:DatosMaestros,completa:boolean):Promise<string>{const ticket=sessionTicket();const r=await supabase.rpc('plan_directorio_guardar',{p_tipo:tipo,p_tenant:tenant||null,p_id:id||null,p_datos:datosEditables(datos),p_completa:completa});assertSession(ticket);if(r.error)throw new Error(r.error.message);return String(r.data)}
export async function vincularContacto(tenant:string,contacto:string,tipo:string,entidad:string,funcion:string,activo=true,principal=false){const ticket=sessionTicket();const r=await supabase.rpc('plan_vincular_contacto',{p_tenant:tenant,p_contacto:contacto,p_tipo:tipo,p_entidad:entidad,p_funcion:funcion,p_activo:activo,p_principal:principal});assertSession(ticket);if(r.error)throw new Error(r.error.message)}
