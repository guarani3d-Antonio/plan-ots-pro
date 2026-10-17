import {supabase as base,tenant,work,work2,qaResponsibleRequests} from './qa-responsible-profiles-mock';
export {tenant,work,work2,qaResponsibleRequests};
export const otherTenant='61000000-0000-4000-8000-000000000011';
export const requests:{name:string;tenant:string}[]=[];
const ok=(data:unknown)=>({data:structuredClone(data),error:null});
const client={id:'qa-client',tenant_id:tenant,datos:{nombre:'Lucía Gómez QA',identificacion:'Documento QA',activo:true,correo:'lucia@example.test'},completa:false,codigo:1,actualizado_en:null,vinculos:[],ubicaciones:[{id:'qa-lugar',cliente_id:'qa-client',proyecto_id:work,obra_id:work,nombre_obra:'Edificio Bernardino QA',proyecto_nombre:'Edificio Bernardino QA',direccion:'Dirección QA',activo:true,datos_adicionales:{torre:'A'},unidad:'402'}],indicadores:{total:2,abiertas:1,ultima:'2026-10-15',encuestasRespondidas:0,satisfaccion:null}};
const contractor={id:'qa-contractor',tenant_id:tenant,datos:{nombre:'Contratista QA',especialidad:'Electricidad',activo:true,correo:'contratista@example.test'},completa:false,codigo:2,actualizado_en:null,vinculos:[],obras:[{id:work2,nombre:'Casa QA',cantidad:1}],indicadores:{total:1,abiertas:1,ultima:'2026-10-16'}};
export const supabase:any={...base,rpc:async(name:string,a:any)=>{
 requests.push({name,tenant:a.p_tenant??''});
 await new Promise(r=>setTimeout(r,150));
 if(name==='plan_clientes_directorio'||name==='plan_clientes_fichas')return ok(a.p_tenant===tenant?[client]:[]);
 if(name==='plan_contratistas_directorio')return ok(a.p_tenant===tenant?[contractor]:[]);
 if(name==='plan_directorio_listar')return ok(a.p_tipo==='empresa'?[{id:a.p_tenant,datos:{activo:true},vinculos:[]}]:[]);
 if(name==='plan_cliente_ubicaciones_listar'||name==='plan_cliente_obras')return ok([]);
 return base.rpc(name,a);
}};
