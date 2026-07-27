# 01 — BASELINE (auditoría en modo solo lectura)

**Fecha de ejecución:** 2026-07-26
**Rama:** `master`
**HEAD:** `e4897e8` — *pre-auditoria-demo: baseline antes del barrido*
**Modo:** solo lectura — no se modificó ningún archivo de código fuente. El único efecto secundario fue la regeneración de `dist/` y `tsconfig.*.tsbuildinfo` por `npm run build`.

---

## 1. `git log --oneline -20`

```
e4897e8 pre-auditoria-demo: baseline antes del barrido
44ad59e S36-E: ModalDetalleOT timezone fix + hora inicio/fin en Gantt detail
3c03a44 S36-D: notificaciones filtradas — ignora creacion OT + emojis estado
a50cddb S36-B/C: descripcion foto unificada (EditorFoto lee/guarda fotos.descripcion)
5490934 S36-A: cancelar OT nueva + borrar solo supervisores + audit log ordenes_eliminadas
8ff4f86 S35: sidebar #3B599B + accent #3B599B en 14 CSS + thumbnail gradient ajustado
c054f11 S35: accent color #2563EB → #3B599B en toda la app (14 archivos CSS)
4f9f00e S35: ModalVersiones + restaurarVersion + v-numbers + preseleccion comparador
4d53521 S35-A/B: ModalVersiones + restaurarVersion + prefetch sin flash
8e2f518 pre-S35A: checkpoint before ModalVersiones
2d0c26c S34: IA foto description modal + PanelOT compact UI + light theme modal
b2ae876 S33-B: PanelOT cleanup — remove dead visor code (abrirVisor, todasLasFotosParaVisor, setVisorIndex, setVisorFotos, indexOffset)
c003603 S33-A: descripcion_observacion en informes — generarGridFotos + ModalInformeOT mapeos
4219f98 S32-A: Editor de Evidencia Fotográfica — anotaciones vectoriales, burn-in a Storage, zoom sin lag, tema claro
365b344 S32-A: Editor de Evidencia Fotográfica — anotaciones vectoriales en fotos
2219a8d S31-C: Gantt con horas proporcionales + fix timezone UTC
79650c2 S31-B: Comentarios históricos en OTs — chat en PanelOT con Realtime
72c4521 S31-A: Cards 4 columnas + eliminar Dashboard/Salir del header
8112366 S30-B: Dashboard configurable — widgets toggle + reorden + persistencia Supabase
747c6c1 S30-A: Sistema de notificaciones Realtime (campanita + panel)
```

### Complemento — `git log -8 --date=iso --pretty=format:"%h|%ad|%an|%s"`

```
e4897e8|2026-07-26 20:16:15 -0300|Guarani3D|pre-auditoria-demo: baseline antes del barrido
44ad59e|2026-05-28 17:54:44 -0300|Guarani3D|S36-E: ModalDetalleOT timezone fix + hora inicio/fin en Gantt detail
3c03a44|2026-05-28 17:46:38 -0300|Guarani3D|S36-D: notificaciones filtradas — ignora creacion OT + emojis estado
a50cddb|2026-05-28 17:37:18 -0300|Guarani3D|S36-B/C: descripcion foto unificada (EditorFoto lee/guarda fotos.descripcion)
5490934|2026-05-28 16:47:59 -0300|Guarani3D|S36-A: cancelar OT nueva + borrar solo supervisores + audit log ordenes_eliminadas
8ff4f86|2026-05-27 00:19:05 -0300|Guarani3D|S35: sidebar #3B599B + accent #3B599B en 14 CSS + thumbnail gradient ajustado
c054f11|2026-05-27 00:06:31 -0300|Guarani3D|S35: accent color #2563EB → #3B599B en toda la app (14 archivos CSS)
4f9f00e|2026-05-26 23:37:11 -0300|Guarani3D|S35: ModalVersiones + restaurarVersion + v-numbers + preseleccion comparador
```

---

## 2. `git status`

