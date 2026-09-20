# Contrato de integración con Fio Pro

## Evidencia revisada

Se revisó en modo lectura el repositorio `C:\dev\fio-pro`, incluyendo sus reglas de trabajo, método, master, traspaso reciente, esquema y RLS. El árbol contiene muchos cambios sin commit posteriores al `HEAD` registrado, por lo que no se modificó ni se usó como fuente para una publicación. Antes de programar allí se necesita un checkpoint verificable que preserve archivos seguidos y no seguidos.

Fio Pro ya implementa el patrón `Creador -> tenant -> obra -> obra_miembros`, con permisos por capacidad y evidencia privada en Storage. Plan-OTs debe conservar la misma semántica aunque los nombres físicos de sus tablas difieran. No se compartirán tablas, claves `service_role`, buckets completos ni escrituras directas entre aplicaciones.

## Decisión de arquitectura

Cada producto sigue siendo dueño de sus datos:

- Fio Pro: empresas, obras, usuarios, fiscalización y no conformidades.
- Plan-OTs: documentos espaciales, revisiones, láminas, anclajes y órdenes de trabajo.
- El vínculo usa IDs estables y un contrato versionado. Nunca se resuelve por nombre de empresa, texto de obra, responsable o URL de archivo.
- Un adaptador traduce `tenant/obra/usuario` de Fio Pro a `tenant/proyecto/usuario` de Plan-OTs. La autorización se vuelve a comprobar en el sistema dueño antes de leer o escribir.

La primera integración será un flujo vertical pequeño: desde una no conformidad de Fio Pro se abre el plano correcto y su anclaje; desde Plan-OTs se puede volver a la entidad de origen. No se hará sincronización bidireccional general en esa primera etapa.

## Contrato espacial inicial

El tipo base está en `src/types/tenant.ts` como `SpatialAnchor`:

| Campo | Significado |
|---|---|
| `tenant_id` | Empresa que posee el dato |
| `project_id` | Obra/proyecto autorizado |
| `source_system` | `plan-ots` o `fio-pro` |
| `entity_type` | `work_order` o `non_conformity` |
| `entity_id` | UUID de la entidad en su sistema dueño |
| `document_revision_id` | Revisión inmutable del plano |
| `sheet_id` | Página/lámina dentro de la revisión |
| `u`, `v` | Coordenadas normalizadas 0..1 |

La primera versión 2D no promete GPS interior, coordenadas geográficas ni BIM. Esos campos se podrán sumar sin reinterpretar un anclaje existente.

## Reglas compartidas

1. Una cuenta activa pertenece a una empresa; el Creador queda fuera de los tenants.
2. Pertenecer a la empresa no otorga acceso automático a todas sus obras.
3. La membresía de obra/proyecto y sus capacidades deciden lectura, inspección, edición, cierre, informe, costos y administración.
4. Toda ruta de Storage empieza por tenant y obra/proyecto, y la policy valida ambos segmentos.
5. El actor proviene del token validado en servidor; no se acepta un actor elegido por el payload.
6. Las operaciones cruzadas llevan `command_id` para reintentos idempotentes y registran `source_system`.
7. Los deep links no son autorización. La pantalla destino vuelve a validar membresía.

## Cuándo convertirlo en skill

La skill se crea después de demostrar un caso reproducible en ambos repositorios: alta del contrato, montaje del visor, creación/lectura de un anclaje, aislamiento entre las dos empresas, deep link y rollback. La skill documentará el preflight, archivos que se adaptan, migraciones, pruebas y recuperación. La lógica del producto y sus permisos permanecerán en código y SQL versionados.

## Gate antes de tocar Fio Pro

1. Capturar estado Git, hashes y archivos no seguidos del árbol actual.
2. Crear backup/checkpoint sin sobrescribir el trabajo pendiente.
3. Ejecutar las verificaciones que su propio `CLAUDE.md` exige sobre un estado estable.
4. Crear una rama `codex/` desde ese checkpoint o trabajar en un worktree aislado.
5. Empezar con el adaptador y el enlace de navegación; no alterar su ciclo productivo de NC en el primer cambio.

Este gate protege una aplicación en producción y permite volver atrás. No es una duda funcional ni una espera por autorización adicional.
