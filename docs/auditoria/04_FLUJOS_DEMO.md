# 04 — TRAZADO DE LOS 8 FLUJOS DE LA DEMO

**Fecha:** 2026-07-26 · **HEAD:** `e4897e8` · **Modo:** solo lectura — no se modificó ningún archivo ni ninguna fila.
**Método:** lectura del código (componente → handler → store → service → Supabase → vuelta a la UI) + verificación del estado real de la base y de las políticas de Storage vía MCP.

**Datos disponibles para la demo** (4 proyectos activos): 32 OTs · 32 ubicadas en plano · 17 con fecha inicio+fin · 11 con responsable · 9 con nivel de riesgo · 6 con costo · 8 cerradas · 106 fotos.

---

## Tabla resumen

| # | Flujo | Estado |
|---|---|---|
| 1 | Login email/password → selector de proyectos | 🟡 **FUNCIONA PARCIAL** — credenciales erróneas fallan en silencio; alta de cuenta muestra éxito aunque falle |
| 2 | Crear proyecto + subir plano (PDF e imagen) y renderizar | 🟢 **FUNCIONA COMPLETO** — con 2 validaciones que pueden rechazar la imagen |
| 3 | Clic en plano → crear OT → formulario → guardar → marcador | 🟢 **FUNCIONA COMPLETO** — con gate obligatorio: sin foto ANTES no se puede guardar |
| 4 | Fotos ANTES/DURANTE/DESPUÉS + cambio de estado validado | 🟢 **FUNCIONA COMPLETO** |
| 5 | Grilla: filtrar, ordenar, abrir detalle | 🟡 **FUNCIONA PARCIAL** — "✎ Editar" abre un modal de solo lectura; "Eliminar" e "Informe" son `console.log` |
| 6 | Gantt y Dashboard con datos reales | 🟢 **FUNCIONA COMPLETO** — Gantt grafica 17 de 32 OTs (las demás no tienen fechas) |
| 7 | Generar los 5 informes + ventana de impresión | 🟢 **FUNCIONA COMPLETO** — depende de CDN externo y de que no haya bloqueador de pop-ups |
| 8 | Importar CSV y exportar CSV | 🟢 **FUNCIONA COMPLETO** |

---

# FLUJO 1 — Login email/password → selector de proyectos

## 🟡 FUNCIONA PARCIAL

### Cadena

1. `src/App.tsx:123` — sin `user` renderiza `<AuthForm />`.
2. `src/components/ui/AuthForm.tsx:24-46` — `handleSubmit` valida email/password (≥6 caracteres) y llama `signIn(email.trim(), password)`.
3. `src/stores/authStore.ts:31-36` — `signIn` → `supabase.auth.signInWithPassword({ email, password })`.
4. `src/stores/authStore.ts:26-28` — el listener `onAuthStateChange` (registrado en `initialize`, invocado desde `App.tsx:60`) escribe `user` y `session` en el store.
5. `src/App.tsx:132-181` — con `user` y `vista === 'proyectos'` (default en `:32`) renderiza `<SelectorProyectos />`.
6. `src/components/proyecto/SelectorProyectos.tsx:53` — `cargarProyectos()`.
7. `src/stores/proyectosStore.ts:41-45` — `SELECT * FROM proyectos WHERE deleted_at IS NULL ORDER BY updated_at DESC`. RLS: `es_miembro(id) OR created_by = auth.uid()` ✅.
8. `SelectorProyectos.tsx:57-61` → `statsService.cargarStatsProyectos` (conteos por estado) y `:66-82` → `pdfThumbnailService.generarThumbnailPDF` para las portadas PDF.
9. `App.tsx:62-66` — con `user` arranca `iniciarSyncManager()`.

**El camino feliz funciona de punta a punta.** Lo que falla es el manejo de error:

### ⚠️ Falla 1 — contraseña incorrecta: sin ningún mensaje

`authStore.signIn` **no lanza excepción**: guarda el error en el store (`set({ error: error.message })`, línea 34) y retorna normal.
`AuthForm.tsx:41-42` espera una excepción para poblar su estado **local** `error`:

