# Replicación de planos en Fio Pro

## Decisión

Plan-OTs y Fio Pro serán aplicaciones totalmente independientes. No compartirán base de datos, Auth, Storage, APIs, tablas, despliegue ni sesiones. Tampoco habrá deep links obligatorios, sincronización de entidades o adaptadores entre ambas.

El objetivo futuro es estudiar la solución de planos de Plan-OTs y reproducir en Fio Pro la capacidad que necesita el fiscal: abrir un plano de su obra, ubicar una no conformidad en un punto exacto y volver a encontrarla desde el plano o desde la NC.

Esta alternativa es el camino más corto y seguro porque:

- Fio Pro ya tiene su propio modelo `tenant -> obra -> obra_miembros` y sus permisos probados.
- Una integración agregaría autenticación entre sistemas, sincronización, fallos distribuidos y operación conjunta que el producto no necesita.
- Cada aplicación puede evolucionar y desplegarse sin bloquear a la otra.
- Un incidente, cambio de schema o caída de un sistema no afecta al otro.

## Qué se reutiliza

Se reutilizan conocimientos y patrones, no datos ni servicios:

- coordenadas normalizadas `u/v` entre 0 y 1;
- documentos con revisiones y láminas identificables;
- marcadores que conservan su posición aunque cambie el tamaño de pantalla;
- interacción de zoom, desplazamiento y selección;
- pruebas de coordenadas nulas, `(0,0)`, rotación y cambio de revisión;
- políticas de Storage privado y paths por tenant/obra;
- criterios visuales y de uso en tablet.

Se puede portar código puro de geometría si se revisa y se copia dentro del repositorio de Fio Pro. Después de copiarlo, Fio Pro será dueño de esa versión; no dependerá en runtime de Plan-OTs.

## Modelo nativo propuesto para Fio Pro

Cuando Plan-OTs haya pasado su prueba de campo, Fio Pro puede incorporar de forma local:

- `planos`: documento lógico perteneciente a `tenant_id` y `obra_id`;
- `plano_revisiones`: archivo inmutable y versión;
- `plano_laminas`: página/lámina y dimensiones;
- `nc_ubicaciones`: `no_conformidad_id`, revisión, lámina, `u`, `v`;
- bucket privado con path `<tenant_id>/<obra_id>/<revision_id>/<archivo>`;
- policies basadas en `fio_obras_visibles()` y `fio_puede()`.

La no conformidad continúa siendo propiedad exclusiva de Fio Pro. El marcador referencia su UUID local. No se consulta Plan-OTs para abrir, guardar o autorizar nada.

## Cuándo crear la skill

La skill se crea después de que el flujo de Plan-OTs funcione en campo y la primera réplica nativa en Fio Pro pase sus pruebas. La skill enseñará el procedimiento: inventario, tablas, Storage, montaje del visor, coordenadas, RLS, pruebas tablet y rollback. No conectará las dos aplicaciones ni contendrá secretos.

## Condición para modificar Fio Pro

El repositorio `C:\dev\fio-pro` tiene trabajo local sin commit. Antes de programar allí se debe crear un checkpoint que incluya archivos seguidos y no seguidos, verificarlo y trabajar en una rama o worktree aislado. Esto permite copiar la capacidad sin arriesgar su versión productiva actual.
