// Capturar el tipo antes de que Supabase procese y limpie el fragmento de la URL.
import { parseActivationLink } from './activationLink';
export const enlaceActivacion = parseActivationLink(window.location.search, window.location.hash);
export const tokenDeEnlace = enlaceActivacion.accessToken;
export const enlaceContieneSesion = enlaceActivacion.hasSession;
export const esEnlaceDeActivacion = enlaceActivacion.isActivation;

export const urlActivacion = `${window.location.origin}/?activar=1`;
