# 03 — COHERENCIA CÓDIGO ⇄ BASE DE DATOS

**Fecha:** 2026-07-26 · **HEAD:** `e4897e8` · **Modo:** solo lectura — no se modificó ningún archivo ni ninguna fila.
**Proyecto Supabase:** `Plan-ots-2` (`iqgbyqyoovzvhhdjawnt`)
**Fuente del schema:** MCP de Supabase contra la base **real en producción** (`list_tables`, `pg_policies`, `pg_class`, `pg_publication_tables`, `information_schema.triggers`, `storage.buckets`). No se usó `OTPLANO_SCHEMA.sql`.
**Consultas ejecutadas:** solo `SELECT` / catálogo. Ninguna escritura.

**Estado de los datos (para contexto):** 13 proyectos (4 activos), 84 órdenes, 106 fotos, 22 versiones, 13 filas en `proyecto_miembros`, 3 en `ordenes_eliminadas`, 0 en `sync_log`.

---

## Resumen ejecutivo

| # | Hallazgo | Severidad |
|---|---|---|
| D-1 | Notificaciones nunca se disparan: el código espera `REPLICA IDENTITY FULL` y `ordenes` tiene `default` | 🔴 Rompe en runtime |
| D-2 | `SyncManager` escribe `descripcion` en la columna `comentarios` y descarta 25 columnas al sincronizar OTs creadas offline | 🔴 Corrompe datos |
| D-3 | `SyncManager` UPDATE_OT descarta 25 columnas: toda edición offline de campos extendidos se pierde al reconectar | 🔴 Pierde datos |
| D-4 | `useRealtimeOrdenes` vacía 25 columnas al recibir un cambio de otro cliente | 🟠 Visible en UI |
| D-5 | `useRealtimeOrdenes` responde a un DELETE remoto emitiendo otro DELETE contra Supabase | 🟡 Redundante |
| D-6 | `camposService` arma `opciones` como literal PostgreSQL concatenado; `seleccion_multiple` nunca recibe opciones | 🟡 Falla con datos |
| D-7 | `fotos` tiene políticas RLS `USING (true)` que anulan el control por proyecto | 🟠 Seguridad |
| D-8 | Dos tablas de comentarios en paralelo (`ot_comentarios` y `comentarios_ot`), ambas vivas | ⚪ Confusión |

**Sin hallazgos** en: columnas inexistentes referenciadas por el código (0), NOT NULL sin enviar (0), tablas inexistentes (0), buckets inexistentes (0), rutas de import incorrectas (0), tablas con RLS deshabilitado (0), tablas con RLS sin políticas (0).

---

# 1 · Inventario de llamadas a Supabase en `src/`

Se excluyen los archivos `.bak`. `src/components/dashboard/Dashboard.tsx` se incluye marcado como **huérfano** (nunca se importa — ver `02_FUNCIONALIDAD_INCOMPLETA.md`, I-2).

### Tablas

