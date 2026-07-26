# AUDITORÍA S37 — Plan-OTs

> **Fase:** S37-DIAG · **Modo:** 100% solo-lectura (este archivo es la única escritura) · **Fecha:** 2026-06-12
> **Stack real:** React **19.2** (no 18) + Vite 8 + TypeScript + Zustand 5 + Dexie 4 + Supabase JS 2.105 · PWA (vite-plugin-pwa / Workbox)
> **Sin commit.** Ningún archivo fuente fue modificado. Archivos protegidos (`ordenesStore.ts`, `fotosService.ts`, `reportService.ts`, `SyncManager.ts`, `plano3d/*`) sólo se leyeron, nunca se proponen reescrituras.

## PASO 0 — Baseline

| Check | Resultado |
|---|---|
| `git log -5` | `44ad59e` S36-E es el HEAD; árbol limpio. |
| `tsc -p tsconfig.app.json --noEmit` | **Exit 0 — sin errores** (ni siquiera los 2 TS6133 esperados aparecen; ya resueltos). |
| `git log --all -- .env*` | Sólo `.env.example` (vacío, blob `e69de29`) entró al historial. **Ningún secreto commiteado jamás.** |
| `npm outdated` | 12 paquetes con updates menores; sólo `pdfjs-dist` tiene un salto mayor pendiente (3.x→6.x). |
| `npm audit` | **3 vulnerabilidades HIGH** (ver §3). |
| `vite build --mode production` | **FALLA** en el paso PWA (ver 🔴-1). Bundle único de 2.17 MB. |

Inventario: **77 archivos** `.ts/.tsx` en `src/`. **9 tablas** Supabase tocadas por el cliente (CLAUDE.md sólo documenta 4). **2 buckets** Storage.

---

## 1. ✅ Base sólida — NO tocar

| Área | Por qué está bien |
|---|---|
| **Gestión de secretos** | `src/db/supabase.ts` lee `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` de env y lanza si faltan. **No hay `service_role` en ningún lado del cliente** (grep limpio). La anon key es correcta por diseño. `.env.local` está fuera de git (`*.local` en `.gitignore`). |
| **Write-path de OTs** (`ordenesStore.ts`, protegido) | El camino optimista Zustand → Dexie (`_synced:false`) → Supabase → `syncQueue` **nunca traga errores**: toda falla se encola. Es el patrón de manejo de errores más sólido del repo. No tocar. |
| **Auto-escape de React** | El UI renderiza todo el free-text (`descripcion`, `comentarios`, `campos`) por nodos de texto JSX. **Cero `dangerouslySetInnerHTML`, cero `eval`, cero `innerHTML`** en `src/`. El UI interactivo es seguro contra XSS. |
| **Auth** | Supabase Auth puro (`authStore.ts`): `signInWithPassword`, `onAuthStateChange`, `getSession`, `signOut`. `App.tsx` cierra toda la app sobre `user`. Tokens manejados por el SDK. |
| **Tipado** | `tsc` pasa limpio con `noUnusedLocals`/`noUnusedParameters`. `verbatimModuleSyntax` + `import type` respetados. |
| **Separación service/componente** | `editorFotoService` (persistencia) vs `EditorFoto` (canvas) es un split correcto, no duplicación. Igual `informeService`/`reportService` son motores distintos por diseño. |
| **PWA runtime caching** | La estrategia `CacheFirst` para Storage + `NetworkFirst` (5 s) para REST está bien pensada (`vite.config.ts:17-52`). El **diseño** es correcto; el problema es de tamaño de bundle (§🔴-1), no de estrategia. |

---

## 2. ⚠️ Problemas menores

### ⚠️-1 · Código muerto y archivos basura
- **Severidad:** baja · **Archivos:**
  - `src/components/dashboard/Dashboard.tsx` — **muerto**, cero importadores (el vivo es `components/views/Dashboard.tsx`, importado en `App.tsx:13`). Ojo: su hermano `ModalConfigWidgets.tsx` SÍ se usa.
  - `src/constants/rubros.ts` (`export const RUBROS`) — **muerto**; `PanelOT.tsx:57` define su propio `RUBROS_LISTA` local.
  - **16 archivos `.bak`/`.bak2..bak9`** en `src/` (incl. `PanelOT.tsx.bak`…`.bak9`, `VistaPlano.tsx.bak`, `reportService.ts.bak7`) + basura raíz: `ordenesstore_backup.txt`, `panelresumen_backup.txt`, ~8 `patch_*.py`.
