const preguntas=['rapidez','plazoPrometido','calidadTrabajo','profesionalismo','confianza','recontratacion','recomendacion'] as const;
export function valorEncuesta(value:unknown):number|null {const s=typeof value==='string'?value.trim():'';return /^(?:[1-9]|10)$/.test(s)?Number(s):null}
export function encuestaRespondida(datos:Record<string,string>):boolean{const value=datos.fechaRespuesta||'',d=new Date(value+'T00:00:00');const fechaValida=/^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(d.getTime())&&d.getFullYear()===Number(value.slice(0,4))&&d.getMonth()+1===Number(value.slice(5,7))&&d.getDate()===Number(value.slice(8,10));return preguntas.some(k=>valorEncuesta(datos[k])!==null||datos[k]?.trim().toUpperCase()==='N/A')&&!!datos.respondente?.trim()&&fechaValida}
export function resumenEncuestas(datos:Record<string,string>[]){const respondidas=datos.filter(encuestaRespondida),scores=respondidas.flatMap(d=>preguntas.map(k=>valorEncuesta(d[k])).filter((n):n is number=>n!==null));return {respondidas:respondidas.length,conPuntaje:respondidas.filter(d=>preguntas.some(k=>valorEncuesta(d[k])!==null)).length,promedio:scores.length?scores.reduce((a,b)=>a+b,0)/scores.length:null,respuestas:scores.length}}
export function limitesPerfil(periodo:string,hoy=new Date()):{desde:string|null;hasta:string|null}{
 const local=(d:Date)=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
 if(periodo==='todos')return {desde:null,hasta:null};const desde=new Date(hoy.getFullYear(),hoy.getMonth(),hoy.getDate());
 if(periodo==='90')desde.setDate(desde.getDate()-89);else desde.setDate(1);
 return {desde:local(desde),hasta:local(hoy)};
}
export function fechaPerfil(value:string|null|undefined):string {if(!value)return '—';const d=new Date(value.slice(0,10)+'T00:00:00');return Number.isNaN(d.getTime())?'—':d.toLocaleDateString('es-PY')}
export function lugarCliente(u:{nombre_obra:string;unidad:string|null;sector:string|null;datos_adicionales:Record<string,unknown>}):string{return [u.nombre_obra,u.datos_adicionales.torre,u.unidad,u.sector].filter(Boolean).join(' · ')}