```tsx
} catch (err: unknown) {
  setError(err instanceof Error ? err.message : 'Error de autenticación.');
}
```

Y lo que se pinta en pantalla es ese estado local (`AuthForm.tsx:105`: `{error && <div className={styles.error}>{error}</div>}`), no `authStore.error`. Como nunca hay excepción, el `catch` no corre y el div de error nunca aparece.

**En pantalla:** el usuario tipea mal la contraseña, aprieta "Iniciar sesión", el botón sale de "cargando"… y no pasa absolutamente nada. Ni mensaje, ni entrada. Parece que la app se colgó.

### ⚠️ Falla 2 — alta de cuenta: éxito falso

`AuthForm.tsx:36-39`:

```tsx
await signUp(email.trim(), password);
mostrar('Cuenta creada. Revisá tu email para confirmar el registro antes de ingresar.', 'success');
cambiarModo('login');
```

El toast verde es **incondicional**. `signUp` (`authStore.ts:38-43`) tampoco lanza. Si el email ya está registrado o la contraseña es débil, la app igual anuncia "Cuenta creada" y manda al login.

### Nota
El botón "🔵 Continuar con Google" (`AuthForm.tsx:163-169`) es un stub: `console.log('google-login')` (`:48-51`). Ver `02_FUNCIONALIDAD_INCOMPLETA.md`, B-3.

---

# FLUJO 2 — Crear proyecto + subir plano (PDF e imagen) y que renderice

## 🟢 FUNCIONA COMPLETO

### Cadena

1. `SelectorProyectos.tsx:44` + botón "+ Nuevo proyecto" → `setModalAbierto(true)` → `<ModalNuevoProyecto />`.
2. `ModalNuevoProyecto.tsx:70-92` — `handleArchivo` corre `validarCalidadPlano` (`:6-49`).
3. `ModalNuevoProyecto.tsx:101-146` — `handleSubmit`:
   - Si **no** es PDF (`:113`): `procesarPlanoCanvas(archivo)` (`utils/planoScanner.ts:18`) → Blob → `new File([blob], 'plano_procesado.png', { type: 'image/png' })`.
   - Si es PDF (`:118-120`): se sube tal cual, sin procesar.
   - Llama `crearProyecto({ nombre, cliente, descripcion: '', planoFile })`.
4. `stores/proyectosStore.ts:87-116`:
   - `supabase.auth.getUser()` → `filePath = ${user.id}/${Date.now()}.${ext}`.
   - `:92-94` `storage.from('planos').upload(filePath, planoFile)` — política Storage: `bucket_id='planos' AND auth.role()='authenticated'` ✅ (verificado en la DB).
   - `:97-99` `getPublicUrl` (bucket público ✅).
   - `:101-111` `INSERT INTO proyectos (nombre, cliente, descripcion, plano_url, created_by) … .select().single()`. RLS INSERT: `created_by = auth.uid()` ✅; el `RETURNING` pasa la política SELECT por `created_by = auth.uid()` ✅.
   - Trigger `trg_proyecto_creado` → `agregar_creador_como_supervisor()` inserta la fila en `proyecto_miembros` con `rol='supervisor'` ✅ (verificado: los 4 proyectos activos tienen supervisor).
   - `:116` prepend al array del store → la card aparece sin recargar.
5. `ModalNuevoProyecto.tsx:131-135` — lee `useProyectosStore.getState().error` porque el store traga las excepciones (`:117-120`). Este chequeo sí está bien hecho (a diferencia del Flujo 1).
6. Abrir el proyecto → `App.tsx:150-153` `setProyectoActivo` + `setVista('plano')` → `<VistaPlano />`.
7. **Render del plano** — `VistaPlano.tsx:162-171`: `const isPdf = url.toLowerCase().includes('.pdf')`.
   - **PDF** → `cargarPDF` (`:173-194`): `pdfjsLib.getDocument({ url, disableRange: true, disableStream: true })` → página 1 → `scale = max(anchoÁrea*2.5, 2800)/vp.width` → render a `<canvas>` → `setPlanoDims` → `setPlanoListo(true)`. Worker desde `cdnjs.cloudflare.com` (`:18-19`), cacheado por Workbox (`vite.config.ts:44-51`).
   - **Imagen** → `cargarImagen` (`:196-201`): `img.onload` → `naturalWidth/Height` → listo.
