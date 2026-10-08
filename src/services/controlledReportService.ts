// Materializa un candidato desde una revisión y sus fuentes congeladas.
// Debe ejecutarse en el servicio, después de verificar los SHA-256 del registro
// y los bytes de cada foto. El cliente nunca aporta HTML al renderizador.
import { TIPOS_CON_PLANO } from './otStageSchema';
import type { OrdenLocal } from '../types/orden';
import type { RevisionDocumento, TipoDocumento } from './documentService';
import type { ContextoReporteControlado } from './reportTemplates';
import { ordenParaInforme, prepararAutocompletado, restaurarCampos } from './reportAutofillService';
import {
  generarEncuestaSatisfaccion, generarFichaVisita, generarInformeActaConformidad,
  generarInformeAvance, generarInformeCierre, generarInformeOrdenServicio,
  generarInformeRelevamiento,
} from './reportService';
import type {
  DatosActa, DatosAvance, DatosCierre, DatosEncuesta, DatosRelevamiento,
  DatosVisita, ItemAlcance, ItemAvance, ItemCierre, OrigenOrdenServicio,
} from './reportService';

type Registro = Record<string, unknown>;
type Foto = { id: string; file_url: string; descripcion: string | null; descripcion_observacion: string | null };
export const PLANTILLA_CONTROLADA_VERSION = 'expediente-controlado-2026-10-08-datos';
const PLANTILLA_ETAPAS = 'expediente-controlado-2026-10-08';
const PLANTILLA_PLANO = 'expediente-controlado-2026-10-07';
const PLANTILLA_ANTERIOR = 'expediente-controlado-2026-10-04';
const PLANTILLA_LEGACY = 'expediente-controlado-2026-09-29';

function objeto(valor: unknown, etiqueta: string): Registro {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor))
    throw new Error(`${etiqueta} inválido`);
  return valor as Registro;
}

function texto(valor: unknown, etiqueta: string): string {
  if (typeof valor !== 'string') throw new Error(`${etiqueta} inválido`);
  return valor;
}

function camposTexto<T>(valor: unknown, etiqueta: string): T {
  const registro = objeto(valor, etiqueta);
  for (const [clave, dato] of Object.entries(registro))
    if (typeof dato !== 'string') throw new Error(`${etiqueta}.${clave} inválido`);
  return registro as T;
}

function listaTexto<T>(valor: unknown, etiqueta: string): T[] {
  if (valor == null) return [];
  if (!Array.isArray(valor) || valor.length > 100) throw new Error(`${etiqueta} inválido`);
  return valor.map((item, i) => camposTexto<T>(item, `${etiqueta}[${i}]`));
}

