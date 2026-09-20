# Día 2 — revisión y correcciones

Estado: revisión local completada el 20/09/2026. El fundamento multitenant queda aprobado para **fase 1 vacía**, sujeto a comprobar nuevamente el catálogo al aplicarlo. No se aplicó SQL de escritura en Supabase ni se crearon cuentas Auth en este bloque. El aislamiento de órdenes, fotos y obras sigue pendiente de fase 2.

## Correcciones verificadas

La primera ejecución SQL dio 20/29 casos correctos. Nueve fallos se agruparon en tres defectos:

| Defecto de la propuesta | Corrección |
|---|---|
| Tres helpers seguían siendo ejecutables por `anon`: había grants directos por defecto además de `PUBLIC`. | Revocación explícita de ambos; concesión a `authenticated`. |
| Desactivar una empresa no invalidaba el helper de empresa, su administrador ni la lectura de membresías. | Consultar también `tenants.activo`; mantener una excepción explícita para el Creador activo que administra metadatos de empresas existentes. |
| Los grants legados permitían inyectar o cambiar `tenant_id` en proyectos y membresías. | Triggers de transición con `SECURITY INVOKER`; asignación reservada a roles SQL administrativos. El cliente legado sigue funcionando con `tenant_id = null`. |

Además, los nuevos helpers usan nombres de tablas calificados y `search_path = pg_catalog, pg_temp`. La migración exige rol `postgres` y no sobrescribe funciones preexistentes. Tanto migración como reversión tienen límites de espera y ejecución. La reversión bloquea las tablas antes de comprobar que no existen asignaciones; con datos se detiene sin borrarlos. Después de poblar empresas deberá prepararse una migración de datos específica, no forzar este rollback.

