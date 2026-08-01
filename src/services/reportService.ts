// reportService.ts — BBC Facility Services
// Generación de informes PDF vía HTML imprimible (window.open → window.print).
// Sin dependencias externas. Cada template inyecta Tailwind por CDN y agrega
// estilos @media print para A4 portrait con márgenes 20mm/15mm.

import type { OrdenLocal } from '../types/orden';

// ──────────────────────────────────────────────────────────── Tipos ──

export type TipoInforme =
  | 'ficha_visita'
  | 'relevamiento'
  | 'avance'
  | 'cierre'
  | 'acta_conformidad';

export interface FotoInforme {
  url: string;
  categoria: 'ANTES' | 'DURANTE' | 'DESPUES' | 'ADJUNTO';
  descripcion?: string;
}

export interface OrdenParaInforme {
  ot: string;
  descripcion?: string;
  estado: string;
  rubro: string;
  rubro_secundario?: string[];
  responsable: string;
  contratistas?: string[];
  ubicacion?: string;
  obra?: string;
  unidad_amenities?: string;
  prioridad?: string;
  nivel_riesgo?: 'Bajo' | 'Medio' | 'Alto' | 'Extremo' | null;
  fecha_ingreso?: string;
  fecha_inicio_trabajos?: string;
  fecha_fin_trabajos?: string;
  porcentaje_avance?: number;
  costo?: number;
  en_garantia?: boolean;
  asiste_facility?: boolean;
  reincidencia?: boolean;
  potencialmente_conflictivo?: boolean;
  comentarios?: string;
  fotos?: FotoInforme[];
}

export interface ProyectoParaInforme {
  nombre: string;
  cliente?: string;
  direccion?: string;
}

// ──────────────────────────────────────────────────────── Helpers ──

const hoy = (): string =>
  new Date().toLocaleDateString('es-PY', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });

const formatFecha = (iso?: string): string => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('es-PY', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
};

const formatGuaranies = (valor?: number | null): string => {
  if (valor == null) return '—';
  return valor.toLocaleString('es-PY') + ' Gs.';
};

const si = (v: boolean | undefined): string => (v ? 'Sí' : 'No');

// Escape HTML entities y preserva saltos de línea como <br>. Es CRÍTICO porque
// los templates se inyectan vía innerHTML — sin escape, contenido del usuario
// con `<` o `&` rompe el documento o abre XSS. Además, sin reemplazar `\n` por
// `<br>` los párrafos multi-línea se cortan en una sola línea visible.
const val = (v?: string | number | null, fallback = '—'): string => {
  if (v == null || v === '') return fallback;
  return String(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\n/g, '<br>');
};

const arrayVal = (arr?: string[]): string => {
  if (!arr || arr.length === 0) return '—';
  return arr.join(', ');
};

const nivelRiesgoBadge = (n?: string | null): string => {
  if (!n) return '<span class="text-slate-400">—</span>';
  const map: Record<string, string> = {
    Bajo:    'bg-green-100 text-green-800 border-green-300',
    Medio:   'bg-yellow-100 text-yellow-800 border-yellow-300',
    Alto:    'bg-orange-100 text-orange-800 border-orange-300',
    Extremo: 'bg-red-100 text-red-800 border-red-300',
  };
  const cls = map[n] ?? 'bg-slate-100 text-slate-700 border-slate-300';
  return `<span class="inline-block px-2.5 py-0.5 rounded-full border text-xs font-semibold ${cls}">${n}</span>`;
};

// ──────────────────────────────────────────────── Logo corporativo ──
// Logo "Guaraní 3D del Grupo Díaz Villaverde" como SVG inline para que se
// imprima sin depender de carga externa. La versión pequeña (footer) se
// genera reemplazando las dimensiones de la versión base.
const LOGO_G3D_SVG = `
<svg width="160" height="44" viewBox="0 0 160 44" xmlns="http://www.w3.org/2000/svg">
  <text x="0" y="34" font-family="Georgia, serif" font-size="38" font-weight="700" fill="#C9922A">g</text>
  <rect x="30" y="4" width="2" height="36" fill="#C9922A"/>
  <text x="38" y="22" font-family="Arial, sans-serif" font-size="16" font-weight="700" fill="#FFFFFF">Guaraní</text>
  <text x="38" y="38" font-family="Arial, sans-serif" font-size="16" font-weight="700" fill="#C9922A">3d</text>
  <text x="72" y="28" font-family="Arial, sans-serif" font-size="6.5" font-weight="600" fill="#C9922A" letter-spacing="0.5">DE DIAZ VILLAVERDE</text>
  <text x="72" y="37" font-family="Arial, sans-serif" font-size="6.5" font-weight="600" fill="#C9922A" letter-spacing="0.5">CONSTRUCTORA</text>
</svg>`;

const fotosHtml = (
  fotos: FotoInforme[] | undefined,
  categoria: FotoInforme['categoria'],
): string => {
  const lista = (fotos ?? []).filter(f => f.categoria === categoria);
  if (lista.length === 0) {
    return `<p class="text-sm text-slate-400 italic">Sin fotos en esta categoría.</p>`;
  }
  return `
    <div class="grid grid-cols-3 gap-3">
      ${lista
        .map(
          f => `
        <figure class="border border-slate-200 rounded-lg overflow-hidden bg-white">
          <img src="${f.url}" class="w-full h-32 object-cover" />
          ${
            f.descripcion
              ? `<figcaption class="px-2 py-1 text-[10px] text-slate-600 border-t border-slate-100">${val(f.descripcion)}</figcaption>`
              : ''
          }
        </figure>`,
        )
        .join('')}
    </div>
  `;
};

// ─────────────────────── Window opener (alert si bloquea popups) ──

function abrirVentana(html: string): void {
  const ventana = window.open('', '_blank');
  if (!ventana) {
    alert(
      'No se pudo abrir la ventana del informe. Habilitá los popups para este sitio y volvé a intentar.',
    );
    return;
  }
  ventana.document.write(html);
  ventana.document.close();
}

// ──────────────────────────────────────────── Shared template parts ──

// <head> común para los 5 templates: Tailwind CDN, Inter font, CSS de impresión
// (encabezado/pie por página, marca de agua CONFIDENCIAL, watermark fijo).
function headComun(titulo: string): string {
  return `
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${titulo} — BBC Facility Services</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet" />
  <style>
    * { font-family: 'Inter', sans-serif; }
    @page {
      size: A4 portrait;
      margin: 28mm 15mm 22mm 15mm;
    }
    @media print {
      .no-print { display: none !important; }
      body { background: white !important; }
      .page-break { page-break-before: always; }
      img { max-height: 160px; object-fit: cover; }

      /* Encabezado repetido en cada página */
      .header-print {
        position: running(header);
        display: flex;
        justify-content: space-between;
        align-items: center;
        border-bottom: 1px solid #E5E7EB;
        padding-bottom: 6px;
        font-size: 10px;
        color: #6B7280;
      }

      /* Pie de página con numeración */
      @page {
        @top-left { content: element(header); }
        @bottom-center {
          content: "Guaraní 3D del Grupo Díaz Villaverde — Propiedad Intelectual © " counter(page) " / " counter(pages);
          font-size: 9px;
          color: #9CA3AF;
          font-family: 'Inter', sans-serif;
        }
        @bottom-right {
          content: "CONFIDENCIAL — Página " counter(page) " de " counter(pages);
          font-size: 9px;
          color: #9CA3AF;
          font-family: 'Inter', sans-serif;
        }
      }
    }

    /* Marca de agua CONFIDENCIAL */
    body::before {
      content: 'CONFIDENCIAL';
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%) rotate(-35deg);
      font-size: 80px;
      font-weight: 900;
      color: rgba(200, 200, 200, 0.12);
      pointer-events: none;
      z-index: 0;
      letter-spacing: 0.2em;
      white-space: nowrap;
    }

    .foto-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 8px; }
    .foto-item img { width: 100%; height: 140px; object-fit: cover; border-radius: 6px; border: 1px solid #E5E7EB; }
    .no-fotos { color: #9CA3AF; font-style: italic; font-size: 12px; padding: 12px 0; }
    .field-row { display: flex; gap: 4px; margin-bottom: 6px; }
    .field-label { font-size: 10px; font-weight: 600; color: #6B7280; text-transform: uppercase; letter-spacing: 0.05em; min-width: 140px; }
    .field-value { font-size: 13px; color: #111827; white-space: pre-wrap; word-break: break-word; }
    .section-title { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #1E3A5F; border-bottom: 2px solid #1E3A5F; padding-bottom: 4px; margin: 16px 0 10px; }
    .firma-box { border: 1px solid #D1D5DB; border-radius: 6px; height: 72px; margin-top: 8px; position: relative; }
    .firma-label { font-size: 10px; color: #9CA3AF; position: absolute; bottom: 6px; left: 0; right: 0; text-align: center; }
    .page-number { font-size: 10px; color: #9CA3AF; text-align: right; margin-top: 8px; }
  </style>
</head>`;
}

const PRINT_BUTTON = `
  <button
    onclick="window.print()"
    class="no-print fixed top-4 right-4 z-50 bg-blue-700 hover:bg-blue-800 text-white font-semibold text-sm px-4 py-2 rounded-lg shadow-md"
  >Imprimir / Guardar PDF</button>
`;

// Header corporativo: gradiente navy + logo Guaraní 3D a la derecha + sub-header
// con disclaimer de propiedad intelectual y badge CONFIDENCIAL.
function headerBBC(subtitulo: string, codigo?: string): string {
  return `
  <div style="background: linear-gradient(135deg, #0B1929, #1E3A5F); color: white; padding: 20px 28px; border-radius: 8px 8px 0 0; display: flex; justify-content: space-between; align-items: center;">
    <div style="display:flex; flex-direction:column; gap:6px;">
      <div style="font-size: 10px; font-weight: 600; letter-spacing: 0.15em; opacity: 0.7; text-transform: uppercase;">BBC FACILITY SERVICES</div>
      <div style="font-size: 22px; font-weight: 800; letter-spacing: -0.02em;">${subtitulo}</div>
      ${codigo ? `<div style="font-size: 10px; opacity: 0.55; letter-spacing: 0.1em; text-transform:uppercase;">${codigo}</div>` : ''}
    </div>
    <div style="display:flex; flex-direction:column; align-items:flex-end; gap:8px;">
      <div style="background: #0B1929; border-radius: 6px; padding: 6px 10px;">
        ${LOGO_G3D_SVG}
      </div>
      <div style="font-size: 11px; opacity: 0.55; text-align:right;">
        FECHA<br>
        <strong style="font-size:13px; opacity:1;">${hoy()}</strong>
      </div>
    </div>
  </div>
  <div style="background: #F8FAFC; border-bottom: 1px solid #E5E7EB; padding: 8px 28px; display:flex; justify-content:space-between; align-items:center;">
    <span style="font-size:10px; color:#6B7280; font-style:italic;">
      Guaraní 3D del Grupo Díaz Villaverde — Propiedad Intelectual
    </span>
    <span style="font-size:10px; color:#9CA3AF; font-weight:600; letter-spacing:0.05em;">
      🔒 CONFIDENCIAL
    </span>
  </div>`;
}

