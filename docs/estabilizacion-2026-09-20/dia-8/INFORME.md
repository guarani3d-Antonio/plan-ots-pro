# Día 8 — informes portables y restauración atómica

Bloque completado sobre el checkpoint `8150b0c7b6a6c290c07d15ad4d427e94659b3a26`. La función de restauración quedó aplicada en Supabase y la aplicación actualizada funciona en la vista local. El sitio público de Cloudflare todavía no fue desplegado.

## Resultado

- Los informes generales y de OT incorporan sus imágenes como datos internos antes de previsualizar, descargar o imprimir. Un enlace temporal vencido se reemplaza por una marca visible; el archivo sigue abriendo.
- El HTML exportado elimina scripts, hojas externas y manejadores de eventos; añade una política CSP, estilos propios y preview aislado. Los textos de proyecto, órdenes, fotos y firmantes se escapan antes de generar HTML. El CSV cita todas las celdas.
- La restauración dejó de ejecutar una serie de updates independientes. Un único RPC de supervisor valida primero todo el snapshot, crea un backup del estado actual y restaura las OTs dentro de la misma transacción. Si falta una orden, hay duplicados o aparece un conflicto, no queda ningún cambio parcial ni backup engañoso.
- El cliente exige que el servidor confirme la cantidad exacta restaurada y el ID del backup. Lectores, anónimos y otra empresa no pueden invocar la operación.
- Quedó preparado el [guion de prueba de campo conectada](PRUEBA-CAMPO.md) para el día 9, incluyendo tablet, cámara, dos sesiones, informe fuera de sesión, restauración e aislamiento.

## Evidencia

| Comprobación | Resultado |
|---|---|
| PostgreSQL local: validación, intercambio de códigos, rollback y permisos | 9/9 — `sql-tests.json` |
| Cliente: HTML portable, imágenes vencidas, escape y contrato RPC | 7/7 — `client-tests.json` |
| Supabase real con cuentas ficticias y clave pública | 4/4 — `rest-tests.json` |
| Catálogo remoto | Propietario `postgres`, `search_path` controlado, sin ejecución anónima — `server-verification.json` |
| Navegador local | Informe visible, CSP presente, sin scripts ni imágenes HTTP externas — `browser-verification.json` |
| TypeScript, lint de los tres servicios del lote y build | Aprobados |

La matriz remota creó dos OTs y versiones temporales, comprobó una restauración real y luego verificó que no quedaran esos datos. No usó `service_role`. La migración final tiene SHA-256 `71226443ccada2f9af5a61bab21aa1c772f140bc3afdf209265e086dc7029f52`.

## Recuperación y límites

Los archivos sensibles anteriores están en `.backups.local/2026-09-21-dia8/`, junto con sus hashes y la captura que confirma que el RPC no existía. El rollback versionado retira únicamente `plan_restaurar_version`; la transacción de restauración genera su propio punto de retorno de datos.

PDF.js conserva la versión y advertencias conocidas del baseline. No se actualizó dentro de este bloque porque los informes generados ya no dependen de scripts externos y cambiar el visor PDF requeriría su propia regresión de planos. El lint completo de los componentes tocados sigue reportando reglas React ya presentes en esos módulos; TypeScript, los servicios nuevos/modificados y el build sí pasan. El HTML portable tiene un límite de 30 MB de imágenes; los recursos que no se puedan incorporar quedan señalados como no disponibles. El PDF se obtiene mediante la impresión del navegador, por lo que su aspecto final depende de ese navegador.

El piloto sigue siendo conectado. La aplicación local ya puede revisarse en `http://127.0.0.1:5173/` mientras el servidor de desarrollo continúe activo. Día 9 corresponde a la tablet y cámara reales; día 10 al gate Astra, regresión final y despliegue controlado si el resultado es GO.
