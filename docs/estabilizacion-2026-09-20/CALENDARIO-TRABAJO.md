# Calendario de estabilización, piloto y offline

Base: 6 horas efectivas por día, lunes a viernes, una persona principal. Inicio de ejecución: domingo 20/09/2026; calendario regular desde el lunes 21/09/2026. Los feriados del 8 y 25 de diciembre y 1 de enero quedan como reserva; si se trabaja alguno, ese tiempo adelanta contingencias. Cada día termina con evidencia, commit o checkpoint y camino de reversión.

Este calendario ordena el trabajo conocido. Los gates deciden salida: una fecha no convierte una build en apta si falla aislamiento, restauración o campo.

## Fechas objetivo

| Hito | Fecha objetivo | Condición |
|---|---|---|
| Base multitenant aplicada y dos empresas aprovisionadas | 09/10/2026 | Revisión Astra, rollback y pruebas A/B |
| Flujo online técnicamente coherente | 30/10/2026 | OT/plano/fotos/informes sin pérdidas ni XSS conocido |
| Candidato a prueba de campo conectada | 20/11/2026 | Seguridad, Storage privado, restore y tablet pasan |
| Primera ronda de campo ficticia cerrada | 04/12/2026 | Incidencias clasificadas y P0 corregidos |
| Piloto conectado estabilizado | 18/12/2026 | Segunda ronda sin P0 abiertos |
| Offline completo candidato a campo | 29/01/2027 | Cola, identidad, conflicto, reinicio y red intermitente pasan |
| Flujo mínimo Fio Pro ↔ plano probado | 19/02/2027 | NC abre anclaje autorizado y vuelve al origen |
| Skill reutilizable candidata | 26/02/2027 | Caso real reproducible en ambos repositorios y rollback probado |
| Candidato comercial controlado | 19/03/2027 | Sin P0/P1 de seguridad/recuperación, soporte y operación listos |

## Trabajo diario: tramo hasta piloto conectado

