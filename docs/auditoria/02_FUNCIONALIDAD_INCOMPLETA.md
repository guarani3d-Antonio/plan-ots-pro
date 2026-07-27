# 02 — FUNCIONALIDAD INCOMPLETA (barrido de `src/`)

**Fecha:** 2026-07-26 · **HEAD:** `e4897e8` · **Modo:** solo lectura — no se modificó ningún archivo.

**Alcance:** 76 archivos `.ts`/`.tsx` bajo `src/` (se excluyeron los `.bak`).
**Método:** búsqueda por patrones (TODO/FIXME/stub/próximamente), detección automática de `<button>` sin `onClick` vía regex .NET, rastreo de imports para detectar componentes huérfanos, y lectura manual de las vistas de navegación.

**Resumen:** 8 hallazgos BLOQUEA DEMO · 8 VISIBLE PERO EVITABLE · 9 INVISIBLE.

---

# 🔴 BLOQUEA DEMO

## B-1 · Grilla → menú "···" → **🗑 Eliminar** no borra nada
**Archivo:** `src/components/grilla/VistaGrilla.tsx:712`

```tsx
<button type="button" className={styles.accionDanger}
  onClick={() => { setAccionesMenuId(null); console.log('eliminar', o.id); }}>🗑 Eliminar</button>
```

**Qué se ve:** en cada fila de la grilla hay un botón `···` que abre un menú con cuatro acciones. "🗑 Eliminar" está en rojo (`accionDanger`), con aspecto de acción destructiva real.
**Qué pasa al usarlo:** el menú se cierra y se escribe `eliminar <uuid>` en la consola. La OT sigue ahí. No hay confirmación, ni toast, ni error — el usuario asume que falló la app.
**Nota:** el borrado real sí existe (`ordenesStore.eliminarOrden`, usado desde `PanelOT`), pero no está cableado acá.

## B-2 · Grilla → menú "···" → **📄 Generar informe** no genera nada
**Archivo:** `src/components/grilla/VistaGrilla.tsx:711`

```tsx
onClick={() => { setAccionesMenuId(null); console.log('informe', o.id); }}
```

**Qué se ve:** ítem "📄 Generar informe" en el mismo menú de fila.
**Qué pasa al usarlo:** cierra el menú, `console.log('informe', <uuid>)`. No abre el modal de informes ni descarga PDF.
**Nota:** el flujo real existe y funciona en `PanelOT` (pestaña Informes → `reportService.informeDisponible` + `ModalInformeOT`). Desde la grilla no está conectado. Las otras dos acciones del menú ("👁 Ver detalle" y "✎ Editar", líneas 709-710) sí funcionan — ambas abren `ModalDetalleOT`.

## B-3 · Login → **"Continuar con Google"** no hace nada
**Archivo:** `src/components/ui/AuthForm.tsx:48-51` (handler) y `:163-169` (botón)

```tsx
const handleGoogleLogin = () => {
  // Stub — provider OAuth de Google aún no implementado en Supabase.
  console.log('google-login');
};
```

**Qué se ve:** en la primera pantalla de la app, debajo de un divisor "o", un botón a ancho completo "🔵 Continuar con Google".
**Qué pasa al usarlo:** nada visible. Sin spinner, sin popup de OAuth, sin error. Es la primera pantalla de cualquier demo, y es el botón más grande después del de login.

## B-4 · Plano → botón **⚙ (Configuración)** de la barra superior no hace nada
**Archivo:** `src/components/plano/VistaPlano.tsx:406-412`

```tsx
<button className={styles.btnIcon} onClick={() => console.log('config')} title="Configuración">⚙</button>
```

**Qué se ve:** ícono de engranaje en la toolbar de la Vista Plano, entre "📄 Informe" y "⛶ Pantalla completa" — los dos botones que lo rodean sí funcionan.
**Qué pasa al usarlo:** `console.log('config')`. No abre panel, modal ni nada.

## B-5 · Configuración → **"✉️ Enviar Invitación"** simula un éxito falso
**Archivo:** `src/components/views/Configuracion.tsx:89-101`

