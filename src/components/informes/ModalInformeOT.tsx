import { CampoTextoInforme } from './CampoTextoInforme';
import { PdfVerificado } from './PdfVerificado';
import { registrarExportacion } from '../../services/trustService';
import { borradorModificado } from '../../services/reportDraftComparison';
// src/components/informes/ModalInformeOT.tsx
//
// Modal fullscreen para previsualizar/exportar los siete borradores de una OT.
//
// Layout: panel izquierdo (datos read-only + observaciones editable + opciones),
// panel derecho (iframe srcdoc con el HTML generado).
//
// Precarga campos de la OT y fuentes vinculadas; las ediciones se conservan
// en el borrador. No convierte notas ni estados en aprobaciones o firmas.
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
import { useAccessStore } from '../../stores/accessStore';
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
import { VoiceInputButton } from '../ui/VoiceInputButton';
import { PLANTILLA_CONTROLADA_VERSION } from '../../services/controlledReportService';

export type TipoInforme = 'cierre' | 'orden_servicio' | 'visita' | 'relevamiento' | 'avance' | 'acta' | 'encuesta';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  orden: OrdenLocal;
  proyectoNombre: string;
  tipo: TipoInforme;
  puedeRevisar?: boolean;
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

function siguienteIdItem(items: { id: string }[]): string {
  const usados = new Set(items.map(item => item.id));
  let numero = 1;
  while (usados.has(`A-${String(numero).padStart(2, '0')}`)) numero++;
  return `A-${String(numero).padStart(2, '0')}`;
}

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

const CAMPOS_VISITA: [keyof DatosVisita, string][] = [
  ['fechaVisita', 'Fecha de visita'], ['horaInicio', 'Hora de inicio'],
  ['horaFin', 'Hora de fin'], ['propietario', 'Propietario o solicitante'],
  ['contacto', 'Contacto'], ['edificio', 'Edificio u obra visitada'],
  ['unidad', 'Departamento, unidad o sector'],
  ['responsableVisita', 'Responsable de la visita'],
  ['participantes', 'Otros participantes'],
  ['descripcion', 'Descripción del motivo de la visita'],
  ['observacionesTecnicas', 'Observaciones técnicas'],
  ['restricciones', 'Restricciones y límites de observación'],
  ['compromisos', 'Compromisos y próximo paso declarados'],
  ['representantesPrevistos', 'Representantes previstos para la firma'],
];

const RELEVAMIENTO_INICIAL: DatosRelevamiento = {
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
      criterio: typeof item.criterio === 'string' ? item.criterio : '',
    }];
  });
}

const CAMPOS_RELEVAMIENTO: [keyof DatosRelevamiento, string][] = [
  ['modalidad', 'Modalidad: visita o remota'], ['fechaIntervencion', 'Fecha de intervención'],
  ['tecnico', 'Técnico interviniente'], ['participantes', 'Participantes'],
  ['antecedentes', 'Antecedentes relevantes de la solicitud'],
  ['condiciones', 'Condiciones y límites de observación'],
  ['hallazgos', 'Hallazgos y evidencia relacionada'],
  ['pruebas', 'Pruebas y mediciones realizadas'],
  ['causa', 'Causa confirmada, probable o no determinada; sustento'],
  ['planoReferencia', 'Plano y ubicación referencial del hallazgo'],
  ['alcance', 'Alcance propuesto'], ['exclusiones', 'Exclusiones y supuestos'],
  ['criterios', 'Criterios de aceptación propuestos'],
  ['cronograma', 'Cronograma propuesto o aprobado; referencia'],
  ['condicionesOperativas', 'Condiciones operativas acordadas para esta intervención'],
  ['decisionGarantia', 'Garantía: aplica, no aplica o por determinar'],
  ['fundamentoGarantia', 'Fundamento de la decisión de garantía'],
  ['decisionAlcance', 'Estado declarado del alcance'],
];