| Día | Fecha | Trabajo y resultado del día |
|---:|---|---|
| 1 | Lun 21/09 | Terminar migración multitenant aditiva, tipos y validación de fixtures. |
| 2 | Mar 22/09 | Capturar schema anterior completo; preparar migración de backfill sin ejecutarla. |
| 3 | Mié 23/09 | Diseñar capacidades por proyecto y unificar roles `administrador/supervisor/tecnico/viewer`. |
| 4 | Jue 24/09 | Escribir RLS fase 2 y matriz allow/deny para creador, empresa y obra. |
| 5 | Vie 25/09 | Gate Astra: revisión de migración, funciones, `search_path`, grants y rollback. |
| 6 | Lun 28/09 | Corregir revisión; aplicar fundación en entorno remoto con evidencia de catálogo. |
| 7 | Mar 29/09 | Crear Creador y flujo administrativo mínimo de aprovisionamiento. |
| 8 | Mié 30/09 | Crear Empresa de prueba 1 y sus dos obras por el flujo de dominio. |
| 9 | Jue 01/10 | Crear Empresa de prueba 2 y sus dos obras; asignar roles y membresías. |
| 10 | Vie 02/10 | Probar lectura/escritura A/B, técnico entre obras, lector y usuario sin membresía. |
| 11 | Lun 05/10 | Migrar proyectos existentes al tenant legado o fixture decidido; verificar conteos. |
| 12 | Mar 06/10 | Activar integridad tenant/proyecto y referencias compuestas donde corresponda. |
| 13 | Mié 07/10 | Implementar contexto de tenant/usuario en cliente con fallo cerrado. |
| 14 | Jue 08/10 | Adaptar selector de proyectos y creación para usar tenant real. |
| 15 | Vie 09/10 | Gate Astra: aislamiento completo y rollback; cerrar hito multitenant. |
| 16 | Lun 12/10 | Rediseñar paths de `planos` y `fotos` como tenant/proyecto/objeto. |
| 17 | Mar 13/10 | Crear buckets/policies privadas y acceso temporal autorizado. |
| 18 | Mié 14/10 | Migrar referencias históricas y compatibilidad de lectura durante transición. |
| 19 | Jue 15/10 | Probar descarga/subida/borrado entre empresas, obras, anónimo y revocado. |
| 20 | Vie 16/10 | Verificar cachés y URLs expiradas; documentar recuperación de objetos. |
| 21 | Lun 19/10 | Implementar mapper canónico row ↔ OT, con null, cero y fechas. |
| 22 | Mar 20/10 | Unificar CREATE/UPDATE online y preparar comandos idempotentes. |
| 23 | Mié 21/10 | Corregir Realtime para conservar campos y no reemitir DELETE. |
| 24 | Jue 22/10 | Corregir conflicto de código OT y mostrar recuperación al usuario. |
| 25 | Vie 23/10 | Regresión del flujo OT online en dos sesiones autorizadas. |
| 26 | Lun 26/10 | Centralizar escape HTML y validación de URLs en informes. |
| 27 | Mar 27/10 | Aislar preview/impresión y probar payloads de marcado inerte. |
| 28 | Mié 28/10 | Actualizar PDF.js y workers; probar PDF grande, rotado y multipágina. |
| 29 | Jue 29/10 | Actualizar Vite/transitivas, limitar servidor de desarrollo y construir PWA. |
| 30 | Vie 30/10 | Gate Astra: flujo online coherente, seguridad de documentos y dependencias. |
| 31 | Lun 02/11 | Reparar restauración de versiones para no informar éxitos falsos. |
| 32 | Mar 03/11 | Validar relaciones OT/proyecto en fotos y comentarios en servidor. |
| 33 | Mié 04/11 | Derivar actor desde Auth y registrar eventos críticos de negocio. |
| 34 | Jue 05/11 | Reemplazar invitaciones simuladas por aprovisionamiento administrativo real. |
| 35 | Vie 06/11 | Probar alta, revocación y reingreso de usuarios con sesión nueva. |
| 36 | Lun 09/11 | Preparar dataset de campo: estados, fotos, costos, anclajes y casos negativos. |
| 37 | Mar 10/11 | E2E del recorrido conectado: login → obra → plano → OT → foto → informe. |
| 38 | Mié 11/11 | E2E de dos empresas y dos obras mediante REST, Storage y UI. |
| 39 | Jue 12/11 | Ensayo de backup/restore de base y objetos en espacio de prueba. |
| 40 | Vie 13/11 | Corregir resultados del restore y completar runbook de incidentes. |
| 41 | Lun 16/11 | Prueba tablet horizontal/vertical, cámara, PDF, suspensión y reapertura online. |
| 42 | Mar 17/11 | Medir arranque, memoria y planos representativos; corregir bloqueos P0. |
| 43 | Mié 18/11 | Ensayo operativo con guion de campo y observación de errores visibles. |
| 44 | Jue 19/11 | Regresión completa desde checkout limpio y equivalencia con despliegue. |
| 45 | Vie 20/11 | Gate Astra: aceptar o rechazar candidato a prueba de campo conectada. |

## Trabajo diario: campo conectado y preparación offline