| Archivo:línea | Tabla | Op | Columnas referenciadas |
|---|---|---|---|
| `stores/proyectosStore.ts:42` | `proyectos` | SELECT | `*` · filtro `deleted_at IS NULL` · orden `updated_at` |
| `stores/proyectosStore.ts:102` | `proyectos` | INSERT | `nombre, cliente, descripcion, plano_url, created_by` |
| `stores/proyectosStore.ts:126` | `proyectos` | UPDATE | `deleted_at` · filtro `id` |
| `stores/proyectosStore.ts:146` | `proyectos` | INSERT | `nombre, cliente, descripcion, plano_url, rubros, tecnicos, created_by` |
| `stores/ordenesStore.ts:188` | `ordenes` | SELECT | `*` · filtro `.in(proyecto_id)` · orden `updated_at` |
| `stores/ordenesStore.ts:227` | `ordenes` | SELECT | `*` · filtro `proyecto_id` · orden `ot` |
| `stores/ordenesStore.ts:298` | `ordenes` | INSERT | 39 columnas (`ordenToRow`, líneas 60-102) |
| `stores/ordenesStore.ts:345` | `ordenes` | INSERT | ídem `ordenToRow` |
| `stores/ordenesStore.ts:414` | `ordenes` | UPDATE | `pos_x, pos_y, updated_at, updated_by` |
| `stores/ordenesStore.ts:471` | `ordenes` | UPDATE | `updated_at, updated_by` + hasta 34 de `camposPublicos` (líneas 448-466) |
| `stores/ordenesStore.ts:516` | `ordenes` | DELETE | filtro `id` |
| `sync/SyncManager.ts:39` | `ordenes` | INSERT | 14 columnas (`ordenToRow`, líneas 15-32) — **ver D-2** |
| `sync/SyncManager.ts:61` | `ordenes` | UPDATE | `updated_at` + 9 de `camposPublicos` + `comentarios`/`ubicacion` — **ver D-3** |
| `sync/SyncManager.ts:68` | `ordenes` | DELETE | filtro `id` |
| `services/versionesService.ts:91` | `versiones` | INSERT | `proyecto_id, nombre, descripcion, snapshot, created_by` |
| `services/versionesService.ts:116` | `versiones` | SELECT | `id, nombre, descripcion, created_at, created_by, snapshot` |
| `services/versionesService.ts:134` | `versiones` | SELECT | `*` |
| `services/versionesService.ts:150` | `versiones` | DELETE | filtro `id` |
| `services/versionesService.ts:173` | `ordenes` | UPDATE | `ot, ubicacion, rubro, estado, responsable, prioridad, pos_x, pos_y, comentarios, campos, updated_at` |
| `services/fotosService.ts:72` | `fotos` | INSERT | `orden_id, proyecto_id, categoria, file_url, file_path, file_type` |
| `services/fotosService.ts:60` | `fotos` | DELETE | filtro `id` |
| `services/fotosService.ts:106` | `fotos` | SELECT | `id, orden_id, proyecto_id, categoria, file_url, file_path, file_type, descripcion` |
| `services/editorFotoService.ts:31` | `fotos` | SELECT | `anotaciones, descripcion_observacion` |
| `services/editorFotoService.ts:54` | `fotos` | UPDATE | `anotaciones, descripcion_observacion` |
| `services/editorFotoService.ts:91` | `fotos` | UPDATE | `file_url, anotaciones, descripcion_observacion` |
| `services/camposService.ts:52` | `campos_definicion` | SELECT | `*` · filtro `proyecto_id` · orden `orden` |
| `services/camposService.ts:112` | `campos_definicion` | INSERT | `id, proyecto_id, nombre, tipo, obligatorio, opciones, formula, orden` |
| `services/camposService.ts:143` | `campos_definicion` | UPDATE | `nombre \| obligatorio \| opciones \| orden` (parcial) |
| `services/camposService.ts:159` | `campos_definicion` | DELETE | filtro `id` |
| `services/camposService.ts:185` | `campos_definicion` | UPDATE | `orden` |
| `services/comentariosService.ts:26` | `ot_comentarios` | SELECT | `*` · filtro `orden_id` |
| `services/comentariosService.ts:48` | `ot_comentarios` | SELECT | `comentario` · filtros `orden_id, estado_anterior, estado_nuevo` |
| `services/comentariosService.ts:68` | `ot_comentarios` | INSERT | `orden_id, proyecto_id, user_id, user_email, estado_anterior, estado_nuevo, comentario` |
| `services/comentariosOtService.ts:15` | `comentarios_ot` | SELECT | `*` · filtro `orden_id` |
| `services/comentariosOtService.ts:31` | `comentarios_ot` | INSERT | `orden_id, proyecto_id, user_id, user_name, texto` |
| `services/comentariosOtService.ts:41` | `comentarios_ot` | DELETE | filtro `id` |
| `services/dashboardConfigService.ts:54` | `dashboard_configs` | SELECT | `widgets` · filtro `user_id` |
| `services/dashboardConfigService.ts:78` | `dashboard_configs` | UPSERT | `user_id, widgets, updated_at` · `onConflict: user_id` |
| `services/statsService.ts:19` | `ordenes` | SELECT | `proyecto_id, estado` |
| `services/informeService.ts:124` | `fotos` | SELECT | `categoria, file_url, file_type` |
| `services/informeService.ts:233` | `ordenes` | SELECT | `id, ot, estado, rubro, responsable, ubicacion, comentarios, prioridad, porcentaje_avance, fecha_fin_trabajos, campos, created_at, updated_at, proyecto_id` |
| `components/plano/PanelOT.tsx:197` | `proyecto_miembros` | SELECT | `rol` · filtros `proyecto_id, user_id` |
| `components/plano/PanelOT.tsx:249` | `ordenes` | SELECT | `*` · filtro `id` |
| `components/plano/PanelOT.tsx:358` | `fotos` | UPDATE | `descripcion` |
| `components/plano/PanelOT.tsx:878` | `fotos` | UPDATE | `descripcion` |
| `components/plano/EditorFoto.tsx:254` | `fotos` | SELECT | `descripcion` |
| `components/plano/EditorFoto.tsx:458` | `fotos` | UPDATE | `descripcion` |
| `components/plano/ComparadorVersiones.tsx:252` | `versiones` | SELECT | `id, nombre, created_at, snapshot` |
| `components/dashboard/Dashboard.tsx:65` *(huérfano)* | `proyectos` | SELECT | `id, nombre, cliente` |
| `components/dashboard/Dashboard.tsx:66` *(huérfano)* | `ordenes` | SELECT | `id, ot, estado, responsable, rubro, prioridad, proyecto_id, updated_at` |

