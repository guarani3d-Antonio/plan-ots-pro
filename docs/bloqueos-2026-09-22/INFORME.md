# Bloqueos funcionales y de confianza — 22/09/2026

Continuación de `a2c416e`, con respaldo previo en `.backups.local/2026-09-22-servidor`. Alcance: sección F01–F09 de la auditoría de tablet. La etapa visual siguiente queda separada.

## Cambios

- Se conservan las correcciones iniciales de Sol: roles reales, retiro de acciones simuladas, fechas civiles, estado visible de guardado, Pointer Events y errores de dictado. La cabecera permite micrófono solo al propio sitio.
- El directorio de contratistas ahora reside en Supabase y pertenece a una empresa. Agregar desde una OT registra el nombre en la misma transacción. Las asignaciones existentes alimentaron el catálogo; no se mezclaron automáticamente los antiguos nombres locales entre empresas.
- Historial generado por triggers: creación/edición/eliminación de OT, posición, asignaciones, fotos/capas, comentarios y costos restringidos. Actor autenticado y hora del servidor; sin escrituras directas del cliente. Se conservan los registros previos de cambios de estado identificados como históricos, sin inventar otra actividad anterior.
- Notificaciones persistentes para las obras autorizadas, paginación y lectura por usuario. Actualización al volver, al recuperar conexión y cada minuto. Abren el historial y la OT disponible; una OT eliminada conserva su actividad. Una exportación se registra como solicitud, sin afirmar que terminó la descarga o impresión.
- Formulario: bloqueo de doble guardado, aviso al descartar cambios, errores que mantienen el borrador y bloqueo de informes con datos pendientes. Se corrigieron permisos consultados contra el proyecto de la OT. Abrir una OT ya no inventa horas de inicio/cierre.
- Fotos: fuente original protegida en servidor, capas/ajustes separados, coordenadas independientes del tamaño y del zoom, exportación desde la fuente y control de revisión concurrente. Una respuesta de red ambigua no elimina la imagen que podría haber quedado guardada. Las imágenes originales borradas por versiones anteriores no pueden reconstruirse; se conserva la fuente sobreviviente y se informa cuando las marcas antiguas están integradas en ella.
- Plano: navegación por defecto, crear/mover mediante modos explícitos, bloqueo de toques repetidos, pinch con punto focal estable, cancelación y protección frente a un tercer dedo. Se impide mover una OT de otro proyecto usando una selección anterior.
- Informes: obra/unidad correctas y versión de la OT identificable. Nuevas OTs usan la fecha civil de `America/Asuncion` también después de medianoche UTC.

## Servidor y recuperación

Migraciones aditivas `202609220007_trust_events_contractors.sql` y `202609220008_photo_originals.sql`, probadas antes de ejecutar y confirmadas exitosamente en Supabase. Evidencias: `server-migration-007.txt`, `server-migration-008.txt` y hashes en `sql-tests.json`.

Las reversiones están en `supabase/rollback/`. Revertir primero el cliente si fuese necesario. La reversión conserva la actividad capturada y la protección del original; no borra estos registros para volver a una versión anterior. Las copias derivadas anteriores se conservan: una política de limpieza requiere tratar referencias e historial por separado.

## Validación

| Comprobación | Resultado |
|---|---|
| PostgreSQL local: permisos, auditoría, costos, fotos, lecturas, paginación, reversión | 22/22 |
| Supabase real con clave pública y usuarios ficticios, incluido Storage binario | 10/10 |
| Cliente: handlers reales, 20 ciclos de pinch simulados, coordenadas, doble toque, informes y fallo ambiguo | 6/6 |
| TypeScript y compilación Vite/PWA | Aprobados |
| Lint focalizado de servicios y componentes de historial/directorio/notificaciones/dictado | 0 errores; un aviso de limpieza de ref en notificaciones |
| Artefacto de despliegue | ZIP releído por hash, cabeceras verificadas y sin secretos detectados |

Las pruebas REST compararon por hash el proyecto, OT y fotos de campo antes/después: sin cambios. Crearon y retiraron únicamente OTs/binarios temporales en la empresa ficticia; su auditoría permanece deliberadamente. La comprobación visual también usó `QA-REST-a1000000`, con obra/unidad ficticias y una flecha en su imagen de pruebas.

Comprobaciones de navegador: contratista creado y recuperado en nueva sesión; navegación desde aviso a historial de OT eliminada; confirmación `Guardado · hora`; editor con fuente privada cargada, guardado de flecha y reapertura de su capa. El detalle está en `browser-verification.json`.

La compilación conserva avisos conocidos de tamaño de bundle, importaciones y PDF.js. No se presenta este lote como resolución de los pendientes comerciales o de credenciales de la auditoría anterior.

## Validación física pendiente

En la Samsung: repetir los 20 gestos en modo normal y pantalla completa, rotación/cancelación, dibujo con dedo/lápiz, dictado con permiso concedido/denegado y actualización de una PWA previamente instalada. Las pruebas simuladas y de escritorio no certifican hardware ni motores de voz. El borrador se conserva en el formulario abierto; no se promete recuperación tras cerrar el navegador ni sincronización offline.

Agente recomendado para los siguientes ajustes visuales acotados: **Sol Alto**. Reservar **Astra Alto** para nuevos cambios de seguridad, concurrencia o revisión de hitos.
