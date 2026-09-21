# Día 5 — Storage privado

Bloque aplicado y comprobado en Supabase `iqgbyqyoovzvhhdjawnt`. `planos`, `fotos` y `exports` son privados. No se movieron ni borraron archivos legados. La aplicación local muestra el plano y la fotografía privados de la primera obra con el técnico correspondiente.

## Comportamiento resultante

- Las rutas nuevas incluyen empresa y obra; las fotografías/videos incluyen también la OT. Se valida en servidor que la orden pertenezca a esa obra.
- Miembros autorizados leen planos/fotos; técnicos cargan evidencia en sus obras; supervisores administran planos y exports. Los lectores no escriben. Los exports requieren supervisor incluso para lectura.
- Las nuevas cargas exigen `owner_id` del usuario autenticado. No hay política UPDATE de objetos: no se permite sobrescribir, mover ni cambiar propietario. La duplicación de obra copia el contenido a una ruta nueva.
- Las referencias persistidas usan `storage://bucket/ruta`. El cliente autoriza cada emisión de URL temporal contra RLS y no conserva un caché de firmas. La creación reserva primero la obra mediante RPC, luego sube y vincula su plano; si falla, intenta archivar la reserva e informa el problema.
- Un registro administrativo congelado conserva 140 relaciones de archivos históricos. Los 40 objetos sin referencia quedan privados, preservados y accesibles mediante administración para su revisión; un usuario no puede apropiárselos insertando su URL.
- Se adaptaron visor, tarjetas, miniaturas PDF, comparación, galerías, editor de fotos, videos y carga de imágenes para informes. Las imágenes anotadas actualizan tanto `file_url` como `file_path`.
- El nuevo service worker usa NetworkOnly para REST/Storage y elimina las dos cachés HTTP antiguas al activarse. No borra IndexedDB ni pendientes.

## Verificación

| Control | Resultado | Evidencia |
|---|---|---|
| Políticas, referencias, autoría y rollback PostgreSQL local | 37/37 | [storage-sql-tests.json](storage-sql-tests.json) |
| Auth + REST + Storage con 11 cuentas reales | 32/32 | [storage-rest-tests.json](storage-rest-tests.json) |
| Resolución de archivos y limpieza de cachés HTTP | 10/10 | [storage-client-tests.json](storage-client-tests.json) |
| Contrato de órdenes con adaptador actualizado | 4/4 | `node scripts/test-orden-contract.mjs` |
| Configuración del servidor | 3 buckets privados, 3 políticas, 2 triggers, sin DML cliente del registro | [storage-remote.json](storage-remote.json) |
| Recuperación local y hashes binarios | Correctos | [recovery-test.json](recovery-test.json) |
| Conservación remota posterior | Filas anteriores y 180 objetos conservados; solo 4 proyectos sintéticos cambian de referencia | [preservation.json](preservation.json) |
| TypeScript de aplicación, build PWA y lint de módulos nuevos/configuración | Correctos | `tsc -p tsconfig.app.json --noEmit`; `npm run build`; ESLint acotado |
| Navegador, técnico empresa 1 / obra 1 | Plano 1200 px y foto 192 px cargados desde `/object/sign/` | [preview-private.png](preview-private.png) |

La matriz HTTP prueba descargas y firmas de las cuatro obras para cada cuenta, URLs públicas/anónimas, cargas indebidas, listados, sobrescritura, movimiento, copia cruzada, borrado, exports, revocación con JWT vigente, caducidad de firma, referencias cruzadas y reserva/subida/vinculación de obra. Deja cuatro planos y cuatro fotografías sintéticos; limpia únicamente los temporales que crea el ensayo.

Se observó una respuesta de descarga almacenada inmediatamente después de borrar un objeto temporal. El listado ya no lo contenía y una solicitud con `cacheNonce` rechazó la descarga. El test comprueba ambas condiciones. No se promete invalidación instantánea de copias ya descargadas o de respuestas en caché.

## Respaldo y reversión

