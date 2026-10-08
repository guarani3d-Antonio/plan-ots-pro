import type { OrdenLocal } from '../types/orden';
import type { DatosVisita, DatosRelevamiento, DatosAvance, DatosCierre, DatosActa, DatosEncuesta, OrigenOrdenServicio } from './reportService';

export interface ClienteInforme {
  cliente_id: string; ubicacion_id: string; nombre: string;
  identificacion?: string | null; contacto?: string | null; telefono?: string | null;
  correo?: string | null; domicilio?: string | null; nombre_obra?: string | null;
  direccion_obra?: string | null; piso?: string | null; unidad?: string | null; sector?: string | null;
}
export type FuentesInforme = Partial<Record<'orden_servicio' | 'visita' | 'relevamiento' | 'avance' | 'cierre', Record<string, unknown>>>;
export const CAMPOS_IDENTIFICACION = [
  ['obra', 'Obra'], ['unidad_amenities', 'Unidad o sector'], ['ubicacion', 'Ubicación referencial'],
  ['responsable', 'Responsable asignado'], ['rubro', 'Rubro'], ['fecha_ingreso', 'Fecha de ingreso de la OT'],
  ['cliente', 'Cliente'], ['identificacion', 'RUC o documento del cliente'], ['contacto', 'Persona de contacto'],
  ['telefono', 'Teléfono'], ['correo', 'Correo'], ['domicilio', 'Domicilio del cliente'],
  ['direccion_obra', 'Dirección de la obra'], ['piso', 'Piso'], ['descripcion', 'Solicitud original'],
] as const;
export type IdentificacionInforme = Record<typeof CAMPOS_IDENTIFICACION[number][0], string>;
export const textoFuente = (value: unknown): string => typeof value === 'string' ? value : '';
export const objetoFuente = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};

// Copy strings verbatim: an explicitly saved empty string is also an edit.
export function restaurarCampos<T extends Record<string, string>>(inicial: T, guardado: unknown): T {
  const saved = objetoFuente(guardado);
  const result = { ...inicial };
  for (const key of Object.keys(inicial) as (keyof T)[])
    if (typeof saved[String(key)] === 'string') result[key] = saved[String(key)] as T[keyof T];
  return result;
}

export function prepararAutocompletado(orden: OrdenLocal, proyectoNombre: string,
  cliente: ClienteInforme | null = null, fuentes: FuentesInforme = {}) {
  // Never select an arbitrary unit belonging to the same customer.
  const c = cliente?.cliente_id === orden.cliente_id && cliente?.ubicacion_id === orden.cliente_ubicacion_id ? cliente : null;
  const campo = (key: string) => textoFuente(orden.campos?.[key]);
  const v = objetoFuente(fuentes.visita?.visita);
  const r = objetoFuente(fuentes.relevamiento?.relevamiento);
  const a = objetoFuente(fuentes.avance?.avance);
  const cierreAnterior = objetoFuente(fuentes.cierre?.cierre);
  const identificacion: IdentificacionInforme = {
    obra: textoFuente(orden.obra) || textoFuente(c?.nombre_obra) || proyectoNombre,
    unidad_amenities: textoFuente(orden.unidad_amenities) || textoFuente(c?.unidad) || textoFuente(c?.sector),
    ubicacion: textoFuente(orden.ubicacion), responsable: textoFuente(orden.responsable),
    rubro: textoFuente(orden.rubro), fecha_ingreso: textoFuente(orden.fecha_ingreso),
    descripcion: textoFuente(orden.descripcion), cliente: textoFuente(c?.nombre) || campo('solicitante'),
    identificacion: textoFuente(c?.identificacion), contacto: textoFuente(c?.contacto) || campo('contacto_solicitante'),
    telefono: textoFuente(c?.telefono), correo: textoFuente(c?.correo), domicilio: textoFuente(c?.domicilio),
    direccion_obra: textoFuente(c?.direccion_obra), piso: textoFuente(c?.piso),
  };
  const origen: OrigenOrdenServicio = {
    canal: campo('canal_solicitud'), fechaRecepcion: campo('fecha_solicitud'),
    solicitante: campo('solicitante') || identificacion.cliente,
    contacto: campo('contacto_solicitante') || identificacion.telefono || identificacion.correo || identificacion.contacto,
    referencia: campo('referencia_solicitud'), urgencia: campo('urgencia_solicitada'), proximoPaso: campo('proximo_paso'),
    ...objetoFuente(fuentes.orden_servicio?.origen),
  };
  const visita: Partial<DatosVisita> = { propietario: origen.solicitante, contacto: origen.contacto,
    edificio: identificacion.obra, unidad: identificacion.unidad_amenities || identificacion.ubicacion,
    responsableVisita: identificacion.responsable, descripcion: identificacion.descripcion,
    compromisos: origen.proximoPaso };
  const relevamiento: Partial<DatosRelevamiento> = {
    tecnico: textoFuente(v.responsableVisita) || identificacion.responsable,
    fechaIntervencion: textoFuente(v.fechaVisita), participantes: textoFuente(v.participantes),
    antecedentes: identificacion.descripcion, condiciones: textoFuente(v.restricciones),
    hallazgos: textoFuente(v.observacionesTecnicas), planoReferencia: identificacion.ubicacion,
  };
  const avance: Partial<DatosAvance> = {
    porcentaje: typeof orden.porcentaje_avance === 'number' ? String(orden.porcentaje_avance) : '',
  };
  const cierre: Partial<DatosCierre> = {
    inicioReal: textoFuente(orden.fecha_inicio_trabajos).slice(0,10), finReal: textoFuente(orden.fecha_fin_trabajos).slice(0,10),
    planoReferencia: textoFuente(r.planoReferencia) || identificacion.ubicacion,
    // References are carried only when explicitly recorded; a draft's code is not an approval.
    alcanceReferencia: textoFuente(a.alcanceReferencia),
  };
  const acta: Partial<DatosActa> = { receptor: identificacion.cliente,
    objetoEntrega: textoFuente(cierreAnterior.ejecucionPorItem), anexosEntregados: textoFuente(cierreAnterior.entregables) };
  const encuesta: Partial<DatosEncuesta> = { respondente: identificacion.cliente };
  const alcance = Array.isArray(fuentes.relevamiento?.itemsAlcance) ? fuentes.relevamiento.itemsAlcance : [];
  const itemsAvance = alcance.map(item => { const i = objetoFuente(item); return {
    id: textoFuente(i.id), previsto: textoFuente(i.trabajo), realizado: '', saldo: '',
  }; });
  const itemsCierre = alcance.map(item => { const i = objetoFuente(item); return {
    id: textoFuente(i.id), trabajo: textoFuente(i.trabajo), criterio: textoFuente(i.criterio), resultado: '', verificadorFecha: '',
  }; });
  return { identificacion, origen, visita, relevamiento, avance, cierre, acta, encuesta,
    itemsAvance, itemsCierre, observaciones: textoFuente(orden.comentarios) };
}

export function ordenParaInforme(orden: OrdenLocal, identificacion: IdentificacionInforme): OrdenLocal {
  return { ...orden, obra: identificacion.obra, unidad_amenities: identificacion.unidad_amenities,
    ubicacion: identificacion.ubicacion, responsable: identificacion.responsable, rubro: identificacion.rubro,
    fecha_ingreso: identificacion.fecha_ingreso, descripcion: identificacion.descripcion,
    campos: { ...orden.campos, identificacion_informe: { ...identificacion } } };
}
