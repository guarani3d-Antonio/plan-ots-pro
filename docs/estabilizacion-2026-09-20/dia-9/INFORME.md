# Día 9 — recorrido integral Samsung Galaxy Tab FE

Bloque completado sobre el checkpoint `a57e90e`. La aplicación pasó el recorrido conectado en un perfil Samsung Galaxy Tab FE, tanto horizontal como vertical, con las cuatro obras ficticias y once cuentas. La vista local quedó restaurada al modo normal y los datos temporales del ensayo fueron retirados.

## Resultado

- Las cuatro obras abren su plano sin desborde horizontal en 1277×797 y 797×1277. El cambio de orientación activa las clases correctas y el panel de OT cabe en ambos sentidos.
- La interfaz ofrece cámara trasera (`capture="environment"`) y galería. Se cargó una imagen sintética, se describió, guardó y eliminó sin perder la sesión al suspender brevemente la pestaña.
- El alta conectada impidió guardar una OT sin foto de tipo ANTES. Después de añadirla, la OT se guardó, cerró y reabrió con sus campos completos.
- La Ficha de Visita se generó autocontenida: una imagen embebida, política CSP, cero scripts y cero imágenes externas.
- La limpieza remota eliminó el archivo, la fila de foto y la OT creados para el recorrido. Cada obra ficticia conserva exactamente su fixture original.
- La matriz con clave pública confirmó de nuevo la visibilidad exacta de las once cuentas y que técnicos/lectores no atraviesan empresa ni amplían permisos.

## Corrección P0

La descripción automática de fotos llamaba a Anthropic directamente desde el navegador con una variable `VITE_ANTHROPIC_API_KEY`. Ese patrón publica el secreto dentro del JavaScript entregado al dispositivo y además bloqueó la carga durante la prueba. Se retiraron la clave y la llamada directa del cliente. La descripción manual ahora aparece de inmediato y el build se verifica para impedir que la clave, el endpoint o el encabezado peligroso vuelvan a incorporarse.

La descripción automática podrá regresar únicamente detrás de un proxy autenticado del servidor, con límites y sin entregar credenciales al navegador. Esta mejora no bloquea el piloto conectado.

## Evidencia

| Comprobación | Resultado |
|---|---|
| Cliente: modo manual seguro, cámara/galería, perfil tablet y build sin secreto | 4/4 — `client-tests.json` |
| Supabase real: cuatro obras, once cuentas, permisos, reanudación y limpieza | 4/4 — `rest-tests.json` |
| Navegador: dos orientaciones, OT, foto, suspensión, reapertura e informe | Aprobado — `browser-verification.json` |
| TypeScript, lint del servicio y build PWA | Aprobados |

## Límite y gate restante

El escritorio puede validar el selector de cámara trasera y todo el flujo de archivo, pero no puede encender el sensor físico de la Samsung. El día 10 comienza con una comprobación breve en la tablet real: abrir Cámara, aceptar el permiso si aparece, tomar una foto, rotar el equipo y reabrir la OT. Si pasa, la cámara queda certificada; si falla, se corrige antes del GO.

El sitio público de Cloudflare todavía no fue actualizado. La compilación del día 9 es candidata local para la regresión Astra y el despliegue controlado del día 10.
