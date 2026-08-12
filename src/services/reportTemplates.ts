// reportTemplates.ts — Plan-OTs PRO · Guaraní 3D (GDV)
// Helpers y tokens compartidos por los 5 generadores de informe (familia viva).
// Extraído verbatim de reportService.ts (líneas 791-1131) en F0 (D3).
// Salida byte-idéntica por construcción.
// Regla: todo contenido de usuario pasa por escapeHtml() antes de interpolarse.

import type { OrdenLocal } from '../types/orden';

// Escapa entidades HTML para inyectar texto del usuario sin romper el parseo.
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function formatearFechaLarga(fecha: string | null | undefined): string {
  if (!fecha) return 'No registrada';
  const d = new Date(fecha + 'T00:00:00');
  const meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                 'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  return `${d.getDate()} de ${meses[d.getMonth()]}, ${d.getFullYear()}`;
}

export function formatearFechaCorta(fecha: string | null | undefined): string {
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
export function generarGridFotos(
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
          <img src="${escapeHtml(f.file_url)}" alt="Foto ${idx + 1}" loading="lazy" onerror="this.style.display='none'; this.nextElementSibling && (this.nextElementSibling.style.display='flex')" style="width:100%; aspect-ratio:4/3; object-fit:cover; border-radius:4px; display:block;" />
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
export function _estadoBadgeCfg(estado: string): {
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
      return { texto: escapeHtml(estado.toUpperCase()), bg: '#f1f5f9', text: '#475569', border: '#475569', icon: 'info' };
  }
}

// HEAD del documento HTML (DOCTYPE + html + meta + tailwind config + style).
// __TITLE__ se reemplaza con escapeHtml(titulo) al envolver.
export const _HEAD_INFORME = `<!DOCTYPE html>
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
export const _FOOTER_INFORME = `<footer class="page-footer">
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
export const _LOGOS_HTML_INFORME = `<div class="flex items-center gap-4">
  <div class="flex items-center gap-3 flex-shrink-0">
    <img alt="BBC Constructora Logo" class="h-10 w-auto object-contain max-w-[120px]"
      src="https://lh3.googleusercontent.com/aida-public/AB6AXuAZllvvhAPx9rtylzcyTEmxbZTrzv3wTxLXEuqT6hVfNKy4hOmUGXk2BxjKAKwmOO931f6sKQztPbubOSybhYusjtZEXiaa0Ggq9j70wSvZgy9HGL_8uqWfTveeotdC4TG8SExGrwqZTPWp5XRASM3dMUlb1Go4UbuZqySEN7SM0K8TG5gDtayNQPVlxGqRmDcYwu9oCXYM9ysIZWYO15_9r2RveasOdSFWzL9R_IYWpamGjGRXgSqpo4rjNdWVLcSlXKqCbWaqnoI4"/>
  </div>
</div>`;

// Encabezado de página 1: logos + badge estado + ID + título h1 + subtítulo.
export function _paginaHeader(orden: OrdenLocal, titulo: string, subtitulo: string): string {
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
export function _envolverInforme(titulo: string, contenido: string): string {
  return `${_HEAD_INFORME.replace('__TITLE__', escapeHtml(titulo))}
<body class="bg-surface font-body-md text-on-surface min-h-screen">
${contenido}
${_FOOTER_INFORME.replace('__YEAR__', String(new Date().getFullYear()))}
</body></html>`;
}

// Bloque "Datos del Cliente" (Obra / Unidad / Responsable).
export function _bloqueDatosCliente(orden: OrdenLocal): string {
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
export function _bloqueDatosOT(orden: OrdenLocal): string {
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
export function _bloqueNaranjaIzquierdo(titulo: string, contenido: string, vacioPlaceholder: string): string {
  const tieneContenido = contenido.trim().length > 0;
  const textoFinal = tieneContenido ? contenido : vacioPlaceholder;
  return `<section class="mb-8 no-break" style="border-left: 4px solid #CC7A00; background: #fffbf5; padding: 16px 20px; border-radius: 0 8px 8px 0;">
    <h3 class="font-section-header text-xs text-primary uppercase tracking-widest mb-3">${escapeHtml(titulo)}</h3>
    <p id="bloque-texto-naranja" class="text-body-md leading-relaxed text-justify" style="color: ${tieneContenido ? '#1a1c1f' : '#888'}; ${tieneContenido ? '' : 'font-style: italic;'}">${escapeHtml(textoFinal)}</p>
  </section>`;
}

// n líneas horizontales punteadas para completar a mano.
export function _lineasPunteadas(n: number): string {
  return Array.from({ length: n }, () =>
    '<div style="border-bottom:1px dashed #ccc; margin:8px 0; height:20px;"></div>'
  ).join('\n');
}

// Bloque de firmas — 2 o 3 firmantes (línea horizontal + rol debajo).
export function _bloqueFirmas(roles: string[]): string {
  const gridCols = roles.length === 3 ? 'grid-cols-3' : 'grid-cols-2';
  return `<section class="grid ${gridCols} gap-12 px-6 mb-12 items-end no-break">
    ${roles.map(rol => `<div class="flex flex-col items-center">
      <div class="w-full border-b border-dashed border-outline-variant pt-14"></div>
      <span class="font-bold text-[11px] text-primary mt-3 uppercase tracking-widest text-center">${escapeHtml(rol)}</span>
    </div>`).join('')}
  </section>`;
}