export function materializarHtmlControlado(
  revision: RevisionDocumento,
  fuentesValor: unknown,
  imagenesVerificadas: Record<string, string>,
): string {
  const fuentes = objeto(fuentesValor, 'Fuentes');
  if (fuentes.version !== 1) throw new Error('Versión de fuentes no admitida');
  const documento = objeto(fuentes.documento, 'Documento');
  const identidadRevision = objeto(fuentes.revision, 'Identidad de revisión');
  const proyecto = objeto(fuentes.proyecto, 'Proyecto');
  const ordenFuente = objeto(fuentes.orden, 'Orden');
  const codigo = texto(documento.codigo, 'Código');
  const tipo = texto(documento.tipo, 'Tipo') as TipoDocumento;
  if (documento.id !== revision.documento_id || identidadRevision.id !== revision.id ||
      identidadRevision.numero !== revision.revision ||
      identidadRevision.datos_sha256 !== revision.contenido_sha256 ||
      identidadRevision.plantilla_version !== revision.plantilla_version ||
      documento.orden_id !== ordenFuente.id || documento.proyecto_id !== proyecto.id ||
      documento.tenant_id !== proyecto.tenant_id || ordenFuente.proyecto_id !== proyecto.id)
    throw new Error('La revisión y las fuentes no corresponden');
  const anio = Number(/^POT-(\d{4})-/.exec(codigo)?.[1]);
  if (!Number.isInteger(anio) || anio < 2020 || anio > 2100)
    throw new Error('Año documental inválido');
  const contexto: ContextoReporteControlado = { codigo, anio, revision: revision.revision };
  if (![PLANTILLA_CONTROLADA_VERSION, PLANTILLA_ETAPAS, PLANTILLA_PLANO, PLANTILLA_ANTERIOR, PLANTILLA_LEGACY].includes(revision.plantilla_version))
    throw new Error('Versión de plantilla no compatible con este renderizador');
  if (revision.plantilla_version !== PLANTILLA_LEGACY && fuentes.empresa) {
    const empresa = objeto(fuentes.empresa, 'Empresa emisora');
    if (empresa.id !== documento.tenant_id) throw new Error('Empresa emisora ajena al documento');
    const nombre = texto(empresa.nombre, 'Nombre de empresa emisora');
    contexto.emisor = nombre === 'Benítez Bittar Constructora'
      ? `${nombre} / Facility Services` : nombre;
  }
  const datos = objeto(revision.datos, 'Datos de revisión');
  const observaciones = texto(datos.observaciones ?? '', 'Observaciones');
  if (typeof datos.incluirFotos !== 'boolean') throw new Error('Selección de fotos inválida');
  const ids = datos.fotoIds ?? [];
  if (!Array.isArray(ids) || ids.some(id => typeof id !== 'string') || new Set(ids).size !== ids.length)
    throw new Error('IDs de fotos inválidos');
  const fotosFuente = fuentes.fotos;
  if (!Array.isArray(fotosFuente) || fotosFuente.length !== ids.length)
    throw new Error('Las fotos congeladas no coinciden con la revisión');
  const fasePermitida: Record<TipoDocumento, string | null> = {
    orden_servicio: 'ANTES', visita: 'ANTES', relevamiento: 'ANTES',
    avance: 'DURANTE', cierre: 'DESPUES', acta: null, encuesta: null,
  };
  const fotos: Array<Foto & { categoria: string }> = fotosFuente.map((valor, i) => {
    const fuente = objeto(valor, `Foto ${i + 1}`);
    const id = texto(fuente.id, 'ID de foto');
    if (id !== ids[i]) throw new Error('Orden o identidad de foto alterada');
    const categoria = texto(fuente.categoria, 'Categoría de foto');
    if (categoria !== fasePermitida[tipo])
      throw new Error('La categoría de foto no corresponde a este documento');
    const path = texto(fuente.edicion_path, 'Ruta de foto');
    texto(fuente.original_path, 'Ruta de original');
    const fileUrl = imagenesVerificadas[path];
    if (datos.incluirFotos && !/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(fileUrl ?? ''))
      throw new Error('Falta la imagen verificada de una foto seleccionada');
    return {
      id, categoria, file_url: datos.incluirFotos ? fileUrl : '',
      descripcion: fuente.descripcion == null ? null : texto(fuente.descripcion, 'Descripción de foto'),
      descripcion_observacion: fuente.descripcion_observacion == null
        ? null : texto(fuente.descripcion_observacion, 'Observación de foto'),
    };
  });
  const fase = (categoria: string) => datos.incluirFotos ? fotos.filter(f => f.categoria === categoria) : [];
  const antes = fase('ANTES');
  const durante = fase('DURANTE');
  const despues = fase('DESPUES');
  const proyectoNombre = texto(proyecto.nombre, 'Nombre de proyecto');
  const ordenOriginal = ordenFuente as unknown as OrdenLocal;
  // Use only the saved revision and frozen source, never today's customer/OT.
  // Empty strings are intentional edits, just as in the preview editor.
  const identidadGuardada = datos.identificacion === undefined ? undefined
    : camposTexto<Record<string, string>>(datos.identificacion, 'Identificación');
  const orden = revision.plantilla_version === PLANTILLA_LEGACY ? ordenOriginal
    : ordenParaInforme(ordenOriginal, restaurarCampos(
      prepararAutocompletado(ordenOriginal, proyectoNombre).identificacion, identidadGuardada));
  if (revision.plantilla_version === PLANTILLA_PLANO || ([PLANTILLA_CONTROLADA_VERSION,PLANTILLA_ETAPAS].includes(revision.plantilla_version) && TIPOS_CON_PLANO.includes(tipo))) {
    const tienePunto = ordenOriginal.pos_x != null && ordenOriginal.pos_y != null &&
      Number.isFinite(ordenOriginal.pos_x) && Number.isFinite(ordenOriginal.pos_y);
    if (tienePunto) {
      const plano = objeto(datos.planoContexto, 'Referencia visual del plano');
      const imagen = texto(plano.imagen, 'Imagen del plano');
      const ref = texto(plano.planoRef, 'Referencia del plano');
      if (!/^data:image\/(?:jpeg|png);base64,[A-Za-z0-9+/]+={0,2}$/.test(imagen) || imagen.length > 400_000 ||
          ref !== texto(proyecto.plano_url, 'Plano congelado del proyecto') ||
          plano.posX !== ordenOriginal.pos_x || plano.posY !== ordenOriginal.pos_y)
        throw new Error('La referencia visual no coincide con la ubicación congelada de la OT');
      orden.campos = { ...orden.campos, plano_contexto: {
        imagen, planoRef: ref, posX: plano.posX, posY: plano.posY } };
    } else if (datos.planoContexto != null) {
      throw new Error('La OT no tiene un punto válido en el plano');
    }
  }

  switch (tipo) {
    case 'orden_servicio':
      return generarInformeOrdenServicio(orden, observaciones,
        camposTexto<OrigenOrdenServicio>(datos.origen, 'Origen'), codigo, antes, contexto);
    case 'visita':
      return generarFichaVisita(orden, camposTexto<DatosVisita>(datos.visita, 'Visita'), antes, codigo, contexto);
    case 'relevamiento':
      return generarInformeRelevamiento(orden, observaciones, antes,
        camposTexto<DatosRelevamiento>(datos.relevamiento, 'Relevamiento'), codigo,
        listaTexto<ItemAlcance>(datos.itemsAlcance, 'Alcance'), contexto);
    case 'avance':
      return generarInformeAvance(orden, observaciones, antes, durante,
        camposTexto<DatosAvance>(datos.avance, 'Avance'), codigo,
        listaTexto<ItemAvance>(datos.itemsAvance, 'Items de avance'), contexto);
    case 'cierre':
      return generarInformeCierre(orden, proyectoNombre, observaciones, antes, despues,
        camposTexto<DatosCierre>(datos.cierre, 'Cierre'), codigo,
        listaTexto<ItemCierre>(datos.itemsCierre, 'Items de cierre'), contexto);
    case 'acta':
      return generarInformeActaConformidad(orden, camposTexto<DatosActa>(datos.acta, 'Acta'), codigo, contexto);
    case 'encuesta':
      return generarEncuestaSatisfaccion(orden, camposTexto<DatosEncuesta>(datos.encuesta, 'Encuesta'), codigo, contexto);
    default:
      throw new Error('Tipo documental no admitido');
  }
}
