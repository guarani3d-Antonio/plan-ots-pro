import { createClient } from 'npm:@supabase/supabase-js@2';
import { ASSISTANT_MODELS, assistantModel, validateAssistantMessages, reserveMicroUsd, actualMicroUsd, encryptAssistantKey, decryptAssistantKey, providerRequest, providerResult } from '../_shared/assistant-protocol.mjs';
import { createQuote, verifyQuote } from '../_shared/assistant-quote.mjs';
import { assistantVerification } from '../_shared/assistant-verification.mjs';

const origin = 'https://plan-ots-pro.pages.dev';
const cors = { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: cors });
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'POST' || request.headers.get('origin') !== origin) return json({ error: 'Origen o método no permitido.' }, 403);
  const authorization = request.headers.get('authorization') ?? '';
  const url = Deno.env.get('SUPABASE_URL'), anon = Deno.env.get('SUPABASE_ANON_KEY'), service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!authorization.startsWith('Bearer ') || !url || !anon || !service) return json({ error: 'Sesión requerida.' }, 401);
  const userClient = createClient(url, anon, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false, autoRefreshToken: false } });
  const { data: identity, error: identityError } = await userClient.auth.getUser(authorization.slice(7));
  if (identityError || !identity.user) return json({ error: 'Sesión inválida.' }, 401);
  const access = await userClient.rpc('plan_contexto_acceso');
  if (access.error || !access.data || (!access.data.creador && !access.data.empresas?.length)) return json({ error: 'Cuenta sin acceso activo a Plan-OTs.' }, 403);
  let body: Record<string, unknown>;
  try { const text = await request.text(); if (text.length > 24000) return json({ error: 'Consulta demasiado extensa.' }, 413); body = JSON.parse(text); if (!body || Array.isArray(body) || typeof body !== 'object') throw new Error(); }
  catch { return json({ error: 'Solicitud inválida.' }, 400); }
  const action = body.action;
  if (!['status', 'connect', 'disconnect', 'preview', 'chat'].includes(String(action))) return json({ error: 'Acción no admitida.' }, 400);
  const owner = identity.user.id;
  const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
  const master = Deno.env.get('ASSISTANT_MASTER_KEY') ?? '';
  const ready = Deno.env.get('ASSISTANT_ENABLED') === 'true' && /^[A-Za-z0-9+/]{43}=$/.test(master);
  const current = await admin.from('plan_asistente_cuentas').select('*').eq('user_id', owner).maybeSingle();
  if (current.error) return action === 'status' ? json({ installed: false, ready: false, connected: false, models: ASSISTANT_MODELS }) : json({ error: 'Falta instalar el servicio de IA personal.' }, 503);
  const account = current.data;
  const month = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Asuncion', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()).slice(0, 7);
  const status = (row = account) => ({ installed: true, ready, connected: !!row?.enabled, provider: row?.provider, model: row?.model, hint: row?.hint, budgetUsd: (row?.budget_micro ?? 50000) / 1e6, usedUsd: row?.month?.slice(0, 7) === month ? row.used_micro / 1e6 : 0, models: ASSISTANT_MODELS });
  if (action === 'status') {
    const usage = await admin.rpc('plan_asistente_consumo', { p_user: owner });
    const latest = account?.enabled ? await admin.from('plan_asistente_consultas').select('created_at,state,provider,model').eq('user_id', owner).eq('provider', account.provider).eq('model', account.model).gte('created_at', account.updated_at).order('created_at', { ascending: false }).limit(1).maybeSingle() : null;
    return json({ ...status(), usage: usage.error ? null : usage.data, verification: assistantVerification(account, latest?.error ? null : latest?.data) });
  }
  if (action === 'disconnect') {
    const result = await admin.from('plan_asistente_cuentas').update({ enabled: false, ciphertext: null, iv: null, hint: null, revision: crypto.randomUUID(), updated_at: new Date().toISOString() }).eq('user_id', owner);
    if (result.error) return json({ error: 'No se pudo desconectar la clave.' }, 500);
    return json(status(account ? { ...account, enabled: false, hint: null } : null));
  }
  if (!ready) return json({ error: 'La conexión de IA todavía no está habilitada. La navegación funciona sin API.' }, 503);
  if (action === 'connect') {
    if (body.consent !== true) return json({ error: 'Confirmá el uso de tu API y el envío de tus mensajes al proveedor.' }, 400);
    try {
      const provider = String(body.provider), model = String(body.model);
      assistantModel(provider, model);
      const budget = Number(body.budgetUsd);
      if (!Number.isFinite(budget) || budget < 0 || budget > 1000) return json({ error: 'Revisá el tope mensual.' }, 400);
      const secret = typeof body.apiKey === 'string' ? body.apiKey.trim() : '';
      let encrypted: { ciphertext: string; iv: string }, hint: string;
      if (!secret && account?.enabled && account.provider === provider) { encrypted = { ciphertext: account.ciphertext, iv: account.iv }; hint = account.hint; }
      else {
        if (secret.length < 20 || secret.length > 512 || /\s/.test(secret) || /^sk-(?:admin-|ant-admin)/.test(secret) || !(provider === 'openai' ? /^sk-(?!ant-)/.test(secret) : /^sk-ant-/.test(secret))) return json({ error: 'Usá una clave personal de API del proveedor elegido, sin permisos administrativos.' }, 400);
        encrypted = await encryptAssistantKey(secret, master, owner, provider); hint = '••••' + secret.slice(-4);
      }
      const saved = await admin.rpc('plan_asistente_configurar', { p_user: owner, p_provider: provider, p_model: model, p_ciphertext: encrypted.ciphertext, p_iv: encrypted.iv, p_hint: hint, p_budget: Math.round(budget * 1e6) });
      if (saved.error) return json({ error: 'No se pudo guardar la conexión. El tope no puede ser menor al consumo registrado.' }, 400);
      const fresh = await admin.from('plan_asistente_cuentas').select('*').eq('user_id', owner).single();
      if (fresh.error) return json({ error: 'La clave se guardó, pero no se pudo actualizar su estado.' }, 500);
      return json(status(fresh.data));
    } catch { return json({ error: 'No se pudo custodiar la clave o el modelo no está admitido.' }, 400); }
  }
  if (!account?.enabled) return json({ error: 'Configurá tu API personal en Mi asistente.' }, 409);
  let messages, model, cost, apiKey;
  let requestId: string;
  try {
    messages = validateAssistantMessages(body.messages); model = assistantModel(account.provider, account.model); cost = reserveMicroUsd(model, messages);
    if (action === 'preview') {
      const remaining = status().budgetUsd - status().usedUsd;
      if (cost / 1e6 > remaining) return json({ error: 'Esta consulta supera el disponible de tu tope. No se contactó al proveedor.' }, 409);
      return json({ ...await createQuote(master, owner, account.revision, messages, cost), model: model.name });
    }
    requestId = await verifyQuote(body.quote, master, owner, account.revision, messages, cost);
    if (!uuid.test(requestId)) throw new Error();
    apiKey = await decryptAssistantKey(account.ciphertext, account.iv, master, owner, account.provider);
  } catch { return json({ error: 'Revisá la extensión de la consulta y la configuración personal.' }, 400); }
  const reserved = await admin.rpc('plan_asistente_reservar', { p_user: owner, p_request: requestId, p_revision: account.revision, p_cost: cost });
  if (reserved.error) return json({ error: reserved.error.message }, 409);
  // No retry: uncertain outcomes retain the reservation, even if the caller
  // disconnected, so a provider timeout cannot silently exceed the monthly cap.
  try {
    const outgoing = providerRequest(model, messages, apiKey);
    const response = await fetch(outgoing.url, { method: 'POST', headers: outgoing.headers, body: JSON.stringify(outgoing.body), redirect: 'error', signal: AbortSignal.timeout(45000) });
    apiKey = null;
    if (!response.ok) {
      await admin.rpc('plan_asistente_finalizar', { p_user: owner, p_request: requestId, p_cost: null, p_input: null, p_output: null });
      return json({ error: response.status === 401 || response.status === 403 ? 'El proveedor rechazó la clave o el acceso al modelo. Revisá tu conexión personal.' : response.status === 429 ? 'El proveedor informó un límite de uso o saldo. No se reintentó.' : 'El proveedor no completó la consulta. No se reintentó.' }, 502);
    }
    const parsed = providerResult(account.provider, await response.json());
    const actual = actualMicroUsd(model, parsed.input, parsed.output);
    const settled = await admin.rpc('plan_asistente_finalizar', { p_user: owner, p_request: requestId, p_cost: actual, p_input: Number.isSafeInteger(parsed.input) ? parsed.input : null, p_output: Number.isSafeInteger(parsed.output) ? parsed.output : null });
    if (settled.error) return json({ error: 'La consulta llegó al proveedor, pero no se pudo confirmar su registro. La reserva se conserva; no la reenvíes automáticamente.' }, 502);
    return json({ text: parsed.text, costUsd: (actual ?? cost) / 1e6 });
  } catch {
    await admin.rpc('plan_asistente_finalizar', { p_user: owner, p_request: requestId, p_cost: null, p_input: null, p_output: null });
    return json({ error: 'No se pudo confirmar la respuesta. Se conserva la reserva de consumo y no se reintenta automáticamente.' }, 502);
  }
});