Checkpoint anterior: `d517e5d`. Copia del archivo sensible `VistaPlano.tsx` y respaldo remoto en `.backups.local/2026-09-20-dia5/`, ignorado por Git:

- `domain-before.json`: las 15 tablas de dominio por REST, sin normalizar texto.
- `schema-before.json`: catálogo obtenido del texto DOM de la celda, contrastado con políticas y RPC restaurables (normalizando solo CRLF/LF).
- `buckets-before.json`: configuración anterior de buckets.
- `objects-before.json` y `objects/<sha256>.bin`: 180 objetos, **172.915.420 bytes**, con nombres, tamaño, hash y archivo local. Se releyeron todos y se verificó cada SHA-256.

La prueba de recuperación carga las filas y metadata de objetos en PostgreSQL local, aplica la migración, compara el mapeo con una comprobación independiente y revierte. Conserva todas las filas y restaura políticas/RPC. Auth se simula; no es un pg_dump completo ni una restauración destructiva remota de usuarios/binarios.

El rollback SQL `supabase/rollback/202609210003_private_storage.rollback.sql` restaura las políticas/RPC previos; **también recupera sus permisos amplios**, por lo que es un procedimiento de recuperación a evaluar, no una operación segura para usuarios activos. No cambia buckets ni elimina objetos. Preferir corregir hacia adelante manteniendo buckets privados. Si se necesitara restaurar el estado completo anterior, coordinar código, referencias de los cuatro fixtures, configuración de buckets y políticas en una ventana sin usuarios. Los binarios deben restaurarse por Storage API, nunca insertando metadata SQL. Los 180 objetos originales permanecen en el servidor.

La clave administrativa temporal se retira al finalizar. Sigue pendiente la rotación coordinada documentada el día 4 antes de compartir la tarea o publicar la siguiente versión.

## Límites y siguiente bloque

Este bloque cierra Storage para el recorrido conectado; **todavía no habilita pruebas de campo**.

1. El cliente pide firmas de 300 segundos y los componentes con hook las renuevan cada 240. Una firma ya emitida es un enlace portador válido hasta caducar, aunque se revoque la membresía; RLS corta las descargas con JWT y la emisión de nuevas firmas. Los 300 segundos son una decisión de este cliente, no un límite máximo impuesto por el servidor a otros clientes autorizados.
2. Las URLs antes públicas y los archivos ya descargados no pueden recuperarse de dispositivos ajenos. La limpieza del service worker solo ocurre al activar la versión nueva; no modifica clientes antiguos a distancia.
3. Día 6: identidad y capacidades reales en UI, Creador/selector, respuestas tardías, aislamiento de IndexedDB/cola y miniaturas, y confidencialidad de costos en API/vistas/snapshots. El fallback local histórico sigue pendiente; no cambiar cuentas en dispositivos compartidos para certificar seguridad todavía.
4. Día 7: recuperación de cargas parcialmente completadas, clasificación de errores de permisos frente a desconexión y cola; un fallo de Storage todavía puede entrar en el comportamiento offline histórico. No confundirlo con éxito del servidor.
5. Día 8: HTML/PDF seguro e informes portables. Un informe con imágenes enlazadas temporalmente necesita convertirlas en contenido incorporado para conservarlas fuera de la sesión.
6. Build conserva advertencias previas de tamaño e imports de PDF.js. No hubo cambios de dependencias ni integración con Fio Pro.

Vista local disponible en [127.0.0.1:5173](http://127.0.0.1:5173/), mientras siga el servidor. El frontend público anterior en `plan-ots-pro.pages.dev` **no fue actualizado** y sus URLs públicas de archivos ya no funcionan. El enlace actualizado se prepara después de los controles del día 6.

Referencias técnicas: [buckets privados](https://supabase.com/docs/guides/storage/buckets/fundamentals), [control de acceso](https://supabase.com/docs/guides/storage/security/access-control), [metadata y operaciones por API](https://supabase.com/docs/guides/storage/schema/design).
