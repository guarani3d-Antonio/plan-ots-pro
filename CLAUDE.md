# Plan-OTs — Reglas de trabajo

## Archivos PROHIBIDOS (no modificar nunca sin autorización explícita del usuario en el mensaje actual)
- src/services/reportService.ts
- src/stores/ordenesStore.ts
- src/sync/SyncManager.ts
- src/services/fotosService.ts
- src/components/plano3d/** (toda la carpeta)

## Archivos SENSIBLES (crear copia .bak antes de editar)
- src/components/plano/PanelOT.tsx
- src/components/plano/VistaPlano.tsx
- src/components/views/Gantt.tsx
- src/components/layout/Sidebar.tsx
- src/App.tsx

## Reglas técnicas
- Fuente de verdad de errores TS: `npx tsc -p tsconfig.app.json --noEmit`
- SelectorProyectos.tsx tiene 2 errores TS6133 preexistentes: ignorar
- Import de Supabase: '../db/supabase' desde services, '../../db/supabase' desde components. NUNCA 'src/lib/supabase'
- Fechas YYYY-MM-DD: siempre parsear con `new Date(iso + 'T00:00:00')` (Paraguay UTC-4)
- pos_x / pos_y son fracciones 0–1. Multiplicar por 100 para CSS %
- Estados válidos: 'Pendiente' | 'En proceso' | 'Cerrada' | 'No aplica'
- Tema UI: LIGHT. Usar var(--bg-surface), var(--border-default), var(--text-primary). Nunca hardcodear colores
- React StrictMode está desactivado a propósito (incompatible con pdf.js). No reactivarlo
- Terminal Windows PowerShell: comandos separados, nunca encadenar con &&
- Para parchear archivos grandes con template literals TS: usar script Python (open/read/replace/write), NO heredoc de bash

## Flujo obligatorio
- Commit de baseline antes de cualquier cambio de código
- Entregar archivos completos para reemplazo, no parches parciales
- Verificar con `npx tsc -p tsconfig.app.json --noEmit` después de cada cambio