### Storage

| Archivo:línea | Bucket | Operación |
|---|---|---|
| `stores/proyectosStore.ts:93` | `planos` | `upload(${user.id}/${timestamp}.${ext})` |
| `stores/proyectosStore.ts:98` | `planos` | `getPublicUrl` |
| `services/fotosService.ts:36` | `fotos` | `upload(${ordenId}/${categoria}/${ts}.${ext})` |
| `services/fotosService.ts:41` | `fotos` | `getPublicUrl` |
| `services/fotosService.ts:56` | `fotos` | `remove([path])` |
| `services/editorFotoService.ts:78` | `fotos` | `upload(${proyectoId}/${ordenId}/anotada_*.jpg)` |
| `services/editorFotoService.ts:85` | `fotos` | `getPublicUrl` |
| `components/plano/CampoVideo.tsx:107` | `fotos` | `upload(${ordenId}/VIDEO/${campoId}_${ts}.mp4)` |
| `components/plano/CampoVideo.tsx:113` | `fotos` | `getPublicUrl` |

**Buckets en la DB:** `planos` (público), `fotos` (público), `exports` (privado).
✅ Los dos buckets que el código usa existen y son públicos — consistente con el `CacheFirst` de `vite.config.ts` sobre `/storage/`.
⚠️ `exports` existe pero **ningún archivo lo usa** (`otprojService` arma el ZIP en el cliente y lo descarga vía `Blob`).

### Realtime (`.channel`)

| Archivo:línea | Canal | Tabla | Eventos |
|---|---|---|---|
| `hooks/useRealtimeOrdenes.ts:39` | `ordenes-${proyectoId}` | `ordenes` | INSERT · UPDATE · DELETE (filtro `proyecto_id`) |
| `components/ui/Notificaciones.tsx:126` | `notif-ordenes-${proyectoId}` | `ordenes` | UPDATE (filtro `proyecto_id`) |
| `components/plano/PanelComentarios.tsx:60` | `comentarios-ot-${ordenId}` | `comentarios_ot` | `*` (filtro `orden_id`) |

**Publicación `supabase_realtime` en la DB:** `ordenes`, `fotos`, `versiones`, `comentarios_ot`.
✅ Las tres tablas suscritas están publicadas.
ℹ️ `fotos` y `versiones` están publicadas pero nadie se suscribe.

### `.rpc()`
**Ninguna llamada.** Las funciones `es_miembro()` / `es_supervisor()` existen en la DB pero solo se usan dentro de las políticas RLS, no desde el cliente.

---

# 2 · Discrepancias

## 🔴 D-1 · Las notificaciones nunca se disparan — `REPLICA IDENTITY` no coincide con lo que el código asume

**Código:** `src/components/ui/Notificaciones.tsx:73-86` (`detectarCambio`) + `:135-140`
**DB:** `pg_class.relreplident = 'd'` para `public.ordenes` (y para las 11 tablas del schema).

```tsx
const oldRec = (payload.old ?? {}) as Record<string, unknown>;
…
const anterior = String(oldRec[campo] ?? '—');   // campo ∈ {estado, responsable, prioridad, rubro}
if (anterior !== nuevo && esCambioRelevante(campo, anterior, nuevo)) { … }
```

