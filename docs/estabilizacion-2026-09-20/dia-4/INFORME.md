# Día 4 — aislamiento de dominio activado y ensayo online

## Resultado

Fase 2 aplicada en `iqgbyqyoovzvhhdjawnt` y verificada: 2 empresas, 4 obras gestionadas, 10 membresías de empresa, 14 membresías de obra ficticia y 1 Creador. Se crearon 11 cuentas Auth por Admin API, con correo confirmado y sin enviar invitaciones. Las 13 obras legadas permanecen accesibles únicamente a sus miembros históricos y al Creador.

Cada obra ficticia tiene una OT ubicada y un plano SVG sintético. El archivo público del dibujo no contiene información real ni constituye una prueba de privacidad de Storage.

La app se abrió en `http://127.0.0.1:5173/`, con sesión de `tecnico1@empresa1.plan-ots.test`, mostrando únicamente su obra, el plano y el marcador. El servidor local debe seguir ejecutándose para usar este enlace. Existe un despliegue anterior en `https://plan-ots-pro.pages.dev/`; este lote de frontend **no fue publicado allí**.

## Correcciones respecto del borrador del día 3

- Se reprodujeron cinco fallos antes de cambiar el SQL: INSERT RETURNING de proyectos rechazado; falsificación de autor y editor de OT; rebaja a viewer sin revocación efectiva de escritura; supervisor legítimo incapaz de añadir miembros por RLS de empresa.
- Creación/duplicación de obra mediante `plan_crear_proyecto`, con comprobación de empresa/rol y membresía atómica. INSERT directo desde authenticated queda revocado. El cliente local usa el RPC; clientes publicados anteriores necesitan actualización.
- Los permisos efectivos consultan el rol de empresa vigente además del rol de obra. Revocación y desactivación actúan sobre sesiones ya emitidas.
- Trigger de normalización de miembros con SECURITY DEFINER, search_path acotado y sin EXECUTE público. La política RLS sigue autorizando al actor.
- Validación de identidad, autoría y editor en escrituras. Las referencias de OT/foto/comentario no pueden cruzar obras. Lectores tampoco pueden borrar sus fotos/comentarios tras perder capacidad de edición.
- Seed compatible con datos legados: no requiere reset. Reversión de fixtures identificados separada de la reversión de políticas.

## Evidencia

| Comprobación | Resultado | Archivo |
|---|---|---|
| Regresión antes de corregir | 5 fallos reproducidos | `phase2-lab-before.json` |
| PostgreSQL local con catálogo capturado | 30/30 | `phase2-lab-tests.json` |
| Auth y REST con 11 cuentas/JWT reales | 40/40 | `rest-matrix.json` |
| Verificación de catálogo remoto | 32 políticas de dominio; 2 empresas/4 obras | `phase2-remote-final.json` |
| Restauración local + migración + seed + reversión | filas de dominio idénticas al respaldo REST | `recovery-test.json` |
| Conservación de filas legadas remotas | contenido/conteos coincidentes | `legacy-preservation.json` |
| Contrato de órdenes | 4/4 | `node scripts/test-orden-contract.mjs` |
| Typecheck de aplicación y build | correctos | `tsc -p tsconfig.app.json --noEmit`; `npm run build` |
| Visor con cuenta ficticia | plano y marcador visibles | `preview-local.png` |

La prueba local incluye los triggers reales de auditoría y compara funciones, políticas y grants antes/después del rollback. Auth sigue simulado en ese laboratorio; la matriz REST complementa esa limitación. No se ejecutó una restauración destructiva contra el servidor remoto.

El build conserva advertencias preexistentes de tamaño, imports mixtos y eval en PDF.js; no se interpretan como aprobación para campo.

## Respaldo y recuperación

Directorio privado e ignorado por Git: `.backups.local/2026-09-20-dia4/`.

- `schema-before.json`: catálogo previo a fase 2 capturado por UI. La interfaz normaliza espacios; sirve como evidencia y fue contrastado mediante pruebas de comportamiento.
- `domain-data.json`: captura previa por UI; se detectó normalización de espacios repetidos en dos filas. **No usar como copia exacta de texto.**
- `domain-data-rest.json`: respaldo exacto obtenido por REST de las mismas filas legadas identificadas previamente. Se contrastaron todos sus valores con la captura previa; únicamente difieren los espacios compactados por la UI. Este es el archivo usado para la recuperación final. No se afirma igualdad byte a byte con una captura previa que normalizó texto.
- `test-credentials.local.json`: contraseñas aleatorias de las cuentas ficticias. No incorporarlas al código, documentación compartida ni mensajes públicos.

Para deshacer el lote: revisar y ejecutar primero `supabase/rollback/20260920_fictional_tenants.rollback.sql`, después `supabase/rollback/202609200002_multitenancy_enforcement.rollback.sql`, y restaurar el cliente del checkpoint anterior. El primer script aborta si existen obras adicionales en los tenants ficticios. Conserva las cuentas Auth; su eventual eliminación requiere el canal Admin y el listado exacto de cuentas aprovisionadas. No elimina archivos Storage ni constituye el reset general posterior.

Una clave service_role apareció accidentalmente en una salida técnica privada al inspeccionar la interfaz. No se incorporó al repositorio, frontend ni informes. Su copia temporal local se elimina al cerrar el lote. Antes de compartir esta tarea o publicar la siguiente versión conviene rotarla de forma coordinada, actualizando las claves dependientes; no se rotó automáticamente para evitar cortar los clientes existentes.

## Límites y siguiente bloque

El día 4 cierra el aislamiento de filas y el aprovisionamiento de prueba. **No habilita aún el piloto de campo ni certifica toda la seguridad del producto.**

1. Día 5: planos/fotos/exports privados, rutas por empresa/obra, acceso temporal y matriz de Storage.
2. Día 6: aislamiento de caché/cola y cambio de identidad; controles de rol en UI, Creador y selector de empresa. El frontend aún puede mostrar acciones que el servidor rechaza y conserva la marca estática histórica.
3. La confidencialidad de costos sigue pendiente en servidor: ocultarlos en UI no basta; la lectura de `ordenes`/snapshots puede incluirlos. Resolver antes del piloto, junto con capacidades y proyecciones de datos del día 6.
4. El enlace público con este lote debe publicarse después de esos controles. La vista local ya permite revisar el recorrido con un usuario ficticio y conexión, sin certificar cambio de cuenta, offline, subida privada o informes.

Referencia de aprovisionamiento utilizada: [Supabase Auth Admin createUser](https://supabase.com/docs/reference/javascript/auth-admin-createuser).
