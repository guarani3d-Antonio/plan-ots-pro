# 00 — INFORME EJECUTIVO: ¿Plan-OTs está listo para la demo?

**Fecha:** 2026-07-26 · **HEAD auditado:** `e4897e8` (rama `master`, sin remoto configurado)
**Fuentes:** `01_BASELINE.md` · `02_FUNCIONALIDAD_INCOMPLETA.md` · `03_CAPA_DATOS.md` · `04_FLUJOS_DEMO.md`

---

# 1 · Veredicto

> **NO para una demo abierta donde el cliente maneje la app. SÍ para una demo guiada por guion, después de ~1 h 40 min de trabajo — el núcleo del producto (plano → OT → fotos → estados → informes) funciona de verdad, pero está rodeado de botones muertos y pantallas a medias que revientan apenas alguien se sale del camino.**

Dicho sin vueltas: **el producto está mejor de lo que sugiere el ruido que lo rodea.** 6 de los 8 flujos de la demo funcionan completos de punta a punta, contra base real, con 32 OTs y 106 fotos cargadas. Ninguna columna del código falta en la base, ningún import está roto, no hay errores de TypeScript, las 11 tablas tienen RLS habilitado.

Y ahora la parte incómoda:

- **El build de producción no compila.** No existe hoy un artefacto desplegable. La demo tiene que correr sobre `npm run dev`.
- **La primera pantalla que ve el cliente tiene dos fallas de feedback**: contraseña mal escrita = silencio absoluto, y un botón de Google que no hace nada.
- **El menú de acciones de la grilla es una trampa**: "Eliminar" y "Generar informe" son `console.log`, y "Editar" abre una ficha de solo lectura.
- **Toda la pantalla de Configuración es una maqueta**: tarjeta de crédito deshabilitada, invitaciones falsas con toast de éxito, y un panel de roles que dice "afectará inmediatamente los permisos" y no afecta nada.
- **La campanita de notificaciones no puede mostrar una sola notificación**, nunca, por un desajuste entre el código y la configuración de replicación de Postgres.
- **El modo offline corrompe datos.** No es opinable: `SyncManager` guarda la descripción de la OT dentro de la columna de comentarios y descarta 25 columnas. Si alguien pide ver la capacidad offline-first, es la peor decisión posible.

Nada de eso es irreparable, y casi todo se arregla ocultando en vez de programando. Pero hoy, sin tocar nada, una demo en la que el cliente tome el mouse termina mal.

---

# 2 · BLOQUEANTES

Criterio: **el cliente lo va a tocar o lo va a ver, y no funciona.** Ordenados por relación impacto/esfuerzo.

| # | Qué | Archivo(s) | Min | ¿PROHIBIDO / SENSIBLE? |
|---|---|---|---:|---|
| **B-1** | Login: contraseña incorrecta no muestra ningún error (el store guarda el error, el form espera una excepción que nunca llega). Además `signUp` muestra el toast "Cuenta creada" de forma incondicional | `src/components/ui/AuthForm.tsx:33-45, 105` · `src/stores/authStore.ts:31-43` | **20** | ✅ Libres |
| **B-2** | Botón "🔵 Continuar con Google" no hace nada (`console.log('google-login')`) — primera pantalla de la demo | `src/components/ui/AuthForm.tsx:48-51, 163-169` | **5** | ✅ Libre |
| **B-3** | Grilla → menú `···` → "🗑 Eliminar" y "📄 Generar informe" son `console.log` | `src/components/grilla/VistaGrilla.tsx:711-712` | **10** (quitar del menú)<br>**45** (cablear de verdad) | ✅ Libre |
| **B-4** | Grilla → "✎ Editar" abre `ModalDetalleOT`, que es de solo lectura (cero inputs; nunca invoca `onGuardado`) | `src/components/grilla/VistaGrilla.tsx:709-710, 904` · `src/components/grilla/ModalDetalleOT.tsx:60, 216-217` | **5** (renombrar a "Ver ficha")<br>**90+** (edición real) | ✅ Libres |
| **B-5** | Plano → botón ⚙ de la toolbar: `console.log('config')`, entre dos botones que sí funcionan | `src/components/plano/VistaPlano.tsx:406-412` | **5** | ⚠️ **SENSIBLE** — copia `.bak` antes |
| **B-6** | Configuración: "Enviar Invitación" simula un `setTimeout(800)` y confirma envío que no ocurre; tabla de miembros hardcodeada a una fila; botón `···` sin handler; panel de Roles que promete permisos que no aplica | `src/components/views/Configuracion.tsx:64-101, 129-143, 351, 596-603` | **25** (ocultar las 2 cards)<br>**varios días** (implementar) | ✅ Libre |
| **B-7** | La campanita nunca emite una notificación: el código lee `payload.old.estado`, pero `ordenes` tiene `REPLICA IDENTITY DEFAULT`, así que `payload.old` solo trae la PK → el filtro descarta el 100 % de los eventos | `src/components/ui/Notificaciones.tsx:56-86, 135-140` + **DDL en Supabase** | **5** (DDL: `ALTER TABLE ordenes REPLICA IDENTITY FULL`)<br>**40** (fix por código) | ✅ Libre — pero **toca la base de producción** |
| **B-8** | `npm run build` falla: `vite-plugin-pwa` aborta porque el chunk principal pesa 2,17 MB (límite Workbox 2 MiB). No hay artefacto desplegable | `vite.config.ts:13-17` | **5** (subir `maximumFileSizeToCacheInBytes`)<br>**3-4 h** (code-splitting real) | ✅ Libre |