8. `:203` `fitView()` centra y escala. `:222-232` zoom con rueda, `:239-261` pan.

La detección PDF vs imagen es consistente con lo que se sube: el `ext` sale del nombre original (`.pdf` se conserva) y las imágenes procesadas siempre terminan en `plano_procesado.png`.

### ⚠️ Dos validaciones que pueden cortar la demo

`ModalNuevoProyecto.tsx:19-21` y `:30-38` — para **imágenes** (no aplica a PDF):
- Rechaza si pesa **< 200 KB**: *"Imagen demasiado pequeña (< 200 KB). El plano puede verse pixelado."*
- Rechaza si mide **menos de 1800×1200 px**.

Un JPG de plano razonable pero comprimido, o un screenshot, se rechaza. **Recomendación: probar el archivo exacto antes de la demo, o usar PDF, que no tiene restricción de dimensión.**

### Notas menores
- `crearProyecto` no guarda `plano_width_px`, `plano_height_px` ni `plano_thumb_url`: el thumbnail del PDF se regenera en el cliente cada sesión (`SelectorProyectos.tsx:74`, cacheado por URL dentro del servicio).
- El preview del modal (`:238-245`) muestra la imagen **original**, no la procesada por el scanner, pese a que el label dice "Vista previa del scanner".

---

# FLUJO 3 — Clic en el plano → crear OT → completar formulario → guardar → marcador visible

## 🟢 FUNCIONA COMPLETO — con un gate obligatorio

### Cadena

1. `VistaPlano.tsx:264-277` — `onPlanClick`:
   - Descarta si venía de un drag (`didDragRef`) o si el click salió de un marcador (`[data-marcador]`).
   - Convierte pixel → fracción: `posX = (clientX - rect.left - tx) / sc / planoDims.w` (`:271-272`). Coherente con `pos_x`/`pos_y` como fracción 0–1.
   - `crearOrdenEnPosicion(proyecto.id, posX, posY)`.
2. `stores/ordenesStore.ts:264-327`:
   - Arma el `OrdenLocal` con `id: uuidv4()`, `ot: nextCodigoOT(ordenes)` (`:109-115`, formato `OT-001`), `estado: 'Pendiente'`, `prioridad: 'Media'`, resto vacío.
   - `set({ ordenes: [...ordenes, nueva] })` → **el marcador aparece al instante** (optimista).
   - `db.ordenes.put(nueva)` (Dexie, `_synced: false`).
   - Online → `INSERT INTO ordenes` con `ordenToRow` (39 columnas, `:60-102`). RLS INSERT: miembro con rol supervisor/técnico ✅.
   - Éxito → `_synced: true`; error → encola `CREATE_OT` en `syncQueue`.
3. `VistaPlano.tsx:275-276` — `setOrdenSeleccionada(nueva)` + `setEsNuevaOT(true)` → abre `<PanelOT />`.
4. `PanelOT.tsx:246-270` — al montar: re-lee la OT del servidor (`SELECT * FROM ordenes WHERE id=…`), carga fotos (`cargarFotosDeOrden`) y campos personalizados (`getCamposDeProyecto`).
5. El usuario completa el form (`set()` en `:293-294` sobre estado local `form`).
6. `PanelOT.tsx:387-442` — `handleGuardar`:
   - **`:389-390` valida fotos contra el estado** (ver gate abajo).
   - `:398-425` `actualizarOrden(id, {…24 campos…})`.
7. `ordenesStore.ts:435-501` — `actualizarOrden`: optimista en store + Dexie, luego `UPDATE … .select().single()`, y reemplaza el snapshot local con la fila autoritativa del servidor (`:488-492`).
8. **Marcador** — `VistaPlano.tsx:130-135` (`ordenesFiltradas`) → `<Marcador />`. `Marcador.tsx:13` descarta las no ubicadas; `:23-24` posiciona con `left: ${pos_x * 100}%` / `top: ${pos_y * 100}%`. Color por estado, emoji por rubro (`:15-16`).