```
On branch master
Changes not staged for commit:
  (use "git add <file>..." to update what will be committed)
  (use "git restore <file>..." to discard changes in working directory)
	modified:   CLAUDE.md

no changes added to commit (use "git add" and/or "git commit -a")
```

### Complemento

```
$ git remote -v
(sin salida — no hay remotos configurados)

$ git stash list
(sin salida — no hay stashes)

$ git check-ignore -v .env.local
.gitignore:13:*.local	.env.local
```

---

## 3. `git branch -a`

```
* master
```

Una sola rama local, sin ramas remotas ni `main`.

---

## 4. `npx tsc -p tsconfig.app.json --noEmit`

```
EXITCODE=0
```

Sin salida de diagnóstico. **0 errores de TypeScript.**

---

## 5. `npm run build` — **FALLA** (exit code 1)

```
> plan-ots@0.0.0 build
> tsc -b && vite build

vite v8.0.11 building client environment for production...
transforming...✓ 208 modules transformed.
rendering chunks...
computing gzip size...
dist/registerSW.js                  0.13 kB
dist/index.html                     0.70 kB │ gzip:   0.39 kB
dist/assets/worker-CyhFgHU6.js      2.45 kB
dist/assets/index-BAv1kp13.css    150.78 kB │ gzip:  29.08 kB
dist/assets/chunk-62oNxeRG.js       1.08 kB │ gzip:   0.62 kB
dist/assets/esm-Dnrje8Sg.js         1.47 kB │ gzip:   0.77 kB
dist/assets/esm-CkwuUy9K.js         3.03 kB │ gzip:   1.21 kB
dist/assets/index-BgSmii6h.js   2,168.97 kB │ gzip: 571.88 kB

[plugin builtin:vite-reporter]
(!) Some chunks are larger than 500 kB after minification. Consider:
- Using dynamic import() to code-split the application
- Use build.rolldownOptions.output.codeSplitting to improve chunking: https://rolldown.rs/reference/OutputOptions.codeSplitting
- Adjust chunk size limit for this warning via build.chunkSizeWarningLimit.

[EVAL] Warning: Use of direct `eval` function is strongly discouraged as it poses security risks and may cause issues with minification.
      ╭─[ node_modules/pdfjs-dist/build/pdf.js:1982:24 ]
 1982 │         const worker = eval("require")(this.workerSrc);
      │                        ──┬─
      │                          ╰─── Use of direct `eval` here.
      │
      │ Help: Consider using indirect eval.
──────╯

[INEFFECTIVE_DYNAMIC_IMPORT] Warning: src/stores/proyectosStore.ts is dynamically imported by src/stores/ordenesStore.ts but also statically imported by src/App.tsx, src/components/informes/InformePanel.tsx, src/components/plano/PanelOT.tsx, src/components/plano/VistaPlano.tsx, src/components/proyecto/ModalNuevoProyecto.tsx, ..., dynamic import will not move module into another chunk.

[INEFFECTIVE_DYNAMIC_IMPORT] Warning: node_modules/pdfjs-dist/build/pdf.js is dynamically imported by src/components/plano/ComparadorVersiones.tsx but also statically imported by src/components/plano/VistaPlano.tsx, src/services/pdfThumbnailService.ts, dynamic import will not move module into another chunk.

✓ built in 826ms
error during build:
Error:
  Configure "workbox.maximumFileSizeToCacheInBytes" to change the limit: the default value is 2 MiB.
  Check https://vite-pwa-org.netlify.app/guide/faq.html#missing-assets-from-sw-precache-manifest for more information.
  Assets exceeding the limit:
  - assets/index-BgSmii6h.js is 2.17 MB, and won't be precached.

    at logWorkboxResult (…/node_modules/vite-plugin-pwa/dist/chunk-G4TAN34B.js:44:13)
    at generateServiceWorker (…/node_modules/vite-plugin-pwa/dist/index.js:209:3)
    at async _generateSW (…/node_modules/vite-plugin-pwa/dist/index.js:234:5)
    at async PluginContextImpl.handler (…/node_modules/vite-plugin-pwa/dist/index.js:427:13)
    at async plugin (…/node_modules/rolldown/dist/shared/bindingify-input-options-DQ2Xw70P.mjs:1390:4)
    at async plugin.<computed> (…/node_modules/rolldown/dist/shared/bindingify-input-options-DQ2Xw70P.mjs:1612:12) {
  code: 'PLUGIN_ERROR',
  plugin: 'vite-plugin-pwa:build',
  hook: 'closeBundle'
}
EXITCODE=1
```