**Total mínimo para tapar los 8 (camino de ocultar, no de implementar): ~1 h 20 min.**
Si además se cablean de verdad las acciones de la grilla (B-3 completo): **~2 h**.

### Sobre archivos protegidos
De los 8 bloqueantes, **solo B-5 toca un archivo SENSIBLE** (`VistaPlano.tsx` — hay que dejar `.bak` antes de editar). **Ninguno toca un archivo PROHIBIDO.** Eso es una buena noticia: todo el plan de demo se ejecuta sin pedir autorización sobre `reportService.ts`, `ordenesStore.ts`, `SyncManager.ts`, `fotosService.ts` ni `plano3d/`.

---

# 3 · RIESGOS

Criterio: **funciona, pero puede fallar delante del cliente.** No requieren código; requieren preparación o guion.

| # | Riesgo | Dónde | Qué hacer antes |
|---|---|---|---|
| **R-1** | **Informes sin internet = informes sin estilo.** El HTML carga Tailwind y las fuentes por CDN, y los dos logos del encabezado desde `lh3.googleusercontent.com`. Nada de eso está en el `runtimeCaching` del service worker | `src/services/reportService.ts:893-895, 1151-1153, 1006-1013` 🔴 **PROHIBIDO** | Verificar conexión estable. Abrir un informe de prueba 10 min antes |
| **R-2** | **Pop-up bloqueado = falla muda.** Si `window.open` devuelve `null`, el código hace `return` sin avisar: apretás "PDF" y no pasa nada | `src/components/informes/ModalInformeOT.tsx:313-314` | Habilitar pop-ups para el dominio en el navegador de la demo |
| **R-3** | **No se puede guardar una OT nueva sin foto ANTES.** Toda OT nace "Pendiente", y ese estado exige ≥1 foto ANTES | `src/components/plano/PanelOT.tsx:389-390` · `src/utils/validaciones.ts:21` | Tener 2-3 fotos en el escritorio. Encadenar Flujo 3 → Flujo 4 en el guion |
| **R-4** | **El plano en imagen puede ser rechazado**: mínimo 200 KB y 1800×1200 px. Un screenshot o un JPG comprimido no pasa | `src/components/proyecto/ModalNuevoProyecto.tsx:19-21, 30-38` | Probar el archivo exacto. Preferir PDF (sin restricción de dimensión) |
| **R-5** | **PDF no renderiza sin internet**: el worker de pdf.js viene de `cdnjs.cloudflare.com` y está excluido del precache a propósito | `src/components/plano/VistaPlano.tsx:18-19` · `vite.config.ts:16` | Abrir el proyecto con plano PDF una vez antes de la demo para calentar la caché |
| **R-6** | **Gantt grafica 17 de 32 OTs.** Las 15 sin `fecha_inicio_trabajos` + `fecha_fin_trabajos` solo aparecen en el modal de "sin fechas" | Dato verificado en la base | Cargar fechas en unas cuantas OTs, o anticipar la pregunta en el guion |
| **R-7** | **KPIs flacos en Dashboard**: `costo` cargado en 6 de 32 OTs, `nivel_riesgo` en 9 de 32 | Dato verificado en la base | Completar esos campos en 5-6 OTs si el pitch pasa por ahí |
| **R-8** | **Dos dispositivos abiertos = campos que se vacían.** El mapper de Realtime construye 18 campos de 47; al llegar un cambio remoto, la copia local pierde obra, costo, fechas, avance e informes hasta recargar | `src/hooks/useRealtimeOrdenes.ts:6-30` | No abrir la app en dos pantallas a la vez. Si se muestra colaboración, recargar tras cada cambio |
| **R-9** | **La clave de Anthropic viaja al navegador.** Todo lo `VITE_` se inlinea en el bundle; `iaService` llama a `api.anthropic.com` desde el front | `src/services/iaService.ts:38` · `.env.local` | No es un riesgo de demo, es uno de facturación. Mover a Edge Function y **rotar la key** si la app ya estuvo desplegada |
| **R-10** | **`fotos` tiene RLS efectivamente desactivado**: tres políticas `USING (true)` para `authenticated` anulan el control por proyecto. Cualquier usuario logueado puede borrar fotos de proyectos ajenos | Políticas en Supabase (2 WARN del linter) | No afecta la demo. Sí es un hallazgo que conviene no mencionar y arreglar después |
| **R-11** | **El repositorio no tiene remoto.** `git remote -v` no devuelve nada: la única copia del código está en ese disco | `01_BASELINE.md`, punto 2 | Crear el remoto y pushear **antes** de tocar nada |

