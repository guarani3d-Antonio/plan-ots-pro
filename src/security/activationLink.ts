// Pure parser: never consumes a one-time token while opening or previewing a link.
export function parseActivationLink(search: string, hash: string) {
  const fragment = new URLSearchParams(hash.replace(/^#/, ''));
  const query = new URLSearchParams(search);
  const rawType = fragment.get('type');
  const type = rawType === 'invite' || rawType === 'recovery' ? rawType : null;
  const tokenHash = type ? fragment.get('token_hash') : null;
  const accessToken = type ? fragment.get('access_token') : null;
  const hasSession = Boolean(accessToken && fragment.get('refresh_token'));
  return {
    type, tokenHash, accessToken, hasSession,
    isActivation: query.has('activar') || Boolean(type) || fragment.get('error_code') === 'otp_expired',
  };
}
