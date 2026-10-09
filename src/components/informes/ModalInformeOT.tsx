import { EtapaCampos } from './EtapaCampos';
import { camposVacios, TIPOS_CON_PLANO, ETAPAS_OT, validarEtapa } from '../../services/otStageSchema';
import TooltipAyuda from '../ayuda/TooltipAyuda';
import { CampoTextoInforme } from './CampoTextoInforme';
import { VistaPreviaDocumento } from './VistaPreviaDocumento';
import { registrarExportacion } from '../../services/trustService';
import { borradorModificado } from '../../services/reportDraftComparison';
// src/components/informes/ModalInformeOT.tsx
//
// Modal fullscreen para previsualizar/exportar los siete borradores de una OT.
//
// Layout: editor principal con pestañas y página A4 navegable a la derecha.
// Ampliar conserva el formulario montado y todos sus datos.
//
// Precarga campos de la OT y fuentes vinculadas; las ediciones se conservan
// en el borrador. No convierte notas ni estados en aprobaciones o firmas.
// Las fotos se muestran solo en la fase que corresponde a su categoría.
//
// Estrategia de actualización del preview:
// - Cambios de campos, fotos y opciones reconstruyen el HTML con el renderizador
//   original; la paginación visual no modifica exportaciones ni revisiones.
//
// S33: FotoMin incluye descripcion_observacion (campo del EditorFoto).
//      Los tres mapeos de fotos ahora pasan ese campo al generador de informes.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAccessStore, tienePermiso } from '../../stores/accessStore';
import { useAuthStore } from '../../stores/authStore';
import type { OrdenLocal } from '../../types/orden';
import {
  generarInformeCierre,
  generarInformeOrdenServicio,
  generarFichaVisita,
  generarInformeRelevamiento,
  generarInformeAvance,
  generarInformeActaConformidad,
  generarEncuestaSatisfaccion,
} from '../../services/reportService';
import type { DatosActa, DatosAvance, DatosCierre, DatosEncuesta, DatosRelevamiento, DatosVisita, ItemAlcance, ItemAvance, ItemCierre, OrigenOrdenServicio } from '../../services/reportService';
import { cargarFotosDeOrden } from '../../services/fotosService';
import { CAMPOS_IDENTIFICACION, prepararAutocompletado, restaurarCampos, ordenParaInforme, type IdentificacionInforme } from '../../services/reportAutofillService';
import { cargarFuentesInforme } from '../../services/reportSourceService';
import { hacerInformePortable } from '../../services/portableReportService';
import {
  cargarBorradorDocumento, cargarEstadoEmision, congelarRevisionDocumento,
  descargarCandidatoVerificado, emitirCandidatoPdf, generarCandidatoPdf,
  guardarBorradorDocumento, revisarCandidatoPdf,
  listarDocumentosDeOrden, listarRevisionesDocumento, reservarDocumento,
  type AprobacionDocumento, type CandidatoDocumento, type DocumentoRegistro,
  type EmisionDocumento, type RevisionDocumento,
} from '../../services/documentService';
import { supabase } from '../../db/supabase';
import { colorEstado } from '../../utils/calculos';
import styles from './ModalInformeOT.module.css';
import { PLANTILLA_CONTROLADA_VERSION } from '../../services/controlledReportService';
import { generarContextoPlano, type PlanoContexto } from '../../services/planLocationService';

export type TipoInforme = 'cierre' | 'orden_servicio' | 'visita' | 'relevamiento' | 'avance' | 'acta' | 'encuesta';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  orden: OrdenLocal;
  proyectoNombre: string;
  tipo: TipoInforme;
  puedeRevisar?: boolean;
  soloVistaPrevia?: boolean;
  documentoInicialId?: string;
  onDocumentoChange?: (doc:DocumentoRegistro,borrador?:{datos:Record<string,unknown>;version:number},revisiones?:RevisionDocumento[])=>void;
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
  visita: {
    titulo: 'Ficha de Visita Técnica',
    tituloDoc: 'Ficha de Visita Técnica - borrador',
    fileSlug: 'Ficha_Visita_Borrador',
    labelTextarea: null,
    placeholderTextarea: '',
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
  encuesta: {
    titulo: 'Encuesta de Satisfacción',
    tituloDoc: 'Encuesta de Satisfacción - borrador',
    fileSlug: 'Encuesta_Satisfaccion_Borrador',
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

const VISITA_INICIAL: DatosVisita = {
  ...camposVacios('visita'),
  fechaVisita: '', horaInicio: '', horaFin: '', propietario: '', contacto: '',
  edificio: '', unidad: '', responsableVisita: '', participantes: '',
  descripcion: '', observacionesTecnicas: '', restricciones: '',
  compromisos: '', representantesPrevistos: '',
};

function visitaGuardada(valor: unknown, inicial: DatosVisita = VISITA_INICIAL): DatosVisita {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) return { ...inicial };
  const objeto = valor as Record<string, unknown>;
  const resultado = { ...inicial };
  for (const clave of Object.keys(resultado) as (keyof DatosVisita)[]) {
    if (typeof objeto[clave] === 'string') resultado[clave] = String(objeto[clave]);
  }
  return resultado;
}


const RELEVAMIENTO_INICIAL: DatosRelevamiento = {
  ...camposVacios('relevamiento'),
  modalidad: '', fechaIntervencion: '', tecnico: '', participantes: '',
  antecedentes: '', condiciones: '', hallazgos: '', pruebas: '', causa: '',
  planoReferencia: '', alcance: '', exclusiones: '', criterios: '',
  cronograma: '', condicionesOperativas: '', decisionGarantia: '',
  fundamentoGarantia: '', decisionAlcance: '',
};

function relevamientoGuardado(valor: unknown, inicial: DatosRelevamiento = RELEVAMIENTO_INICIAL): DatosRelevamiento {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) return { ...inicial };
  const objeto = valor as Record<string, unknown>;
  const resultado = { ...inicial };
  for (const clave of Object.keys(resultado) as (keyof DatosRelevamiento)[]) {
    if (typeof objeto[clave] === 'string') resultado[clave] = String(objeto[clave]);
  }
  return resultado;
}

function itemsAlcanceGuardados(valor: unknown): ItemAlcance[] {
  if (!Array.isArray(valor)) return [];
  const usados = new Set<string>();
  return valor.flatMap((fila): ItemAlcance[] => {
    if (!fila || typeof fila !== 'object' || Array.isArray(fila)) return [];
    const item = fila as Record<string, unknown>;
    const id = typeof item.id === 'string' ? item.id.slice(0, 20).trim() : '';
    if (!id || usados.has(id)) return [];
    usados.add(id);
    return [{
      id,
      trabajo: typeof item.trabajo === 'string' ? item.trabajo : '',
      rubro: typeof item.rubro === 'string' ? item.rubro : '',
      profesional: typeof item.profesional === 'string' ? item.profesional : '',
      criterio: typeof item.criterio === 'string' ? item.criterio : '',
    }];
  });
}


const AVANCE_INICIAL: DatosAvance = {
  ...camposVacios('avance'),
  periodoDesde: '', periodoHasta: '', alcanceReferencia: '', acumulado: '',
  porcentaje: '', metodoPorcentaje: '', desvios: '', proximoPeriodo: '',
};

function avanceGuardado(valor: unknown, inicial: DatosAvance = AVANCE_INICIAL): DatosAvance {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) return { ...inicial };
  const objeto = valor as Record<string, unknown>;
  const resultado = { ...inicial };
  for (const clave of Object.keys(resultado) as (keyof DatosAvance)[]) {
    if (typeof objeto[clave] === 'string') resultado[clave] = String(objeto[clave]);
  }
  return resultado;
}

function itemsAvanceGuardados(valor: unknown): ItemAvance[] {
  if (!Array.isArray(valor)) return [];
  const usados = new Set<string>();
  return valor.flatMap((fila): ItemAvance[] => {
    if (!fila || typeof fila !== 'object' || Array.isArray(fila)) return [];
    const item = fila as Record<string, unknown>;
    const id = typeof item.id === 'string' ? item.id.slice(0, 20).trim() : '';
    if (!id || usados.has(id)) return [];
    usados.add(id);
    const campo = (clave: string) => typeof item[clave] === 'string' ? String(item[clave]) : '';
    return [{ id, previsto: campo('previsto'), realizado: campo('realizado'), saldo: campo('saldo') }];
  });
}


