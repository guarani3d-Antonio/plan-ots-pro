import type { TipoDocumento } from './documentService';
import type { IdentificacionInforme } from './reportAutofillService';

export interface VinculoInforme { id: string; nombre: string; detalle?: string }
export interface ContextoCamposInforme {
  identificacion: IdentificacionInforme;
  protegidos: Record<string, string>;
  items: Record<string, string>[] | null;
  vinculos: Record<string, string>;
  opciones: Record<string, VinculoInforme[]>;
}

export const IDENTIFICACION_EDITABLE = new Set(['ubicacion']);
export const CAMPOS_HEREDADOS: Record<TipoDocumento, string[]> = {
  orden_servicio: [],
  visita: ['edificio','unidad','propietario','contacto','responsableVisita'],
  relevamiento: ['tecnico','visitaReferencia','antecedentes'],
  avance: ['alcanceReferencia'],
  cierre: ['alcanceReferencia','inicioReal','finReal','cambiosAprobados','autorizacionInterna'],
  acta: ['receptor','documentoReceptor','organizacion','cierreReferencia','objetoEntrega','anexosEntregados','garantiaReferencia','garantiaCondiciones'],
  encuesta: ['respondente'],
};
export const CAMPOS_VINCULADOS: Partial<Record<TipoDocumento, Record<string, string>>> = {
  visita: { responsableVisita: 'tecnico' },
  relevamiento: { tecnico: 'tecnico', visitaReferencia: 'visita' },
  avance: { alcanceReferencia: 'relevamiento' },
  cierre: { alcanceReferencia: 'relevamiento' },
  acta: { receptor: 'receptor', cierreReferencia: 'cierre' },
  encuesta: { respondente: 'respondente' },
};
export const CLAVE_DATOS = (tipo: TipoDocumento) => tipo === 'orden_servicio' ? 'origen' : tipo;
const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};

// Apply only to a new/corrected draft. Never pass a conserved revision here.
export function aplicarContextoCampos(tipo: TipoDocumento, datos: Record<string, unknown>, contexto: ContextoCamposInforme): Record<string, unknown> {
  const identidad = object(datos.identificacion);
  const key = CLAVE_DATOS(tipo);
  const result: Record<string, unknown> = {
    ...datos, politicaCampos: 1, vinculos: contexto.vinculos,
    identificacion: { ...contexto.identificacion,
      ubicacion: typeof identidad.ubicacion === 'string' ? identidad.ubicacion : contexto.identificacion.ubicacion },
    [key]: { ...object(datos[key]), ...contexto.protegidos },
  };
  if (contexto.items !== null && ['avance', 'cierre'].includes(tipo)) {
    const itemKey = tipo === 'avance' ? 'itemsAvance' : 'itemsCierre';
    const actual = Array.isArray(datos[itemKey]) ? datos[itemKey] as Record<string, unknown>[] : [];
    result[itemKey] = contexto.items.map(item => ({
      ...object(actual.find(i => i.id === item.id)), ...item,
      ...(tipo === 'avance' ? {
        realizado: String(actual.find(i => i.id === item.id)?.realizado ?? ''),
        saldo: String(actual.find(i => i.id === item.id)?.saldo ?? ''),
      } : {
        resultado: String(actual.find(i => i.id === item.id)?.resultado ?? ''),
        verificadorFecha: String(actual.find(i => i.id === item.id)?.verificadorFecha ?? ''),
      }),
    }));
  }
  return result;
}
