# Día 10 — revisión final y candidata local

Base publicada: `32f07c4`. Decisión actual: **GO para piloto de campo conectado con cuentas ficticias**. No se declara todavía GO comercial ni offline completo: faltan la prueba física acompañada y cerrar la rotación de credenciales históricas antes de usar datos reales.

## Correcciones

- Los cuatro puntos que abren PDFs ahora pasan `isEvalSupported: false`. Es la mitigación oficial de [Mozilla para CVE-2024-4367](https://github.com/mozilla/pdf.js/security/advisories/GHSA-wgrm-67xf-hhpq). PDF.js 3.11.174 permanece instalado: se mitigó esta vulnerabilidad concreta, no se declaró segura toda la dependencia. Actualizarla sigue siendo un trabajo separado.
- Cabeceras Cloudflare publicadas y verificadas por HTTPS: nosniff, rechazo de marcos externos, política de referente y permiso de cámara limitado al propio sitio.
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
| Panel OT productivo | Espacio centrado y amplio, conversación plegable, agenda/galería, filtros y adaptación Samsung FE | inspección visual local y build publicado |

Las suites remotas usan clave pública y cuentas ficticias. Revocaciones de prueba restauradas, OTs/versiones temporales retiradas y cuatro fixtures conservados. No se utilizó una clave administrativa. Las evidencias de días anteriores se preservan byte por byte; las ejecuciones nuevas se guardan en este directorio. El ensayo de recuperación no es una restauración completa de Auth/Storage en un proyecto Supabase nuevo.

## Publicación verificada

- Producción: `https://plan-ots-pro.pages.dev`
- Cloudflare deployment: `a6b7daa2-0e94-4b9f-9616-f1c9520b1713`
- Fuente Git: `32f07c4` en `tablet-v1`
- Archivos comprobados en producción: `assets/index-BHWWvg9u.js` y `assets/index-C7bK6mSt.css`
- Respuesta HTTPS: 200; `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(self), microphone=(), geolocation=()`.

## Condiciones pendientes para GO comercial

1. Confirmar revocación/rotación de la clave administrativa Supabase expuesta durante el día 4 y de la clave Anthropic identificada durante el día 9. Sacar secretos de una compilación no invalida las copias previas. La rotación de claves legacy de Supabase debe coordinarse con las claves dependientes y sesiones; no se ejecutó a ciegas.
2. En la Samsung real: cámara trasera, orientación, suspensión y reapertura, además de comprobar actualización de una instalación PWA anterior. La prueba responsive fue un perfil de pantalla en escritorio, no suspensión del sistema operativo ni sensor físico.
3. Completar el recorrido acompañado en dos dispositivos y comprobar el HTML descargado fuera de sesión. Las pruebas REST de concurrencia y la inspección del HTML ya realizadas no sustituyen estos pasos de campo.

Hasta cerrar esas condiciones no se ofrece GO comercial ni offline completo. Los avisos conocidos de bundle, importaciones y PDF.js se mantienen documentados. La limpieza de cachés HTTP privadas se ejecutó en un entorno simulado del service worker; la actualización real de una PWA instalada sigue pendiente.

## Recuperación de este lote

Los cuatro archivos previos y sus hashes están en `.backups.local/2026-09-21-dia10/`. El checkpoint de partida permite recuperar código, pero revertir la mitigación PDF volvería a abrir la vulnerabilidad. Para una incidencia posterior, preferir una corrección sobre la candidata o retirar temporalmente el acceso; no aplicar un rollback de seguridad sin revisar su efecto. No se cambiaron migraciones ni esquema remoto en este bloque.

## Panel OT y fotos — terminado

El Panel OT ahora funciona como un espacio de trabajo centrado y amplio. La conversación puede ocultarse para liberar superficie y en tablet aparece como cajón. La pestaña Fotos ofrece contadores, filtros Antes/Durante/Después, vistas Agenda/Galería y miniaturas uniformes; conserva carga, progreso, error, cámara, selector de archivos, descripción y editor ampliado.

Se mantuvieron los permisos de lector, la protección contra doble subida y las reglas de foto obligatoria por estado. TypeScript, build PWA, regresión local y regresión remota pasaron. La prueba física de cámara, giro, suspensión y actualización de una PWA anterior queda como primer recorrido de campo.
