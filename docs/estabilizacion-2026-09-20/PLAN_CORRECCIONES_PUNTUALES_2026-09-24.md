# Correcciones puntuales y salida del lote

Estado al 24/09/2026. Base de trabajo: `codex/estabilizacion-20260920`, commit `74461f2`, enviado a `origin`. El build de ese commit pasó. El sitio publicado todavía no contiene este lote. En Supabase `Plan-ots-2`, `guarani3d@gmail.com` ya es Creador. Las cuentas `tecnico1@empresa1.plan-ots.test` y `tecnico2@empresa1.plan-ots.test` iniciaron sesión y cada una leyó únicamente su obra de Empresa de prueba 1. Se usarán durante el piloto como `user1` y `user2`; sus claves se conservan fuera de Git en `.backups.local/2026-09-20-dia4/usuarios-campo-empresa1.local.json`.

## Un encargo pequeño por tarea

| Dueño | Encargo | Límite de archivos | Aceptación |
| --- | --- | --- | --- |
| Luna | Unificar la grilla de metadatos del Panel OT: igual altura, tipografía y separación en campos equivalentes; descripciones y observaciones ocupan todo el ancho. | `src/components/plano/PanelOT.tsx`, `PanelOT.module.css` | Revisar escritorio y tablet. Sin desborde ni controles comprimidos; `npx tsc -p tsconfig.app.json --noEmit`. No tocar guardado, APIs ni Supabase. |
| Terra | Hacer cómoda la vista previa de informes: editor y documento con desplazamiento independiente, acciones visibles, ancho útil en escritorio y tablet. | `src/components/informes/ModalInformeOT.tsx`, `ModalInformeOT.module.css` | Se puede revisar inicio y fin del documento y usar las acciones sin perder el formulario. Build y revisión visual. No tocar generación, exportación, APIs ni Supabase. |
| Codex principal | Revisar dictado duplicado, creación de OT desde plano en escritorio y eliminación de proyecto sin pestañeo; integrar los cambios de Luna y Terra. | `VoiceInputButton` y flujos implicados, con cambios mínimos | Prueba de cada defecto reproducido, typecheck y build. Coordinar cambios de servidor y publicación en un solo lugar. |

Cada tarea arranca desde el commit de base indicado, modifica solo su alcance, entrega un diff y una comprobación concreta. Si aparece una dependencia fuera del alcance, se informa antes de editarla. No abrir tareas paralelas sobre el mismo archivo.

## Orden de publicación

1. Cerrar las correcciones puntuales y revisar los diffs integrados. Confirmar el último ajuste que el usuario quiera incluir en este lote.
2. Ejecutar typecheck, build y pruebas dirigidas; probar en vista previa las pantallas afectadas con Creador y los dos técnicos ficticios.
3. Aplicar en Supabase, en este orden, `202609240016_contratistas_creator_only.sql` y `202609240017_notifications_by_role.sql`, conservando las definiciones previas y verificando tabla, funciones y permisos. Hoy las tres comprobaciones remotas de esas migraciones dieron `false`.
4. Publicar el frontend del mismo commit mediante la ruta de Cloudflare Pages del proyecto. Verificar qué rama alimenta producción antes de integrar o desplegar; el default remoto actual es `tablet-v1` y este lote sigue en `codex/estabilizacion-20260920`.
5. Hacer prueba funcional en el sitio publicado: Creador, directorios, notificaciones por rol, creación de OT en mapa, guardado, borrado de proyecto y acceso aislado de `user1` y `user2`. Registrar commit y resultado. Si falla, usar las migraciones de reversión y el commit anterior según el componente afectado.

No aplicar las dos migraciones antes de estar listo para publicar el frontend compatible: la restricción nueva de contratistas puede afectar el cliente todavía publicado.