### ⚠️ Gate: no se puede guardar una OT nueva sin foto ANTES

`PanelOT.tsx:389-390`:

```tsx
const v = validarFotosParaEstado(fotosAntes, fotosDurante, fotosDespues, estado);
if (!v.valido) { mostrar(v.errores.join(' · '), 'error'); setTab('fotos'); return; }
```

Y `utils/validaciones.ts:21` define que el estado `'Pendiente'` —el default de toda OT nueva— **requiere al menos 1 foto ANTES**.

**En pantalla:** se crea la OT, se completa todo el formulario, se aprieta "Guardar" → toast rojo *"Se requiere al menos 1 foto ANTES"* y salto automático a la pestaña Fotos. Los datos escritos no se pierden (siguen en `form`), pero no se persisten hasta subir la foto.

Es comportamiento **intencional** (está documentado en la pantalla de Ayuda, `PantallaAyuda.tsx:77`), no un bug. Pero para la demo hay que saberlo: **el Flujo 3 no se puede mostrar sin tener una foto a mano**. Encadenarlo con el Flujo 4 es lo natural.

### Notas
- La OT se inserta en la base **antes** de que el usuario complete nada. Si cierra el panel sin guardar, la OT queda con campos vacíos. Hay salida limpia: "Cancelar" (`PanelOT.tsx:837` → `handleCancelarNueva:450-454`) la borra.
- Arrastrar un marcador ya existente funciona por otra vía: `VistaPlano.tsx:289-300` `handleDropOT` → `actualizarOrden(moveId, { pos_x, pos_y })`.

---

# FLUJO 4 — Fotos ANTES / DURANTE / DESPUÉS + cambio de estado respetando la validación

## 🟢 FUNCIONA COMPLETO

### Subida de foto

1. `PanelOT.tsx:308-313` — `onArchivoSeleccionado` limpia el input y llama `procesarSubidaFoto`.
2. `PanelOT.tsx:315-351` — `procesarSubidaFoto`:
   - **Auto-transición de estado** (`:318-319`): DURANTE sobre "Pendiente" → propone "En proceso"; DESPUÉS sobre "Pendiente"/"En proceso" → propone "Cerrada".
   - Si hay transición, abre `ModalComentarioEstado` vía `pedirComentarioEstado` (`:296-306`, promesa). Cancelar aborta la subida entera (`:324`).
   - `:329` `subirYRegistrarFoto(file, ordenId, proyectoId, categoria)`.
3. `services/fotosService.ts:89-99` → `subirFoto` (`:18-51`):
   - Valida `image/*` y ≤ 10 MB (`:24-29`).
   - `path = ${ordenId}/${categoria}/${timestamp}.${ext}` → `storage.from('fotos').upload(...)`. Política Storage: `bucket_id='fotos' AND auth.role()='authenticated'` ✅.
   - `getPublicUrl` (bucket público ✅).
   - `registrarFotoEnDB` (`:65-86`): `INSERT INTO fotos (orden_id, proyecto_id, categoria, file_url, file_path, file_type)`. Mapea el MIME a los valores del CHECK: `image/*` → `'imagen'` ✅.
4. `PanelOT.tsx:330-332` — agrega la foto al array de su categoría → aparece en la grilla de miniaturas al instante.
5. `:333-339` — abre `ModalDescripcionFoto` y dispara `describirFotoConIA(foto.url)` en paralelo. Si la key de Anthropic falta o falla, `iaService.ts:40-43` devuelve `''` sin romper nada ✅.
6. `:340-345` — si había transición pendiente: `actualizarOrden({ estado })` + `crearComentario(...)` en `ot_comentarios` + refresca el historial.

### Cambio de estado manual