**Punto exacto de falla:** el bundle compila correctamente (`✓ built in 826ms`); la falla ocurre después, en el hook `closeBundle` de `vite-plugin-pwa:build`, al generar el service worker. `assets/index-BgSmii6h.js` pesa 2,17 MB y supera el límite por defecto de Workbox (2 MiB) para precaching.

---

## 6. `npm ls --depth=0`

```
plan-ots@0.0.0 C:\Users\Usuario\Desktop\Grupo Diaz Villaverde\01. Díaz Villaverde\03. Apps\05. Plan-OTs\plan-ots
├── @eslint/js@10.0.1
├── @ffmpeg/ffmpeg@0.12.15
├── @ffmpeg/util@0.12.2
├── @supabase/supabase-js@2.105.4
├── @types/node@24.12.3
├── @types/papaparse@5.5.2
├── @types/react-dom@19.2.3
├── @types/react@19.2.14
├── @types/three@0.184.1
├── @types/uuid@10.0.0
├── @vitejs/plugin-react@6.0.1
├── dexie@4.4.2
├── eslint-plugin-react-hooks@7.1.1
├── eslint-plugin-react-refresh@0.5.2
├── eslint@10.3.0
├── globals@17.6.0
├── jszip@3.10.1
├── papaparse@5.5.3
├── pdfjs-dist@3.11.174
├── react-dom@19.2.6
├── react@19.2.6
├── signature_pad@5.1.3
├── three@0.184.0
├── typescript-eslint@8.59.2
├── typescript@6.0.3
├── uuid@14.0.0
├── vite-plugin-pwa@1.3.0
├── vite@8.0.11
├── workbox-window@7.4.1
└── zustand@5.0.13
```

Sin errores de árbol (`UNMET DEPENDENCY` / `invalid`). Todas las dependencias declaradas están instaladas y dentro del rango semver de `package.json`.

---

## 7. `package.json` (scripts y dependencies)

```json
{
  "name": "plan-ots",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "lint": "eslint .",
    "preview": "vite preview"
  },
  "dependencies": {
    "@ffmpeg/ffmpeg": "^0.12.15",
    "@ffmpeg/util": "^0.12.2",
    "@supabase/supabase-js": "^2.105.4",
    "dexie": "^4.4.2",
    "jszip": "^3.10.1",
    "papaparse": "^5.5.3",
    "pdfjs-dist": "^3.11.174",
    "react": "^19.2.5",
    "react-dom": "^19.2.5",
    "signature_pad": "^5.1.3",
    "three": "^0.184.0",
    "uuid": "^14.0.0",
    "zustand": "^5.0.13"
  },
  "devDependencies": {
    "@eslint/js": "^10.0.1",
    "@types/node": "^24.12.2",
    "@types/papaparse": "^5.5.2",
    "@types/react": "^19.2.14",
    "@types/react-dom": "^19.2.3",
    "@types/three": "^0.184.1",
    "@types/uuid": "^10.0.0",
    "@vitejs/plugin-react": "^6.0.1",
    "eslint": "^10.2.1",
    "eslint-plugin-react-hooks": "^7.1.1",
    "eslint-plugin-react-refresh": "^0.5.2",
    "globals": "^17.5.0",
    "typescript": "~6.0.2",
    "typescript-eslint": "^8.58.2",
    "vite": "^8.0.10",
    "vite-plugin-pwa": "^1.3.0",
    "workbox-window": "^7.4.1"
  }
}
```