const CIERRE_INICIAL: DatosCierre = {
  ...camposVacios('cierre'),
  alcanceReferencia: '', cambiosAprobados: '', inicioReal: '', finReal: '',
  ejecucionPorItem: '', verificacion: '', planoReferencia: '',
  limpiezaVerificada: '', danosVerificados: '', pendientes: '', entregables: '',
  conclusion: '', autorizacionInterna: '',
};

function cierreGuardado(valor: unknown, inicial: DatosCierre = CIERRE_INICIAL): DatosCierre {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) return { ...inicial };
  const objeto = valor as Record<string, unknown>;
  const resultado = { ...inicial };
  for (const clave of Object.keys(resultado) as (keyof DatosCierre)[]) {
    if (typeof objeto[clave] === 'string') resultado[clave] = String(objeto[clave]);
  }
  return resultado;
}

function itemsCierreGuardados(valor: unknown): ItemCierre[] {
  if (!Array.isArray(valor)) return [];
  const usados = new Set<string>();
  return valor.flatMap((fila): ItemCierre[] => {
    if (!fila || typeof fila !== 'object' || Array.isArray(fila)) return [];
    const item = fila as Record<string, unknown>;
    const id = typeof item.id === 'string' ? item.id.slice(0, 20).trim() : '';
    if (!id || usados.has(id)) return [];
    usados.add(id);
    const campo = (clave: string) => typeof item[clave] === 'string' ? String(item[clave]) : '';
    return [{ id, trabajo: campo('trabajo'), criterio: campo('criterio'),
      resultado: campo('resultado'), verificadorFecha: campo('verificadorFecha') }];
  });
}


const ACTA_INICIAL: DatosActa = {
  ...camposVacios('acta'),
  cierreReferencia: '', objetoEntrega: '', anexosEntregados: '', receptor: '',
  organizacion: '', cargo: '', facultad: '', decisionPreparada: '',
  observacionesCliente: '', reservas: '', garantiaReferencia: '', garantiaCondiciones: '',
};

function actaGuardada(valor: unknown, inicial: DatosActa = ACTA_INICIAL): DatosActa {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) return { ...inicial };
  const objeto = valor as Record<string, unknown>;
  const resultado = { ...inicial };
  for (const clave of Object.keys(resultado) as (keyof DatosActa)[]) {
    if (typeof objeto[clave] === 'string') resultado[clave] = String(objeto[clave]);
  }
  return resultado;
}


const ENCUESTA_INICIAL: DatosEncuesta = {
  ...camposVacios('encuesta'),
  fechaRespuesta: '', respondente: '', relacionConOT: '', modalidad: '', referenciaFuente: '',
  satisfaccionGeneral: '', resolucion: '', calidadTrabajo: '', plazoPrometido: '',
  comunicacion: '', profesionalismo: '', rapidez: '', expectativas: '',
  recomendacion: '', sugerencias: '',
};

function encuestaGuardada(valor: unknown, inicial: DatosEncuesta = ENCUESTA_INICIAL): DatosEncuesta {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) return { ...inicial };
  const objeto = valor as Record<string, unknown>;
  const resultado = { ...inicial };
  for (const clave of Object.keys(resultado) as (keyof DatosEncuesta)[]) {
    if (typeof objeto[clave] === 'string') resultado[clave] = String(objeto[clave]);
  }
  return resultado;
}