- **Fix propuesto (sin ejecutar):** borrar los archivos muertos en un sprint de limpieza dedicado. No los compila ni tsc ni vite, pero contaminan cada grep y confunden el árbol.

### ⚠️-2 · Dos sistemas de comentarios paralelos sobre tablas casi homónimas
- **Severidad:** media · **Archivos:** `services/comentariosService.ts` (tabla **`ot_comentarios`** — comentarios de transición de estado) vs `services/comentariosOtService.ts` (tabla **`comentarios_ot`** — comentarios libres). Ambos renderizan dentro de `PanelOT.tsx` (`:830`, `:852`).
- **Riesgo:** mantenimiento/confusión altísima; un futuro RLS tendría que duplicar políticas. **Limpiar antes de cualquier reescritura RLS / migración a SaaS.**
- **Fix propuesto:** consolidar en una sola tabla/servicio con un campo `tipo` (`transicion` | `libre`). No implementar ahora.

### ⚠️-3 · Mapper `rowToOrden` triplicado con divergencia latente
- **Severidad:** media · **Archivos:** `ordenesStore.rowToOrden` (`:10`, exportado · protegido), `useRealtimeOrdenes.mapRowToOrdenLocal` (`:6`, copia privada que NO reusa la del store), `SyncManager.ordenToRow` (protegido).
- **Bug latente:** `SyncManager.ts:23` mapea `comentarios: o.descripcion`, mientras `ordenesStore.ts:66` mapea `comentarios: o.comentarios`. Un CREATE encolado offline escribiría un valor distinto al CREATE online.
- **Fix propuesto:** que `useRealtimeOrdenes` importe el mapper exportado del store (cambio fuera de los archivos protegidos). El desalineo de `comentarios` en SyncManager se reporta para revisión humana (archivo protegido — no se propone reescritura).

### ⚠️-4 · Color de estado triplicado y divergente
- **Severidad:** baja · **Archivos:** `constants/estados.ts` `ESTADO_COLOR`, `utils/calculos.ts` `COLOR_ESTADO`, y el muerto `dashboard/Dashboard.tsx` `ESTADO_CFG` — tres paletas hex distintas para los mismos 4 estados (p.ej. "En proceso" = `#3B82F6` en calculos vs `#2462C9` en dashboard).
- **Fix propuesto:** una sola fuente en `constants/estados.ts`; los demás re-exportan.

### ⚠️-5 · `console.log` de debug en producción (archivo protegido)
- **Severidad:** baja · **Archivo:** `ordenesStore.ts:477-480` `console.log('[DEBUG actualizarOrden] …')` corre en cada update de OT.
- **Fix propuesto:** quitar las líneas de debug. **Sólo se reporta** (archivo protegido); cambio mínimo de una línea para revisión humana.

### ⚠️-6 · Promesas que fallan en silencio (pérdida de datos potencial)
- **Severidad:** media · **Archivos (peor primero):**
  - `PanelOT.tsx:343` — `await crearComentario(...)` ignora el retorno; `comentariosService.crearComentario` (`:81`) devuelve `null` y sólo hace `console.error`. Si una foto cambia el estado, el comentario de transición puede no persistir mientras el estado sí cambia → estado sin rastro del porqué.
  - `PanelComentarios.tsx:52` (`cargar()`) y `:82` (`handleEliminar`) — `catch { /* silencioso */ }`: un fallo de carga se ve igual que "sin comentarios"; un delete fallido no avisa.
  - `useAccionesProyecto.tsx:73` — `construirFotosMap` cae a arrays vacíos en cualquier error → fotos desaparecen de exports/informes sin señal.
  - `informeService.ts:133` — `catch { /* fotos omitidas */ }` descarta TODAS las fotos del informe ante cualquier error (no sólo offline).
