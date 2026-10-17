import {supabase as base} from './qa-contractor-commerce-mock';
export const tenant='61000000-0000-4000-8000-000000000010',work='61000000-0000-4000-8000-000000000020',work2='61000000-0000-4000-8000-000000000021';
const ana='61000000-0000-4000-8000-000000000030',marcos='61000000-0000-4000-8000-000000000031',mateo='61000000-0000-4000-8000-000000000032';
let fail=false,readOnly=false;export const failNextResponsibleSave=()=>{fail=true};export const responsibleReadOnly=(value:boolean)=>{readOnly=value};
export const qaResponsibleRequests:{name:string;args:unknown}[]=[];
const people:any[]=[{id:ana,nombre:'Ana Benítez QA',email:'ana@example.test',avatar_path:`${ana}/qa.jpg`,activo:true,cargo:'Postventa',datos:{especialidad:'Arquitectura · postventa'},revision:0,vinculada_en:'2026-03-02',editable:true,obras:[{id:work,nombre:'Edificio Bernardino QA'},{id:work2,nombre:'Casa QA'}]},{id:marcos,nombre:'Marcos Pérez QA',email:'marcos@example.test',avatar_path:null,activo:true,cargo:'Electricidad',datos:{especialidad:'Instalaciones eléctricas'},revision:0,vinculada_en:'2026-04-16',editable:true,obras:[{id:work,nombre:'Edificio Bernardino QA'}]}];
const jobs:any[]=Array.from({length:24},(_,i)=>({id:`qa-resp-${i}`,responsable_id:ana,ot:`OT-QA-${3100+i}`,proyecto_id:i%2?work2:work,obra_id:i%2?work2:work,obra:i%2?'Casa QA':'Edificio Bernardino QA',descripcion:'Reparación QA '+i,rubro:'Terminaciones',estado:i<21?'Cerrada':i===21?'Pendiente':'En proceso',prioridad:'Media',responsable:'Ana Benítez QA',ubicacion:'Unidad QA',recepcion:i===0?'2026-09-02':'2026-10-02',inicio:i<21?'2026-10-04':null,fin:i<21?'2026-10-06':null,previsto:i<23?'2026-10-10':'2026-12-20'}));
const ok=(data:unknown)=>({data:structuredClone(data),error:null});
export const supabase:any={...base,rpc:async(name:string,a:any)=>{
 if(name.startsWith('plan_responsable')){qaResponsibleRequests.push({name,args:structuredClone(a)});await new Promise(r=>setTimeout(r,500));}
 if(name==='plan_responsables_directorio')return ok({responsables:a.p_tenant===tenant?people.map(p=>({...p,editable:!readOnly,indicadores:{total:jobs.filter(o=>o.responsable_id===p.id).length,abiertas:jobs.filter(o=>o.responsable_id===p.id&&o.estado!=='Cerrada').length,cerradas:jobs.filter(o=>o.responsable_id===p.id&&o.estado==='Cerrada').length}})):[],sinCuenta:a.p_tenant===tenant?1:0});
 if(name==='plan_responsables_cuentas')return ok(people.some(p=>p.id===mateo)?[]:[{id:mateo,nombre:'Mateo Ruiz QA',email:'mateo@example.test'}]);
 if(name==='plan_responsable_guardar'){
  if(readOnly)return {data:null,error:{message:'Sin permiso para editar esta ficha'}};
  if(fail){fail=false;return {data:null,error:{message:'Error simulado de conexión. Reintentá sin perder los datos.'}};}
  let p=people.find(p=>p.id===a.p_usuario);if(!p){p={id:mateo,nombre:'Mateo Ruiz QA',email:'mateo@example.test',avatar_path:null,activo:true,cargo:'',datos:{},revision:0,vinculada_en:'2026-10-17',editable:true,obras:[{id:work2,nombre:'Casa QA'}]};people.push(p)}
  if(p.revision!==a.p_revision)return {data:null,error:{message:'La ficha cambió. Volvé a abrirla.'}};
  p.datos=structuredClone(a.p_datos);p.revision++;return ok(p.revision);
 }
 if(name==='plan_equipo_foto_guardar'){people.find(p=>p.id===a.p_usuario).avatar_path=a.p_path;return ok(null)}
 if(name==='plan_responsable_perfil'){
  const all=jobs.filter(o=>o.responsable_id===a.p_usuario&&(!a.p_obra||o.obra_id===a.p_obra)&&(!a.p_desde||o.recepcion>=a.p_desde)&&(!a.p_hasta||o.recepcion<=a.p_hasta)),closed=all.filter(o=>o.estado==='Cerrada'),open=all.filter(o=>o.estado!=='Cerrada'),late=open.filter(o=>o.previsto<'2026-10-17');
  const rows=all.filter(o=>!a.p_estado||o.estado===a.p_estado||a.p_estado==='Abiertas'&&o.estado!=='Cerrada'||a.p_estado==='Vencidas'&&o.estado!=='Cerrada'&&o.previsto<'2026-10-17');
  return ok({resumen:{total:all.length,pendiente:all.filter(o=>o.estado==='Pendiente').length,enProceso:all.filter(o=>o.estado==='En proceso').length,cerrada:closed.length,noAplica:0,vencidas:late.length,diasEjecucion:closed.length?3:null,cierresConFecha:closed.length,cierresConPlazo:closed.length,cierresEnPlazo:closed.length},obras:[...new Map(all.map(o=>[o.obra_id,o.obra])).entries()].map(([id,nombre])=>({id,nombre,cantidad:all.filter(o=>o.obra_id===id).length,abiertas:open.filter(o=>o.obra_id===id).length})),ordenes:rows.slice(a.p_pagina*20,a.p_pagina*20+20),totalOrdenes:rows.length,pagina:a.p_pagina,tamanoPagina:20});
 }
 return base.rpc(name,a);
}};
