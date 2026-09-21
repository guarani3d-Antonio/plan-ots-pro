/**
 * La descripción automática queda deshabilitada en el cliente web.
 *
 * Una clave de proveedor incluida como VITE_* termina dentro del JavaScript
 * público del navegador. La función se conserva como contrato no bloqueante
 * para que la carga de fotos abra inmediatamente la descripción manual. Cuando
 * exista un proxy de servidor autenticado y con límites, se conecta aquí sin
 * volver a exponer secretos al dispositivo.
 */
export async function describirFotoConIA(_imageUrl: string): Promise<string> {
  void _imageUrl;
  return '';
}
