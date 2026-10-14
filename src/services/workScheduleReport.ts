import {leerCronograma,fechaNumero,numeroFecha,fechaTrabajo,duracionTrabajo,type TrabajoProgramado} from './workScheduleModel';
const escape=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const id=(t:TrabajoProgramado)=>t.actividadId??String(t.id);
const styles=`<style>
@page schedule-landscape{size:A4 landscape;margin:13mm 15mm 15mm}
.schedule-page{page:schedule-landscape;break-before:page;break-after:page}
.schedule-report-block{margin:12px 0}.schedule-figure{break-inside:avoid;page-break-inside:avoid}
.a4-page .schedule-report-block{break-inside:auto;page-break-inside:auto}
.schedule-report-block h4{font:600 13px Arial;margin:0 0 8px;color:#192339}
.schedule-report-block p{font:11px/1.5 Arial;margin:7px 0;color:#52647d;overflow-wrap:anywhere}
.schedule-report-block svg{display:block;width:100%;height:auto;overflow:hidden}
.schedule-report-block table{table-layout:fixed;width:100%;font:11px/1.5 Arial;border-collapse:collapse;margin-top:12px}
.schedule-report-block th{background:#244d7e;color:#fff;padding:7px;text-align:left;font-size:11px}
.schedule-report-block td{border:1px solid #d0dbe7;padding:7px;vertical-align:top;overflow-wrap:anywhere}
.schedule-report-block tr{break-inside:avoid;page-break-inside:avoid}.schedule-report-block thead{display:table-header-group}
.schedule-dates{white-space:nowrap}.schedule-id{white-space:nowrap}
@media screen{.a4-page.schedule-page{width:297mm;min-height:210mm;padding:13mm 15mm 15mm}}
@media print{.a4-page.schedule-page{width:auto;min-height:0;padding:0;margin:0;page:schedule-landscape}}
</style>`;
export function htmlCronograma(valor:unknown):string {
 const c=leerCronograma(valor);if(!c?.incluir)return '';
 const min=Math.min(...c.trabajos.map(t=>fechaNumero(t.inicio))),max=Math.max(...c.trabajos.map(t=>fechaNumero(t.fin))),span=max-min+1;
 const horizontal=span>14||c.trabajos.some(t=>t.nombre.length>50),periodDays=horizontal?28:14,width=horizontal?1008:680,left=65,right=15;
 const sections:string[]=[],periods=Math.ceil(span/periodDays),rowsPerBlock=c.incluirMatriz?6:10;
 for(let period=0;period<periods;period++){
  const from=min+period*periodDays,to=Math.min(max,from+periodDays-1),count=to-from+1,plot=width-left-right,x=(n:number)=>left+(n-from)/count*plot;
  for(let base=0;base<c.trabajos.length;base+=rowsPerBlock){
   const part=c.trabajos.slice(base,base+rowsPerBlock),index=new Map(part.map((t,i)=>[t.id,i])),top=70,row=40,height=top+part.length*row,marker=`schedule-arrow-${period}-${base}`,clip=`schedule-clip-${period}-${base}`;
   let svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Gantt del ${fechaTrabajo(numeroFecha(from))} al ${fechaTrabajo(numeroFecha(to))}, actividades ${part.map(id).join(', ')}"><defs><marker id="${marker}" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0 0L6 3L0 6Z" fill="#3e5a9e"/></marker><clipPath id="${clip}"><rect x="${left}" y="${top}" width="${plot}" height="${height-top}"/></clipPath></defs><text x="3" y="20" fill="#192339" font-family="Arial" font-weight="600" font-size="13">Cronograma previsto · ${fechaTrabajo(numeroFecha(from))} → ${fechaTrabajo(numeroFecha(to))}${periods>1?` · período ${period+1}/${periods}`:''}</text><text x="3" y="55" fill="#52647d" font-size="11">Actividad</text>`;
   const ticks=Math.min(count,Math.max(2,Math.floor(plot/76)));
   for(let i=0;i<ticks;i++){const n=ticks===1?from:from+Math.round((count-1)*i/(ticks-1)),pos=x(n);svg+=`<path d="M${pos.toFixed(2)} ${top}V${height}" stroke="#dce3ef" stroke-width=".7"/><text class="schedule-tick" x="${pos.toFixed(2)}" y="55" text-anchor="${i===0?'start':i===ticks-1?'end':'middle'}" fill="#52647d" font-size="11">${fechaTrabajo(numeroFecha(n)).slice(0,5)}</text>`;}
   part.forEach((t,i)=>{const y=top+i*row;svg+=`<path d="M0 ${y+row}H${width}" stroke="#dce3ef" stroke-width=".7"/><text x="3" y="${y+24}" fill="#192339" font-size="11">${escape(id(t))}</text>`;});
   svg+=`<g clip-path="url(#${clip})">`;
   part.forEach((t,i)=>{const y=top+i*row,a=x(Math.max(from,fechaNumero(t.inicio))),b=x(Math.min(to+1,fechaNumero(t.fin)+1));
    for(const r of t.relaciones){const p=c.trabajos.find(v=>v.id===r.predecesora)!,pi=index.get(p.id);if(pi===undefined)continue;const origin=x(fechaNumero(r.tipo[0]==='F'?p.fin:p.inicio)+(r.tipo[0]==='F'?1:0)),dest=x(fechaNumero(r.tipo[1]==='F'?t.fin:t.inicio)+(r.tipo[1]==='F'?1:0)),py=top+pi*row+21,ty=y+21,mid=Math.max(origin+6,dest-6);svg+=`<path d="M${origin.toFixed(2)} ${py}H${mid.toFixed(2)}V${ty}H${dest.toFixed(2)}" fill="none" stroke="#3e5a9e" stroke-width="1.2" marker-end="url(#${marker})"/>`;}
    if(b>a){svg+=`<rect x="${a.toFixed(2)}" y="${y+10}" width="${(b-a).toFixed(2)}" height="23" rx="3" fill="#647fb7"><title>${escape(t.nombre)}: ${fechaTrabajo(t.inicio)} → ${fechaTrabajo(t.fin)}</title></rect>`;if(fechaNumero(t.inicio)<from)svg+=`<text x="${a+4}" y="${y+26}" font-size="12" fill="#fff">←</text>`;if(fechaNumero(t.fin)>to)svg+=`<text x="${b-5}" y="${y+26}" text-anchor="end" font-size="12" fill="#fff">→</text>`;}
   });svg+='</g></svg>';
   const relations=(t:TrabajoProgramado)=>t.relaciones.map(r=>`${id(c.trabajos.find(p=>p.id===r.predecesora)!)} ${r.tipo}${r.desfase?`${r.desfase>0?'+':''}${r.desfase}d`:''}`).join(', ')||'—';
   const matrix=c.incluirMatriz?`<table class="schedule-matrix"><colgroup><col style="width:9%"/><col style="width:35%"/><col style="width:13%"/><col style="width:13%"/><col style="width:7%"/><col style="width:23%"/></colgroup><thead><tr><th>Actividad</th><th>Trabajo</th><th>Inicio</th><th>Fin</th><th>Días</th><th>Predecesoras</th></tr></thead><tbody>${part.map(t=>`<tr><td class="schedule-id">${escape(id(t))}</td><td>${escape(t.nombre)}</td><td class="schedule-dates">${fechaTrabajo(t.inicio)}</td><td class="schedule-dates">${fechaTrabajo(t.fin)}</td><td>${duracionTrabajo(t)}</td><td>${escape(relations(t))}</td></tr>`).join('')}</tbody></table>`:part.map(t=>`<p><strong>${escape(id(t))} · ${escape(t.nombre)}</strong> · ${fechaTrabajo(t.inicio)} → ${fechaTrabajo(t.fin)} · ${duracionTrabajo(t)}d · predecesoras: ${escape(relations(t))}</p>`).join('');
   const block=`<section class="schedule-report-block" data-schedule-orientation="${horizontal?'landscape':'portrait'}"><div class="schedule-figure">${svg}</div>${matrix}<p>Días corridos · FI: Fin → Inicio · II: Inicio → Inicio · FF: Fin → Fin · IF: Inicio → Fin.${periods>1?' Las barras con ← o → continúan en otro período.':''}${c.trabajos.length>rowsPerBlock?' Las predecesoras conservan sus identificadores en todos los bloques.':''}</p></section>`;
   sections.push(horizontal?`<div class="a4-page schedule-page" data-page-orientation="landscape">${block}</div>`:block);
  }
 }
 return styles+sections.join('');
}
