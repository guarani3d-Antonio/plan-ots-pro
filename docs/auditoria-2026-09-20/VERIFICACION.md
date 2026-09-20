# Evidencia y límites de la auditoría

Fecha: 20 de septiembre de 2026. Repositorio: `C:\Users\Usuario\Desktop\plan-ots`.
HEAD: `4d1851e1d4b00092ede9a9b4551b3ca84cabd5c4`. Existía `repomix.qwen.json` sin seguimiento antes de comenzar. No se modificó ese archivo ni código de producción, dependencias o base de datos.

## Comprobaciones ejecutadas

| Comprobación | Resultado | Evidencia |
|---|---|---|
| Acceso al repositorio y Git | Acceso real; remoto `origin` configurado | Inventario y HEAD anteriores |
| Inventario local | 206 archivos propios/históricos/configuración; 83 TS/TSX de `src`, 22.826 líneas contando separadores finales | [inventario.json](evidencias/inventario.json) |
| Entorno | Node 24.14.1; npm 11.11.0; paquetes ya instalados | Comandos locales |
| `node node_modules/typescript/bin/tsc -p tsconfig.app.json --noEmit` | Exit 0; sin diagnósticos | [typecheck.txt](evidencias/typecheck.txt) — vacío significa sin errores |
| ESLint del repositorio inicial | Exit 1: 57 errores, 16 advertencias, 86 archivos procesados | [eslint.json](evidencias/eslint.json) |
| `npm run build -- --outDir .audit-build-2026-09-20` | Exit 0; ejecutó `tsc -b` y Vite/PWA | [build.txt](evidencias/build.txt) |
| Bundle | Principal 2.189,62 kB / gzip 578,18 kB; precache 14 entradas, 2.339,10 KiB | Mismo log |
| Dependencias | Consulta actual al registry: 11 paquetes afectados, 1 crítico, 8 altos, 1 moderado, 1 bajo | [npm-audit-validado.json](evidencias/npm-audit-validado.json) |
| Reproducciones del código actual | 16 casos ejecutados; 15 caracterizan defectos/limitaciones y uno verifica una corrección de escape | [reproducciones.json](evidencias/reproducciones.json) |
| Navegador local de producción | Pantalla de login visible en `127.0.0.1:4178`; Ingresar vacío muestra “Ingresá tu email.” | Observación directa con herramienta de navegador; no se enviaron credenciales |
| Secretos | `.env.local` tiene clave pública Supabase con rol `anon`; IA configurada con placeholder. Sin clave privada coincidente con patrones revisados | [secretos-sin-valores.json](evidencias/secretos-sin-valores.json) |
| Integridad de entrega | 206 archivos originales conservan SHA-256; 20 secciones y 43 tareas completas; enlaces locales y referencias Bxxx válidos | [validacion-entrega.json](evidencias/validacion-entrega.json) |

El primer intento de `npm audit` falló por acceso de red/caché; la segunda consulta autorizada completó y devolvió hallazgos. Exit 1 de esa consulta significa vulnerabilidades encontradas. El archivo original contiene un aviso de actualización de npm después del JSON; se preserva y se entrega una copia JSON normalizada. No se ejecutó `npm install`, `npm update` ni `audit fix`.

Las alertas de npm cuentan **paquetes afectados**, no ataques exitosos ni 11 fallas explotables en el producto. `tar`/`node-pre-gyp` están en el lock pero no aparecen en `npm ls` de esta instalación; comprobar el árbol de CI/plataforma destino. PDF.js sí está instalado y usado por el navegador. Vite afecta el servidor de desarrollo, particularmente relevante por Windows y `host:true`.

## Qué prueban las reproducciones

`node docs/auditoria-2026-09-20/reproducir.mjs` transpila los módulos reales en memoria y reemplaza Supabase/Dexie/Zustand por adaptadores controlados. Usa solo datos inventados y marcado HTML inerte. No abre PDFs maliciosos, no consulta clientes, no modifica el servidor y no instala librerías.

