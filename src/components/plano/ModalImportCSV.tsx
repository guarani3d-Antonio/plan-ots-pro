// src/components/plano/ModalImportCSV.tsx
//
// Wizard de importación CSV en 3 pasos:
//   1. Subir archivo (drag&drop o click) — parsea con PapaParse, extrae headers + sample.
//   2. Mapear columnas — selects por header, validación de "Código OT", auto-mapping.
//   3. Previsualizar e importar — crea definiciones de campos personalizados nuevos
//      (campos_definicion) y delega la inserción de OTs al caller vía `onImportar`.
//
// La lógica de inserción real (crearOrdenDesdeImport con pos_x/pos_y null) vive en
// useAccionesProyecto → ordenesStore. Este componente solo provee la capa de mapeo
// y transforma cada fila del CSV a un ImportedRow consumible por el caller.

import { Fragment, useCallback, useMemo, useRef, useState } from 'react';
import type { CSSProperties, DragEvent, ChangeEvent } from 'react';
import Papa from 'papaparse';
import {
  crearCampo,
  type CampoDefinicion,
  type TipoCampo,
} from '../../services/camposService';

// ─── Catálogo de campos estándar ────────────────────────────────────────────
type StandardKey =
  | 'ot' | 'descripcion' | 'comentarios' | 'obra' | 'unidad_amenities'
  | 'estado' | 'prioridad' | 'rubro' | 'rubro_secundario' | 'nivel_riesgo'
  | 'responsable' | 'contratistas'
  | 'fecha_ingreso' | 'fecha_inicio_trabajos' | 'fecha_fin_trabajos'
  | 'porcentaje_avance' | 'costo'
  | 'en_garantia' | 'asiste_facility' | 'reincidencia' | 'potencialmente_conflictivo';

interface StandardField {
  key:     StandardKey;
  label:   string;
  // Alias normalizados (lowercase, sin tildes, sin espacios/puntuación) para
  // el auto-mapping inteligente al cargar el archivo.
  aliases: string[];
}

const STANDARD_FIELDS: StandardField[] = [
  { key: 'ot',                         label: 'Código OT',                          aliases: ['ot', 'codigo', 'codigoot', 'codigodeot'] },
  { key: 'descripcion',                label: 'Descripción del reclamo',            aliases: ['descripcion', 'desc', 'reclamo', 'descripciondelreclamo', 'descripcionreclamo'] },
  { key: 'comentarios',                label: 'Observaciones del técnico',          aliases: ['observaciones', 'comentarios', 'notas', 'observacionesdeltecnico'] },
  { key: 'obra',                       label: 'Obra',                               aliases: ['obra', 'edificio'] },
  { key: 'unidad_amenities',           label: 'Unidad / Amenities',                 aliases: ['unidad', 'amenities', 'unidadamenities', 'unidadamenitis'] },
  { key: 'estado',                     label: 'Estado',                             aliases: ['estado', 'status'] },
  { key: 'prioridad',                  label: 'Prioridad',                          aliases: ['prioridad', 'priority'] },
  { key: 'rubro',                      label: 'Rubro Principal',                    aliases: ['rubro', 'rubroprincipal', 'rubroppal'] },
  { key: 'rubro_secundario',           label: 'Rubro Secundario',                   aliases: ['rubrosecundario', 'rubrosec'] },
  { key: 'nivel_riesgo',               label: 'Nivel de Riesgo',                    aliases: ['riesgo', 'nivelriesgo', 'nivelderiesgo'] },
  { key: 'responsable',                label: 'Responsable',                        aliases: ['responsable', 'asignado', 'supervisor'] },
  { key: 'contratistas',               label: 'Contratistas',                       aliases: ['contratistas', 'contratista'] },
  { key: 'fecha_ingreso',              label: 'Fecha de ingreso',                   aliases: ['fechaingreso', 'fingreso', 'fechadeingreso', 'ingreso'] },
  { key: 'fecha_inicio_trabajos',      label: 'Fecha inicio trabajos',              aliases: ['fechainicio', 'finicio', 'inicio', 'fechainiciotrabajos'] },
  { key: 'fecha_fin_trabajos',         label: 'Fecha fin trabajos',                 aliases: ['fechafin', 'ffin', 'fin', 'fechafintrabajos'] },
  { key: 'porcentaje_avance',          label: '% Avance',                           aliases: ['avance', 'porcentaje', 'porcentajeavance', 'pavance'] },
  { key: 'costo',                      label: 'Costo (Gs.)',                        aliases: ['costo', 'precio', 'monto', 'costogs'] },
  { key: 'en_garantia',                label: 'En garantía (Si/No)',                aliases: ['garantia', 'engarantia'] },
  { key: 'asiste_facility',            label: 'Asiste Facility (Si/No)',            aliases: ['facility', 'asistefacility'] },
  { key: 'reincidencia',               label: 'Reincidencia (Si/No)',               aliases: ['reincidencia'] },
  { key: 'potencialmente_conflictivo', label: 'Potencialmente conflictivo (Si/No)', aliases: ['conflictivo', 'potencialmenteconflictivo'] },
];