---

# 4 · Lo que hay que EVITAR mostrar

Lista corta para pegar al lado de la pantalla.

### 🚫 No abrir en absoluto

| Qué | Por qué |
|---|---|
| **Pantalla de Configuración completa** | Es la peor de la app: formulario de tarjeta deshabilitado con "Pagar ahora" muerto, "Administrar suscripción" y "Cambiar foto" que solo tiran un toast "próximamente", "Eliminar cuenta" que pide confirmación y después admite que no está implementado, tabla de miembros con una sola fila hardcodeada, invitaciones falsas y un panel de roles que miente sobre permisos |
| **Modo avión / offline** | `SyncManager` guarda la descripción dentro de la columna de comentarios y descarta 25 columnas al reconectar. Es el único lugar donde la app **corrompe datos de verdad** |
| **Menú `···` de cada fila de la grilla** | 2 de 4 acciones son `console.log`, la tercera no edita |
| **Campanita de notificaciones** | Nunca va a mostrar nada, por más que se generen cambios en vivo |

### ⚠️ Evitar tocar

| Qué | Por qué |
|---|---|
| **Calendario → pestañas "Semana" y "Día"** | El calendario entero se reemplaza por *"Vista semanal: próximamente"*. La vista **Mes** está completa: quedarse ahí |
| **Ayuda → módulo "🧊 Vista 3D"** | Badge "Próximamente" y dos pasos escritos en futuro. Los otros 6 módulos de la Ayuda están bien y son un buen material de demo |
| **Editor de fotos → botón "✂ Recortar"** | Deshabilitado, con "(próximamente)" en la etiqueta |
| **Botón "Continuar con Google"** | No hace nada (salvo que se aplique B-2 y se oculte) |

### 💬 Mostrar, pero con guion

| Qué | Cómo decirlo |
|---|---|
| **Contratistas** | El directorio funciona, pero vive en `localStorage`: no se sincroniza entre dispositivos y no hay forma de borrar una entrada. Cargar los contratistas de demostración **en el mismo navegador de la demo, con antelación** |
| **Gantt** | Anticipar que solo se grafican las OTs con fecha de inicio y fin, y mostrar el botón que lista las que no las tienen |
| **Crear OT** | Encadenarlo con la carga de fotos, que es la parte que mejor luce y además es obligatoria para poder guardar |

---

# 5 · Orden de ejecución recomendado

Criterio **un sprint = un riesgo**: cada sesión toca una sola área, se verifica sola con `npx tsc -p tsconfig.app.json --noEmit`, y se commitea antes de pasar a la siguiente. Si algo se rompe, el `git reset` afecta a un único tema.

## 🔴 Antes de tocar una sola línea

**S37-0 · Backup (10 min)** — el repo no tiene remoto. Crear el repositorio remoto, `git push -u origin master`. Hoy la única copia del trabajo de 36 sprints está en un disco.

---

## Sesión 1 — S38-A · "Ocultar lo incompleto" (45 min) · riesgo: **nulo**

Todo es quitar o deshabilitar UI. No se agrega lógica, no se toca la base, no se toca ningún archivo PROHIBIDO.

1. `AuthForm.tsx` — ocultar el botón de Google y su divisor **(B-2)**.
2. `VistaPlano.tsx` — **crear `.bak` primero** (SENSIBLE) y quitar el botón ⚙ **(B-5)**.
3. `VistaGrilla.tsx` — quitar "🗑 Eliminar" y "📄 Generar informe" del menú `···`; renombrar "✎ Editar" a "👁 Ver ficha" **(B-3 parcial, B-4 parcial)**.
4. `Configuracion.tsx` — ocultar la card "Suscripción y Pago" y la card ancha "Gestión de Miembros y Roles" **(B-6 parcial)**.
5. `Calendario.tsx` — ocultar los toggles "Semana" y "Día".
6. `PantallaAyuda.tsx` — quitar el módulo "Vista 3D" del array.

Verificar: `npx tsc -p tsconfig.app.json --noEmit` → 0 errores. Commit: `S38-A: ocultar features incompletas para demo`.

**Después de esta sola sesión la demo ya es defendible.** Si el tiempo es lo que falta, hacer solo esto.

