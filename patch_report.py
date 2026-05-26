with open('src/services/reportService.ts', 'r', encoding='utf-8') as f:
    c = f.read()

c = c.replace(
    "fotos: { file_url: string; descripcion?: string | null }[],\n): string {",
    "fotos: { file_url: string; descripcion?: string | null; descripcion_observacion?: string | null }[],\n): string {",
    1
)
c = c.replace(
    "chunks: { file_url: string; descripcion?: string | null }[][]",
    "chunks: { file_url: string; descripcion?: string | null; descripcion_observacion?: string | null }[][]",
    1
)
c = c.replace(
    "      const desc = (f.descripcion ?? '').trim();\n      const descripcionHtml",
    "      const desc = (f.descripcion ?? '').trim();\n      const obs  = (f.descripcion_observacion ?? '').trim();\n      const descripcionHtml",
    1
)
c = c.replace(
    "          <span style=\"font-size: 11px; color: #333; font-style: italic; line-height: 1.4;\">${descripcionHtml}</span>\n        </div>\n      </div>`;",
    "          <span style=\"font-size: 11px; color: #333; font-style: italic; line-height: 1.4;\">${descripcionHtml}</span>\n        </div>\n        ${obs ? `<div style=\"margin-top:4px;padding:5px 10px;background:#fff8f0;border-left:3px solid #CC7A00;border-radius:0 4px 4px 0\"><span style=\"font-size:10px;font-weight:600;color:#CC7A00;text-transform:uppercase;display:block;margin-bottom:2px\">Observación del Editor</span><span style=\"font-size:11px;color:#333;font-style:italic\">${escapeHtml(obs)}</span></div>` : ''}\n      </div>`;",
    1
)
c = c.replace(
    "  fotosAntes: { file_url: string; descripcion?: string | null }[],\n): string {\n  const bloquesAlcance",
    "  fotosAntes: { file_url: string; descripcion?: string | null; descripcion_observacion?: string | null }[],\n): string {\n  const bloquesAlcance",
    1
)
c = c.replace(
    "  fotosAntes: { file_url: string; descripcion?: string | null }[],\n  fotosDurante: { file_url: string; descripcion?: string | null }[],\n): string {",
    "  fotosAntes: { file_url: string; descripcion?: string | null; descripcion_observacion?: string | null }[],\n  fotosDurante: { file_url: string; descripcion?: string | null; descripcion_observacion?: string | null }[],\n): string {",
    1
)
c = c.replace(
    "  fotosAntes: { file_url: string; descripcion?: string | null }[],\n  fotosDespues: { file_url: string; descripcion?: string | null }[]\n): string {",
    "  fotosAntes: { file_url: string; descripcion?: string | null; descripcion_observacion?: string | null }[],\n  fotosDespues: { file_url: string; descripcion?: string | null; descripcion_observacion?: string | null }[]\n): string {",
    1
)

with open('src/services/reportService.ts', 'w', encoding='utf-8') as f:
    f.write(c)

print("Patch OK -", c.count('\n'), "lineas")