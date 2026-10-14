import type {ItemAlcance} from './reportService';
import {fechaHoy,fechaNumero,leerCronograma,nuevoCronograma,periodoCronograma,recalcularCronograma,serializarCronograma,type CronogramaTrabajo} from './workScheduleModel';

export interface FuenteActividad {rubro:string;contratistas:string[]}
export const idActividad=(n:number)=>`A-${String(n).padStart(2,'0')}`;
export function siguienteActividad(items:ItemAlcance[]):string {let n=1;while(items.some(i=>i.id===idActividad(n)))n++;return idActividad(n);}
export function datosActividadFuente(item:ItemAlcance,fuente?:FuenteActividad):ItemAlcance {
 return fuente?{...item,rubro:fuente.rubro,contratista:fuente.contratistas.join(' · ')}:{...item};
}
/** A correction never guesses a match between two old, independently edited lists. */
export function enlacesAnteriores(c:CronogramaTrabajo,items:ItemAlcance[]):Record<number,string> {
 const usados=new Set<string>(),map:Record<number,string>={};
 for(const t of c.trabajos){const matches=items.filter(i=>!usados.has(i.id)&&(t.actividadId?i.id===t.actividadId:i.trabajo.trim().toLocaleLowerCase()===t.nombre.trim().toLocaleLowerCase()));if(matches.length===1){map[t.id]=matches[0].id;usados.add(matches[0].id);}}
 return map;
}
export function unirActividades(c:CronogramaTrabajo,items:ItemAlcance[],fuente?:FuenteActividad,enlaces?:Record<number,string>):{cronograma:CronogramaTrabajo;actividades:ItemAlcance[]} {
 if(items.some(i=>!i.trabajo.trim()))throw Error('Completá el nombre de las actividades del formulario antes de abrir el cronograma.');
 const actividades=items.map(i=>datosActividadFuente(i,fuente)),next=structuredClone(c),map=enlaces??enlacesAnteriores(c,items),usados=new Set<string>();
 for(const t of next.trabajos){let item=actividades.find(i=>i.id===map[t.id]);if(!item){const id=siguienteActividad(actividades);item=datosActividadFuente({id,trabajo:t.nombre,criterio:''},fuente);actividades.push(item);}if(usados.has(item.id))throw Error('Dos trabajos no pueden ocupar la misma actividad.');usados.add(item.id);t.actividadId=item.id;t.nombre=item.trabajo.trim();}
 const periodo=periodoCronograma(next),inicio=periodo?.inicio??fechaHoy();let numero=Math.max(0,...next.trabajos.map(t=>t.id));
 for(const item of actividades)if(!usados.has(item.id)&&item.trabajo.trim()){next.trabajos.push({id:++numero,actividadId:item.id,nombre:item.trabajo.trim(),inicio,fin:inicio,relaciones:[]});}
 next.unificado=true;return {cronograma:recalcularCronograma(next),actividades};
}
/** Form edits change the same IDs/names; dates and relations remain attached to them. */
export function actualizarActividades(valor:unknown,items:ItemAlcance[],fuente?:FuenteActividad,inicio?:string):{actividades:ItemAlcance[];json?:string;periodo?:{inicio:string;fin:string}|null} {
 const actividades=items.map(i=>datosActividadFuente(i,fuente));let saved:CronogramaTrabajo|null;
 try{saved=leerCronograma(valor);}catch(e){
  // A temporarily empty name in the form must remain recoverable while typing.
  if(typeof valor!=='string')throw e;const raw=JSON.parse(valor) as CronogramaTrabajo;
  if(!raw.unificado||!raw.trabajos?.some(t=>typeof t.nombre==='string'&&!t.nombre.trim()))throw e;
  recalcularCronograma({...raw,trabajos:raw.trabajos.map(t=>({...t,nombre:t.nombre.trim()||'Actividad en preparación'}))});saved=raw;
 }if(!saved)return{actividades};
 if(!saved.unificado)return{actividades}; // Explicit linking is offered when opening the old schedule.
 const ids=new Set(actividades.map(i=>i.id)),next=structuredClone(saved);
 next.trabajos=next.trabajos.filter(t=>ids.has(t.actividadId!));const numeros=new Set(next.trabajos.map(t=>t.id));
 next.trabajos.forEach(t=>{t.nombre=actividades.find(i=>i.id===t.actividadId)!.trabajo.trim();t.relaciones=t.relaciones.filter(r=>numeros.has(r.predecesora));});
 let n=Math.max(0,...next.trabajos.map(t=>t.id));const fecha=inicio||periodoCronograma(next)?.inicio||fechaHoy();
 for(const item of actividades)if(item.trabajo.trim()&&!next.trabajos.some(t=>t.actividadId===item.id))next.trabajos.push({id:++n,actividadId:item.id,nombre:item.trabajo.trim(),inicio:fecha,fin:fecha,relaciones:[]});
 if(!next.trabajos.length)next.incluir=false;
 // Blank draft names remain editable; the save validator rejects incomplete scheduled work.
 if(next.trabajos.some(t=>!t.nombre))return{actividades,json:JSON.stringify(next),periodo:periodoCronograma(next)};
 return{actividades,json:serializarCronograma(next),periodo:periodoCronograma(next)};
}
export function actividadesDesdeGantt(c:CronogramaTrabajo,items:ItemAlcance[],fuente?:FuenteActividad):ItemAlcance[] {
 return c.trabajos.map(t=>datosActividadFuente({...items.find(i=>i.id===t.actividadId),id:t.actividadId!,trabajo:t.nombre,criterio:items.find(i=>i.id===t.actividadId)?.criterio??''},fuente));
}
export function validarPlanUnificado(datos:Record<string,unknown>):string|null {
 const r=(datos.relevamiento??{}) as Record<string,string>;
 try{const c=leerCronograma(r.cronogramaJSON);if(!c)return null;
  if(!c.unificado)return 'Vinculá las actividades anteriores con el cronograma usando «Editar cronograma» antes de guardar esta versión.';
  const items=(Array.isArray(datos.itemsAlcance)?datos.itemsAlcance:[]) as ItemAlcance[];
  if(items.length!==c.trabajos.length||new Set(items.map(i=>i.id)).size!==items.length||c.trabajos.some(t=>!items.some(i=>i.id===t.actividadId&&i.trabajo.trim()===t.nombre)))return 'Las actividades y el cronograma no coinciden. Revisá el plan antes de guardar.';
  const p=periodoCronograma(c);if(p&&(r.inicioPrevisto!==p.inicio||r.finPrevisto!==p.fin))return 'El inicio y el fin del plan deben coincidir con las actividades del Gantt.';
  if(p&&r.fechaLimitePrevista&&fechaNumero(p.fin)>fechaNumero(r.fechaLimitePrevista))return 'El cronograma excede la fecha límite acordada. Ajustá las actividades o ampliá el plazo.';
 }catch(e){return e instanceof Error?e.message:'Cronograma inválido.';}return null;
}
export function cronogramaDesdeActividades(items:ItemAlcance[],inicio?:string,fuente?:FuenteActividad){const c=nuevoCronograma();const result=unirActividades(c,items,fuente);if(inicio){fechaNumero(inicio);result.cronograma.trabajos.forEach(t=>{t.inicio=inicio;t.fin=inicio;});}return result;}