```tsx
setEnviandoInv(true);
// Stub — en S21 se implementa supabase auth invite + insert en proyecto_miembros.
await new Promise(r => setTimeout(r, 800));
mostrar(`Invitación enviada a ${invEmail} (funcionalidad en desarrollo)`, 'info');
```

**Qué se ve:** card a ancho completo "Gestión de Miembros y Roles" con un CTA azul oscuro "+ Invitar Miembro" que abre un modal completo (email, nombre, selector de rol). Al enviar, el botón muestra "⏳ Enviando..." durante 800 ms.
**Qué pasa al usarlo:** el delay es un `setTimeout` falso. No se envía ningún email, no se inserta nada en `proyecto_miembros`, la tabla de miembros no cambia. El toast dice literalmente "Invitación enviada a X (funcionalidad en desarrollo)" — o sea que confirma el envío y admite que no funciona, en la misma frase.

## B-6 · Configuración → tabla de miembros: siempre una sola fila, hardcodeada
**Archivo:** `src/components/views/Configuracion.tsx:64-82`

```tsx
// Sin proyecto activo o aún sin tabla de proyecto_miembros (S21): mostramos
// sólo al usuario actual como Supervisor. Cuando se implemente la query a
// proyecto_miembros JOIN auth.users, reemplazar el cuerpo del effect.
setMiembros([{ id: user.id, nombre: nombreUser, email: user.email ?? '',
               rol: 'Creador', ultima_actividad: 'Ahora' }]);
```

**Qué se ve:** tabla "Gestión de Miembros y Roles" con columnas Miembro / Correo / Rol / Última Actividad, buscador incluido.
**Qué pasa al usarlo:** la tabla **nunca** consulta la base. Siempre devuelve exactamente una fila: el usuario logueado, con rol `'Creador'` fijo y "Ahora" como última actividad, sin importar cuántos miembros tenga realmente el proyecto en `proyecto_miembros`. El buscador filtra sobre esa única fila.
**Además, `src/components/views/Configuracion.tsx:596-603`:** el botón `···` de cada fila **no tiene `onClick`** — es un elemento clickeable muerto (detectado automáticamente en el barrido de botones sin handler).

## B-7 · Configuración → "Gestión de Roles" dice que cambia permisos, y no cambia nada
**Archivos:** `src/components/views/Configuracion.tsx:129-143` y `:351`; contrastar con `src/components/plano/PanelOT.tsx:194-205`

**Qué se ve:** cuatro cards seleccionables (Creador / Editor / Comentarista / Lector) con un aviso amarillo:
> ⚠️ Cambiar el rol afectará inmediatamente los permisos de acceso.

Al hacer clic aparece un toast verde: *"Rol actualizado a «Editor»."*

**Qué pasa al usarlo:** el rol se escribe en `user_metadata.rol` vía `supabase.auth.updateUser`. **Ningún componente de la app lee `user_metadata.rol`.** El único control de permisos real (`PanelOT`) lee otra fuente completamente distinta:

```tsx
supabase.from('proyecto_miembros').select('rol')
  .eq('proyecto_id', proyectoActivo.id).eq('user_id', user.id).single()
  .then(({ data }) => setEsSupervisor(data?.rol === 'supervisor'));
```

O sea: bajarse a "Lector" muestra confirmación de éxito y no restringe absolutamente nada. Si en la demo se muestra este card como control de permisos, la afirmación en pantalla es falsa.

## B-8 · Plano → botón **"Borrar"** de una OT puede no aparecer nunca, sin explicación
**Archivo:** `src/components/plano/PanelOT.tsx:194-205` (query) y `:838-842` (render)

```tsx
supabase.from('proyecto_miembros').select('rol')…single()
  .then(({ data }) => { setEsSupervisor(data?.rol === 'supervisor'); });   // ← error ignorado
…
) : esSupervisor ? (
  <button className={styles.deleteBtn} onClick={handleEliminar}>…Borrar…</button>
) : null}
```

