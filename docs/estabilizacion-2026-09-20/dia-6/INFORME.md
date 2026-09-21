# Día 6 — sesión, capacidades y costos

Bloque completado para el piloto conectado. Migración `202609210004_session_capabilities_costs.sql` aplicada y verificada en Supabase. Frontend disponible en la vista local; **no publicado en Cloudflare**. Baseline reversible de código: `746abef2cf3cff4c76297b93bf22d9923014d478`.

## Resultado

- Sesión verificada antes de cargar datos, contexto efectivo de empresas/obras desde el servidor y permisos de edición/administración/costos coherentes con RLS. Selector por empresa y administración exclusiva del Creador para empresas y membresías de cuentas existentes. No incluye alta/invitación de cuentas Auth.
- Cambio de identidad cancela peticiones y recarga el documento. El transporte comprueba identidad del JWT, generación de sesión y respuesta antes de entregarla. Contexto revalidado al volver a la pestaña, recuperar conexión y cada 60 segundos; los cambios de permisos recargan la aplicación. RLS vuelve a comprobar permisos en cada petición, incluso con JWT anterior.
- Órdenes, campos y proyectos requieren confirmación del servidor. Los errores no crean éxitos optimistas ni recurren a cachés sin identidad. Preferencias que contienen datos de usuario quedan bajo claves propias de la sesión.
- La cola y caché offline antiguas quedan conservadas pero fuera del flujo del piloto: no se leen, adoptan, sincronizan ni borran automáticamente. No se ofrece offline completo. Una interrupción de conexión oculta la aplicación hasta revalidar acceso; los formularios montados se conservan en ese documento, sin prometer recuperación tras cerrarlo o cambiar de cuenta.
- Costos trasladados a `orden_costos`, con lectura restringida en servidor. Técnicos y lectores no los reciben por API ni mediante filtros; versiones históricas quedan reservadas a supervisores. El trigger mantiene escritura autorizada y archivo de órdenes con costo. El campo legado de `ordenes` queda nulo. En el contrato actual, costo nulo no modifica el importe privado; cero sí lo actualiza.

## Evidencia

| Comprobación | Resultado |
|---|---|
| SQL/RLS, roles, revocación, costos, auditoría y rollback en laboratorio | 32/32 — `sql-tests.json` |
| Auth/REST real con las 11 cuentas ficticias, incluidos JWT anteriores a revocación | 19/19 — `rest-tests.json` |
| Cliente: cambio de sesión, respuestas tardías, errores, cola antigua y mapper de costo | 17/17 — `client-tests.json` |
| Mapper canónico de campos y valores nulos/cero | Aprobado, `scripts/validate-orden-mapper.mjs` |
| Recuperación local de respaldo, migración y rollback | 370 filas, 15 tablas, 21 costos originales íntegros — `recovery-test.json` |
| Preservación remota antes/después | 366 filas anteriores idénticas; cuatro OTs ficticias reciben importes de prueba; 21 costos originales íntegros — `preservation.json` |
| Servidor tras pruebas | Cero costos en columna pública, 25 privados; 188 objetos y tres buckets privados conservados — `server-verification.json` |
| Navegador | Cambio técnico empresa 1 → lector empresa 2: solo obra autorizada, sin costos y edición deshabilitada. Creador: selección de empresa y administración visibles. Capturas adjuntas. |

TypeScript y build de producción aprobados. ESLint de módulos nuevos/rehechos aprobado. Continúan advertencias conocidas de tamaño de bundle y PDF.js, sin atribuirlas a una validación de seguridad del visor. Los tests locales de SQL simulan Auth; las comprobaciones REST usan sesiones reales. No se realizó reset remoto ni restauración de Auth/Storage en producción.

## Recuperación y límites

Respaldos privados en `.backups.local/2026-09-20-dia6/`: archivos sensibles anteriores, esquema y filas antes/después. El respaldo de los 180 archivos originales del día 5 sigue conservado; este bloque no modifica Storage. Migración, rollback y verificación versionados en `supabase/`. El rollback repone los costos en la columna antigua y reduce su confidencialidad: reservarlo para recuperación controlada, no usarlo como cambio de versión rutinario.

La revisión automática impidió copiar la clave administrativa desde el panel por falta de autorización específica. Se completaron respaldo y validación mediante el editor SQL y cuentas ficticias existentes, sin esa copia.

La revocación impide nuevas lecturas/escrituras, pero no puede retirar datos ya descargados por un usuario previamente autorizado. No se redactan importes que alguien haya escrito manualmente en texto libre o archivos. La recuperación asistida de pendientes offline antiguos se realizará por separado, identificando su propietario.

Antes de publicar: rotar coordinadamente la clave administrativa expuesta en el control anterior, desplegar el frontend actualizado y ejecutar el guion del piloto. El sitio público anterior no representa este estado. El día 7 debe cerrar edición/conflictos/Realtime/fotos con red intermitente; el día 8, informes HTML y restauración. No equivale a habilitación comercial.

## Siguiente bloque y cuota

Día 7 delimitado para **Sol alto**, conforme a la distribución acordada. Volver a Astra si aparecen fallos contradictorios de autorización o pérdida de datos, y para el gate final. No se cambió automáticamente el modelo de esta tarea. La cuota es compartida por la cuenta: no se atribuye su variación únicamente a este bloque ni se promete un ahorro porcentual.