`PanelOT.tsx:557-581` — `handleCambiarEstado`:
1. `:560-565` valida fotos contra el **estado destino**; si falta alguna, salta a la pestaña Fotos con el mensaje *"Subí las fotos requeridas para cambiar a X — el estado se actualizará automáticamente"* y **no** cambia el estado.
2. `:566-567` pide comentario obligatorio (cancelar aborta).
3. `:568-571` `crearComentario` → `INSERT INTO ot_comentarios`.
4. `:573-577` si el destino es "No aplica", setea `fecha_fin_trabajos` = hoy.
5. `:578-579` `actualizarOrden({ estado, ...extraFields })`.

### Reglas de foto (`utils/validaciones.ts:20-25`)

| Estado destino | ANTES | DURANTE | DESPUÉS |
|---|:---:|:---:|:---:|
| Pendiente | ✔ requerida | — | — |
| En proceso | ✔ | ✔ | — |
| Cerrada | ✔ | ✔ | ✔ |
| No aplica | — | — | — |

### Borrado protegido

`PanelOT.tsx:366-385` — `handleEliminarFoto` re-valida simulando la eliminación (`:369-374`); si la foto es la única que sostiene el estado actual, bloquea con *"No podés eliminar la única foto {categoría} — el estado actual la requiere."* Si pasa, `eliminarFoto` borra de Storage y de la tabla (`fotosService.ts:54-62`). Política Storage DELETE: `auth.uid() = owner` ✅ (el mismo usuario que subió).

**Todo el flujo está cableado de punta a punta y la validación se aplica en los tres puntos de entrada** (guardar, cambiar estado, borrar foto).

---

# FLUJO 5 — Vista Grilla: filtrar, ordenar, abrir detalle

## 🟡 FUNCIONA PARCIAL

### Lo que funciona

1. `App.tsx:156-164` → `<VistaGrilla proyectoId proyectoNombre />`.
2. `VistaGrilla.tsx:583` — `cargarOrdenes(proyectoId)` → `ordenesStore.ts:222-261` → `SELECT * FROM ordenes WHERE proyecto_id=… ORDER BY ot`, con caída a Dexie si no hay red (`:251-256`).
3. **Filtros** — `:604-621` `filtradas`: estados, prioridades, rubros, riesgos y búsqueda de texto. Contador en vivo en `:779` ("N de M"). "Limpiar todos" en `:641`.
4. **Orden** — `:614-618` comparador que distingue numérico de string (`localeCompare`); `:638` `toggleSort` alterna asc/desc; `:639` `sortIcon` pinta ↑/↓ en la cabecera.
5. **Agrupación** — `:625-635` `grupos` por el campo elegido. **Vista Kanban** — `:846-855` columnas por estado.
6. **Abrir detalle** — `:675` `onRowClick` → `setModalOrden(o)` → `:904` `<ModalDetalleOT orden proyectoId onClose onGuardado />`. El modal carga sus fotos con `cargarFotosDeOrden` y muestra los ~30 campos de la OT.
7. **Exportar** — `:659-666` CSV propio de la grilla (respeta columnas visibles + campos personalizados) y `:669-673` PDF imprimible.

### ⚠️ Falla 1 — "✎ Editar" no edita

`VistaGrilla.tsx:709-710`:

```tsx
<button type="button" onClick={() => { setAccionesMenuId(null); setModalOrden(o); }}>👁 Ver detalle</button>
<button type="button" onClick={() => { setAccionesMenuId(null); setModalOrden(o); }}>✎ Editar</button>
```

Las dos acciones son **idénticas**: abren `ModalDetalleOT`. Y ese modal es de **solo lectura**: no contiene un solo `<input>`, `<textarea>`, `<select>` ni `onChange` (verificado por barrido sobre el archivo completo). Recibe un prop `onGuardado` (`ModalDetalleOT.tsx:60`) que nunca invoca.

`ModalDetalleOT.tsx:216-217` sí renderiza un botón "Editar OT", pero solo si le pasan `onEditar` — y `VistaGrilla.tsx:904` **no se lo pasa** (tampoco `Responsables.tsx:218` ni `Contratistas.tsx:246`). O sea que ese botón no aparece nunca.

**En pantalla:** el usuario elige "✎ Editar", se abre una ficha bonita… y no hay nada que tocar. Para editar de verdad hay que ir al plano y abrir el `PanelOT`.