type CustomKind = 'texto' | 'numero' | 'fecha';

type Mapping =
  | { kind: 'ignore' }
  | { kind: 'standard'; key: StandardKey }
  | { kind: 'custom';   tipo: CustomKind };

// Forma del row resultante consumido por el caller. El caller lo traduce a
// payload de crearOrdenDesdeImport (asignando pos_x: null, pos_y: null).
export interface ImportedRow {
  ot?:                          string;
  descripcion?:                 string;
  comentarios?:                 string;
  obra?:                        string;
  unidad_amenities?:            string;
  estado?:                      string;
  prioridad?:                   string;
  rubro?:                       string;
  rubro_secundario?:            string[];
  nivel_riesgo?:                string;
  responsable?:                 string;
  contratistas?:                string[];
  fecha_ingreso?:               string;
  fecha_inicio_trabajos?:       string;
  fecha_fin_trabajos?:          string;
  porcentaje_avance?:           number;
  costo?:                       number;
  en_garantia?:                 boolean;
  asiste_facility?:             boolean;
  reincidencia?:                boolean;
  potencialmente_conflictivo?:  boolean;
  campos:                       Record<string, unknown>;
}

interface ModalImportCSVProps {
  proyectoId: string;
  onCerrar:   () => void;
  onImportar: (filas: ImportedRow[], camposNuevos: CampoDefinicion[]) => Promise<{ ok: number; fail: number }>;
}