- **Fix propuesto:** chequear el `null`/`false` de retorno y mostrar toast de error; distinguir "vacío" de "falló". Sin tocar el write-path de `ordenesStore` (que ya está bien).

### ⚠️-7 · Dependencias desactualizadas (no vulnerables)
- **Severidad:** baja · 12 paquetes con updates menores (`@supabase/supabase-js` 2.105→2.108, `zustand`, `vite`, `react` 19.2.6→19.2.7, etc.).
- **Fix propuesto:** `npm update` (sin `-force`) para los minor; **`pdfjs-dist` se trata aparte en §🔴-2** por ser breaking + vuln.

### ⚠️-8 · `import()` dinámico inefectivo
- **Severidad:** baja · **Archivos:** `proyectosStore.ts` es importado dinámicamente por `ordenesStore.ts:173` pero también estáticamente por 5+ componentes → el dynamic import no separa chunk. Igual `pdfjs-dist` (dinámico en `ComparadorVersiones.tsx`, estático en `VistaPlano`/`pdfThumbnailService`).
- **Fix propuesto:** decidir una sola forma de import por módulo; relevante para el code-splitting de §🔴-1.

---

## 3. 🔴 Críticos (seguridad / bugs que rompen funcionalidad)

### 🔴-1 · `npm run build` FALLA en producción — bundle monolítico de 2.17 MB
- **Severidad:** CRÍTICA (rompe deploy + offline-first) · **Archivos:** `vite.config.ts` + ausencia de code-splitting.
- **Evidencia (verificada en esta auditoría):** `vite build --mode production` genera `dist/assets/index-*.js` de **2,168.97 kB** (gzip 571.88 kB) en **un solo chunk**, y luego **aborta con `PLUGIN_ERROR` (`vite-plugin-pwa`)**: el bundle supera el límite Workbox de 2 MiB (`maximumFileSizeToCacheInBytes`), por lo que **no se precachea el app-shell** → el modo offline real está roto para el JS principal. Todo (three.js de plano3d, pdfjs, @ffmpeg, jszip) viaja en un chunk.
- **Fix propuesto (sin ejecutar):**
  1. Code-splitting con `import()` perezoso de los módulos pesados que no se usan al arranque: **plano3d (three.js)**, **@ffmpeg** (`CampoVideo`), **pdfjs**, **jszip** (`otprojService`). Esto baja el chunk inicial por debajo de 2 MiB y arregla el precache.
  2. Como mitigación inmediata mientras se hace el split: subir `workbox.maximumFileSizeToCacheInBytes` en `vite.config.ts` para que el build no aborte (no resuelve el peso, sólo desbloquea el deploy).
  - *Nota:* `plano3d/*` está protegido — el split se haría a nivel de su punto de carga (`App.tsx`, vista `'3d-test'`), no reescribiendo los componentes 3D.

### 🔴-2 · `pdfjs-dist@3.11.174` — RCE/XSS al abrir un PDF malicioso (GHSA-wgrm-67xf-hhpq)
- **Severidad:** CRÍTICA · **Archivos:** `package.json` (`"pdfjs-dist": "^3.11.174"`); consumido por `VistaPlano.tsx`, `pdfThumbnailService.ts`, `ComparadorVersiones.tsx`.
- **Evidencia:** `npm audit` → HIGH, "arbitrary JavaScript execution upon opening a malicious PDF". La app **abre planos PDF subidos por usuarios** → superficie real.
- **Fix propuesto:** actualizar a `pdfjs-dist@4.2+` (idealmente la 6.x). **Es breaking** (API del worker, `GlobalWorkerOptions.workerSrc` apunta a CDN `cdnjs` 3.x en el código) → sprint propio con regresión de PDF (render, thumbnails, comparador). No ejecutar `npm audit fix --force` a ciegas.