### ⚠️ Falla 2 — "🗑 Eliminar" y "📄 Generar informe" son `console.log`

`VistaGrilla.tsx:711-712` — ya documentado en `02_FUNCIONALIDAD_INCOMPLETA.md` (B-1 y B-2). El menú se cierra y no pasa nada.

### Nota
`VistaGrilla.tsx:529` — `const { ordenes, cargarOrdenes } = useOrdenesStore();` desestructura el store sin selector; el componente se re-renderiza ante cualquier cambio de estado del store.

---

# FLUJO 6 — Vista Gantt y vista Dashboard con datos reales

## 🟢 FUNCIONA COMPLETO

### Gantt

1. `App.tsx:174` → `<Gantt />`.
2. `Gantt.tsx:178-181` — `cargarProyectos()` + `cargarTodasLasOrdenes()`.
3. `ordenesStore.ts:169-219` — `cargarTodasLasOrdenes`: primero asegura la lista de proyectos, arma los ids y hace `SELECT * FROM ordenes WHERE proyecto_id IN (…) ORDER BY updated_at DESC`. Refresca Dexie en transacción (`:197-202`) y cae a caché local si no hay red (`:205-208`).
4. `Gantt.tsx:190-197` — **split**: `otConFechas` (requiere `fecha_inicio_trabajos` **y** `fecha_fin_trabajos`) vs `otSinFechas`.
5. `:206-222` — 5 filtros (buscar / estado / prioridad / rubro / riesgo) aplicados a ambas listas.
6. `:225+` — rango temporal calculado desde las OTs; escala día/semana/mes (`:448`), zoom (`:481`, `:491`), navegación por mes (`:412`, `:427`).
7. `:654` / `:760` / `:851` — clic en una barra → `setModalOrden(o)` → `ModalDetalleOT`.
8. `:884` — botón que abre el listado de OTs sin fechas (`:903-941`), así ninguna queda invisible.
9. `:571` / `:584` — exportar Gantt a CSV y a PDF.

**Los 15 handlers del Gantt están cableados a funciones reales — ningún stub.**

📊 **Dato de la base:** de las 32 OTs de proyectos activos, **17 tienen ambas fechas** y se van a graficar. Las otras 15 caen en "sin fechas" y solo aparecen en el modal del `:884`. El Gantt se va a ver poblado, pero conviene saber el número antes de que el cliente pregunte por qué faltan OTs.

### Dashboard

1. `App.tsx:145` → `<Dashboard />` (`components/views/Dashboard.tsx` — ojo: `components/dashboard/Dashboard.tsx` es un huérfano que nunca se importa).
2. `:58-61` — mismas dos cargas que el Gantt.
3. `:64-68` — `getWidgetConfig(user.id)` → `dashboard_configs` (con fallback a `localStorage` y a `DEFAULT_WIDGETS`) ✅.
4. `:83-95` — KPIs calculados sobre datos reales: total, avance promedio, OTs de riesgo Alto/Extremo, costo total, modificadas en los últimos 7 días.
5. `:97-101` `porEstado`, `:105-110` `porRubro`, más "últimas OTs modificadas".
6. `:497-499` — exportar CSV / HTML / PDF; `:504` panel de configuración de widgets; `:533` colapsar.

📊 **Dato de la base:** `costo` cargado en solo **6 de 32** OTs y `nivel_riesgo` en **9 de 32**. El KPI de costo total y el de riesgo van a mostrar números bajos — correctos, pero pobres. Si son parte del pitch, conviene completar esos campos en unas OTs antes de la demo.

---

# FLUJO 7 — Generar informe (los 5 tipos) y abrir la ventana de impresión

## 🟢 FUNCIONA COMPLETO

### Cadena

1. `PanelOT.tsx:482-488` — `INFORMES_CONFIG` define los 5: Ficha de Visita (FOR-09-01), Relevamiento, Avance, Cierre, Acta de Conformidad.
2. `PanelOT.tsx:796` — `informeDisponible(tipo, estado)` decide si el botón se habilita. `reportService.ts:768-776`:

