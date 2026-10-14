export const RELACIONES_TRABAJO = ['FI','II','FF','IF'] as const;
export type TipoRelacionTrabajo = typeof RELACIONES_TRABAJO[number];
export interface RelacionTrabajo {predecesora:number;tipo:TipoRelacionTrabajo;desfase:number}
export interface TrabajoProgramado {id:number;actividadId?:string;nombre:string;inicio:string;fin:string;relaciones:RelacionTrabajo[]}
export interface CronogramaTrabajo {version:1;calendario:'corridos';unificado?:boolean;incluir:boolean;incluirMatriz:boolean;trabajos:TrabajoProgramado[]}
export const MAX_TRABAJOS = 100;
const DIA = 86400000;
export function fechaNumero(iso:string):number {
 if(!/^\d{4}-\d{2}-\d{2}$/.test(iso))throw Error('Fecha inválida: usá día, mes y año.');
 const d=new Date(iso+'T00:00:00');
 if(!Number.isFinite(d.getTime())||d.getFullYear()<2000||d.getFullYear()>2100||`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`!==iso)throw Error('Fecha fuera de rango o inexistente.');
 return Date.UTC(d.getFullYear(),d.getMonth(),d.getDate())/DIA;
}
export const numeroFecha=(n:number)=>new Date(n*DIA).toISOString().slice(0,10);
export const fechaHoy=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
export const fechaTrabajo=(s:string)=>new Date(s+'T00:00:00').toLocaleDateString('es-PY',{day:'2-digit',month:'2-digit',year:'numeric'});
export const duracionTrabajo=(t:TrabajoProgramado)=>fechaNumero(t.fin)-fechaNumero(t.inicio)+1;
export const nuevoCronograma=():CronogramaTrabajo=>({version:1,calendario:'corridos',incluir:true,incluirMatriz:false,trabajos:[]});
export function leerDesfase(valor:string):number {
 const texto=valor.trim().replace(/\s/g,'');
 if(!/^[+-]?\d+d?$/i.test(texto))throw Error('Usá días enteros: +1d, -1, -1d o 0.');
 const numero=Number(texto.replace(/d$/i,''));if(Math.abs(numero)>3660)throw Error('El desfase supera el límite de diez años.');return numero;
}
export const textoDesfase=(numero:number)=>`${numero>0?'+':''}${numero}d`;
function comprobar(c:CronogramaTrabajo){
 if(!c||c.version!==1||c.calendario!=='corridos'||typeof c.incluir!=='boolean'||typeof c.incluirMatriz!=='boolean'||!Array.isArray(c.trabajos)||c.trabajos.length>MAX_TRABAJOS)throw Error('Cronograma inválido o fuera del límite de 100 trabajos.');
 const ids=new Set<number>(),actividades=new Set<string>();
 for(const t of c.trabajos){
  if(!Number.isSafeInteger(t.id)||t.id<1||ids.has(t.id))throw Error('Los números de trabajo deben ser únicos y positivos.');ids.add(t.id);
  if(t.actividadId!==undefined){if(typeof t.actividadId!=='string'||!/^A-\d{2,}$/.test(t.actividadId)||actividades.has(t.actividadId))throw Error('Cada trabajo debe vincularse a una actividad única.');actividades.add(t.actividadId);}
  if(c.unificado&&!t.actividadId)throw Error('Vinculá cada trabajo a una actividad del plan.');
  if(typeof t.nombre!=='string'||!t.nombre.trim()||t.nombre.length>240)throw Error('Completá el nombre de cada trabajo (hasta 240 caracteres).');
  const d=duracionTrabajo(t);if(d<1||d>3660)throw Error('El fin debe ser igual o posterior al inicio; máximo diez años por trabajo.');
  if(!Array.isArray(t.relaciones)||t.relaciones.length>MAX_TRABAJOS)throw Error('Relaciones de trabajo inválidas.');
  const seen=new Set<string>();for(const r of t.relaciones){const key=r.predecesora+':'+r.tipo;if(!Number.isSafeInteger(r.predecesora)||!RELACIONES_TRABAJO.includes(r.tipo)||!Number.isInteger(r.desfase)||Math.abs(r.desfase)>3660||seen.has(key)||r.predecesora===t.id)throw Error('Revisá las relaciones: sin duplicados ni dependencias del mismo trabajo.');seen.add(key);}
 }
 for(const t of c.trabajos)for(const r of t.relaciones)if(!ids.has(r.predecesora))throw Error('Una predecesora ya no existe.');
 if(c.trabajos.length&&Math.max(...c.trabajos.map(t=>fechaNumero(t.fin)))-Math.min(...c.trabajos.map(t=>fechaNumero(t.inicio)))>3660)throw Error('El cronograma no puede abarcar más de diez años.');
}
/** Earliest valid schedule. Dependencies constrain starts; independent work retains its dates. */
export function recalcularCronograma(valor:CronogramaTrabajo):CronogramaTrabajo {
 comprobar(valor);const c=structuredClone(valor),map=new Map(c.trabajos.map(t=>[t.id,t])),marks=new Map<number,number>();
 const visit=(t:TrabajoProgramado)=>{if(marks.get(t.id)===1)throw Error('Ese vínculo crea un ciclo. Revisá las predecesoras.');if(marks.get(t.id)===2)return;marks.set(t.id,1);const duration=duracionTrabajo(t);let start=-Infinity;
  for(const r of t.relaciones){const p=map.get(r.predecesora)!;visit(p);const a=fechaNumero(p.inicio),b=fechaNumero(p.fin);start=Math.max(start,r.tipo==='FI'?b+1+r.desfase:r.tipo==='II'?a+r.desfase:r.tipo==='FF'?b+r.desfase-duration+1:a+r.desfase-duration+1);}
  if(t.relaciones.length){t.inicio=numeroFecha(start);t.fin=numeroFecha(start+duration-1);fechaNumero(t.inicio);fechaNumero(t.fin);}marks.set(t.id,2);
 };for(const t of c.trabajos)visit(t);comprobar(c);return c;
}
export function leerCronograma(valor:unknown):CronogramaTrabajo|null {
 if(valor==null||valor==='')return null;if(typeof valor!=='string'||valor.length>200_000)throw Error('Datos del cronograma inválidos.');
 let c:CronogramaTrabajo;try{c=JSON.parse(valor)}catch{throw Error('No se pudo leer el cronograma conservado.');}
 const computed=recalcularCronograma(c);
 if(c.trabajos.some((t,i)=>t.inicio!==computed.trabajos[i].inicio||t.fin!==computed.trabajos[i].fin))throw Error('Las fechas no corresponden a las relaciones del cronograma.');
 if(c.incluir&&!c.trabajos.length)throw Error('Agregá al menos un trabajo para incluir el cronograma.');return computed;
}
export function serializarCronograma(c:CronogramaTrabajo):string {const result=recalcularCronograma(c);const json=JSON.stringify(result);leerCronograma(json);return json;}
export function moverTrabajo(c:CronogramaTrabajo,id:number,dias:number):CronogramaTrabajo {
 const next=structuredClone(c),t=next.trabajos.find(t=>t.id===id);if(!t||!Number.isInteger(dias))throw Error('Trabajo o desplazamiento inválido.');t.inicio=numeroFecha(fechaNumero(t.inicio)+dias);t.fin=numeroFecha(fechaNumero(t.fin)+dias);t.relaciones.forEach(r=>r.desfase+=dias);return recalcularCronograma(next);
}
export function cambiarDuracion(c:CronogramaTrabajo,id:number,dias:number):CronogramaTrabajo {
 const next=structuredClone(c),t=next.trabajos.find(t=>t.id===id);if(!t||!Number.isInteger(dias)||dias<1)throw Error('La duración debe ser al menos un día.');const delta=dias-duracionTrabajo(t);t.fin=numeroFecha(fechaNumero(t.inicio)+dias-1);t.relaciones.filter(r=>r.tipo==='FF'||r.tipo==='IF').forEach(r=>r.desfase+=delta);return recalcularCronograma(next);
}
export function quitarTrabajo(c:CronogramaTrabajo,id:number):CronogramaTrabajo {return recalcularCronograma({...c,trabajos:c.trabajos.filter(t=>t.id!==id).map(t=>({...t,relaciones:t.relaciones.filter(r=>r.predecesora!==id)}))});}
export function periodoCronograma(c:CronogramaTrabajo):{inicio:string;fin:string}|null {return c.trabajos.length?{inicio:numeroFecha(Math.min(...c.trabajos.map(t=>fechaNumero(t.inicio)))),fin:numeroFecha(Math.max(...c.trabajos.map(t=>fechaNumero(t.fin))))}:null;}