---

## Sesión 2 — S38-B · "Feedback de errores en login" (20 min) · riesgo: **bajo**

Un solo tema: que el usuario vea lo que pasa. **(B-1)**

- `AuthForm.tsx` — leer `authStore.error` además del estado local, o hacer que `signIn`/`signUp` lancen.
- Condicionar el toast de "Cuenta creada" a que no haya error.

Verificar a mano: contraseña incorrecta → mensaje visible; email ya registrado → mensaje visible, no toast verde. Commit: `S38-B: feedback de error real en AuthForm`.

---

## Sesión 3 — S38-C · "Build desbloqueado" (10 min) · riesgo: **bajo**

Un solo cambio en `vite.config.ts`: `workbox.maximumFileSizeToCacheInBytes: 3 * 1024 * 1024`. **(B-8)**

Verificar: `npm run build` termina en 0. Commit: `S38-C: desbloquear build PWA`.

⚠️ Esto **no** arregla el bundle de 2,17 MB, solo deja de abortar. El code-splitting real (romper los imports estáticos duplicados de `pdfjs-dist` y `three`, y borrar la rama muerta `'3d-test'` de `App.tsx:179` que arrastra `three` entero) es un sprint aparte de 3-4 h — **no antes de la demo**.

---

## Sesión 4 — S38-D · "Notificaciones" (15 min) · riesgo: **medio — toca producción**

Un solo objetivo: que la campanita funcione. **(B-7)**

- DDL en Supabase: `ALTER TABLE ordenes REPLICA IDENTITY FULL;`
- Verificar en vivo: cambiar el estado de una OT desde otra sesión y confirmar que aparece la notificación.

Es un cambio en la base de producción: hacerlo con tiempo, no la mañana de la demo. Si no hay margen, **dejarlo y no mostrar la campanita** — es la opción segura.

---

## Sesión 5 — S38-E · "Acciones reales de la grilla" (45 min) · riesgo: **medio**

Solo si sobra tiempo antes de la demo. **(B-3 completo)**

- Cablear "🗑 Eliminar" a `ordenesStore.eliminarOrden` con confirmación.
- Cablear "📄 Generar informe" al `ModalInformeOT` que ya existe y funciona.

Commit: `S38-E: acciones de fila de VistaGrilla cableadas`.

---

# 🟥 Después de la demo — no antes

Estas tres cosas son las más graves del informe técnico y **ninguna se toca antes de presentar**: dos requieren autorización explícita sobre archivos PROHIBIDOS, y las tres necesitan pruebas serias.

| Sprint | Qué | Archivos | Riesgo |
|---|---|---|---|
| **S39-A** | Reparar los mappers de `SyncManager`: `comentarios: o.descripcion` cruza dos campos, y las listas de columnas quedaron en 14 y 10 contra las 39 y 34 de `ordenesStore`. **Corrompe datos en el camino offline** | `src/sync/SyncManager.ts:15-32, 49-58` | 🔴 **PROHIBIDO** — requiere autorización explícita |
| **S39-B** | Completar `mapRowToOrdenLocal` de Realtime (18 → 47 campos) y reemplazar el `eliminarOrden` del handler de DELETE por un borrado local | `src/hooks/useRealtimeOrdenes.ts:6-30, 57-60` | ✅ Libre, pero afecta a `ordenesStore` (PROHIBIDO) si se agrega una acción nueva |
| **S39-C** | Seguridad: quitar las 3 políticas `Authenticated users can …` de `fotos`; mover `VITE_ANTHROPIC_API_KEY` a una Edge Function y **rotar la key** | Supabase + `src/services/iaService.ts` | ✅ Libre |

Y la deuda de fondo, sin urgencia: 9 archivos `.bak` versionados dentro de `src/`, 4 componentes huérfanos (`dashboard/Dashboard.tsx`, `CalendarPicker.tsx`, `PlanoThumb.tsx`, más los 3 de `plano3d/` colgando de una rama inalcanzable), ~350 líneas de generadores de informe muertos en `reportService.ts`, `csvService.importarCSV` que ya nadie llama, los `console.log('[DEBUG …]')` de `ordenesStore.ts:477-480` volcando payloads completos en producción, y `.env.example` vacío (0 bytes) sin documentar las tres variables que la app necesita.

---

# Resumen en tres líneas

1. **El producto funciona.** Plano, OTs, fotos, estados, informes, Gantt, Dashboard, CSV: todo real, contra base real.
2. **Lo que lo rodea, no.** Configuración, notificaciones, menú de la grilla, login sin feedback y el build que no compila.
3. **45 minutos de una sola sesión de "ocultar" convierten esto en una demo defendible.** Los arreglos de fondo —sincronización offline y seguridad— van después, con calma y con autorización.
