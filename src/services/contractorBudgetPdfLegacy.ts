import {jsPDF} from 'jspdf';
import {autoTable} from 'jspdf-autotable';
import {fechaComercio,importePresupuesto,estadoPresupuesto,type Presupuesto,type VersionPresupuesto,type FirmaPresupuesto} from './contractorBudgetModel';
const clean=(v:unknown)=>String(v??'').replace(/[\u2010-\u2015]/g,'-').replace(/[^\x20-\x7E\u00A0-\u00FF\n]/g,' ');
/** Pure PDF materialization: all images are embedded raster data, never remote references. */
export function crearPdfPresupuesto(b:Presupuesto,v:VersionPresupuesto,signatures:FirmaPresupuesto[],logo?:string):Blob{
 const pdf=new jsPDF({unit:'mm',format:'a4',compress:true});const code=`P-${String(b.codigo).padStart(4,'0')}`,margin=16,width=178,bottom=278;
 const valid=signatures.filter(f=>f.revision_id===v.id&&f.contenido_sha256===v.contenido_sha256),complete=v.datos.firmantes.every(s=>valid.some(f=>f.espacio_id===s.id));let y=18;
 pdf.setProperties({title:`${code} - v${v.version}`,subject:`OT ${v.fuentes.orden.ot} - ${v.contenido_sha256}`,creator:'Plan-OTs',author:clean(v.fuentes.empresa.nombre)});
 const page=()=>{pdf.addPage();y=20;};const lines=(text:unknown,size=10,max=width)=>{pdf.setFontSize(size);return pdf.splitTextToSize(clean(text),max) as string[];};
 const write=(text:unknown,size=10,bold=false)=>{pdf.setFont('helvetica',bold?'bold':'normal');pdf.setFontSize(size);for(const line of lines(text,size)){if(y+5>bottom)page();pdf.text(line,margin,y);y+=size*.42+1;}y+=2;};
 if(logo){if(!/^data:image\/(jpeg|png);base64,/.test(logo))throw new Error('Logo del presupuesto inválido.');const info=pdf.getImageProperties(logo),scale=Math.min(32/info.width,23/info.height);pdf.addImage(logo,logo.startsWith('data:image/png')?'PNG':'JPEG',margin,y,info.width*scale,info.height*scale);}
 pdf.setFont('helvetica','bold');pdf.setFontSize(17);pdf.text('Presupuesto de trabajos',logo?55:margin,y+5);pdf.setFontSize(10);pdf.text(`${code} - versión ${v.version}`,logo?55:margin,y+12);pdf.setFont('helvetica','normal');pdf.text(complete?'Versión con firmas registradas':'BORRADOR - firmas pendientes',logo?55:margin,y+18);y+=30;
 write(v.fuentes.empresa.razon_social||v.fuentes.empresa.nombre,12,true);write([v.fuentes.empresa.identificacion,v.fuentes.empresa.direccion,v.fuentes.empresa.correo].filter(Boolean).join(' | '),9);
 write(`${v.fuentes.orden.ot} - ${v.fuentes.obra.nombre}`,11,true);write(`Contratista: ${v.fuentes.contratista.razon_social||v.fuentes.contratista.nombre}`);write(`Rubro: ${v.fuentes.orden.rubro} | Ubicación: ${v.fuentes.orden.ubicacion||'Sin registrar'}`,9);write(v.fuentes.orden.descripcion,10);
 write(`Fecha: ${fechaComercio(v.creada_en)} | Válido hasta: ${fechaComercio(v.datos.vence)} | Moneda: ${v.moneda}`,9);
 autoTable(pdf,{startY:y,margin:{top:20,left:margin,right:margin,bottom:20},head:[['N.º','Trabajo / ítem','Cantidad','Unidad',`P. unitario (${v.moneda})`,`Importe (${v.moneda})`]],body:v.datos.items.map((i,n)=>[String(n+1),clean(i.descripcion),String(i.cantidad),clean(i.unidad),importePresupuesto(i.precio,v.moneda),importePresupuesto(Math.round((i.cantidad*i.precio+Number.EPSILON)*(v.moneda==='PYG'?1:100))/(v.moneda==='PYG'?1:100),v.moneda)]),styles:{font:'helvetica',fontSize:9,cellPadding:2.4,overflow:'linebreak'},headStyles:{fillColor:[61,88,157],textColor:255},columnStyles:{0:{cellWidth:10},1:{cellWidth:65},2:{cellWidth:19,halign:'right'},3:{cellWidth:17},4:{cellWidth:32,halign:'right'},5:{cellWidth:35,halign:'right'}},rowPageBreak:'avoid'});
 y=(pdf as jsPDF&{lastAutoTable:{finalY:number}}).lastAutoTable.finalY+9;
 if(y+28>bottom)page();write(`Base imponible: ${importePresupuesto(v.base,v.moneda)}`,10);write(`IVA 10% ${v.datos.iva==='incluido'?'incluido en los precios':'agregado al final'}: ${importePresupuesto(v.iva,v.moneda)}`,10);write(`TOTAL: ${importePresupuesto(v.total,v.moneda)}`,12,true);
 write('Alcance y condiciones',11,true);write(v.datos.condiciones,10);
 if(v.datos.adjunto)write(`Referencia del proveedor: ${v.datos.adjunto.nombre}`,9);
 if(v.fuentes.documento_revision)write(`Plan de Trabajo de origen: ${v.fuentes.documento_revision.codigo||'Relevamiento'} - versión ${v.fuentes.documento_revision.version} | ID ${v.fuentes.documento_revision.id}`,8);
 write(`Estado registrado: ${estadoPresupuesto(b,v)}`,9);const decision=b.eventos.filter(e=>e.revision_id===v.id&&e.estado!=='Presentado').at(-1);if(decision)write(`${fechaComercio(decision.registrado_en)} - ${decision.estado}: ${decision.fundamento}`,9);
 write(`Contenido de versión SHA-256: ${v.contenido_sha256}`,7);
 // Flow after the last content; new page only when the next row of signatures does not fit.
 for(let n=0;n<v.datos.firmantes.length;n+=2){if(y+49>bottom)page();const row=v.datos.firmantes.slice(n,n+2);for(let i=0;i<row.length;i++){const slot=row[i],f=valid.find(f=>f.espacio_id===slot.id),x=margin+i*94;if(f){const info=pdf.getImageProperties(f.imagen_png),scale=Math.min(76/info.width,27/info.height);pdf.addImage(f.imagen_png,'PNG',x,y,info.width*scale,info.height*scale);}pdf.setDrawColor(150);pdf.line(x,y+29,x+80,y+29);pdf.setFontSize(10);pdf.text(slot.rol,x,y+35);pdf.setFontSize(7);pdf.text(f?`Registrada: ${fechaComercio(f.registrada_en)}`:'Firma pendiente',x,y+41);}y+=49;}
 const count=pdf.getNumberOfPages();for(let i=1;i<=count;i++){pdf.setPage(i);pdf.setFont('helvetica','normal');pdf.setFontSize(8);pdf.setTextColor(85);pdf.text(`${code} - v${v.version} | ${v.fuentes.orden.ot}`,margin,288);pdf.text(`${i} / ${count}`,194,288,{align:'right'});}return pdf.output('blob');
}