| Informe | Disponible cuando |
|---|---|
| Ficha de Visita | siempre |
| Relevamiento | siempre |
| Avance | estado = "En proceso" o "Cerrada" |
| Cierre | estado = "Cerrada" |
| Acta de Conformidad | estado = "Cerrada" |

3. `PanelOT.tsx:807` — "🖨️ Generar" mapea el tipo y abre `<ModalInformeOT />`.
4. `ModalInformeOT.tsx:180-255` — carga inicial en paralelo:
   - Comentario pre-llenado según el tipo: Cierre lee la transición "En proceso → Cerrada", Relevamiento/Avance leen "Pendiente → En proceso" (`fetchComentarioTransicion` → `ot_comentarios`), Ficha usa `orden.comentarios`.
   - Fotos vía `cargarFotosDeOrden`, repartidas en ANTES / DURANTE / DESPUÉS según lo que pida cada tipo, incluyendo `descripcion` y `descripcion_observacion`.
5. `:161-177` — `construirHtml` despacha a los 5 generadores de `reportService` (`generarInformeCierre`, `generarInformeFichaVisita`, `generarInformeRelevamiento`, `generarInformeAvance`, `generarInformeActaConformidad`).
6. `:258-284` — preview en vivo dentro de un `<iframe>`, con debounce de 150 ms y regeneración inmediata al togglear "incluir fotos".
7. `:310-322` — **`handleExportarPDF`**:

```tsx
const w = window.open('', '_blank');
if (!w) return;
w.document.open(); w.document.write(html); w.document.close();
w.onload = () => { w.document.title = cfg.tituloDoc; setTimeout(() => w.print(), 250); };
```

→ **abre la ventana de impresión del navegador** ✅. También hay `handleExportarHTML` (`:295-308`) que descarga el `.html`.

### ⚠️ Riesgo 1 — los informes dependen de internet aunque la app sea offline-first

`reportService.ts:1151-1153` (y `:893-895`, `:178-179`) — el `<head>` de cada informe carga:

```html
<script src="https://cdn.tailwindcss.com?plugins=forms,container-queries"></script>
<link href="https://fonts.googleapis.com/css2?family=Inter…&family=Sora…" rel="stylesheet"/>
<link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined…" rel="stylesheet"/>
```

Y `:1006-1013` incrusta los dos logos del encabezado desde URLs de **`lh3.googleusercontent.com`** (assets generados, no alojados por ustedes).

Sin conexión —o si esas URLs de Google caducan— el informe se imprime **sin estilos y sin logos**: texto plano sobre fondo blanco. Estas URLs no están en el `runtimeCaching` de `vite.config.ts` (que solo cachea Supabase Storage, la API REST y el worker de pdf.js), así que el service worker no las tiene guardadas.

### ⚠️ Riesgo 2 — bloqueador de pop-ups = falla muda

`ModalInformeOT.tsx:313-314`: si `window.open` devuelve `null` (pop-up bloqueado), el código hace `return` sin avisar nada. El usuario aprieta "PDF" y no pasa nada. **Conviene habilitar pop-ups para el dominio antes de la demo.**

### Nota — código muerto
`reportService.ts` tiene **dos generaciones** de generadores. Los viejos (`generarFichaVisita:431`, `generarRelevamiento:491`, `generarAvance:545`, `generarCierre:609`, `generarActaConformidad:667`) y su dispatcher `generarInforme:751` **no los importa nadie**: los únicos consumidores del servicio son `ModalInformeOT.tsx:28-33` (los 5 nuevos) y `PanelOT.tsx:11` (solo `informeDisponible`). Son ~350 líneas muertas que igual pesan en el bundle de 2,17 MB.

---

# FLUJO 8 — Importar CSV y exportar CSV

## 🟢 FUNCIONA COMPLETO

### Importar