### 🔴-3 · XSS almacenado en `generarInformeCierre` (5 interpolaciones sin escapar)
- **Severidad:** CRÍTICA (XSS) · **Archivo:** `src/services/reportService.ts` (**protegido — sólo se reporta, no se reescribe**).
- **Evidencia (verificada línea por línea en esta auditoría):** el archivo TIENE su helper `escapeHtml` (`:785`, usado 21 veces) pero en `generarInformeCierre` se interpola **crudo**:
  - `:1332` `${proyectoNombre}` · `:1334` `${orden.ubicacion}` · `:1336` `${orden.responsable}` · `:1341` `${orden.rubro}` · `:1362` `${observaciones}`
  - El HTML se inyecta vía `ventana.document.write(html)` (`:164`). Un `responsable`/`rubro`/`ubicacion`/`observaciones` con `<img src=x onerror=...>` ejecuta script en la ventana del informe al generar el Cierre de esa OT. El propio comentario del archivo (`:82-85`) marca el escape como "CRÍTICO".
  - Menor en la misma familia: `:141` y `:851` `<img src="${f.url}">` — URL sin encodear como atributo.
- **Fix propuesto (para revisión humana, sin tocar el protegido):** envolver esas 5 interpolaciones en `escapeHtml(...)` (igual que ya hace el resto del archivo) y codificar `f.url` como atributo. Es un cambio quirúrgico, consistente con el estilo existente.

### 🔴-4 · API key de Anthropic expuesta al navegador
- **Severidad:** CRÍTICA si hay key real en prod · **Archivo:** `src/services/iaService.ts:38-54`.
- **Evidencia:** `const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY` (**no hay key hardcodeada**; guard `length < 20`). Pero llama `fetch('https://api.anthropic.com/v1/messages')` **directo desde el browser** con header `x-api-key` + `anthropic-dangerous-direct-browser-access: 'true'`. Toda var `VITE_` se **inlinea en el bundle** y se sirve a cada usuario → si en producción se setea una key real, es extraíble del JS/Network tab → abuso facturable.
- **Fix propuesto:** mover la llamada a una **Supabase Edge Function** (proxy server-side) y eliminar la exposición `VITE_`. Hasta entonces, **no poner una key real** en el build de producción.

### 🔴-5 · Autorización sólo en el cliente — depende 100% de RLS no auditable aquí
- **Severidad:** ALTA · **Archivos:** `PanelOT.tsx:191-205` + `:838-842`; `useAccionesProyecto.tsx:441-449`; `Configuracion.tsx:113-141`.
- **Evidencia:** "borrar sólo supervisores" se resuelve **renderizando condicionalmente el botón** (`esSupervisor ? <button> : null`). Un no-supervisor puede llamar `eliminarOrden` desde la consola; lo único que lo frena es la **política RLS DELETE en `ordenes`**, que esta auditoría no puede ver. Además `Configuracion.tsx:113` permite **auto-asignarse el `rol`** vía `supabase.auth.updateUser({ data: { rol } })` (metadata) → si alguna decisión de auth confía en `user.user_metadata.rol`, es auto-escalable.
- **Fix propuesto:** (a) confirmar que TODA restricción real vive en RLS (§5 checklist); (b) la fuente de verdad del rol debe ser `proyecto_miembros.rol` server-side, **nunca** la metadata de auth. Sin cambios de código hasta verificar las políticas.

### 🔴-6 · Buckets Storage públicos — sin signed URLs (riesgo cross-proyecto)
- **Severidad:** ALTA · **Archivos:** `fotosService.ts:41`, `proyectosStore.ts:99`, `CampoVideo.tsx:113`, `editorFotoService.ts:87`.
- **Evidencia:** **0 usos de `createSignedUrl`** en todo el repo; todo es `getPublicUrl`. Paths deterministas (`${ordenId}/${categoria}/${timestamp}.${ext}` para fotos; `${user.id}/${Date.now()}.${ext}` para planos). Una URL pública no tiene chequeo de auth al servirse: quien obtenga la URL (están en `fotos.file_url`, en exports `.otproj`, en informes impresos) lee el byte sin importar membresía. RLS sobre las **filas** NO protege los **bytes** si el bucket es público.
- **Fix propuesto:** poner `fotos` y `planos` como **privados** y migrar a `createSignedUrl` con TTL corto. Es trabajo de servicio + Supabase; dimensionarlo como sprint (afecta `fotosService` —protegido— en su capa de URL, así que requiere diseño cuidadoso, no reescritura directa).

---

## 4. 🏢 Brecha SaaS multi-tenant (por ORGANIZACIÓN)