**Qué se ve:** en el footer del panel de una OT existente debería estar el botón "Borrar" (comportamiento introducido en S36-A: *"borrar solo supervisores"*).
**Qué pasa al usarlo:** el `.then()` descarta el campo `error` del resultado. Con `.single()`, si no existe fila en `proyecto_miembros` para ese `(proyecto_id, user_id)` — o si RLS bloquea la lectura — Supabase devuelve error y `data` es `null`; `esSupervisor` queda `false` **en silencio** y el botón simplemente no se renderiza. No hay mensaje, ni log, ni estado de carga: el usuario ve un panel sin opción de borrar y no sabe por qué.
**Condicional:** si la cuenta de la demo tiene su fila `proyecto_miembros.rol = 'supervisor'` en el proyecto que se va a mostrar, funciona. **Verificalo antes de la demo** — es el único hallazgo de esta lista que depende del estado de la base, no del código.

---

# 🟡 VISIBLE PERO EVITABLE

## V-1 · Calendario → pestañas "Semana" y "Día" son un cartel
**Archivo:** `src/components/views/Calendario.tsx:328-330` (toggles) y `:478-486` (contenido)

**Qué se ve:** toggle de tres posiciones arriba a la derecha: Mes · Semana · Día.
**Qué pasa al usarlo:** el toggle cambia de estado (se ve seleccionado), y el calendario entero se reemplaza por texto gris centrado: *"Vista semanal: próximamente. Usá la vista Mes por ahora."* La vista Mes está completa y funciona bien.
**Evitable:** no tocar el toggle; quedarse en Mes (el default).

## V-2 · Configuración → tarjeta "Método de pago" entera deshabilitada
**Archivo:** `src/components/views/Configuracion.tsx:389-436`

**Qué se ve:** formulario completo de tarjeta (número, expiración, CVV, nombre) más un botón azul "Pagar ahora".
**Qué pasa al usarlo:** los cuatro inputs tienen `disabled` (`:401, :408, :412, :417`), el botón "Pagar ahora" también (`:422`, `cursor: 'not-allowed'`, opacidad 0.5), y abajo dice *"Funcionalidad en desarrollo · Próximamente"*.
**Evitable:** está honestamente etiquetado y visiblemente inerte. Es la mitad derecha de la vista Configuración — si se muestra esa vista, se ve.

## V-3 · Configuración → "💳 Administrar suscripción"
**Archivo:** `src/components/views/Configuracion.tsx:379-383`
Botón activo y clickeable → toast *"Gestión de suscripción: próximamente."* No abre nada.

## V-4 · Configuración → botón ✏️ de cambiar foto de perfil
**Archivo:** `src/components/views/Configuracion.tsx:231-243`
Botón circular azul sobre el avatar → toast *"Subida de foto: próximamente."* No abre selector de archivos.

## V-5 · Configuración → "🗑 Eliminar cuenta permanentemente"
**Archivo:** `src/components/views/Configuracion.tsx:151-155`

```tsx
const ok = window.confirm('¿Estás seguro? Esta acción es irreversible.');
if (!ok) return;
mostrar('Funcionalidad en desarrollo.', 'info');
```

Muestra un `window.confirm` nativo del navegador con texto de acción irreversible, y tras aceptar informa que no está implementado. La cuenta no se borra. El texto rojo de abajo (*"Esta acción borrará todos los datos de forma irreversible"*) refuerza una expectativa que no se cumple.

## V-6 · Editor de fotos → "✂ Recortar (próximamente)"
**Archivo:** `src/components/plano/EditorFoto.tsx:658`
Botón `disabled` con la etiqueta "(próximamente)" incluida en el texto. Honesto y sin riesgo, pero visible dentro del editor de evidencia fotográfica — que sí es una funcionalidad de demo.

