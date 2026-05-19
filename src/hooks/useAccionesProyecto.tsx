// src/hooks/useAccionesProyecto.tsx
//
// Encapsula las acciones de proyecto que antes vivían dentro de PanelResumen:
// exportar CSV, exportar .otproj, importar CSV, guardar versión, historial,
// y abrir el comparador. Maneja el estado de los modales internamente y
// devuelve el JSX listo para renderizar — el caller solo tiene que montar
// `{modales}` en algún lugar del árbol.
//
// Llamarlo UNA SOLA VEZ en VistaPlano y pasar `acciones` por props a
// PanelResumen y al ToolPanel; así ambos disparan el mismo flujo y comparten
// los mismos modales (sin estados duplicados).
//
// Es .tsx (no .ts) porque retorna JSX en `modales`.

import { useState } from 'react';
import type { OrdenLocal, EstadoOT, PrioridadOT } from '../types/orden';
import { cargarFotosDeOrden } from '../services/fotosService';
import { exportarCSV as svcExportarCSV } from '../services/csvService';
import { exportarOtproj as svcExportarOtproj } from '../services/otprojService';
import {
  guardarVersion as svcGuardarVersion,
  listarVersiones,
  eliminarVersion,
  type Version,
} from '../services/versionesService';
import { ComparadorVersiones } from '../components/plano/ComparadorVersiones';
import ModalImportCSV, { type ImportedRow } from '../components/plano/ModalImportCSV';
import ModalDuplicadosOT, { type RenombreOT } from '../components/plano/ModalDuplicadosOT';
import { useOrdenesStore } from '../stores/ordenesStore';
import { useToast } from '../components/ui/Toast';
import styles from '../components/plano/PanelResumen.module.css';

// ─── Tipos ─────────────────────────────────────────────────────────────────

interface ProyectoBasico {
  id: string;
  nombre: string;
  cliente?: string | null;
  plano_url: string;
  created_at?: string;
  updated_at?: string;
}

type FotosEntry = { antes: string[]; durante: string[]; despues: string[] };

export interface AccionesProyecto {
  exportarCSV:         () => Promise<void>;
  exportarOtproj:      () => Promise<void>;
  abrirImportarCSV:    () => void;
  abrirGuardarVersion: () => void;
  abrirHistorial:      () => Promise<void>;
  abrirComparador:     () => void;
}

export interface UseAccionesProyectoReturn {
  acciones: AccionesProyecto;
  cargando: string | null;
  modales:  React.ReactNode;
}

// ─── Helpers internos ──────────────────────────────────────────────────────

async function construirFotosMap(ordenes: OrdenLocal[]): Promise<Map<string, FotosEntry>> {
  const mapa = new Map<string, FotosEntry>();
  for (const orden of ordenes) {
    try {
      const fotos = await cargarFotosDeOrden(orden.id);
      mapa.set(orden.id, {
        antes:   fotos.filter(f => f.categoria === 'ANTES').map(f => f.url),
        durante: fotos.filter(f => f.categoria === 'DURANTE').map(f => f.url),
        despues: fotos.filter(f => f.categoria === 'DESPUES').map(f => f.url),
      });
    } catch {
      mapa.set(orden.id, { antes: [], durante: [], despues: [] });
    }
  }
  return mapa;
}

