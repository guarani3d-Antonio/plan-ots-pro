import {leerCronograma,fechaNumero,fechaTrabajo,duracionTrabajo,type TrabajoProgramado} from './workScheduleModel';
const escape=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export function htmlCronograma(valor:unknown):string {
 const c=leerCronograma(valor);if(!c?.incluir)return '';
 const min=Math.min(...c.trabajos.map(t=>fechaNumero(t.inicio))),max=Math.max(...c.trabajos.map(t=>fechaNumero(t.fin)))+1,count=max-min;
 const x=(n:number)=>210+(n-min)/count*420;
 const sections:string[]=[];
 for(let base=0;base<c.trabajos.length;base+=10){
  const part=c.trabajos.slice(base,base+10),index=new Map(part.map((t,i)=>[t.id,i])),height=40+part.length*38;
  let svg=`<svg xmlns="http://www.w3.org/2000/svg" width="640" height="${height}" viewBox="0 0 640 ${height}" role="img" aria-label="Cronograma previsto, trabajos ${part[0].id} a ${part.at(-1)!.id}" style="width:100%;height:auto;display:block"><defs><marker id="flecha-cron-${base}" markerWidth="5" markerHeight="5" refX="4" refY="2.5" orient="auto"><path d="M0 0L5 2.5L0 5Z" fill="#3e5a9e"/></marker></defs>`;
  const ticks=Math.min(5,count);for(let tick=0;tick<ticks;tick++){const n=ticks===1?min:min+Math.round((count-1)*tick/(ticks-1)),pos=x(n);svg+=`<path d="M${pos.toFixed(2)} 35V${height}" stroke="#dce3ef" stroke-width=".7"/><text x="${pos.toFixed(2)}" y="20" text-anchor="${tick===0?'start':tick===ticks-1?'end':'middle'}" fill="#52647d" font-size="11">${escape(fechaTrabajo(new Date(n*86400000).toISOString().slice(0,10)))}</text>`;}
  part.forEach((t,i)=>{const y=40+i*38,a=x(fechaNumero(t.inicio)),b=x(fechaNumero(t.fin)+1),label=t.id+' · '+t.nombre;
   svg+=`<path d="M0 ${y+34}H640" stroke="#dce3ef" stroke-width=".7"/><text x="3" y="${y+15}" fill="#192339" font-size="11">${escape(label.slice(0,32))}</text>${label.length>32?`<text x="3" y="${y+28}" fill="#192339" font-size="11">${escape(label.slice(32,62)+(label.length>62?'…':''))}</text>`:''}<rect x="${a.toFixed(2)}" y="${y+6}" width="${Math.max(1,b-a).toFixed(2)}" height="18" rx="3" fill="#647fb7"><title>${escape(t.nombre)}</title></rect>`;
   for(const r of t.relaciones){const p=c.trabajos.find(v=>v.id===r.predecesora)!,pi=index.get(p.id);if(pi===undefined){svg+=`<text x="${Math.max(211,a).toFixed(2)}" y="${y+34}" fill="#52647d" font-size="10">← ${p.id}${r.tipo}${r.desfase?`${r.desfase>0?'+':''}${r.desfase}d`:''}</text>`;continue;}const from=x(fechaNumero(r.tipo[0]==='F'?p.fin:p.inicio)+(r.tipo[0]==='F'?1:0)),to=x(fechaNumero(r.tipo[1]==='F'?t.fin:t.inicio)+(r.tipo[1]==='F'?1:0)),py=40+pi*38+15,ty=y+15,mid=Math.min(636,Math.max(from+4,to-4));svg+=`<path d="M${from.toFixed(2)} ${py}H${mid.toFixed(2)}V${ty}H${to.toFixed(2)}" fill="none" stroke="#3e5a9e" stroke-width="1" marker-end="url(#flecha-cron-${base})"/>`;}
  });svg+='</svg>';
  const labels=part.filter(t=>(t.id+' · '+t.nombre).length>62).map(t=>`<p style="font-size:11px;margin:3px 0">${t.id} · ${escape(t.nombre)}</p>`).join('');
  sections.push(`<section class="schedule-report-block" style="break-inside:avoid;page-break-inside:avoid;margin:12px 0"><h4 style="font-size:12px;margin:0 0 5px">Cronograma previsto${c.trabajos.length>10?` · ${base+1} a ${base+part.length} de ${c.trabajos.length}`:''}</h4>${svg}${labels}<p style="font-size:10px;color:#52647d;margin:5px 0">Días corridos · FI: Fin → Inicio · II: Inicio → Inicio · FF: Fin → Fin · IF: Inicio → Fin. ${base?'Las referencias conectan con trabajos de otros bloques.':''}</p></section>`);
 }
 const row=(t:TrabajoProgramado)=>`<tr><td>${t.id}</td><td style="overflow-wrap:anywhere">${escape(t.nombre)}</td><td>${escape(fechaTrabajo(t.inicio))}</td><td>${escape(fechaTrabajo(t.fin))}</td><td>${duracionTrabajo(t)}</td><td>${t.relaciones.map(r=>`${r.predecesora}${r.tipo}${r.desfase?`${r.desfase>0?'+':''}${r.desfase}d`:''}`).join(', ')||'—'}</td></tr>`;
 return sections.join('')+(c.incluirMatriz?`<table class="report-data-table"><thead><tr><th>N.º</th><th>Trabajo</th><th>Inicio</th><th>Fin</th><th>Días</th><th>Predecesoras</th></tr></thead><tbody>${c.trabajos.map(row).join('')}</tbody></table>`:'');
}