Y `esCambioRelevante` (`:56-71`) empieza con:

```tsx
if (anterior === '—' || anterior === '' || anterior === 'null' || anterior === 'undefined') return false;
```

**El problema:** con `REPLICA IDENTITY DEFAULT`, el WAL solo publica la **clave primaria** en `payload.old`. O sea que `payload.old` siempre es `{ id: '…' }` y nunca trae `estado`, `responsable`, `prioridad` ni `rubro`. Por lo tanto `anterior` vale siempre `'—'`, y `esCambioRelevante` devuelve `false` en el primer `if`, para los cuatro campos vigilados, en el 100 % de los eventos.

**Efecto en runtime:** la campanita de notificaciones **nunca muestra una sola notificación**, en ninguna circunstancia. No hay error en consola: el evento llega, se procesa y se descarta en silencio. Esto invalida el trabajo de S30-A (*"Sistema de notificaciones Realtime"*) y de S36-D (*"notificaciones filtradas"*) — el filtro agregado en S36-D es justamente el que suprime todo.

**Las dos formas de arreglarlo** (ninguna aplicada — modo solo lectura):
- DDL: `ALTER TABLE ordenes REPLICA IDENTITY FULL;` — hace que `payload.old` traiga la fila completa. Aumenta el volumen de WAL.
- Código: no depender de `payload.old`; comparar `payload.new` contra el snapshot que ya tiene `ordenesStore`.

## 🔴 D-2 · `SyncManager` escribe `descripcion` en la columna `comentarios` y descarta 25 columnas

**Código:** `src/sync/SyncManager.ts:15-32` — el comentario del archivo dice *"igual que en ordenesStore"*, y no lo es.

```tsx
function ordenToRow(o: OrdenLocal) {
  return {
    id, proyecto_id, ot,
    ubicacion:     o.ubicacion ?? '',
    comentarios:   o.descripcion,        // ← ①
    estado, prioridad, responsable, rubro, pos_x, pos_y,
    plano_ref_url, campos, conflict_flag,
  };                                     // ← ② y nada más
}
```

**① Cruce de campos.** `OrdenLocal.descripcion` ⇄ columna `ordenes.descripcion`, y `OrdenLocal.comentarios` ⇄ columna `ordenes.comentarios` — así lo hace `ordenesStore.ordenToRow:66` (`comentarios: o.comentarios`) y así lo lee `rowToOrden:16`. `SyncManager` mete el texto de `descripcion` dentro de `comentarios`. Resultado para una OT creada sin conexión: la descripción aparece en el campo "Notas y observaciones del técnico", la columna `descripcion` queda `NULL`, y el `comentarios` original se pierde.

**② Columnas descartadas.** `ordenesStore.ordenToRow` envía 39 columnas; esta versión envía 14. Las 25 que se pierden al sincronizar una OT creada offline:

```
fecha_ingreso · obra · unidad_amenities · descripcion · en_garantia · asiste_facility
costo · nivel_riesgo · rubro_secundario · contratistas · fecha_inicio_trabajos
porcentaje_avance · fecha_fin_trabajos · reincidencia · potencialmente_conflictivo
acta_conformidad · informe_relevamiento · informe_avance · informe_cierre
acta_conformidad_url · informe_relevamiento_url · informe_avance_url · informe_cierre_url
created_by · updated_by
```

Todas son NULLABLE o tienen DEFAULT en la DB, así que **el INSERT no falla**: se guarda una OT incompleta y el usuario no se entera. Es exactamente el escenario que `CLAUDE.md` advierte (*"mappers en `ordenesStore.ts` / `SyncManager.ts` son la fuente de verdad — igualar sus listas de campos al agregar columnas"*): las listas se desincronizaron.

## 🔴 D-3 · `SyncManager` UPDATE_OT: toda edición offline de campos extendidos se descarta

**Código:** `src/sync/SyncManager.ts:49-58`

```tsx
const camposPublicos: (keyof OrdenLocal)[] = [
  'ot', 'estado', 'prioridad', 'responsable',
  'rubro', 'pos_x', 'pos_y', 'plano_ref_url',
  'campos', 'conflict_flag',
];
…
if ('descripcion' in campos) patch['comentarios'] = campos.descripcion;   // ← mismo cruce que D-2
if ('ubicacion'   in campos) patch['ubicacion']   = campos.ubicacion;
```

