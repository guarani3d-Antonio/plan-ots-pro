# Sprint intensivo de 10 días

Objetivo: al terminar el día 10, disponer de una versión conectada de Plan-OTs apta para pruebas de campo con empresas, obras y usuarios ficticios. Capacidad: al menos 5–6 horas efectivas diarias. Se trabajará en días consecutivos y cada día cerrará con validación y checkpoint reversible.

El sprint congela alcance. En estos diez días no entran offline completo, BIM/IFC, visor 3D productivo, cobros, integraciones con Fio Pro ni la skill. Las pantallas secundarias que bloqueen el núcleo se deshabilitan temporalmente en vez de retrasar la prueba de campo.

Los días representan bloques de trabajo consecutivos y se adelantan si terminan antes. Diez días es el límite solicitado, no una espera obligatoria. La caché y cola offline ya existentes requieren controles de identidad y conservación antes del piloto conectado; no se posterga su seguridad con el offline completo.

## Resultado exigido al día 10

1. Dos empresas ficticias, dos obras por empresa y usuarios con roles reales.
2. Aislamiento probado entre empresas y entre obras mediante UI, REST y Storage.
3. Login, selección de obra, plano, alta/edición/cierre de OT, fotografías e informe funcionando con conexión.
4. Plano y evidencia privados; ningún usuario ajeno o anónimo puede descargarlos.
5. Errores visibles y recuperables; ninguna acción crítica confirma éxito si el servidor la rechazó.
6. Backup y rollback probados para código, base y objetos usados en el ensayo.
7. Recorrido en tablet y guion de campo completados con datos ficticios.
8. Sin P0 abiertos. Los P1 aceptados para el ensayo quedan documentados y no afectan aislamiento, pérdida de datos o recuperación.

## Plan paso a paso

| Día | Trabajo | Cierre obligatorio |
|---:|---|---|
| **1** | Auditoría final, respaldo, revisión de Supabase y Fio Pro, decisión de independencia, migración multitenant aditiva y mapper canónico de OTs. | **Implementación inicial completada:** commits `54742be` y `85fac0d`; revisión adversarial y correcciones en día 2. No certifica aislamiento ni sync. |
| **2** | Revisión de migración, RLS de tablas nuevas, grants, rollback y fixtures. Corregir el diseño antes de tocar el servidor. | **Completado:** 35/35 casos SQL y 4/4 de contrato de órdenes; captura del catálogo preservada. Aprobada solo fase 1 vacía. Ver [revisión](dia-2/REVISION.md). |
| **3** | Aplicar fundamento vacío. Implementar y probar fase 2 en laboratorio; preparar aprovisionamiento de Creador, dos empresas, cuatro obras y usuarios sintéticos. | Verificación de fase 1; restricciones y matriz de fase 2 pasan localmente. Ningún seed remoto con asignaciones antes de preparar RLS coherente. |
| **4** | Activar RLS y capacidades por empresa/obra junto con aprovisionamiento controlado. Corregir viewer, autor autenticado, referencias cruzadas y revocación. | Conteos exactos y matriz allow/deny A/B con cuentas reales; técnico no entra a otra obra; recuperación del lote comprobada. |
| **5** | Hacer privados `planos`, `fotos` y `exports`; migrar paths a tenant/proyecto y usar acceso temporal. | Anónimo, empresa ajena y técnico de otra obra no descargan ni suben objetos. |
| **6** | Adaptar frontend a tenant y membresías reales: sesión, selector, creación de proyecto, permisos y cambio de cuenta. Aislar caché/cola y respuestas tardías; bloquear fallback inseguro. | Cada rol ve solo sus obras; cambio de cuenta no revela ni sincroniza datos de otra identidad; Creador administra. |
| **7** | Cerrar flujo OT conectado: mapper, updates parciales, Realtime, conflicto de código, fotos y estados. Controlar errores/red caída sin perder pendientes ni simular éxito. | Dos sesiones autorizadas conservan los campos soportados; fallos de red no descartan operaciones y ninguna función offline sin validar queda habilitada para el piloto. |
| **8** | Asegurar informes/HTML, corregir restauración falsa y actualizar PDF.js si la adaptación cabe sin romper el visor. Deshabilitar cualquier salida insegura que no llegue. | Recorrido OT → fotos → informe pasa; payloads HTML no ejecutan código; restauración informa resultado real. |
| **9** | Prueba integral en tablet con las cuatro obras: orientación, cámara, plano, suspensión breve, sesión y recuperación. Corregir todos los P0. | Evidencia de campo ficticia, incidencias reproducibles y build candidata. |
| **10** | Regresión final, repetición de aislamiento, restore, despliegue controlado y guion de prueba de campo. | Decisión explícita GO/NO-GO. Con GO, la build queda lista para uso acompañado con clientes ficticios. |

## Después del día 10

El siguiente bloque amplía el offline completo sobre las protecciones mínimas exigidas para campo: cola idempotente, acuses, fotos, reintentos, conflictos, varias pestañas, actualización PWA y pruebas de red intermitente. No se prometerá offline hasta pasar esas pruebas.

Después de validar Plan-OTs en campo se replica el módulo de planos dentro de Fio Pro como desarrollo independiente. La skill se extrae únicamente cuando esa réplica también haya sido probada.

## Uso de modelos durante el sprint

- Sol alto para implementación, pruebas rutinarias y correcciones delimitadas.
- Astra alto en el día 2, antes de aplicar RLS/Storage, y nuevamente en el gate final del día 10.
- Si aparece un fallo contradictorio de autorización o pérdida de datos, se cambia a Astra en ese momento y se vuelve a Sol al quedar delimitada la corrección.
