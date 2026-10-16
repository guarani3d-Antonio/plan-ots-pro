import {supabase as commerce,contractor} from './qa-contractor-commerce-mock';
const rows:any[]=[{id:contractor,nombre:'Laura Benítez QA',identificacion:'Documento QA',contacto:'',telefono:'0000',correo:'laura@example.test',direccion:null,activo:true}];
export {setQaPlan,tenant,work} from './qa-contractor-commerce-mock';
export const supabase:any={...commerce,rpc:async(name:string,args:any)=>{
 if(name==='plan_fichas_contratistas_obra')return {data:structuredClone(rows),error:null};
 if(name==='plan_contratista_crear_desde_plan'){const f={id:crypto.randomUUID(),...args.p_datos,contacto:'',direccion:null,activo:true};rows.push(f);return {data:f,error:null};}
 return commerce.rpc(name,args);
}};
