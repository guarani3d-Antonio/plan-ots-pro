import { supabase } from '../db/supabase';
import { assertSession, sessionTicket } from '../security/sessionScope';

// Identidad y borradores del expediente. Los RPC no emiten ni firman documentos.
export type TipoDocumento = 'orden_servicio' | 'relevamiento' | 'avance' | 'cierre' | 'acta';

export interface DocumentoRegistro {
  id: string;
  tenant_id: string;
  proyecto_id: string;
  orden_id: string;
  ciclo: number;
  tipo: TipoDocumento;
  folio: number | string;
  codigo: string;
  creado_por: string;
  creado_en: string;
}

export interface BorradorDocumento {
  documento_id: string;
  datos: Record<string, unknown>;
  version: number;
  actualizado_por: string;
  actualizado_en: string;
}

export interface RevisionDocumento {
  id: string;
  documento_id: string;
  revision: number;
  borrador_version: number;
  datos: Record<string, unknown>;
  motivo: string | null;
  esquema_version: number;
  plantilla_version: string;
  contenido_sha256: string;
  creada_por: string;
  creada_en: string;
}

function errorDocumento(error: { code?: string; message: string }): Error {
  if (error.code === '40001') {
    return new Error('El borrador cambió en otra sesión. Volvé a cargarlo antes de guardar o congelar.');
  }
  return new Error(error.message);
}

export async function listarDocumentosDeOrden(ordenId: string): Promise<DocumentoRegistro[]> {
  const ticket = sessionTicket();
  const documentos: DocumentoRegistro[] = [];
  for (let from = 0; ; from += 500) {
    const { data, error } = await supabase.from('plan_documentos').select('*')
      .eq('orden_id', ordenId).order('creado_en', { ascending: true })
      .order('id', { ascending: true }).range(from, from + 499);
    assertSession(ticket);
    if (error) throw errorDocumento(error);
    documentos.push(...(data as DocumentoRegistro[]));
    if (data.length < 500) return documentos;
  }
}

export async function cargarBorradorDocumento(documentoId: string): Promise<BorradorDocumento | null> {
  const ticket = sessionTicket();
  const { data, error } = await supabase.from('plan_documento_borradores').select('*')
    .eq('documento_id', documentoId).maybeSingle();
  assertSession(ticket);
  if (error) throw errorDocumento(error);
  return (data ?? null) as BorradorDocumento | null;
}

export async function listarRevisionesDocumento(documentoId: string): Promise<RevisionDocumento[]> {
  const ticket = sessionTicket();
  const revisiones: RevisionDocumento[] = [];
  for (let from = 0; ; from += 500) {
    const { data, error } = await supabase.from('plan_documento_revisiones').select('*')
      .eq('documento_id', documentoId).order('revision', { ascending: true })
      .range(from, from + 499);
    assertSession(ticket);
    if (error) throw errorDocumento(error);
    revisiones.push(...(data as RevisionDocumento[]));
    if (data.length < 500) return revisiones;
  }
}

export async function reservarDocumento(
  ordenId: string, tipo: TipoDocumento, ciclo: number, solicitudId: string,
): Promise<DocumentoRegistro> {
  const ticket = sessionTicket();
  const { data, error } = await supabase.rpc('plan_documento_reservar', {
    p_orden: ordenId, p_tipo: tipo, p_ciclo: ciclo, p_solicitud: solicitudId,
  });
  assertSession(ticket);
  if (error) throw errorDocumento(error);
  return data as DocumentoRegistro;
}

export async function guardarBorradorDocumento(
  documentoId: string, datos: Record<string, unknown>, version: number, solicitudId: string,
): Promise<BorradorDocumento> {
  const ticket = sessionTicket();
  const { data, error } = await supabase.rpc('plan_documento_borrador_guardar', {
    p_documento: documentoId, p_datos: datos, p_version: version, p_solicitud: solicitudId,
  });
  assertSession(ticket);
  if (error) throw errorDocumento(error);
  return data as BorradorDocumento;
}

export async function congelarRevisionDocumento(
  documentoId: string, version: number, motivo: string | null,
  esquemaVersion: number, plantillaVersion: string, solicitudId: string,
): Promise<RevisionDocumento> {
  const ticket = sessionTicket();
  const { data, error } = await supabase.rpc('plan_documento_revision_congelar', {
    p_documento: documentoId, p_version: version, p_motivo: motivo,
    p_esquema: esquemaVersion, p_plantilla: plantillaVersion, p_solicitud: solicitudId,
  });
  assertSession(ticket);
  if (error) throw errorDocumento(error);
  return data as RevisionDocumento;
}
