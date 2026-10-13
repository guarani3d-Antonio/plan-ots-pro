import { createHash } from './assistant-quote-hash.mjs';
const encoder = new TextEncoder();
const encode = bytes => btoa(String.fromCharCode(...bytes));
const decode = value => Uint8Array.from(atob(value), c => c.charCodeAt(0));
async function key(master) {
  const derived = await crypto.subtle.digest('SHA-256', encoder.encode('plan-ots-assistant-cost-confirmation:' + master));
  return crypto.subtle.importKey('raw', derived, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}
export async function createQuote(master, owner, revision, messages, cost, now = Date.now()) {
  const payload = { owner, revision, hash: await createHash(messages), cost, requestId: crypto.randomUUID(), expires: now + 300000 };
  const encoded = encode(encoder.encode(JSON.stringify(payload)));
  const signature = await crypto.subtle.sign('HMAC', await key(master), encoder.encode(encoded));
  return { token: encoded + '.' + encode(new Uint8Array(signature)), maximumUsd: cost / 1e6, expiresAt: new Date(payload.expires).toISOString() };
}
export async function verifyQuote(token, master, owner, revision, messages, cost, now = Date.now()) {
  if (typeof token !== 'string' || token.length > 3000) throw new Error('Confirmación requerida.');
  const parts = token.split('.');
  if (parts.length !== 2 || !await crypto.subtle.verify('HMAC', await key(master), decode(parts[1]), encoder.encode(parts[0]))) throw new Error('Confirmación inválida.');
  const payload = JSON.parse(new TextDecoder().decode(decode(parts[0])));
  if (payload.owner !== owner || payload.revision !== revision || payload.hash !== await createHash(messages) || payload.cost !== cost || payload.expires < now) throw new Error('La consulta o conexión cambió. Revisá otra vez el costo.');
  return payload.requestId;
}
