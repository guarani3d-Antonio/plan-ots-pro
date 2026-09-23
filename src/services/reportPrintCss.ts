// Estilos autocontenidos: los borradores impresos no dependen de Tailwind CDN.
export const REPORT_PRINT_CSS = `
:root{color-scheme:light}
*,*::before,*::after{box-sizing:border-box}
html{font-family:Arial,Helvetica,sans-serif;color:#1a2433}
body{margin:0;font-size:12px;line-height:1.45;background:#fff}
h1,h2,h3,h4,p,figure{margin:0}
p{margin-top:5px;overflow-wrap:anywhere}
h1{font-size:23px;line-height:1.18;font-weight:700;letter-spacing:-.02em}
h3{font-size:13px;line-height:1.35;font-weight:700}
strong{font-weight:700;color:#243954}
.a4-page{color:#1a2433}
.flex{display:flex}.inline-flex{display:inline-flex}.flex-col{flex-direction:column}
.items-center{align-items:center}.items-start{align-items:flex-start}.items-end{align-items:flex-end}
.justify-between{justify-content:space-between}
.grid{display:grid}.grid-cols-2{grid-template-columns:repeat(2,minmax(0,1fr))}
.grid-cols-3{grid-template-columns:repeat(3,minmax(0,1fr))}.col-span-3{grid-column:span 3}
.gap-0\\.5{gap:2px}.gap-1{gap:4px}.gap-1\\.5{gap:6px}.gap-2\\.5{gap:10px}
.gap-4{gap:16px}.gap-6{gap:24px}.gap-12{gap:48px}
.w-full{width:100%}.h-1\\.5{height:6px}
.mb-2{margin-bottom:8px}.mb-3{margin-bottom:12px}.mb-4{margin-bottom:16px}
.mb-5{margin-bottom:20px}.mb-6{margin-bottom:24px}.mb-8{margin-bottom:32px}
.mb-10{margin-bottom:40px}.mb-12{margin-bottom:48px}
.mt-3{margin-top:12px}.mt-4{margin-top:16px}.mt-6{margin-top:24px}
.p-4{padding:16px}.p-5{padding:20px}.p-6{padding:24px}
.px-4{padding-left:16px;padding-right:16px}.px-6{padding-left:24px;padding-right:24px}
.py-1\\.5{padding-top:6px;padding-bottom:6px}
.pb-2{padding-bottom:8px}.pb-6{padding-bottom:24px}.pl-5{padding-left:20px}
.pt-14{padding-top:56px}
.border{border:1px solid #d5dce5}.border-b{border-bottom:1px solid #d5dce5}
.border-l-\\[6px\\]{border-left:6px solid #244b80}
.border-dashed{border-style:dashed}.border-outline-variant{border-color:#d5dce5}
.rounded-lg{border-radius:7px}.rounded-xl{border-radius:10px}.rounded-full{border-radius:999px}
.bg-surface-container-lowest{background:#fff}.bg-surface-container-low{background:#f4f7fa}
.bg-\\[\\#CC7A00\\]{background:#cc7a00}
.text-primary{color:#173d6c}.text-on-surface{color:#1a2433}
.text-on-surface-variant{color:#5c6776}.text-outline{color:#6a7482}
.text-\\[\\#CC7A00\\]{color:#a45e00}
.text-body-md{font-size:12px;line-height:1.5}.text-body-sm{font-size:11px}
.text-headline-xl{font-size:23px;line-height:1.18}
.text-xs{font-size:10px}.text-\\[10px\\]{font-size:10px}.text-\\[9px\\]{font-size:9px}
.font-bold,.font-label-bold,.font-section-header{font-weight:700}
.font-headline-xl{font-weight:700}.font-mono-technical{font-family:Consolas,monospace}
.text-right{text-align:right}.text-center{text-align:center}.text-justify{text-align:justify}
.uppercase{text-transform:uppercase}.italic{font-style:italic}
.tracking-widest{letter-spacing:.08em}.tracking-wider{letter-spacing:.05em}
.leading-relaxed{line-height:1.55}.shadow-sm{box-shadow:0 1px 4px #14283c12}
.max-w-3xl{max-width:48rem}
.a4-page>header{align-items:flex-start;gap:20px}
.a4-page>header>div:last-child{max-width:55%}
.a4-page>header+div{margin-bottom:24px}
.a4-page h1{border-left:5px solid #244b80;padding-left:16px;margin-bottom:9px}
.a4-page section{min-width:0;break-inside:avoid;page-break-inside:avoid}
.a4-page section>strong{display:block;font-size:11px;line-height:1.3;text-transform:uppercase;letter-spacing:.035em}
.a4-page section>p{font-size:12px;line-height:1.5}
.a4-page section.grid{gap:10px 14px}
.a4-page section.grid>div{min-width:0}
.a4-page section.grid>div>strong{display:block;font-size:11px;line-height:1.3;text-transform:uppercase;letter-spacing:.035em}
.a4-page section.grid>div>p{font-size:12px}
.evidencias-secuenciales{margin-top:14px}
.evidencia-bloque{width:100%;max-width:100%;break-inside:avoid;page-break-inside:avoid}
.acta-page>header{margin-bottom:22px;padding-bottom:15px}
.acta-page>header+div{margin-bottom:16px}
.acta-page .mb-6{margin-bottom:13px}.acta-page .mb-4{margin-bottom:10px}
.acta-page .p-4{padding:10px 12px}.acta-page .p-6{padding:13px 15px}
.acta-page section.grid{gap:8px 12px}
.os-page>header,.relevamiento-page>header{margin-bottom:22px;padding-bottom:13px}
.os-page>header+div,.relevamiento-page>header+div{margin-bottom:18px}
.os-page .mb-8,.relevamiento-page .mb-8{margin-bottom:17px}
.os-page .mb-6,.relevamiento-page .mb-6{margin-bottom:14px}
.os-page .mb-4,.relevamiento-page .mb-4{margin-bottom:10px}
.os-page .mt-4,.relevamiento-page .mt-4{margin-top:10px}
.os-page .mt-6,.relevamiento-page .mt-6{margin-top:12px}
.os-page .p-4,.relevamiento-page .p-4{padding:11px 13px}
.os-page .p-6,.relevamiento-page .p-6{padding:15px 17px}
.os-page section.grid,.relevamiento-page section.grid{gap:8px 12px}
.os-page section[style*="border-left"],.relevamiento-page section[style*="border-left"]{padding:12px 15px!important}
.relevamiento-page>header{margin-bottom:18px;padding-bottom:10px}
.relevamiento-page>header+div{margin-bottom:14px}
.relevamiento-page .mb-4{margin-bottom:7px}
.relevamiento-page .p-4{padding:9px 12px}
.relevamiento-page .p-6{padding:12px 15px}
.relevamiento-page section[style*="border-left"]{padding:10px 13px!important}
.page-footer{padding-top:10px;border-top:3px solid #cc7a00;color:#566476;font-size:10px}
.footer-pagina{color:#566476!important;opacity:1!important}
@media screen{
  .a4-page{margin:0 auto 24px;min-height:297mm;width:210mm;padding:18mm 18mm 16mm;background:#fff}
  .page-footer{width:210mm;margin:0 auto 24px;padding:10px 18mm 18mm;background:#fff}
}
@media print{
  @page{
    size:A4 portrait;margin:16mm 17mm 19mm;
    @bottom-left{content:"Plan-OTs · BORRADOR · SIN EMISIÓN NI APROBACIÓN";font:8px Arial,sans-serif;color:#566476}
    @bottom-right{content:counter(page) " / " counter(pages);font:8px Arial,sans-serif;color:#566476}
  }
  body{margin:0;padding:0;background:#fff}
  .a4-page{width:auto;min-height:0;margin:0;padding:0;display:block;box-shadow:none}
  .page-footer{display:none}
  header,.no-break,.evidencia-bloque{break-inside:avoid;page-break-inside:avoid}
  h1,h2,h3,h4{break-after:avoid;page-break-after:avoid}
  img{max-width:100%;break-inside:avoid;page-break-inside:avoid}
}
`;
