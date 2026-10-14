// Preview-only fragmentation. Exported HTML, revision hashes and PDFs are untouched.
export const ANCHO_PAGINA_PREVIEW=794;
interface Part {horizontal:boolean;nodes:Node[]}
const CSS_PAGINAS=`
html,body{width:var(--preview-page-width,794px)!important;height:var(--preview-page-height,1123px)!important;overflow:hidden!important;margin:0!important;padding:0!important;background:white!important}
#report-preview-flow{position:relative;width:100%;height:100%}
.report-preview-segment{position:absolute;left:56.69px;top:49.13px;width:var(--preview-content-width);height:var(--preview-content-height);column-width:var(--preview-content-width);column-gap:113.38px;column-fill:auto;overflow:visible;transform-origin:top left;visibility:hidden}
.report-preview-segment .a4-page{width:auto!important;min-height:0!important;margin:0!important;padding:0!important;box-shadow:none!important;background:transparent!important;display:block;page:auto!important;break-before:auto!important;break-after:auto!important}
.report-preview-segment .a4-page+.a4-page{break-before:column!important}
.report-preview-segment .page-break{break-after:column}
.report-preview-segment .page-footer{display:none!important}
.report-preview-segment header,.report-preview-segment .no-break,.report-preview-segment .evidencia-bloque,.report-preview-segment figure,.report-preview-segment .schedule-figure{break-inside:avoid}
.report-preview-segment h1,.report-preview-segment h2,.report-preview-segment h3,.report-preview-segment h4{break-after:avoid}
.report-preview-segment p{orphans:3;widows:3}
.report-preview-segment img{max-width:100%;max-height:var(--preview-content-height);object-fit:contain;break-inside:avoid}
#report-preview-page-number{position:absolute;bottom:25px;left:56.69px;right:56.69px;border-top:1px solid #d6e3f0;padding-top:7px;font:9px Arial;color:#566476;display:flex;justify-content:space-between}
`;
function merge(parts:Part[]):Part[]{const result:Part[]=[];for(const part of parts){const last=result.at(-1);if(!part.horizontal&&last&&!last.horizontal)last.nodes.push(...part.nodes);else result.push(part);}return result;}
function partition(node:Node):Part[]{
 if(node.nodeType===8)return[];
 if(node.nodeType!==1)return node.textContent?.trim()||node.parentNode?.nodeName!=='BODY'?[{horizontal:false,nodes:[node.cloneNode(true)]}]:[];
 const el=node as Element;if(el.matches('.page-footer'))return[];if(el.matches('.schedule-page,[data-schedule-orientation="landscape"]'))return[{horizontal:true,nodes:[el.cloneNode(true)]}];
 const children=merge(Array.from(el.childNodes).flatMap(partition));if(!children.length)return[{horizontal:false,nodes:[el.cloneNode(false)]}];
 return children.map(part=>{if(part.horizontal)return part;const wrapper=el.cloneNode(false);part.nodes.forEach(n=>wrapper.appendChild(n));return{horizontal:false,nodes:[wrapper]};});
}
export function prepararPaginacionInforme(doc:Document){
 if(doc.getElementById('report-preview-flow'))return;
 // Body-local schedule styles must keep applying after the content is split.
 doc.body.querySelectorAll('style').forEach(s=>doc.head.append(s));
 const parts=merge(Array.from(doc.body.childNodes).flatMap(partition));doc.body.replaceChildren();
 const style=doc.createElement('style');style.textContent=CSS_PAGINAS;doc.head.append(style);
 const root=doc.createElement('div');root.id='report-preview-flow';
 parts.forEach(part=>{const flow=doc.createElement('div');flow.className='report-preview-segment';flow.dataset.width=part.horizontal?'1123':'794';flow.dataset.height=part.horizontal?'794':'1123';flow.style.setProperty('--preview-content-width',part.horizontal?'1009.62px':'680.62px');flow.style.setProperty('--preview-content-height',part.horizontal?'688.18px':'1017.18px');part.nodes.forEach(n=>flow.append(n));root.append(flow);});
 doc.body.append(root);const footer=doc.createElement('div');footer.id='report-preview-page-number';doc.body.append(footer);mostrarPaginaInforme(doc,1);
}
function segments(doc:Document){return Array.from(doc.querySelectorAll<HTMLElement>('.report-preview-segment'));}
function count(flow:HTMLElement){return Math.max(1,Math.ceil((flow.scrollWidth+113.38-1)/Number(flow.dataset.width)));}
export function contarPaginasInforme(doc:Document){return Math.max(1,segments(doc).reduce((total,flow)=>total+count(flow),0));}
export function dimensionesPaginaInforme(doc:Document,pagina:number){let offset=Math.max(0,pagina-1);for(const flow of segments(doc)){const n=count(flow);if(offset<n)return{ancho:Number(flow.dataset.width),alto:Number(flow.dataset.height)};offset-=n;}return{ancho:794,alto:1123};}
export function mostrarPaginaInforme(doc:Document,pagina:number){
 let offset=Math.max(0,Math.min(pagina-1,contarPaginasInforme(doc)-1)),selected=false;
 for(const flow of segments(doc)){const n=count(flow);if(!selected&&offset<n){flow.style.visibility='visible';flow.style.transform=`translateX(-${offset*Number(flow.dataset.width)}px)`;doc.documentElement.style.setProperty('--preview-page-width',flow.dataset.width+'px');doc.documentElement.style.setProperty('--preview-page-height',flow.dataset.height+'px');selected=true;}else{flow.style.visibility='hidden';if(!selected)offset-=n;}}
 const footer=doc.getElementById('report-preview-page-number');if(footer){footer.replaceChildren();const label=doc.createElement('span');label.textContent='Plan-OTs · BORRADOR · SIN EMISIÓN NI APROBACIÓN';const number=doc.createElement('span');number.textContent=`${pagina} / ${contarPaginasInforme(doc)} · ${dimensionesPaginaInforme(doc,pagina).ancho>794?'horizontal':'vertical'}`;footer.append(label,number);}
}
