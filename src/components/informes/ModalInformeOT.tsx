import { registrarExportacion } from '../../services/trustService';
// src/components/informes/ModalInformeOT.tsx
//
// Modal fullscreen para previsualizar/exportar informes de OT. Soporta 5
// tipos: 'cierre' | 'orden_servicio' | 'relevamiento' | 'avance' | 'acta'.
//
// Layout: panel izquierdo (datos read-only + observaciones editable + opciones),
// panel derecho (iframe srcdoc con el HTML generado).
//
// Cada borrador empieza con su texto propio; los comentarios de transición
// permanecen en el historial y no se incorporan como hechos aprobados.
// Las fotos se muestran solo en la fase que corresponde a su categoría.
//
// Estrategia de actualización del preview:
// - Tipeo en observaciones → parche del bloque editable del iframe.
// - Cambio de opciones (incluirFotos), carga inicial, cambio de OT/tipo → regen
//   completa del HTML y reload del iframe via srcDoc.
//
// S33: FotoMin incluye descripcion_observacion (campo del EditorFoto).
//      Los tres mapeos de fotos ahora pasan ese campo al generador de informes.

import { useEffect, useRef, useState } from 'react';
import type { OrdenLocal } from '../../types/orden';
import {
  generarInformeCierre,
  generarInformeOrdenServicio,
  generarInformeRelevamiento,
  generarInformeAvance,
  generarInformeActaConformidad,
} from '../../services/reportService';
import type { DatosActa, DatosAvance, DatosCierre, DatosRelevamiento, OrigenOrdenServicio } from '../../services/reportService';
import { cargarFotosDeOrden } from '../../services/fotosService';
import { hacerInformePortable } from '../../services/portableReportService';
import {
  cargarBorradorDocumento, guardarBorradorDocumento, listarDocumentosDeOrden,
  reservarDocumento, type DocumentoRegistro,
} from '../../services/documentService';
import { colorEstado } from '../../utils/calculos';
import styles from './ModalInformeOT.module.css';
import { VoiceInputButton } from '../ui/VoiceInputButton';

export type TipoInforme = 'cierre' | 'orden_servicio' | 'relevamiento' | 'avance' | 'acta';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  orden: OrdenLocal;
  proyectoNombre: string;
  tipo: TipoInforme;
}

// S33: incluye descripcion_observacion para que aparezca en los informes
type FotoMin = {
  id: string;
  file_url: string;
  descripcion?: string | null;
  descripcion_observacion?: string | null;
};

interface TipoCfg {
  titulo: string;
  tituloDoc: string;
  fileSlug: string;
  labelTextarea: string | null;       // null => textarea oculto (caso 'acta')
  placeholderTextarea: string;
  necesitaFotosAntes: boolean;
  necesitaFotosDespues: boolean;
  necesitaFotosDurante: boolean;
}

const TIPO_CFG: Record<TipoInforme, TipoCfg> = {
  cierre: {
    titulo: 'Informe de Cierre',
    tituloDoc: 'Informe de Cierre - borrador',
    fileSlug: 'Informe_Cierre_Borrador',
    labelTextarea: 'Síntesis del resultado técnico',
    placeholderTextarea: 'Resumí el resultado final; detallá pruebas y pendientes en sus campos...',
    necesitaFotosAntes: false,
    necesitaFotosDespues: true,
    necesitaFotosDurante: false,
  },
  orden_servicio: {
    titulo: 'Orden de Servicio',
    tituloDoc: 'Orden de Servicio - borrador',
    fileSlug: 'Orden_Servicio_Borrador',
    labelTextarea: 'Aclaración posterior de la solicitud',
    placeholderTextarea: 'Solo si el pedido original fue aclarado después de recibirlo...',
    necesitaFotosAntes: true,
    necesitaFotosDespues: false,
    necesitaFotosDurante: false,
  },
  relevamiento: {
    titulo: 'Informe de Relevamiento',
    tituloDoc: 'Informe de Relevamiento - borrador',
    fileSlug: 'Informe_Relevamiento_Borrador',
    labelTextarea: 'Diagnóstico Inicial',
    placeholderTextarea: 'Detallá el diagnóstico técnico inicial...',
    necesitaFotosAntes: true,
    necesitaFotosDespues: false,
    necesitaFotosDurante: false,
  },
  avance: {
    titulo: 'Informe de Avance',
    tituloDoc: 'Informe de Avance - borrador',
    fileSlug: 'Informe_Avance_Borrador',
    labelTextarea: 'Estado Actual del Trabajo',
    placeholderTextarea: 'Describí el progreso actual de los trabajos...',
    necesitaFotosAntes: false,
    necesitaFotosDespues: false,
    necesitaFotosDurante: true,
  },
  acta: {
    titulo: 'Acta de Conformidad',
    tituloDoc: 'Acta de Conformidad - borrador',
    fileSlug: 'Acta_Conformidad_Borrador',
    labelTextarea: null,
    placeholderTextarea: '',
    necesitaFotosAntes: false,
    necesitaFotosDespues: false,
    necesitaFotosDurante: false,
  },
};

function fechaCorta(fecha: string | null | undefined): string {
  if (!fecha) return '—';
  const d = new Date(fecha + 'T00:00:00');
  if (isNaN(d.getTime())) return '—';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
}

const DEBOUNCE_MS = 150;
const MAX_OBSERVACIONES = 2000;

function origenInicial(orden: OrdenLocal): OrigenOrdenServicio {
  const campo = (clave: string) => typeof orden.campos?.[clave] === 'string'
    ? String(orden.campos[clave]) : '';
  return {
    canal: campo('canal_solicitud'), fechaRecepcion: campo('fecha_solicitud'),
    solicitante: campo('solicitante'), contacto: campo('contacto_solicitante'),
    referencia: campo('referencia_solicitud'), urgencia: campo('urgencia_solicitada'),
    proximoPaso: campo('proximo_paso'),
  };
}

function origenGuardado(valor: unknown, inicial: OrigenOrdenServicio): OrigenOrdenServicio {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) return inicial;
  const objeto = valor as Record<string, unknown>;
  const resultado = { ...inicial };
  for (const clave of Object.keys(resultado) as (keyof OrigenOrdenServicio)[]) {
    if (typeof objeto[clave] === 'string') resultado[clave] = objeto[clave];
  }
  return resultado;
}