La lista equivalente en `ordenesStore.ts:448-461` tiene **34** entradas; ésta tiene 10. Editando una OT sin conexión, todo cambio en `costo`, `nivel_riesgo`, `contratistas`, `fecha_inicio_trabajos`, `fecha_fin_trabajos`, `porcentaje_avance`, `obra`, `unidad_amenities`, `en_garantia`, `asiste_facility`, `reincidencia`, `potencialmente_conflictivo` y los 8 campos de informes se ve aplicado en pantalla (Zustand + Dexie sí lo guardan) y **se descarta silenciosamente** al reconectar. Peor: el `patch['comentarios'] = campos.descripcion` pisa el comentario real de la OT en el servidor.

Siendo una PWA offline-first, éste es el camino que más importa: es el único momento en que `SyncManager` corre.

## 🟠 D-4 · Realtime vacía 25 columnas cuando otro cliente edita una OT

**Código:** `src/hooks/useRealtimeOrdenes.ts:6-30` (`mapRowToOrdenLocal`)

El mapper construye un `OrdenLocal` con 18 campos. Compará con `ordenesStore.rowToOrden:10-57`, que mapea 47. Faltan las mismas 23 columnas extendidas de D-2 (más `fecha_ingreso` y `descripcion`).

Como `agregarOActualizarOrden` **reemplaza** la fila completa en el store (`ordenesStore.ts:382`), cuando llega un UPDATE de otro dispositivo la OT local pierde `obra`, `descripcion`, `costo`, `nivel_riesgo`, `contratistas`, fechas de trabajo, `porcentaje_avance` y el estado de los 4 informes: la UI los muestra vacíos hasta que se recarga la página o se vuelve a pedir la OT. La DB queda intacta — es corrupción solo de la vista local, pero durante una demo con dos dispositivos se ve como pérdida de datos.

Detalle adicional: `pos_x`/`pos_y` se castean sin `?? 0` (`:16-17`), a diferencia de `rowToOrden:21-22`. Una OT sin ubicar (`pos_x NULL`) llega como `null` donde el tipo declara `number`.

## 🟡 D-5 · Un DELETE remoto dispara otro DELETE contra Supabase

**Código:** `src/hooks/useRealtimeOrdenes.ts:57-60`

```tsx
const id = (payload.old as { id?: string }).id;
if (id) eliminarOrden(id);
```

`eliminarOrden` es la acción del store (`ordenesStore.ts:504-537`), que además de sacar la OT del estado y de Dexie **emite un `DELETE` contra Supabase** y, si falla, encola un `DELETE_OT` en `syncQueue`. O sea: la fila ya fue borrada por otro cliente y este cliente manda una segunda orden de borrado por la misma fila. En la práctica es idempotente (0 filas afectadas, sin error), pero es tráfico y lógica innecesaria; correspondería una acción local-only.

**Nota aparte, misma línea 33:** `const { agregarOActualizarOrden, eliminarOrden } = useOrdenesStore();` desestructura el store sin selector, o sea que el hook se re-suscribe a *todo* el estado. Es el patrón que ya causó el bug de render de marcadores.

## 🟡 D-6 · `campos_definicion.opciones`: literal PostgreSQL armado a mano + `seleccion_multiple` sin opciones

**Código:** `src/services/camposService.ts:100` y `:119-120`
**DB:** `campos_definicion.opciones` es `text[]` (nullable, default `'{}'`).

```tsx
opciones: payload.tipo === 'seleccion_unica' ? (payload.opciones ?? []) : null,   // :100
…
opciones: nuevo.opciones ? `{${nuevo.opciones.join(',')}}` : null,                // :120
```

**a)** El INSERT manda un **string** con formato literal de array (`{Aprobado,Rechazado}`) en vez del array JS. PostgREST lo acepta, pero cualquier opción que contenga `,`, `{`, `}`, `"` o espacios al borde se parte o se corrompe. Ejemplo real: una opción `"Aprobado, con observaciones"` se guarda como **dos** opciones. Nótese que `actualizarCampo:144` manda el array JS directo — las dos rutas usan formatos distintos para la misma columna.

