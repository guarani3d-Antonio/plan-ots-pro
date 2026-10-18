import {supabase as base,tenant,work,work2} from './qa-directory-mock';
export {tenant,work,work2};
export const requests:{name:string;args:any}[]=[];
let fail=false,failPhoto=false;export const failContactSave=()=>{fail=true};export const failContactPhoto=()=>{failPhoto=true};
const people:any[]=[{id:'contact-qa',tenant_id:tenant,codigo:1,actualizado_en:'2026-10-18T08:00:00Z',datos:{nombre:'Paula Rojas QA',telefono:'0981555010',correo:'paula@example.test',canal:'WhatsApp',horarios:'08:00 a 17:00',observaciones:'Coordina el ingreso de técnicos.',activo:true},obras:[{vinculo_id:'link-qa',id:work,nombre:'Edificio Bernardino QA',direccion:'Dirección de la obra QA',funcion:'Administradora',activo:true,principal:true,tipo:'obra',entidad_id:work,referencia:'Edificio Bernardino QA'}]}];
const records:any[]=[{id:'log-qa',contacto_id:'contact-qa',obra_id:work,obra:'Edificio Bernardino QA',orden_id:null,ot:null,fecha:'2026-10-17T14:00:00Z',canal:'Llamada',direccion:'Saliente',asunto:'Confirmar acceso',resumen:'Se solicitó confirmar el horario de ingreso.',resultado:'Pendiente de respuesta',estado_actual:'Pendiente de respuesta',seguimiento:'2026-10-20',actor_nombre:'Ana Benítez QA',registrado_en:'2026-10-17T14:00:00Z',respuesta_a:null}];
const ok=(data:unknown)=>({data:structuredClone(data),error:null});
const options=[{id:work,nombre:'Edificio Bernardino QA',direccion:'Dirección QA'},{id:work2,nombre:'Casa QA',direccion:'Casa QA'}],tokens=new Map<string,string>();let revision=0;
export const supabase:any={...base,rpc:async(name:string,a:any)=>{
 requests.push({name,args:structuredClone(a)});await new Promise(r=>setTimeout(r,160));
 if(name==='plan_contactos_directorio')return ok(a.p_tenant===tenant?people.map(p=>{const logs=records.filter(e=>e.contacto_id===p.id);return {...p,indicadores:{total:logs.length,ultima:logs.at(-1)?.fecha??null,pendientes:logs.filter(e=>e.resultado==='Pendiente de respuesta'&&!records.some(r=>r.respuesta_a===e.id&&r.resultado==='Resuelto')).length}}}):[]);
 if(name==='plan_contacto_opciones')return ok({obras:a.p_tenant===tenant?options:[],ordenes:a.p_obra===work?[{id:'ot-qa',nombre:'OT-003061 · Reparación QA'}]:[]});
 if(name==='plan_contacto_ficha_guardar'){
  if(fail){fail=false;return {data:null,error:{message:'Error simulado. Conservá los datos y reintentá.'}}}
  if(!a.p_id&&tokens.has(a.p_solicitud))return ok(tokens.get(a.p_solicitud));
  let p=people.find(p=>p.id===a.p_id);if(p&&p.actualizado_en!==a.p_actualizado)return {data:null,error:{message:'La ficha cambió. Volvé a abrirla.'}};
  if(!p){p={id:crypto.randomUUID(),tenant_id:tenant,codigo:people.length+1,obras:[{vinculo_id:crypto.randomUUID(),id:a.p_obra,nombre:options.find(o=>o.id===a.p_obra)?.nombre,direccion:'Dirección QA',funcion:a.p_funcion,tipo:'obra',entidad_id:a.p_obra,activo:true,principal:false}],datos:{activo:true}};people.push(p);tokens.set(a.p_solicitud,p.id)}
  p.datos={...p.datos,...a.p_datos};p.actualizado_en='2026-10-18T08:00:'+String(++revision).padStart(2,'0')+'Z';return ok(p.id);
 }
 if(name==='plan_contacto_vinculo_guardar'){const p=people.find(p=>p.id===a.p_contacto),v=p.obras.find((o:any)=>o.entidad_id===a.p_entidad);const d={vinculo_id:v?.vinculo_id??crypto.randomUUID(),id:a.p_entidad,nombre:options.find(o=>o.id===a.p_entidad)?.nombre,direccion:'Dirección QA',funcion:a.p_funcion,tipo:'obra',entidad_id:a.p_entidad,activo:a.p_activo,principal:a.p_principal};if(v)Object.assign(v,d);else p.obras.push(d);return ok(d.vinculo_id)}
 if(name==='plan_contacto_comunicacion_guardar'){if(!records.some(e=>e.id===a.p_id))records.push({id:a.p_id,contacto_id:a.p_contacto,...a.p_datos,obra:options.find(o=>o.id===a.p_datos.obra_id)?.nombre,ot:a.p_datos.orden_id?'OT-003061':null,actor_nombre:'Ana Benítez QA',registrado_en:new Date().toISOString()});return ok(a.p_id)}
 if(name==='plan_contacto_historial'){const all=records.filter(e=>e.contacto_id===a.p_contacto&&(!a.p_obra||e.obra_id===a.p_obra)&&(!a.p_canal||e.canal===a.p_canal)).sort((a,b)=>b.fecha.localeCompare(a.fecha));return ok({registros:all.slice(a.p_pagina*20,(a.p_pagina+1)*20).map(e=>({...e,estado_actual:records.some(r=>r.respuesta_a===e.id&&r.resultado==='Resuelto')?'Resuelto por respuesta':e.resultado})),total:all.length,pagina:a.p_pagina})}
 if(name==='plan_foto_directorio'&&a.p_tipo==='contacto')return ok(null);
 if(name==='plan_guardar_foto_directorio'&&a.p_tipo==='contacto'&&failPhoto){failPhoto=false;return {data:null,error:{message:'Fallo simulado de foto'}}}
 return base.rpc(name,a);
}};