### Estado actual (verificado en código)
- **El límite de tenant hoy es el USUARIO** (`auth.uid()` + RLS), con una capa **per-proyecto casi 100% stub** encima.
- **No existe NINGÚN concepto de organización** en el código: ni tabla, ni columna, ni store, ni tipo, ni UI mencionan `organizaciones`/`tenant`/`empresa-como-tenant`. Los hits de "empresa" son cosméticos (logos de informe).
- `proyecto_miembros` se **lee en un solo lugar** (`PanelOT.tsx:196-204`): columnas conocidas `proyecto_id`, `user_id`, `rol` (valor `'supervisor'`). Gobierna un único branch de UI.
- La UI de "Miembros" en `Configuracion.tsx:64-101` está **hardcodeada** a un solo usuario sintético; invitar es un `setTimeout(800)` + toast "en desarrollo" (S21 nunca se terminó).
- **3 vocabularios de rol divergentes** y ninguno enforced en cliente: metadata `creador|editor|comentarista|lector` · UI `Creador|Editor|...` · el real `'supervisor'` en `proyecto_miembros`.
- `proyectos` se posee por `created_by` (`proyectosStore.ts:108,154`); la lista **no filtra por owner** (`:41-45` sólo `.is('deleted_at',null)`) — confía en RLS.
- **Billing: inexistente.** `Configuracion.tsx:360-383` es una tarjeta "Suscripción y Pago" cuyo único acto es un toast "próximamente". Cero Stripe/plan/seat.

### Lo que falta para tenancy por organización
- **Tablas nuevas:** `organizaciones`, `organizacion_miembros (org_id,user_id,rol)`, `invitaciones`, `suscripciones`.
- **FK/columnas:** `proyectos.organizacion_id` (NOT NULL) + backfill de filas existentes; `created_by` pasa a "autor dentro de la org". Denormalizar `organizacion_id` en hijos (`ordenes`,`fotos`,`versiones`,`campos_definicion`,comentarios) o RLS por join.
- **RLS:** reescribir políticas de las **9 tablas + 2 buckets** de "usuario/proyecto" a "usuario ∈ organizacion_miembros". Paths de Storage `${user.id}/...` → `${org.id}/...`.
- **UI:** reconstruir `Configuracion.tsx` (miembros reales + invitaciones), nuevo `organizacionStore` + selector de org activa, pantalla "crear organización" de primer uso (hoy `App.tsx` va user → SelectorProyectos directo).
- **Billing:** stack completo nuevo (proveedor, webhooks, límites de seats).

### Plan dimensionado en sprints (estimación, NO implementación)

| Sprint | Alcance (una línea) | Riesgo |
|---|---|---|
| **S1 — Schema & RLS base** | Crear `organizaciones`/`organizacion_miembros`/`invitaciones`; `proyectos.organizacion_id`; backfill a una org default. | Migración de datos vivos. |
| **S2 — RLS + Storage** | Reescribir RLS de 9 tablas + 2 buckets a scope-org; migrar convención de paths de Storage a `${org.id}/`. | Alto (fuga cross-org si falla una política). |
| **S3 — Contexto org en cliente** | `organizacionStore` + selector de org; threading de `organizacion_id` en `crearProyecto`/`duplicarProyecto`; pantalla "crear org" en el state-machine de `App.tsx`; unificar los 3 vocabularios de rol. | Medio. |
| **S4 — Miembros & invitaciones** | Reconstruir `Configuracion.tsx` (miembros reales `JOIN auth.users`); invitar real + aceptar invitación; re-apuntar checks de rol (`PanelOT`, `useAccionesProyecto`) a roles de org. | Medio. |
| **S5 — Billing & seats** | `suscripciones` por org; integración de pago + webhooks; límites de plan/asientos; reemplazar la tarjeta stub. | Alto (integración externa). |
| **S6 — Hardening** | Tests de fuga cross-org; scoping por org de la caché Dexie (hoy sin dimensión org) y del canal realtime (`useRealtimeOrdenes` filtra sólo por `proyecto_id`); alinear audit-log `ordenes_eliminadas`. | Medio. |