**b)** El ternario de `:100` solo llena `opciones` cuando el tipo es `seleccion_unica`. Un campo `seleccion_multiple` se crea con `opciones: null` y queda inutilizable: el desplegable múltiple no tiene nada que ofrecer.

**c)** Menor: el `TipoCampo` del código (`:7-19`, 12 valores) es un subconjunto del CHECK de la DB (16 valores: agrega `calculo`, `archivo`, `audio`, `gps`). No rompe nada — solo significa que esos 4 tipos no se pueden crear desde la UI, y que si existiera una fila con `tipo='gps'` el `CampoRenderer` no sabría dibujarla.

## ⚪ D-7 · Discrepancias menores de `proyectos` (no rompen)

- `Proyecto` (`stores/proyectosStore.ts:6-18`) declara 12 campos; la tabla tiene 16. Faltan en la interfaz: `metadatos`, `plano_width_px`, `plano_height_px`, `transform_matrices`, `deleted_at`. Como la query es `select('*')` y el resultado se castea, esas columnas llegan y se ignoran. Sin efecto, pero el tipo miente sobre la fila.
- `duplicarProyecto` (`:145-157`) no copia `plano_thumb_url`, `plano_width_px`, `plano_height_px` ni `transform_matrices`: el proyecto duplicado comparte el mismo `plano_url` pero pierde la miniatura y las dimensiones cacheadas.

## ⚪ D-8 · Dos tablas de comentarios en paralelo, con nombres invertidos

Ambas existen en la DB y ambas están en uso activo por sistemas distintos:

| Tabla | Servicio | Componente | Para qué |
|---|---|---|---|
| `ot_comentarios` | `comentariosService.ts` | `HistorialComentarios` | Bitácora de transiciones de estado (`estado_anterior` → `estado_nuevo`) |
| `comentarios_ot` | `comentariosOtService.ts` | `PanelComentarios` | Chat libre de la OT (`user_name`, `texto`) |

No es un defecto —los esquemas son distintos y cada uno cumple su función—, pero los nombres son anagramas uno del otro y ambos servicios exportan una función llamada `crearComentario`. Es una trampa garantizada para el próximo cambio. Nota operativa: `comentarios_ot` está en la publicación de realtime (y `PanelComentarios` se suscribe ✅); `ot_comentarios` no lo está, y `HistorialComentarios` refresca por `refreshTrigger` ✅ — o sea que la elección es correcta en ambos casos, aunque no esté documentada.

---

# 3 · Verificaciones que salieron limpias

### Columnas inexistentes → **0**
Se cotejó cada columna nombrada en el código contra `list_tables verbose`. Todas existen. Verificado en particular:
`ordenes.descripcion_observacion` ❌ no se usa (es de `fotos` ✅), `fotos.anotaciones` ✅, `fotos.descripcion_observacion` ✅, `ordenes.porcentaje_avance` ✅, `ordenes.fecha_fin_trabajos` ✅, `versiones.snapshot` ✅, `dashboard_configs.widgets` ✅, `proyecto_miembros.rol` ✅.

### NOT NULL sin valor → **0**
Columnas NOT NULL sin DEFAULT, contrastadas contra cada INSERT:

| Tabla | NOT NULL sin default | ¿El INSERT las manda? |
|---|---|---|
| `ordenes` | `proyecto_id, ot, ubicacion, rubro, responsable, prioridad, plano_ref_url` | ✅ las 7 (`ordenToRow`), incluso las dos versiones |
| `proyectos` | `nombre, plano_url` | ✅ ambas |
| `fotos` | `orden_id, proyecto_id, categoria, file_path, file_url, file_type` | ✅ las 6 |
| `versiones` | `proyecto_id, nombre, snapshot` | ✅ las 3 |
| `campos_definicion` | `proyecto_id, nombre, tipo` | ✅ las 3 |
| `comentarios_ot` | `orden_id, proyecto_id, user_id, user_name, texto` | ✅ las 5 |
| `ot_comentarios` | `orden_id, proyecto_id, comentario` | ✅ las 3 |
| `dashboard_configs` | `user_id` | ✅ |

También se verificaron los CHECK: `estado`, `prioridad`, `nivel_riesgo`, `categoria`, `file_type`, `acta_conformidad`, `informe_*` — los valores que el código emite están todos dentro de los `ARRAY[...]` permitidos. `porcentaje_avance` está acotado 0-100 y `PanelOT` no permite salirse.