La [documentación de CREATE FUNCTION](https://www.postgresql.org/docs/17/sql-createfunction.html) explica los riesgos de `SECURITY DEFINER`, del esquema temporal y del permiso inicial de ejecución. La [documentación de REVOKE](https://www.postgresql.org/docs/17/sql-revoke.html) distingue privilegios de tabla y columna. Los grants directos de este proyecto se comprobaron además contra su catálogo real.

En el código de órdenes se corrigió una regresión del día 1: `Array.map(rowToOrden)` entregaba el índice de la fila como segundo argumento y el mapper lo interpretaba como fecha de caché. Ahora genera su propia fecha. Se retiró la atribución de una operación encolada al usuario conectado posteriormente y cuatro logs que volcaban datos completos de la OT. La identidad original de la cola aún requiere B003; retirar esa atribución no resuelve el aislamiento local.

## Evidencia y límites

- [SQL antes de corregir](sql-tests-before.json): 20/29. [SQL final](sql-tests.json): **35/35**. PostgreSQL 17.5 real en WASM mediante PGlite 0.3.14; fixture de dos tablas legadas, roles/grants/políticas/triggers y `auth.uid()` simulado. Comprueba revocación, permisos, suplantación mediante tabla temporal, compatibilidad de creación de obra, protección de tenant y rollback. No prueba JWT, HTTP, Storage, el resto del esquema ni concurrencia real.
- El rollback vacío compara columnas, políticas, índices, grants de tabla y cuerpos de funciones/triggers antes y después. Con empresas ya insertadas, exige rechazo y comprueba que siguen existiendo. No equivale a restaurar toda la base.
- [Contrato de órdenes](orden-contract-tests.json): **4/4** escenarios, ejecutando los módulos TS reales con adaptadores en memoria. Carga online, CREATE online/cola, UPDATE parcial y eventos INSERT/UPDATE/DELETE. Preserva campos soportados, descripción/comentario independientes, cero/false, posiciones null y limpieza de selección; DELETE repetido no encola ni escribe al servidor.
- El mapper normaliza algunos opcionales nulos a valores de dominio. No certifica una ida y vuelta idéntica de todas las columnas de Supabase: `fecha_limite`, `ubicada_en_plano`, `conflict_data` y `deleted_at` no forman parte de este contrato de escritura. Se conserva su comportamiento actual; revisar su uso antes de ampliar el contrato.
- Typecheck de aplicación, ESLint de los tres módulos TS modificados, validadores de mapper/fixtures y `npm run build`: correctos. El build mantiene advertencias de PDF.js (`eval`), tamaño de bundle e imports dinámicos ineficaces; no quedaron resueltas en este lote.
- Los tests de órdenes no ejecutan React, Zustand o IndexedDB reales ni validan entrega/autorización del servicio Realtime. El comportamiento con pendientes, sesiones cambiadas y respuestas tardías sigue abierto.

## Definición del servidor preservada

Proyecto: `iqgbyqyoovzvhhdjawnt` (Plan-ots-2), PostgreSQL 17.6. Captura solo lectura: `2026-09-20T22:33:32.355037+00:00`.

Archivo privado, ignorado por Git: `.backups.local/2026-09-20-dia2/schema-baseline.json`. SHA-256: `BDE00ADAAE42E31CB9280A74F1834D0690B848E11FC090CE2A23D50B175F9D87`. Consulta reproducible: [capture-schema.sql](../../../supabase/verification/capture-schema.sql).

Contiene 14 relaciones públicas (12 tablas y 2 vistas), 177 columnas, 53 restricciones, 46 índices, 41 políticas public/storage, 5 funciones con cuerpos/owner/ACL/configuración, 4 triggers, 2 definiciones de vistas, 493 grants de tabla, 2.832 grants de columna, 24 entradas de privilegios por defecto, configuración de 3 buckets y 11 entradas de publicación. No contiene filas de clientes, usuarios Auth, contraseñas ni tokens.

Es una **captura de catálogo**, no un `pg_dump` completo, backup de filas ni copia de objetos Storage. Antes de transformar datos o paths, hay que producir y comprobar la recuperación de esos datos/objetos por separado. La copia ZIP y el bundle de código del día 1 continúan en `.backups.local/2026-09-20-pre-estabilizacion/`.

## Ejecución repetible

Desde la raíz del repositorio:

```powershell
node scripts/test-foundation-sql.mjs <ruta-a-@electric-sql/pglite/dist/index.js>
node scripts/test-orden-contract.mjs
node scripts/validate-orden-mapper.mjs
node scripts/validate-multitenancy-foundation.mjs
node node_modules/typescript/bin/tsc -p tsconfig.app.json --noEmit
node node_modules/eslint/bin/eslint.js src/data/ordenMapper.ts src/stores/ordenesStore.ts src/sync/SyncManager.ts
npm run build
```

El primer script necesita [PGlite](https://pglite.dev/docs/) instalado como herramienta de desarrollo. En esta máquina se cargó la biblioteca existente en `C:/dev/fio-pro/dist/nc-sql-runtime/node_modules/@electric-sql/pglite/dist/index.js`, solo en lectura. No importa código, configuración ni datos de Fio Pro; usa una base nueva en memoria. Puede apuntar a cualquier instalación independiente de la misma biblioteca. El frontend de Plan-OTs no adquiere esta dependencia. Los demás comandos usan las dependencias locales de Plan-OTs. No ejecutar `supabase/tests/legacy-foundation.sql` en el servidor.

Al desplegar fase 1: volver a capturar el catálogo, contrastar las dos tablas afectadas con el fixture, confirmar ausencia de los objetos nuevos, ejecutar la migración con `postgres` y luego [la verificación con aserciones](../../../supabase/verification/202609200001_multitenancy_foundation.verify.sql). Un error exige detener el lote y resolverlo; no continuar con el seed. Si la transacción queda abortada, ejecutar `ROLLBACK` antes de otra operación. Si falla la verificación y el fundamento sigue vacío, usar el rollback versionado y volver a comparar el catálogo.

## Contrato del siguiente bloque

1. Aplicar y comprobar únicamente el fundamento vacío. Registrar resultado/hash y comprobar lectura/escritura legadas con una cuenta autorizada.
2. Implementar fase 2 en laboratorio: asignación de empresa/obra coherente, membresía por obra, referencias cruzadas, autor autenticado, restricciones y RPCs administrativos. Probar denegaciones antes del aprovisionamiento remoto.
3. Preparar Creador + dos empresas + cuatro obras + diez usuarios ficticios; los correos `.test` son identidades sintéticas y no deben disparar invitaciones. Credenciales fuera de Git. El manifiesto sigue siendo especificación, no evidencia de cuentas existentes.
4. Activar asignaciones y RLS en una ventana controlada, con estrategia para las obras legadas y reversión de datos revisada. Ejecutar matriz REST/RPC con JWT reales, empresa ajena, otra obra, viewer, técnico, supervisor, administrador y Creador; repetir tras revocar/desactivar. No abrir el piloto al terminar solo fase 1.
5. Cerrar Storage y frontend en los bloques siguientes. Antes de campo, resolver B003 y evitar que el fallback/cola existente o una respuesta tardía muestre datos de otra cuenta, descarte pendientes o confirme un guardado rechazado. El piloto conectado debe bloquear de forma explícita las operaciones sin conexión que todavía no sean seguras. El offline completo queda después.

La captura también confirma estados antiguos (`En progreso`, `Completada`, `Bloqueada`) en `vista_proyectos_resumen` y `vista_ordenes_fotos`, distintos de los de la aplicación. No se encontraron referencias por esos nombres en `src`; revisar consumidores externos y corregir las vistas dentro del lote de estados/informes antes de usarlas.

Plan-OTs y Fio Pro siguen siendo aplicaciones independientes. El límite sigue siendo diez días de trabajo, con bloques adelantables cuando cumplan sus pruebas; no se convierte la velocidad de este lote en una promesa de entrega o certificación de campo.
