# Plan-OTs — Reglas de trabajo

## Autorización vigente y archivos críticos

El usuario autorizó expresamente el 20/09/2026 las correcciones del diagnóstico, incluidos los archivos críticos. Esa autorización persiste durante esta fase: no pedirla de nuevo solo por aparecer un archivo en esta lista. Trabajar por lotes pequeños, con respaldo verificado, punto de retorno Git y validación antes de entregar. No interpretar esta autorización como permiso para publicar secretos, ampliar accesos de terceros o borrar datos sin un plan.

Los siguientes archivos requieren especial revisión, pero pueden modificarse dentro del alcance autorizado:
- src/services/reportService.ts
- src/stores/ordenesStore.ts
- src/sync/SyncManager.ts
- src/services/fotosService.ts
- src/components/plano3d/** (toda la carpeta)

## Archivos SENSIBLES (incluir en respaldo del lote antes de editar)
- src/components/plano/PanelOT.tsx
- src/components/plano/VistaPlano.tsx
- src/components/views/Gantt.tsx
- src/components/layout/Sidebar.tsx
- src/App.tsx

## Reglas técnicas
- Fuente de verdad de errores TS: `npx tsc -p tsconfig.app.json --noEmit`
- El typecheck del baseline 4d1851e pasó. No ignorar errores nuevos como si fueran preexistentes; comparar con la evidencia de `docs/auditoria-2026-09-20`.
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
- Editar y entregar archivos completos en el repositorio; no dejar fragmentos pendientes de aplicación manual
- Verificar con `npx tsc -p tsconfig.app.json --noEmit` después de cada cambio
- Antes de cambios de servidor, conservar definición anterior y preparar reversión. Las migraciones se prueban con datos ficticios y deben mantener compatibilidad con el cliente existente cuando corresponda.
- El usuario declaró desechables los datos actuales y pidió dos empresas ficticias con dos obras cada una. El reset general será posterior; no adelantarlo ni presentar el campo textual cliente como aislamiento multitenant.
- Usar Sol para implementación acotada y comprobaciones rutinarias; reservar Astra para diseño complejo, seguridad, conflictos de sincronización y revisión de hitos. Es una preferencia de trabajo, no autorización para crear tareas nuevas ni cambiar modelos de otras tareas.