// Footer corporativo: logo pequeño + badge + leyenda legal + fecha.
function bloqueFooter(): string {
  const logoMini = LOGO_G3D_SVG.replace('width="160"', 'width="100"').replace('height="44"', 'height="28"');
  return `
  <div style="margin-top:32px; padding-top:12px; border-top:2px solid #E5E7EB;">
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
      <div style="background:#0B1929; border-radius:4px; padding:4px 8px; display:inline-block;">
        ${logoMini}
      </div>
      <span style="font-size:10px; color:#9CA3AF; font-weight:600;">🔒 DOCUMENTO CONFIDENCIAL</span>
    </div>
    <div style="display:flex; justify-content:space-between; font-size:9px; color:#C4C4C4;">
      <span>© Guaraní 3D del Grupo Díaz Villaverde — Todos los derechos reservados. Prohibida su reproducción sin autorización.</span>
      <span>${hoy()}</span>
    </div>
  </div>`;
}

function bloqueDatosOT(orden: OrdenParaInforme, proyecto: ProyectoParaInforme): string {
  return `
    <section class="mt-6 grid grid-cols-2 gap-4">
      <div class="border border-slate-200 rounded-xl p-4 bg-white">
        <div class="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-2">Proyecto</div>
        <div class="text-base font-bold text-slate-900">${val(proyecto.nombre)}</div>
        ${proyecto.cliente ? `<div class="text-xs text-slate-600 mt-1">Cliente: ${proyecto.cliente}</div>` : ''}
        ${proyecto.direccion ? `<div class="text-xs text-slate-600">${proyecto.direccion}</div>` : ''}
      </div>
      <div class="border border-slate-200 rounded-xl p-4 bg-white">
        <div class="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-2">Orden de trabajo</div>
        <div class="text-base font-bold text-slate-900">${val(orden.ot)}</div>
        <div class="text-xs text-slate-600 mt-1">Estado: <span class="font-semibold">${val(orden.estado)}</span></div>
        ${orden.prioridad ? `<div class="text-xs text-slate-600">Prioridad: ${orden.prioridad}</div>` : ''}
      </div>
    </section>

    <section class="mt-4 border border-slate-200 rounded-xl p-4 bg-white">
      <div class="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-3">Datos de la OT</div>
      <dl class="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
        <div><dt class="text-slate-500 inline">Rubro:</dt> <dd class="inline font-medium">${val(orden.rubro)}</dd></div>
        <div><dt class="text-slate-500 inline">Rubros sec.:</dt> <dd class="inline font-medium">${arrayVal(orden.rubro_secundario)}</dd></div>
        <div><dt class="text-slate-500 inline">Responsable:</dt> <dd class="inline font-medium">${val(orden.responsable)}</dd></div>
        <div><dt class="text-slate-500 inline">Contratistas:</dt> <dd class="inline font-medium">${arrayVal(orden.contratistas)}</dd></div>
        <div><dt class="text-slate-500 inline">Ubicación:</dt> <dd class="inline font-medium">${val(orden.ubicacion)}</dd></div>
        <div><dt class="text-slate-500 inline">Obra / Unidad:</dt> <dd class="inline font-medium">${val(orden.obra || orden.unidad_amenities)}</dd></div>
        <div><dt class="text-slate-500 inline">Riesgo:</dt> <dd class="inline">${nivelRiesgoBadge(orden.nivel_riesgo ?? undefined)}</dd></div>
        <div><dt class="text-slate-500 inline">En garantía:</dt> <dd class="inline font-medium">${si(orden.en_garantia)}</dd></div>
        <div><dt class="text-slate-500 inline">F. ingreso:</dt> <dd class="inline font-medium">${formatFecha(orden.fecha_ingreso)}</dd></div>
        <div><dt class="text-slate-500 inline">F. inicio:</dt> <dd class="inline font-medium">${formatFecha(orden.fecha_inicio_trabajos)}</dd></div>
        <div><dt class="text-slate-500 inline">F. cierre:</dt> <dd class="inline font-medium">${formatFecha(orden.fecha_fin_trabajos)}</dd></div>
        <div><dt class="text-slate-500 inline">Costo:</dt> <dd class="inline font-medium">${formatGuaranies(orden.costo)}</dd></div>
      </dl>
      ${
        orden.descripcion
          ? `<div class="mt-3 pt-3 border-t border-slate-100">
              <div class="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1">Descripción</div>
              <div style="min-height:80px; max-height:none; white-space:pre-wrap; word-break:break-word; overflow:visible;" class="text-sm text-slate-700 leading-relaxed">${val(orden.descripcion)}</div>
            </div>`
          : ''
      }
      ${
        orden.comentarios
          ? `<div class="mt-3 pt-3 border-t border-slate-100">
              <div class="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1">Comentarios</div>
              <div style="min-height:80px; max-height:none; white-space:pre-wrap; word-break:break-word; overflow:visible;" class="text-sm text-slate-700 leading-relaxed">${val(orden.comentarios)}</div>
            </div>`
          : ''
      }
    </section>
  `;
}

function bloqueFotos(orden: OrdenParaInforme, categorias: FotoInforme['categoria'][]): string {
  return categorias
    .map(
      cat => `
    <section class="mt-5">
      <div class="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-2">Fotos · ${cat}</div>
      ${fotosHtml(orden.fotos, cat)}
    </section>
  `,
    )
    .join('');
}

function bloqueFirmas(roles: string[]): string {
  return `
    <section class="mt-10 pt-6 border-t-2 border-slate-300 grid grid-cols-${roles.length} gap-8">
      ${roles
        .map(
          rol => `
        <div>
          <div class="firma-box"></div>
          <div class="text-center text-xs text-slate-600 mt-2 font-semibold uppercase tracking-wide">${rol}</div>
          <div class="text-center text-[10px] text-slate-400 mt-0.5">Firma y aclaración</div>
        </div>
      `,
        )
        .join('')}
    </section>
  `;
}

