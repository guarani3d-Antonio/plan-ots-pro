import { supabase } from '../db/supabase';
import { assertSession, identityId, sessionTicket } from '../security/sessionScope';
import { useAssistantStore } from '../stores/assistantStore';

export type AssistantProvider = 'openai' | 'anthropic';
export interface AssistantModel { provider: AssistantProvider; id: string; name: string; inputUsd: number; outputUsd: number }
export interface AssistantStatus {
  installed: boolean; ready: boolean; connected: boolean;
  provider?: AssistantProvider; model?: string; hint?: string;
  budgetUsd?: number; usedUsd?: number; models: AssistantModel[];
  usage?: AssistantUsage | null;
  verification?: { verifiedAt: string | null; lastAttemptState: string } | null;
}
export interface AssistantUsage {
  month: string; requests: number; inputTokens: number; outputTokens: number;
  unknownTokenRequests: number; pendingRequests: number; confirmedUsd: number; reservedUsd: number;
  recent: { id: string; created_at: string; provider: string | null; model: string | null; state: string; input_tokens: number | null; output_tokens: number | null; charged_micro: number | null; reserved_micro: number }[];
}
export interface AssistantQuote { token: string; maximumUsd: number; expiresAt: string; model: string }
export interface AssistantMessage { role: 'user' | 'assistant'; content: string }
const unavailable: AssistantStatus = { installed: false, ready: false, connected: false, models: [] };
const assistantServerEnabled = import.meta.env.VITE_PERSONAL_ASSISTANT_SERVICE_ENABLED === 'true';
let connectionEpoch = 0;

async function invoke<T>(body: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
  const ticket = sessionTicket();
  const { data, error } = await supabase.functions.invoke('mi-asistente', { body, signal });
  assertSession(ticket);
  if (error) {
    const response = (error as { context?: Response }).context;
    if (response instanceof Response) {
      let message = 'No se pudo completar la consulta.';
      try { const parsed = await response.clone().json(); if (typeof parsed.error === 'string') message = parsed.error; } catch { /* no provider payloads */ }
      if (response.status === 404) throw new Error('El servicio de IA personal todavía no está instalado. Los comandos de navegación siguen disponibles.');
      throw new Error(message);
    }
    if (signal?.aborted) throw new Error('Consulta cancelada.');
    throw new Error('No se pudo contactar al servicio de IA. Verificá la conexión; no se reintenta automáticamente.');
  }
  if (!data || typeof data !== 'object') throw new Error('El servicio devolvió una respuesta inválida.');
  return data as T;
}
export async function getAssistantStatus(signal?: AbortSignal): Promise<AssistantStatus> {
  // The interface and local commands can be released before private custody.
  // Do not contact a missing endpoint or request keys during that first phase.
  const owner = identityId();
  const epoch = connectionEpoch;
  try {
    const result = assistantServerEnabled ? await invoke<AssistantStatus>({ action: 'status' }, signal) : unavailable;
    if (!signal?.aborted && epoch === connectionEpoch && owner && identityId() === owner) useAssistantStore.setState({ connectionOwner: owner, connectionStatus: result, connectionError: false });
    return result;
  } catch (error) {
    if (!signal?.aborted && epoch === connectionEpoch && owner && identityId() === owner) useAssistantStore.setState(state => ({ connectionOwner: owner, connectionStatus: state.connectionOwner === owner ? state.connectionStatus : null, connectionError: true }));
    if (error instanceof Error && error.message.includes('todavía no está instalado')) return unavailable;
    throw error;
  }
}
export async function saveAssistantConnection(options: { provider: AssistantProvider; model: string; apiKey: string; budgetUsd: number; consent: boolean }, signal?: AbortSignal) {
  connectionEpoch++;
  const owner = identityId();
  const result = await invoke<AssistantStatus>({ action: 'connect', ...options }, signal);
  if (owner && identityId() === owner) useAssistantStore.setState({ connectionOwner: owner, connectionStatus: result, connectionError: false });
  return result;
}
export async function disconnectAssistant(signal?: AbortSignal) {
  connectionEpoch++;
  const owner = identityId(); const result = await invoke<AssistantStatus>({ action: 'disconnect' }, signal);
  if (owner && identityId() === owner) useAssistantStore.setState({ connectionOwner: owner, connectionStatus: result, connectionError: false });
  return result;
}
export function previewPersonalAssistant(messages: AssistantMessage[], signal?: AbortSignal) {
  return invoke<AssistantQuote>({ action: 'preview', messages: messages.slice(-8) }, signal);
}
export async function askPersonalAssistant(messages: AssistantMessage[], quote: string, signal?: AbortSignal) {
  const owner = identityId();
  try {
    const result = await invoke<{ text: string; costUsd: number }>({ action: 'chat', quote, messages: messages.slice(-8) }, signal);
    // Refresh from the ledger so a concurrent key change cannot turn a new,
    // unverified credential orange using a response from the previous key.
    if (!signal?.aborted && owner && identityId() === owner) {
      connectionEpoch++;
      void getAssistantStatus(signal).catch(() => { /* status indicator reports the failure */ });
    }
    return result;
  } catch (error) {
    if (!signal?.aborted && owner && identityId() === owner) useAssistantStore.setState(state => ({ connectionOwner: owner, connectionStatus: state.connectionOwner === owner ? state.connectionStatus : null, connectionError: true }));
    throw error;
  }
}
