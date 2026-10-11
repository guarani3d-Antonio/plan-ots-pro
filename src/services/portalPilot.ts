import qrcode from '../vendor/qrcode';

export interface ContextoPortal {obraId: string; obra: string; empresa: string; sector: string}
const text = (value: string | null, fallback = '') => (value || fallback).trim().slice(0, 180);
export function contextoPortal(search: string): ContextoPortal {
  const p = new URLSearchParams(search);
  return {obraId: text(p.get('obraId')), obra: text(p.get('obra'), 'Obra de prueba'), empresa: text(p.get('empresa'), 'Empresa de prueba'), sector: text(p.get('sector'))};
}
/** Demo aislada: no contiene contactos, credenciales ni rutas privadas de Storage. */
export function enlacePortal(origin: string, context: ContextoPortal): string {
  const url = new URL('/', origin);
  url.search = new URLSearchParams({portal: 'demo', obraId: context.obraId, obra: context.obra, empresa: context.empresa, ...(context.sector ? {sector: context.sector} : {})}).toString();
  return url.href;
}
export function geometriaQR(value: string) {
  const code = qrcode(0, 'M'); code.addData(value); code.make();
  const n = code.getModuleCount(), quiet = 4;
  let path = '';
  for (let row = 0; row < n; row++) for (let col = 0; col < n; col++) if (code.isDark(row, col)) path += `M${col + quiet} ${row + quiet}h1v1h-1z`;
  return {size: n + quiet * 2, path};
}
export const escapeXml = (value: string) => value.replace(/[&<>"']/g, char => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;'}[char]!));
export function cartelPortal(context: ContextoPortal, link: string, logo = '', photo = ''): string {
  const qr = geometriaQR(link), x = escapeXml;
  // Solo imágenes embebidas de tipos admitidos. Nunca guardar URLs firmadas en el cartel.
  const asset = (data: string) => /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(data) ? data : '';
  const image = (data: string, left: number, top: number, width: number, height: number) => asset(data) ? `<image href="${data}" x="${left}" y="${top}" width="${width}" height="${height}" preserveAspectRatio="xMidYMid meet"/>` : '';
  const lines = (value: string, limit = 42) => { const words = value.split(/\s+/), result: string[] = []; let line = ''; for (const word of words) { if ((line + ' ' + word).trim().length > limit && line) {result.push(line); line = word;} else line = (line + ' ' + word).trim(); } if (line) result.push(line); return result.slice(0, 3); };
  return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1120" viewBox="0 0 800 1120"><rect width="800" height="1120" fill="#fff"/><rect x="30" y="30" width="740" height="1060" rx="20" fill="#fff" stroke="#e2e6ed"/>
  ${image(logo, 55, 55, 120, 85)}${image(photo, 625, 55, 120, 85)}
  <g font-family="Arial,sans-serif" fill="#0f172a" text-anchor="middle"><text x="400" y="84" font-size="24" font-weight="bold">Plan-OTs</text><text x="400" y="117" font-size="17">${x(context.empresa.slice(0, 42))}</text><text x="400" y="190" font-size="31" font-weight="bold">Registrá tu reclamo</text><text x="400" y="222" font-size="18" fill="#475569">Escaneá el QR con tu teléfono</text></g>
  <svg x="150" y="250" width="500" height="500" viewBox="0 0 ${qr.size} ${qr.size}" shape-rendering="crispEdges"><rect width="${qr.size}" height="${qr.size}" fill="#fff"/><path d="${qr.path}" fill="#000"/></svg>
  <g font-family="Arial,sans-serif" text-anchor="middle">${lines(context.obra).map((line, i) => `<text x="400" y="${790 + i * 29}" font-size="24" font-weight="bold" fill="#0f172a">${x(line)}</text>`).join('')}<text x="400" y="910" font-size="18" fill="#475569">${x(context.sector ? 'Sector: ' + context.sector.slice(0, 58) : 'Contacto · descripción · evidencia fotográfica')}</text><rect x="175" y="946" width="450" height="42" rx="21" fill="#fff7e6"/><text x="400" y="974" font-size="18" fill="#925b0b">MODO PRUEBA · No recibe reclamos reales</text><text x="400" y="1030" font-size="16" fill="#475569">Portal de prueba. No colocar para atención al público.</text></g></svg>`;
}