const RELEVAMIENTO_INICIAL: DatosRelevamiento = {
  modalidad: '', fechaIntervencion: '', tecnico: '', participantes: '',
  condiciones: '', hallazgos: '', pruebas: '', alcance: '',
  exclusiones: '', criterios: '', decisionAlcance: '',
};

function relevamientoGuardado(valor: unknown): DatosRelevamiento {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) return { ...RELEVAMIENTO_INICIAL };
  const objeto = valor as Record<string, unknown>;
  const resultado = { ...RELEVAMIENTO_INICIAL };
  for (const clave of Object.keys(resultado) as (keyof DatosRelevamiento)[]) {
    if (typeof objeto[clave] === 'string') resultado[clave] = String(objeto[clave]).slice(0, 1200);
  }
  return resultado;
}

const CAMPOS_RELEVAMIENTO: [keyof DatosRelevamiento, string][] = [
  ['modalidad', 'Modalidad: visita o remota'], ['fechaIntervencion', 'Fecha de intervención'],
  ['tecnico', 'Técnico interviniente'], ['participantes', 'Participantes'],
  ['condiciones', 'Condiciones y límites de observación'],
  ['hallazgos', 'Hallazgos y evidencia relacionada'],
  ['pruebas', 'Pruebas y mediciones realizadas'],
  ['alcance', 'Alcance propuesto'], ['exclusiones', 'Exclusiones y supuestos'],
  ['criterios', 'Criterios de aceptación propuestos'],
  ['decisionAlcance', 'Estado declarado del alcance'],
];

const AVANCE_INICIAL: DatosAvance = {
  periodoDesde: '', periodoHasta: '', alcanceReferencia: '', acumulado: '',
  porcentaje: '', metodoPorcentaje: '', desvios: '', proximoPeriodo: '',
};

function avanceGuardado(valor: unknown): DatosAvance {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) return { ...AVANCE_INICIAL };
  const objeto = valor as Record<string, unknown>;
  const resultado = { ...AVANCE_INICIAL };
  for (const clave of Object.keys(resultado) as (keyof DatosAvance)[]) {
    if (typeof objeto[clave] === 'string') resultado[clave] = String(objeto[clave]).slice(0, 1200);
  }
  return resultado;
}

const CAMPOS_AVANCE: [keyof DatosAvance, string][] = [
  ['periodoDesde', 'Período desde'], ['periodoHasta', 'Corte hasta'],
  ['alcanceReferencia', 'Alcance aprobado: código y revisión'],
  ['acumulado', 'Acumulado y saldo por ítem'],
  ['porcentaje', 'Porcentaje declarado al corte'],
  ['metodoPorcentaje', 'Método y base del porcentaje'],
  ['desvios', 'Desvíos, impacto y acciones'],
  ['proximoPeriodo', 'Próximo período y dependencias'],
];

const CIERRE_INICIAL: DatosCierre = {
  alcanceReferencia: '', cambiosAprobados: '', inicioReal: '', finReal: '',
  ejecucionPorItem: '', verificacion: '', pendientes: '', entregables: '',
  conclusion: '', autorizacionInterna: '',
};

function cierreGuardado(valor: unknown): DatosCierre {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) return { ...CIERRE_INICIAL };
  const objeto = valor as Record<string, unknown>;
  const resultado = { ...CIERRE_INICIAL };
  for (const clave of Object.keys(resultado) as (keyof DatosCierre)[]) {
    if (typeof objeto[clave] === 'string') resultado[clave] = String(objeto[clave]).slice(0, 1200);
  }
  return resultado;
}

const CAMPOS_CIERRE: [keyof DatosCierre, string][] = [
  ['alcanceReferencia', 'Alcance aprobado: código y revisión'],
  ['cambiosAprobados', 'Cambios aprobados: referencias'],
  ['inicioReal', 'Inicio real'], ['finReal', 'Fin real'],
  ['ejecucionPorItem', 'Ejecución final por ítem'],
  ['verificacion', 'Criterio, método, resultado, verificador y fecha'],
  ['pendientes', 'Pendientes, restricciones y acciones'],
  ['entregables', 'Entregables efectivamente entregados'],
  ['conclusion', 'Conclusión técnica declarada'],
  ['autorizacionInterna', 'Autorización interna: actor y referencia'],
];

const ACTA_INICIAL: DatosActa = {
  cierreReferencia: '', objetoEntrega: '', anexosEntregados: '', receptor: '',
  organizacion: '', cargo: '', facultad: '', decisionPreparada: '',
  reservas: '', garantiaReferencia: '', garantiaCondiciones: '',
};

function actaGuardada(valor: unknown): DatosActa {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) return { ...ACTA_INICIAL };
  const objeto = valor as Record<string, unknown>;
  const resultado = { ...ACTA_INICIAL };
  for (const clave of Object.keys(resultado) as (keyof DatosActa)[]) {
    if (typeof objeto[clave] === 'string') resultado[clave] = String(objeto[clave]).slice(0, 1200);
  }
  return resultado;
}

const CAMPOS_ACTA: [keyof DatosActa, string][] = [
  ['cierreReferencia', 'Cierre técnico: código y revisión'],
  ['objetoEntrega', 'Objeto breve de la entrega'],
  ['anexosEntregados', 'Documentos y anexos entregados'],
  ['receptor', 'Receptor previsto'], ['organizacion', 'Organización'],
  ['cargo', 'Cargo o calidad'], ['facultad', 'Facultad para recibir'],
  ['reservas', 'Reservas propuestas y tratamiento'],
  ['garantiaReferencia', 'Garantía: referencia contractual'],
  ['garantiaCondiciones', 'Cobertura, inicio, duración y exclusiones'],
];

