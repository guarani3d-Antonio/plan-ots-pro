const MAX_EMBEDDED_BYTES = 30 * 1024 * 1024;

const PORTABLE_CSS = `
*{box-sizing:border-box}html{background:#fff}body{margin:0;color:#1a1c1f;background:#fff;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.45}
.a4-page{width:210mm;min-height:297mm;margin:0 auto;padding:18mm 20mm;display:flex;flex-direction:column;background:#fff;position:relative}
.flex,.inline-flex{display:flex}.inline-flex{display:inline-flex}.grid{display:grid}.flex-col{flex-direction:column}.flex-shrink-0{flex-shrink:0}
.grid-cols-2{grid-template-columns:repeat(2,minmax(0,1fr))}.grid-cols-3{grid-template-columns:repeat(3,minmax(0,1fr))}.col-span-3{grid-column:span 3/span 3}
.items-start{align-items:flex-start}.items-center{align-items:center}.items-end{align-items:flex-end}.justify-between{justify-content:space-between}.justify-center{justify-content:center}
.gap-1{gap:4px}.gap-2,.gap-2\\.5{gap:10px}.gap-3{gap:12px}.gap-4{gap:16px}.gap-6{gap:24px}.gap-8{gap:32px}.gap-12{gap:48px}
.p-4{padding:16px}.p-6{padding:24px}.px-3{padding-left:12px;padding-right:12px}.px-4{padding-left:16px;padding-right:16px}.px-6{padding-left:24px;padding-right:24px}.px-8{padding-left:32px;padding-right:32px}.py-1{padding-top:4px;padding-bottom:4px}.py-1\\.5{padding-top:6px;padding-bottom:6px}.py-2{padding-top:8px;padding-bottom:8px}.py-3{padding-top:12px;padding-bottom:12px}
.mb-2{margin-bottom:8px}.mb-3{margin-bottom:12px}.mb-4{margin-bottom:16px}.mb-5{margin-bottom:20px}.mb-6{margin-bottom:24px}.mb-8{margin-bottom:32px}.mb-10{margin-bottom:40px}.mb-12{margin-bottom:48px}.mt-2{margin-top:8px}.mt-3{margin-top:12px}.mt-6{margin-top:24px}.mt-8{margin-top:32px}.mt-10{margin-top:40px}.ml-2{margin-left:8px}.pl-5{padding-left:20px}.pt-4{padding-top:16px}.pt-6{padding-top:24px}.pt-14{padding-top:56px}.pb-2{padding-bottom:8px}.pb-6{padding-bottom:24px}
.w-full{width:100%}.max-w-full{max-width:100%}.max-w-3xl{max-width:48rem}.h-1\\.5{height:6px}.h-10{height:40px}.min-h-screen{min-height:100vh}
.border{border:1px solid #c3c6d1}.border-b{border-bottom:1px solid #c3c6d1}.border-t{border-top:1px solid #c3c6d1}.border-l-\\[6px\\]{border-left:6px solid #003366}.border-dashed{border-style:dashed}.rounded-md{border-radius:6px}.rounded-lg{border-radius:8px}.rounded-xl{border-radius:12px}.rounded-full{border-radius:999px}
.bg-surface,.bg-surface-container-lowest{background:#fff}.bg-surface-container-low{background:#f4f3f8}.bg-surface-container-highest{background:#e2e2e7}.bg-primary{background:#003366}.text-white,.text-on-primary{color:#fff}.text-primary{color:#003366}.text-secondary{color:#416181}.text-on-surface{color:#1a1c1f}.text-on-surface-variant{color:#43474f}.text-outline{color:#737780}
.font-bold{font-weight:700}.font-label-bold{font-weight:600}.uppercase{text-transform:uppercase}.italic{font-style:italic}.text-right{text-align:right}.text-center{text-align:center}.text-justify{text-align:justify}.tracking-widest{letter-spacing:.12em}.leading-relaxed{line-height:1.65}
.text-\\[9px\\]{font-size:9px}.text-\\[10px\\],.text-xs{font-size:10px}.text-\\[11px\\],.text-body-sm{font-size:12px}.text-body-md{font-size:14px}.text-xl{font-size:20px}.text-2xl,.text-headline-xl{font-size:24px}.shadow-sm,.shadow-md{box-shadow:0 1px 4px rgba(0,0,0,.1)}
.page-break{break-after:page;page-break-after:always}.no-break,header,footer,figure{break-inside:avoid;page-break-inside:avoid}img{max-width:100%;height:auto}
table{max-width:100%}h1,h2,h3,h4,p{margin-top:0}.material-symbols-outlined{font-family:Arial,sans-serif;font-size:0}.material-symbols-outlined:after{content:'•';font-size:14px}
@page{size:A4 portrait;margin:16mm}@media print{body{background:#fff}.a4-page{width:100%;min-height:0;margin:0;padding:8mm 10mm 20mm;box-shadow:none}.no-print{display:none!important}.page-footer{margin-top:auto}}
`;