### Tablas inexistentes → **0** · Buckets inexistentes → **0**
Las 9 tablas que el código consulta existen. Los 2 buckets que usa existen y son públicos.

### Rutas de import de Supabase → **22/22 correctas**
Los 22 archivos que importan el cliente usan la ruta relativa correcta: `'../db/supabase'` desde `services/`, `stores/`, `hooks/`, `sync/` y `'../../db/supabase'` desde `components/`. **Cero** ocurrencias de `'src/lib/supabase'` o cualquier otra variante.

<details>
<summary>Listado completo</summary>

```
hooks/useRealtimeOrdenes.ts:2        ../db/supabase      ✅
stores/proyectosStore.ts:3           ../db/supabase      ✅
stores/ordenesStore.ts:4             ../db/supabase      ✅
stores/authStore.ts:2                ../db/supabase      ✅
sync/SyncManager.ts:3                ../db/supabase      ✅
services/comentariosService.ts:1     ../db/supabase      ✅
services/comentariosOtService.ts:1   ../db/supabase      ✅
services/dashboardConfigService.ts:2 ../db/supabase      ✅
services/camposService.ts:1          ../db/supabase      ✅
services/editorFotoService.ts:5      ../db/supabase      ✅
services/informeService.ts:3         ../db/supabase      ✅
services/versionesService.ts:1       ../db/supabase      ✅
services/fotosService.ts:2           ../db/supabase      ✅
services/statsService.ts:1           ../db/supabase      ✅
components/dashboard/Dashboard.tsx:3     ../../db/supabase  ✅
components/views/Configuracion.tsx:14    ../../db/supabase  ✅
components/ui/Notificaciones.tsx:2       ../../db/supabase  ✅
components/plano/CampoVideo.tsx:8        ../../db/supabase  ✅
components/plano/EditorFoto.tsx:14       ../../db/supabase  ✅
components/plano/ComparadorVersiones.tsx:3 ../../db/supabase ✅
components/plano/PanelComentarios.tsx:2  ../../db/supabase  ✅
components/plano/PanelOT.tsx:5           ../../db/supabase  ✅
```
</details>

---

# 4 · Objetos que existen en la DB y el código nunca consulta

| Objeto | Tipo | Filas | Situación |
|---|---|---|---|
| `sync_log` | tabla | 0 | Tiene CHECK para 8 acciones (`CREATE_OT`…`REPLACE_PLANO`) y políticas INSERT+SELECT. **`SyncManager.ts` no la escribe nunca**, pese al nombre. Está vacía desde siempre: no hay trazabilidad de sincronización. |
| `ordenes_eliminadas` | tabla | 3 | Se llena **solo** por el trigger `trigger_audit_orden_eliminada` → `fn_audit_orden_eliminada()` (SECURITY DEFINER). Tiene política SELECT para supervisores, pero **ninguna pantalla la lee**: la papelera de OTs borradas existe en la DB y no en la UI. |
| `vista_proyectos_resumen` | vista | — | Nunca consultada. Marcada como ERROR por el linter (SECURITY DEFINER). |
| `vista_ordenes_fotos` | vista | — | Nunca consultada. Ídem. |
| bucket `exports` | storage | — | Nunca usado. `otprojService` arma el ZIP en el cliente. |
| `es_miembro()` / `es_supervisor()` | funciones | — | Solo se usan dentro de políticas RLS. Correcto — pero ver el aviso de seguridad abajo. |

Todas las tablas que el código sí consulta existen (9/9). No hay referencias a tablas fantasma.

---

# 5 · Estado de RLS por tabla

**Las 11 tablas del schema `public` tienen RLS habilitado y al menos una política.** Ninguna queda deshabilitada ni sin políticas.

