# Interfaz compartida de tablet — 23/09/2026

Lote C de `AUDITORIA_TABLET_2026-09-22.md`.

- OT: formulario en dos columnas adaptables, descripción completa, metadatos compactos y controles principales de 44 px o más.
- Conversación: columna reservada en horizontal y subvista con regreso en ancho reducido; Guardar sigue accesible. Enviar es explícito, Enter escribe otra línea y Ctrl+Enter envía.
- Fotos: una sola grilla por fases y filtros, sin el duplicado Agenda/Galería ni el gran estado verde; editor sin la acción de recorte deshabilitada.
- Informes: filas compactas con Generar ajustado y motivo visible cuando el estado de la OT impide generarlos.
- Cambio de estado y nuevo proyecto: diálogo claro; proyecto sin teclado automático en dispositivos de puntero táctil y con cuerpo adaptable a la altura visible.
- Se retiró el tema Vidrio y su preferencia persistida.

Verificación: `npx tsc -p tsconfig.app.json --noEmit`, `npm run build`, `git diff --check` y recorrido visual local del formulario, conversación (1600 y 820 px), fotos, informes y diálogo de estado. Se comprobó que el borrador de comentario y el foco de retorno sobreviven al cierre de la subvista. Se canceló el cambio de estado de prueba y se limpió el borrador; no se modificaron datos. Falta la comprobación de teclado real y orientación en la tablet física; la emulación de viewport no sustituye esa prueba.