const AVANCE_INICIAL: DatosAvance = {
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

const CAMPOS_CIERRE: [keyof DatosCierre, string][] = [
  ['alcanceReferencia', 'Alcance aprobado: código y revisión'],
  ['cambiosAprobados', 'Cambios aprobados: referencias'],
  ['inicioReal', 'Inicio real'], ['finReal', 'Fin real'],
  ['ejecucionPorItem', 'Ejecución final por ítem'],
  ['verificacion', 'Criterio, método, resultado, verificador y fecha'],
  ['planoReferencia', 'Plano y ubicación referencial del trabajo'],
  ['limpiezaVerificada', 'Limpieza: comprobación, responsable y fecha'],
  ['danosVerificados', 'Daños: comprobación, responsable y fecha'],
  ['pendientes', 'Pendientes, restricciones y acciones'],
  ['entregables', 'Entregables efectivamente entregados'],
  ['conclusion', 'Conclusión técnica declarada'],
  ['autorizacionInterna', 'Autorización interna: actor y referencia'],
];

const ACTA_INICIAL: DatosActa = {
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

const CAMPOS_ACTA: [keyof DatosActa, string][] = [
  ['cierreReferencia', 'Cierre técnico: código y revisión'],
  ['objetoEntrega', 'Objeto breve de la entrega'],
  ['anexosEntregados', 'Documentos y anexos entregados'],
  ['receptor', 'Receptor previsto'], ['organizacion', 'Organización'],
  ['cargo', 'Cargo o calidad'], ['facultad', 'Facultad para recibir'],
  ['observacionesCliente', 'Observaciones del cliente para revisión'],
  ['reservas', 'Reservas propuestas y tratamiento'],
  ['garantiaReferencia', 'Garantía: referencia contractual'],
  ['garantiaCondiciones', 'Cobertura, inicio, duración y exclusiones'],
];

const ENCUESTA_INICIAL: DatosEncuesta = {
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

const PREGUNTAS_ENCUESTA: {
  clave: keyof DatosEncuesta; etiqueta: string; opciones?: string[];
}[] = [
  { clave: 'satisfaccionGeneral', etiqueta: '1. Satisfacción general', opciones: ['Muy insatisfecho', 'Insatisfecho', 'Neutral', 'Satisfecho', 'Muy satisfecho'] },
  { clave: 'resolucion', etiqueta: '2. Problema resuelto completamente', opciones: ['Sí', 'No', 'Parcialmente'] },
  { clave: 'calidadTrabajo', etiqueta: '3. Calidad del trabajo (1 a 10)', opciones: Array.from({ length: 10 }, (_, i) => String(i + 1)) },
  { clave: 'plazoPrometido', etiqueta: '4. Completado en el plazo prometido', opciones: ['Sí', 'No', 'Parcialmente'] },
  { clave: 'comunicacion', etiqueta: '5. Comunicación', opciones: ['Muy deficiente', 'Deficiente', 'Neutral', 'Eficiente', 'Muy eficiente'] },
  { clave: 'profesionalismo', etiqueta: '6. Profesionalismo y respeto', opciones: ['Sí', 'No', 'Parcialmente'] },
  { clave: 'rapidez', etiqueta: '7. Rapidez y eficacia', opciones: ['Muy insatisfecho', 'Insatisfecho', 'Neutral', 'Satisfecho', 'Muy satisfecho'] },
  { clave: 'expectativas', etiqueta: '8. Resultado conforme a expectativas', opciones: ['Sí', 'No', 'Parcialmente'] },
  { clave: 'recomendacion', etiqueta: '9. Probabilidad de recomendar', opciones: ['Nada probable', 'Poco probable', 'Neutral', 'Probable', 'Muy probable'] },
  { clave: 'sugerencias', etiqueta: '10. Sugerencias o comentarios' },
];

export function ModalInformeOT({ isOpen, onClose, orden, proyectoNombre, tipo, puedeRevisar = false }: Props) {
  const emisionDisponible = import.meta.env.VITE_DOCUMENT_ISSUANCE_ENABLED === 'true';
  const esCreador = useAccessStore(s => s.disponible && s.contexto?.creador === true);
  const usuarioId = useAuthStore(s => s.user?.id);
  const cfg = TIPO_CFG[tipo];
  const necesitaFotos =
    cfg.necesitaFotosAntes || cfg.necesitaFotosDespues || cfg.necesitaFotosDurante;
  const muestraTextarea = cfg.labelTextarea !== null;

  const [observaciones, setObservaciones] = useState('');
  const [identificacion, setIdentificacion] = useState<IdentificacionInforme>(() => prepararAutocompletado(orden, proyectoNombre).identificacion);
  const precargaRef = useRef(prepararAutocompletado(orden, proyectoNombre));
  const [avisoFuentes, setAvisoFuentes] = useState('');
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
  const [motivoRevision, setMotivoRevision] = useState('');
  const [congelandoRevision, setCongelandoRevision] = useState(false);
  const [seleccionId, setSeleccionId] = useState<string | null>(null);
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
    // Restablece el editor cuando cambia la identidad de la OT.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHtmlPreview('');
    setPreviewAlto(1123);
    setObservaciones('');
    setIdentificacion(prepararAutocompletado(orden, proyectoNombre).identificacion);
    setAvisoFuentes('');
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
    setSeleccionId(null);
    setVersionBorrador(0);
    setGuardado(null);
    setPersistenciaDisponible(false);
    setErrorBorrador(null);
    solicitudGuardadoRef.current = null;
    solicitudReservaRef.current = null;
    solicitudRevisionRef.current = null;
    // Se reinicia solo al cambiar la identidad de la OT o el tipo de documento.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orden.id, tipo]);

  useEffect(() => {
    if (!emisionDisponible || !isOpen || !documento?.id) return;
    const documentoId = documento.id;
    let cancelado = false;
    cargarEstadoEmision(documentoId).then(estado => {
      if (cancelado) return;
      setCandidatos(estado.candidatos);
      setAprobaciones(estado.aprobaciones);
      setEmisiones(estado.emisiones);
    }).catch(error => {
      if (!cancelado) setErrorEmision(error instanceof Error ? error.message : 'No se pudo cargar el estado documental.');
    });
    return () => { cancelado = true; };
  }, [documento?.id, emisionDisponible, isOpen]);

  useEffect(() => () => {
    if (pdfBlobUrl) URL.revokeObjectURL(pdfBlobUrl);
  }, [pdfBlobUrl]);

  const construirHtml = (textoActual: string): string => {
    const ordenDocumento = ordenParaInforme(orden, identificacion);
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
      const borrador = vigente ? await cargarBorradorDocumento(vigente.id) : null;
      const revisiones = vigente ? await listarRevisionesDocumento(vigente.id) : [];
      const contexto = await cargarFuentesInforme(orden, tipo, documentos);
      return { vigente, borrador, revisiones, disponibles, contexto };
    });

    Promise.all([promFotos, promBorrador])
      .then(([fotos, resultado]) => {
        if (cancelado) return;
        const datos = resultado?.borrador?.datos;
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
        setMotivoRevision('');
        setVersionBorrador(resultado?.borrador?.version ?? 0);
        setGuardado(JSON.stringify({ identificacion: datos?.identificacion ?? (resultado?.borrador ? undefined : identidad), observaciones: texto,
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
          setErrorInforme('No se pudo preparar el informe. Podés reintentar con «Actualizar preview» o cerrar y volver a la OT.');
        })
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
    itemsAlcance,
    itemsAvance,
    itemsCierre,
    identificacion, observaciones, origenServicio, datosVisita, datosRelevamiento, datosAvance, datosCierre, datosActa, datosEncuesta,
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

  const datosBorrador = { identificacion, observaciones, incluirFotos,
    ...(necesitaFotos ? { fotoIds } : {}),
    ...(tipo === 'orden_servicio' ? { origen: origenServicio } : {}),
    ...(tipo === 'visita' ? { visita: datosVisita } : {}),
    ...(tipo === 'relevamiento' ? { relevamiento: datosRelevamiento, itemsAlcance } : {}),
    ...(tipo === 'avance' ? { avance: datosAvance, itemsAvance } : {}),
    ...(tipo === 'cierre' ? { cierre: datosCierre, itemsCierre } : {}),
    ...(tipo === 'acta' ? { acta: datosActa } : {}),
    ...(tipo === 'encuesta' ? { encuesta: datosEncuesta } : {}) };
  const cambiosBorrador = borradorModificado(guardado, datosBorrador);
  const revisionActual = revisiones.find(revision => revision.borrador_version === versionBorrador);
  const tipoRepetible = tipo === 'visita' || tipo === 'relevamiento' || tipo === 'avance' || tipo === 'encuesta';
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

  const handleCongelarRevision = async () => {
    if (!puedeRevisar || !documento || emisiones.length > 0 || !versionBorrador || cambiosBorrador ||
      cargandoComentario || guardandoBorrador || congelandoRevision) return;
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
      setRevisiones(await listarRevisionesDocumento(documento.id));
      setMotivoRevision('');
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
    const recortado = valor;
    setDatosRelevamiento(actual => ({ ...actual, [clave]: recortado }));
    const el = iframeRef.current?.contentDocument?.getElementById(`rel-${clave}`);
    if (el) el.textContent = recortado.trim() || 'No registrado';
  };

  const agregarItemAlcance = () => {
    if (itemsAlcance.length >= 30) return;
    setItemsAlcance(actual => {
      if (actual.length >= 30) return actual;
      return [...actual, { id: siguienteIdItem(actual), trabajo: '', criterio: '' }];
    });
  };

  const actualizarItemAlcance = (id: string, clave: 'trabajo' | 'criterio', valor: string) => {
    const recortado = valor;
    const index = itemsAlcance.findIndex(item => item.id === id);
    setItemsAlcance(actual => actual.map(item => item.id === id
      ? { ...item, [clave]: recortado } : item));
    const el = iframeRef.current?.contentDocument?.getElementById(`rel-item-${index}-${clave}`);
    if (el) el.textContent = recortado.trim() || 'No registrado';
  };

  const agregarItemAvance = () => {
    if (itemsAvance.length >= 30) return;
    setItemsAvance(actual => actual.length >= 30 ? actual
      : [...actual, { id: siguienteIdItem(actual), previsto: '', realizado: '', saldo: '' }]);
  };
  const actualizarItemAvance = (id: string, clave: 'previsto' | 'realizado' | 'saldo', valor: string) => {
    const recortado = valor;
    const index = itemsAvance.findIndex(item => item.id === id);
    setItemsAvance(actual => actual.map(item => item.id === id ? { ...item, [clave]: recortado } : item));
    const el = iframeRef.current?.contentDocument?.getElementById(`av-item-${index}-${clave}`);
    if (el) el.textContent = recortado.trim() || 'No registrado';
  };

  const agregarItemCierre = () => {
    if (itemsCierre.length >= 30) return;
    setItemsCierre(actual => actual.length >= 30 ? actual
      : [...actual, { id: siguienteIdItem(actual), trabajo: '', criterio: '', resultado: '', verificadorFecha: '' }]);
  };
  const actualizarItemCierre = (id: string, clave: 'trabajo' | 'criterio' | 'resultado' | 'verificadorFecha', valor: string) => {
    const recortado = valor;
    const index = itemsCierre.findIndex(item => item.id === id);
    setItemsCierre(actual => actual.map(item => item.id === id ? { ...item, [clave]: recortado } : item));
    const el = iframeRef.current?.contentDocument?.getElementById(`cie-item-${index}-${clave}`);
    if (el) el.textContent = recortado.trim() || 'No registrado';
  };

  const actualizarVisita = (clave: keyof DatosVisita, valor: string) => {
    const recortado = valor;
    setDatosVisita(actual => ({ ...actual, [clave]: recortado }));
    const el = iframeRef.current?.contentDocument?.getElementById(`vis-${clave}`);
    if (el) el.textContent = recortado.trim() || 'No registrado';
  };

  const actualizarAvance = (clave: keyof DatosAvance, valor: string) => {
    if (clave === 'porcentaje' && valor !== '' && (!Number.isFinite(Number(valor)) || Number(valor) < 0 || Number(valor) > 100)) return;
    const recortado = valor;
    setDatosAvance(actual => ({ ...actual, [clave]: recortado }));
    const el = iframeRef.current?.contentDocument?.getElementById(`av-${clave}`);
    if (el) el.textContent = recortado.trim() || 'No registrado';
  };

  const actualizarCierre = (clave: keyof DatosCierre, valor: string) => {
    const recortado = valor;
    setDatosCierre(actual => ({ ...actual, [clave]: recortado }));
    const el = iframeRef.current?.contentDocument?.getElementById(`cie-${clave}`);
    if (el) el.textContent = recortado.trim() || 'No registrado';
  };

  const actualizarActa = (clave: keyof DatosActa, valor: string) => {
    const recortado = valor;
    setDatosActa(actual => ({ ...actual, [clave]: recortado }));
    const el = iframeRef.current?.contentDocument?.getElementById(`act-${clave}`);
    if (el) el.textContent = recortado.trim() || 'No registrado';
  };

  const actualizarEncuesta = (clave: keyof DatosEncuesta, valor: string) => {
    const recortado = valor;
    setDatosEncuesta(actual => ({ ...actual, [clave]: recortado }));
    const el = iframeRef.current?.contentDocument?.getElementById(`enc-${clave}`);
    if (el) el.textContent = recortado.trim() || 'Sin respuesta';
  };

  // ── Render ───────────────────────────────────────────────────────────────
  const revisionEmitible = revisiones.at(-1);
  const candidatoEmitible = candidatos.find(c => c.revision_id === revisionEmitible?.id);
  const aprobacionEmitible = aprobaciones.find(a => a.candidato_id === candidatoEmitible?.id);
  const emisionActual = emisiones.find(e => e.candidato_id === candidatoEmitible?.id);
  const candidatoEmitido = candidatos.find(c => c.id === emisiones[0]?.candidato_id);
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
                  <span>{tipo === 'avance' ? 'Informe de avance' : tipo === 'visita' ? 'Visita que querés documentar' : tipo === 'encuesta' ? 'Encuesta de satisfacción' : 'Informe de relevamiento'}</span>
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
                    <option value="nuevo">{tipo === 'visita' ? (documentosTipo.length ? '+ Registrar otra visita' : '+ Registrar primera visita') : '+ Nuevo borrador'}</option>
                    <option value="continuar" disabled={!documentosTipo.length}>Continuar documento guardado{!documentosTipo.length ? ' · todavía no hay' : ''}</option>
                    <option value="emitido" disabled={!emisionDisponible || !candidatoEmitido}>Ver PDF emitido{!emisionDisponible ? ' · emisión formal no habilitada' : !candidatoEmitido ? ' · todavía no hay' : ''}</option>
                  </select>
                </label>
                {tipo === 'visita' && <p className={styles.sublabel}>Para empezar, elegí «Registrar primera visita». Para continuar o corregir una ya guardada, seleccioná su código. Creá otra solo cuando se realice una nueva visita.</p>}
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
                <section className={styles.section} style={{ gridColumn: '1 / -1', minWidth: 0 }}>
              <div className={styles.sectionTitle}>Datos de la OT y del cliente</div>
              <p className={styles.sublabel}>Datos precargados de la OT, del cliente vinculado y de los documentos anteriores disponibles. Revisalos antes de generar. Las ediciones se guardan solo en este informe.</p>
              {avisoFuentes && <p role="alert">{avisoFuentes}</p>}
              <details>
                <summary>Ver y editar datos de identificación</summary>
                <div className={styles.originGrid}>
                  {CAMPOS_IDENTIFICACION.map(([clave, etiqueta]) => <CampoTextoInforme key={clave} etiqueta={etiqueta} multiline={clave === 'descripcion'} rows={3} value={identificacion[clave]} disabled={cargandoComentario}
                      onChange={value => setIdentificacion(actual => ({ ...actual, [clave]: value }))} placeholder="No registrado"  />)}
                </div>
              </details>
              <button type="button" className={styles.btnSecondary} disabled={cargandoComentario} onClick={() => {
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
                {puedeRevisar && !emisiones.length && versionBorrador > 0 && !revisionActual && (
                  <>
                    {revisiones.length > 0 && (
                      <CampoTextoInforme etiqueta="Motivo de la nueva revisión" multiline value={motivoRevision} maxLength={500}
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
                      Emitido el {new Date(emisiones[0].emitido_en).toLocaleString('es-PY')}.
                      El archivo y su hash quedaron registrados.
                    </p>
                    {candidatoEmitido && (
                      <button type="button" className={styles.btnSecondary}
                        onClick={() => handleVerPdf(candidatoEmitido)} disabled={procesandoDocumento}>
                        Verificar y abrir PDF emitido
                      </button>
                    )}
                  </>
                )}
                {!emisiones.length && revisionEmitible &&
                  revisionEmitible.plantilla_version !== PLANTILLA_CONTROLADA_VERSION && (
                    <p className={styles.sublabel}>
                      Esta revisión usa una plantilla anterior. Guardá una nueva versión del borrador y congelá otra revisión para generar el PDF controlado.
                    </p>
                  )}
                {!emisiones.length && revisionEmitible &&
                  revisionEmitible.plantilla_version === PLANTILLA_CONTROLADA_VERSION && (
                    <>
                      <p className={styles.sublabel}>
                        Revisión R{String(revisionEmitible.revision).padStart(2, '0')} · {documento.codigo}
                      </p>
                      {(!candidatoEmitible || candidatoEmitible.estado !== 'listo') && (
                        <button type="button" className={styles.btnSecondary}
                          onClick={() => handlePrepararPdf(revisionEmitible)} disabled={procesandoDocumento || cambiosBorrador || !revisionActual}>
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
                                disabled={procesandoDocumento || cambiosBorrador || !revisionActual || candidatoEmitible.solicitado_por === usuarioId}>Aprobar este PDF</button>
                              <CampoTextoInforme etiqueta="Motivo si hay observaciones" multiline value={motivoObservacion}
                                maxLength={1000} onChange={setMotivoObservacion} />
                              <button type="button" className={styles.btnSecondary}
                                onClick={() => handleRevisarPdf(candidatoEmitible, 'observado')}
                                disabled={procesandoDocumento || cambiosBorrador || !revisionActual || !motivoObservacion.trim()}>
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
                              disabled={procesandoDocumento || cambiosBorrador || !revisionActual || pdfVerificadoId !== candidatoEmitible.id}>
                              Emitir PDF aprobado
                            </button>
                          )}
                        </>
                      )}
                    </>
                  )}
              </section>
            )}

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
                    <CampoTextoInforme key={clave} etiqueta={etiqueta} type="text" value={origenServicio[clave]} disabled={cargandoComentario}
                        onChange={value => {
                          const valor = value;
                          setOrigenServicio(actual => ({ ...actual, [clave]: valor }));
                          const el = iframeRef.current?.contentDocument?.getElementById(`os-${clave}`);
                          if (el) el.textContent = (clave === 'fechaRecepcion' ? valor.replace('T', ' ') : valor) || 'No registrado';
                        }}
                        placeholder="No registrado"  />
                  ))}
                </div>
                <p className={styles.sublabel}>Son datos del pedido recibido; no acreditan una visita ni un diagnóstico.</p>
              </div>
            )}

            {tipo === 'visita' && (
              <div className={styles.section}>
                <div className={styles.sectionTitle}>Visita técnica realizada</div>
                <div className={styles.originGrid}>
                  {CAMPOS_VISITA.slice(0, 9).map(([clave, etiqueta]) => (
                    <CampoTextoInforme key={clave} etiqueta={etiqueta} type={clave === 'fechaVisita' ? 'date' : clave === 'horaInicio' || clave === 'horaFin' ? 'time' : 'text'}
                        value={datosVisita[clave]}
                        onChange={value => actualizarVisita(clave, value)}
                        disabled={cargandoComentario} placeholder="No registrado"  />
                  ))}
                </div>
                {CAMPOS_VISITA.slice(9).map(([clave, etiqueta]) => (
                  <CampoTextoInforme key={clave} etiqueta={etiqueta} multiline value={datosVisita[clave]}
                      onChange={value => actualizarVisita(clave, value)}
                      disabled={cargandoComentario} rows={2}
                      placeholder="No registrado"  />
                ))}
                <p className={styles.sublabel}>Registrá únicamente una visita que ocurrió. Los nombres de los asistentes no acreditan firmas; este documento sigue siendo borrador.</p>
              </div>
            )}

            {tipo === 'relevamiento' && (
              <div className={styles.section}>
                <div className={styles.sectionTitle}>Hechos y alcance del relevamiento</div>
                <div className={styles.originGrid}>
                  {CAMPOS_RELEVAMIENTO.slice(0, 4).map(([clave, etiqueta]) => (
                    <CampoTextoInforme key={clave} etiqueta={etiqueta} type="text" value={datosRelevamiento[clave]}
                        onChange={value => actualizarRelevamiento(clave, value)}
                        disabled={cargandoComentario} placeholder="No registrado"  />
                  ))}
                </div>
                {CAMPOS_RELEVAMIENTO.slice(4).map(([clave, etiqueta]) => (
                  <CampoTextoInforme key={clave} etiqueta={etiqueta} multiline value={datosRelevamiento[clave]}
                      onChange={value => actualizarRelevamiento(clave, value)}
                      disabled={cargandoComentario} rows={2}
                      placeholder="No registrado"  />
                ))}
                <div className={styles.scopeHeader}>
                  <span className={styles.sectionTitle}>Trabajos y criterios por ítem</span>
                  <button type="button" onClick={agregarItemAlcance}
                    disabled={cargandoComentario || itemsAlcance.length >= 30}>+ Agregar ítem</button>
                </div>
                {itemsAlcance.map(item => (
                  <div className={styles.scopeItem} key={item.id}>
                    <div className={styles.scopeHeader}>
                      <strong>{item.id}</strong>
                      <button type="button" onClick={() => setItemsAlcance(actual => actual.filter(fila => fila.id !== item.id))}
                        disabled={cargandoComentario} aria-label={`Quitar ítem ${item.id}`}>Quitar</button>
                    </div>
                    <CampoTextoInforme etiqueta="Trabajo propuesto" multiline value={item.trabajo} onChange={value => actualizarItemAlcance(item.id, 'trabajo', value)}
                      disabled={cargandoComentario} rows={2} placeholder="Describí una acción concreta" />
                    <CampoTextoInforme etiqueta="Criterio de aceptación propuesto" multiline value={item.criterio} onChange={value => actualizarItemAlcance(item.id, 'criterio', value)}
                      disabled={cargandoComentario} rows={2} placeholder="Cómo se comprobará el resultado" />
                  </div>
                ))}
                <p className={styles.sublabel}>La aprobación del alcance requiere una decisión vinculada a una revisión; este campo solo describe el estado declarado.</p>
              </div>
            )}

            {tipo === 'avance' && (
              <div className={styles.section}>
                <div className={styles.sectionTitle}>Período, base y desvíos</div>
                <div className={styles.originGrid}>
                  {CAMPOS_AVANCE.slice(0, 3).map(([clave, etiqueta]) => (
                    <CampoTextoInforme key={clave} etiqueta={etiqueta} type="text" value={datosAvance[clave]}
                        onChange={value => actualizarAvance(clave, value)}
                        disabled={cargandoComentario} placeholder="No registrado"  />
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
                    <CampoTextoInforme key={clave} etiqueta={etiqueta} multiline value={datosAvance[clave]}
                        onChange={value => actualizarAvance(clave, value)}
                        disabled={cargandoComentario} rows={2}
                        placeholder="No registrado"  />
                  ))}
                <div className={styles.scopeHeader}>
                  <span className={styles.sectionTitle}>Resultado por ítem del alcance</span>
                  <button type="button" onClick={agregarItemAvance}
                    disabled={cargandoComentario || itemsAvance.length >= 30}>+ Agregar ítem</button>
                </div>
                {itemsAvance.map(item => (
                  <div className={styles.scopeItem} key={item.id}>
                    <div className={styles.scopeHeader}>
                      <strong>{item.id}</strong>
                      <button type="button" onClick={() => setItemsAvance(actual => actual.filter(fila => fila.id !== item.id))}
                        disabled={cargandoComentario} aria-label={`Quitar ítem ${item.id}`}>Quitar</button>
                    </div>
                    {([['previsto', 'Previsto para el corte'], ['realizado', 'Realizado y evidencia'],
                      ['saldo', 'Saldo pendiente']] as const).map(([clave, etiqueta]) => (
                      <CampoTextoInforme key={clave} etiqueta={etiqueta} multiline value={item[clave]} onChange={value => actualizarItemAvance(item.id, clave, value)}
                          disabled={cargandoComentario} rows={2} placeholder="No registrado"  />
                    ))}
                  </div>
                ))}
                <p className={styles.sublabel}>El porcentaje se copia de la OT. Revisalo para este corte y completá el método, la base de cálculo y la referencia del alcance aprobado.</p>
              </div>
            )}

            {tipo === 'cierre' && (
              <div className={styles.section}>
                <div className={styles.sectionTitle}>Ejecución y verificación final</div>
                <div className={styles.originGrid}>
                  {CAMPOS_CIERRE.slice(0, 4).map(([clave, etiqueta]) => (
                    <CampoTextoInforme key={clave} etiqueta={etiqueta} type="text" value={datosCierre[clave]}
                        onChange={value => actualizarCierre(clave, value)}
                        disabled={cargandoComentario} placeholder="No registrado"  />
                  ))}
                </div>
                {CAMPOS_CIERRE.slice(4).map(([clave, etiqueta]) => (
                  <CampoTextoInforme key={clave} etiqueta={etiqueta} multiline value={datosCierre[clave]}
                      onChange={value => actualizarCierre(clave, value)}
                      disabled={cargandoComentario} rows={2}
                      placeholder="No registrado"  />
                ))}
                <div className={styles.scopeHeader}>
                  <span className={styles.sectionTitle}>Trabajo y comprobación por ítem</span>
                  <button type="button" onClick={agregarItemCierre}
                    disabled={cargandoComentario || itemsCierre.length >= 30}>+ Agregar ítem</button>
                </div>
                {itemsCierre.map(item => (
                  <div className={styles.scopeItem} key={item.id}>
                    <div className={styles.scopeHeader}>
                      <strong>{item.id}</strong>
                      <button type="button" onClick={() => setItemsCierre(actual => actual.filter(fila => fila.id !== item.id))}
                        disabled={cargandoComentario} aria-label={`Quitar ítem ${item.id}`}>Quitar</button>
                    </div>
                    {([['trabajo', 'Trabajo del alcance (verificar ejecución)'], ['criterio', 'Criterio y método de comprobación'],
                      ['resultado', 'Resultado observado'], ['verificadorFecha', 'Verificador y fecha']] as const)
                      .map(([clave, etiqueta]) => (
                        <CampoTextoInforme key={clave} etiqueta={etiqueta} multiline value={item[clave]} onChange={value => actualizarItemCierre(item.id, clave, value)}
                            disabled={cargandoComentario} rows={2} placeholder="No registrado"  />
                      ))}
                  </div>
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
                      <CampoTextoInforme key={clave} etiqueta={etiqueta} type="text" value={datosActa[clave]}
                          onChange={value => actualizarActa(clave, value)}
                          disabled={cargandoComentario} placeholder="No registrado"  />
                    ))}
                </div>
                {CAMPOS_ACTA.filter(([clave]) => !['cierreReferencia', 'receptor', 'organizacion', 'cargo', 'facultad', 'garantiaReferencia'].includes(clave))
                  .map(([clave, etiqueta]) => (
                    <CampoTextoInforme key={clave} etiqueta={etiqueta} multiline value={datosActa[clave]}
                        onChange={value => actualizarActa(clave, value)}
                        disabled={cargandoComentario} rows={2}
                        placeholder="No registrado"  />
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

            {tipo === 'encuesta' && (
              <div className={styles.section}>
                <div className={styles.sectionTitle}>Encuesta separada del acta</div>
                <div className={styles.originGrid}>
                  {([
                    ['fechaRespuesta', 'Fecha de respuesta declarada'],
                    ['respondente', 'Persona consultada (verificar al responder)'],
                    ['relacionConOT', 'Relación con la OT'],
                    ['modalidad', 'Modalidad de captura'],
                    ['referenciaFuente', 'Referencia al formulario o mensaje de origen'],
                  ] as [keyof DatosEncuesta, string][]).map(([clave, etiqueta]) => (
                    <CampoTextoInforme key={clave} etiqueta={etiqueta} type={clave === 'fechaRespuesta' ? 'date' : 'text'} value={datosEncuesta[clave]}
                        onChange={value => actualizarEncuesta(clave, value)}
                        disabled={cargandoComentario} placeholder="Sin registrar"  />
                  ))}
                </div>
                {PREGUNTAS_ENCUESTA.map(({ clave, etiqueta, opciones }) => (
                  <div className={styles.originField} key={clave}>
                    {opciones && <span>{etiqueta}</span>}
                    {opciones ? <select value={datosEncuesta[clave]}
                      onChange={e => actualizarEncuesta(clave, e.target.value)}
                      disabled={cargandoComentario}>
                      <option value="">Sin respuesta</option>
                      {opciones.map(opcion => <option key={opcion} value={opcion}>{opcion}</option>)}
                    </select> : <CampoTextoInforme etiqueta={etiqueta} multiline value={datosEncuesta[clave]}
                      onChange={value => actualizarEncuesta(clave, value)} disabled={cargandoComentario} rows={3} placeholder="Sin respuesta" />}
                  </div>
                ))}
                <p className={styles.sublabel}>Estas respuestas son un borrador registrado por el equipo. No acreditan por sí solas autoría verificada del cliente ni sustituyen su decisión sobre el acta.</p>
              </div>
            )}

            {muestraTextarea && (
              <div className={styles.section} data-report-section="texto">
                <div className={styles.voiceLabelRow}>
                  <label className={styles.label} htmlFor="obs-informe">{cfg.labelTextarea}</label>
                  <VoiceInputButton
                    value={observaciones}
                    onChange={value => {
                      const nuevoTexto = value;
                      setObservaciones(nuevoTexto);
                      const doc = iframeRef.current?.contentDocument;
                      const el = doc?.getElementById('antecedentes-texto') ?? doc?.getElementById('bloque-texto-naranja');
                      if (el) el.textContent = nuevoTexto || (tipo === 'orden_servicio' ? 'Sin aclaraciones posteriores.' : 'Sin observaciones registradas.');
                      else setHtmlPreview(construirHtml(nuevoTexto));
                    }}

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
                        const nuevoTexto = e.target.value;
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

                      placeholder={cfg.placeholderTextarea}
                    />
                    <div className={styles.contador}>
                      {observaciones.length} caracteres
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
            <div className={styles.previewHeading}>
              {pdfBlobUrl ? (emisiones.length ? 'PDF emitido verificado' : 'PDF candidato verificado · aún no emitido') : 'Vista previa del borrador'}
              {pdfBlobUrl && <div className={styles.documentActions}>
                <a className={styles.btnSecondary} href={pdfBlobUrl}
                  download={`${documento?.codigo ?? 'informe'}_${emisiones.length ? 'emitido' : 'candidato'}.pdf`}>
                  Descargar PDF {emisiones.length ? 'emitido' : 'candidato'}
                </a>
                <button type="button" className={styles.btnSecondary} onClick={() => setPdfBlobUrl(null)}>Volver al borrador</button>
              </div>}
            </div>
            {pdfBlobUrl ? (
              <PdfVerificado url={pdfBlobUrl} />
            ) : htmlPreview ? (
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
