import { supabase } from '../db/supabase';
import { assertSession, sessionTicket } from '../security/sessionScope';

export type AssistantProvider = 'openai' | 'anthropic';
export interface AssistantModel { provider: AssistantProvider; id: string; name: string; inputUsd: number; outputUsd: number }
export interface AssistantStatus {
  installed: boolean; ready: boolean; connected: boolean;
  provider?: AssistantProvider; model?: string; hint?: string;
  budgetUsd?: number; usedUsd?: number; models: AssistantModel[];
  usage?: AssistantUsage | null;
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
  if (!assistantServerEnabled) return unavailable;
  try { return await invoke<AssistantStatus>({ action: 'status' }, signal); }
  catch (error) { if (error instanceof Error && error.message.includes('todavía no está instalado')) return unavailable; throw error; }
}
export function saveAssistantConnection(options: { provider: AssistantProvider; model: string; apiKey: string; budgetUsd: number; consent: boolean }, signal?: AbortSignal) {
  return invoke<AssistantStatus>({ action: 'connect', ...options }, signal);
}
export function disconnectAssistant(signal?: AbortSignal) { return invoke<AssistantStatus>({ action: 'disconnect' }, signal); }
export function previewPersonalAssistant(messages: AssistantMessage[], signal?: AbortSignal) {
  return invoke<AssistantQuote>({ action: 'preview', messages: messages.slice(-8) }, signal);
}
export function askPersonalAssistant(messages: AssistantMessage[], quote: string, signal?: AbortSignal) {
  return invoke<{ text: string; costUsd: number }>({ action: 'chat', quote, messages: messages.slice(-8) }, signal);
}
