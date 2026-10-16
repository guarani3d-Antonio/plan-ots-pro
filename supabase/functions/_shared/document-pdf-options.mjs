// Cabecera/pie nativos de Chromium: no dependen del soporte de @page margin boxes.
export function opcionesPdfDocumento(codigo, revision, marca) {
  if (!/^POT-\d{4}-[A-Z]+-\d+$/.test(codigo) ||
      !Number.isInteger(revision) || revision < 0)
    throw new Error('Identidad de PDF inválida');
  const base = {
    format: 'a4', printBackground: true, preferCSSPageSize: true,
    displayHeaderFooter: true,
    headerTemplate: '<span></span>',
    footerTemplate: `<div style="font:8px Arial,sans-serif;color:#566476;width:100%;margin:0 15mm;display:flex;justify-content:space-between"><span>Plan-OTs · ${codigo} · R${String(revision).padStart(2, '0')}</span><span>Página <span class="pageNumber"></span> de <span class="totalPages"></span></span></div>`,
  };
  if(!marca)return base;
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const empresa=esc(marca.empresa);
  return {...base,
    headerTemplate:`<div style="font:7px Arial,sans-serif;color:#596c83;width:100%;margin:0 15mm;display:flex;justify-content:space-between;gap:15px"><span style="max-width:65%;overflow-wrap:anywhere;white-space:normal">${empresa}</span><span>${codigo} · R${String(revision).padStart(2,'0')}</span></div>`,
    footerTemplate:`<div style="font:8px Arial,sans-serif;color:#173455;width:100%;margin:0 15mm;border-top:1px solid #173455;padding-top:6px"><div style="display:flex;justify-content:space-between;gap:12px"><span>PLAN-OTS · ${codigo} · R${String(revision).padStart(2,'0')}</span><span>Página <span class="pageNumber"></span> de <span class="totalPages"></span></span></div><div style="font-size:7px;color:#596c83;margin-top:4px;overflow-wrap:anywhere;white-space:normal">${empresa} · La emisión y las firmas se verifican en el registro digital.</div></div>`};
}
