import type { OrdenLocal } from '../types/orden';
import { supabase } from '../db/supabase';
import { sessionTicket, assertSession } from '../security/sessionScope';
import { cargarBorradorDocumento, type DocumentoRegistro, type TipoDocumento } from './documentService';
import type { ClienteInforme, FuentesInforme } from './reportAutofillService';

const PREVIOS: Record<TipoDocumento, (keyof FuentesInforme)[]> = {
  orden_servicio: [], visita: [], relevamiento: ['visita'], avance: ['relevamiento'],
  cierre: ['relevamiento', 'avance'], acta: ['cierre'], encuesta: [],
};
export async function cargarFuentesInforme(orden: OrdenLocal, tipo: TipoDocumento, documentos: DocumentoRegistro[]) {
  const ticket = sessionTicket();
  const avisos: string[] = [];
  const fuentes: FuentesInforme = {};
  const previos = Promise.all(PREVIOS[tipo].map(async tipoPrevio => {
    const doc = documentos.filter(d => d.tipo === tipoPrevio && d.orden_id === orden.id && d.ciclo === 1)
      .sort((a, b) => a.creado_en.localeCompare(b.creado_en)).at(-1);
    if (!doc) return;
    try { const borrador = await cargarBorradorDocumento(doc.id); if (borrador) fuentes[tipoPrevio] = borrador.datos; }
    catch { avisos.push(`No se pudieron recuperar los datos del documento de ${tipoPrevio}.`); }
  }));
  let cliente: ClienteInforme | null = null;
  if (orden.cliente_id && orden.cliente_ubicacion_id) {
    const { data, error } = await supabase.rpc('plan_clientes_para_obra', { p_proyecto: orden.proyecto_id });
    if (error) avisos.push('No se pudieron recuperar los datos del cliente vinculado.');
    else {
      cliente = ((data ?? []) as ClienteInforme[]).find(c => c.cliente_id === orden.cliente_id && c.ubicacion_id === orden.cliente_ubicacion_id) ?? null;
      if (!cliente) avisos.push('La ubicación vinculada del cliente no está disponible en el directorio.');
    }
  }
  await previos;
  assertSession(ticket);
  return { cliente, fuentes, avisos };
}
