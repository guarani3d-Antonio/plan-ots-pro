/**
 * otprojService.ts
 * Exportación del proyecto en formato .otproj (ZIP).
 * Contenido: manifest.json + proyecto.json + ordenes.json + README.txt
 * NO embebe archivos multimedia — solo metadatos + URLs.
 */

import JSZip from 'jszip';
import type { OrdenLocal } from '../types/orden';

// ─── TIPOS ───────────────────────────────────────────────────────────────────

export interface ProyectoExport {
  id: string;
  nombre: string;
  cliente?: string | null;
  plano_url: string;
  created_at?: string;
  updated_at?: string;
}

export interface FotosExport {
  antes: string[];
  durante: string[];
  despues: string[];
}

// ─── EXPORTACIÓN .otproj ─────────────────────────────────────────────────────

/**
 * Genera y descarga un archivo .otproj (ZIP) con los metadatos del proyecto.
 *
 * @param proyecto  Datos básicos del proyecto activo
 * @param ordenes   Lista completa de OrdenLocal del proyecto
 * @param fotosMap  Map { ordenId → { antes, durante, despues } } con URLs de Storage
 */
export async function exportarOtproj(
  proyecto: ProyectoExport,
  ordenes: OrdenLocal[],
  fotosMap: Map<string, FotosExport>
): Promise<void> {
  const zip = new JSZip();
  const ahora = new Date().toISOString();
  const version = '1.0';

  // ── manifest.json ─────────────────────────────────────────────────────────
  const manifest = {
    version,
    app: 'Plan-OTs',
    exportado_en: ahora,
    proyecto_id: proyecto.id,
    proyecto_nombre: proyecto.nombre,
    total_ordenes: ordenes.length,
    checksum_ordenes: ordenes.length,
    nota: 'Este archivo NO contiene archivos multimedia. Las URLs apuntan a Supabase Storage.',
  };
  zip.file('manifest.json', JSON.stringify(manifest, null, 2));

  // ── proyecto.json ─────────────────────────────────────────────────────────
  const proyectoJson = {
    id: proyecto.id,
    nombre: proyecto.nombre,
    cliente: proyecto.cliente ?? '',
    plano_url: proyecto.plano_url,
    created_at: proyecto.created_at ?? '',
    updated_at: proyecto.updated_at ?? ahora,
    exportado_en: ahora,
  };
  zip.file('proyecto.json', JSON.stringify(proyectoJson, null, 2));

  // ── ordenes.json ──────────────────────────────────────────────────────────
  const fotos = fotosMap.get.bind(fotosMap);
  const ordenesJson = ordenes.map(orden => {
    const f = fotos(orden.id);
    return {
      id:            orden.id,
      ot:            orden.ot,
      estado:        orden.estado,
      rubro:         orden.rubro,
      responsable:   orden.responsable,
      prioridad:     orden.prioridad,
      comentarios:   orden.comentarios,
      ubicacion:     orden.ubicacion,
      pos_x:         orden.pos_x,
      pos_y:         orden.pos_y,
      plano_ref_url: orden.plano_ref_url,
      campos:        orden.campos ?? {},
      conflict_flag: orden.conflict_flag,
      created_by:    orden.created_by,
      updated_by:    orden.updated_by,
      created_at:    orden.created_at,
      updated_at:    orden.updated_at,
      fotos: {
        antes:   f?.antes   ?? [],
        durante: f?.durante ?? [],
        despues: f?.despues ?? [],
      },
    };
  });
  zip.file('ordenes.json', JSON.stringify(ordenesJson, null, 2));

  // ── README.txt ────────────────────────────────────────────────────────────
  const readme = [
    'PLAN-OTs — Archivo de proyecto (.otproj)',
    '=========================================',
    '',
    `Proyecto:     ${proyecto.nombre}`,
    `Cliente:      ${proyecto.cliente ?? '—'}`,
    `Exportado:    ${ahora}`,
    `Total OTs:    ${ordenes.length}`,
    `Versión fmt:  ${version}`,
    '',
    'CONTENIDO DEL ARCHIVO',
    '---------------------',
    '  manifest.json  → Metadatos de exportación y checksums',
    '  proyecto.json  → Configuración del proyecto',
    '  ordenes.json   → Todas las OT con URLs de fotos',
    '',
    'IMPORTANTE',
    '----------',
    'Este archivo NO contiene fotos, videos ni el plano original.',
    'Los archivos multimedia están almacenados en Supabase Storage.',
    'Al importar en otro dispositivo, se descargan bajo demanda.',
    '',
    'Para importar: Plan-OTs → Selector de proyectos → Importar .otproj',
  ].join('\n');
  zip.file('README.txt', readme);

  // ── Generar y descargar ───────────────────────────────────────────────────
  const blob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  const MB = blob.size / (1024 * 1024);
  if (MB > 50) {
    alert(`El archivo generado (${MB.toFixed(1)} MB) supera el límite de 50 MB. Contacta soporte.`);
    return;
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const fecha = new Date().toISOString().slice(0, 10);
  const nombreArchivo = sanitizarNombre(proyecto.nombre);
  link.href = url;
  link.download = `${nombreArchivo}_${fecha}.otproj`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function sanitizarNombre(nombre: string): string {
  return nombre
    .replace(/[^a-zA-Z0-9_\-áéíóúÁÉÍÓÚñÑ ]/g, '')
    .replace(/\s+/g, '_')
    .slice(0, 50);
}