1. `VistaPlano.tsx:365` — botón "Importar" → `acciones.abrirImportarCSV` → `useAccionesProyecto.tsx:177` `setMostrarModalImport(true)`.
2. `ModalImportCSV.tsx` — wizard de 3 pasos:
   - **Paso 1**: drag&drop o click; parsea con PapaParse (el componente usa Papa directamente, `:15`); extrae headers y muestra 3 filas de sample.
   - **Paso 2**: mapeo columna→campo con auto-mapping por alias (`:59-61` y la tabla `STANDARD_KEYS`), validación de que "Código OT" esté mapeado (`puedeAvanzarPaso2`).
   - **Paso 3**: preview de 5 filas + botón "✓ Importar N OTs" (`:731-740`).
3. `:284-296` — `handleConfirmar` primero crea las definiciones de campos personalizados nuevos (`crearCampo` → `campos_definicion`), después delega al caller vía `onImportar`.
4. `useAccionesProyecto.tsx:347-403`:
   - Normaliza estado/prioridad/riesgo con alias legacy y fallback fuzzy por Levenshtein (`:179-183`).
   - Por cada fila → `crearOrdenDesdeImport({ ot, proyecto_id, plano_ref_url: proyecto.plano_url, ubicacion: '', … })`.
   - `:401-403` registra los ids creados con `setOtsPendientesImport`.
   - `:404-408` toast con el resultado (`N creadas, M fallaron`).
5. `ordenesStore.ts:330-374` — `crearOrdenDesdeImport`: mismo patrón offline-first (store → Dexie → Supabase → cola si falla).
6. Las OTs importadas quedan **sin ubicar** a propósito (`pos_x`/`pos_y` en `null`) y aparecen en el `ToolPanel` (`VistaPlano.tsx:478`) para arrastrarlas al plano.
7. `App.tsx:98-104` — el guard de navegación: si hay OTs pendientes de ubicar y el usuario intenta cambiar de vista, se abre `ModalImportPendiente` (`:220-226`) con las opciones "continuar cargando" o "cancelar importación" (que las borra, `:108-117`).

### Exportar

Hay **dos** exportadores distintos, ambos funcionales:

- **Desde el plano** — `VistaPlano.tsx:393` → `useAccionesProyecto.tsx:145-151`: carga las fotos de todas las OTs (`construirFotosMap`) y llama `csvService.exportarCSV` (`:54-90`), que arma 15 columnas —incluidas las URLs de fotos ANTES/DURANTE/DESPUÉS separadas por `|`—, agrega BOM UTF-8 y dispara la descarga vía `Blob` + `<a download>`.
- **Desde la grilla** — `VistaGrilla.tsx:659-666`: exporta exactamente las columnas visibles + los campos personalizados activos, respetando los filtros aplicados.

Ambos se deshabilitan si no hay filas (`VistaPlano.tsx:395`, `VistaGrilla.tsx:780`).

### Nota — código muerto
`csvService.importarCSV` (`:101-160`) **no lo llama nadie**: el wizard parsea con PapaParse por su cuenta. Es el importador viejo (mapeo fijo, sin campos personalizados) y quedó huérfano. No molesta, pero es la función que uno esperaría que corriera al importar.

---

# Apéndice — riesgos transversales que afectan a varios flujos

| Riesgo | Flujos afectados | Detalle |
|---|---|---|
| **Notificaciones nunca se disparan** | 3, 4 | `REPLICA IDENTITY` de `ordenes` es `default`, el código espera `FULL`. La campanita no muestra nada nunca. Ver `03_CAPA_DATOS.md`, D-1 |
| **Realtime vacía campos** | 3, 4, 6 | Si hay dos dispositivos abiertos, un cambio remoto borra 25 columnas del snapshot local. Ver `03_CAPA_DATOS.md`, D-4 |
| **Sincronización offline corrompe datos** | 3, 4, 8 | `SyncManager` escribe `descripcion` en `comentarios` y descarta 25 columnas. **No demostrar el modo avión.** Ver `03_CAPA_DATOS.md`, D-2 y D-3 |
| **Build de producción no compila** | todos | Falla en `vite-plugin-pwa` por el chunk de 2,17 MB. La demo tiene que correr sobre `npm run dev`. Ver `01_BASELINE.md`, punto 5 |
| **Pop-ups y CDN** | 7 | Informes: habilitar pop-ups y tener internet |