export interface PortableReportResult {
  html: string;
  embeddedImages: number;
  missingImages: number;
  embeddedBytes: number;
}

function decodeAttribute(value: string): string {
  return value.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

function placeholder(label: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="100%" height="100%" fill="#f1f5f9"/><text x="50%" y="50%" text-anchor="middle" dominant-baseline="middle" font-family="Arial" font-size="28" fill="#64748b">${label}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const size = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += size)
    binary += String.fromCharCode(...bytes.subarray(offset, offset + size));
  return btoa(binary);
}

async function embedImage(src: string, fetcher: typeof fetch): Promise<{ dataUrl: string; bytes: number }> {
  if (src.startsWith('data:')) return { dataUrl: src, bytes: 0 };
  const response = await fetcher(src, { cache: 'no-store' });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const mime = response.headers.get('content-type')?.split(';')[0] ?? '';
  if (!mime.startsWith('image/')) throw new Error('El recurso no es una imagen');
  const buffer = await response.arrayBuffer();
  return { dataUrl: `data:${mime};base64,${bytesToBase64(new Uint8Array(buffer))}`, bytes: buffer.byteLength };
}

export async function hacerInformePortable(html: string, fetcher: typeof fetch = fetch): Promise<PortableReportResult> {
  let output = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<link\b[^>]*>/gi, '')
    .replace(/\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*')/gi, '');

  const sources = [...output.matchAll(/<img\b[^>]*\bsrc\s*=\s*(["'])(.*?)\1[^>]*>/gi)]
    .map(match => match[2])
    .filter((src, index, all) => all.indexOf(src) === index);
  let embeddedImages = 0, missingImages = 0, embeddedBytes = 0;

  for (const rawSource of sources) {
    const source = decodeAttribute(rawSource);
    let replacement: string;
    try {
      const embedded = await embedImage(source, fetcher);
      if (embeddedBytes + embedded.bytes > MAX_EMBEDDED_BYTES) throw new Error('Límite portable superado');
      embeddedBytes += embedded.bytes;
      replacement = embedded.dataUrl;
      embeddedImages++;
    } catch {
      replacement = placeholder('Imagen no disponible al exportar');
      missingImages++;
    }
    output = output.split(rawSource).join(replacement);
  }

  const security = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: blob:; style-src 'unsafe-inline'; font-src data:; base-uri 'none'; form-action 'none'; object-src 'none'"/><meta name="plan-ots-portable" content="1"/><style id="plan-ots-portable-css">${PORTABLE_CSS}</style>`;
  output = output.replace(/<head(\s[^>]*)?>/i, match => `${match}${security}`);
  if (!output.includes('plan-ots-portable-css')) throw new Error('El informe no contiene una cabecera HTML válida.');
  return { html: output, embeddedImages, missingImages, embeddedBytes };
}
