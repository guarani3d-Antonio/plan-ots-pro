// A4 CSS columns let the browser fragment text, tables and figures instead of cropping a continuous sheet.
// Kept outside the generators: preview layout never changes exported HTML, revision hashes or emitted PDFs.
export const ANCHO_PAGINA_PREVIEW = 794;
const CSS_PAGINAS = `
html,body{width:794px!important;height:1123px!important;overflow:hidden!important;margin:0!important;padding:0!important;background:white!important}
#report-preview-flow{position:absolute;left:56.69px;top:49.13px;width:680.62px;height:1017.18px;column-width:680.62px;column-gap:113.38px;column-fill:auto;overflow:visible;transform-origin:top left}
#report-preview-flow .a4-page{width:auto!important;min-height:0!important;margin:0!important;padding:0!important;box-shadow:none!important;background:transparent!important;display:block}
#report-preview-flow .a4-page+.a4-page{break-before:column}
#report-preview-flow .page-break{break-after:column}
#report-preview-flow .page-footer{display:none!important}
#report-preview-flow header,#report-preview-flow .no-break,#report-preview-flow .evidencia-bloque,#report-preview-flow figure{break-inside:avoid}
#report-preview-flow h1,#report-preview-flow h2,#report-preview-flow h3,#report-preview-flow h4{break-after:avoid}
#report-preview-flow p{orphans:3;widows:3}
#report-preview-flow img{max-width:100%;max-height:950px;object-fit:contain;break-inside:avoid}
#report-preview-page-number{position:absolute;bottom:25px;left:56.69px;right:56.69px;border-top:1px solid #d6e3f0;padding-top:7px;font:9px Arial;color:#566476;display:flex;justify-content:space-between}
`;

export function prepararPaginacionInforme(doc: Document) {
  if (doc.getElementById('report-preview-flow')) return;
  const style = doc.createElement('style'); style.textContent = CSS_PAGINAS; doc.head.append(style);
  const flow = doc.createElement('div'); flow.id = 'report-preview-flow';
  while (doc.body.firstChild) flow.append(doc.body.firstChild);
  doc.body.append(flow);
  const footer = doc.createElement('div'); footer.id = 'report-preview-page-number'; doc.body.append(footer);
}

export function contarPaginasInforme(doc: Document) {
  const flow = doc.getElementById('report-preview-flow');
  return Math.max(1, Math.ceil(((flow?.scrollWidth ?? 681) + 113.38 - 1) / ANCHO_PAGINA_PREVIEW));
}

export function mostrarPaginaInforme(doc: Document, pagina: number) {
  const flow = doc.getElementById('report-preview-flow');
  if (flow) flow.style.transform = `translateX(-${(pagina - 1) * ANCHO_PAGINA_PREVIEW}px)`;
  const footer = doc.getElementById('report-preview-page-number');
  if (footer) {
    footer.replaceChildren();
    const label = doc.createElement('span'); label.textContent = 'Plan-OTs · BORRADOR · SIN EMISIÓN NI APROBACIÓN';
    const number = doc.createElement('span'); number.textContent = `${pagina} / ${contarPaginasInforme(doc)}`;
    footer.append(label, number);
  }
}
