import Papa from 'papaparse';
import type { OrdenLocal, EstadoOT, PrioridadOT } from '../types/orden';

// ── Normalización de valores de entrada ──────────────────────────────────────


/** Compatibilidad hacia atrás con nombres viejos */
function normalizarEstado(raw: string): EstadoOT | null {
  const mapa: Record<string, EstadoOT> = {
    'pendiente':    'Pendiente',
    'en proceso':   'En proceso',
    'en progreso':  'En proceso',   // compatibilidad S01-S08
    'cerrada':      'Cerrada',
    'completada':   'Cerrada',      // compatibilidad S01-S08
    'no aplica':    'No aplica',
    'bloqueada':    'No aplica',    // compatibilidad S01-S08
    'bloqueado':    'No aplica',
  };
  return mapa[raw.toLowerCase().trim()] ?? null;
}

function normalizarPrioridad(raw: string): PrioridadOT {
  const mapa: Record<string, PrioridadOT> = {
    'alta': 'Alta', 'high': 'Alta',
    'media': 'Media', 'medium': 'Media', 'normal': 'Media',
    'baja': 'Baja', 'low': 'Baja',
  };
  return mapa[raw.toLowerCase().trim()] ?? 'Media';
}

function repararExcelDoubleWrap(texto: string): string {
  if (!texto.startsWith('"')) return texto;
  const lineas = texto.split('\n');
  const primera = lineas[0];
  if (primera.includes('""')) {
    return lineas.map(l => {
      if (l.startsWith('"') && l.endsWith('"')) {
        l = l.slice(1, -1);
      }
      return l.replace(/""/g, '"');
    }).join('\n');
  }
  return texto;
}

// ── Exportación ──────────────────────────────────────────────────────────────

interface FotosPorOrden {
  antes: string[];
  durante: string[];
  despues: string[];
}

export async function exportarCSV(
  ordenes: OrdenLocal[],
  fotosMap: Map<string, FotosPorOrden>,
  nombreProyecto: string
): Promise<void> {
  const filas = ordenes.map(o => {
    const fotos = fotosMap.get(o.id) ?? { antes: [], durante: [], despues: [] };
    return {
      id:          o.id,
      ot:          o.ot,
      ubicacion:   o.ubicacion,
      rubro:       o.rubro,
      estado:      o.estado,
      responsable: o.responsable,
      prioridad:   o.prioridad,
      comentarios: o.comentarios,
      pos_x:       o.pos_x,
      pos_y:       o.pos_y,
      ANTES:       fotos.antes.join(' | '),
      DURANTE:     fotos.durante.join(' | '),
      DESPUES:     fotos.despues.join(' | '),
      created_at:  o.created_at,
      updated_at:  o.updated_at,
    };
  });

  const csv = Papa.unparse(filas, { quotes: false, delimiter: ',' });
  const bom = '\uFEFF';
  const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const fecha = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `${nombreProyecto}_${fecha}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Importación ──────────────────────────────────────────────────────────────

export interface ResultadoImport {
  exitos: number;
  errores: { fila: number; mensaje: string }[];
  advertencias: { fila: number; mensaje: string }[];
  ordenes: Partial<OrdenLocal>[];
}

export async function importarCSV(archivo: File): Promise<ResultadoImport> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const texto = repararExcelDoubleWrap(e.target?.result as string);

      const { data } = Papa.parse<Record<string, string>>(texto, {
        header: true,
        skipEmptyLines: true,
        delimiter: texto.includes(';') && !texto.includes(',') ? ';' : ',',
        transformHeader: (h) => h.trim(),
      });

      const errores: ResultadoImport['errores'] = [];
      const advertencias: ResultadoImport['advertencias'] = [];
      const ordenes: Partial<OrdenLocal>[] = [];

      data.forEach((fila, idx) => {
        const num = idx + 2;
        const ot = (fila['ot'] ?? fila['OT'] ?? '').trim();
        if (!ot) {
          errores.push({ fila: num, mensaje: 'Campo "ot" vacío — fila descartada' });
          return;
        }

        const estadoRaw = fila['estado'] ?? 'Pendiente';
        const estado = normalizarEstado(estadoRaw);
        if (!estado) {
          advertencias.push({ fila: num, mensaje: `Estado desconocido "${estadoRaw}" → asignado "Pendiente"` });
        }

        // Las OTs importadas siempre arrancan SIN ubicar — las coordenadas se
        // asignan únicamente cuando el usuario arrastra la card al plano. Las
        // columnas pos_x/pos_y del CSV (si existen) se ignoran a propósito.
        // Cast a `number` porque el tipo de OrdenLocal declara `pos_x: number`
        // pero runtime/DB aceptan null para representar "sin ubicar".
        ordenes.push({
          ot,
          ubicacion:   (fila['ubicacion'] ?? '').trim(),
          rubro:       (fila['rubro'] ?? '').trim(),
          estado:      estado ?? 'Pendiente',
          responsable: (fila['responsable'] ?? '').trim(),
          prioridad:   normalizarPrioridad(fila['prioridad'] ?? 'Media'),
          comentarios: (fila['comentarios'] ?? '').trim(),
          pos_x:       null as unknown as number,
          pos_y:       null as unknown as number,
          campos:      {},
        });
      });

      resolve({
        exitos:     ordenes.length,
        errores,
        advertencias,
        ordenes,
      });
    };
    reader.readAsText(archivo, 'UTF-8');
  });
}