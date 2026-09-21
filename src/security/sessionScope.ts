// Una identidad por documento; el cambio de cuenta cancela operaciones y recarga.
let identity: string | null = null;
let generation = 0;
let controller = new AbortController();
export function bindIdentity(userId: string | null): void {
  controller.abort(); controller = new AbortController(); identity = userId; generation++;
}
export function sessionTicket(): number {
  if (!identity || !navigator.onLine) throw new Error('Se requiere una sesión conectada. Los pendientes anteriores se conservan sin sincronizar.');
  return generation;
}
export function assertSession(ticket: number): void {
  if (ticket !== generation || !identity || !navigator.onLine) throw new Error('La sesión cambió; vuelve a abrir la operación.');
}
export function scopedKey(key: string): string { return `plan-v2:${identity ?? 'sin-sesion'}:${key}`; }
export function identityId(): string | null { return identity; }
export const LEGACY_OFFLINE_ENABLED: boolean = false;
export function createSessionFetch(base: typeof fetch): typeof fetch {
  return async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    if (!/^\/(rest|storage|functions)\//.test(url.pathname)) return base(input, init);
    const ticket = sessionTicket();
    const headers = new Headers(input instanceof Request ? input.headers : undefined);
    new Headers(init?.headers).forEach((value,key)=>headers.set(key,value));
    const token = headers.get('authorization')?.replace(/^Bearer /i,'');
    let subject: string | undefined;
    try { subject = JSON.parse(atob((token?.split('.')[1] ?? '').replace(/-/g,'+').replace(/_/g,'/'))).sub; } catch { /* rechazar */ }
    if (subject !== identity) throw new Error('La petición pertenece a otra sesión.');
    const callerSignal = init?.signal ?? (input instanceof Request ? input.signal : null);
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(30_000), ...(callerSignal ? [callerSignal] : [])]);
    const response = await base(input,{...init,headers,signal,cache:'no-store'});
    const body = await response.arrayBuffer();
    assertSession(ticket);
    return new Response([204,205,304].includes(response.status) ? null : body, {status:response.status,statusText:response.statusText,headers:response.headers});
  };
}
