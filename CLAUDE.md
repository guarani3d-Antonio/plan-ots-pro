# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — Vite dev server with HMR.
- `npm run build` — Type-check (`tsc -b`) then `vite build`. Build fails if TS errors exist; `noUnusedLocals` / `noUnusedParameters` are enforced (`tsconfig.app.json`).
- `npm run lint` — flat-config ESLint (`eslint.config.js`) over `**/*.{ts,tsx}` with `typescript-eslint`, `react-hooks`, and `react-refresh/vite`.
- `npm run preview` — Serve the production build locally (useful for testing PWA / service-worker behavior, which is disabled in dev).

There is no test runner configured.

`.env.local` must define `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` — `src/db/supabase.ts` throws on startup if either is missing.

## High-level architecture

Plan-OTs is an offline-first PWA (Spanish UI, `es-PY`) for managing visual work orders ("órdenes de trabajo" / OTs) placed as markers on architectural plans (image or PDF). React 19 + TypeScript + Vite, with `vite-plugin-pwa` registering a Workbox service worker.

### Data flow: Supabase ⇄ Zustand ⇄ Dexie

Three storage layers are kept in sync:

1. **Supabase (`src/db/supabase.ts`)** — system of record. Tables: `proyectos`, `ordenes`, `campos_definicion`, `fotos`. Storage buckets: `planos`, `fotos`. Auth via `supabase.auth`.
2. **Zustand stores (`src/stores/`)** — in-memory UI state. `authStore`, `proyectosStore`, `ordenesStore`. Components read from these via selectors.
3. **Dexie / IndexedDB (`src/db/dexie.ts`, `PlanOTsDB` v4)** — local cache for offline reads + a `syncQueue` table for offline mutations. Tables: `proyectos`, `ordenes`, `camposDefinicion`, `syncQueue`.

Write path in `ordenesStore` (`crearOrdenEnPosicion`, `moverOrden`, `actualizarOrden`, `eliminarOrden`) is consistent and worth preserving:
1. Optimistically update Zustand state.
2. Write to Dexie with `_synced: false`.
3. If `navigator.onLine`, attempt Supabase mutation; on success mark `_synced: true`, on failure enqueue into `syncQueue`.
4. If offline, skip the network call and enqueue directly.

`SyncManager.ts` (`iniciarSyncManager`, called from `App.tsx` once the user is authenticated) listens for `window.online` and drains `syncQueue` items (`CREATE_OT` / `UPDATE_OT` / `DELETE_OT`), discarding any item that fails `MAX_INTENTOS = 3` times. New mutation kinds must be added both to the `QueueItem` union and to `procesarItem`.

Realtime updates from other clients arrive via `useRealtimeOrdenes` (`src/hooks/`), which subscribes to `postgres_changes` on `ordenes` filtered by `proyecto_id` and feeds them into `ordenesStore.agregarOActualizarOrden` / `eliminarOrden`. Anything that mutates an `OrdenLocal` should keep the Dexie row, the store row, and the Supabase row aligned so realtime doesn't fight optimistic state.

### Domain shape

`OrdenLocal` (`src/types/orden.ts`) is the canonical in-app shape. It mirrors the Supabase `ordenes` row plus offline-only flags: `_synced`, `_last_fetched`, `fotos_pendientes_upload`, `conflict_flag`. `OrdenLocal.comentarios` ⇄ Supabase column `comentarios` (the Supabase column was historically called something else; mappers in `ordenesStore.ts` / `SyncManager.ts` are the source of truth — match their field lists when adding columns).

Custom per-project fields live in `campos_definicion` (typed via `TipoCampo` in `src/services/camposService.ts`) and are stored on each order as a free-form `campos: Record<string, unknown>` JSON column. `CampoRenderer` dispatches to the appropriate input for each type.

### View structure (`src/App.tsx`)

A tiny state machine, not a router:
- No user → `<AuthForm />`.
- No active project → `<SelectorProyectos />` or `<Dashboard />`.
- Active project + `vistaProyecto === 'plano'` → `<VistaPlano />` (pan/zoom canvas of the plano + markers).
- Active project + `vistaProyecto === 'grilla'` → `<VistaGrilla />` (table view).

Navigation goes through a `navigate(action)` helper that flashes a full-screen overlay (`position: fixed`, `z-index: 99999`) before swapping content, then fades it out after two `requestAnimationFrame`s. Use this helper for any top-level view change to avoid the white-flash it was added to mask.

### Plano rendering

`VistaPlano` handles both raster images (`<img>`) and PDFs (`pdfjs-dist`). The pdf.js worker is loaded from `cdnjs.cloudflare.com` (see `pdfjsLib.GlobalWorkerOptions.workerSrc`); the Workbox config in `vite.config.ts` cache-firsts that CDN URL and explicitly excludes `pdf.worker*` from precaching (it's too large). Pan/zoom state is kept in refs (`scRef`, `txRef`, `tyRef`) with a mirrored `transform` state for re-renders — touch this carefully.

`planoScanner.ts` post-processes uploaded plano files (resize + black/white-point levels) before they're uploaded to Storage.

### PWA / caching (`vite.config.ts`)

- `manifest.json` is served from `/public` (the plugin is told `manifest: false`).
- `registerType: 'autoUpdate'`.
- Runtime caching: `CacheFirst` for `https://<project>.supabase.co/storage/...` (planos/fotos are immutable once uploaded) and `NetworkFirst` (5s timeout) for `/rest/...` API calls. Changing the Supabase project URL requires updating both regexes.

### Other services worth knowing

- `csvService.ts` — Papaparse-based importer with legacy state/priority normalization (e.g. `'completada' → 'Cerrada'`, `'en progreso' → 'En proceso'`). Preserve these aliases when changing the importer.
- `otprojService.ts` — exports a project bundle as a `.otproj` ZIP (manifest + JSON, **URLs only — no embedded media**).
- `fotosService.ts` — uploads to the `fotos` Storage bucket under `${ordenId}/${categoria}/${timestamp}.${ext}` and registers a row in the `fotos` table. `categoria` is one of `ANTES | DURANTE | DESPUES | ADJUNTO`.
- `versionesService.ts` — point-in-time snapshots of all OTs for a project, used by `ComparadorVersiones`.

### Conventions

- Code and identifiers are in Spanish (`ordenes`, `proyectoActivo`, `cargarOrdenes`, etc.) — match that style in new code.
- Styling uses CSS Modules (`*.module.css`) co-located with components.
- `verbatimModuleSyntax` is on — use `import type` for type-only imports.
- Proyecto deletes are **soft deletes** (`deleted_at` timestamp); the list query filters with `.is('deleted_at', null)`.
