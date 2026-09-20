# Día 3 — fundamento aplicado y fase 2 preparada

Estado: fase 1 aplicada en `Plan-ots-2` y verificada. Fase 2 implementada, reversible y aprobada en laboratorio; no aplicada al servidor. No se crearon todavía empresas, usuarios ni obras ficticias.

## Servidor

El preflight confirmó rol `postgres`, ausencia de objetos previos y 13 obras legadas con creador. La migración `202609200001` terminó correctamente. Su verificación con aserciones comprobó tablas con RLS, columnas nullable de transición, triggers, permisos de tablas y funciones; `anon` no ejecuta los helpers. La evidencia de catálogo está en [server-phase1.json](server-phase1.json).

Una transacción como usuario autenticado creó y editó una obra temporal, generó la membresía `supervisor` y la vio con `tenant_id = null`; luego hizo rollback. La consulta posterior confirma 13 obras legadas y cero filas en las tres tablas nuevas. Por eso el cliente anterior conserva su funcionamiento y no hay datos ficticios a medio crear.

## Fase 2 de laboratorio

[La migración](../../../supabase/migrations/202609200002_multitenancy_enforcement.sql) incorpora:

- acceso efectivo que exige membresía de obra, membresía activa de empresa y empresa activa;
- compatibilidad temporal para las obras legadas sin empresa, limitada a sus miembros históricos;
- roles de obra acotados por el rol de empresa;
- empresa y creador de una obra inmutables para clientes;
- referencias compuestas que impiden asociar fotos, campos o comentarios con órdenes de otra obra;
- políticas de dominio exclusivas para `authenticated` y retirada de grants de `anon`;
- helpers `SECURITY DEFINER` con propietario y `search_path` controlados;
- triggers que asignan automáticamente la empresa del usuario al crear una obra y copian la empresa a sus membresías.

El preflight remoto de fase 2 encontró **cero** referencias cruzadas en los datos actuales y ninguna colisión de nombres. [La suite](phase2-lab-tests.json) pasa **21/21** escenarios en PostgreSQL 17.5 WASM, incluida la verificación operativa, el rollback vacío a fase 1 y el seed completo. No sustituye pruebas con JWT/REST reales, Storage ni concurrencia.

La [verificación](../../../supabase/verification/202609200002_multitenancy_enforcement.verify.sql) comprueba catálogo, funciones, grants, políticas, triggers y referencias. El [rollback](../../../supabase/rollback/202609200002_multitenancy_enforcement.rollback.sql) preserva datos pero se detiene si ya existen empresas o asignaciones; después del seed hará falta una migración inversa de datos específica.

## Aprovisionamiento preparado

El [seed](../../../supabase/seeds/20260920_fictional_tenants.sql) resuelve por email las once cuentas Auth especificadas, aborta si no encuentra exactamente once, y crea dos empresas, cuatro obras, diez miembros de empresa y catorce membresías de obra. Usa UUID deterministas, no contiene contraseñas y no envía invitaciones. También se detiene si encuentra empresas u obras existentes.

Las cuatro obras quedan con `pending://plan-upload-required`: no deben abrirse en el visor hasta cargar planos reales en el flujo privado de Storage. El seed solo se ejecutará después de respaldar/exportar las filas actuales, resetear el dominio de forma controlada, aplicar fase 2 y crear las cuentas Auth por el canal administrativo.

## Próximo gate

El bloque siguiente necesita revisión Astra antes de modificar las 31 políticas históricas y los grants del dominio. Después: backup de filas/objetos, aplicar fase 2 vacía, comprobarla, crear cuentas ficticias, ejecutar el seed y realizar la matriz real A/B con JWT. Si cualquier denegación falla, no se continúa con Storage ni frontend.