export function ModalInformeOT({ isOpen, onClose, orden, proyectoNombre, tipo, puedeRevisar = false,
  soloVistaPrevia = false, documentoInicialId, onDocumentoChange }: Props) {
  const emisionDisponible = import.meta.env.VITE_DOCUMENT_ISSUANCE_ENABLED === 'true';
  const esCreador = useAccessStore(s => s.disponible && s.contexto?.creador === true);
  const usuarioId = useAuthStore(s => s.user?.id);
  const cfg = TIPO_CFG[tipo];
  const necesitaFotos =
    cfg.necesitaFotosAntes || cfg.necesitaFotosDespues || cfg.necesitaFotosDurante;

  const [observaciones, setObservaciones] = useState('');
  const [identificacion, setIdentificacion] = useState<IdentificacionInforme>(() => prepararAutocompletado(orden, proyectoNombre).identificacion);
  const precargaRef = useRef(prepararAutocompletado(orden, proyectoNombre));
  const [avisoFuentes, setAvisoFuentes] = useState('');
  const [planoContexto, setPlanoContexto] = useState<PlanoContexto | null>(null);
  const [avisoPlano, setAvisoPlano] = useState('');
  const [origenServicio, setOrigenServicio] = useState<OrigenOrdenServicio>(() => origenInicial(orden));
  const [datosVisita, setDatosVisita] = useState<DatosVisita>({ ...VISITA_INICIAL });
  const [datosRelevamiento, setDatosRelevamiento] = useState<DatosRelevamiento>({ ...RELEVAMIENTO_INICIAL });
  const [itemsAlcance, setItemsAlcance] = useState<ItemAlcance[]>([]);
  const [datosAvance, setDatosAvance] = useState<DatosAvance>({ ...AVANCE_INICIAL });
  const [itemsAvance, setItemsAvance] = useState<ItemAvance[]>([]);
  const [datosCierre, setDatosCierre] = useState<DatosCierre>({ ...CIERRE_INICIAL });
  const [itemsCierre, setItemsCierre] = useState<ItemCierre[]>([]);
  const [datosActa, setDatosActa] = useState<DatosActa>({ ...ACTA_INICIAL });
  const [datosEncuesta, setDatosEncuesta] = useState<DatosEncuesta>({ ...ENCUESTA_INICIAL });
  const [cargandoComentario, setCargandoComentario] = useState(true);
  const [htmlPreview, setHtmlPreview] = useState('');
  const [generandoPreview, setGenerandoPreview] = useState(false);
  const [vistaPreparada, setVistaPreparada] = useState(false);
  const [estadoEmisionConsultado, setEstadoEmisionConsultado] = useState<string | null>(null);
  const vistaLista = useCallback(() => setVistaPreparada(true), []);
  const [incluirFotos, setIncluirFotos] = useState(true);
  const [fotosAntes, setFotosAntes] = useState<FotoMin[]>([]);
  const [fotosDespues, setFotosDespues] = useState<FotoMin[]>([]);
  const [fotosDurante, setFotosDurante] = useState<FotoMin[]>([]);
  const [fotoIds, setFotoIds] = useState<string[]>([]);
  const [errorInforme, setErrorInforme] = useState<string | null>(null);
  const [documento, setDocumento] = useState<DocumentoRegistro | null>(null);
  const [documentosTipo, setDocumentosTipo] = useState<DocumentoRegistro[]>([]);
  const [revisiones, setRevisiones] = useState<RevisionDocumento[]>([]);
  const [candidatos, setCandidatos] = useState<CandidatoDocumento[]>([]);
  const [aprobaciones, setAprobaciones] = useState<AprobacionDocumento[]>([]);
  const [emisiones, setEmisiones] = useState<EmisionDocumento[]>([]);
  const [procesandoDocumento, setProcesandoDocumento] = useState(false);
  const [errorEmision, setErrorEmision] = useState<string | null>(null);
  const [motivoObservacion, setMotivoObservacion] = useState('');
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  const [pdfVerificadoId, setPdfVerificadoId] = useState<string | null>(null);
  const solicitudPdfRef = useRef<{ revision: string; id: string } | null>(null);
  const solicitudDecisionRef = useRef<{ clave: string; id: string } | null>(null);
  const solicitudEmisionRef = useRef<{ candidato: string; id: string } | null>(null);
  const [correccionAbierta,setCorreccionAbierta] = useState(false);
  const [motivoRevision, setMotivoRevision] = useState('');
  const [congelandoRevision, setCongelandoRevision] = useState(false);
  const [seleccionId, setSeleccionId] = useState<string | null>(documentoInicialId ?? null);
  const [versionBorrador, setVersionBorrador] = useState(0);
  const [guardado, setGuardado] = useState<string | null>(null);
  const [persistenciaDisponible, setPersistenciaDisponible] = useState(false);
  const [guardandoBorrador, setGuardandoBorrador] = useState(false);
  const [errorBorrador, setErrorBorrador] = useState<string | null>(null);
  const solicitudGuardadoRef = useRef<{ id: string; datos: string; version: number } | null>(null);
  const solicitudReservaRef = useRef<string | null>(null);
  const solicitudRevisionRef = useRef<{ id: string; documento: string; version: number; motivo: string } | null>(null);

  const firstRenderRef = useRef(true);
  const prevIncluirFotosRef = useRef(incluirFotos);
  const editorRef = useRef<HTMLDivElement>(null);
  const accionesRef = useRef<HTMLDetailsElement>(null);
  const [editorTab, setEditorTab] = useState<'datos' | 'texto' | 'fotos' | 'revision'>('texto');
  const [previewAmpliada, setPreviewAmpliada] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const escape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && accionesRef.current?.open) {
        e.stopPropagation(); accionesRef.current.open=false; return;
      }
      if (e.key === 'Escape' && previewAmpliada) { e.stopPropagation(); setPreviewAmpliada(false); }
    };
    document.addEventListener('keydown', escape, true);
    return () => document.removeEventListener('keydown', escape, true);
  }, [isOpen, previewAmpliada]);

  useEffect(() => {
    if (!isOpen) return;
    const fuera = (event:PointerEvent) => {
      const menu=accionesRef.current;
      if(menu?.open && event.target instanceof Node && !menu.contains(event.target))menu.open=false;
    };
    document.addEventListener('pointerdown',fuera);
    return()=>document.removeEventListener('pointerdown',fuera);
  },[isOpen]);

  // Reset de flags al cambiar de OT o tipo
  useEffect(() => {
    firstRenderRef.current = true;
    // Restablece el editor cuando cambia la identidad de la OT.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHtmlPreview('');
    setVistaPreparada(false);
    setEditorTab('texto');
    setPreviewAmpliada(false);
    setObservaciones('');
    setIdentificacion(prepararAutocompletado(orden, proyectoNombre).identificacion);
    setAvisoFuentes('');
    setPlanoContexto(null);
    setAvisoPlano('');
    setOrigenServicio(origenInicial(orden));
    setDatosVisita({ ...VISITA_INICIAL });
    setDatosRelevamiento({ ...RELEVAMIENTO_INICIAL });
    setItemsAlcance([]);
    setDatosAvance({ ...AVANCE_INICIAL });
    setItemsAvance([]);
    setDatosCierre({ ...CIERRE_INICIAL });
    setItemsCierre([]);
    setDatosActa({ ...ACTA_INICIAL });
    setDatosEncuesta({ ...ENCUESTA_INICIAL });
    setFotosAntes([]);
    setFotosDespues([]);
    setFotosDurante([]);
    setFotoIds([]);
    setErrorInforme(null);
    setDocumento(null);
    setDocumentosTipo([]);
    setRevisiones([]);
    setCandidatos([]);
    setAprobaciones([]);
    setEmisiones([]);
    setErrorEmision(null);
    setPdfBlobUrl(null);
    setPdfVerificadoId(null);
    setMotivoObservacion('');
    solicitudPdfRef.current = null;
    solicitudDecisionRef.current = null;
    solicitudEmisionRef.current = null;
    setMotivoRevision('');
    setCorreccionAbierta(false);
    setSeleccionId(documentoInicialId ?? null);
    setVersionBorrador(0);
    setGuardado(null);
    setPersistenciaDisponible(false);
    setErrorBorrador(null);
    solicitudGuardadoRef.current = null;
    solicitudReservaRef.current = null;
    solicitudRevisionRef.current = null;
    // Se reinicia solo al cambiar la identidad de la OT o el tipo de documento.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orden.id, tipo, documentoInicialId]);

  useEffect(() => {
    if ((!emisionDisponible && !soloVistaPrevia) || !isOpen || !documento?.id) return;
    const documentoId = documento.id;
    let cancelado = false;
    cargarEstadoEmision(documentoId).then(estado => {
      if (cancelado) return;
      setCandidatos(estado.candidatos);
      setAprobaciones(estado.aprobaciones);
      setEmisiones(estado.emisiones);
      setEstadoEmisionConsultado(documentoId);
    }).catch(error => {
      if (!cancelado) {
        setErrorEmision(error instanceof Error ? error.message : 'No se pudo cargar el estado documental.');
        setEstadoEmisionConsultado(documentoId);
      }
    });
    return () => { cancelado = true; };
  }, [documento?.id, emisionDisponible, isOpen, soloVistaPrevia]);

  // La lectura rápida muestra el PDF definitivo verificado cuando existe una emisión.
  useEffect(() => {
    if (!soloVistaPrevia || !isOpen || !emisiones.length) return;
    const emitido = candidatos.find(c => c.id === emisiones[0].candidato_id);
    if (!emitido || emitido.estado !== 'listo') return;
    let cancelado = false;
    descargarCandidatoVerificado(emitido).then(blob => {
      if (cancelado) return;
      setVistaPreparada(false);
      setPdfBlobUrl(URL.createObjectURL(blob));
      setPdfVerificadoId(emitido.id);
    }).catch(error => {
      if (!cancelado) setErrorEmision(error instanceof Error ? error.message : 'No se pudo verificar el PDF emitido.');
    });
    return () => { cancelado = true; };
  }, [soloVistaPrevia, isOpen, emisiones, candidatos]);

  useEffect(() => () => {
    if (pdfBlobUrl) URL.revokeObjectURL(pdfBlobUrl);
  }, [pdfBlobUrl]);

  const construirHtml = (textoActual: string): string => {
    const base = ordenParaInforme(orden, identificacion);
    const ordenDocumento = { ...base, campos: { ...base.campos, plano_contexto: TIPOS_CON_PLANO.includes(tipo) ? planoContexto : null } };
    const codigoDocumento = documento?.codigo;
    const seleccion = new Set(fotoIds);
    const fa  = incluirFotos ? fotosAntes.filter(f => seleccion.has(f.id)) : [];
    const fd  = incluirFotos ? fotosDespues.filter(f => seleccion.has(f.id)) : [];
    const fdu = incluirFotos ? fotosDurante.filter(f => seleccion.has(f.id)) : [];
    switch (tipo) {
      case 'cierre':
        return generarInformeCierre(ordenDocumento, proyectoNombre, textoActual, fa, fd, datosCierre, codigoDocumento, itemsCierre);
      case 'orden_servicio':
        return generarInformeOrdenServicio(ordenDocumento, textoActual, origenServicio, codigoDocumento, fa);
      case 'visita':
        return generarFichaVisita(ordenDocumento, datosVisita, fa, codigoDocumento);
      case 'relevamiento':
        return generarInformeRelevamiento(ordenDocumento, textoActual, fa, datosRelevamiento, codigoDocumento, itemsAlcance);
      case 'avance':
        return generarInformeAvance(ordenDocumento, textoActual, fa, fdu, datosAvance, codigoDocumento, itemsAvance);
      case 'acta':
        return generarInformeActaConformidad(ordenDocumento, datosActa, codigoDocumento);
      case 'encuesta':
        return generarEncuestaSatisfaccion(ordenDocumento, datosEncuesta, codigoDocumento);
    }
  };

  // Carga inicial: comentario + fotos
  useEffect(() => {
    if (!isOpen) return;
    let cancelado = false;
    // La carga remota empieza con el modal abierto.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCargandoComentario(true);

    const promFotos = necesitaFotos
      ? cargarFotosDeOrden(orden.id)
      : Promise.resolve([] as Awaited<ReturnType<typeof cargarFotosDeOrden>>);
    const promBorrador = listarDocumentosDeOrden(orden.id).then(async documentos => {
      const disponibles = documentos.filter(d => d.tipo === tipo && d.ciclo === 1);
      const vigente = seleccionId === 'nuevo' ? null
        : seleccionId ? disponibles.find(d => d.id === seleccionId) ?? null
          : disponibles.at(-1) ?? null;
      const [borrador,revisiones,contexto] = await Promise.all([
        vigente ? cargarBorradorDocumento(vigente.id) : Promise.resolve(null),
        vigente ? listarRevisionesDocumento(vigente.id) : Promise.resolve([]),
        cargarFuentesInforme(orden, tipo, documentos),
      ]);
      return { vigente, borrador, revisiones, disponibles, contexto };
    });

    Promise.all([promFotos, promBorrador])
      .then(async ([fotos, resultado]) => {
        if (cancelado) return;
        const datos = resultado?.borrador?.datos;
        const guardadoPlano = datos?.planoContexto as PlanoContexto | undefined;
        let contextoPlano: PlanoContexto | null = null;
        let errorPlano = '';
        if (TIPOS_CON_PLANO.includes(tipo) && guardadoPlano && typeof guardadoPlano.imagen === 'string' &&
            /^data:image\/(?:jpeg|png);base64,[A-Za-z0-9+/]+={0,2}$/.test(guardadoPlano.imagen) &&
            guardadoPlano.imagen.length <= 400_000 && guardadoPlano.posX === orden.pos_x &&
            guardadoPlano.posY === orden.pos_y && typeof guardadoPlano.planoRef === 'string') {
          contextoPlano = guardadoPlano;
        } else if(TIPOS_CON_PLANO.includes(tipo)) {
          try { contextoPlano = await generarContextoPlano(orden); }
          catch (error) { errorPlano = error instanceof Error ? error.message : 'No se pudo preparar la ubicación en el plano.'; }
        }
        if (cancelado) return;
        setPlanoContexto(contextoPlano);
        setAvisoPlano(errorPlano);
        const inicial = prepararAutocompletado(orden, proyectoNombre, resultado.contexto.cliente, resultado.contexto.fuentes);
        precargaRef.current = inicial;
        const identidad = restaurarCampos(inicial.identificacion, datos?.identificacion);
        setIdentificacion(identidad);
        setAvisoFuentes(resultado.contexto.avisos.join(' '));
        const texto = typeof datos?.observaciones === 'string'
          ? datos.observaciones : ['relevamiento', 'avance', 'cierre'].includes(tipo) ? inicial.observaciones : '';
        const origen = origenGuardado(datos?.origen, inicial.origen);
        const visita = visitaGuardada(datos?.visita, { ...VISITA_INICIAL, ...inicial.visita });
        const relevamiento = relevamientoGuardado(datos?.relevamiento, { ...RELEVAMIENTO_INICIAL, ...inicial.relevamiento });
        const alcanceItems = itemsAlcanceGuardados(datos?.itemsAlcance);
        const avance = avanceGuardado(datos?.avance, { ...AVANCE_INICIAL, ...inicial.avance });
        const avanceItems = itemsAvanceGuardados(datos?.itemsAvance ?? inicial.itemsAvance);
        const cierre = cierreGuardado(datos?.cierre, { ...CIERRE_INICIAL, ...inicial.cierre });
        const cierreItems = itemsCierreGuardados(datos?.itemsCierre ?? inicial.itemsCierre);
        const acta = actaGuardada(datos?.acta, { ...ACTA_INICIAL, ...inicial.acta });
        const encuesta = encuestaGuardada(datos?.encuesta, { ...ENCUESTA_INICIAL, ...inicial.encuesta });
        const elegibles = fotos.filter(f =>
          (cfg.necesitaFotosAntes && f.categoria === 'ANTES') ||
          (cfg.necesitaFotosDurante && f.categoria === 'DURANTE') ||
          (cfg.necesitaFotosDespues && f.categoria === 'DESPUES'));
        const idsGuardados = Array.isArray(datos?.fotoIds)
          ? datos.fotoIds.filter((id): id is string => typeof id === 'string').slice(0, 500)
          : datos?.incluirFotos !== false
            ? elegibles.map(f => f.id) : [];
        const idsFotos = [...new Set(idsGuardados)];
        setObservaciones(texto);
        setOrigenServicio(origen);
        setDatosVisita(visita);
        setDatosRelevamiento(relevamiento);
        setItemsAlcance(alcanceItems);
        setDatosAvance(avance);
        setItemsAvance(avanceItems);
        setDatosCierre(cierre);
        setItemsCierre(cierreItems);
        setDatosActa(acta);
        setDatosEncuesta(encuesta);
        setFotoIds(idsFotos);
        setIncluirFotos(typeof datos?.incluirFotos === 'boolean' ? datos.incluirFotos : true);
        setDocumento(resultado?.vigente ?? null);
        setDocumentosTipo(resultado?.disponibles ?? []);
        setRevisiones(resultado?.revisiones ?? []);
        setMotivoRevision(String(datos?.motivoCorreccion??''));
        setCorreccionAbierta(false);
        setVersionBorrador(resultado?.borrador?.version ?? 0);
        setGuardado(JSON.stringify({ motivoCorreccion:String(datos?.motivoCorreccion??''), identificacion: datos?.identificacion ?? (resultado?.borrador ? undefined : identidad), observaciones: texto,
          planoContexto: datos?.planoContexto ?? null,
          incluirFotos: datos?.incluirFotos !== false,
          ...(necesitaFotos ? { fotoIds: idsFotos } : {}),
          ...(tipo === 'orden_servicio' ? { origen } : {}),
          ...(tipo === 'visita' ? { visita } : {}),
          ...(tipo === 'relevamiento' ? { relevamiento, itemsAlcance: alcanceItems } : {}),
          ...(tipo === 'avance' ? { avance, itemsAvance: avanceItems } : {}),
          ...(tipo === 'cierre' ? { cierre, itemsCierre: cierreItems } : {}),
          ...(tipo === 'acta' ? { acta } : {}),
          ...(tipo === 'encuesta' ? { encuesta } : {}) }));
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
        // Keep the OT's selected document current using the same successful read.
        if(resultado.vigente)onDocumentoChange?.(resultado.vigente,resultado.borrador??undefined,resultado.revisiones);
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
    // Refleja una regeneración asíncrona del preview.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setGenerandoPreview(true);
    let cancelado = false;
    const t = window.setTimeout(() => {
      Promise.resolve().then(() => hacerInformePortable(construirHtml(observaciones)))
        .then(result => {
          if (cancelado) return;
          setHtmlPreview(result.html);
          setErrorInforme(result.missingImages ? `${result.missingImages} imagen(es) no pudieron incorporarse y se reemplazaron por un aviso.` : null);
        })
        .catch(error => {
          if (cancelado) return;
          console.error('[Informe] No se pudo preparar la vista previa', error);
          setHtmlPreview('');
          setErrorInforme('No se pudo preparar el informe. Podés reintentar con «Actualizar vista previa» o cerrar y volver a la OT.');
        })
        .finally(() => { if (!cancelado) setGenerandoPreview(false); });
    }, delay);
    return () => {
      cancelado = true;
      window.clearTimeout(t);
    };
    // Todos los campos reconstruyen la vista previa con el mismo renderizador del informe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isOpen,
    cargandoComentario,
    incluirFotos,
    fotosAntes,
    fotosDespues,
    fotosDurante,
    fotoIds,
    planoContexto,
    orden,
    proyectoNombre,
    tipo,
    documento,
    itemsAlcance,
    itemsAvance,
    itemsCierre,
    identificacion, observaciones, origenServicio, datosVisita, datosRelevamiento, datosAvance, datosCierre, datosActa, datosEncuesta,
  ]);

  if (!isOpen) return null;

  const reintentarPlano = async () => {
    setAvisoPlano('Preparando la referencia visual del plano…');
    try {
      const contexto = await generarContextoPlano(orden);
      setPlanoContexto(contexto);
      setAvisoPlano('');
    } catch (error) {
      setAvisoPlano(error instanceof Error ? error.message : 'No se pudo preparar la ubicación en el plano.');
    }
  };

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

  const datosBorrador = { motivoCorreccion:motivoRevision, identificacion, observaciones, incluirFotos, planoContexto,
    ...(necesitaFotos ? { fotoIds } : {}),
    ...(tipo === 'orden_servicio' ? { origen: origenServicio } : {}),
    ...(tipo === 'visita' ? { visita: datosVisita } : {}),
    ...(tipo === 'relevamiento' ? { relevamiento: datosRelevamiento, itemsAlcance } : {}),
    ...(tipo === 'avance' ? { avance: datosAvance, itemsAvance } : {}),
    ...(tipo === 'cierre' ? { cierre: datosCierre, itemsCierre } : {}),
    ...(tipo === 'acta' ? { acta: datosActa } : {}),
    ...(tipo === 'encuesta' ? { encuesta: datosEncuesta } : {}) };
  const planoRequerido = TIPOS_CON_PLANO.includes(tipo) && orden.pos_x != null && orden.pos_y != null &&
    Number.isFinite(orden.pos_x) && Number.isFinite(orden.pos_y);
  const cambiosBorrador = borradorModificado(guardado, datosBorrador);
  const revisionActual = revisiones.find(revision => revision.borrador_version === versionBorrador);
  const camposBloqueados = !tienePermiso('informe.editar',orden.proyecto_id) || cargandoComentario || (!!revisionActual && !correccionAbierta);
  const tipoRepetible = tipo === 'visita' || tipo === 'relevamiento' || tipo === 'avance' || tipo === 'encuesta' || tipo === 'cierre';
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
    setVistaPreparada(false);
    setHtmlPreview('');
    setPdfBlobUrl(null);
    setPdfVerificadoId(null);
    setCandidatos([]);
    setAprobaciones([]);
    setEmisiones([]);
    solicitudPdfRef.current = null;
    solicitudDecisionRef.current = null;
    solicitudEmisionRef.current = null;
    setErrorInforme(null);
    setErrorBorrador(null);
    setErrorEmision(null);
    solicitudGuardadoRef.current = null;
    solicitudReservaRef.current = null;
    solicitudRevisionRef.current = null;
    setCorreccionAbierta(false);
    setSeleccionId(id);
  };

  const handleGuardarBorrador = async () => {
    if (cargandoComentario || guardandoBorrador || !persistenciaDisponible) return;
    if (revisionActual && !correccionAbierta) { setErrorBorrador('Elegí «Crear versión corregida» antes de guardar cambios sobre una versión conservada.'); return; }
    if(correccionAbierta&&!motivoRevision.trim()){setErrorBorrador('Indicá el motivo de la versión corregida.');return;}
    const validation=validarEtapa(tipo,datosBorrador);if(validation){setErrorBorrador(validation);return;}
    const datos = {...datosBorrador, motivoCorreccion:motivoRevision};
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
      onDocumentoChange?.(vigente,borrador);
      setCorreccionAbierta(false);
      if (!documento && tipoRepetible) setSeleccionId(vigente.id);
      solicitudGuardadoRef.current = null;
    } catch (error) {
      setErrorBorrador(error instanceof Error ? error.message : 'No se pudo guardar el borrador.');
    } finally {
      setGuardandoBorrador(false);
    }
  };

  const handleCongelarRevision = async () => {
    if (!puedeRevisar || !documento || !versionBorrador || cambiosBorrador ||
      cargandoComentario || guardandoBorrador || congelandoRevision) return;
    if (planoRequerido && !planoContexto) {
      setErrorBorrador('Falta la referencia visual del plano. Reintentá la carga antes de congelar esta revisión.');
      return;
    }
    const motivo = motivoRevision.trim();
    if (revisiones.length && !motivo) {
      setErrorBorrador('Indicá por qué se corrige la revisión anterior.');
      return;
    }
    const intento = solicitudRevisionRef.current;
    const solicitud = intento?.documento === documento.id &&
      intento.version === versionBorrador && intento.motivo === motivo
      ? intento.id : crypto.randomUUID();
    solicitudRevisionRef.current = {
      id: solicitud, documento: documento.id, version: versionBorrador, motivo,
    };
    setCongelandoRevision(true);
    setErrorBorrador(null);
    try {
      await congelarRevisionDocumento(documento.id, versionBorrador, motivo || null,
        1, PLANTILLA_CONTROLADA_VERSION, solicitud);
      const conservadas=await listarRevisionesDocumento(documento.id);
      setRevisiones(conservadas);
      onDocumentoChange?.(documento,undefined,conservadas);
      setCorreccionAbierta(false);
      solicitudRevisionRef.current = null;
    } catch (error) {
      setErrorBorrador(error instanceof Error ? error.message : 'No se pudo congelar la revisión.');
    } finally {
      setCongelandoRevision(false);
    }
  };

  const actualizarEstadoEmision = async () => {
    if (!documento) return;
    const estado = await cargarEstadoEmision(documento.id);
    setCandidatos(estado.candidatos);
    setAprobaciones(estado.aprobaciones);
    setEmisiones(estado.emisiones);
  };

  const handlePrepararPdf = async (revision: RevisionDocumento) => {
    if (!emisionDisponible || !puedeRevisar || procesandoDocumento || cambiosBorrador ||
      revision.borrador_version !== versionBorrador) return;
    const intento = solicitudPdfRef.current;
    const solicitud = intento?.revision === revision.id ? intento.id : crypto.randomUUID();
    solicitudPdfRef.current = { revision: revision.id, id: solicitud };
    setProcesandoDocumento(true);
    setErrorEmision(null);
    try {
      await generarCandidatoPdf(revision.id, solicitud);
      await actualizarEstadoEmision();
      solicitudPdfRef.current = null;
    } catch (error) {
      setErrorEmision(error instanceof Error ? error.message : 'No se pudo generar el PDF candidato.');
    } finally { setProcesandoDocumento(false); }
  };

  const handleVerPdf = async (candidato: CandidatoDocumento) => {
    if (procesandoDocumento) return;
    setProcesandoDocumento(true);
    setErrorEmision(null);
    try {
      const blob = await descargarCandidatoVerificado(candidato);
      setVistaPreparada(false);
      setPdfBlobUrl(URL.createObjectURL(blob));
      setPdfVerificadoId(candidato.id);
    } catch (error) {
      setPdfBlobUrl(null);
      setPdfVerificadoId(null);
      setErrorEmision(error instanceof Error ? error.message : 'No se pudo verificar el PDF.');
    } finally { setProcesandoDocumento(false); }
  };

  const handleRevisarPdf = async (candidato: CandidatoDocumento,
    decision: 'aprobado' | 'observado') => {
    if (!esCreador || cambiosBorrador || !revisionActual || procesandoDocumento ||
      pdfVerificadoId !== candidato.id || !candidato.pdf_sha256) return;
    const motivo = decision === 'observado' ? motivoObservacion.trim() : null;
    if (decision === 'observado' && !motivo) {
      setErrorEmision('Describí la observación antes de registrar la decisión.');
      return;
    }
    const clave = `${candidato.id}:${decision}:${motivo ?? ''}`;
    const solicitud = solicitudDecisionRef.current?.clave === clave
      ? solicitudDecisionRef.current.id : crypto.randomUUID();
    solicitudDecisionRef.current = { clave, id: solicitud };
    setProcesandoDocumento(true);
    setErrorEmision(null);
    try {
      const { data } = await supabase.auth.getUser();
      if (decision === 'aprobado' && data.user?.id === candidato.solicitado_por)
        throw new Error('El PDF debe prepararlo otra persona; durante el piloto lo aprueba el Creador.');
      await revisarCandidatoPdf(candidato.id, candidato.pdf_sha256, decision, motivo, solicitud);
      await actualizarEstadoEmision();
      solicitudDecisionRef.current = null;
    } catch (error) {
      setErrorEmision(error instanceof Error ? error.message : 'No se pudo registrar la revisión.');
    } finally { setProcesandoDocumento(false); }
  };

  const handleEmitirPdf = async (candidato: CandidatoDocumento) => {
    if (!esCreador || cambiosBorrador || !revisionActual || procesandoDocumento || pdfVerificadoId !== candidato.id) return;
    const solicitud = solicitudEmisionRef.current?.candidato === candidato.id
      ? solicitudEmisionRef.current.id : crypto.randomUUID();
    solicitudEmisionRef.current = { candidato: candidato.id, id: solicitud };
    setProcesandoDocumento(true);
    setErrorEmision(null);
    try {
      await emitirCandidatoPdf(candidato.id, solicitud);
      await actualizarEstadoEmision();
      solicitudEmisionRef.current = null;
    } catch (error) {
      setErrorEmision(error instanceof Error ? error.message : 'No se pudo emitir el documento.');
    } finally { setProcesandoDocumento(false); }
  };

  const handleExportarHTML = async () => {
    if (cargandoComentario) return;
    if (planoRequerido && !planoContexto) { setErrorInforme('Falta la referencia visual del plano. Reintentá la carga antes de exportar.'); return; }
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
    if (planoRequerido && !planoContexto) { setErrorInforme('Falta la referencia visual del plano. Reintentá la carga antes de imprimir.'); return; }
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

  // ── Render ───────────────────────────────────────────────────────────────
  const revisionEmitible = revisiones.at(-1);
  const candidatoEmitible = candidatos.find(c => c.revision_id === revisionEmitible?.id);
  const aprobacionEmitible = aprobaciones.find(a => a.candidato_id === candidatoEmitible?.id);
  const emisionActual = emisiones.find(e => e.candidato_id === candidatoEmitible?.id);
  const candidatoEmitido = candidatos.find(c => c.id === emisiones[0]?.candidato_id);
  const cerrarInforme = () => {
    if (guardandoBorrador || congelandoRevision || procesandoDocumento) return;
    if (!soloVistaPrevia && !cargandoComentario && cambiosBorrador &&
      !window.confirm('Hay cambios sin guardar en este informe. ¿Querés descartarlos y cerrar?')) return;
    onClose();
  };
  const verificandoEstado = soloVistaPrevia && !!documento && estadoEmisionConsultado !== documento.id;
  const pdfEmitidoPendiente = soloVistaPrevia && (emisiones.length > 0 || !!errorEmision) && !pdfBlobUrl;
  const preparandoApertura = cargandoComentario || verificandoEstado || (!vistaPreparada && !errorBorrador && !(errorInforme && !htmlPreview) && !pdfEmitidoPendiente);
  const accionesInforme = <>
          {soloVistaPrevia ? <>
            <span className={styles.avisoImpresion}>{emisiones.length && pdfBlobUrl ? 'Documento definitivo emitido.' : 'Vista previa de borrador; no equivale a un documento emitido.'}</span>
            <button type="button" className={styles.btnCancelar} onClick={cerrarInforme}>Cerrar</button>
          </> : <>
          <span className={styles.avisoImpresion}>
            {errorBorrador ?? errorInforme ?? (documento
              ? `${documento.codigo} · borrador v${versionBorrador}${cambiosBorrador ? ' · cambios sin guardar' : ''}`
              : 'Descargas de borrador. No son documentos emitidos ni aprobados.')}
          </span>
          {persistenciaDisponible && (
            <button type="button" className={styles.btnSecondary} onClick={handleGuardarBorrador}
              disabled={!tienePermiso('informe.editar',orden.proyecto_id) || cargandoComentario || guardandoBorrador || (!cambiosBorrador && documento !== null)}>
              {guardandoBorrador ? 'Guardando…' : 'Guardar borrador'}
            </button>
          )}
          <button type="button" className={styles.btnCancelar} onClick={cerrarInforme}>
            Cancelar
          </button>
          <button
            type="button"
            className={styles.btnSecondary}
            onClick={handleExportarHTML}
            disabled={!tienePermiso('informe.imprimir',orden.proyecto_id) || !htmlPreview || generandoPreview}
          >
            Descargar HTML borrador
          </button>
          <button
            type="button"
            className={styles.btnPrimary}
            onClick={handleExportarPDF}
            disabled={!tienePermiso('informe.imprimir',orden.proyecto_id) || !htmlPreview || generandoPreview}
          >
            Imprimir PDF borrador →
          </button>
          </>}
  </>;
  return (
    <div className={styles.backdrop} onClick={cerrarInforme}>
      <div className={`${styles.modal} ${soloVistaPrevia ? styles.modalPreviewOnly : ''} ${previewAmpliada ? styles.modalAmpliada : ''} ${preparandoApertura ? styles.preparando : ''}`} aria-busy={preparandoApertura} onClick={e => e.stopPropagation()}>
        {/* HEADER */}
        <div className={styles.header} hidden={previewAmpliada}>
          <div className={styles.title}>{soloVistaPrevia ? `Vista previa · ${cfg.titulo}` : cfg.titulo}</div>
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
            onClick={cerrarInforme}
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>

        {/* BODY */}
        <div className={`${styles.body} ${soloVistaPrevia || previewAmpliada ? styles.bodyPreviewOnly : ''}`} inert={preparandoApertura}>
          {/* IZQUIERDA */}
          {!soloVistaPrevia && <div className={styles.left} ref={editorRef} hidden={previewAmpliada}>
            {tipoRepetible && (
              <div className={styles.section}>
                <label className={styles.originField}>
                  <span>Documento</span>
                  <select value={seleccionId ?? documento?.id ?? 'nuevo'}
                    onChange={e => {
                      if (e.target.value === 'continuar') cambiarDocumento(documento?.id ?? documentosTipo[0]?.id ?? 'nuevo');
                      else if (e.target.value === 'emitido') { if (candidatoEmitido) void handleVerPdf(candidatoEmitido); }
                      else cambiarDocumento(e.target.value);
                    }}
                    disabled={cargandoComentario || guardandoBorrador || cambiosBorrador}>
                    {documentosTipo.map(doc => (
                      <option key={doc.id} value={doc.id}>
                        {doc.codigo}
                      </option>
                    ))}
                    <option value="nuevo">{`+ ${ETAPAS_OT.find(e=>e.tipo===tipo)?.newLabel || 'Nuevo borrador'}`}</option>
                    <option value="continuar" disabled={!documentosTipo.length}>Continuar documento guardado{!documentosTipo.length ? ' · todavía no hay' : ''}</option>
                    <option value="emitido" disabled={!emisionDisponible || !candidatoEmitido}>Ver PDF emitido{!emisionDisponible ? ' · emisión formal no habilitada' : !candidatoEmitido ? ' · todavía no hay' : ''}</option>
                  </select>
                </label>
                {tipo === 'visita' && <p className={styles.sublabel}>Elegí «Nueva visita» cuando se realice otra visita. Para consultar o corregir una ya guardada, seleccioná su código.</p>}
                {cambiosBorrador && !cargandoComentario && (
                  <p className={styles.sublabel}>Guardá el borrador antes de cambiar de documento.</p>
                )}
              </div>
            )}
            <nav className={styles.editorTabs} aria-label="Edición del informe">
              {([['datos','Datos'],['texto','Texto'],['fotos','Fotos y plano'],['revision','Revisión']] as const).map(([id,label]) =>
                <button type="button" key={id} aria-pressed={editorTab===id} onClick={()=>{setEditorTab(id);editorRef.current?.scrollTo({top:0});}}>{label}</button>)}
            </nav>
            <div className={styles.identitySummary}>
              <span><strong>Obra</strong> {identificacion.obra || proyectoNombre}</span>
              <span><strong>Unidad</strong> {identificacion.unidad_amenities || '—'}</span>
              <span><strong>Cliente</strong> {identificacion.cliente || '—'}</span>
            </div>
            <div hidden={editorTab !== 'datos'} className={styles.tabContent}>
            <div className={styles.section}>
              <div className={styles.sectionTitle}>Datos</div>
              <div className={styles.dataGrid}>
                <div className={styles.dataKey}>Rubro</div>
                <div className={styles.dataVal}>{orden.rubro || '—'}</div>
                <div className={styles.dataKey}>Responsable</div>
                <div className={styles.dataVal}>{orden.responsable || '—'}</div>
                <section className={styles.section} style={{ gridColumn: '1 / -1', minWidth: 0 }}>
              <div className={styles.sectionTitle}>Datos de la OT y del cliente</div>
              <p className={styles.sublabel}>Datos precargados de la OT, del cliente vinculado y de los documentos anteriores disponibles. Revisalos antes de generar. Las ediciones se guardan solo en este informe.</p>
              {avisoFuentes && <p role="alert">{avisoFuentes}</p>}
              {planoRequerido && !planoContexto && <div role="alert" style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8, margin: '8px 0', fontSize: 12 }}>
                <span>{avisoPlano || 'La ubicación del plano todavía no está lista para este informe.'}</span>
                <button type="button" className={styles.btnSecondary} onClick={() => void reintentarPlano()} disabled={cargandoComentario}>Reintentar plano</button>
              </div>}
              {TIPOS_CON_PLANO.includes(tipo) && !planoRequerido && <p className={styles.sublabel}>Esta OT no tiene un punto ubicado en el plano; el informe no mostrará un recorte hasta que la ubiquen.</p>}
              <div className={styles.originGrid}>
                {CAMPOS_IDENTIFICACION.filter(([clave])=>['obra','unidad_amenities','cliente','contacto','telefono','correo'].includes(clave)).map(([clave,etiqueta])=><CampoTextoInforme key={clave} etiqueta={etiqueta} value={identificacion[clave]} disabled={camposBloqueados} onChange={value=>setIdentificacion(actual=>({...actual,[clave]:value}))} />)}
              </div>
              <details>
                <summary>Documento, direcciones y otros datos de identificación</summary>
                <div className={styles.originGrid}>
                  {CAMPOS_IDENTIFICACION.filter(([clave])=>!['obra','unidad_amenities','cliente','contacto','telefono','correo'].includes(clave)).map(([clave, etiqueta]) => <CampoTextoInforme key={clave} etiqueta={etiqueta} multiline={clave === 'descripcion'} rows={4} value={identificacion[clave]} disabled={camposBloqueados}
                      onChange={value => setIdentificacion(actual => ({ ...actual, [clave]: value }))} placeholder="No registrado" />)}
                </div>
              </details>
              <button type="button" className={styles.btnSecondary} disabled={camposBloqueados} onClick={() => {
                const p = precargaRef.current;
                const completar = <T extends object>(actual: T, origen: Partial<T>): T => {
                  const siguiente = { ...actual };
                  for (const clave of Object.keys(origen) as (keyof T)[]) if (actual[clave] === '' && origen[clave] !== undefined) siguiente[clave] = origen[clave] as T[keyof T];
                  return siguiente;
                };
                setIdentificacion(actual => completar(actual, p.identificacion));
                setOrigenServicio(actual => completar(actual, p.origen));
                setDatosVisita(actual => completar(actual, p.visita));
                setDatosRelevamiento(actual => completar(actual, p.relevamiento));
                setDatosAvance(actual => completar(actual, p.avance));
                setDatosCierre(actual => completar(actual, p.cierre));
                setDatosActa(actual => completar(actual, p.acta));
                setDatosEncuesta(actual => completar(actual, p.encuesta));
                if (['relevamiento', 'avance', 'cierre'].includes(tipo)) setObservaciones(actual => actual || p.observaciones);
              }}>Completar campos vacíos con datos existentes</button>
              <p className={styles.sublabel}>Las fechas de inicio y fin proceden de la OT; verificá que correspondan a la ejecución real. Las aprobaciones, verificaciones y respuestas del cliente se completan cuando están registradas.</p>
            </section>

            {tipo === 'orden_servicio' && (
                  <>
                    <div className={styles.dataKey}>Ingreso OT</div>
                    <div className={styles.dataVal}>{fechaCorta(orden.fecha_ingreso)}</div>
                  </>
                )}
              </div>
            </div>
            </div>
            <div hidden={editorTab !== 'revision'} className={styles.tabContent}>
            {documento && (
              <section className={styles.section} aria-label="Revisiones de datos">
                <div className={styles.sectionTitle}>Revisiones de datos</div>
                <p className={styles.sublabel}>
                  Congelar conserva los datos de este borrador y su huella. Todavía no emite un PDF ni registra aprobación o firma.
                </p>
                {revisiones.length > 0 ? (
                  <ol className={styles.revisionList}>
                    {revisiones.map(revision => (
                      <li key={revision.id}>
                        <strong>R{String(revision.revision).padStart(2, '0')}</strong>
                        <span>Borrador v{revision.borrador_version} · {new Date(revision.creada_en).toLocaleString('es-PY')}</span>
                        {revision.motivo && <span>Motivo: {revision.motivo}</span>}
                      </li>
                    ))}
                  </ol>
                ) : <p className={styles.sublabel}>Aún no hay revisiones congeladas.</p>}
                {puedeRevisar && versionBorrador > 0 && !revisionActual && (
                  <>
                    {revisiones.length > 0 && (
                      <CampoTextoInforme etiqueta="Motivo de la versión corregida" multiline rows={4} value={motivoRevision} maxLength={500}
                        onChange={setMotivoRevision} placeholder="Explicá qué se corrigió respecto de la revisión anterior" />
                    )}
                    <button type="button" className={styles.btnSecondary}
                      onClick={handleCongelarRevision}
                      disabled={cambiosBorrador || guardandoBorrador || congelandoRevision ||
                        (revisiones.length > 0 && !motivoRevision.trim())}>
                      {congelandoRevision ? 'Congelando…' : 'Congelar datos para revisión'}
                    </button>
                  </>
                )}
                {revisionActual && correccionAbierta && <CampoTextoInforme etiqueta="Motivo de la versión corregida" multiline rows={4} value={motivoRevision} onChange={setMotivoRevision}/>}
                {revisionActual && <div><button type="button" className={styles.btnSecondary} disabled={!tienePermiso('informe.crear',orden.proyecto_id)||!puedeRevisar||cargandoComentario||guardandoBorrador||correccionAbierta} onClick={()=>{setMotivoRevision('');setCorreccionAbierta(true);}}>Crear versión corregida</button><TooltipAyuda titulo="Crear versión corregida" texto="Corrige este mismo documento y conserva la versión anterior. Registrá el motivo y guardá los cambios antes de preparar otro PDF."/></div>}
                {revisionActual && <p className={styles.sublabel}>Esta versión del borrador quedó congelada como R{String(revisionActual.revision).padStart(2, '0')}.</p>}
              </section>
            )}
            {emisionDisponible && puedeRevisar && documento && (
              <section className={styles.section} aria-label="Emisión documental">
                <div className={styles.sectionTitle}>PDF controlado</div>
                <p className={styles.sublabel}>
                  El supervisor prepara el PDF. El Creador revisa y autoriza su emisión desde otra cuenta.
                  Emitir un acta no registra la aceptación del cliente.
                </p>
                {errorEmision && <p role="alert" className={styles.documentError}>{errorEmision}</p>}
                {!emisiones.length && (cambiosBorrador || (revisionEmitible && !revisionActual)) && (
                  <p className={styles.sublabel}>Hay cambios posteriores al PDF. Guardá el borrador y congelá una nueva revisión antes de continuar.</p>
                )}
                {emisiones.length > 0 && (
                  <>
                    <p className={styles.documentSuccess}>
                      Última emisión: {new Date(emisiones[0].emitido_en).toLocaleString('es-PY')}.
                      El archivo y su hash quedaron registrados.
                    </p>
                    {candidatoEmitido && (
                      <button type="button" className={styles.btnSecondary}
                        onClick={() => handleVerPdf(candidatoEmitido)} disabled={procesandoDocumento}>
                        Verificar y abrir PDF emitido
                      </button>
                    )}
                    {emisiones.length > 1 && <details><summary>PDF de versiones anteriores</summary>{emisiones.slice(1).map(emision=>{
                      const candidato=candidatos.find(c=>c.id===emision.candidato_id);
                      const revision=revisiones.find(r=>r.id===emision.revision_id);
                      return <button key={emision.id} type="button" className={styles.btnSecondary} disabled={!candidato||procesandoDocumento} onClick={()=>candidato&&void handleVerPdf(candidato)}>Ver R{String(revision?.revision??0).padStart(2,'0')} · {new Date(emision.emitido_en).toLocaleDateString('es-PY')}</button>;
                    })}</details>}
                  </>
                )}
                {!emisionActual && revisionEmitible &&
                  revisionEmitible.plantilla_version !== PLANTILLA_CONTROLADA_VERSION && (
                    <p className={styles.sublabel}>
                      Esta revisión usa una plantilla anterior. Guardá una nueva versión del borrador y congelá otra revisión para generar el PDF controlado.
                    </p>
                  )}
                {!emisionActual && revisionEmitible &&
                  revisionEmitible.plantilla_version === PLANTILLA_CONTROLADA_VERSION && (
                    <>
                      <p className={styles.sublabel}>
                        Revisión R{String(revisionEmitible.revision).padStart(2, '0')} · {documento.codigo}
                      </p>
                      {(!candidatoEmitible || candidatoEmitible.estado !== 'listo') && (
                        <button type="button" className={styles.btnSecondary}
                          onClick={() => handlePrepararPdf(revisionEmitible)} disabled={!tienePermiso('informe.preparar',orden.proyecto_id) || procesandoDocumento || cambiosBorrador || !revisionActual}>
                          {procesandoDocumento ? 'Preparando PDF…' : candidatoEmitible ? 'Retomar PDF candidato' : 'Generar PDF candidato'}
                        </button>
                      )}
                      {candidatoEmitible?.estado === 'listo' && (
                        <>
                          <p className={styles.documentHash}>SHA-256 · {candidatoEmitible.pdf_sha256}</p>
                          <button type="button" className={styles.btnSecondary}
                            onClick={() => handleVerPdf(candidatoEmitible)} disabled={procesandoDocumento}>
                            Verificar y abrir PDF
                          </button>
                          {pdfVerificadoId === candidatoEmitible.id && (
                            <p className={styles.documentSuccess}>
                              El PDF descargado coincide con el hash registrado. Revisá todas sus páginas antes de decidir.
                            </p>
                          )}
                          {!esCreador && <p className={styles.sublabel}>PDF preparado para revisión del Creador. Podés abrirlo y comprobar su contenido.</p>}
                          {esCreador && candidatoEmitible.solicitado_por === usuarioId && (
                            <p className={styles.sublabel}>Preparaste este PDF desde tu cuenta. Para mantener la revisión por dos personas, el supervisor debe preparar una nueva revisión y el Creador aprobarla.</p>
                          )}
                          {esCreador && !aprobacionEmitible && pdfVerificadoId === candidatoEmitible.id && (
                            <div className={styles.documentActions}>
                              <button type="button" className={styles.btnPrimary}
                                onClick={() => handleRevisarPdf(candidatoEmitible, 'aprobado')}
                                disabled={!tienePermiso('informe.aprobar',orden.proyecto_id) || procesandoDocumento || cambiosBorrador || !revisionActual || candidatoEmitible.solicitado_por === usuarioId}>Aprobar este PDF</button>
                              <CampoTextoInforme etiqueta="Motivo si hay observaciones" multiline rows={4} value={motivoObservacion}
                                maxLength={1000} onChange={setMotivoObservacion} />
                              <button type="button" className={styles.btnSecondary}
                                onClick={() => handleRevisarPdf(candidatoEmitible, 'observado')}
                                disabled={!tienePermiso('informe.aprobar',orden.proyecto_id) || procesandoDocumento || cambiosBorrador || !revisionActual || !motivoObservacion.trim()}>
                                Registrar observaciones
                              </button>
                            </div>
                          )}
                          {aprobacionEmitible?.decision === 'observado' && (
                            <p className={styles.sublabel}>
                              PDF observado: {aprobacionEmitible.motivo}. Corregí el borrador y congelá otra revisión.
                            </p>
                          )}
                          {esCreador && aprobacionEmitible?.decision === 'aprobado' && !emisionActual && (
                            <button type="button" className={styles.btnPrimary}
                              onClick={() => handleEmitirPdf(candidatoEmitible)}
                              disabled={!tienePermiso('informe.emitir',orden.proyecto_id) || procesandoDocumento || cambiosBorrador || !revisionActual || pdfVerificadoId !== candidatoEmitible.id}>
                              Emitir PDF aprobado
                            </button>
                          )}
                        </>
                      )}
                    </>
                  )}
              </section>
            )}

            {!documento && <p className={styles.sublabel}>Guardá el borrador para consultar sus revisiones y preparar el PDF controlado.</p>}
            </div>
            <div hidden={editorTab !== 'texto'} className={styles.tabContent}>
            <EtapaCampos compact tipo={tipo} datos={datosBorrador} disabled={camposBloqueados}
              onChange={d=>{
                setObservaciones(String(d.observaciones??''));
                if(d.origen)setOrigenServicio(d.origen as OrigenOrdenServicio);
                if(d.visita)setDatosVisita(d.visita as DatosVisita);
                if(d.relevamiento)setDatosRelevamiento(d.relevamiento as DatosRelevamiento);
                if(d.avance)setDatosAvance(d.avance as DatosAvance);
                if(d.cierre)setDatosCierre(d.cierre as DatosCierre);
                if(d.acta)setDatosActa(d.acta as DatosActa);
                if(d.encuesta)setDatosEncuesta(d.encuesta as DatosEncuesta);
                if(d.itemsAlcance)setItemsAlcance(d.itemsAlcance as ItemAlcance[]);
                if(d.itemsAvance)setItemsAvance(d.itemsAvance as ItemAvance[]);
                if(d.itemsCierre)setItemsCierre(d.itemsCierre as ItemCierre[]);
              }}/>

            </div>
            <div hidden={editorTab !== 'fotos'} className={styles.tabContent}>
            {TIPOS_CON_PLANO.includes(tipo) && <section className={styles.section}>
              <div className={styles.sectionTitle}>Ubicación en el plano</div>
              {planoContexto?.imagen ? <img className={styles.planPreview} src={planoContexto.imagen} alt="Ubicación de la OT en el plano" /> : <p className={styles.sublabel}>{avisoPlano || 'La referencia del plano se incorpora automáticamente cuando la OT está ubicada.'}</p>}
            </section>}
            {!necesitaFotos && !TIPOS_CON_PLANO.includes(tipo) && <p className={styles.sublabel}>Este documento no incluye fotografías ni plano.</p>}
            {necesitaFotos && (
              <div className={styles.section} data-report-section="fotos">
                <div className={styles.sectionTitle}>Opciones</div>
                <label className={styles.checkboxRow}>
                  <input
                    type="checkbox"
                    checked={incluirFotos}
                    disabled={camposBloqueados}
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
                          disabled={camposBloqueados || !incluirFotos}
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

            </div>
            <div className={styles.section}>
              <button
                type="button"
                className={styles.btnRefresh}
                onClick={handleActualizarAhora}
                disabled={cargandoComentario || generandoPreview}
              >
                Actualizar vista previa
              </button>
            </div>
          </div>}

          {/* DERECHA */}
          <div className={styles.right}>
            <div className={styles.previewHeading}>
              {pdfBlobUrl ? (emisiones.length ? 'PDF emitido verificado' : 'PDF candidato verificado · aún no emitido')
                : pdfEmitidoPendiente ? 'PDF emitido · verificando archivo' : 'Vista previa del borrador'}
              {soloVistaPrevia && documento && <span> · {documento.codigo}</span>}
              {soloVistaPrevia && (errorBorrador || errorInforme || errorEmision) &&
                <p role="alert" className={styles.documentError}>{errorBorrador || errorEmision || errorInforme}</p>}
              {pdfBlobUrl && <div className={styles.documentActions}>
                <a className={styles.btnSecondary} href={pdfBlobUrl}
                  download={`${documento?.codigo ?? 'informe'}_${emisiones.length ? 'emitido' : 'candidato'}.pdf`}>
                  Descargar PDF {emisiones.length ? 'emitido' : 'candidato'}
                </a>
                <button type="button" className={styles.btnSecondary} onClick={() => setPdfBlobUrl(null)}>Volver al borrador</button>
              </div>}
            </div>
            {pdfEmitidoPendiente ? (
              <div className={styles.emptyState}>{errorEmision || (candidatoEmitido ? 'Verificando el PDF emitido…' : 'No se encontró el archivo emitido.')}</div>
            ) : (pdfBlobUrl || htmlPreview) ? (
              <VistaPreviaDocumento key={`${orden.id}-${tipo}-${seleccionId ?? 'nuevo'}-${pdfBlobUrl ?? 'borrador'}`} html={htmlPreview} pdfUrl={pdfBlobUrl} soloLectura={soloVistaPrevia} ampliada={previewAmpliada}
                onAmpliar={()=>setPreviewAmpliada(actual=>!actual)} onReady={vistaLista}
                titulo={`${cfg.titulo} · ${orden.ot} · ${pdfBlobUrl ? (emisiones.length ? 'Emitido' : 'Candidato sin emitir') : 'Borrador'}`} acciones={<details ref={accionesRef} className={styles.previewActions}><summary>Acciones</summary><div>{pdfBlobUrl && <><a className={styles.btnSecondary} href={pdfBlobUrl} download={`${documento?.codigo ?? 'informe'}_${emisiones.length ? 'emitido' : 'candidato'}.pdf`}>Descargar PDF {emisiones.length ? 'emitido' : 'candidato'}</a><button type="button" className={styles.btnSecondary} onClick={()=>setPdfBlobUrl(null)}>Volver al borrador</button></>}{accionesInforme}</div></details>}
                onCerrar={cerrarInforme} />
            ) : !generandoPreview ? (
              <div className={styles.emptyState}>Hacé clic en <b>Actualizar vista previa</b></div>
            ) : null}
            {generandoPreview && (
              <div className={styles.overlay}>
                <span className={styles.spinner} />
                <span>Actualizando preview...</span>
              </div>
            )}
          </div>
        </div>

        {preparandoApertura && <div className={styles.apertura} role="status"><span className={styles.spinner}/><span>{cargandoComentario ? 'Recuperando el informe guardado…' : verificandoEstado ? 'Verificando el estado documental…' : 'Preparando la primera página…'}</span></div>}
        {!previewAmpliada && <div className={styles.footer} inert={preparandoApertura}>{accionesInforme}</div>}
      </div>
    </div>
  );
}