| Tabla | RLS | Políticas | Comandos cubiertos | Observación |
|---|---|---|---|---|
| `proyectos` | ✅ | 4 | SELECT · INSERT · UPDATE · DELETE | Completa |
| `ordenes` | ✅ | 5 | SELECT · INSERT · UPDATE · DELETE ×2 | DELETE duplicado (`es_supervisor()` y su equivalente inline) |
| `fotos` | ✅ | 7 | SELECT ×2 · INSERT ×2 · UPDATE · DELETE ×2 | **Ver aviso D-7 abajo** |
| `versiones` | ✅ | 6 | SELECT ×2 · INSERT ×2 · UPDATE · DELETE | Pares duplicados con condiciones distintas |
| `campos_definicion` | ✅ | 2 | SELECT · ALL | ALL = gestión solo supervisor |
| `proyecto_miembros` | ✅ | 2 | SELECT · ALL | ALL = gestión solo supervisor |
| `comentarios_ot` | ✅ | 3 | SELECT · INSERT · DELETE | Sin UPDATE — el código tampoco actualiza |
| `ot_comentarios` | ✅ | 2 | SELECT · INSERT | Sin UPDATE/DELETE — el código tampoco los usa |
| `dashboard_configs` | ✅ | 1 | ALL (`users_own_config`) | Completa |
| `sync_log` | ✅ | 2 | SELECT · INSERT | Tabla sin uso |
| `ordenes_eliminadas` | ✅ | 1 | **SELECT únicamente** | Correcto por diseño: el INSERT lo hace un trigger SECURITY DEFINER, que no pasa por RLS |

## 🟠 Aviso de seguridad — `fotos` tiene políticas que anulan el control por proyecto

Las políticas permisivas se combinan con **OR**, así que la más laxa gana. En `fotos` conviven dos juegos:

```sql
-- Juego "por proyecto" (correcto)
SELECT  USING  es_miembro(proyecto_id)
INSERT  CHECK  EXISTS (proyecto_miembros … rol IN ('supervisor','tecnico'))
DELETE  USING  es_supervisor(proyecto_id) OR uploaded_by = auth.uid()

-- Juego "authenticated" (lo anula)
SELECT  USING  true          ← rol authenticated
INSERT  CHECK  true          ← rol authenticated
DELETE  USING  true          ← rol authenticated
```

**Consecuencia real:** cualquier usuario autenticado —de cualquier proyecto— puede leer, insertar y **borrar** cualquier fila de `fotos`, incluidas las de proyectos a los que no pertenece. El control por membresía de proyecto está efectivamente desactivado para esa tabla. El linter de Supabase lo confirma con dos WARN de tipo `rls_policy_always_true`. Corresponde eliminar las tres políticas `Authenticated users can …` y quedarse con el juego por proyecto.

## Resto de avisos del linter de seguridad

- **ERROR ×2** — `vista_proyectos_resumen` y `vista_ordenes_fotos` son vistas `SECURITY DEFINER`: se ejecutan con los permisos de quien las creó, saltando el RLS del consultante. Ninguna se usa desde el código, así que la exposición es vía API REST directa.
- **WARN ×5** — `search_path` mutable en `set_updated_at`, `es_miembro`, `es_supervisor`, `agregar_creador_como_supervisor`, `fn_audit_orden_eliminada`. Las tres últimas son SECURITY DEFINER, donde el `search_path` mutable es el vector clásico de escalada.
- **WARN ×7** — las 4 funciones SECURITY DEFINER son ejecutables vía `/rest/v1/rpc/…` por los roles `anon` y `authenticated`. `agregar_creador_como_supervisor()` es la más sensible del grupo.
- **WARN** — protección de contraseñas filtradas (HaveIBeenPwned) desactivada en Auth.

## Dato que cierra el hallazgo B-8 del informe 02

El trigger `trg_proyecto_creado` (AFTER INSERT en `proyectos`) ejecuta `agregar_creador_como_supervisor()`, que inserta al creador en `proyecto_miembros` con `rol='supervisor'`. Verificado contra la DB: **los 4 proyectos activos tienen exactamente 1 supervisor cada uno** y hay 13 filas en `proyecto_miembros` para 13 proyectos — cobertura completa.

Por lo tanto el botón **"Borrar"** de `PanelOT` (que depende de `proyecto_miembros.rol === 'supervisor'`) **sí va a aparecer** para la cuenta que creó los proyectos. El riesgo condicional que quedó abierto en `02_FUNCIONALIDAD_INCOMPLETA.md` (B-8) queda descartado para esta demo. Sigue siendo cierto que el `.then()` de `PanelOT.tsx:202` ignora el `error` — si algún día se abre un proyecto ajeno, el botón desaparecerá sin explicación.