No hay runner de tests configurado.

---

## 8. `vite.config.ts`

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // manifest.json lives in /public — we don't duplicate it here
      manifest: false,
      includeAssets: ['icon-192.png', 'icon-512.png', 'favicon.ico'],
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,woff2,ico}'],
        // Don't precache pdf.worker (too large, loaded on demand)
        globIgnores: ['**/pdf.worker*'],
        runtimeCaching: [
          {
            // Supabase Storage: planos y fotos → cache-first (archivos no cambian una vez subidos)
            urlPattern: /^https:\/\/iqgbyqyoovzvhhdjawnt\.supabase\.co\/storage\/.*/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'supabase-storage',
              expiration: {
                maxEntries: 200,
                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 días
              },
            },
          },
          {
            // Supabase REST API → network-first con fallback offline
            urlPattern: /^https:\/\/iqgbyqyoovzvhhdjawnt\.supabase\.co\/rest\/.*/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'supabase-api',
              networkTimeoutSeconds: 5,
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24, // 24 horas
              },
            },
          },
          {
            // CDN de pdf.js worker → cache-first (versión fija)
            urlPattern: /cdnjs\.cloudflare\.com\/ajax\/libs\/pdf\.js/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'pdfjs-cdn',
              expiration: { maxEntries: 5, maxAgeSeconds: 60 * 60 * 24 * 90 },
            },
          },
        ],
      },
    }),
  ],
});
```

Observación: no hay `workbox.maximumFileSizeToCacheInBytes` configurado — de ahí la falla del punto 5.

---

## 9. Archivos `.env*` en la raíz — solo nombres de variables

```
$ Get-ChildItem -Force -Filter ".env*" | Select-Object -ExpandProperty Name
.env.example
.env.local
```

| Archivo | Tamaño | Variables definidas (solo nombres, valores omitidos) |
|---|---|---|
| `.env.example` | 0 bytes | *(archivo vacío — no declara ninguna variable)* |
| `.env.local` | — | `VITE_SUPABASE_URL=`<br>`VITE_SUPABASE_ANON_KEY=`<br>`VITE_ANTHROPIC_API_KEY=` |

> Los valores no fueron leídos ni registrados en ningún momento: se extrajeron únicamente los nombres con `rg -o "^\s*[A-Za-z_][A-Za-z0-9_]*="`.

### Variables que el código consume (`rg -o "import\.meta\.env\.[A-Z_]+" src`)

```
src\db\supabase.ts:3:import.meta.env.VITE_SUPABASE_URL
src\db\supabase.ts:4:import.meta.env.VITE_SUPABASE_ANON_KEY
src\services\iaService.ts:38:import.meta.env.VITE_ANTHROPIC_API_KEY
```

---

# Respuestas

## ¿Cuál fue el último sprint realmente commiteado y en qué fecha?

**S36**, cerrado con `44ad59e` — *"S36-E: ModalDetalleOT timezone fix + hora inicio/fin en Gantt detail"* — el **28 de mayo de 2026, 17:54:44 -0300**.

El sprint se commiteó en cuatro tandas ese mismo día (`5490934` S36-A 16:47 → `44ad59e` S36-E 17:54). El commit posterior, `e4897e8` (2026-07-26 20:16), no es un sprint: es el checkpoint de baseline de esta auditoría.

Hay un hueco de ~2 meses entre el último trabajo de sprint (2026-05-28) y hoy (2026-07-26).

## ¿Hay trabajo sin commitear o ramas sin mergear?

**Trabajo sin commitear:** sí, uno solo — `CLAUDE.md` modificado y no staged. Es el reemplazo de reglas hecho en esta misma sesión, no trabajo de sprint pendiente. Nada más en el working tree; no hay archivos sin trackear.

**Ramas sin mergear:** no. `git branch -a` devuelve únicamente `* master`. No hay ramas remotas, y `git remote -v` no devuelve nada: **el repositorio no tiene ningún remoto configurado**, o sea que no existe backup fuera de este disco.

**Stashes:** ninguno.

## ¿Cuántos errores TS hay y en qué archivos?

**Cero.** `npx tsc -p tsconfig.app.json --noEmit` terminó con exit code 0 y sin salida.

⚠️ Esto contradice la regla escrita en `CLAUDE.md`: *"SelectorProyectos.tsx tiene 2 errores TS6133 preexistentes: ignorar"*. Esos errores ya no existen — la regla está desactualizada y debería eliminarse para no enmascarar errores TS6133 reales que aparezcan en ese archivo más adelante.

## ¿El build de producción pasa?

**No. Falla con exit code 1.**

`tsc -b` pasa y el bundle de Vite se genera completo (`✓ built in 826ms`). La falla ocurre después, en el plugin PWA:

```
error during build:
Error:
  Configure "workbox.maximumFileSizeToCacheInBytes" to change the limit: the default value is 2 MiB.
  Assets exceeding the limit:
  - assets/index-BgSmii6h.js is 2.17 MB, and won't be precached.
  code: 'PLUGIN_ERROR',
  plugin: 'vite-plugin-pwa:build',
  hook: 'closeBundle'
