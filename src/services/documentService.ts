import { supabase } from '../db/supabase';
import { assertSession, sessionTicket } from '../security/sessionScope';

// Identidad y borradores del expediente. Los RPC no emiten ni firman documentos.
export type TipoDocumento = 'orden_servicio' | 'visita' | 'relevamiento' | 'avance' | 'cierre' | 'acta' | 'encuesta';

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

export interface CandidatoDocumento {
  id: string;
  revision_id: string;
  documento_id: string;
  estado: 'preparando' | 'listo' | 'fallido';
  pdf_path: string | null;
  pdf_sha256: string | null;
  pdf_bytes: number | null;
  solicitado_por: string;
  listo_en: string | null;
}

export interface AprobacionDocumento {
  id: string;
  candidato_id: string;
  decision: 'aprobado' | 'observado';
  pdf_sha256: string;
  motivo: string | null;
  decidido_por: string;
  decidido_en: string;
}

export interface EmisionDocumento {
  id: string;
  candidato_id: string;
  documento_id: string;
  revision_id: string;
  pdf_path: string;
  pdf_sha256: string;
  pdf_bytes: number;
  emitido_en: string;
}

export async function cargarEstadoEmision(documentoId: string): Promise<{
  candidatos: CandidatoDocumento[];
  aprobaciones: AprobacionDocumento[];
  emisiones: EmisionDocumento[];
}> {
  const ticket = sessionTicket();
  const { data: candidatos, error: errorCandidatos } = await supabase
    .from('plan_documento_candidatos').select('*').eq('documento_id', documentoId);
  assertSession(ticket);
  if (errorCandidatos) throw errorDocumento(errorCandidatos);
  const ids = (candidatos ?? []).map(candidato => candidato.id as string);
  const { data: aprobaciones, error: errorAprobaciones } = ids.length
    ? await supabase.from('plan_documento_aprobaciones').select('*').in('candidato_id', ids)
    : { data: [], error: null };
  assertSession(ticket);
  if (errorAprobaciones) throw errorDocumento(errorAprobaciones);
  const { data: emisiones, error: errorEmisiones } = await supabase
    .from('plan_documento_emisiones').select('*').eq('documento_id', documentoId);
  assertSession(ticket);
  if (errorEmisiones) throw errorDocumento(errorEmisiones);
  return {
    candidatos: (candidatos ?? []) as CandidatoDocumento[],
    aprobaciones: (aprobaciones ?? []) as AprobacionDocumento[],
    emisiones: (emisiones ?? []) as EmisionDocumento[],
  };
}

export async function generarCandidatoPdf(revisionId: string, solicitudId: string):
  Promise<{ candidatoId: string; estado: 'procesando' | 'listo'; pdfSha256?: string }> {
  const ticket = sessionTicket();
  const { data, error } = await supabase.functions.invoke('render-documento', {
    body: { revisionId, solicitudId },
  });
  assertSession(ticket);
  if (error || !data?.candidatoId) throw new Error(data?.error ?? error?.message ?? 'No se pudo generar el PDF.');
  return data;
}

export async function descargarCandidatoVerificado(candidato: CandidatoDocumento): Promise<Blob> {
  if (candidato.estado !== 'listo' || !candidato.pdf_path || !candidato.pdf_sha256)
    throw new Error('El PDF todavía no está listo');
  const ticket = sessionTicket();
  const { data, error } = await supabase.storage.from('exports')
    .createSignedUrl(candidato.pdf_path, 60);
  assertSession(ticket);
  if (error || !data?.signedUrl) throw new Error(error?.message ?? 'No se pudo abrir el PDF privado');
  const { descargarPdfVerificado } = await import('./verifiedPdfDownload');
  const blob = await descargarPdfVerificado(data.signedUrl, candidato.pdf_bytes, candidato.pdf_sha256);
  assertSession(ticket);
  return blob;
}

export async function revisarCandidatoPdf(candidatoId: string, hash: string,
  decision: 'aprobado' | 'observado', motivo: string | null, solicitudId: string):
  Promise<AprobacionDocumento> {
  const ticket = sessionTicket();
  const { data, error } = await supabase.rpc('plan_documento_revisar_pdf', {
    p_candidato: candidatoId, p_sha256: hash, p_decision: decision,
    p_motivo: motivo, p_solicitud: solicitudId,
  });
  assertSession(ticket);
  if (error) throw errorDocumento(error);
  return data as AprobacionDocumento;
}

export async function emitirCandidatoPdf(candidatoId: string, solicitudId: string):
  Promise<EmisionDocumento> {
  const ticket = sessionTicket();
  const { data, error } = await supabase.rpc('plan_documento_emitir', {
    p_candidato: candidatoId, p_solicitud: solicitudId,
  });
  assertSession(ticket);
  if (error) throw errorDocumento(error);
  return data as EmisionDocumento;
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
