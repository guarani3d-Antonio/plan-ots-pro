// Categories of signers, deliberately independent of system permission roles.
export const CATEGORIAS_FIRMA = ['Cliente', 'Contacto', 'Técnico / Supervisor', 'Contratista'] as const;
export type CategoriaFirma = typeof CATEGORIAS_FIRMA[number];
export interface EspacioFirma { id: string; categoria: CategoriaFirma }
export interface FirmaDocumento {
 id: string; revision_id: string; espacio_id: string; categoria: CategoriaFirma;
 contenido_sha256: string; imagen_png: string; imagen_sha256: string;
 registrada_por: string; registrada_en: string;
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function espaciosFirma(valor: unknown): EspacioFirma[] {
 if (!Array.isArray(valor) || valor.length > 4) throw new Error('Se admiten hasta cuatro firmantes.');
 const ids=new Set<string>();
 return valor.map(v=>{
  if (!v || typeof v !== 'object' || !uuid.test(v.id) || ids.has(v.id) || !CATEGORIAS_FIRMA.includes(v.categoria))
   throw new Error('Configuración de firmantes inválida.');
  ids.add(v.id);return {id:v.id,categoria:v.categoria};
 });
}
export function espaciosIniciales(): EspacioFirma[] {
 return ['Técnico / Supervisor','Cliente'].map(categoria=>({id:crypto.randomUUID(),categoria:categoria as CategoriaFirma}));
}
// Only trusted raster PNGs; no arbitrary URLs, SVG scripts or HTML signatures.
export function firmaPngValida(imagen: string): boolean {
 return imagen.length <= 160_000 && /^data:image\/png;base64,iVBORw0KGgo[A-Za-z0-9+/]*={0,2}$/.test(imagen);
}
export function htmlFirmas(espacios: EspacioFirma[], firmas: FirmaDocumento[] = [], revision?: {id:string;hash:string}): string {
 const list=espaciosFirma(espacios);
 if (!list.length) return '';
 return `<div class="report-signatures" data-document-signatures="true">${list.map(slot=>{
  const firma=revision?firmas.find(f=>f.revision_id===revision.id&&f.contenido_sha256===revision.hash&&f.espacio_id===slot.id&&f.categoria===slot.categoria):undefined;
  if(firma&&!firmaPngValida(firma.imagen_png))throw new Error('Imagen de firma inválida.');
  return `<div class="report-signature" data-signature-slot="${slot.id}">${firma?`<img src="${firma.imagen_png}" alt="Firma manuscrita: ${slot.categoria}"/>`:'<div class="report-signature-blank"></div>'}<div class="report-signature-line"></div><div class="report-signature-label">${slot.categoria}</div></div>`;
 }).join('')}</div>`;
}
export function incorporarFirmas(html:string, espacios:EspacioFirma[], firmas:FirmaDocumento[]=[], revision?:{id:string;hash:string}):string {
 const block=htmlFirmas(espacios,firmas,revision);
 if(!block)return html;
 // Appends after the last source block (including photographs), never a page.
 const footer=html.indexOf('<footer class="page-footer"');
 const end=html.lastIndexOf('</div>',footer<0?html.length:footer);
 if(end<0)throw new Error('No se encontró el final del documento.');
 return html.slice(0,end)+block+'\n'+html.slice(end);
}