> **Caveat para el arquitecto:** toda la autorización vive en RLS server-side que **no está en este repo** (cero `.sql`, cero `.rpc()`). El estimado de cliente **subestima** el trabajo real porque no ve la capa de enforcement. Antes de S1, auditar las políticas reales en Supabase. Además: limpiar las 2 tablas de comentarios homónimas (⚠️-2) **antes** de la reescritura RLS para no duplicar políticas.

---

## 5. 📋 Verificaciones manuales en el dashboard de Supabase (instancia `plan-ots-2`)

> El cliente toca **9 tablas + 2 buckets** y confía 100% en RLS para todo. Inge debe verificar manualmente cada punto:

**RLS por tabla (confirmar que RLS está ENABLED y las políticas son correctas):**
1. `proyectos` — SELECT/INSERT/UPDATE/DELETE: ¿un usuario sólo ve/edita proyectos donde es miembro? ¿DELETE = soft-delete permitido sólo a owner/supervisor?
2. `ordenes` — **CRÍTICO**: ¿la política **DELETE** exige rol supervisor? (el cliente NO lo enforça — §🔴-5). ¿INSERT/UPDATE limitados a miembros del proyecto?
3. `proyecto_miembros` — ¿quién puede insertar/cambiar `rol`? Debe ser sólo owner/supervisor de ese proyecto, no el propio usuario.
4. `campos_definicion` — ¿scoped por proyecto del que el usuario es miembro?
5. `fotos` — ¿INSERT/DELETE sólo en OTs de proyectos accesibles?
6. `versiones` — ¿DELETE exige supervisor? (la UI infiere el rol del error — `useAccionesProyecto.tsx:447`).
7. `ot_comentarios` y `comentarios_ot` (**dos tablas distintas**) — verificar RLS en AMBAS.
8. `dashboard_configs` — ¿scoped por `user_id`?
9. `ordenes_eliminadas` (audit log, server-only) — ¿INSERT por trigger, lectura restringida?

**Storage:**
10. Bucket `fotos` — ¿es **público**? Si sí, los bytes son accesibles por URL sin auth (§🔴-6). Evaluar pasar a privado + signed URLs.
11. Bucket `planos` — ídem; paths `${user.id}/...` son adivinables.

**Auth / roles:**
12. Confirmar que **ninguna** política RLS ni función confía en `auth.users.user_metadata.rol` (auto-asignable por el usuario — §🔴-5). La verdad del rol debe ser `proyecto_miembros.rol`.
13. Confirmar la existencia del trigger/política que implementa el audit `ordenes_eliminadas` mencionado en el commit S36-A.

**Edge Functions / proveedor IA:**
14. Verificar que **NO** haya una `VITE_ANTHROPIC_API_KEY` real en las env vars del build de producción (§🔴-4). Planificar Edge Function proxy.

---

### Resumen de severidad

| # | Hallazgo | Severidad | Archivo principal |
|---|---|---|---|
| 🔴-1 | Build de prod falla + bundle 2.17 MB sin split | **Crítica** | `vite.config.ts` |
| 🔴-2 | `pdfjs-dist` 3.x — RCE al abrir PDF | **Crítica** | `package.json` |
| 🔴-3 | XSS en `generarInformeCierre` (5 interpolaciones) | **Crítica** | `reportService.ts` *(protegido)* |
| 🔴-4 | Anthropic API key expuesta al browser | **Crítica** | `iaService.ts` |
| 🔴-5 | Autorización sólo client-side | **Alta** | `PanelOT.tsx`, `Configuracion.tsx` |
| 🔴-6 | Buckets públicos sin signed URLs | **Alta** | `fotosService.ts`, `proyectosStore.ts` |
| ⚠️-2 | Dos sistemas de comentarios homónimos | Media | `comentarios*Service.ts` |
| ⚠️-3 | `rowToOrden` triplicado + divergencia | Media | `useRealtimeOrdenes.ts`, `SyncManager.ts` |
| ⚠️-6 | Promesas que fallan en silencio | Media | `PanelOT.tsx:343`, `PanelComentarios.tsx` |
| ⚠️-1/4/5/7/8 | Código muerto, colores, debug log, deps, imports | Baja | varios |

**Sin commit. Sólo se creó este archivo. Listo para revisión de Inge.**