function envoltorio(titulo: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="es">
${headComun(titulo)}
<body class="bg-slate-50" style="position: relative;">
  ${PRINT_BUTTON}
  <main class="max-w-[210mm] mx-auto bg-white shadow my-6" style="position: relative; z-index: 1;">
    ${body}
    ${bloqueFooter()}
  </main>
</body>
</html>`;
}

// ────────────────────────────────────── 1. Ficha de visita ──
//
// Página única. SIN fotos. Estructura:
//   - Datos OT (header + datos del cliente)
//   - Descripción del trabajo (área con líneas punteadas para escribir)
//   - Checklist pre-trabajo (8 ítems, 3 columnas: Ítem / Condición / Observación)
//   - Próximos pasos (4 líneas punteadas)
//   - Firmas: Inspector + Responsable del Sitio

const ITEMS_CHECKLIST_FICHA = [
  'Acceso al área',
  'EPP completo del técnico',
  'Herramientas verificadas',
  'Planos / esquemas disponibles',
  'Coordinación con cliente',
  'Sectores afectados notificados',
  'Materiales en sitio',
  'Energías peligrosas neutralizadas',
];

function lineasPunteadas(n: number): string {
  return Array.from({ length: n }, () =>
    '<div style="border-bottom:1px dashed #cbd5e1; margin:10px 0; height:22px;"></div>',
  ).join('');
}

export function generarFichaVisita(
  orden: OrdenParaInforme,
  proyecto: ProyectoParaInforme,
): void {
  const checklistRows = ITEMS_CHECKLIST_FICHA.map(item => `
    <tr>
      <td class="py-2 px-3 text-sm text-slate-700 border-b border-slate-100">${val(item)}</td>
      <td class="py-2 px-3 text-center text-xs font-semibold text-slate-500 border-b border-slate-100">
        <span class="inline-block px-3 py-0.5 rounded-full border border-slate-300">__________</span>
      </td>
      <td class="py-2 px-3 text-xs text-slate-400 border-b border-slate-100" style="min-width:140px;"></td>
    </tr>
  `).join('');

  const body = `
    ${headerBBC('Ficha de Visita', `Registro inicial de OT ${val(orden.ot)}`)}
    <div class="px-10 pb-10">
      ${bloqueDatosOT(orden, proyecto)}

      <section class="mt-5 border border-slate-200 rounded-xl p-5 bg-white">
        <div class="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-3">Descripción del trabajo</div>
        ${lineasPunteadas(4)}
      </section>

      <section class="mt-5 border border-slate-200 rounded-xl p-5 bg-white">
        <div class="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-3">Checklist pre-trabajo</div>
        <table class="w-full">
          <thead>
            <tr class="bg-slate-50">
              <th class="text-left text-[10px] text-slate-500 font-semibold uppercase tracking-wide px-3 py-2 border-b border-slate-200">Ítem</th>
              <th class="text-center text-[10px] text-slate-500 font-semibold uppercase tracking-wide px-3 py-2 border-b border-slate-200 w-32">Condición</th>
              <th class="text-left text-[10px] text-slate-500 font-semibold uppercase tracking-wide px-3 py-2 border-b border-slate-200">Observación</th>
            </tr>
          </thead>
          <tbody>${checklistRows}</tbody>
        </table>
      </section>

      <section class="mt-5 border border-slate-200 rounded-xl p-5 bg-white">
        <div class="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-3">Próximos pasos</div>
        ${lineasPunteadas(4)}
      </section>

      ${bloqueFirmas(['Inspector', 'Responsable del Sitio'])}
    </div>
  `;
  abrirVentana(envoltorio(`Ficha de visita · ${orden.ot}`, body));
}

// ──────────────────────────────────── 2. Relevamiento ──
//
// Página única. Estructura:
//   - Datos OT
//   - Diagnóstico inicial (pre-llenado con comentarioInicial si existe; sino
//     líneas punteadas para escribir a mano)
//   - Alcance detectado (3 columnas: Trabajos requeridos / Materiales /
//     Tiempo estimado, cada una con 4 líneas punteadas)
//   - Fotos ANTES
//   - Firmas: Inspector + Responsable

export function generarRelevamiento(
  orden: OrdenParaInforme,
  proyecto: ProyectoParaInforme,
  comentarioInicial?: string,
): void {
  const diagText = (comentarioInicial ?? '').trim();
  const diagBlock = diagText
    ? `<div class="border border-slate-200 rounded p-3 text-sm text-slate-700"
            style="min-height:80px; white-space:pre-wrap; word-break:break-word;">${val(diagText)}</div>`
    : lineasPunteadas(4);

  const colAlcance = (titulo: string) => `
    <div class="border border-slate-200 rounded-lg p-3 bg-white">
      <div class="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-2">${val(titulo)}</div>
      ${lineasPunteadas(4)}
    </div>
  `;

  const body = `
    ${headerBBC('Informe de Relevamiento', `Diagnóstico técnico — OT ${val(orden.ot)}`)}
    <div class="px-10 pb-10">
      ${bloqueDatosOT(orden, proyecto)}

      <section class="mt-5 border border-slate-200 rounded-xl p-5 bg-white">
        <div class="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-3">Diagnóstico inicial</div>
        ${diagBlock}
      </section>

      <section class="mt-5">
        <div class="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-2">Alcance detectado</div>
        <div class="grid grid-cols-3 gap-3">
          ${colAlcance('Trabajos requeridos')}
          ${colAlcance('Materiales estimados')}
          ${colAlcance('Tiempo estimado')}
        </div>
      </section>

      ${bloqueFotos(orden, ['ANTES'])}
      ${bloqueFirmas(['Inspector', 'Responsable'])}
    </div>
  `;
  abrirVentana(envoltorio(`Relevamiento · ${orden.ot}`, body));
}

// ──────────────────────────────────────── 3. Avance ──
//
// Página única. Estructura:
//   - Datos OT
//   - Estado actual (pre-llenado con comentarioAvance si existe; sino líneas)
//   - Métricas: barra de % avance + días en ejecución
//   - Fotos ANTES + Fotos DURANTE
//   - Observaciones (4 líneas punteadas)
//   - Firmas: Inspector + Responsable

export function generarAvance(
  orden: OrdenParaInforme,
  proyecto: ProyectoParaInforme,
  comentarioAvance?: string,
): void {
  const avance = orden.porcentaje_avance ?? 0;

  const diasEnEjecucion = orden.fecha_inicio_trabajos
    ? Math.max(
        0,
        Math.floor(
          (Date.now() - new Date(orden.fecha_inicio_trabajos).getTime()) /
            86400000,
        ),
      )
    : null;

  const estadoText = (comentarioAvance ?? '').trim();
  const estadoBlock = estadoText
    ? `<div class="border border-slate-200 rounded p-3 text-sm text-slate-700"
            style="min-height:80px; white-space:pre-wrap; word-break:break-word;">${val(estadoText)}</div>`
    : lineasPunteadas(4);

  const body = `
    ${headerBBC('Informe de Avance', `Progreso de ejecución — OT ${val(orden.ot)}`)}
    <div class="px-10 pb-10">
      ${bloqueDatosOT(orden, proyecto)}

      <section class="mt-5 border border-slate-200 rounded-xl p-5 bg-white">
        <div class="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-3">Estado actual</div>
        ${estadoBlock}
      </section>

      <section class="mt-5 grid grid-cols-2 gap-3">
        <div class="border border-slate-200 rounded-xl p-4 bg-white">
          <div class="flex items-center justify-between mb-2">
            <div class="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Avance de obra</div>
            <div class="text-2xl font-extrabold text-blue-700">${avance}%</div>
          </div>
          <div class="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
            <div class="h-full bg-blue-600" style="width:${avance}%"></div>
          </div>
        </div>
        <div class="border border-slate-200 rounded-xl p-4 bg-white text-center flex flex-col justify-center">
          <div class="text-3xl font-extrabold text-slate-900">${diasEnEjecucion !== null ? diasEnEjecucion : '—'}</div>
          <div class="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mt-1">${diasEnEjecucion !== null ? `Día${diasEnEjecucion === 1 ? '' : 's'} en ejecución` : 'Días en ejecución'}</div>
        </div>
      </section>

      ${bloqueFotos(orden, ['ANTES', 'DURANTE'])}

      <section class="mt-5 border border-slate-200 rounded-xl p-5 bg-white">
        <div class="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-3">Observaciones</div>
        ${lineasPunteadas(4)}
      </section>

      ${bloqueFirmas(['Inspector', 'Responsable'])}
    </div>
  `;
  abrirVentana(envoltorio(`Avance · ${orden.ot}`, body));
}

// ──────────────────────────────────────── 4. Cierre ──

export function generarCierre(
  orden: OrdenParaInforme,
  proyecto: ProyectoParaInforme,
): void {
  const dias =
    orden.fecha_ingreso && orden.fecha_fin_trabajos
      ? Math.max(
          0,
          Math.floor(
            (new Date(orden.fecha_fin_trabajos).getTime() -
              new Date(orden.fecha_ingreso).getTime()) /
              86400000,
          ),
        )
      : '—';
  const avance = orden.porcentaje_avance ?? 100;
  const costo = formatGuaranies(orden.costo);

  const body = `
    ${headerBBC('Informe de Cierre', `Cierre de OT ${val(orden.ot)}`)}
    <div class="px-10 pb-10">
      ${bloqueDatosOT(orden, proyecto)}

      <section class="mt-5 grid grid-cols-3 gap-3">
        <div class="border border-slate-200 rounded-xl p-4 bg-white text-center">
          <div class="text-3xl font-extrabold text-blue-700">${dias}</div>
          <div class="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mt-1">Días totales</div>
        </div>
        <div class="border border-slate-200 rounded-xl p-4 bg-white text-center">
          <div class="text-3xl font-extrabold text-green-600">${avance}%</div>
          <div class="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mt-1">Avance final</div>
        </div>
        <div class="border border-slate-200 rounded-xl p-4 bg-white text-center">
          <div class="text-3xl font-extrabold text-slate-900">${costo}</div>
          <div class="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mt-1">Costo total</div>
        </div>
      </section>

      ${bloqueFotos(orden, ['ANTES', 'DESPUES'])}
      ${bloqueFirmas(['Contratista', 'Supervisor BBC', 'Cliente'])}
    </div>
  `;
  abrirVentana(envoltorio(`Cierre · ${orden.ot}`, body));
}

// ──────────────────────────────── 5. Acta de Conformidad ──

// ──────────────────────────────── 5. Acta de Conformidad ──
//
// Página única. SIN fotos. Estructura:
//   - Datos OT
//   - Declaración de conformidad (párrafo formal con código OT inline)
//   - Encuesta de satisfacción (5 preguntas, escala 1-5, celdas vacías para
//     que el cliente marque a mano)
//   - Comentarios adicionales (3 líneas punteadas)
//   - Garantía (texto con espacio en blanco para días)
//   - Firmas: Técnico ejecutor + Supervisor + Representante del cliente

export function generarActaConformidad(
  orden: OrdenParaInforme,
  proyecto: ProyectoParaInforme,
): void {
  const encuestaRow = (etiqueta: string) => `
    <tr>
      <td class="py-2 px-3 text-sm text-slate-700 border-b border-slate-100">${val(etiqueta)}</td>
      ${[1, 2, 3, 4, 5]
        .map(
          n => {
            const esEjemplo = n === 5;
            const fill = esEjemplo
              ? 'background:#CC7A00; color:white; border-color:#CC7A00;'
              : 'background:white; color:#94a3b8;';
            return `<td class="py-2 px-2 text-center border-b border-slate-100">
              <span class="inline-flex items-center justify-center w-6 h-6 rounded-full border border-slate-400 text-xs font-semibold" style="${fill}">${n}</span>
            </td>`;
          },
        )
        .join('')}
    </tr>
  `;

  const body = `
    ${headerBBC('Acta de Conformidad', `Conformidad final del cliente — OT ${val(orden.ot)}`)}
    <div class="px-10 pb-10">
      ${bloqueDatosOT(orden, proyecto)}

      <section class="mt-6 border border-slate-200 rounded-xl p-5 bg-white">
        <div class="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-3">Declaración de conformidad</div>
        <p class="text-sm text-slate-700 leading-relaxed text-justify">
          Por medio del presente documento, el representante del cliente declara haber recibido a entera satisfacción los trabajos correspondientes a la <strong>Orden de Trabajo ${val(orden.ot)}</strong>, ejecutados por BBC Constructora S.A. en las instalaciones indicadas, verificando que los mismos cumplen con los estándares técnicos, de limpieza y seguridad establecidos.
        </p>
      </section>

      <section class="mt-5 border border-slate-200 rounded-xl p-5 bg-white">
        <div class="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-3">Encuesta de satisfacción</div>
        <p class="text-xs text-slate-500 mb-3">Marque del 1 (insuficiente) al 5 (excelente).</p>
        <table class="w-full">
          <thead>
            <tr class="bg-slate-50">
              <th class="text-left text-[10px] text-slate-500 font-semibold uppercase tracking-wide px-3 py-2 border-b border-slate-200">Ítem</th>
              ${[1, 2, 3, 4, 5]
                .map(
                  n => `<th class="text-center text-[10px] text-slate-500 font-semibold px-2 py-2 border-b border-slate-200 w-10">${n}</th>`,
                )
                .join('')}
            </tr>
          </thead>
          <tbody>
            ${encuestaRow('Calidad técnica del trabajo')}
            ${encuestaRow('Cumplimiento de plazos')}
            ${encuestaRow('Limpieza y orden del área')}
            ${encuestaRow('Comunicación del personal técnico')}
            ${encuestaRow('Nivel de limpieza post-intervención')}
          </tbody>
        </table>
      </section>

      <section class="mt-5 border border-slate-200 rounded-xl p-5 bg-white">
        <div class="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-3">Comentarios adicionales</div>
        ${lineasPunteadas(3)}
      </section>

      <section class="mt-5 border border-slate-200 rounded-xl p-5 bg-white" style="border-left:4px solid #CC7A00;">
        <div class="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-2">Garantía</div>
        <p class="text-sm text-slate-700 leading-relaxed">
          BBC Constructora S.A. garantiza los trabajos realizados por un período de
          <span style="display:inline-block; border-bottom:1px dashed #888; min-width:50px; text-align:center;">&nbsp;&nbsp;&nbsp;&nbsp;</span>
          días a partir de la fecha de firma del presente documento, cubriendo defectos de mano de obra y materiales instalados.
        </p>
      </section>

      ${bloqueFirmas(['Técnico Ejecutor', 'Supervisor', 'Representante del Cliente'])}
    </div>
  `;
  abrirVentana(envoltorio(`Acta de conformidad · ${orden.ot}`, body));
}

// ───────────────────────────────────────────── Dispatcher ──

// `contexto` lleva data opcional pre-llenada que algunos generadores aceptan
// (comentarioInicial para Relevamiento, comentarioAvance para Avance). Si no se
// pasa, los generadores caen al fallback de "líneas para escribir a mano".
export function generarInforme(
  tipo: TipoInforme,
  orden: OrdenParaInforme,
  proyecto: ProyectoParaInforme,
  contexto?: { comentarioInicial?: string; comentarioAvance?: string },
): void {
  switch (tipo) {
    case 'ficha_visita':     return generarFichaVisita(orden, proyecto);
    case 'relevamiento':     return generarRelevamiento(orden, proyecto, contexto?.comentarioInicial);
    case 'avance':           return generarAvance(orden, proyecto, contexto?.comentarioAvance);
    case 'cierre':           return generarCierre(orden, proyecto);
    case 'acta_conformidad': return generarActaConformidad(orden, proyecto);
  }
}

// ───────────────────────────────────────── Disponibilidad ──

export function informeDisponible(tipo: TipoInforme, estadoOT: string): boolean {
  switch (tipo) {
    case 'ficha_visita':     return true;
    case 'relevamiento':     return true;
    case 'avance':           return estadoOT === 'En proceso' || estadoOT === 'Cerrada';
    case 'cierre':           return estadoOT === 'Cerrada';
    case 'acta_conformidad': return estadoOT === 'Cerrada';
  }
}

// ─────────────────────────────────────────────────────── Informes BBC ──
//
// Helpers compartidos por los 5 generadores de informe (Cierre + 4 nuevos).
// Mantienen exactamente la misma estética A4 / Tailwind / Inter / Sora /
// Material Symbols / footer naranja fijo de generarInformeCierre.

// Escapa entidades HTML para inyectar texto del usuario sin romper el parseo.
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatearFechaLarga(fecha: string | null | undefined): string {
  if (!fecha) return 'No registrada';
  const d = new Date(fecha + 'T00:00:00');
  const meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                 'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  return `${d.getDate()} de ${meses[d.getMonth()]}, ${d.getFullYear()}`;
}

function formatearFechaCorta(fecha: string | null | undefined): string {
  if (!fecha) return '--/--/----';
  const d = new Date(fecha + 'T00:00:00');
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
}

// Renderiza el grid de fotos para una sección de filmografía.
// - 2 columnas, gap 16px.
// - Cada celda con `.no-break` (la foto + caption + descripción no se corta).
// - Imagen con aspect-ratio 4/3, object-fit cover (encaja sin ser cortada).
// - Si hay más de 4 fotos: se parte en grupos de 4 y entre ellos se inserta
//   un <div> separador con break-after:page (fuerza nueva página en print).
function generarGridFotos(
  fotos: { file_url: string; descripcion?: string | null; descripcion_observacion?: string | null }[],
): string {
  const gridStyle = 'display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px;';

  if (fotos.length === 0) {
    return `<div style="${gridStyle}">
      <div class="no-break" style="grid-column: span 2; aspect-ratio: 16/9; background: #eee; border: 1px solid #ddd; border-radius: 8px; display: flex; align-items: center; justify-content: center;">
        <span style="color: #888; font-size: 12px;">Sin fotos registradas</span>
      </div>
    </div>`;
  }

  const PHOTOS_PER_PAGE = 4;
  const chunks: { file_url: string; descripcion?: string | null; descripcion_observacion?: string | null }[][] = [];
  for (let i = 0; i < fotos.length; i += PHOTOS_PER_PAGE) {
    chunks.push(fotos.slice(i, i + PHOTOS_PER_PAGE));
  }

  return chunks.map((chunk, chunkIdx) => {
    const start = chunkIdx * PHOTOS_PER_PAGE;
    const itemsHtml = chunk.map((f, j) => {
      const idx = start + j;
      const desc = (f.descripcion ?? '').trim();
      const obs  = (f.descripcion_observacion ?? '').trim();
      const descripcionHtml = desc
        ? escapeHtml(desc)
        : '<span style="color:#bbb">Sin descripción registrada</span>';
      return `<div class="no-break" style="break-inside: avoid; page-break-inside: avoid;">
        <div style="border: 1px solid #ddd; border-radius: 4px; overflow: hidden;">
          <img src="${f.file_url}" alt="Foto ${idx + 1}" loading="lazy" onerror="this.style.display='none'; this.nextElementSibling && (this.nextElementSibling.style.display='flex')" style="width:100%; aspect-ratio:4/3; object-fit:cover; border-radius:4px; display:block;" />
          <div style="display:none; width:100%; aspect-ratio:4/3; background:#f0f0f0; border-radius:4px; align-items:center; justify-content:center; color:#999; font-size:11px;">
            Imagen no disponible
          </div>
        </div>
        <div style="margin-top: 6px; padding: 6px 10px; background: #f8f8f8; border-left: 3px solid #CC7A00; border-radius: 0 4px 4px 0; min-height: 28px;">
          <span style="font-size: 10px; font-weight: 600; color: #888; text-transform: uppercase; letter-spacing: 0.05em; display: block; margin-bottom: 2px;">Descripción técnica</span>
          <span style="font-size: 11px; color: #333; font-style: italic; line-height: 1.4;">${descripcionHtml}</span>
        </div>
        ${obs ? `<div style="margin-top:4px;padding:5px 10px;background:#fff8f0;border-left:3px solid #CC7A00;border-radius:0 4px 4px 0"><span style="font-size:10px;font-weight:600;color:#CC7A00;text-transform:uppercase;display:block;margin-bottom:2px">Observación del Editor</span><span style="font-size:11px;color:#333;font-style:italic">${escapeHtml(obs)}</span></div>` : ''}
      </div>`;
    }).join('\n');

    const isLast = chunkIdx === chunks.length - 1;
    const separator = !isLast
      ? '\n<div style="break-after: page; page-break-after: always;"></div>'
      : '';
    return `<div style="${gridStyle}">
      ${itemsHtml}
    </div>${separator}`;
  }).join('\n');
}

// Configuración visual del badge "ESTADO: X" en el header de los informes.
function _estadoBadgeCfg(estado: string): {
  texto: string; bg: string; text: string; border: string; icon: string;
} {
  switch (estado) {
    case 'Cerrada':
      return { texto: 'CERRADO', bg: '#e7f3eb', text: '#1e4620', border: '#1e4620', icon: 'check_circle' };
    case 'En proceso':
      return { texto: 'EN PROCESO', bg: '#dbeafe', text: '#1e3a8a', border: '#1e3a8a', icon: 'pending_actions' };
    case 'Pendiente':
      return { texto: 'PENDIENTE', bg: '#fef3c7', text: '#92400e', border: '#92400e', icon: 'schedule' };
    case 'No aplica':
      return { texto: 'NO APLICA', bg: '#f1f5f9', text: '#475569', border: '#475569', icon: 'block' };
    default:
      return { texto: estado.toUpperCase(), bg: '#f1f5f9', text: '#475569', border: '#475569', icon: 'info' };
  }
}

// HEAD del documento HTML (DOCTYPE + html + meta + tailwind config + style).
// __TITLE__ se reemplaza con escapeHtml(titulo) al envolver.
const _HEAD_INFORME = `<!DOCTYPE html>
<html class="light" lang="es">
<head>
<meta charset="utf-8"/>
<meta content="width=device-width, initial-scale=1.0" name="viewport"/>
<title>__TITLE__</title>
<script src="https://cdn.tailwindcss.com?plugins=forms,container-queries"></script>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Sora:wght@400;600;700&display=swap" rel="stylesheet"/>
<link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap" rel="stylesheet"/>
<script id="tailwind-config">
tailwind.config = {
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        "primary": "#003366","on-primary": "#ffffff","secondary": "#416181",
        "on-secondary": "#ffffff","background": "#f9f9fe","on-background": "#1a1c1f",
        "surface": "#f9f9fe","on-surface": "#1a1c1f","surface-variant": "#e2e2e7",
        "on-surface-variant": "#43474f","outline": "#737780","outline-variant": "#c3c6d1",
        "primary-container": "#003366","on-primary-container": "#799dd6",
        "surface-container-low": "#f4f3f8","surface-container": "#eeedf2",
        "surface-container-high": "#e8e8ed","surface-container-highest": "#e2e2e7",
        "surface-container-lowest": "#ffffff"
      },
      borderRadius: { "DEFAULT":"0.125rem","lg":"0.25rem","xl":"0.5rem","full":"0.75rem" },
      fontFamily: {
        "body-md": ["Inter","sans-serif"],"mono-technical": ["Inter","monospace"],
        "section-header": ["Sora","sans-serif"],"body-sm": ["Inter","sans-serif"],
        "headline-lg": ["Sora","sans-serif"],"headline-xl": ["Sora","sans-serif"],
        "label-bold": ["Inter","sans-serif"]
      },
      fontSize: {
        "body-md": ["14px",{"lineHeight":"22px","fontWeight":"400"}],
        "mono-technical": ["11px",{"lineHeight":"14px","letterSpacing":"0.02em","fontWeight":"500"}],
        "section-header": ["14px",{"lineHeight":"20px","letterSpacing":"0.05em","fontWeight":"700"}],
        "body-sm": ["12px",{"lineHeight":"18px","fontWeight":"400"}],
        "headline-lg": ["20px",{"lineHeight":"28px","fontWeight":"600"}],
        "headline-xl": ["24px",{"lineHeight":"32px","letterSpacing":"-0.02em","fontWeight":"700"}],
        "label-bold": ["12px",{"lineHeight":"16px","fontWeight":"600"}]
      }
    }
  }
}
</script>
<style>
  .material-symbols-outlined {
    font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24;
  }
  @media screen {
    body { background-color: #f0f2f5; padding: 40px 0; }
    .a4-page {
      background: white;
      box-shadow: 0 0 20px rgba(0,0,0,0.08);
      margin: 0 auto 40px auto;
    }
  }
  .a4-page {
    width: 210mm;
    min-height: 297mm;
    padding: 18mm 20mm 18mm 20mm;
    position: relative;
    display: flex;
    flex-direction: column;
    box-sizing: border-box;
    overflow: visible;
  }
  section, header, footer, .grid, .flex {
    break-inside: avoid;
    page-break-inside: avoid;
  }
  .page-footer {
    margin-top: auto;
    break-inside: avoid;
    page-break-inside: avoid;
  }
  .page-break {
    break-after: page;
    page-break-after: always;
  }
  @media print {
    body { background: none; padding: 0; margin: 0; counter-reset: pagina; }
    .a4-page {
      box-shadow: none; margin: 0; width: 100%; min-height: 0;
      padding: 8mm 16mm 28mm 16mm; overflow: visible;
      counter-increment: pagina;
    }
    .footer-pagina::after { content: "Página " counter(pagina); }
    @page { size: A4 portrait; margin: 20mm 15mm 25mm 15mm; }
    .page-footer {
      position: fixed; bottom: 0; left: 16mm; right: 16mm;
      background: white; padding-top: 4px;
    }
    img { break-inside: avoid; page-break-inside: avoid; max-width: 100%; }
    .aspect-\\[4\\/3\\], .aspect-\\[16\\/9\\], .aspect-video {
      break-inside: avoid; page-break-inside: avoid;
    }
    h1, h2, h3 { break-after: avoid; page-break-after: avoid; }
    .no-break { break-inside: avoid; page-break-inside: avoid; }
    .no-print { display: none !important; }
  }
</style>
</head>`;

// Footer fijo común (barra naranja arriba, copyright/disclaimer, page counter).
const _FOOTER_INFORME = `<footer class="page-footer">
  <div class="w-full h-1.5 bg-[#CC7A00] mb-4"></div>
  <div class="flex justify-between items-start mb-3">
    <div class="flex flex-col gap-0.5">
      <span class="font-bold text-[10px] text-primary">© __YEAR__ Benitez Bittar Constructora S.A. | Facility Services Division</span>
      <span class="text-[9px] text-[#CC7A00] uppercase tracking-widest font-bold">Elaborado por Guaraní 3D de Grupo Díaz Villaverde</span>
    </div>
  </div>
  <div class="flex justify-between items-center">
    <span class="text-[10px] text-on-surface-variant/80 italic">Este documento es confidencial y para uso exclusivo del destinatario y entidades autorizadas.</span>
    <span class="footer-pagina" style="font-size:9px; color:#fff; opacity:0.7;"></span>
  </div>
</footer>`;

// Logo de BBC (emisor del informe), usado en el header de cada informe.
//
// El logo del cliente se retiró en B1: estaba hardcodeado y salía en los informes de
// TODOS los proyectos, atribuyendo mal el cliente (reproducido en campo con Kalo/OT-009).
// Solución definitiva (roadmap, no B1): cargar un logo al CREAR el proyecto, junto a
// nombre/cliente/plano, y leerlo desde el proyecto acá. Requiere columna en `proyectos`
// — no existe hoy: la interfaz Proyecto (proyectosStore.ts:6-18) no tiene logo_url.
// NO agregar UI de logo a ModalInformeOT: el dato debe venir del proyecto.
const _LOGOS_HTML_INFORME = `<div class="flex items-center gap-4">
  <div class="flex items-center gap-3 flex-shrink-0">
    <img alt="BBC Constructora Logo" class="h-10 w-auto object-contain max-w-[120px]"
      src="https://lh3.googleusercontent.com/aida-public/AB6AXuAZllvvhAPx9rtylzcyTEmxbZTrzv3wTxLXEuqT6hVfNKy4hOmUGXk2BxjKAKwmOO931f6sKQztPbubOSybhYusjtZEXiaa0Ggq9j70wSvZgy9HGL_8uqWfTveeotdC4TG8SExGrwqZTPWp5XRASM3dMUlb1Go4UbuZqySEN7SM0K8TG5gDtayNQPVlxGqRmDcYwu9oCXYM9ysIZWYO15_9r2RveasOdSFWzL9R_IYWpamGjGRXgSqpo4rjNdWVLcSlXKqCbWaqnoI4"/>
  </div>
</div>`;

// Encabezado de página 1: logos + badge estado + ID + título h1 + subtítulo.
function _paginaHeader(orden: OrdenLocal, titulo: string, subtitulo: string): string {
  const badge = _estadoBadgeCfg(orden.estado);
  const otLabel = orden.ot ?? 'Sin código';
  return `<header class="flex justify-between items-start mb-10 border-b border-outline-variant pb-6">
    ${_LOGOS_HTML_INFORME}
    <div class="text-right">
      <div class="px-4 py-1.5 rounded-full font-label-bold text-xs flex items-center gap-1.5 inline-flex mb-2" style="background:${badge.bg}; color:${badge.text}; border:1px solid ${badge.border}33;">
        <span class="material-symbols-outlined text-[16px]" style="font-variation-settings:'FILL' 1;">${badge.icon}</span>
        ESTADO: ${badge.texto}
      </div>
      <div class="text-body-sm font-mono-technical text-on-surface-variant">ID DE ORDEN: ${escapeHtml(otLabel)}</div>
    </div>
  </header>
  <div class="mb-8">
    <h1 class="font-headline-xl text-headline-xl text-primary border-l-[6px] border-primary pl-5 mb-3">${escapeHtml(titulo)}</h1>
    <p class="text-on-surface-variant text-body-md max-w-3xl leading-relaxed">${escapeHtml(subtitulo)}</p>
  </div>`;
}

// Wrap del contenido en el documento HTML completo.
function _envolverInforme(titulo: string, contenido: string): string {
  return `${_HEAD_INFORME.replace('__TITLE__', escapeHtml(titulo))}
<body class="bg-surface font-body-md text-on-surface min-h-screen">
${contenido}
${_FOOTER_INFORME.replace('__YEAR__', String(new Date().getFullYear()))}
</body></html>`;
}

// Bloque "Datos del Cliente" (Obra / Unidad / Responsable).
function _bloqueDatosCliente(orden: OrdenLocal): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const proyectoNombre = (orden as any).proyecto_nombre ?? '';
  return `<section class="grid grid-cols-3 gap-6 bg-surface-container-lowest p-6 rounded-xl border border-outline-variant mb-6 shadow-sm no-break">
    <div class="col-span-3 border-b border-outline-variant/30 pb-2 mb-2">
      <h3 class="font-section-header text-[10px] text-primary uppercase tracking-widest">Datos del Cliente</h3>
    </div>
    <div class="flex flex-col gap-1">
      <span class="text-[10px] font-bold text-outline uppercase tracking-wider">Obra</span>
      <span class="text-body-md text-on-surface">${escapeHtml(proyectoNombre || 'No especificado')}</span>
    </div>
    <div class="flex flex-col gap-1">
      <span class="text-[10px] font-bold text-outline uppercase tracking-wider">Unidad o Sector</span>
      <span class="text-body-md text-on-surface">${escapeHtml(orden.ubicacion || 'No especificado')}</span>
    </div>
    <div class="flex flex-col gap-1">
      <span class="text-[10px] font-bold text-outline uppercase tracking-wider">Responsable</span>
      <span class="text-body-md text-on-surface">${escapeHtml(orden.responsable || 'No asignado')}</span>
    </div>
  </section>`;
}

// Bloque "Datos de la OT" (Rubro / Fechas / Reincidente / Prioridad).
function _bloqueDatosOT(orden: OrdenLocal): string {
  const fechaInicio = orden.fecha_inicio_trabajos ?? null;
  const fechaCierre = orden.fecha_fin_trabajos ?? null;
  const reincidente = orden.reincidencia ? 'SÍ' : 'NO';
  return `<section class="grid grid-cols-3 gap-6 bg-surface-container-low p-6 rounded-xl border border-outline-variant mb-8 no-break">
    <div class="flex flex-col gap-1.5">
      <span class="text-[10px] font-bold text-outline uppercase tracking-wider">Rubro del Proyecto</span>
      <span class="text-body-md font-bold text-primary">${escapeHtml(orden.rubro || 'No especificado')}</span>
    </div>
    <div class="flex flex-col gap-1.5">
      <span class="text-[10px] font-bold text-outline uppercase tracking-wider">Fecha de Inicio</span>
      <span class="text-body-md text-on-surface">${formatearFechaLarga(fechaInicio)}</span>
    </div>
    <div class="flex flex-col gap-1.5">
      <span class="text-[10px] font-bold text-outline uppercase tracking-wider">Fecha de Cierre</span>
      <span class="text-body-md text-on-surface">${formatearFechaLarga(fechaCierre)}</span>
    </div>
    <div class="col-span-3 flex gap-4 mt-2 pt-4 border-t border-outline-variant/40">
      <div class="bg-surface-container-highest text-on-surface-variant px-3 py-1 rounded-md font-label-bold text-[10px] uppercase border border-outline-variant/50">Reincidente: ${reincidente}</div>
      <div class="bg-primary-container/10 text-primary px-3 py-1 rounded-md font-label-bold text-[10px] uppercase border border-primary/20">Prioridad: ${escapeHtml(orden.prioridad ?? 'Media')}</div>
    </div>
  </section>`;
}

// Sección de bloque con borde naranja izquierdo (Antecedentes / Diagnóstico /
// Estado Actual / Garantía / Declaración / Descripción de Trabajo).
function _bloqueNaranjaIzquierdo(titulo: string, contenido: string, vacioPlaceholder: string): string {
  const tieneContenido = contenido.trim().length > 0;
  const textoFinal = tieneContenido ? contenido : vacioPlaceholder;
  return `<section class="mb-8 no-break" style="border-left: 4px solid #CC7A00; background: #fffbf5; padding: 16px 20px; border-radius: 0 8px 8px 0;">
    <h3 class="font-section-header text-xs text-primary uppercase tracking-widest mb-3">${escapeHtml(titulo)}</h3>
    <p id="bloque-texto-naranja" class="text-body-md leading-relaxed text-justify" style="color: ${tieneContenido ? '#1a1c1f' : '#888'}; ${tieneContenido ? '' : 'font-style: italic;'}">${escapeHtml(textoFinal)}</p>
  </section>`;
}

// n líneas horizontales punteadas para completar a mano.
function _lineasPunteadas(n: number): string {
  return Array.from({ length: n }, () =>
    '<div style="border-bottom:1px dashed #ccc; margin:8px 0; height:20px;"></div>'
  ).join('\n');
}

// Bloque de firmas — 2 o 3 firmantes (línea horizontal + rol debajo).
function _bloqueFirmas(roles: string[]): string {
  const gridCols = roles.length === 3 ? 'grid-cols-3' : 'grid-cols-2';
  return `<section class="grid ${gridCols} gap-12 px-6 mb-12 items-end no-break">
    ${roles.map(rol => `<div class="flex flex-col items-center">
      <div class="w-full border-b border-dashed border-outline-variant pt-14"></div>
      <span class="font-bold text-[11px] text-primary mt-3 uppercase tracking-widest text-center">${escapeHtml(rol)}</span>
    </div>`).join('')}
  </section>`;
}

// ───────────────────────────────────────── Informe de Cierre (preview) ──
//
// Template A4 de dos páginas (estado inicial / trabajo concluido + firma).
// Usa Tailwind por CDN + fuentes Inter/Sora + Material Symbols. Pensado para
// renderizarse dentro de un iframe srcdoc en ModalInformeOT y para impresión
// via window.print en una nueva ventana.

export function generarInformeCierre(
  orden: OrdenLocal & { proyecto_nombre?: string },
  proyectoNombre: string,
  observaciones: string,
  fotosAntes: { file_url: string; descripcion?: string | null; descripcion_observacion?: string | null }[],
  fotosDespues: { file_url: string; descripcion?: string | null; descripcion_observacion?: string | null }[]
): string {

  const reincidenteTexto = orden.reincidencia ? 'SÍ' : 'NO';
  const otLabel = orden.ot ?? 'Sin código';

  // Campos de fecha — buscar en campos si no está en columna directa
  const fechaInicio = (orden as any).fecha_inicio_trabajos
    ?? (orden.campos as any)?.fecha_inicio_trabajos ?? null;
  const fechaCierre = (orden as any).fecha_cierre
    ?? (orden.campos as any)?.fecha_cierre ?? null;

  return `<!DOCTYPE html>
<html class="light" lang="es">
<head>
<meta charset="utf-8"/>
<meta content="width=device-width, initial-scale=1.0" name="viewport"/>
<title>Informe de Cierre de OT - BBC Constructora</title>
<script src="https://cdn.tailwindcss.com?plugins=forms,container-queries"></script>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Sora:wght@400;600;700&display=swap" rel="stylesheet"/>
<link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap" rel="stylesheet"/>
<script id="tailwind-config">
tailwind.config = {
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        "primary": "#003366","on-primary": "#ffffff","secondary": "#416181",
        "on-secondary": "#ffffff","background": "#f9f9fe","on-background": "#1a1c1f",
        "surface": "#f9f9fe","on-surface": "#1a1c1f","surface-variant": "#e2e2e7",
        "on-surface-variant": "#43474f","outline": "#737780","outline-variant": "#c3c6d1",
        "primary-container": "#003366","on-primary-container": "#799dd6",
        "surface-container-low": "#f4f3f8","surface-container": "#eeedf2",
        "surface-container-high": "#e8e8ed","surface-container-highest": "#e2e2e7",
        "surface-container-lowest": "#ffffff"
      },
      borderRadius: { "DEFAULT":"0.125rem","lg":"0.25rem","xl":"0.5rem","full":"0.75rem" },
      fontFamily: {
        "body-md": ["Inter","sans-serif"],"mono-technical": ["Inter","monospace"],
        "section-header": ["Sora","sans-serif"],"body-sm": ["Inter","sans-serif"],
        "headline-lg": ["Sora","sans-serif"],"headline-xl": ["Sora","sans-serif"],
        "label-bold": ["Inter","sans-serif"]
      },
      fontSize: {
        "body-md": ["14px",{"lineHeight":"22px","fontWeight":"400"}],
        "mono-technical": ["11px",{"lineHeight":"14px","letterSpacing":"0.02em","fontWeight":"500"}],
        "section-header": ["14px",{"lineHeight":"20px","letterSpacing":"0.05em","fontWeight":"700"}],
        "body-sm": ["12px",{"lineHeight":"18px","fontWeight":"400"}],
        "headline-lg": ["20px",{"lineHeight":"28px","fontWeight":"600"}],
        "headline-xl": ["24px",{"lineHeight":"32px","letterSpacing":"-0.02em","fontWeight":"700"}],
        "label-bold": ["12px",{"lineHeight":"16px","fontWeight":"600"}]
      }
    }
  }
}
</script>
<style>
  .material-symbols-outlined {
    font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24;
  }

  /* Vista en pantalla */
  @media screen {
    body { background-color: #f0f2f5; padding: 40px 0; }
    .a4-page {
      background: white;
      box-shadow: 0 0 20px rgba(0,0,0,0.08);
      margin: 0 auto 40px auto;
    }
  }

  /* Estructura de página */
  .a4-page {
    width: 210mm;
    min-height: 297mm;
    padding: 18mm 20mm 18mm 20mm;
    position: relative;
    display: flex;
    flex-direction: column;
    box-sizing: border-box;
    overflow: visible;   /* era hidden — causaba los cortes */
  }

  /* Evitar cortes dentro de secciones */
  section, header, footer, .grid, .flex {
    break-inside: avoid;
    page-break-inside: avoid;
  }

  /* Footer siempre al fondo de su página */
  .page-footer {
    margin-top: auto;
    break-inside: avoid;
    page-break-inside: avoid;
  }

  /* Forzar salto de página entre páginas del documento */
  .page-break {
    break-after: page;
    page-break-after: always;
  }

  @media print {
    body {
      background: none;
      padding: 0;
      margin: 0;
      counter-reset: pagina;
    }

    .a4-page {
      box-shadow: none;
      margin: 0;
      width: 100%;
      min-height: 0;
      padding: 8mm 16mm 28mm 16mm;
      overflow: visible;
      counter-increment: pagina;
    }

    .footer-pagina::after { content: "Página " counter(pagina); }

    @page {
      size: A4 portrait;
      margin: 20mm 15mm 25mm 15mm;
    }

    /* Footer fijo en todas las páginas */
    .page-footer {
      position: fixed;
      bottom: 0;
      left: 16mm;
      right: 16mm;
      background: white;
      padding-top: 4px;
    }

    /* Imágenes individuales nunca se cortan */
    img {
      break-inside: avoid;
      page-break-inside: avoid;
      max-width: 100%;
    }

    /* Cada foto con su caption no se corta */
    .aspect-\\[4\\/3\\],
    .aspect-\\[16\\/9\\],
    .aspect-video {
      break-inside: avoid;
      page-break-inside: avoid;
    }

    /* Encabezados de sección pegados a su primer línea de contenido */
    h1, h2, h3 {
      break-after: avoid;
      page-break-after: avoid;
    }

    /* Bloques compactos que NO deben cortarse nunca */
    /* (metadata grids, banner final, firmas, conformidad) */
    .no-break {
      break-inside: avoid;
      page-break-inside: avoid;
    }

    .no-print { display: none !important; }
  }
</style>
</head>
<body class="bg-surface font-body-md text-on-surface min-h-screen">
<div class="a4-page">
<header class="flex justify-between items-start mb-10 border-b border-outline-variant pb-6">
  <div class="flex items-center gap-4">
    <div class="flex items-center gap-3 flex-shrink-0">
      <img alt="BBC Constructora Logo" class="h-10 w-auto object-contain max-w-[120px]"
        src="https://lh3.googleusercontent.com/aida-public/AB6AXuAZllvvhAPx9rtylzcyTEmxbZTrzv3wTxLXEuqT6hVfNKy4hOmUGXk2BxjKAKwmOO931f6sKQztPbubOSybhYusjtZEXiaa0Ggq9j70wSvZgy9HGL_8uqWfTveeotdC4TG8SExGrwqZTPWp5XRASM3dMUlb1Go4UbuZqySEN7SM0K8TG5gDtayNQPVlxGqRmDcYwu9oCXYM9ysIZWYO15_9r2RveasOdSFWzL9R_IYWpamGjGRXgSqpo4rjNdWVLcSlXKqCbWaqnoI4"/>
    </div>
  </div>
  <div class="text-right">
    <div class="bg-[#e7f3eb] text-[#1e4620] px-4 py-1.5 rounded-full font-label-bold text-xs flex items-center gap-1.5 border border-[#1e4620]/10 inline-flex mb-2">
      <span class="material-symbols-outlined text-[16px]" style="font-variation-settings:'FILL' 1;">check_circle</span>
      ESTADO: CERRADO
    </div>
    <div class="text-body-sm font-mono-technical text-on-surface-variant">ID DE ORDEN: ${otLabel}</div>
  </div>
</header>
<div class="mb-8">
  <h1 class="font-headline-xl text-headline-xl text-primary border-l-[6px] border-primary pl-5 mb-3">INFORME DE CIERRE DE OT</h1>
  <p class="text-on-surface-variant text-body-md max-w-3xl leading-relaxed">
    Certificación formal de finalización técnica de tareas programadas, cumplimiento de estándares de calidad, limpieza y seguridad de las instalaciones intervenidas.
  </p>
</div>
<section class="grid grid-cols-3 gap-6 bg-surface-container-lowest p-6 rounded-xl border border-outline-variant mb-6 shadow-sm no-break">
  <div class="col-span-3 border-b border-outline-variant/30 pb-2 mb-2">
    <h3 class="font-section-header text-[10px] text-primary uppercase tracking-widest">Datos del Cliente</h3>
  </div>
  <div class="flex flex-col gap-1"><span class="text-[10px] font-bold text-outline uppercase tracking-wider">Obra</span>
    <span class="text-body-md text-on-surface">${proyectoNombre}</span></div>
  <div class="flex flex-col gap-1"><span class="text-[10px] font-bold text-outline uppercase tracking-wider">Unidad o Sector</span>
    <span class="text-body-md text-on-surface">${orden.ubicacion || 'No especificado'}</span></div>
  <div class="flex flex-col gap-1"><span class="text-[10px] font-bold text-outline uppercase tracking-wider">Nombre y Apellido</span>
    <span class="text-body-md text-on-surface">${orden.responsable || 'No asignado'}</span></div>
</section>
<section class="grid grid-cols-3 gap-6 bg-surface-container-low p-6 rounded-xl border border-outline-variant mb-8 no-break">
  <div class="flex flex-col gap-1.5">
    <span class="text-[10px] font-bold text-outline uppercase tracking-wider">Rubro del Proyecto</span>
    <span class="text-body-md font-bold text-primary">${orden.rubro || 'No especificado'}</span>
  </div>
  <div class="flex flex-col gap-1.5">
    <span class="text-[10px] font-bold text-outline uppercase tracking-wider">Fecha de Inicio</span>
    <span class="text-body-md text-on-surface">${formatearFechaLarga(fechaInicio)}</span>
  </div>
  <div class="flex flex-col gap-1.5">
    <span class="text-[10px] font-bold text-outline uppercase tracking-wider">Fecha de Cierre</span>
    <span class="text-body-md text-on-surface">${formatearFechaLarga(fechaCierre)}</span>
  </div>
  <div class="col-span-3 flex gap-4 mt-2 pt-4 border-t border-outline-variant/40">
    <div class="bg-surface-container-highest text-on-surface-variant px-3 py-1 rounded-md font-label-bold text-[10px] uppercase border border-outline-variant/50">Reincidente: ${reincidenteTexto}</div>
    <div class="bg-primary-container/10 text-primary px-3 py-1 rounded-md font-label-bold text-[10px] uppercase border border-primary/20">Aplica Garantía: SÍ</div>
  </div>
</section>
<section class="bg-surface-container-lowest border border-outline-variant p-6 rounded-xl shadow-sm mb-10 no-break">
  <div class="flex items-center gap-2.5 mb-3 border-b border-outline-variant pb-2">
    <span class="material-symbols-outlined text-secondary text-xl">description</span>
    <h3 class="font-section-header text-xs text-primary uppercase tracking-widest">Antecedentes y Diagnóstico</h3>
  </div>
  <p id="antecedentes-texto" class="text-body-md text-on-surface-variant text-justify leading-relaxed">
    ${observaciones || 'Sin observaciones registradas.'}
  </p>
</section>
<div style="break-before: page; page-break-before: always;">
  <div class="flex items-center gap-2.5 mb-5 border-b border-outline-variant pb-2">
    <span class="material-symbols-outlined text-secondary">history</span>
    <h3 class="font-section-header text-section-header text-primary uppercase tracking-widest">Filmografía: ESTADO INICIAL (ANTES)</h3>
  </div>
  ${generarGridFotos(fotosAntes)}
  <div class="flex items-center gap-2.5 mb-5 border-b border-outline-variant pb-2" style="margin-top: 20px;">
    <span class="material-symbols-outlined text-secondary" style="font-variation-settings:'FILL' 1;">task_alt</span>
    <h3 class="font-section-header text-section-header text-primary uppercase tracking-widest">Filmografía: TRABAJO CONCLUIDO (DESPUÉS)</h3>
  </div>
  ${generarGridFotos(fotosDespues)}
</div>
</div>
<div class="page-break"></div>
<div class="a4-page">
<div class="grid grid-cols-2 gap-8 mb-10 no-break">
  <section class="bg-surface-container-low p-5 rounded-xl border border-outline-variant/30">
    <div class="flex items-center gap-2.5 mb-3">
      <span class="material-symbols-outlined text-primary text-xl">mop</span>
      <h3 class="font-section-header text-xs text-primary uppercase tracking-wider">Limpieza Realizada</h3>
    </div>
    <p class="text-[12px] text-on-surface-variant leading-relaxed text-justify">
      BBC Constructora garantiza la entrega del sector en condiciones de <strong>limpieza técnica</strong> tras la obra. El retiro de residuos industriales ha sido completado.
    </p>
  </section>
  <section class="border border-outline-variant p-5 rounded-xl flex flex-col justify-between">
    <div>
      <div class="flex items-center gap-2.5 mb-2">
        <span class="material-symbols-outlined text-secondary text-xl">verified_user</span>
        <h3 class="font-section-header text-xs text-primary uppercase tracking-wider">Conformidad Técnica</h3>
      </div>
      <p class="text-[11px] text-on-surface-variant italic leading-normal">
        "Se certifica formalmente que durante la intervención técnica no se han detectado ni provocado daños colaterales en activos preexistentes del cliente."
      </p>
    </div>
    <div class="mt-4 flex items-center gap-2 text-primary">
      <span class="material-symbols-outlined text-[18px]">check_circle</span>
      <span class="font-bold text-[11px] uppercase tracking-tighter">Validado sin observaciones</span>
    </div>
  </section>
</div>
<section class="bg-primary text-white p-6 rounded-xl flex justify-between items-center mb-16 shadow-md border border-white/10 no-break">
  <div class="flex flex-col gap-1">
    <span class="font-section-header text-[10px] text-on-primary-container uppercase tracking-[0.25em] opacity-80">Resultado de Auditoría Final</span>
    <h2 class="font-headline-xl text-2xl tracking-tight">PROYECTO FINALIZADO</h2>
    <p class="text-surface-variant/80 text-[11px]">Métricas de calidad y seguridad satisfactorias bajo norma ISO-9001.</p>
  </div>
  <div class="bg-[#2e7d32] border border-white/30 px-8 py-3 rounded-lg text-center shadow-inner">
    <span class="block text-[10px] font-bold uppercase opacity-70 mb-0.5 tracking-widest">Estado</span>
    <span class="text-xl font-bold text-white tracking-tight">CERRADO</span>
  </div>
</section>
<section class="grid grid-cols-2 gap-20 px-6 mb-12 items-end no-break">
  <div class="flex flex-col items-center">
    <div class="w-full border-b border-dashed border-outline-variant pt-14"></div>
    <span class="font-bold text-[11px] text-primary mt-3 uppercase tracking-widest text-center">REPRESENTANTE FACILITY SERVICES BBC S.A.</span>
  </div>
  <div class="flex flex-col items-center">
    <div class="w-full border-b border-dashed border-outline-variant pt-14 flex justify-center items-end pb-1.5">
      <span class="text-on-surface-variant/40 font-mono-technical text-[10px]">FECHA: ${formatearFechaCorta(fechaCierre)}</span>
    </div>
    <span class="font-bold text-[11px] text-primary mt-3 uppercase tracking-widest text-center">FIRMA CLIENTE</span>
    <span class="text-[10px] text-on-surface-variant font-medium">Validación de Recepción Conforme</span>
  </div>
</section>
</div>
<footer class="page-footer">
  <div class="w-full h-1.5 bg-[#CC7A00] mb-4"></div>
  <div class="flex justify-between items-start mb-3">
    <div class="flex flex-col gap-0.5">
      <span class="font-bold text-[10px] text-primary">© ${new Date().getFullYear()} Benitez Bittar Constructora S.A. | Facility Services Division</span>
      <span class="text-[9px] text-[#CC7A00] uppercase tracking-widest font-bold">Elaborado por Guaraní 3D de Grupo Díaz Villaverde</span>
    </div>
  </div>
  <div class="flex justify-between items-center">
    <span class="text-[10px] text-on-surface-variant/80 italic">Este documento es confidencial y para uso exclusivo del destinatario y entidades autorizadas.</span>
    <span class="footer-pagina" style="font-size:9px; color:#fff; opacity:0.7;"></span>
  </div>
</footer>
</body></html>`;
}

// ─────────────────────────────────────────── Informe Ficha de Visita ──
//
// Página única: datos OT + descripción del trabajo + checklist pre-trabajo
// (8 ítems con 3 checkboxes vacíos por ítem para marcar a mano) +
// próximos pasos (líneas en blanco) + firmas (2 firmantes).

export function generarInformeFichaVisita(
  orden: OrdenLocal,
  descripcionTrabajo: string,
): string {
  const itemsChecklist = [
    'Acceso al área liberado',
    'EPP completo del técnico',
    'Herramientas verificadas',
    'Planos / esquemas disponibles',
    'Coordinación con cliente realizada',
    'Sectores afectados notificados',
    'Materiales en sitio',
    'Energías peligrosas neutralizadas',
  ];

  const checklistRows = itemsChecklist.map(item => `<tr>
    <td style="padding: 8px 10px; border: 1px solid #ddd; font-size: 11px; color: #1a1c1f;">${escapeHtml(item)}</td>
    <td style="padding: 8px 10px; border: 1px solid #ddd; font-size: 11px;">
      <div style="display:flex; gap:8px; align-items:center; justify-content:center;">
        <label style="display:flex; align-items:center; gap:3px; font-size:10px; color:#444;">
          <span style="display:inline-block; width:12px; height:12px; border:1.5px solid #666; border-radius:2px;"></span> Conforme
        </label>
        <label style="display:flex; align-items:center; gap:3px; font-size:10px; color:#444;">
          <span style="display:inline-block; width:12px; height:12px; border:1.5px solid #666; border-radius:2px;"></span> No conforme
        </label>
        <label style="display:flex; align-items:center; gap:3px; font-size:10px; color:#444;">
          <span style="display:inline-block; width:12px; height:12px; border:1.5px solid #666; border-radius:2px;"></span> N/A
        </label>
      </div>
    </td>
    <td style="padding: 8px 10px; border: 1px solid #ddd; font-size: 11px; color: #888;"></td>
  </tr>`).join('');

  const contenido = `<div class="a4-page">
${_paginaHeader(orden, 'FICHA DE VISITA TÉCNICA', 'Registro inicial de la orden de trabajo: condiciones del área, compromisos asumidos y verificación previa al inicio de los trabajos.')}
${_bloqueDatosCliente(orden)}
${_bloqueDatosOT(orden)}
${_bloqueNaranjaIzquierdo('Descripción del Trabajo', descripcionTrabajo, 'No se ha registrado descripción del trabajo a realizar.')}
<section class="mb-8 no-break">
  <div class="flex items-center gap-2.5 mb-3 border-b border-outline-variant pb-2">
    <span class="material-symbols-outlined text-secondary text-xl">checklist</span>
    <h3 class="font-section-header text-xs text-primary uppercase tracking-widest">Checklist de Verificación Pre-Trabajo</h3>
  </div>
  <table style="width: 100%; border-collapse: collapse; margin-top: 8px;">
    <thead>
      <tr style="background: #f1f5f9;">
        <th style="padding: 8px 10px; border: 1px solid #ddd; font-size: 10px; text-align: left; color: #475569; text-transform: uppercase; letter-spacing: 0.05em;">Ítem</th>
        <th style="padding: 8px 10px; border: 1px solid #ddd; font-size: 10px; text-align: center; color: #475569; text-transform: uppercase; letter-spacing: 0.05em; width: 22%;">Condición</th>
        <th style="padding: 8px 10px; border: 1px solid #ddd; font-size: 10px; text-align: left; color: #475569; text-transform: uppercase; letter-spacing: 0.05em; width: 38%;">Observación</th>
      </tr>
    </thead>
    <tbody>${checklistRows}</tbody>
  </table>
</section>
<section class="mb-8 no-break">
  <div class="flex items-center gap-2.5 mb-3 border-b border-outline-variant pb-2">
    <span class="material-symbols-outlined text-secondary text-xl">flag</span>
    <h3 class="font-section-header text-xs text-primary uppercase tracking-widest">Próximos Pasos y Compromisos</h3>
  </div>
  ${_lineasPunteadas(4)}
</section>
${_bloqueFirmas(['Responsable Plan-OTs', 'Representante BBC'])}
</div>`;

  return _envolverInforme('Ficha de Visita Técnica — BBC Constructora', contenido);
}

// ─────────────────────────────────────────── Informe de Relevamiento ──
//
// Página 1: datos OT + diagnóstico inicial + alcance detectado (3 bloques con
// líneas en blanco) + firmas.
// Página 2: filmografía ANTES (vía generarGridFotos).

export function generarInformeRelevamiento(
  orden: OrdenLocal,
  comentarioInicial: string,
  fotosAntes: { file_url: string; descripcion?: string | null; descripcion_observacion?: string | null }[],
): string {
  const bloquesAlcance = ['Trabajos requeridos', 'Materiales estimados', 'Tiempo estimado'].map(titulo => `<div style="background: #fffbf5; border-top: 3px solid #CC7A00; padding: 12px; border-radius: 4px;">
    <h4 style="font-size: 11px; font-weight: 700; color: #CC7A00; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px;">${escapeHtml(titulo)}</h4>
    ${_lineasPunteadas(4)}
  </div>`).join('');

  const contenido = `<div class="a4-page">
${_paginaHeader(orden, 'INFORME DE RELEVAMIENTO', 'Diagnóstico técnico inicial y detección del alcance de la intervención requerida.')}
${_bloqueDatosCliente(orden)}
${_bloqueDatosOT(orden)}
${_bloqueNaranjaIzquierdo('Diagnóstico Inicial', comentarioInicial, 'Sin diagnóstico registrado.')}
<section class="grid grid-cols-3 gap-4 mb-8 no-break">
  ${bloquesAlcance}
</section>
${_bloqueFirmas(['Responsable Plan-OTs', 'Representante BBC'])}
</div>
<div class="page-break"></div>
<div class="a4-page">
<div style="break-before: page; page-break-before: always;">
  <div class="flex items-center gap-2.5 mb-5 border-b border-outline-variant pb-2">
    <span class="material-symbols-outlined text-secondary">history</span>
    <h3 class="font-section-header text-section-header text-primary uppercase tracking-widest">Filmografía: Estado Inicial (Antes)</h3>
  </div>
  ${generarGridFotos(fotosAntes)}
</div>
</div>`;

  return _envolverInforme('Informe de Relevamiento — BBC Constructora', contenido);
}

// ───────────────────────────────────────── Informe de Avance de Obra ──
//
// Página 1: datos OT + estado actual + métricas (% completado con barra,
// días en ejecución, estado, prioridad) + observaciones + firmas.
// Página 2: filmografía ANTES + DURANTE juntas (sin break entre ellas).

export function generarInformeAvance(
  orden: OrdenLocal,
  comentarioAvance: string,
  fotosAntes: { file_url: string; descripcion?: string | null; descripcion_observacion?: string | null }[],
  fotosDurante: { file_url: string; descripcion?: string | null; descripcion_observacion?: string | null }[],
): string {
  const porcentaje = Math.max(0, Math.min(100, orden.porcentaje_avance ?? 0));
  const diasEnEjecucion = orden.fecha_inicio_trabajos
    ? Math.floor((Date.now() - new Date(orden.fecha_inicio_trabajos + 'T00:00:00').getTime()) / 86400000)
    : null;
  const badge = _estadoBadgeCfg(orden.estado);

  const contenido = `<div class="a4-page">
${_paginaHeader(orden, 'INFORME DE AVANCE DE OBRA', 'Progreso de ejecución de los trabajos, métricas y estado actual de la obra.')}
${_bloqueDatosCliente(orden)}
${_bloqueDatosOT(orden)}
${_bloqueNaranjaIzquierdo('Estado Actual del Trabajo', comentarioAvance, 'Sin observación de estado registrada.')}
<section class="grid grid-cols-2 gap-4 mb-8 no-break">
  <div style="background: #fffbf5; border: 1px solid #f0e0c0; padding: 14px; border-radius: 8px;">
    <h4 style="font-size: 10px; font-weight: 700; color: #888; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px;">% Completado</h4>
    <div style="font-size: 28px; font-weight: 700; color: #CC7A00; margin-bottom: 6px;">${porcentaje}%</div>
    <div style="width: 100%; height: 8px; background: #f0e0c0; border-radius: 4px; overflow: hidden;">
      <div style="width: ${porcentaje}%; height: 100%; background: #CC7A00;"></div>
    </div>
  </div>
  <div style="background: #fffbf5; border: 1px solid #f0e0c0; padding: 14px; border-radius: 8px;">
    <h4 style="font-size: 10px; font-weight: 700; color: #888; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px;">Días en ejecución</h4>
    <div style="font-size: 28px; font-weight: 700; color: #003366;">${diasEnEjecucion !== null ? `${diasEnEjecucion} día${diasEnEjecucion === 1 ? '' : 's'}` : 'No registrado'}</div>
  </div>
  <div style="background: ${badge.bg}; border: 1px solid ${badge.border}33; padding: 14px; border-radius: 8px;">
    <h4 style="font-size: 10px; font-weight: 700; color: ${badge.text}; opacity: 0.7; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px;">Estado</h4>
    <div style="font-size: 20px; font-weight: 700; color: ${badge.text};">${badge.texto}</div>
  </div>
  <div style="background: #eef2ff; border: 1px solid #c7d2fe; padding: 14px; border-radius: 8px;">
    <h4 style="font-size: 10px; font-weight: 700; color: #4338ca; opacity: 0.7; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px;">Prioridad</h4>
    <div style="font-size: 20px; font-weight: 700; color: #4338ca;">${escapeHtml((orden.prioridad ?? 'Media').toUpperCase())}</div>
  </div>
</section>
<section class="mb-8 no-break">
  <div class="flex items-center gap-2.5 mb-3 border-b border-outline-variant pb-2">
    <span class="material-symbols-outlined text-secondary text-xl">edit_note</span>
    <h3 class="font-section-header text-xs text-primary uppercase tracking-widest">Observaciones de Avance</h3>
  </div>
  ${_lineasPunteadas(4)}
</section>
${_bloqueFirmas(['Responsable Plan-OTs', 'Representante BBC'])}
</div>
<div class="page-break"></div>
<div class="a4-page">
<div style="break-before: page; page-break-before: always;">
  <div class="flex items-center gap-2.5 mb-5 border-b border-outline-variant pb-2">
    <span class="material-symbols-outlined text-secondary">history</span>
    <h3 class="font-section-header text-section-header text-primary uppercase tracking-widest">Filmografía: Estado Inicial (Antes)</h3>
  </div>
  ${generarGridFotos(fotosAntes)}
  <div class="flex items-center gap-2.5 mb-5 border-b border-outline-variant pb-2" style="margin-top: 20px;">
    <span class="material-symbols-outlined text-secondary" style="font-variation-settings:'FILL' 1;">construction</span>
    <h3 class="font-section-header text-section-header text-primary uppercase tracking-widest">Filmografía: Trabajo en Ejecución (Durante)</h3>
  </div>
  ${generarGridFotos(fotosDurante)}
</div>
</div>`;

  return _envolverInforme('Informe de Avance — BBC Constructora', contenido);
}

// ─────────────────────────────────────── Acta de Conformidad Técnica ──
//
// Página única: datos OT + declaración formal + encuesta satisfacción (5
// preguntas, escala 1-5 con la celda 1 rellena en naranja como ejemplo) +
// banner "Trabajos Recibidos Conforme" + garantía + firmas (3 firmantes).

export function generarInformeActaConformidad(orden: OrdenLocal): string {
  const otLabel = orden.ot ?? 'Sin código';
  const preguntas = [
    'Calidad técnica del trabajo realizado',
    'Cumplimiento de plazos acordados',
    'Limpieza y orden del área de trabajo',
    'Comunicación y trato del personal técnico',
    'Nivel de limpieza post-intervención',
  ];

  const encuestaRows = preguntas.map(p => `<tr>
    <td style="padding: 8px 10px; border: 1px solid #ddd; font-size: 11px; color: #1a1c1f; width: 60%;">${escapeHtml(p)}</td>
    ${[1, 2, 3, 4, 5].map(n => `<td style="border:1px solid #ddd; padding:6px 10px; text-align:center; font-size:12px; color:#444; background:#fff;">${n}</td>`).join('')}
  </tr>`).join('');

  const contenido = `<div class="a4-page">
${_paginaHeader(orden, 'ACTA DE CONFORMIDAD TÉCNICA', 'Certificación formal de recepción conforme de los trabajos realizados.')}
${_bloqueDatosCliente(orden)}
${_bloqueDatosOT(orden)}
<section class="mb-8 no-break" style="border-left: 4px solid #CC7A00; background: #fffbf5; padding: 16px 20px; border-radius: 0 8px 8px 0;">
  <h3 class="font-section-header text-xs text-primary uppercase tracking-widest mb-3">Declaración de Conformidad</h3>
  <p class="text-body-md leading-relaxed text-justify" style="color: #1a1c1f;">
    Por medio del presente documento, el representante del cliente declara haber recibido a entera satisfacción los trabajos correspondientes a la Orden de Trabajo <strong>${escapeHtml(otLabel)}</strong>, ejecutados por BBC Constructora S.A. en las instalaciones indicadas, verificando que los mismos cumplen con los estándares técnicos, de limpieza y seguridad establecidos.
  </p>
</section>
<section class="mb-8 no-break">
  <div class="flex items-center gap-2.5 mb-3 border-b border-outline-variant pb-2">
    <span class="material-symbols-outlined text-secondary text-xl">poll</span>
    <h3 class="font-section-header text-xs text-primary uppercase tracking-widest">Encuesta de Satisfacción</h3>
  </div>
  <p class="text-xs text-on-surface-variant mb-3">Calificar de 1 (insuficiente) a 5 (excelente).</p>
  <table style="width: 100%; border-collapse: collapse; margin-top: 8px;">
    <thead>
      <tr style="background: #f1f5f9;">
        <th style="padding: 8px 10px; border: 1px solid #ddd; font-size: 10px; text-align: left; color: #475569; text-transform: uppercase; letter-spacing: 0.05em;">Aspecto evaluado</th>
        ${[1, 2, 3, 4, 5].map(n => `<th style="padding: 8px 10px; border: 1px solid #ddd; font-size: 10px; text-align: center; color: #475569; width: 8%;">${n}</th>`).join('')}
      </tr>
    </thead>
    <tbody>${encuestaRows}</tbody>
  </table>
  <div style="margin-top: 16px;">
    <span style="font-size: 11px; font-weight: 600; color: #475569; text-transform: uppercase; letter-spacing: 0.05em;">Comentarios adicionales:</span>
    ${_lineasPunteadas(3)}
  </div>
</section>
<section class="bg-primary text-white p-6 rounded-xl flex justify-between items-center mb-8 shadow-md border border-white/10 no-break">
  <div class="flex flex-col gap-1">
    <span class="font-section-header text-[10px] text-on-primary-container uppercase tracking-[0.25em] opacity-80">Resultado de Auditoría BBCA</span>
    <h2 class="font-headline-xl text-2xl tracking-tight">TRABAJOS RECIBIDOS CONFORME</h2>
    <p class="text-surface-variant/80 text-[11px]">Verificación de cumplimiento técnico, calidad y seguridad bajo norma ISO-9001.</p>
  </div>
  <div class="bg-[#2e7d32] border border-white/30 px-8 py-3 rounded-lg text-center shadow-inner">
    <span class="block text-[10px] font-bold uppercase opacity-70 mb-0.5 tracking-widest">Estado</span>
    <span class="text-xl font-bold text-white tracking-tight">CONFORME</span>
  </div>
</section>
<div style="break-inside: avoid; page-break-inside: avoid; break-before: avoid; page-break-before: avoid; margin-top: 20px;">
  <section class="mb-8 no-break" style="border-left: 4px solid #CC7A00; background: #fffbf5; padding: 16px 20px; border-radius: 0 8px 8px 0;">
    <h3 class="font-section-header text-xs text-primary uppercase tracking-widest mb-3">Garantía</h3>
    <p class="text-body-md leading-relaxed" style="color: #1a1c1f;">
      BBC Constructora S.A. garantiza los trabajos realizados por un período de <span style="display: inline-block; border-bottom: 1px dashed #888; min-width: 50px; text-align: center;">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span> días a partir de la fecha de firma del presente documento, cubriendo defectos de mano de obra y materiales instalados.
    </p>
  </section>
  ${_bloqueFirmas(['Técnico Ejecutor', 'Supervisor BBC', 'Representante del Cliente'])}
</div>
</div>`;

  return _envolverInforme('Acta de Conformidad — BBC Constructora', contenido);
}
