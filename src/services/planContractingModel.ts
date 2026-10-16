import type {ItemAlcance} from './reportService';
import type {DatosPresupuesto} from './contractorBudgetModel';
export interface ContratacionPlan {id:string;manoObra:boolean;materiales:boolean;contratistaId:string;actividadIds:string[];costo:''|'con_costo'|'sin_costo';motivoSinCosto:string}
export interface ContratacionConfig {version:1;contrataciones:ContratacionPlan[]}
export interface OrigenPresupuestoPlan {revisionId:string;codigo:string;version:number;contratacion:ContratacionPlan;actividades:ItemAlcance[]}
export interface PlanPresupuestable {id:string;codigo:string;version:number;contrataciones:ContratacionConfig|null;actividades:ItemAlcance[]}
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function leerContrataciones(value:unknown):ContratacionConfig|null {
 if(value===undefined||value===null||value==='')return null;
 const d=typeof value==='string'?JSON.parse(value):value;
 if(!d||d.version!==1||!Array.isArray(d.contrataciones)||d.contrataciones.length>20)throw Error('La contratación del plan no tiene un formato válido. No se reemplazaron los datos.');
 for(const c of d.contrataciones)if(!c||!uuid.test(c.id)||typeof c.manoObra!=='boolean'||typeof c.materiales!=='boolean'||typeof c.contratistaId!=='string'||!Array.isArray(c.actividadIds)||!c.actividadIds.every((id:unknown)=>typeof id==='string')||!['','con_costo','sin_costo'].includes(c.costo)||typeof c.motivoSinCosto!=='string')throw Error('Revisá los datos de contratación del plan.');
 return d as ContratacionConfig;
}
export function validarContrataciones(value:unknown,actividades:ItemAlcance[],fotos:number):string|null {
 try{const config=leerContrataciones(value);if(!config)return null;
 const ids=new Set<string>();for(const c of config.contrataciones){
  if(ids.has(c.id))return 'Hay contrataciones repetidas en el plan.';ids.add(c.id);
  if(!c.manoObra&&!c.materiales)return 'Indicá mano de obra y/o materiales para la contratación.';
  if(fotos<1)return 'Cargá la evidencia fotográfica antes de contratar desde el plan.';
  if(!uuid.test(c.contratistaId))return 'Seleccioná o creá el contratista desde el plan.';
  if(!c.actividadIds.length||new Set(c.actividadIds).size!==c.actividadIds.length||c.actividadIds.some(id=>!actividades.some(a=>a.id===id&&a.trabajo.trim())))return 'Seleccioná actividades vigentes del plan para cada contratación.';
  if(!c.costo)return 'Definí si cada contratación tiene costo.';
  if(c.costo==='sin_costo'&&!c.motivoSinCosto.trim())return 'Indicá el motivo o cobertura de la contratación sin costo.';
  if(c.motivoSinCosto.length>2000)return 'El motivo de cobertura admite hasta 2000 caracteres.';
 }return null;}catch(e){return e instanceof Error?e.message:'Contratación inválida.';}
}
export const nuevaContratacion=(actividades:ItemAlcance[]):ContratacionPlan=>({id:crypto.randomUUID(),manoObra:false,materiales:false,contratistaId:'',actividadIds:actividades.filter(a=>a.trabajo.trim()).map(a=>a.id),costo:'',motivoSinCosto:''});
export function fuenteContratacion(valor:unknown,fuente:import('./workScheduleActivities').FuenteActividad,fichas:{id:string;nombre:string}[]):import('./workScheduleActivities').FuenteActividad {
 try{const cfg=leerContrataciones(valor);if(!cfg)return fuente;const asignaciones:Record<string,string>={};for(const c of cfg.contrataciones){const name=fichas.find(f=>f.id===c.contratistaId)?.nombre;if(name)for(const id of c.actividadIds)asignaciones[id]=[asignaciones[id],name].filter(Boolean).join(' · ');}return {...fuente,asignaciones};}catch{return fuente;}
}
export function aplicarOrigenPresupuesto(d:DatosPresupuesto,o:OrigenPresupuestoPlan):DatosPresupuesto {
 if(o.contratacion.costo!=='con_costo')throw Error('Esta contratación no tiene costo.');
 const items=o.actividades.filter(a=>o.contratacion.actividadIds.includes(a.id));if(!items.length)throw Error('El plan no tiene actividades para esta contratación.');
 return {...d,documento_revision:o.revisionId,contratacion_id:o.contratacion.id,items:items.map(a=>({actividad_id:a.id,descripcion:a.trabajo,cantidad:1,unidad:'global',precio:0}))};
}