function formatFecha(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('es-PY', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

// Distancia Levenshtein simplificada
const levenshtein = (a: string, b: string): number => {
  const dp = Array.from({length: a.length + 1}, (_, i) =>
    Array.from({length: b.length + 1}, (_, j) => i || j)
  );
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = a[i-1] === b[j-1]
        ? dp[i-1][j-1]
        : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
  return dp[a.length][b.length];
};

// Normaliza una cadena para comparación tolerante: minúsculas, sin tildes
// (NFD + range de combining diacritics), recortada.
const limpiar = (s: string | undefined): string =>
  (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

// ─── Hook ──────────────────────────────────────────────────────────────────

export function useAccionesProyecto(
  proyecto: ProyectoBasico | null,
  ordenes:  OrdenLocal[]
): UseAccionesProyectoReturn {
  // ── Cargando global (mensaje único en cualquier acción) ───────────────────
  const [cargando, setCargando] = useState<string | null>(null);

  // ── Importar CSV ──────────────────────────────────────────────────────────
  const [mostrarModalImport, setMostrarModalImport] = useState(false);
  // Modal de confirmación de duplicados. El handler async parquea su Promise
  // acá vía setState; cuando el usuario decide, llamamos a `resolver(bool)` y
  // limpiamos el estado para desmontar el modal.
  const [modalDuplicados, setModalDuplicados] = useState<{
    renombres: RenombreOT[];
    resolver:  (aceptar: boolean) => void;
  } | null>(null);

  // ── Guardar versión ───────────────────────────────────────────────────────
  const [modalVersion,     setModalVersion]     = useState(false);
  const [nombreVersion,    setNombreVersion]    = useState('');
  const [guardandoVersion, setGuardandoVersion] = useState(false);

  // ── Historial ─────────────────────────────────────────────────────────────
  const [modalHistorial,    setModalHistorial]    = useState(false);
  const [versiones,         setVersiones]         = useState<Version[]>([]);
  const [cargandoVersiones, setCargandoVersiones] = useState(false);

  // ── Comparador ────────────────────────────────────────────────────────────
  const [comparadorAbierto, setComparadorAbierto] = useState(false);

  // Toast — reemplaza los alert() de cada acción (export, import, version, etc.)
  const { mostrar, ToastComponent } = useToast();

  const crearOrdenDesdeImport = useOrdenesStore(s => s.crearOrdenDesdeImport);

  // ── Exportar CSV ──────────────────────────────────────────────────────────
  const exportarCSV = async () => {
    if (!proyecto) return;
    if (ordenes.length === 0) { mostrar('No hay órdenes para exportar.', 'info'); return; }
    setCargando('Cargando fotos para exportar CSV…');
    try {
      const fotosMap = await construirFotosMap(ordenes);
      svcExportarCSV(ordenes, fotosMap, proyecto.nombre);
      mostrar('CSV exportado correctamente.', 'success');
    } catch (err: unknown) {
      mostrar('Error al exportar CSV.', 'error'); console.error(err);
    } finally { setCargando(null); }
  };

  // ── Exportar .otproj ──────────────────────────────────────────────────────
  const exportarOtproj = async () => {
    if (!proyecto) return;
    if (ordenes.length === 0) { mostrar('No hay órdenes para exportar.', 'info'); return; }
    setCargando('Generando archivo .otproj…');
    try {
      const fotosMap = await construirFotosMap(ordenes);
      await svcExportarOtproj(proyecto, ordenes, fotosMap);
      mostrar('Proyecto exportado como .otproj.', 'success');
    } catch (err: unknown) {
      mostrar('Error al generar .otproj.', 'error'); console.error(err);
    } finally { setCargando(null); }
  };

  // ── Importar CSV ──────────────────────────────────────────────────────────
  // El wizard (ModalImportCSV) maneja file upload + mapeo + preview internamente.
  // Al confirmar nos pasa las filas ya transformadas con sus campos personalizados
  // ya creados; acá solo iteramos llamando `crearOrdenDesdeImport` (que es la
  // lógica de inserción autoritativa del store — patrón offline-first + cola).
  const abrirImportarCSV = () => setMostrarModalImport(true);

  // Normalizadores de enums (estado/prioridad/riesgo). Aceptan variantes legacy
  // y errores de tipeo del CSV: primero match exacto contra los alias del catálogo
  // (case-insensitive, sin tildes), después fallback fuzzy por Levenshtein.
  // Caen a defaults estándar de Plan-OTs cuando ni siquiera el fuzzy matchea.
  const normalizarEstado = (raw: string | undefined): EstadoOT => {
    const x = limpiar(raw);
    const mapas: Record<EstadoOT, string[]> = {
      'Pendiente':  ['pendiente'],
      'En proceso': ['en proceso', 'en progreso'],
      'Cerrada':    ['cerrada', 'completada'],
      'No aplica':  ['no aplica', 'bloqueada', 'bloqueado'],
    };
    for (const [estado, aliases] of Object.entries(mapas)) {
      if (aliases.some(a => limpiar(a) === x)) return estado as EstadoOT;
    }
    // Fallback: alias más cercano (tolera 1-2 errores de tipeo)
    let mejorEstado: EstadoOT = 'Pendiente';
    let mejorDistancia = 3;
    for (const [estado, aliases] of Object.entries(mapas)) {
      for (const alias of aliases) {
        const dist = levenshtein(x, limpiar(alias));
        if (dist < mejorDistancia) {
          mejorDistancia = dist;
          mejorEstado = estado as EstadoOT;
        }
      }
    }
    return mejorEstado;
  };
  const normalizarPrioridad = (raw: string | undefined): PrioridadOT => {
    const x = limpiar(raw);
    const mapas: Record<PrioridadOT, string[]> = {
      'Alta':  ['alta', 'high'],
      'Media': ['media', 'medium', 'normal'],
      'Baja':  ['baja', 'low'],
    };
    for (const [prioridad, aliases] of Object.entries(mapas)) {
      if (aliases.some(a => limpiar(a) === x)) return prioridad as PrioridadOT;
    }
    // Fallback: alias más cercano (tolera 1-2 errores de tipeo)
    let mejorPrioridad: PrioridadOT = 'Media';
    let mejorDistancia = 3;
    for (const [prioridad, aliases] of Object.entries(mapas)) {
      for (const alias of aliases) {
        const dist = levenshtein(x, limpiar(alias));
        if (dist < mejorDistancia) {
          mejorDistancia = dist;
          mejorPrioridad = prioridad as PrioridadOT;
        }
      }
    }
    return mejorPrioridad;
  };
  const normalizarRiesgo = (raw: string | undefined): OrdenLocal['nivel_riesgo'] => {
    const x = limpiar(raw);
    const mapas: Record<NonNullable<OrdenLocal['nivel_riesgo']>, string[]> = {
      'Bajo':    ['bajo'],
      'Medio':   ['medio'],
      'Alto':    ['alto'],
      'Extremo': ['extremo'],
    };
    for (const [nivel, aliases] of Object.entries(mapas)) {
      if (aliases.some(a => limpiar(a) === x)) return nivel as OrdenLocal['nivel_riesgo'];
    }
    // Fallback: buscar alias más cercano (tolera 1-2 errores de tipeo)
    let mejorNivel: OrdenLocal['nivel_riesgo'] = null;
    let mejorDistancia = 3; // umbral máximo
    for (const [nivel, aliases] of Object.entries(mapas)) {
      for (const alias of aliases) {
        const dist = levenshtein(x, limpiar(alias));
        if (dist < mejorDistancia) {
          mejorDistancia = dist;
          mejorNivel = nivel as OrdenLocal['nivel_riesgo'];
        }
      }
    }
    return mejorNivel;
  };

  // Normaliza fecha a YYYY-MM-DD. Acepta:
  //  - ISO ya correcto (YYYY-MM-DD), descartando timestamp si viene con hora
  //  - DD/MM/YYYY o DD-MM-YYYY (formato Paraguay)
  // Cualquier otro formato → undefined (no persistir basura).
  const normalizarFecha = (raw: string | undefined): string | undefined => {
    if (!raw?.trim()) return undefined;
    const soloFecha = raw.trim().split(/[T\s]/)[0];
    if (/^\d{4}-\d{2}-\d{2}$/.test(soloFecha)) return soloFecha;
    const m = soloFecha.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    return undefined;
  };

  const RUBROS_CANONICOS = [
    'Impermeabilización', 'Eléctrica', 'Plomería', 'Aire Acondicionado',
    'Vidrios', 'Herrería', 'Pintura', 'Albañilería', 'Carpintería', 'Jardinería',
    'Limpieza', 'Seguridad', 'Ascensores', 'Gas', 'Red contra incendio',
    'Aislación', 'PCI', 'Climatización', 'Sanitarios', 'Estructura', 'Revestimientos',
  ];

  // Match contra el catálogo canónico ignorando case y tildes. Si no matchea
  // devuelve el string original (puede ser un rubro personalizado del proyecto).
  const normalizarRubroImport = (raw: string | undefined): string => {
    if (!raw?.trim()) return '';
    const t = raw.trim();
    const stripDiacritics = (s: string) =>
      s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const exacto = RUBROS_CANONICOS.find(
      r => r.toLowerCase() === t.toLowerCase() ||
           stripDiacritics(r) === stripDiacritics(t)
    );
    if (exacto) return exacto;
    return t;
  };

  const handleImportar = async (filas: ImportedRow[]): Promise<{ ok: number; fail: number }> => {
    if (!proyecto) return { ok: 0, fail: 0 };

    // ── Detección de duplicados ANTES de crear ─────────────────────────────
    // Tomamos el snapshot del store con getState() (no por selector) para tener
    // el set fresco aun si este hook se invocó hace varios renders.
    const codigosExistentes = new Set(
      useOrdenesStore.getState().ordenes
        .filter(o => o.proyecto_id === proyecto.id)
        .map(o => o.ot)
    );

    // Sugiere el próximo código libre: parsea el número del código original,
    // incrementa hasta encontrar uno no usado, y lo reserva en el set para que
    // dos filas duplicadas en el mismo CSV no terminen renombradas al mismo valor.
    const siguienteCodigo = (codigo: string): string => {
      const num = parseInt(codigo.replace(/\D/g, ''), 10);
      if (isNaN(num)) return codigo + '_1';
      let siguiente = num + 1;
      while (codigosExistentes.has(String(siguiente))) siguiente++;
      codigosExistentes.add(String(siguiente)); // reservar
      return String(siguiente);
    };

    const renombres: { original: string; nuevo: string }[] = [];
    const filasAjustadas = filas.map(fila => {
      if (!fila.ot) return fila;
      if (codigosExistentes.has(fila.ot)) {
        const nuevo = siguienteCodigo(fila.ot);
        renombres.push({ original: fila.ot, nuevo });
        return { ...fila, ot: nuevo };
      }
      codigosExistentes.add(fila.ot);
      return fila;
    });

    if (renombres.length > 0) {
      // Patrón Promise + modal controlado: la Promise se resuelve cuando el
      // usuario clickea Aceptar/Cancelar, y entonces limpiamos el estado para
      // desmontar el modal en el siguiente render. El overlay del modal usa
      // z-index: 9999 para garantizar que aparezca encima del ModalImportCSV,
      // que sigue montado mientras este `await` está pendiente.
      const confirmar = await new Promise<boolean>(resolve => {
        setModalDuplicados({
          renombres,
          resolver: (aceptar) => {
            setModalDuplicados(null);
            resolve(aceptar);
          },
        });
      });
      if (!confirmar) return { ok: 0, fail: 0 };
    }

    let ok = 0; let fail = 0;
    const idsCreados: string[] = [];
    for (const fila of filasAjustadas) {
      if (!fila.ot) { fail++; continue; }
      const now = new Date().toISOString();
      try {
        const idCreado = await crearOrdenDesdeImport({
          ot:                         fila.ot,
          proyecto_id:                proyecto.id,
          plano_ref_url:              proyecto.plano_url,
          ubicacion:                  '',
          rubro:                      normalizarRubroImport(fila.rubro),
          rubro_secundario:           fila.rubro_secundario ?? [],
          estado:                     normalizarEstado(fila.estado),
          responsable:                fila.responsable ?? '',
          prioridad:                  normalizarPrioridad(fila.prioridad),
          comentarios:                fila.comentarios ?? '',
          descripcion:                fila.descripcion ?? undefined,
          obra:                       fila.obra ?? undefined,
          unidad_amenities:           fila.unidad_amenities ?? undefined,
          // Las OTs importadas SIEMPRE arrancan sin ubicar — pos_x/pos_y se
          // asignan al arrastrar la card desde el panel al plano. Cast porque
          // OrdenLocal declara `number` pero el flujo CSV/runtime acepta null.
          pos_x:                      null as unknown as number,
          pos_y:                      null as unknown as number,
          nivel_riesgo:               normalizarRiesgo(fila.nivel_riesgo),
          contratistas:               fila.contratistas ?? [],
          fecha_ingreso:              normalizarFecha(fila.fecha_ingreso),
          fecha_inicio_trabajos:      normalizarFecha(fila.fecha_inicio_trabajos),
          fecha_fin_trabajos:         normalizarFecha(fila.fecha_fin_trabajos),
          porcentaje_avance:          fila.porcentaje_avance ?? 0,
          costo:                      fila.costo ?? undefined,
          en_garantia:                fila.en_garantia ?? false,
          asiste_facility:            fila.asiste_facility ?? false,
          reincidencia:               fila.reincidencia ?? false,
          potencialmente_conflictivo: fila.potencialmente_conflictivo ?? false,
          campos:                     fila.campos ?? {},
          conflict_flag:              false,
          created_at:                 now,
          updated_at:                 now,
          created_by:                 null,
          updated_by:                 null,
          fotos_pendientes_upload:    [],
        });
        idsCreados.push(idCreado);
        ok++;
      } catch (err) {
        console.error('[useAccionesProyecto] error en crearOrdenDesdeImport:', err);
        fail++;
      }
    }
    // Registrar las OTs recién importadas como "pendientes de completar".
    // El guard de navegación en App.tsx las consulta para bloquear cambios de
    // vista hasta que el usuario las ubique + cargue fotos válidas (o cancele).
    if (idsCreados.length > 0) {
      useOrdenesStore.getState().setOtsPendientesImport(idsCreados);
    }
    if (fail > 0) {
      mostrar(`Importación: ${ok} OTs creadas, ${fail} fallaron.`, 'error');
    } else if (ok > 0) {
      mostrar(`${ok} OT${ok !== 1 ? 's' : ''} importada${ok !== 1 ? 's' : ''}.`, 'success');
    }
    return { ok, fail };
  };

  // ── Guardar versión ───────────────────────────────────────────────────────
  const abrirGuardarVersion = () => {
    const fecha = new Date().toLocaleDateString('es-PY', {
      day: '2-digit', month: '2-digit', year: 'numeric',
    });
    setNombreVersion(`v${fecha} — ${ordenes.length} OTs`);
    setModalVersion(true);
  };

  const handleGuardarVersion = async () => {
    if (!proyecto || !nombreVersion.trim()) return;
    setGuardandoVersion(true);
    const resultado = await svcGuardarVersion(proyecto.id, nombreVersion, null, ordenes);
    setGuardandoVersion(false);
    setModalVersion(false);
    if (resultado) mostrar(`Versión "${resultado.nombre}" guardada.`, 'success');
    else            mostrar('Error al guardar la versión. Revisá la consola.', 'error');
  };

  // ── Historial ─────────────────────────────────────────────────────────────
  const abrirHistorial = async () => {
    if (!proyecto) return;
    setModalHistorial(true);
    setCargandoVersiones(true);
    const lista = await listarVersiones(proyecto.id);
    setVersiones(lista);
    setCargandoVersiones(false);
  };

  const handleEliminarVersion = async (versionId: string, nombre: string) => {
    if (!confirm(`¿Eliminar la versión "${nombre}"? Esta acción no se puede deshacer.`)) return;
    const ok = await eliminarVersion(versionId);
    if (ok) {
      setVersiones(prev => prev.filter(v => v.id !== versionId));
      mostrar('Versión eliminada.', 'success');
    } else {
      mostrar('No se pudo eliminar la versión (solo supervisores pueden hacerlo).', 'error');
    }
  };

  // ── Comparador ────────────────────────────────────────────────────────────
  const abrirComparador = () => setComparadorAbierto(true);

  // ── JSX de modales ────────────────────────────────────────────────────────
  const modales = (
    <>
      {/* Wizard de importación CSV — manejo de archivo + mapeo + preview */}
      {mostrarModalImport && proyecto && (
        <ModalImportCSV
          proyectoId={proyecto.id}
          onCerrar={() => setMostrarModalImport(false)}
          onImportar={handleImportar}
        />
      )}

      {/* Modal de confirmación de duplicados — se monta encima del Import */}
      {modalDuplicados && (
        <ModalDuplicadosOT
          renombres={modalDuplicados.renombres}
          onConfirmar={modalDuplicados.resolver}
        />
      )}

      {/* Guardar versión */}
      {modalVersion && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalBox}>
            <h3 className={styles.modalTitle}>💾 Guardar versión</h3>
            <p style={{ fontSize: 12, color: '#A89985', margin: 0 }}>
              Se guardará un snapshot de las {ordenes.length} OTs actuales.
            </p>
            <input
              className={styles.modalInput}
              value={nombreVersion}
              onChange={e => setNombreVersion(e.target.value)}
              placeholder="Nombre de la versión…"
              autoFocus
              onKeyDown={e => { if (e.key === 'Enter') handleGuardarVersion(); }}
            />
            <div className={styles.modalAcciones}>
              <button className={styles.modalBtnCancel}
                onClick={() => setModalVersion(false)} disabled={guardandoVersion}>
                Cancelar
              </button>
              <button className={styles.modalBtnVersion}
                onClick={handleGuardarVersion}
                disabled={guardandoVersion || !nombreVersion.trim()}>
                {guardandoVersion ? 'Guardando…' : 'Guardar versión'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Historial de versiones */}
      {modalHistorial && (
        <div className={styles.modalOverlay}>
          <div className={`${styles.modalBox} ${styles.historialBox}`}>
            <h3 className={styles.modalTitle}>🕐 Historial de versiones</h3>

            {cargandoVersiones ? (
              <div className={styles.historialVacio}>Cargando versiones…</div>
            ) : versiones.length === 0 ? (
              <div className={styles.historialVacio}>
                No hay versiones guardadas aún.<br />
                Usa el botón 💾 para guardar la primera.
              </div>
            ) : (
              <div className={styles.historialLista}>
                {versiones.map(v => (
                  <div key={v.id} className={styles.versionItem}>
                    <div className={styles.versionInfo}>
                      <div className={styles.versionNombre}>{v.nombre}</div>
                      <div className={styles.versionMeta}>
                        <span>{formatFecha(v.created_at)}</span>
                        <span className={styles.versionTotal}>
                          {(v.snapshot as { total?: number }).total ?? '?'} OTs
                        </span>
                      </div>
                    </div>
                    <div className={styles.versionAcciones}>
                      <button className={styles.btnEliminarVersion}
                        onClick={() => handleEliminarVersion(v.id, v.nombre)}
                        title="Eliminar versión">✕</button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className={styles.modalAcciones}>
              <button className={styles.modalBtnCancel}
                onClick={() => setModalHistorial(false)}>
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Comparador de versiones */}
      {comparadorAbierto && proyecto && (
        <ComparadorVersiones
          proyectoId={proyecto.id}
          planoUrl={proyecto.plano_url}
          proyectoNombre={proyecto.nombre}
          onCerrar={() => setComparadorAbierto(false)}
        />
      )}

      {/* Toast — feedback de las acciones (export, import, version, etc.) */}
      {ToastComponent}
    </>
  );

  return {
    acciones: {
      exportarCSV,
      exportarOtproj,
      abrirImportarCSV,
      abrirGuardarVersion,
      abrirHistorial,
      abrirComparador,
    },
    cargando,
    modales,
  };
}
