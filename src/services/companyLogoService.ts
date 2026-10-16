import {supabase} from '../db/supabase';
import {assertSession,sessionTicket} from '../security/sessionScope';
import {validarLogoData} from './documentBranding';
export async function cargarMarcaEmpresaProyecto(proyecto:string):Promise<{nombre:string;logo?:string}>{
 const ticket=sessionTicket(),r=await supabase.rpc('plan_empresa_marca_obra',{p_proyecto:proyecto});assertSession(ticket);
 if(r.error||!r.data?.tenant_id)throw Error(r.error?.message??'No se pudo consultar la empresa emisora.');
 return {nombre:r.data.nombre,logo:await cargarLogoEmpresa(r.data.tenant_id,r.data.logo_path)};
}
export async function cargarLogoEmpresa(tenant:string,path:string|null):Promise<string|undefined>{
 const ticket=sessionTicket();
 if(!path)return undefined;
 if(!new RegExp(`^empresa/${tenant}/[0-9a-f-]{36}\\.jpg$`,'i').test(path))throw Error('El logo no corresponde a la empresa del documento.');
 const r=await supabase.storage.from('directory-photos').download(path);assertSession(ticket);if(r.error||!r.data)throw Error('No se pudo recuperar el logo conservado.');
 if(r.data.size>2097152)throw Error('El logo supera el tamaño permitido.');
 const data=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(Error('No se pudo leer el logo.'));reader.readAsDataURL(r.data);});assertSession(ticket);validarLogoData(data);return data;
}
