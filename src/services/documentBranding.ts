// Versioned presentation only. No remote URLs or mutable tenant state enter a saved document.
export const REPORT_BRANDING_VERSION='expediente-controlado-2026-10-16-marca';
export const BUDGET_BRANDING_VERSION='presupuesto-arquitectura-2026-10-16';
export const DOCUMENT_COLORS={navy:'#173455',blue:'#244b80',gold:'#b78135',muted:'#596c83',line:'#d7e1ec',paper:'#f4f8fd'};
const esc=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export function validarLogoData(data:string):void{
 if(!/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(data)||data.length>3*1024*1024)throw Error('Logo del documento inválido.');
}
export function aplicarMarcaDocumento(html:string,empresa:string,logo?:string):string{
 if(logo)validarLogoData(logo);
 const header=/(<header\b[^>]*>)\s*<div>[\s\S]*?(?=<div class="text-right">)/;
 if(!header.test(html))throw Error('No se encontró la cabecera del informe.');
 const marca=`<div class="report-company-brand" data-company-brand="true">${logo?`<img src="${logo}" alt="Logo de ${esc(empresa)}"/>`:''}<p class="report-company-name">${esc(empresa||'Empresa emisora')}</p><small>PLAN-OTS · EXPEDIENTE TÉCNICO</small></div>`;
 const css=`<style>.report-company-brand{min-width:0;max-width:64mm;flex:1}.report-company-brand img{display:block;width:auto;height:auto;max-width:52mm;max-height:23mm;object-fit:contain;margin:0 0 5px}.a4-page .report-company-name{margin:0;font-size:11px;font-weight:700;color:${DOCUMENT_COLORS.navy};overflow-wrap:anywhere}.report-company-brand small{display:block;font-size:7px;letter-spacing:.1em;color:${DOCUMENT_COLORS.muted};margin-top:4px}.a4-page .report-signatures{break-inside:avoid;page-break-inside:avoid}.report-company-brand,.report-title{break-inside:avoid;page-break-inside:avoid}@media print{@page{margin:16mm 15mm 18mm}.report-company-brand{break-after:avoid}.a4-page>header{break-after:avoid}}</style>`;
 return html.replace(header,(_,open)=>open+marca).replace('</head>',css+'</head>');
}