## V-7 · Ayuda → módulo "Vista 3D" marcado como Pronto
**Archivo:** `src/components/ayuda/PantallaAyuda.tsx:114-125`
En el rail izquierdo de la pantalla de Ayuda aparece "🧊 Vista 3D" con badge "Pronto"; al abrirlo, badge grande "Próximamente" y dos pasos en futuro (*"El visor 3D permitirá…"*, *"Funcionalidad en validación"*). Documenta una funcionalidad que no existe en la navegación (ver I-5).
**Evitable:** no abrir ese módulo de la Ayuda.

## V-8 · Contratistas → el directorio vive solo en `localStorage`
**Archivo:** `src/components/views/Contratistas.tsx:9, 20-27, 86-93`

**Qué se ve:** input "Nombre del nuevo contratista..." + botón "+ Agregar contratista". Funciona: el contratista aparece de inmediato en la grilla de cards.
**Qué pasa realmente:** se guarda en `localStorage['plan_ots_contratistas']`, nunca en Supabase. Consecuencias: no se sincroniza entre dispositivos, se pierde al limpiar el navegador, y no aparece si la demo se hace desde otra máquina o en ventana privada. Tampoco hay forma de borrar un contratista del directorio una vez agregado — no existe botón de eliminar.
**Evitable:** agregar los contratistas de demostración en el mismo navegador con el que se va a presentar, con antelación.

---

# ⚪ INVISIBLE (deuda técnica)

## I-1 · 9 archivos `.bak` versionados dentro de `src/`
```
src\App.tsx.bak
src\components\informes\ModalInformeOT.tsx.bak
src\components\layout\Sidebar.tsx.bak
src\components\plano\ComparadorVersiones.tsx.bak
src\components\plano\PanelOT.tsx.bak
src\components\plano\VistaPlano.tsx.bak
src\components\proyecto\SelectorProyectos.module.css.bak
src\components\proyecto\SelectorProyectos.tsx.bak
src\components\views\Dashboard.tsx.bak
```
No los compila Vite (extensión desconocida), así que no afectan el bundle. Sí generan ruido en búsquedas — el barrido de este informe tuvo que excluirlos explícitamente para no reportar hallazgos duplicados de código viejo. La convención de `CLAUDE.md` los produce a propósito ("crear copia .bak antes de editar"), pero conviene que no queden versionados.

## I-2 · `src/components/dashboard/Dashboard.tsx` — componente huérfano
Nunca se importa desde ningún archivo. El Dashboard real es `src/components/views/Dashboard.tsx` (`App.tsx:13`). Son dos implementaciones distintas del mismo panel; solo una está viva. (`src/components/dashboard/ModalConfigWidgets.tsx`, en la misma carpeta, sí se usa desde `views/Dashboard.tsx:13`.)

## I-3 · `src/components/ui/CalendarPicker.tsx` — componente huérfano
Definido y exportado, nunca importado. Ningún selector de fecha de la app lo usa.

## I-4 · `src/components/proyecto/PlanoThumb.tsx` — componente huérfano
Definido y exportado, nunca importado. `SelectorProyectos` genera sus miniaturas por otra vía (`pdfThumbnailService`).

## I-5 · Vista 3D completa, inalcanzable desde la navegación
**Archivo:** `src/App.tsx:179`

```tsx
case '3d-test' as Vista: return <VisorPlano3D />;
```

`'3d-test'` **no existe** en la unión `Vista` (`Sidebar.tsx:6-16`) — de ahí el `as Vista` que fuerza el cast — y no hay ningún ítem de sidebar que lo dispare. Es una rama del `switch` a la que no se puede llegar. Con ella quedan muertos tres componentes y todo `three@0.184.0`:
- `src/components/plano3d/VisorPlano3D.tsx`
- `src/components/plano3d/FpsCounter.tsx`
- `src/components/plano3d/PanelCapas3D.tsx`

Además `VisorPlano3D.tsx:31-40` define `DUMMY_OT` (OT-3D-DEMO / "Técnico Demo") que se renderiza en el panel de detalle (`:283-305`) — datos falsos hardcodeados, pero irrelevantes mientras la vista sea inalcanzable.
**Riesgo real:** `three` entra igual al bundle de producción y contribuye al chunk de 2,17 MB que rompe el build (ver `01_BASELINE.md`, punto 5).

