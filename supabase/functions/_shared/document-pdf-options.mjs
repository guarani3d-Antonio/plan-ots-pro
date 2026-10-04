// Cabecera/pie nativos de Chromium: no dependen del soporte de @page margin boxes.
export function opcionesPdfDocumento(codigo, revision) {
  if (!/^POT-\d{4}-[A-Z]+-\d+$/.test(codigo) ||
      !Number.isInteger(revision) || revision < 0)
    throw new Error('Identidad de PDF inválida');
  return {
    format: 'a4', printBackground: true, preferCSSPageSize: true,
    displayHeaderFooter: true,
    headerTemplate: '<span></span>',
    footerTemplate: `<div style="font:8px Arial,sans-serif;color:#566476;width:100%;margin:0 15mm;display:flex;justify-content:space-between"><span>Plan-OTs · ${codigo} · R${String(revision).padStart(2, '0')}</span><span>Página <span class="pageNumber"></span> de <span class="totalPages"></span></span></div>`,
  };
}
