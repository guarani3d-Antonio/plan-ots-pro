// Capturar el tipo antes de que Supabase procese y limpie el fragmento de la URL.
const fragment = new URLSearchParams(window.location.hash.slice(1));
const tipo = fragment.get('type');
export const tokenDeEnlace = fragment.get('access_token');
export const enlaceContieneSesion =
  (tipo === 'invite' || tipo === 'recovery') &&
  Boolean(tokenDeEnlace) && fragment.has('refresh_token');
export const esEnlaceDeActivacion =
  new URLSearchParams(window.location.search).has('activar') ||
  tipo === 'invite' || tipo === 'recovery' ||
  fragment.get('error_code') === 'otp_expired';

export const urlActivacion = `${window.location.origin}/?activar=1`;
