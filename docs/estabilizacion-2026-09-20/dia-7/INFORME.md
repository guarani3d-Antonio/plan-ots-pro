# Día 7 — flujo conectado confiable de órdenes y fotos

Bloque completado sobre el checkpoint `5858b39dd76c8be717fe5f4a2e7d619f5e32df5c`. La migración `202609210005_connected_ot_flow.sql` quedó aplicada en Supabase y el frontend actualizado funciona en la vista local. **El sitio público de Cloudflare todavía no fue desplegado.**

## Resultado

- La numeración `OT-NNN` se asigna en el servidor dentro de la misma transacción de creación. Un bloqueo por obra evita que dos tablets reciban el mismo código.
- Cada edición compara la versión `updated_at` que el usuario abrió. Los cambios concurrentes en campos distintos se fusionan; si ambas sesiones modificaron el mismo campo, se conserva el servidor y la pantalla pide revisar.
- Realtime descarta eventos anteriores a la versión ya visible.
- El cambio de estado y su comentario se confirman en una sola transacción. Una pantalla antigua recibe conflicto HTTP 409 y no deja estado o comentario parcial.
- La cancelación de una OT recién creada queda limitada al propio creador, durante 15 minutos, mientras siga Pendiente y sin fotos ni comentarios. El borrado general continúa reservado a supervisión.
- Crear, mover, guardar, borrar, cancelar y describir fotos ya no muestran éxito antes de la confirmación del servidor.
- Si Storage acepta una foto pero falla la fila de base de datos, se intenta retirar inmediatamente el archivo nuevo. La edición de una foto conserva el archivo anterior hasta confirmar la referencia nueva y luego intenta limpiarlo.
- El modo offline completo sigue deshabilitado. La cola histórica se conserva aislada; este bloque fortalece el piloto conectado y la recuperación de fallos parciales.

## Evidencia

| Comprobación | Resultado |
|---|---|
| Funciones SQL, permisos, concurrencia, índice único, transacción, cancelación y rollback en laboratorio | 12/12 — `sql-tests.json` |
| Supabase Auth/REST real con dos sesiones concurrentes, lector y cruce de empresa | 8/8 — `rest-tests.json` |
| Store y servicios TypeScript: mezcla, conflicto, Realtime, fallos y compensación de foto | 10/10 — `client-tests.json` |
| Servidor posterior | Tres RPC propiedad de `postgres`, sin ejecución anónima, índice único válido y cero códigos OT activos duplicados — `server-verification.json` |
| TypeScript, lint dirigido y build de producción | Aprobados |
| Navegador local | Plano cargado; panel de OT abierto; observación guardada, panel cerrado/reabierto y valor persistido; valor original restaurado y comprobado |

El hash SHA-256 de la migración final es `c9b925753bf7455148d81f10dda2d57c113f0c54264a0f620c2e2ea949239df9`. El build conserva las advertencias conocidas de tamaño del bundle y `eval` dentro de PDF.js; no fueron introducidas por el flujo de órdenes.

## Recuperación y límites

Los archivos sensibles anteriores a la edición están en `.backups.local/2026-09-21-dia7/`. El estado previo de las tres funciones quedó registrado en `server-functions-before.json`: no existían. El rollback versionado retira únicamente los tres RPC del día 7. La migración es transaccional y su verificación comprueba propietario, ACL, `search_path`, permiso anónimo y duplicados activos.

La matriz remota usa solamente la clave pública y cuentas ficticias. Limpia sus OTs activas y comprueba que no queden registros operativos de prueba; los borrados administrativos sí dejan auditoría deliberadamente. No se probó una carga física nueva desde la cámara durante la revisión visual. La compensación de Storage fue probada con transporte simulado y la política privada ya había sido validada contra Supabase en el día 5.

## Siguiente bloque

El día 8 puede continuar con **Sol alto** para informes HTML/PDF portables, recuperación/restauración y el guion de prueba de campo conectado. Reservar Astra para el gate final, contradicciones de autorización o indicios de pérdida de datos. Offline completo permanece para la etapa posterior al piloto conectado, pero sus límites deben seguir explícitos durante las pruebas de campo.