```

**Causa:** el chunk principal pesa 2,17 MB (571,88 kB gzip) y supera el límite de precache de Workbox (2 MiB). `vite.config.ts` no define `workbox.maximumFileSizeToCacheInBytes`.

**Implicancia:** no hay build desplegable hoy. Además el bundle es monolítico — `three`, `pdfjs-dist`, `@ffmpeg/ffmpeg` y `jszip` entran todos en el chunk principal (los dos warnings `INEFFECTIVE_DYNAMIC_IMPORT` muestran que los `import()` dinámicos de `pdfjs-dist` y `proyectosStore` quedan anulados porque esos módulos también se importan estáticamente en otro lado).

Dos caminos, ninguno aplicado en esta sesión (modo solo lectura):
- **Rápido:** subir `maximumFileSizeToCacheInBytes` a ~3 MiB → desbloquea el build, pero deja un precache de 2,17 MB que el usuario descarga en la primera visita.
- **De fondo:** code-splitting real (romper los imports estáticos duplicados de `pdfjs-dist` y `three`) → bundle menor y precache sano.

## ¿Qué variables de entorno espera la app y cuáles faltan?

| Variable | Consumida en | ¿Está en `.env.local`? | Comportamiento si falta |
|---|---|---|---|
| `VITE_SUPABASE_URL` | `src/db/supabase.ts:3` | ✅ Sí | La app tira error al arrancar |
| `VITE_SUPABASE_ANON_KEY` | `src/db/supabase.ts:4` | ✅ Sí | La app tira error al arrancar |
| `VITE_ANTHROPIC_API_KEY` | `src/services/iaService.ts:38` | ✅ Sí | Degrada sin romper: `iaService` loguea *"API key no configurada — modo manual"* y devuelve `''` |

**No falta ninguna variable en runtime.** Las tres que el código consume están declaradas en `.env.local`, que está correctamente ignorado por git (`.gitignore:13:*.local`).

Dos hallazgos igual:

1. **`.env.example` está vacío (0 bytes).** No documenta ninguna de las tres variables, así que un clon nuevo del repo no tiene forma de saber qué configurar. Peor todavía sin remoto configurado: la única copia de los nombres de variables vive en un archivo gitignoreado de este disco.

2. **`VITE_ANTHROPIC_API_KEY` es una key de Anthropic expuesta en el cliente.** Todo lo que tenga prefijo `VITE_` se inlinea en el bundle JS que se sirve al navegador, y `iaService.ts` llama a `api.anthropic.com` directamente desde el front. Cualquiera que abra devtools en la app desplegada puede extraer esa key y gastarla contra tu cuenta. La solución correcta es mover la llamada a una Edge Function de Supabase que guarde la key del lado servidor. La key actual debería considerarse comprometida y rotarse si la app ya estuvo desplegada.
