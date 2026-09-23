# Despliegue del esquema documental — 23/09/2026

Destino: Supabase `Plan-ots-2`, rama de base de datos `main` (producción). Fuente de las tres migraciones: commit `0132fbb` de `codex/estabilizacion-20260920`. Se aplicaron en orden desde el editor SQL con rol `postgres`, cada una dentro de su transacción.

| Migración | Resultado |
|---|---|
| `202609230009_document_policies.sql` | Aplicada; módulos y decisiones por empresa, con acceso mediante funciones del Creador. |
| `202609230010_document_identity.sql` | Aplicada; folio global, documentos, borradores y revisiones anexables. |
| `202609230011_order_service_export_audit.sql` | Aplicada; auditoría de solicitud de exportación acepta `orden_servicio` y conserva compatibilidad con `ficha`. |

Antes del despliegue, las tres migraciones se ejecutaron en PGlite con datos ficticios mediante `npm run test:documents`. La prueba cubre decisiones, reserva e idempotencia, unicidad de folios más allá de ocho dígitos, control de versiones de borrador, revisiones anteriores, permisos y auditoría. PGlite no sustituye una prueba de extremo a extremo en el servicio alojado.

Verificación de solo lectura posterior en producción: las tablas de políticas, documentos y revisiones existen; `plan_documentos` y `plan_politica_decisiones` tenían 0 filas; `anon` no tiene `SELECT` en documentos; `authenticated` tiene `EXECUTE` en el RPC de guardado; y la definición de auditoría incluye `orden_servicio`. Las tres ejecuciones devolvieron `Success. No rows returned`.

**Alcance actual:** el esquema permite identidad y borradores. La interfaz de borradores está implementada en la rama de trabajo y aún requiere publicación de esa versión del frontend y prueba en tablet. Ninguna función de emisión oficial o firma se habilitó. Faltan retención verificable de PDF y evidencias, vinculación de aprobaciones a revisión y hash exactos, validación de permisos al emitir, descarga inmutable y prueba integral del expediente. Los contadores en cero confirman que este despliegue no generó documentos ni decisiones por sí mismo.