// ─── Helpers de parseo / normalización ──────────────────────────────────────
function normalizar(s: string): string {
  // NFD descompone "á" → "a" + combining acute. Quitamos las combining marks
  // (U+0300–U+036F) y todo lo que no sea alfanumérico ASCII.
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function autoMap(header: string): Mapping {
  const norm = normalizar(header);
  if (!norm) return { kind: 'ignore' };
  for (const f of STANDARD_FIELDS) {
    if (f.aliases.includes(norm)) return { kind: 'standard', key: f.key };
    if (normalizar(f.label) === norm) return { kind: 'standard', key: f.key };
  }
  // Match parcial (startsWith en cualquiera de los dos sentidos).
  for (const f of STANDARD_FIELDS) {
    if (f.aliases.some(a => norm.startsWith(a) || a.startsWith(norm))) {
      return { kind: 'standard', key: f.key };
    }
  }
  return { kind: 'ignore' };
}

function parseBool(v: string): boolean {
  const x = v.trim().toLowerCase();
  return x === 'si' || x === 'sí' || x === 'true' || x === '1' || x === 'yes' || x === 'x';
}

function parseNum(v: string): number | undefined {
  // Acepta formatos es-PY (1.500.000 / 1,5) y EN (1500000 / 1.5).
  const cleaned = v.replace(/[^\d.,-]/g, '');
  if (!cleaned) return undefined;
  let n: number;
  if (cleaned.includes('.') && cleaned.includes(',')) {
    n = parseFloat(cleaned.replace(/\./g, '').replace(',', '.'));
  } else if (cleaned.includes(',')) {
    n = parseFloat(cleaned.replace(',', '.'));
  } else {
    n = parseFloat(cleaned.replace(/\./g, ''));
  }
  return isNaN(n) ? undefined : n;
}

function parseLista(v: string): string[] {
  return v.split(/[,;|]/).map(s => s.trim()).filter(Boolean);
}

function transformar(
  fila:           Record<string, string>,
  mappings:       Record<string, Mapping>,
  camposByHeader: Record<string, CampoDefinicion>,
): ImportedRow {
  const row: ImportedRow = { campos: {} };
  for (const [header, m] of Object.entries(mappings)) {
    const raw = fila[header];
    if (raw === undefined || raw === null || raw.trim() === '') continue;

    if (m.kind === 'ignore') continue;

    if (m.kind === 'custom') {
      const def = camposByHeader[header];
      if (!def) continue;
      if (m.tipo === 'numero') {
        const n = parseNum(raw);
        if (n !== undefined) row.campos[def.id] = n;
      } else {
        row.campos[def.id] = raw.trim();
      }
      continue;
    }

    const t = raw.trim();
    switch (m.key) {
      case 'ot':                         row.ot = t; break;
      case 'descripcion':                row.descripcion = t; break;
      case 'comentarios':                row.comentarios = t; break;
      case 'obra':                       row.obra = t; break;
      case 'unidad_amenities':           row.unidad_amenities = t; break;
      case 'estado':                     row.estado = t; break;
      case 'prioridad':                  row.prioridad = t; break;
      case 'rubro':                      row.rubro = t; break;
      case 'rubro_secundario':           row.rubro_secundario = parseLista(t); break;
      case 'nivel_riesgo':               row.nivel_riesgo = t; break;
      case 'responsable':                row.responsable = t; break;
      case 'contratistas':               row.contratistas = parseLista(t); break;
      case 'fecha_ingreso':              row.fecha_ingreso = t; break;
      case 'fecha_inicio_trabajos':      row.fecha_inicio_trabajos = t; break;
      case 'fecha_fin_trabajos':         row.fecha_fin_trabajos = t; break;
      case 'porcentaje_avance':          { const n = parseNum(t); if (n !== undefined) row.porcentaje_avance = n; break; }
      case 'costo':                      { const n = parseNum(t); if (n !== undefined) row.costo = n; break; }
      case 'en_garantia':                row.en_garantia = parseBool(t); break;
      case 'asiste_facility':            row.asiste_facility = parseBool(t); break;
      case 'reincidencia':               row.reincidencia = parseBool(t); break;
      case 'potencialmente_conflictivo': row.potencialmente_conflictivo = parseBool(t); break;
    }
  }
  return row;
}

// ─── Componente ─────────────────────────────────────────────────────────────
export default function ModalImportCSV({ proyectoId, onCerrar, onImportar }: ModalImportCSVProps) {
  const [step,        setStep]        = useState<1 | 2 | 3>(1);
  const [file,        setFile]        = useState<File | null>(null);
  const [headers,     setHeaders]     = useState<string[]>([]);
  const [allRows,     setAllRows]     = useState<Record<string, string>[]>([]);
  const [mappings,    setMappings]    = useState<Record<string, Mapping>>({});
  const [parsing,     setParsing]     = useState(false);
  const [parseError,  setParseError]  = useState<string | null>(null);
  const [importing,   setImporting]   = useState(false);
  const [resultado,   setResultado]   = useState<{ ok: number; fail: number } | null>(null);
  const [dragOver,    setDragOver]    = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback((f: File | null) => {
    if (!f) return;
    setFile(f);
    setParsing(true);
    setParseError(null);
    Papa.parse<Record<string, string>>(f, {
      header: true,
      skipEmptyLines: true,
      transformHeader: h => h.trim(),
      complete: (r) => {
        const data = (r.data ?? []) as Record<string, string>[];
        const hdrs = (r.meta.fields ?? Object.keys(data[0] ?? {})).filter(h => !!h);
        setHeaders(hdrs);
        setAllRows(data);
        const m: Record<string, Mapping> = {};
        hdrs.forEach(h => { m[h] = autoMap(h); });
        setMappings(m);
        setParsing(false);
      },
      error: (err) => {
        setParseError(err.message ?? 'Error al parsear el CSV.');
        setParsing(false);
      },
    });
  }, []);

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault(); e.stopPropagation();
    setDragOver(false);
    const f = e.dataTransfer?.files?.[0] ?? null;
    if (f) handleFile(f);
  };

  const onInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    if (f) handleFile(f);
    e.target.value = '';
  };

  const setMapping = (header: string, m: Mapping) =>
    setMappings(prev => ({ ...prev, [header]: m }));

  // ── Memos derivados ──────────────────────────────────────────────────────
  const otHeader = useMemo(
    () => headers.find(h => mappings[h]?.kind === 'standard' && (mappings[h] as { kind: 'standard'; key: StandardKey }).key === 'ot'),
    [headers, mappings],
  );
  const otMapped = !!otHeader;

  const filasParaImportar = useMemo(() => {
    if (!otHeader) return [] as Record<string, string>[];
    return allRows.filter(r => (r[otHeader] ?? '').trim().length > 0);
  }, [allRows, otHeader]);

  const camposCustomCount = useMemo(
    () => Object.values(mappings).filter(m => m.kind === 'custom').length,
    [mappings],
  );

  const sampleRows  = useMemo(() => allRows.slice(0, 3), [allRows]);
  const previewRows = useMemo(() => filasParaImportar.slice(0, 5), [filasParaImportar]);

  const headersConMapping = useMemo(
    () => headers.filter(h => mappings[h]?.kind !== 'ignore'),
    [headers, mappings],
  );

  // ── Confirmar import ─────────────────────────────────────────────────────
  const handleConfirmar = useCallback(async () => {
    setImporting(true);
    try {
      const camposByHeader: Record<string, CampoDefinicion> = {};
      const camposNuevos: CampoDefinicion[] = [];
      for (const [header, m] of Object.entries(mappings)) {
        if (m.kind !== 'custom') continue;
        const tipo: TipoCampo = m.tipo === 'numero' ? 'numero' : m.tipo === 'fecha' ? 'fecha' : 'texto';
        try {
          const nuevo = await crearCampo({ proyecto_id: proyectoId, nombre: header, tipo });
          camposByHeader[header] = nuevo;
          camposNuevos.push(nuevo);
        } catch (err) {
          console.error('[ModalImportCSV] error creando campo personalizado:', header, err);
        }
      }
      const filas = filasParaImportar.map(r => transformar(r, mappings, camposByHeader));
      const res = await onImportar(filas, camposNuevos);
      setResultado(res);
    } finally {
      setImporting(false);
    }
  }, [proyectoId, mappings, filasParaImportar, onImportar]);

  // ── Estilos ──────────────────────────────────────────────────────────────
  const overlay: CSSProperties = {
    position: 'fixed', inset: 0,
    background: 'rgba(15, 23, 42, 0.55)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 99998, padding: 20,
  };
  const modal: CSSProperties = {
    background: '#fff', borderRadius: 16,
    width: '100%', maxWidth: 680, maxHeight: '90vh',
    display: 'flex', flexDirection: 'column', overflow: 'hidden',
    boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
    fontFamily: 'inherit',
  };
  const headerBox: CSSProperties = {
    padding: '20px 24px 16px', borderBottom: '1px solid #E5E7EB',
  };
  const body: CSSProperties = {
    flex: 1, overflow: 'auto', padding: '20px 24px', minHeight: 0,
  };
  const footer: CSSProperties = {
    padding: '14px 20px', borderTop: '1px solid #E5E7EB',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    background: '#F9FAFB', gap: 10,
  };
  const titulo: CSSProperties = {
    fontSize: 18, fontWeight: 800, color: '#0F172A',
    margin: '0 0 12px',
  };

  // ── Progress bar ─────────────────────────────────────────────────────────
  const pasosTitulos = ['Cargar archivo', 'Mapear columnas', 'Previsualizar'];
  const renderProgress = () => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      {pasosTitulos.map((t, i) => {
        const n = (i + 1) as 1 | 2 | 3;
        const completado = n < step;
        const activo     = n === step;
        const circulo: CSSProperties = {
          width: 28, height: 28, borderRadius: '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 12, fontWeight: 700,
          background:  completado ? '#15803D' : activo ? '#1E3A5F' : '#E5E7EB',
          color:       completado || activo ? '#fff' : '#94A3B8',
          transition:  'background .15s, color .15s',
          flexShrink:  0,
        };
        const linea: CSSProperties = {
          flex: 1, height: 2,
          background: completado ? '#15803D' : '#E5E7EB',
          transition: 'background .15s',
        };
        const label: CSSProperties = {
          fontSize: 11, fontWeight: 600,
          color: activo ? '#1E3A5F' : completado ? '#15803D' : '#94A3B8',
          whiteSpace: 'nowrap',
        };
        return (
          <Fragment key={n}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={circulo}>{completado ? '✓' : n}</div>
              <span style={label}>{t}</span>
            </div>
            {i < pasosTitulos.length - 1 && <div style={linea} />}
          </Fragment>
        );
      })}
    </div>
  );

  // ── Render por paso ──────────────────────────────────────────────────────
  const renderPaso1 = () => {
    const dropZone: CSSProperties = {
      border: `2px dashed ${dragOver ? '#1E3A5F' : '#CBD5E1'}`,
      borderRadius: 12,
      padding: '36px 20px',
      textAlign: 'center',
      background: dragOver ? '#EEF2FF' : '#F8FAFC',
      cursor: 'pointer',
      transition: 'background .15s, border-color .15s',
    };
    return (
      <>
        <h3 style={titulo}>Subir archivo CSV</h3>
        <p style={{ fontSize: 13, color: '#64748B', margin: '0 0 16px', lineHeight: 1.5 }}>
          Arrastrá tu CSV o hacé clic para seleccionarlo. La primera fila se usa como
          encabezado de columnas. En el próximo paso vas a poder mapear cada columna
          a un campo de Plan-OTs.
        </p>
        <div
          style={dropZone}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDragOver(true); }}
          onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setDragOver(false); }}
          onDrop={handleDrop}
        >
          <div style={{ fontSize: 36, marginBottom: 8 }}>📥</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#0F172A', marginBottom: 4 }}>
            {file ? file.name : 'Arrastrá un CSV o hacé clic'}
          </div>
          <div style={{ fontSize: 12, color: '#94A3B8' }}>
            {file
              ? `${(file.size / 1024).toFixed(1)} KB · ${allRows.length} filas detectadas`
              : 'Acepta archivos .csv'}
          </div>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          style={{ display: 'none' }}
          onChange={onInputChange}
        />
        {parsing && (
          <div style={{ marginTop: 12, fontSize: 12, color: '#1E3A5F' }}>Leyendo archivo…</div>
        )}
        {parseError && (
          <div style={{ marginTop: 12, padding: 10, background: '#FEF2F2', color: '#991B1B', borderRadius: 8, fontSize: 12 }}>
            ⚠ {parseError}
          </div>
        )}
        {file && !parsing && !parseError && headers.length > 0 && (
          <div style={{ marginTop: 16, fontSize: 12, color: '#0F172A' }}>
            <strong>{headers.length}</strong> columnas detectadas, <strong>{allRows.length}</strong> filas.
          </div>
        )}
      </>
    );
  };

  const renderPaso2 = () => {
    const selectStyle: CSSProperties = {
      width: '100%',
      padding: '6px 8px',
      fontSize: 12,
      border: '1px solid #E5E7EB',
      borderRadius: 6,
      background: '#fff',
      fontFamily: 'inherit',
    };
    return (
      <>
        <h3 style={titulo}>Mapeá tus columnas a Plan-OTs</h3>
        <p style={{ fontSize: 13, color: '#64748B', margin: '0 0 16px', lineHeight: 1.5 }}>
          Por cada columna del CSV, elegí a qué campo de Plan-OTs corresponde.
          Auto-mapeamos lo que pudimos detectar; ajustá lo que falte.
        </p>

        <div style={{
          border: '1px solid #E5E7EB', borderRadius: 8, overflow: 'hidden',
          marginBottom: 16,
        }}>
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr',
            background: '#F8FAFC', borderBottom: '1px solid #E5E7EB',
            padding: '8px 12px', fontSize: 11, fontWeight: 700, color: '#64748B',
            textTransform: 'uppercase', letterSpacing: '0.05em',
          }}>
            <span>Mi columna CSV</span>
            <span>Campo en Plan-OTs</span>
          </div>
          {headers.map(h => {
            const m = mappings[h] ?? { kind: 'ignore' };
            const value: string =
              m.kind === 'ignore' ? '__ignore__' :
              m.kind === 'standard' ? `std:${m.key}` :
              `custom:${m.tipo}`;
            return (
              <div key={h} style={{
                display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12,
                padding: '8px 12px',
                borderBottom: '1px solid #F1F5F9',
                alignItems: 'center',
              }}>
                <span style={{ fontSize: 12, color: '#64748B', wordBreak: 'break-word' }}>{h}</span>
                <select
                  style={selectStyle}
                  value={value}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === '__ignore__') setMapping(h, { kind: 'ignore' });
                    else if (v.startsWith('std:')) setMapping(h, { kind: 'standard', key: v.slice(4) as StandardKey });
                    else if (v.startsWith('custom:')) setMapping(h, { kind: 'custom', tipo: v.slice(7) as CustomKind });
                  }}
                >
                  <option value="__ignore__">— Ignorar esta columna —</option>
                  <optgroup label="── Campos estándar de Plan-OTs ──">
                    {STANDARD_FIELDS.map(f => (
                      <option key={f.key} value={`std:${f.key}`}>{f.label}</option>
                    ))}
                  </optgroup>
                  <optgroup label="── Crear campo personalizado nuevo ──">
                    <option value="custom:texto">→ Campo personalizado: texto</option>
                    <option value="custom:numero">→ Campo personalizado: número</option>
                    <option value="custom:fecha">→ Campo personalizado: fecha</option>
                  </optgroup>
                </select>
              </div>
            );
          })}
        </div>

        {/* Preview primeras 3 filas con los valores reales del CSV */}
        {sampleRows.length > 0 && (
          <div style={{
            border: '1px solid #E5E7EB', borderRadius: 8, overflow: 'auto',
            marginBottom: 12,
          }}>
            <div style={{
              padding: '8px 12px', background: '#F8FAFC',
              borderBottom: '1px solid #E5E7EB', fontSize: 11, fontWeight: 700,
              color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em',
            }}>
              Preview — primeras 3 filas
            </div>
            <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 11 }}>
              <thead>
                <tr>
                  {headers.map(h => (
                    <th key={h} style={{
                      textAlign: 'left', padding: '6px 10px',
                      borderBottom: '1px solid #E5E7EB',
                      color: '#0F172A', fontWeight: 700,
                      whiteSpace: 'nowrap',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sampleRows.map((r, i) => (
                  <tr key={i}>
                    {headers.map(h => (
                      <td key={h} style={{
                        padding: '6px 10px', borderBottom: '1px solid #F1F5F9',
                        color: '#374151', maxWidth: 200, overflow: 'hidden',
                        textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>{r[h] ?? ''}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!otMapped && (
          <div style={{
            padding: 10, background: '#FEF3C7', color: '#92400E',
            borderRadius: 8, fontSize: 12, fontWeight: 600,
          }}>
            ⚠ El código de OT es obligatorio. Mapeá una columna a "Código OT" para continuar.
          </div>
        )}
      </>
    );
  };

  const renderPaso3 = () => {
    if (resultado) {
      return (
        <>
          <h3 style={titulo}>Importación finalizada</h3>
          <div style={{
            padding: 16, borderRadius: 10,
            background: resultado.fail > 0 ? '#FEF3C7' : '#DCFCE7',
            color:      resultado.fail > 0 ? '#92400E' : '#166534',
            fontSize: 14, fontWeight: 600, marginBottom: 12,
          }}>
            ✓ {resultado.ok} OT{resultado.ok !== 1 ? 's' : ''} creada{resultado.ok !== 1 ? 's' : ''}
            {resultado.fail > 0 && <> · ✗ {resultado.fail} fallaron</>}
          </div>
          <p style={{ fontSize: 12, color: '#64748B', margin: 0, lineHeight: 1.5 }}>
            Las OTs aparecen en "OTs sin ubicar" en el panel lateral. Arrastrá cada una al
            plano para asignarle posición.
          </p>
        </>
      );
    }
    return (
      <>
        <h3 style={titulo}>Previsualización final</h3>
        <p style={{ fontSize: 13, color: '#64748B', margin: '0 0 12px', lineHeight: 1.5 }}>
          Se importarán <strong>{filasParaImportar.length}</strong> orden{filasParaImportar.length !== 1 ? 'es' : ''}.
          Todas se crearán sin ubicar en el plano (las arrastrás después).
        </p>
        {camposCustomCount > 0 && (
          <div style={{
            padding: 10, background: '#EEF2FF', color: '#3730A3',
            borderRadius: 8, fontSize: 12, marginBottom: 12,
          }}>
            ℹ Se crearán <strong>{camposCustomCount}</strong> campo{camposCustomCount !== 1 ? 's' : ''} personalizado{camposCustomCount !== 1 ? 's' : ''} nuevo{camposCustomCount !== 1 ? 's' : ''} en este proyecto.
          </div>
        )}
        {previewRows.length > 0 && (
          <div style={{
            border: '1px solid #E5E7EB', borderRadius: 8, overflow: 'auto',
          }}>
            <div style={{
              padding: '8px 12px', background: '#F8FAFC',
              borderBottom: '1px solid #E5E7EB', fontSize: 11, fontWeight: 700,
              color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em',
            }}>
              Primeras {previewRows.length} filas (mapeadas)
            </div>
            <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 11 }}>
              <thead>
                <tr>
                  {headersConMapping.map(h => {
                    const m = mappings[h];
                    let etiqueta = h;
                    if (m?.kind === 'standard') {
                      etiqueta = STANDARD_FIELDS.find(f => f.key === m.key)?.label ?? h;
                    } else if (m?.kind === 'custom') {
                      etiqueta = `${h} (custom · ${m.tipo})`;
                    }
                    return (
                      <th key={h} style={{
                        textAlign: 'left', padding: '6px 10px',
                        borderBottom: '1px solid #E5E7EB',
                        color: '#0F172A', fontWeight: 700,
                        whiteSpace: 'nowrap',
                      }}>{etiqueta}</th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {previewRows.map((r, i) => (
                  <tr key={i}>
                    {headersConMapping.map(h => (
                      <td key={h} style={{
                        padding: '6px 10px', borderBottom: '1px solid #F1F5F9',
                        color: '#374151', maxWidth: 200, overflow: 'hidden',
                        textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>{r[h] ?? ''}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </>
    );
  };

  // ── Botones del footer según el paso ────────────────────────────────────
  const btnBase: CSSProperties = {
    padding: '8px 16px', fontSize: 13, fontWeight: 600,
    borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit',
    border: '1px solid transparent',
  };
  const btnCancel: CSSProperties = {
    ...btnBase, background: 'transparent', color: '#64748B',
    border: '1px solid #E5E7EB',
  };
  const btnBack: CSSProperties = {
    ...btnBase, background: 'transparent', color: '#1E3A5F',
    border: '1px solid #E5E7EB',
  };
  const btnNext = (enabled: boolean): CSSProperties => ({
    ...btnBase,
    background: enabled ? '#1E3A5F' : '#CBD5E1',
    color: '#fff',
    cursor: enabled ? 'pointer' : 'not-allowed',
  });
  const btnConfirm = (enabled: boolean): CSSProperties => ({
    ...btnBase,
    background: enabled ? '#15803D' : '#CBD5E1',
    color: '#fff',
    cursor: enabled ? 'pointer' : 'not-allowed',
  });

  const puedeAvanzarPaso1 = !!file && !parsing && !parseError && headers.length > 0;
  const puedeAvanzarPaso2 = otMapped;

  return (
    <div style={overlay} onClick={onCerrar}>
      <div style={modal} onClick={e => e.stopPropagation()}>
        <div style={headerBox}>
          {renderProgress()}
        </div>
        <div style={body}>
          {step === 1 && renderPaso1()}
          {step === 2 && renderPaso2()}
          {step === 3 && renderPaso3()}
        </div>
        <div style={footer}>
          <button style={btnCancel} onClick={onCerrar} type="button" disabled={importing}>
            {resultado ? 'Cerrar' : 'Cancelar'}
          </button>
          <div style={{ display: 'flex', gap: 10 }}>
            {step > 1 && !resultado && (
              <button
                style={btnBack}
                onClick={() => setStep((step - 1) as 1 | 2 | 3)}
                type="button"
                disabled={importing}
              >
                ← Volver
              </button>
            )}
            {step === 1 && (
              <button
                style={btnNext(puedeAvanzarPaso1)}
                disabled={!puedeAvanzarPaso1}
                onClick={() => setStep(2)}
                type="button"
              >
                Siguiente →
              </button>
            )}
            {step === 2 && (
              <button
                style={btnNext(puedeAvanzarPaso2)}
                disabled={!puedeAvanzarPaso2}
                onClick={() => setStep(3)}
                type="button"
              >
                Siguiente →
              </button>
            )}
            {step === 3 && !resultado && (
              <button
                style={btnConfirm(!importing && filasParaImportar.length > 0)}
                disabled={importing || filasParaImportar.length === 0}
                onClick={handleConfirmar}
                type="button"
              >
                {importing
                  ? 'Importando…'
                  : `✓ Importar ${filasParaImportar.length} OT${filasParaImportar.length !== 1 ? 's' : ''}`}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
