# Día 10 — revisión final y candidata local

Base de trabajo: `f974cbc`. Decisión actual: **NO-GO para publicación/piloto de campo**. Los controles automatizados pasan, pero falta confirmar la revocación de credenciales previamente expuestas y terminar la validación física/publicada. Esto no es un bloqueo de la programación local.

## Correcciones

- Los cuatro puntos que abren PDFs ahora pasan `isEvalSupported: false`. Es la mitigación oficial de [Mozilla para CVE-2024-4367](https://github.com/mozilla/pdf.js/security/advisories/GHSA-wgrm-67xf-hhpq). PDF.js 3.11.174 permanece instalado: se mitigó esta vulnerabilidad concreta, no se declaró segura toda la dependencia. Actualizarla sigue siendo un trabajo separado.
- Cabeceras Cloudflare preparadas en `public/_headers`: nosniff, rechazo de marcos externos, política de referente y permiso de cámara limitado al propio sitio. El documento principal y los scripts de actualización piden revalidación. Estas cabeceras aún no están publicadas ni verificadas por HTTPS.
- Candidata generada desde `dist`, sin incluir fuentes, entornos ni respaldos. Escaneo de secretos, hash del ZIP y relectura de cada entrada aprobados. Artefacto: `.backups.local/2026-09-21-dia10/plan-ots-candidate.zip`; inventario en `candidate.json`.

## Resultados repetidos sobre esta revisión

| Área | Resultado | Evidencia |
|---|---|---|
| PostgreSQL local: Storage, sesión/costos, OT, restauración | 90/90 | `local-regression.json` y `test-*-sql.json` |
| Cliente: archivos, sesión, OT, informes, modo manual de IA | 48/48 | `local-regression.json` y `test-*-client.json` |
| Supabase real: permisos/revocación, conflictos, restore y fixtures | 35/35 | `remote-regression.json` |
| Storage real: once cuentas, ocho binarios, acceso anónimo y firmas | 13/13 | `storage-rest.json` |
| Recuperación local | 370 filas/15 tablas, 21 costos preservados; 180 binarios comprobados por SHA-256 | `test-day5-recovery.json`, `test-day6-recovery.json` |
| Mitigación PDF | 4/4 llamadas verificadas mediante AST | `pdf-security.json` |
| Navegador local tras el cambio | Plano Kalo y sus 15 OTs visibles; miniaturas PDF visibles al entrar | `browser-verification.json` |
| TypeScript, lint de scripts nuevos y build PWA | Aprobados; 16 entradas precache | `candidate.json` |

Las suites remotas usan clave pública y cuentas ficticias. Revocaciones de prueba restauradas, OTs/versiones temporales retiradas y cuatro fixtures conservados. No se utilizó una clave administrativa. Las evidencias de días anteriores se preservan byte por byte; las ejecuciones nuevas se guardan en este directorio. El ensayo de recuperación no es una restauración completa de Auth/Storage en un proyecto Supabase nuevo.

## Condiciones pendientes para GO

1. Confirmar revocación/rotación de la clave administrativa Supabase expuesta durante el día 4 y de la clave Anthropic identificada durante el día 9. Sacar secretos de una compilación no invalida las copias previas. La rotación de claves legacy de Supabase debe coordinarse con las claves dependientes y sesiones; no se ejecutó a ciegas.
2. Publicar la candidata controladamente en Cloudflare, verificar cabeceras y que se sirve exactamente esta versión. Registrar identificador del despliegue y punto de retorno compatible. No volver automáticamente al frontend previo al endurecimiento, pues contiene comportamientos inseguros.
3. En la Samsung real: cámara trasera, orientación, suspensión y reapertura, además de comprobar actualización de una instalación PWA anterior. La prueba del día 9 fue un perfil de pantalla en escritorio y un cambio de pestaña, no suspensión del sistema operativo ni sensor físico.
4. Completar el recorrido acompañado en dos dispositivos y comprobar el HTML descargado fuera de sesión. Las pruebas REST de concurrencia y la inspección del HTML ya realizadas no sustituyen estos pasos de campo.

Hasta cerrar esas condiciones no se ofrece GO comercial ni offline completo. Los avisos conocidos de bundle, importaciones y PDF.js se mantienen documentados. La limpieza de cachés HTTP privadas se ejecutó en un entorno simulado del service worker; la actualización real de una PWA instalada sigue pendiente.

## Recuperación de este lote

Los cuatro archivos previos y sus hashes están en `.backups.local/2026-09-21-dia10/`. El checkpoint de partida permite recuperar código, pero revertir la mitigación PDF volvería a abrir la vulnerabilidad. Para una incidencia posterior, preferir una corrección sobre la candidata o retirar temporalmente el acceso; no aplicar un rollback de seguridad sin revisar su efecto. No se cambiaron migraciones ni esquema remoto en este bloque.

## Siguiente bloque solicitado: fotos del Panel OT

Implementar con Sol alto una ventana dedicada, amplia y adaptable a tablet. Encabezado con código de OT, pestañas Antes/Durante/Después con contadores, acciones Cámara y Galería visibles, cuadrícula uniforme de miniaturas y vista ampliada con descripción. Carga/progreso/error en el mismo espacio, sin botones amontonados sobre la foto. En pantalla estrecha ocupará prácticamente toda la superficie; en escritorio tendrá ancho máximo y desplazamiento propio.

Debe conservar la OT en edición y el borrador al cerrar la ventana, mantener los permisos de lector, no permitir doble subida mientras procesa, y preservar las reglas de foto obligatoria/estado. El selector de archivos y la descripción manual seguirán funcionando. Validar teclado/Escape/foco, giro, fotos vacías/múltiples, error de subida y reapertura antes de considerarlo terminado. Este bloque no fue implementado dentro de la revisión de seguridad.
