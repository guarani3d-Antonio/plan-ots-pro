import {supabase as base} from './qa-contractor-commerce-mock';
export const supabase={...base,rpc:async(name:string,args:unknown)=>{
 if(['plan_contratistas_directorio','plan_contratista_perfil'].includes(name))await new Promise(r=>setTimeout(r,1800));
 return base.rpc(name,args);
}};