export function ModalInformeOT({ isOpen, onClose, orden, proyectoNombre, tipo }: Props) {
  const cfg = TIPO_CFG[tipo];
  const necesitaFotos =
    cfg.necesitaFotosAntes || cfg.necesitaFotosDespues || cfg.necesitaFotosDurante;
  const muestraTextarea = cfg.labelTextarea !== null;

  const [observaciones, setObservaciones] = useState('');
  const [origenServicio, setOrigenServicio] = useState<OrigenOrdenServicio>(() => origenInicial(orden));
  const [datosRelevamiento, setDatosRelevamiento] = useState<DatosRelevamiento>({ ...RELEVAMIENTO_INICIAL });
  const [datosAvance, setDatosAvance] = useState<DatosAvance>({ ...AVANCE_INICIAL });
  const [datosCierre, setDatosCierre] = useState<DatosCierre>({ ...CIERRE_INICIAL });
  const [datosActa, setDatosActa] = useState<DatosActa>({ ...ACTA_INICIAL });
  const [cargandoComentario, setCargandoComentario] = useState(true);
  const [htmlPreview, setHtmlPreview] = useState('');
  const [generandoPreview, setGenerandoPreview] = useState(false);
  const [incluirFotos, setIncluirFotos] = useState(true);
  const [fotosAntes, setFotosAntes] = useState<FotoMin[]>([]);
  const [fotosDespues, setFotosDespues] = useState<FotoMin[]>([]);
  const [fotosDurante, setFotosDurante] = useState<FotoMin[]>([]);
  const [fotoIds, setFotoIds] = useState<string[]>([]);
  const [errorInforme, setErrorInforme] = useState<string | null>(null);
  const [documento, setDocumento] = useState<DocumentoRegistro | null>(null);
  const [documentosTipo, setDocumentosTipo] = useState<DocumentoRegistro[]>([]);
  const [seleccionId, setSeleccionId] = useState<string | null>(null);
  const [versionBorrador, setVersionBorrador] = useState(0);
  const [guardado, setGuardado] = useState<string | null>(null);
  const [persistenciaDisponible, setPersistenciaDisponible] = useState(false);
  const [guardandoBorrador, setGuardandoBorrador] = useState(false);
  const [errorBorrador, setErrorBorrador] = useState<string | null>(null);
  const solicitudGuardadoRef = useRef<{ id: string; datos: string; version: number } | null>(null);
  const solicitudReservaRef = useRef<string | null>(null);

  const firstRenderRef = useRef(true);
  const prevIncluirFotosRef = useRef(incluirFotos);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const [previewAncho, setPreviewAncho] = useState(794);
  const [previewAlto, setPreviewAlto] = useState(1123);

  useEffect(() => {
    if (!isOpen || !previewRef.current) return;
    const panel = previewRef.current;
    let frame = 0;
    const medir = () => {
      const ancho = Math.max(1, panel.clientWidth - 48);
      setPreviewAncho(actual => actual === ancho ? actual : ancho);
    };
    medir();
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(medir);
    });
    observer.observe(panel);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!htmlPreview || !iframeRef.current) return;
    const iframe = iframeRef.current;
    let observer: ResizeObserver | undefined;
    let frame = 0;
    const medir = () => {
      const doc = iframe.contentDocument;
      if (!doc?.body) return;
      const origen = doc.body.getBoundingClientRect().top;
      const altoContenido = Array.from(doc.body.children).reduce((alto, elemento) => {
        const rect = elemento.getBoundingClientRect();
        return Math.max(alto, rect.bottom - origen);
      }, 0);
      const alto = Math.max(1123, Math.ceil(altoContenido + 8));
      setPreviewAlto(actual => actual === alto ? actual : alto);
    };
    const alCargar = () => {
      observer?.disconnect();
      const doc = iframe.contentDocument;
      if (!doc) return;
      medir();
      observer = new ResizeObserver(() => {
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(medir);
      });
      observer.observe(doc.documentElement);
      if (doc.body) observer.observe(doc.body);
    };
    iframe.addEventListener('load', alCargar);
    if (iframe.contentDocument?.readyState === 'complete') alCargar();
    return () => {
      iframe.removeEventListener('load', alCargar);
      observer?.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [htmlPreview]);

  const escalaPreview = Math.min(1, previewAncho / 794);

  // Reset de flags al cambiar de OT o tipo
  useEffect(() => {
    firstRenderRef.current = true;
    setHtmlPreview('');
    setPreviewAlto(1123);
    setObservaciones('');
    setOrigenServicio(origenInicial(orden));
    setDatosRelevamiento({ ...RELEVAMIENTO_INICIAL });
    setDatosAvance({ ...AVANCE_INICIAL });
    setDatosCierre({ ...CIERRE_INICIAL });
    setDatosActa({ ...ACTA_INICIAL });
    setFotosAntes([]);
    setFotosDespues([]);
    setFotosDurante([]);
    setFotoIds([]);
    setErrorInforme(null);
    setDocumento(null);
    setDocumentosTipo([]);
    setSeleccionId(null);
    setVersionBorrador(0);
    setGuardado(null);
    setPersistenciaDisponible(false);
    setErrorBorrador(null);
    solicitudGuardadoRef.current = null;
    solicitudReservaRef.current = null;
    // Se reinicia solo al cambiar la identidad de la OT o el tipo de documento.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orden.id, tipo]);

  const construirHtml = (textoActual: string): string => {
    const codigoDocumento = documento?.codigo;
    const seleccion = new Set(fotoIds);
    const fa  = incluirFotos ? fotosAntes.filter(f => seleccion.has(f.id)) : [];
    const fd  = incluirFotos ? fotosDespues.filter(f => seleccion.has(f.id)) : [];
    const fdu = incluirFotos ? fotosDurante.filter(f => seleccion.has(f.id)) : [];
    switch (tipo) {
      case 'cierre':
        return generarInformeCierre(orden, proyectoNombre, textoActual, fa, fd, datosCierre, codigoDocumento);
      case 'orden_servicio':
        return generarInformeOrdenServicio(orden, textoActual, origenServicio, codigoDocumento, fa);
      case 'relevamiento':
        return generarInformeRelevamiento(orden, textoActual, fa, datosRelevamiento, codigoDocumento);
      case 'avance':
        return generarInformeAvance(orden, textoActual, fa, fdu, datosAvance, codigoDocumento);
      case 'acta':
        return generarInformeActaConformidad(orden, datosActa, codigoDocumento);
    }
  };

  // Carga inicial: comentario + fotos
  useEffect(() => {
    if (!isOpen) return;
    let cancelado = false;
    setCargandoComentario(true);

    const promFotos = necesitaFotos
      ? cargarFotosDeOrden(orden.id)
      : Promise.resolve([] as Awaited<ReturnType<typeof cargarFotosDeOrden>>);
    const promBorrador = listarDocumentosDeOrden(orden.id).then(async documentos => {
      const disponibles = documentos.filter(d => d.tipo === tipo && d.ciclo === 1);
      const vigente = seleccionId === 'nuevo' ? null
        : seleccionId ? disponibles.find(d => d.id === seleccionId) ?? null
          : disponibles.at(-1) ?? null;
      const borrador = vigente ? await cargarBorradorDocumento(vigente.id) : null;
      return { vigente, borrador, disponibles };
    });

    Promise.all([promFotos, promBorrador])
      .then(([fotos, resultado]) => {
        if (cancelado) return;
        const datos = resultado?.borrador?.datos;
        const texto = typeof datos?.observaciones === 'string'
          ? datos.observaciones.slice(0, MAX_OBSERVACIONES) : '';
        const origen = origenGuardado(datos?.origen, origenInicial(orden));
        const relevamiento = relevamientoGuardado(datos?.relevamiento);
        const avance = avanceGuardado(datos?.avance);
        const cierre = cierreGuardado(datos?.cierre);
        const acta = actaGuardada(datos?.acta);
        const elegibles = fotos.filter(f =>
          (cfg.necesitaFotosAntes && f.categoria === 'ANTES') ||
          (cfg.necesitaFotosDurante && f.categoria === 'DURANTE') ||
          (cfg.necesitaFotosDespues && f.categoria === 'DESPUES'));
        const idsGuardados = Array.isArray(datos?.fotoIds)
          ? datos.fotoIds.filter((id): id is string => typeof id === 'string').slice(0, 500)
          : resultado?.borrador && datos?.incluirFotos !== false
            ? elegibles.map(f => f.id) : [];
        const idsFotos = [...new Set(idsGuardados)];
        setObservaciones(texto);
        setOrigenServicio(origen);
        setDatosRelevamiento(relevamiento);
        setDatosAvance(avance);
        setDatosCierre(cierre);
        setDatosActa(acta);
        setFotoIds(idsFotos);
        setIncluirFotos(typeof datos?.incluirFotos === 'boolean' ? datos.incluirFotos : true);
        setDocumento(resultado?.vigente ?? null);
        setDocumentosTipo(resultado?.disponibles ?? []);
        setVersionBorrador(resultado?.borrador?.version ?? 0);
        setGuardado(JSON.stringify({ observaciones: texto,
          incluirFotos: datos?.incluirFotos !== false,
          ...(necesitaFotos ? { fotoIds: idsFotos } : {}),
          ...(tipo === 'orden_servicio' ? { origen } : {}),
          ...(tipo === 'relevamiento' ? { relevamiento } : {}),
          ...(tipo === 'avance' ? { avance } : {}),
          ...(tipo === 'cierre' ? { cierre } : {}),
          ...(tipo === 'acta' ? { acta } : {}) }));
        setPersistenciaDisponible(resultado !== null);

        // S33: mapeo incluye descripcion_observacion además de descripcion
        if (cfg.necesitaFotosAntes) {
          setFotosAntes(
            fotos
              .filter(f => f.categoria === 'ANTES')
              .map(f => ({
                id: f.id,
                file_url: f.url,
                descripcion: f.descripcion ?? null,
                descripcion_observacion: f.descripcion_observacion ?? null,
              })),
          );
        }
        if (cfg.necesitaFotosDespues) {
          setFotosDespues(
            fotos
              .filter(f => f.categoria === 'DESPUES')
              .map(f => ({
                id: f.id,
                file_url: f.url,
                descripcion: f.descripcion ?? null,
                descripcion_observacion: f.descripcion_observacion ?? null,
              })),
          );
        }
        if (cfg.necesitaFotosDurante) {
          setFotosDurante(
            fotos
              .filter(f => f.categoria === 'DURANTE')
              .map(f => ({
                id: f.id,
                file_url: f.url,
                descripcion: f.descripcion ?? null,
                descripcion_observacion: f.descripcion_observacion ?? null,
              })),
          );
        }
        setCargandoComentario(false);
      })
      .catch(err => {
        console.error('[ModalInformeOT] carga inicial:', err);
        if (!cancelado) {
          setErrorBorrador(err instanceof Error ? err.message : 'No se pudo cargar el borrador.');
          setPersistenciaDisponible(false);
          setCargandoComentario(false);
        }
      });
    return () => {
      cancelado = true;
    };
    // No volver a cargar al recibir actualizaciones de la misma OT: preserva lo editado.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, orden.id, tipo, seleccionId, necesitaFotos, cfg.necesitaFotosAntes, cfg.necesitaFotosDespues, cfg.necesitaFotosDurante]);

  // Regeneración del preview ante cambios que requieren rebuild completo
  useEffect(() => {
    if (!isOpen || cargandoComentario) return;
    const incluirFotosCambio = prevIncluirFotosRef.current !== incluirFotos;
    prevIncluirFotosRef.current = incluirFotos;
    const delay = firstRenderRef.current || incluirFotosCambio ? 0 : DEBOUNCE_MS;
    firstRenderRef.current = false;
    setGenerandoPreview(true);
    let cancelado = false;
    const t = window.setTimeout(() => {
      hacerInformePortable(construirHtml(observaciones))
        .then(result => {
          if (cancelado) return;
          setHtmlPreview(result.html);
          setErrorInforme(result.missingImages ? `${result.missingImages} imagen(es) no pudieron incorporarse y se reemplazaron por un aviso.` : null);
        })
        .catch(error => { if (!cancelado) setErrorInforme(error instanceof Error ? error.message : 'No se pudo preparar el informe.'); })
        .finally(() => { if (!cancelado) setGenerandoPreview(false); });
    }, delay);
    return () => {
      cancelado = true;
      window.clearTimeout(t);
    };
    // `observaciones` fuera de deps a propósito — se parchea el DOM directamente
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isOpen,
    cargandoComentario,
    incluirFotos,
    fotosAntes,
    fotosDespues,
    fotosDurante,
    fotoIds,
    orden,
    proyectoNombre,
    tipo,
    documento,
  ]);

  if (!isOpen) return null;

  const handleActualizarAhora = async () => {
    if (cargandoComentario) return;
    setGenerandoPreview(true);
    try {
      const result = await hacerInformePortable(construirHtml(observaciones));
      setHtmlPreview(result.html);
      setErrorInforme(result.missingImages ? `${result.missingImages} imagen(es) no pudieron incorporarse y se reemplazaron por un aviso.` : null);
    } catch (error) {
      setErrorInforme(error instanceof Error ? error.message : 'No se pudo preparar el informe.');
    } finally { setGenerandoPreview(false); }
  };

  const datosBorrador = { observaciones, incluirFotos,
    ...(necesitaFotos ? { fotoIds } : {}),
    ...(tipo === 'orden_servicio' ? { origen: origenServicio } : {}),
    ...(tipo === 'relevamiento' ? { relevamiento: datosRelevamiento } : {}),
    ...(tipo === 'avance' ? { avance: datosAvance } : {}),
    ...(tipo === 'cierre' ? { cierre: datosCierre } : {}),
    ...(tipo === 'acta' ? { acta: datosActa } : {}) };
  const cambiosBorrador = guardado !== JSON.stringify(datosBorrador);
  const tipoRepetible = tipo === 'relevamiento' || tipo === 'avance';
  const fotosElegibles = [
    ...fotosAntes.map(foto => ({ ...foto, fase: 'Antes' })),
    ...fotosDurante.map(foto => ({ ...foto, fase: 'Durante' })),
    ...fotosDespues.map(foto => ({ ...foto, fase: 'Después' })),
  ];
  const idsElegibles = new Set(fotosElegibles.map(foto => foto.id));
  const fotosFaltantes = fotoIds.filter(id => !idsElegibles.has(id));

  const cambiarDocumento = (id: string) => {
    if (cargandoComentario || guardandoBorrador || cambiosBorrador) return;
    setCargandoComentario(true);
    setHtmlPreview('');
    setErrorInforme(null);
    setErrorBorrador(null);
    solicitudGuardadoRef.current = null;
    solicitudReservaRef.current = null;
    setSeleccionId(id);
  };

  const handleGuardarBorrador = async () => {
    if (cargandoComentario || guardandoBorrador || !persistenciaDisponible) return;
    const datos = datosBorrador;
    const contenido = JSON.stringify(datos);
    const intento = solicitudGuardadoRef.current;
    const solicitud = intento?.datos === contenido && intento.version === versionBorrador
      ? intento.id : crypto.randomUUID();
    solicitudGuardadoRef.current = { id: solicitud, datos: contenido, version: versionBorrador };
    setGuardandoBorrador(true);
    setErrorBorrador(null);
    try {
      const reserva = solicitudReservaRef.current ?? crypto.randomUUID();
      solicitudReservaRef.current = reserva;
      const vigente = documento ?? await reservarDocumento(orden.id, tipo, 1, reserva);
      setDocumento(vigente);
      const borrador = await guardarBorradorDocumento(vigente.id, datos, versionBorrador, solicitud);
      setVersionBorrador(borrador.version);
      setGuardado(JSON.stringify(datos));
      if (!documento && tipoRepetible) setSeleccionId(vigente.id);
      solicitudGuardadoRef.current = null;
    } catch (error) {
      setErrorBorrador(error instanceof Error ? error.message : 'No se pudo guardar el borrador.');
    } finally {
      setGuardandoBorrador(false);
    }
  };

  const handleExportarHTML = async () => {
    if (cargandoComentario) return;
    setGenerandoPreview(true);
    try {
      if (incluirFotos && fotosFaltantes.length) throw new Error(`${fotosFaltantes.length} foto(s) seleccionadas ya no están disponibles. Revisá la evidencia antes de exportar.`);
      const result = await hacerInformePortable(construirHtml(observaciones));
      if (result.missingImages) throw new Error(`${result.missingImages} imagen(es) no están disponibles. No se descarga un borrador incompleto.`);
      await registrarExportacion(orden.id, tipo, 'HTML');
      const blob = new Blob([result.html], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const fecha = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `${cfg.fileSlug}_OT${orden.ot}_${fecha}.html`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
      setErrorInforme(result.missingImages ? `${result.missingImages} imagen(es) se exportaron como aviso porque no estaban disponibles.` : null);
    } catch (error) { setErrorInforme(error instanceof Error ? error.message : 'No se pudo exportar el informe.'); }
    finally { setGenerandoPreview(false); }
  };

  const handleExportarPDF = async () => {
    if (cargandoComentario) return;
    const w = window.open('', '_blank');
    if (!w) { setErrorInforme('El navegador bloqueó la ventana del PDF. Permití las ventanas emergentes para este sitio.'); return; }
    w.document.write('<p style="font-family:Arial;padding:24px">Preparando informe portable…</p>');
    setGenerandoPreview(true);
    try {
      if (incluirFotos && fotosFaltantes.length) throw new Error(`${fotosFaltantes.length} foto(s) seleccionadas ya no están disponibles. Revisá la evidencia antes de exportar.`);
      const result = await hacerInformePortable(construirHtml(observaciones));
      if (result.missingImages) throw new Error(`${result.missingImages} imagen(es) no están disponibles. No se prepara un PDF incompleto.`);
      await registrarExportacion(orden.id, tipo, 'PDF');
      w.document.open(); w.document.write(result.html); w.document.close();
      w.onload = () => { w.document.title = cfg.tituloDoc; setTimeout(() => w.print(), 250); };
      setErrorInforme(result.missingImages ? `${result.missingImages} imagen(es) no estaban disponibles para el PDF.` : null);
    } catch (error) {
      w.close(); setErrorInforme(error instanceof Error ? error.message : 'No se pudo preparar el PDF.');
    } finally { setGenerandoPreview(false); }
  };

  const actualizarRelevamiento = (clave: keyof DatosRelevamiento, valor: string) => {
    const recortado = valor.slice(0, 1200);
    setDatosRelevamiento(actual => ({ ...actual, [clave]: recortado }));
    const el = iframeRef.current?.contentDocument?.getElementById(`rel-${clave}`);
    if (el) el.textContent = recortado.trim() || 'No registrado';
  };

  const actualizarAvance = (clave: keyof DatosAvance, valor: string) => {
    if (clave === 'porcentaje' && valor !== '' && (!Number.isFinite(Number(valor)) || Number(valor) < 0 || Number(valor) > 100)) return;
    const recortado = valor.slice(0, 1200);
    setDatosAvance(actual => ({ ...actual, [clave]: recortado }));
    const el = iframeRef.current?.contentDocument?.getElementById(`av-${clave}`);
    if (el) el.textContent = recortado.trim() || 'No registrado';
  };

  const actualizarCierre = (clave: keyof DatosCierre, valor: string) => {
    const recortado = valor.slice(0, 1200);
    setDatosCierre(actual => ({ ...actual, [clave]: recortado }));
    const el = iframeRef.current?.contentDocument?.getElementById(`cie-${clave}`);
    if (el) el.textContent = recortado.trim() || 'No registrado';
  };

  const actualizarActa = (clave: keyof DatosActa, valor: string) => {
    const recortado = valor.slice(0, 1200);
    setDatosActa(actual => ({ ...actual, [clave]: recortado }));
    const el = iframeRef.current?.contentDocument?.getElementById(`act-${clave}`);
    if (el) el.textContent = recortado.trim() || 'No registrado';
  };

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        {/* HEADER */}
        <div className={styles.header}>
          <div className={styles.title}>{cfg.titulo}</div>
          <span className={`${styles.badge} ${styles.badgeOT}`}>OT {orden.ot}</span>
          <span className={styles.badge}>
            <span
              className={styles.badgeEstadoDot}
              style={{ background: colorEstado(orden.estado) }}
            />
            {orden.estado}
          </span>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={onClose}
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>

        <nav className={styles.quickNav} aria-label="Navegación del informe">
          <button type="button" onClick={() => editorRef.current?.scrollTo({ top: 0, behavior: 'smooth' })}>Datos</button>
          {muestraTextarea && <button type="button" onClick={() => editorRef.current?.querySelector('[data-report-section="texto"]')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>Texto</button>}
          {necesitaFotos && <button type="button" onClick={() => editorRef.current?.querySelector('[data-report-section="fotos"]')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>Fotos</button>}
          <button type="button" onClick={() => previewRef.current?.scrollTo({ top: 0, behavior: 'smooth' })}>Inicio de la vista previa</button>
        </nav>

        {/* BODY */}
        <div className={styles.body}>
          {/* IZQUIERDA */}
          <div className={styles.left} ref={editorRef}>
            {tipoRepetible && (
              <div className={styles.section}>
                <label className={styles.originField}>
                  <span>{tipo === 'avance' ? 'Informe de avance' : 'Informe de relevamiento'}</span>
                  <select value={seleccionId ?? documento?.id ?? 'nuevo'}
                    onChange={e => cambiarDocumento(e.target.value)}
                    disabled={cargandoComentario || guardandoBorrador || cambiosBorrador}>
                    {documentosTipo.map(doc => (
                      <option key={doc.id} value={doc.id}>
                        {doc.codigo}
                      </option>
                    ))}
                    <option value="nuevo">+ Nuevo borrador</option>
                  </select>
                </label>
                {cambiosBorrador && !cargandoComentario && (
                  <p className={styles.sublabel}>Guardá el borrador antes de cambiar de documento.</p>
                )}
              </div>
            )}
            <div className={styles.section}>
              <div className={styles.sectionTitle}>Datos</div>
              <div className={styles.dataGrid}>
                <div className={styles.dataKey}>Rubro</div>
                <div className={styles.dataVal}>{orden.rubro || '—'}</div>
                <div className={styles.dataKey}>Responsable</div>
                <div className={styles.dataVal}>{orden.responsable || '—'}</div>
                {tipo === 'orden_servicio' && (
                  <>
                    <div className={styles.dataKey}>Ingreso OT</div>
                    <div className={styles.dataVal}>{fechaCorta(orden.fecha_ingreso)}</div>
                  </>
                )}
              </div>
            </div>

            {tipo === 'orden_servicio' && (
              <div className={styles.section}>
                <div className={styles.sectionTitle}>Procedencia de la solicitud</div>
                <div className={styles.originGrid}>
                  {([
                    ['canal', 'Canal'], ['fechaRecepcion', 'Fecha y hora de recepción'],
                    ['solicitante', 'Solicitante'], ['contacto', 'Contacto'],
                    ['referencia', 'Referencia del mensaje'], ['urgencia', 'Urgencia manifestada'],
                    ['proximoPaso', 'Próximo paso'],
                  ] as [keyof OrigenOrdenServicio, string][]).map(([clave, etiqueta]) => (
                    <label className={styles.originField} key={clave}>
                      <span>{etiqueta}</span>
                      <input type="text" value={origenServicio[clave]} disabled={cargandoComentario}
                        onChange={e => {
                          const valor = e.target.value.slice(0, 300);
                          setOrigenServicio(actual => ({ ...actual, [clave]: valor }));
                          const el = iframeRef.current?.contentDocument?.getElementById(`os-${clave}`);
                          if (el) el.textContent = (clave === 'fechaRecepcion' ? valor.replace('T', ' ') : valor) || 'No registrado';
                        }}
                        maxLength={300} placeholder="No registrado" />
                    </label>
                  ))}
                </div>
                <p className={styles.sublabel}>Son datos del pedido recibido; no acreditan una visita ni un diagnóstico.</p>
              </div>
            )}

            {tipo === 'relevamiento' && (
              <div className={styles.section}>
                <div className={styles.sectionTitle}>Hechos y alcance del relevamiento</div>
                <div className={styles.originGrid}>
                  {CAMPOS_RELEVAMIENTO.slice(0, 4).map(([clave, etiqueta]) => (
                    <label className={styles.originField} key={clave}>
                      <span>{etiqueta}</span>
                      <input type="text" value={datosRelevamiento[clave]}
                        onChange={e => actualizarRelevamiento(clave, e.target.value)}
                        disabled={cargandoComentario} maxLength={1200} placeholder="No registrado" />
                    </label>
                  ))}
                </div>
                {CAMPOS_RELEVAMIENTO.slice(4).map(([clave, etiqueta]) => (
                  <label className={styles.originField} key={clave}>
                    <span>{etiqueta}</span>
                    <textarea value={datosRelevamiento[clave]}
                      onChange={e => actualizarRelevamiento(clave, e.target.value)}
                      disabled={cargandoComentario} maxLength={1200} rows={2}
                      placeholder="No registrado" />
                  </label>
                ))}
                <p className={styles.sublabel}>La aprobación del alcance requiere una decisión vinculada a una revisión; este campo solo describe el estado declarado.</p>
              </div>
            )}

            {tipo === 'avance' && (
              <div className={styles.section}>
                <div className={styles.sectionTitle}>Período, base y desvíos</div>
                <div className={styles.originGrid}>
                  {CAMPOS_AVANCE.slice(0, 3).map(([clave, etiqueta]) => (
                    <label className={styles.originField} key={clave}>
                      <span>{etiqueta}</span>
                      <input type="text" value={datosAvance[clave]}
                        onChange={e => actualizarAvance(clave, e.target.value)}
                        disabled={cargandoComentario} maxLength={1200} placeholder="No registrado" />
                    </label>
                  ))}
                  <label className={styles.originField}>
                    <span>Porcentaje declarado al corte</span>
                    <input type="number" min="0" max="100" step="0.1" value={datosAvance.porcentaje}
                      onChange={e => actualizarAvance('porcentaje', e.target.value)}
                      disabled={cargandoComentario} placeholder="0–100" />
                  </label>
                </div>
                {CAMPOS_AVANCE.filter(([clave]) => !['periodoDesde', 'periodoHasta', 'alcanceReferencia', 'porcentaje'].includes(clave))
                  .map(([clave, etiqueta]) => (
                    <label className={styles.originField} key={clave}>
                      <span>{etiqueta}</span>
                      <textarea value={datosAvance[clave]}
                        onChange={e => actualizarAvance(clave, e.target.value)}
                        disabled={cargandoComentario} maxLength={1200} rows={2}
                        placeholder="No registrado" />
                    </label>
                  ))}
                <p className={styles.sublabel}>El porcentaje no se toma de la OT: se declara para este corte y necesita método, base y alcance aprobados.</p>
              </div>
            )}

            {tipo === 'cierre' && (
              <div className={styles.section}>
                <div className={styles.sectionTitle}>Ejecución y verificación final</div>
                <div className={styles.originGrid}>
                  {CAMPOS_CIERRE.slice(0, 4).map(([clave, etiqueta]) => (
                    <label className={styles.originField} key={clave}>
                      <span>{etiqueta}</span>
                      <input type="text" value={datosCierre[clave]}
                        onChange={e => actualizarCierre(clave, e.target.value)}
                        disabled={cargandoComentario} maxLength={1200} placeholder="No registrado" />
                    </label>
                  ))}
                </div>
                {CAMPOS_CIERRE.slice(4).map(([clave, etiqueta]) => (
                  <label className={styles.originField} key={clave}>
                    <span>{etiqueta}</span>
                    <textarea value={datosCierre[clave]}
                      onChange={e => actualizarCierre(clave, e.target.value)}
                      disabled={cargandoComentario} maxLength={1200} rows={2}
                      placeholder="No registrado" />
                  </label>
                ))}
                <p className={styles.sublabel}>El cierre técnico no implica aceptación del cliente. La autorización interna debe vincularse a la revisión emitida.</p>
              </div>
            )}

            {tipo === 'acta' && (
              <div className={styles.section}>
                <div className={styles.sectionTitle}>Recepción propuesta</div>
                <div className={styles.originGrid}>
                  {CAMPOS_ACTA.filter(([clave]) => ['cierreReferencia', 'receptor', 'organizacion', 'cargo', 'facultad', 'garantiaReferencia'].includes(clave))
                    .map(([clave, etiqueta]) => (
                      <label className={styles.originField} key={clave}>
                        <span>{etiqueta}</span>
                        <input type="text" value={datosActa[clave]}
                          onChange={e => actualizarActa(clave, e.target.value)}
                          disabled={cargandoComentario} maxLength={1200} placeholder="No registrado" />
                      </label>
                    ))}
                </div>
                {CAMPOS_ACTA.filter(([clave]) => !['cierreReferencia', 'receptor', 'organizacion', 'cargo', 'facultad', 'garantiaReferencia'].includes(clave))
                  .map(([clave, etiqueta]) => (
                    <label className={styles.originField} key={clave}>
                      <span>{etiqueta}</span>
                      <textarea value={datosActa[clave]}
                        onChange={e => actualizarActa(clave, e.target.value)}
                        disabled={cargandoComentario} maxLength={1200} rows={2}
                        placeholder="No registrado" />
                    </label>
                  ))}
                <label className={styles.originField}>
                  <span>Opción preparada para decisión</span>
                  <select value={datosActa.decisionPreparada}
                    onChange={e => actualizarActa('decisionPreparada', e.target.value)}
                    disabled={cargandoComentario}>
                    <option value="">Sin preparar</option>
                    <option value="Aceptar">Aceptar</option>
                    <option value="Aceptar con reservas">Aceptar con reservas</option>
                    <option value="Rechazar">Rechazar</option>
                  </select>
                </label>
                <p className={styles.sublabel}>Esta opción no registra una decisión. Solo el receptor autorizado podrá manifestarla y firmar la revisión exacta.</p>
              </div>
            )}

            {muestraTextarea && (
              <div className={styles.section} data-report-section="texto">
                <div className={styles.voiceLabelRow}>
                  <label className={styles.label} htmlFor="obs-informe">{cfg.labelTextarea}</label>
                  <VoiceInputButton
                    value={observaciones}
                    onChange={value => {
                      const nuevoTexto = value.slice(0, MAX_OBSERVACIONES);
                      setObservaciones(nuevoTexto);
                      const doc = iframeRef.current?.contentDocument;
                      const el = doc?.getElementById('antecedentes-texto') ?? doc?.getElementById('bloque-texto-naranja');
                      if (el) el.textContent = nuevoTexto || (tipo === 'orden_servicio' ? 'Sin aclaraciones posteriores.' : 'Sin observaciones registradas.');
                      else setHtmlPreview(construirHtml(nuevoTexto));
                    }}
                    maxLength={MAX_OBSERVACIONES}
                  />
                </div>
                <div className={styles.sublabel}>
                  Texto que aparecerá en el informe. Editá libremente.
                </div>
                {cargandoComentario ? (
                  <div className={styles.skeletonLineas} aria-busy="true">
                    <div className={styles.skeletonLinea} />
                    <div className={styles.skeletonLinea} />
                    <div className={styles.skeletonLinea} />
                  </div>
                ) : (
                  <>
                    <textarea
                      id="obs-informe"
                      className={styles.textarea}
                      value={observaciones}
                      onChange={e => {
                        const nuevoTexto = e.target.value.slice(0, MAX_OBSERVACIONES);
                        setObservaciones(nuevoTexto);

                        // Patch directo del DOM del iframe — sin reload
                        const doc = iframeRef.current?.contentDocument;
                        const el =
                          doc?.getElementById('antecedentes-texto') ??
                          doc?.getElementById('bloque-texto-naranja');
                        if (el) {
                          el.textContent =
                            nuevoTexto || (tipo === 'orden_servicio' ? 'Sin aclaraciones posteriores.' : 'Sin observaciones registradas.');
                          return;
                        }

                        // Fallback: iframe aún no cargado — regen completa
                        setHtmlPreview(construirHtml(nuevoTexto));
                      }}
                      rows={7}
                      maxLength={MAX_OBSERVACIONES}
                      placeholder={cfg.placeholderTextarea}
                    />
                    <div className={styles.contador}>
                      {observaciones.length}/{MAX_OBSERVACIONES} caracteres
                    </div>
                  </>
                )}
              </div>
            )}

            {necesitaFotos && (
              <div className={styles.section} data-report-section="fotos">
                <div className={styles.sectionTitle}>Opciones</div>
                <label className={styles.checkboxRow}>
                  <input
                    type="checkbox"
                    checked={incluirFotos}
                    onChange={e => setIncluirFotos(e.target.checked)}
                  />
                  <span className={styles.checkboxText}>
                    <span className={styles.checkboxLabel}>Incluir fotos seleccionadas</span>
                    <span className={styles.sublabel}>
                      {fotoIds.length} de {fotosElegibles.length} fotos elegidas para este documento
                    </span>
                  </span>
                </label>
                {fotosElegibles.length ? (
                  <div className={styles.photoList} aria-label="Evidencia disponible para este documento">
                    {fotosElegibles.map(foto => (
                      <label className={styles.photoChoice} key={foto.id}>
                        <input type="checkbox" checked={fotoIds.includes(foto.id)}
                          disabled={cargandoComentario || !incluirFotos}
                          onChange={e => setFotoIds(actual => e.target.checked
                            ? [...actual, foto.id] : actual.filter(id => id !== foto.id))} />
                        <img src={foto.file_url} alt="" loading="lazy" />
                        <span className={styles.photoMeta}>
                          <strong>{foto.fase}</strong>
                          <span>{foto.descripcion_observacion || foto.descripcion || 'Sin descripción'}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                ) : <p className={styles.sublabel}>No hay fotos disponibles para esta fase.</p>}
                {fotosFaltantes.length > 0 && (
                  <div>
                    <p className={styles.sublabel} role="alert">
                      {fotosFaltantes.length} foto(s) elegidas ya no están disponibles. Revisá la selección antes de exportar.
                    </p>
                    <button type="button" className={styles.btnSecondary}
                      onClick={() => setFotoIds(actual => actual.filter(id => idsElegibles.has(id)))}>
                      Quitar referencias faltantes
                    </button>
                  </div>
                )}
              </div>
            )}

            <div className={styles.section}>
              <button
                type="button"
                className={styles.btnRefresh}
                onClick={handleActualizarAhora}
                disabled={cargandoComentario || generandoPreview}
              >
                Actualizar preview
              </button>
            </div>
          </div>

          {/* DERECHA */}
          <div className={styles.right} ref={previewRef}>
            <div className={styles.previewHeading}>Vista previa del documento</div>
            {htmlPreview ? (
              <div className={styles.previewSheet} style={{ width: 794 * escalaPreview, height: previewAlto * escalaPreview }}>
                <iframe
                  key={`${orden.id}-${tipo}`}
                  ref={iframeRef}
                  className={styles.iframe}
                  style={{ height: previewAlto, transform: `scale(${escalaPreview})` }}
                  srcDoc={htmlPreview}
                  sandbox="allow-same-origin"
                  scrolling="no"
                  title="Vista previa del informe"
                />
              </div>
            ) : !generandoPreview ? (
              <div className={styles.emptyState}>
                Hacé clic en <b>Actualizar preview</b>
              </div>
            ) : null}
            {generandoPreview && (
              <div className={styles.overlay}>
                <span className={styles.spinner} />
                <span>Actualizando preview...</span>
              </div>
            )}
          </div>
        </div>

        {/* FOOTER */}
        <div className={styles.footer}>
          <span className={styles.avisoImpresion}>
            {errorBorrador ?? errorInforme ?? (documento
              ? `${documento.codigo} · borrador v${versionBorrador}${cambiosBorrador ? ' · cambios sin guardar' : ''}`
              : 'Descargas de borrador. No son documentos emitidos ni aprobados.')}
          </span>
          {persistenciaDisponible && (
            <button type="button" className={styles.btnSecondary} onClick={handleGuardarBorrador}
              disabled={cargandoComentario || guardandoBorrador || (!cambiosBorrador && documento !== null)}>
              {guardandoBorrador ? 'Guardando…' : 'Guardar borrador'}
            </button>
          )}
          <button type="button" className={styles.btnCancelar} onClick={onClose}>
            Cancelar
          </button>
          <button
            type="button"
            className={styles.btnSecondary}
            onClick={handleExportarHTML}
            disabled={!htmlPreview || generandoPreview}
          >
            Descargar HTML borrador
          </button>
          <button
            type="button"
            className={styles.btnPrimary}
            onClick={handleExportarPDF}
            disabled={!htmlPreview || generandoPreview}
          >
            Imprimir PDF borrador →
          </button>
        </div>
      </div>
    </div>
  );
}
