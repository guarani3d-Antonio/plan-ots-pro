import {jsPDF} from 'jspdf';
import {autoTable} from 'jspdf-autotable';
import {fechaComercio,importePresupuesto,estadoPresupuesto,type Presupuesto,type VersionPresupuesto,type FirmaPresupuesto} from './contractorBudgetModel';
import {DOCUMENT_COLORS,validarLogoData} from './documentBranding';
import {documentFontRegular,documentFontBold} from './documentFonts';
const clean=(v:unknown)=>String(v??'').replace(/\r\n?/g,'\n').replace(/\t/g,' ').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').replace(/[\u2010-\u2015]/g,'-');
const rgb=(hex:string):[number,number,number]=>[1,3,5].map(n=>parseInt(hex.slice(n,n+2),16)) as [number,number,number];

/** Embedded fonts/images, measured blocks and a reserved footer on every page. */
export function crearPdfPresupuestoNuevo(b:Presupuesto,v:VersionPresupuesto,signatures:FirmaPresupuesto[],logo?:string):Blob{
 if(v.fuentes.logo_path&&!logo)throw Error('Falta el logo conservado de esta versión.');
 if(logo){validarLogoData(logo);if(!/^data:image\/(jpeg|png);base64,/.test(logo))throw Error('Formato de logo no admitido.');}
 const pdf=new jsPDF({unit:'mm',format:'a4',compress:true,putOnlyUsedFonts:true});
 pdf.addFileToVFS('LiberationSans-Regular.ttf',documentFontRegular);pdf.addFont('LiberationSans-Regular.ttf','PlanSans','normal');
 pdf.addFileToVFS('LiberationSans-Bold.ttf',documentFontBold);pdf.addFont('LiberationSans-Bold.ttf','PlanSans','bold');
 const margin=15,width=180,bottom=274,code=`P-${String(b.codigo).padStart(4,'0')}`;
 const C=Object.fromEntries(Object.entries(DOCUMENT_COLORS).map(([k,h])=>[k,rgb(h)])) as Record<keyof typeof DOCUMENT_COLORS,[number,number,number]>;
 const company=clean(v.fuentes.empresa.razon_social||v.fuentes.empresa.nombre),order=clean(v.fuentes.orden.ot);
 const valid=signatures.filter(f=>f.revision_id===v.id&&f.contenido_sha256===v.contenido_sha256&&v.datos.firmantes.some(s=>s.id===f.espacio_id&&s.rol===f.rol));
 const signedCount=v.datos.firmantes.filter(s=>valid.some(f=>f.espacio_id===s.id)).length;
 let y=15,section=0;
 const font=(size=9,bold=false,color=C.navy)=>{pdf.setFont('PlanSans',bold?'bold':'normal');pdf.setFontSize(size);pdf.setTextColor(...color);};
 const wrap=(value:unknown,size=9,w=width,bold=false):string[]=>{font(size,bold);return pdf.splitTextToSize(clean(value),w) as string[];};
 const lh=(size:number)=>size*.352778*1.3;

 const rule=(pos:number,color=C.line)=>{pdf.setDrawColor(...color);pdf.setLineWidth(.22);pdf.line(margin,pos,margin+width,pos);};
 const logoAt=(x:number,top:number,maxW:number,maxH:number)=>{if(!logo)return;const i=pdf.getImageProperties(logo),scale=Math.min(maxW/i.width,maxH/i.height);pdf.addImage(logo,logo.startsWith('data:image/png')?'PNG':'JPEG',x,top,i.width*scale,i.height*scale);};
 const continuation=()=>{logoAt(margin,12,27,10);font(7,true);pdf.text(wrap(company,7,105,true),logo?47:margin,13,{lineHeightFactor:1.3});font(8,false,C.muted);pdf.text(`${code} · v${v.version}`,195,16,{align:'right'});font(7,false,C.muted);pdf.text(`${order} · Presupuesto de trabajos`,195,21,{align:'right'});rule(27);};
 const page=()=>{pdf.addPage();continuation();y=34;};
 const ensure=(height:number)=>{if(y+height>bottom)page();};
 const heading=(title:string,firstBlock=0)=>{ensure(11+Math.max(2,firstBlock));section++;font(8,true,C.blue);pdf.text(`${String(section).padStart(2,'0')}  ${title.toUpperCase()}`,margin,y+4);rule(y+7);y+=11;};
 const block=(value:unknown,size=9,bold=false,after=2)=>{
  for(const paragraph of clean(value).split(/\n\s*\n/).filter(p=>p.trim())){const lines=wrap(paragraph,size,width,bold),maximum=Math.floor((bottom-34-16)/lh(size));
   while(lines.length){const part=lines.splice(0,maximum);ensure(part.length*lh(size)+1);font(size,bold);pdf.text(part,margin,y+size*.352778,{lineHeightFactor:1.3});y+=part.length*lh(size)+1;}
  }y+=after;
 };
 pdf.setProperties({title:`${code} - v${v.version}`,subject:`${order} - ${v.contenido_sha256}`,creator:'Plan-OTs',author:company});
 logoAt(margin,14,49,14);
 const companySize=logo?7.5:11,companyTop=logo?31:19,companyLines=wrap(company,companySize,95,true);
 font(companySize,true);pdf.text(companyLines,margin,companyTop,{lineHeightFactor:1.3});
 font(8,true,C.blue);pdf.text('PLAN-OTS · CONTRATACIÓN',195,18,{align:'right'});font(10,true);pdf.text(`${code} · versión ${v.version}`,195,24,{align:'right'});
 font(7.5,false,C.muted);pdf.text(`${signedCount===v.datos.firmantes.length?'Firmas registradas':'Firmas pendientes'} · ${signedCount} de ${v.datos.firmantes.length}`,195,30,{align:'right'});
 const companyBottom=companyTop+(companyLines.length-1)*lh(companySize);
 const details=[v.fuentes.empresa.identificacion,v.fuentes.empresa.direccion,v.fuentes.empresa.correo].filter(Boolean).join(' · '),detailLines=details?wrap(details,7.2):[];
 if(detailLines.length){font(7.2,false,C.muted);pdf.text(detailLines,margin,Math.max(34,companyBottom+4),{lineHeightFactor:1.3});}
 const firstRule=Math.max(36,detailLines.length?Math.max(34,companyBottom+4)+(detailLines.length-1)*lh(7.2)+4:companyBottom+4);
 rule(firstRule,C.navy);y=firstRule+6;font(8,true,C.blue);pdf.text('PROPUESTA ECONÓMICA',margin,y);y+=8;font(19,true);pdf.text('Presupuesto de trabajos',margin,y);y+=7;
 font(8,false,C.muted);pdf.text('Vinculado a la OT y a la versión de su Plan de Trabajo.',margin,y);y+=7;
 const fields=[['OBRA / ORDEN',`${v.fuentes.obra.nombre} · ${order}`],['CONTRATISTA',v.fuentes.contratista.razon_social||v.fuentes.contratista.nombre],['RUBRO / UBICACIÓN',`${v.fuentes.orden.rubro||'Sin registrar'} · ${v.fuentes.orden.ubicacion||'Sin registrar'}`],['FECHA / VIGENCIA',`${fechaComercio(v.creada_en)} · hasta ${fechaComercio(v.datos.vence)}`],['MONEDA',v.moneda],['ESTADO REGISTRADO',estadoPresupuesto(b,v)]];
 for(let n=0;n<fields.length;n+=3){const pair=fields.slice(n,n+3),wrapped=pair.map(([,val])=>wrap(val,8.5,52)),h=Math.max(...wrapped.map(l=>l.length))*lh(8.5)+11;ensure(h+2);pdf.setFillColor(...C.paper);pdf.setDrawColor(...C.line);pdf.roundedRect(margin,y,width,h,1.5,1.5,'FD');pair.forEach(([label],k)=>{const x=margin+4+k*60;font(6.8,true,C.blue);pdf.text(label,x,y+5);font(8.5);pdf.text(wrapped[k],x,y+10,{lineHeightFactor:1.3});});y+=h+2;}
 if(v.fuentes.orden.descripcion){y+=2;block(v.fuentes.orden.descripcion,9,false,2);}
 heading('Trabajos e importes');
 // A description taller than one page becomes numbered continuation blocks.
 // Amounts occur once; no row crosses a page and no characters are discarded.
 const body:string[][]=[];
 v.datos.items.forEach((item,index)=>{const lines=wrap(item.descripcion,8.5,62),chunks:string[][]=[];while(lines.length)chunks.push(lines.splice(0,43));if(!chunks.length)chunks.push(['']);chunks.forEach((part,n)=>body.push([String(index+1),(n?`Continuación del ítem ${index+1}\n`:'')+part.join('\n'),n===0?String(item.cantidad):'',n===0?clean(item.unidad):'',n===0?importePresupuesto(item.precio,v.moneda):'',n===0?importePresupuesto(Math.round((item.cantidad*item.precio+Number.EPSILON)*(v.moneda==='PYG'?1:100))/(v.moneda==='PYG'?1:100),v.moneda):'']));});
 autoTable(pdf,{startY:y,margin:{top:34,bottom:23,left:margin,right:margin},head:[['N.º','Trabajo / ítem','Cantidad','Unidad',`P. unitario (${v.moneda})`,`Importe (${v.moneda})`]],body,
  styles:{font:'PlanSans',fontSize:8.5,cellPadding:2.4,overflow:'linebreak',lineColor:C.line,lineWidth:.15,textColor:C.navy},headStyles:{fillColor:C.blue,textColor:255,fontSize:7.5,fontStyle:'bold'},alternateRowStyles:{fillColor:C.paper},
  columnStyles:{0:{cellWidth:9},1:{cellWidth:67},2:{cellWidth:17,halign:'right'},3:{cellWidth:15},4:{cellWidth:35,halign:'right'},5:{cellWidth:37,halign:'right'}},rowPageBreak:'avoid',willDrawPage:()=>{if(pdf.getCurrentPageInfo().pageNumber>1)continuation();}});
 y=(pdf as jsPDF&{lastAutoTable:{finalY:number}}).lastAutoTable.finalY+5;
 ensure(32);pdf.setFillColor(...C.paper);pdf.setDrawColor(...C.line);pdf.roundedRect(margin,y,width,29,1.5,1.5,'FD');font(7.5,true,C.blue);pdf.text('TRATAMIENTO DEL IVA',margin+4,y+7);font(8);pdf.text(v.datos.iva==='incluido'?'Los precios ya incluyen IVA del 10%.':'IVA del 10% agregado al final.',margin+4,y+13);font(7.3,false,C.muted);pdf.text('No se duplica el impuesto sobre los ítems.',margin+4,y+19);
 const totals:[string,number][]=[['Base imponible',v.base],['IVA 10%',v.iva],['TOTAL',v.total]];totals.forEach(([label,value],n)=>{font(n===2?10:8.5,n===2);pdf.text(label,125,y+7+n*8);pdf.text(importePresupuesto(value,v.moneda),191,y+7+n*8,{align:'right'});});y+=35;
 const firstCondition=wrap(clean(v.datos.condiciones).split(/\n\s*\n/).find(p=>p.trim())??'',9);
 heading('Alcance y condiciones',Math.min(firstCondition.length,Math.floor((bottom-50)/lh(9)))*lh(9)+1);block(v.datos.condiciones,9);
 if(v.datos.adjunto)block(`Referencia del proveedor: ${v.datos.adjunto.nombre}`,8);
 if(v.fuentes.documento_revision)block(`Plan de Trabajo: ${v.fuentes.documento_revision.codigo||'Relevamiento'} · versión ${v.fuentes.documento_revision.version}\nID de versión: ${v.fuentes.documento_revision.id}`,7.5);
 const decision=b.eventos.filter(e=>e.revision_id===v.id&&e.estado!=='Presentado').at(-1);if(decision)block(`${fechaComercio(decision.registrado_en)} · ${decision.estado}: ${decision.fundamento}`,8);
 block(`Huella de la versión · SHA-256\n${v.contenido_sha256}`,6.7,false,0);
 const count=v.datos.firmantes.length,cols=count===3?3:2,rows=Math.ceil(count/cols),gap=5,slotW=(width-gap*(cols-1))/cols,rowH=35;
 ensure(11+rows*rowH);heading('Firmantes de esta versión');
 v.datos.firmantes.forEach((slot,n)=>{const x=margin+(n%cols)*(slotW+gap),top=y+Math.floor(n/cols)*rowH;pdf.setDrawColor(...C.line);pdf.roundedRect(x,top,slotW,rowH-3,1.3,1.3);const signature=valid.find(f=>f.espacio_id===slot.id);
  if(signature){const i=pdf.getImageProperties(signature.imagen_png),scale=Math.min((slotW-10)/i.width,17/i.height);pdf.addImage(signature.imagen_png,'PNG',x+(slotW-i.width*scale)/2,top+2,i.width*scale,i.height*scale);}
  pdf.setDrawColor(...C.muted);pdf.line(x+5,top+21,x+slotW-5,top+21);font(cols===3?8:8.5,true);pdf.text(slot.rol,x+slotW/2,top+25.5,{align:'center'});font(6.6,false,C.muted);pdf.text(signature?`Registrada: ${fechaComercio(signature.registrada_en)}`:'Firma pendiente',x+slotW/2,top+29.5,{align:'center'});
 });
 const pages=pdf.getNumberOfPages();for(let n=1;n<=pages;n++){pdf.setPage(n);rule(282,C.navy);font(7,true);pdf.text('PLAN-OTS · PRESUPUESTO DE TRABAJOS',margin,286.5);font(7);pdf.text(`Página ${n} de ${pages}`,195,286.5,{align:'right'});font(6.8,false,C.muted);pdf.text(`${code} · v${v.version} · ${order}`,margin,291);pdf.text('Firmas y estado verificables en el registro digital.',195,291,{align:'right'});}
 return pdf.output('blob');
}