| ID | Resultado observado |
|---|---|
| T01 | `null,null` se convierte en `0,0` en `rowToOrden` |
| T02 | UPDATE Realtime elimina campos extendidos del objeto entregado al store |
| T03–T04 | Cola CREATE/UPDATE descarta campos y confunde descripción/comentario |
| T05 | Tercer error elimina la operación pendiente de OT |
| T06 | Éxito de sincronización deja `_synced:false` en la copia local |
| T07 | Recarga reemplaza la copia local no sincronizada con la respuesta remota |
| T08 | Restaurar devuelve `true` aun con todos los updates rechazados |
| T09 | Informe general inserta marcado sin escapar; el componente lo coloca en iframe sin sandbox |
| T10 | Informe de cierre actual escapa el marcado ensayado; hallazgo antiguo corregido |
| T11 | Anotar una foto cambia URL pero no el path asociado |
| T12 | Export CSV conserva `=1+1` como texto no neutralizado para hojas de cálculo |
| T13 | Fallback de proyectos devuelve datos precargados de un usuario anterior |
| T14 | Crear campo con fallo remoto devuelve un objeto y no encola sincronización |
| T15 | `.otproj` omite campos extendidos y solo produce metadatos/URLs |
| T16 | Dos clientes calculan el mismo próximo código visible de OT |

Son pruebas de comportamiento del código y contratos de llamadas, **no E2E de la aplicación ni pruebas del motor IndexedDB, de RLS, del servidor, de concurrencia real o de una tablet física**. Que las aserciones pasen confirma el hallazgo, no la calidad del producto. El futuro conjunto de regresión debe invertir las expectativas defectuosas al corregirlas.

## Cobertura

- Inventariados código, CSS/assets, configuraciones, scripts, documentación, backups y artefactos históricos. Se excluyen de revisión línea por línea `node_modules`, `.git`, `dist`, habilidades locales de otros agentes y archivos cosméticos repetitivos.
- Revisados todos los stores, servicios, hooks de datos/autorización/sincronización y puntos de integración; trazados login, selección/creación/eliminación de proyecto, OT, importación, fotos, anotación, versiones, informes, vistas globales y prototipo 3D.
- Las vistas largas se inspeccionaron en sus flujos, efectos, consultas, validaciones, generadores HTML y dependencias. No se presenta una certificación visual de cada componente ni una lectura exhaustiva de cada regla CSS.
- Se generaron índices de importaciones e integraciones para localizar cada llamada. Se contrastaron auditorías previas; sus resultados remotos se identifican como **históricos**, no como una prueba de hoy.
- `CLAUDE.md` se leyó y respetó. No se activó su flujo de modificación/commit porque esta fase crea únicamente material de diagnóstico.

## Pendiente de acceso externo / evidencia actual

1. Esquema SQL, RLS/grants/funciones/triggers, Storage y Auth actuales. [verificar-supabase.sql](verificar-supabase.sql) contiene únicamente consultas de catálogo para obtener la primera parte.
2. Repetición de aislamiento A/B, roles y revocación con cuentas de prueba en staging; no usar datos reales ajenos.
3. Backups, PITR si aplica, restauración de base **y objetos**, SMTP, dominio, HTTPS, CSP y límites de servicio desplegado.
4. Datos representativos y prueba física Android: offline, cierre de pestaña, reinicio, cuota de disco, red intermitente, doble pestaña y cambio de usuario.
5. Repositorio, identidad, modelo de clientes/proyectos y API de Fio Pro. Su estado “avanzado/final” es información aportada por el usuario, no comprobada aquí.

El informe permite decidir y planificar; no certifica que el servicio remoto esté seguro ni listo para lanzamiento.

## Repetición y limpieza

Desde la raíz del repositorio, `node docs/auditoria-2026-09-20/reproducir.mjs` repite los casos sin red. `node docs/auditoria-2026-09-20/validar-entrega.mjs` compara los hashes originales y valida estructura/enlaces de la entrega. Si se corrige el producto después, es normal que esa comparación de baseline falle: conservar la evidencia original y generar una auditoría nueva, sin sobrescribir el diagnóstico fechado.

Se cerró el preview y la pestaña temporal; se retiraron únicamente el build de prueba y la caché npm creados para esta auditoría. Los logs, scripts y resultados permanecen en esta carpeta. El estado final agrega esta carpeta de documentación y conserva `repomix.qwen.json` previamente no rastreado; no modifica archivos originales ni instala/actualiza dependencias. Los comandos de build sí generaron sus archivos habituales dentro de `node_modules`, fuera del código fuente auditado.