## I-6 · `console.log` de debug con payloads completos en el store
**Archivo:** `src/stores/ordenesStore.ts:477-480`

```tsx
console.log('[DEBUG actualizarOrden] id:', id);
console.log('[DEBUG actualizarOrden] supabasePatch enviado:', JSON.stringify(supabasePatch, null, 2));
console.log('[DEBUG actualizarOrden] data recibido:', JSON.stringify(data, null, 2));
console.log('[DEBUG actualizarOrden] error recibido:', error);
```

Se ejecutan en cada guardado de OT, también en producción. Vuelcan el patch y la respuesta completos a la consola. Invisible salvo que se abra devtools durante la demo. `ordenesStore.ts` está en la lista de PROHIBIDOS de `CLAUDE.md` — no tocar sin autorización explícita.

## I-7 · Errores de guardado silenciados hacia la UI
- `src/services/editorFotoService.ts:37` — `console.warn('cargarEdicionFoto:', error.message)` y sigue: si falla la carga de una edición de foto, el editor abre sin las anotaciones previas y no avisa.
- `src/services/versionesService.ts:189` — dentro de `restaurarVersion`, cada OT que falla se `console.warn`ea individualmente; la función igual reporta éxito global, así que una restauración parcial se presenta como completa.

## I-8 · Manejo de error correcto pero no uniforme entre servicios
`iaService.ts:40-43, 83, 93` degrada a string vacío por diseño explícito y documentado ("No-blocking: si falla, retorna string vacío sin romper el flujo"), y `CampoVideo.tsx:96-97` sube el video sin comprimir si FFmpeg no está disponible. Ambos son decisiones correctas, no defectos — se registran acá solo porque el barrido de "errores silenciados" los detecta y conviene dejar constancia de que fueron revisados.

## I-9 · No hay bloques grandes de código comentado
Se buscaron secuencias de ≥12 líneas de comentario consecutivas. Los tres únicos resultados son cabeceras de documentación legítimas, no código muerto:
`ModalInformeOT.tsx:1-23`, `ModalFotoDetalle.tsx:1-16`, `useAccionesProyecto.tsx:1-13`.

---

# Apéndice — qué se verificó y salió limpio

- **`<button>` sin `onClick`:** barrido automático sobre los 46 `.tsx` (excluyendo `.bak`). Únicos resultados reales: `Configuracion.tsx:596` (dead — B-6) y dos botones intencionalmente `disabled` (`EditorFoto.tsx:658` — V-6, `Configuracion.tsx:420` — V-2).
- **`catch {}` vacíos:** ninguno. Todos los `catch` de `src/` o bien loguean, o bien devuelven un fallback explícito (`catch { return []; }` en lecturas de `localStorage`).
- **`onClick={() => {}}` / `alert(...)` como handler:** ninguno. Los `alert()` que existen (`Dashboard.tsx:355`, `otprojService.ts:138`, `reportService.ts:159`, `EditorFoto.tsx:467`, `VistaPlano.tsx:346`) son mensajes de error legítimos, no stubs.
- **Navegación:** los 10 ítems del Sidebar (`dashboard`, `proyectos`, `responsables`, `contratistas`, `gantt`, `calendario`, `ayuda`, `configuracion`, más `plano`/`grilla` vía proyecto) resuelven todos a una vista real en `App.tsx:144-180`. La única ruta rota es `'3d-test'`, que no está en el sidebar (I-5).
- **Vistas completas y funcionales, sin stubs:** `Gantt.tsx` (15 handlers, todos reales, incluidos export CSV y PDF), `views/Dashboard.tsx` (export CSV/HTML/PDF + panel de widgets), `Responsables.tsx`, `VistaGrilla.tsx` salvo las dos acciones de B-1/B-2, y el flujo de informes de `PanelOT` (`reportService.informeDisponible` gobierna correctamente los estados Disponible / No disponible).