| Día | Fecha | Trabajo y resultado del día |
|---:|---|---|
| 46 | Lun 23/11 | Campo ficticio 1, Empresa 1/Obra 1, uso acompañado y registro de incidentes. |
| 47 | Mar 24/11 | Campo ficticio 1, Empresa 1/Obra 2 con técnico restringido. |
| 48 | Mié 25/11 | Analizar evidencia, reproducir incidentes y priorizar P0/P1. |
| 49 | Jue 26/11 | Corregir P0 de campo y agregar regresiones útiles. |
| 50 | Vie 27/11 | Repetir recorrido fallido y emitir build candidata 2. |
| 51 | Lun 30/11 | Campo ficticio 2, Empresa 2/Obra 1, cuenta y dispositivo distintos. |
| 52 | Mar 01/12 | Campo ficticio 2, Empresa 2/Obra 2; verificar aislamiento cruzado. |
| 53 | Mié 02/12 | Probar revocación durante operación y expiración normal de sesión. |
| 54 | Jue 03/12 | Corregir P0/P1 de segunda ronda. |
| 55 | Vie 04/12 | Gate de primera ronda cerrada; decidir alcance exacto del offline. |
| 56 | Lun 07/12 | Versionar Dexie por identidad/tenant y estrategia de migración local. |
| — | Mar 08/12 | Feriado/reserva; sin trabajo obligatorio programado. |
| 57 | Mié 09/12 | Vincular cola a actor/tenant y bloquear envío con otra sesión. |
| 58 | Jue 10/12 | Introducir estados durable/processing/retry/failed/acked y leases. |
| 59 | Vie 11/12 | Implementar backoff, error visible y reintento manual sin descarte. |
| 60 | Lun 14/12 | Probar tres fallos, cierre de pestaña y crash después del commit remoto. |
| 61 | Mar 15/12 | Implementar merge servidor/local sin borrar pendientes. |
| 62 | Mié 16/12 | Resolver conflicto update/update y delete/update de manera visible. |
| 63 | Jue 17/12 | Segunda ronda conectada con correcciones y simulación de red breve. |
| 64 | Vie 18/12 | Gate Astra: piloto conectado estabilizado y diseño offline confirmado. |
| 65 | Lun 21/12 | Diseñar tablas de documento/revisión/lámina/anclaje para integración Fio Pro. |
| 66 | Mar 22/12 | Implementar contrato espacial v1 y adaptador Plan-OTs. |
| 67 | Mié 23/12 | Probar coordenadas 0..1, revisión inmutable y deep link local. |
| 68 | Jue 24/12 | Buffer de correcciones/documentación; sin despliegue riesgoso. |
| — | Vie 25/12 | Feriado/reserva; sin trabajo obligatorio programado. |
| 69 | Lun 28/12 | Preparar checkpoint seguro del árbol actual de Fio Pro. |
| 70 | Mar 29/12 | Montar adaptador Fio Pro en rama/worktree aislado, sin cambiar ciclo NC. |
| 71 | Mié 30/12 | Probar NC → plano → anclaje con datos sintéticos y permisos. |
| 72 | Jue 31/12 | Documentar hallazgos y backlog de integración; cierre sin publicación. |
| — | Vie 01/01 | Feriado/reserva; sin trabajo obligatorio programado. |

## Continuación enero-marzo

- **04–29/01/2027:** terminar offline: fotos, almacenamiento, cuotas, actualización PWA, red intermitente, dos pestañas, cambio de usuario y tablet física. Gate Astra el 29/01.
- **01–19/02/2027:** estabilizar el flujo Fio Pro ↔ Plan-OTs y probarlo entre las dos empresas/obras, manteniendo Fio Pro como dueño de la NC.
- **22–26/02/2027:** crear la skill desde el procedimiento ya probado, con preflight, migración, tests y rollback.
- **01–19/03/2027:** operación comercial: SMTP, onboarding, soporte, observabilidad, recuperación, límites, documentación y último ciclo de campo. La fecha del 19/03 es un candidato sujeto a gates, no una promesa de venta.

## Uso de modelos

- Sol alto: implementación cotidiana, refactors delimitados, tests, documentación y corrección de fallos conocidos.
- Astra alto: días 5, 15, 30, 45 y 64; además, cualquier conflicto de sincronización no reproducible, cambio de RLS/Storage de alto impacto o decisión de salida.
- El cambio de modelo se avisa antes del gate. Después de cada revisión se vuelve a Sol para ejecutar las correcciones.
