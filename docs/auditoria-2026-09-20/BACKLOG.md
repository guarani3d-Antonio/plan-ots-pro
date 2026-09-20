# Backlog ejecutable — Plan-OTs

20 de septiembre de 2026 · Base: HEAD `4d1851e` · [Diagnóstico](INFORME.md) · [Evidencia](VERIFICACION.md)

Este documento propone trabajo; no registra correcciones realizadas. Rutas relativas a la raíz del repositorio. Los componentes marcados como nuevos todavía no existen. Las horas incluyen implementación, revisión y regresión de cada tarea; son rangos, no compromisos. Evitar contar dos veces pruebas o migraciones compartidas al planificar un lote. Las estimaciones del informe seleccionan un alcance por hito: no son la suma de todas las evoluciones opcionales.

**P0:** bloquea el uso con clientes del alcance afectado. **P1:** alta, necesaria muy pronto o antes de habilitar esa función. **P2:** mejora importante posterior al núcleo seguro. **P3:** evolución. Riesgo significa riesgo de implementar/migrar; la severidad del defecto está en el informe. Dificultad: baja/media/alta. El resultado esperado queda expresado en el criterio de aceptación.

Antes de modificar, respetar `CLAUDE.md`, preservar cambios ajenos y respaldar los archivos protegidos según sus instrucciones. No ejecutar cambios de datos contra producción para probar tareas. Las dependencias de servidor requieren staging y una migración versionada; B016 puede adelantarse como infraestructura para B002/B011. No borrar datos históricos para simplificar una migración. Los casos de `reproducir.mjs` son caracterizaciones y deben transformarse en regresiones positivas: que el defecto deje de ocurrir, no mantenerlo como comportamiento esperado.

## A — Bloqueadores

### B001 — Obtener y contrastar la configuración actual de Supabase

- **Prioridad / área:** P0 · Seguridad y operación.
- **Descripción:** ejecutar el SQL de catálogo de esta auditoría en modo lectura; inspeccionar Auth, buckets, backups, vistas, funciones, grants, RLS, límites API y configuración de Realtime. Contrastar con la auditoría histórica de julio. Documentar hosting, dominio, headers, proyecto/ambiente y fecha de evidencia sin secretos.
- **Motivo:** no se puede certificar el aislamiento ni la recuperación desde el frontend; hay antecedentes de políticas de fotos permisivas y vistas privilegiadas.
- **Archivos/componentes:** `verificar-supabase.sql` de esta carpeta; `docs/auditoria/03_CAPA_DATOS.md`; Supabase Dashboard y despliegue real.
- **Dependencias:** acceso de lectura al proyecto y responsable de infraestructura; ninguna otra tarea de código.
- **Aceptación:** matriz actual de tablas/vistas/buckets/roles; cada antecedente marcado vigente/corregido/no comprobado; política de backup y configuración Auth documentadas. Datos de clientes y tokens excluidos de la evidencia entregable.
- **Riesgo / dificultad / esfuerzo:** bajo de cambio, sensibilidad de la evidencia · media · **12–24 h**.

### B002 — Cerrar permisos de datos y probar aislamiento

- **Prioridad / área:** P0 · Autorización servidor.
- **Descripción:** corregir políticas permisivas, grants y vistas según B001; usar membresías confiables. Revisar `eventos_uso`, ambas tablas de comentarios, snapshots y campos. Revisar search_path/EXECUTE de funciones sin romper triggers. Probar REST y RPC con identidades reales de staging.
- **Motivo:** una política restrictiva adicional no anula otra permisiva combinada con OR; ocultar pantallas no protege la API.
- **Archivos/componentes:** Supabase schema/RLS/grants; nuevas migraciones y tests de autorización; hooks de permisos.
- **Dependencias:** B001; infraestructura mínima de B016. La organización formal de B022 puede incorporarse después mediante una segunda migración.
- **Aceptación:** propietario, supervisor, miembro, usuario ajeno y anónimo pasan matriz de SELECT/INSERT/UPDATE/DELETE; intentos con IDs de otro proyecto fallan; vistas/RPC no eluden permisos; scripts permiten reconstruir las políticas.
- **Riesgo / dificultad / esfuerzo:** alto, puede cortar acceso legítimo · alta · **16–32 h**.

### B003 — Separar datos locales, cola y sesión por identidad

- **Prioridad / área:** P0 · Offline y privacidad.
- **Descripción:** delimitar Dexie, stores, localStorage y Cache API por usuario y organización/proyecto autorizado. Vincular cada operación pendiente a su actor; al cambiar sesión impedir envío con otra identidad. Definir salida segura con trabajo no subido e invalidación tras revocación.
- **Motivo:** logout no elimina ni separa datos; el fallback actual recupera proyectos de la cuenta anterior.
- **Archivos/componentes:** `src/db/dexie.ts`, `src/stores/authStore.ts`, `proyectosStore.ts`, `ordenesStore.ts`, `src/sync/SyncManager.ts`, `vite.config.ts`, caches de widgets/contratistas.
- **Dependencias:** B001/B002 para matriz de acceso; coordinar con B005. Diseño y aislamiento local pueden empezar inmediatamente.
- **Aceptación:** A crea datos/pendientes y sale; B entra online/offline sin ver ni enviar datos de A; dos pestañas siguen la misma sesión; borrado de caches no pierde pendientes silenciosamente; política para sesión expirada/revocada documentada y probada.
- **Riesgo / dificultad / esfuerzo:** alto, migración local con datos pendientes · alta · **24–48 h**.

### B004 — Unificar el contrato y los mapeos de orden

- **Prioridad / área:** P0 · Integridad de datos.
- **Descripción:** crear funciones puras tipadas row↔dominio y comando↔payload para online, offline y Realtime. Enumerar todos los campos, nulabilidad y diferencia entre no modificar y borrar. Separar descripción de comentarios.
- **Motivo:** el contrato online maneja más campos que el sincronizador y Realtime; cambios pueden desaparecer aunque se anuncie éxito.
- **Archivos/componentes:** `src/types/orden.ts`, `src/stores/ordenesStore.ts`, `src/sync/SyncManager.ts`, `src/hooks/useRealtimeOrdenes.ts`; nuevo módulo de mapeo.
- **Dependencias:** ninguna para implementar; confirmar esquema con B001 antes de desplegar.
- **Aceptación:** casos con todos los campos, cero, null, fechas, campos personalizados y textos distintos conservan equivalencia entre rutas; update parcial no borra campos omitidos; incluir casos T02–T04 de las reproducciones.
- **Riesgo / dificultad / esfuerzo:** medio, alto alcance de datos · media · **12–20 h**.

### B005 — Hacer durable e idempotente la sincronización

- **Prioridad / área:** P0 · Offline.
- **Descripción:** reemplazar descarte tras tres fallos por estados durable/processing/retry/failed/acked; command_id estable, claim con lease entre pestañas, backoff y reintento visible. Distinguir errores permanentes, expiración de sesión y conectividad. Marcar el registro local sincronizado solo tras acuse válido.
- **Motivo:** hoy se pierden operaciones después de tres errores y el éxito no actualiza `_synced`; reenviar puede duplicar efectos.
- **Archivos/componentes:** `src/sync/SyncManager.ts`, `src/db/dexie.ts`, `src/stores/ordenesStore.ts`; UI de pendientes y soporte idempotente servidor si hace falta.
- **Dependencias:** B004; coordinar B003 y B006; B001 para restricciones existentes.
- **Aceptación:** tres fallos, cierre de pestaña, crash tras commit remoto, token vencido y dos workers no pierden ni duplican un comando; existe recuperación manual de fallos permanentes; cola conserva payload completo y ack verificable; fixtures T05/T06 corregidos.
- **Riesgo / dificultad / esfuerzo:** alto · alta · **24–48 h**.

### B006 — Reconciliar servidor y pendientes sin sobrescribir trabajo

- **Prioridad / área:** P0 · Consistencia y concurrencia.
- **Descripción:** sustituir borrado/reemplazo del cache por merge con pendientes y tombstones. Definir versión remota y política de conflicto, incluidas dos ediciones y delete/update; el usuario debe poder resolver conflictos reales.
- **Motivo:** cargar un proyecto puede eliminar filas locales que aún están en cola; last-write-wins implícito puede pisar trabajo.
- **Archivos/componentes:** `src/stores/ordenesStore.ts`, `src/db/dexie.ts`, `src/sync/SyncManager.ts`, UI de conflictos; control de versión servidor.
- **Dependencias:** B004/B005; esquema comprobado B001.
- **Aceptación:** respuesta remota vacía no elimina nueva OT pendiente; refresh conserva edición local; eliminación confirmada se propaga; modificaciones simultáneas no se pierden silenciosamente; ensayo de reinicio e importación offline.
- **Riesgo / dificultad / esfuerzo:** alto · alta · **16–28 h**.

### B007 — Corregir la aplicación local de eventos Realtime

- **Prioridad / área:** P0 · Datos en vivo.
- **Descripción:** usar contrato canónico y reconciliación local; un evento DELETE debe quitar/marcar localmente sin ejecutar otro DELETE remoto. Manejar eventos duplicados, suscripción por proyecto y reconexión con resync.
- **Motivo:** el mapper incompleto reemplaza campos y el handler DELETE llama una acción que vuelve a mutar el servidor.
- **Archivos/componentes:** `src/hooks/useRealtimeOrdenes.ts`, `src/stores/ordenesStore.ts`, `src/components/ui/Notificaciones.tsx`.
- **Dependencias:** B004/B006; B001 para publicación/replica identity y autorización.
- **Aceptación:** dos sesiones observan costo/descripción/riesgo/avance correctos si están autorizadas; un DELETE produce cero escrituras remotas en el receptor; evento repetido no duplica; reconexión recupera cambios perdidos; pendientes no se pisan.
- **Riesgo / dificultad / esfuerzo:** medio · media · **8–16 h**.

### B008 — Asegurar todas las salidas HTML de informes

- **Prioridad / área:** P0 · XSS.
- **Descripción:** centralizar escape contextual y validación de URLs; revisar informes general, dashboard, calendario, cierre y templates. Aislar preview/impresión con sandbox u origen adecuado y reducir ejecución de scripts/CDNs donde sea viable.
- **Motivo:** datos de usuarios entran crudos en HTML; el escape ya corregido en cierre no cubre otros generadores.
- **Archivos/componentes:** `src/services/informeService.ts`, `reportService.ts`, `reportTemplates.ts`, `src/components/informes/InformePanel.tsx`, `src/components/views/Dashboard.tsx`, `Calendario.tsx`.
- **Dependencias:** ninguna; respetar protección de `reportService.ts`.
- **Aceptación:** títulos/textos/atributos/URLs con marcado inerte, comillas y esquemas no permitidos se muestran como datos; pruebas de navegador confirman ausencia de ejecución y acceso al padre; impresión y fotografías autorizadas siguen funcionando; T09 corregido y T10 preservado.
- **Riesgo / dificultad / esfuerzo:** medio, regresión de diseño/impresión · media · **8–16 h**.

### B009 — Actualizar PDF.js y todos sus workers

- **Prioridad / área:** P0 · Dependencia cliente.
- **Descripción:** elegir versión mantenida que corrija GHSA-wgrm-67xf-hhpq; adaptar API/worker y servir artefactos compatibles. Revisar cada consumidor, sin asumir que actualizar el package cambia workers remotos fijados a otra versión.
- **Motivo:** PDF.js 3.11.174 está afectado por ejecución de JavaScript con PDFs preparados.
- **Archivos/componentes:** `package.json`, `package-lock.json`, `src/components/plano/VistaPlano.tsx`, `ComparadorVersiones.tsx`, `src/services/pdfThumbnailService.ts`, `src/components/proyecto/PlanoThumb.tsx`, `vite.config.ts`.
- **Dependencias:** ninguna; combinar con regresión local de build.
- **Aceptación:** ningún loader usa versión vulnerable; worker/API coinciden; PDFs representativos grandes, rotados y multipágina no rompen visor/thumbnail/comparación; no se abre un archivo malicioso en producción; build/PWA pasan y aviso se cierra o se justifica con versión corregida verificable.
- **Riesgo / dificultad / esfuerzo:** medio, cambio mayor de API posible · media · **12–24 h**.

### B010 — Corregir dependencias de herramientas y restringir desarrollo

- **Prioridad / área:** P1 inmediata · Cadena de suministro/desarrollo.
- **Descripción:** actualizar Vite y transitivas vulnerables con cambios controlados de lock; restringir host de desarrollo por defecto. Verificar `tar` y `node-pre-gyp` en plataformas/CI donde se instalen y clasificar cada aviso sin `audit fix --force` indiscriminado.
- **Motivo:** Vite instalado tiene aviso relevante en Windows; auditoría npm reporta otros diez paquetes afectados con superficies distintas.
- **Archivos/componentes:** `package.json`, `package-lock.json`, `vite.config.ts`, futuro pipeline.
- **Dependencias:** ninguna; coordinar versión de PDF.js en B009.
- **Aceptación:** dev solo expuesto por configuración explícita; no permanece el rango Vite vulnerable; build y preview pasan; cada aviso restante tiene dueño, contexto y fecha de revisión; ninguna excepción se basa solo en que la aplicación compila.
- **Riesgo / dificultad / esfuerzo:** medio · media · **8–16 h**.

### B011 — Hacer privada la evidencia y los planos

- **Prioridad / área:** P0 para datos privados · Storage/autorización.
- **Descripción:** migrar a buckets privados y referencias canónicas bucket/path/id; generar acceso temporal autorizado. Adaptar PDF, thumbnails, fotos, videos, anotaciones e informes; planificar transición de URLs históricas, cache e invalidación.
- **Motivo:** `getPublicUrl` y el antecedente de buckets públicos son incompatibles con confidencialidad por membresía.
- **Archivos/componentes:** `src/services/fotosService.ts`, `editorFotoService.ts`, `pdfThumbnailService.ts`, `src/stores/proyectosStore.ts`, `src/components/plano/CampoVideo.tsx`, informes; políticas Storage.
- **Dependencias:** B001/B002/B003; migración versionada B016. Coordinar referencias con B021.
- **Aceptación:** usuario ajeno/anónimo no descarga originales ni derivados; acceso autorizado funciona tras expirar URL; export/impresión no exponen enlaces permanentes; referencias antiguas migradas sin perder objetos; política offline y persistencia de bytes explícita.
- **Riesgo / dificultad / esfuerzo:** alto, puede romper referencias existentes · alta · **16–32 h**.

### B012 — Aplicar confidencialidad de costos en servidor

- **Prioridad / área:** P0 si los costos se ofrecen como restringidos · Autorización por campo.
- **Descripción:** confirmar matriz de roles; separar costos en tabla protegida o proyección/API cuya consulta base no sea accesible al rol restringido. Actualizar Realtime, exports y cache; conservar datos en migración.
- **Motivo:** ocultar controles con `usePuedeVerCostos` no impide recibir costos en SELECT *.
- **Archivos/componentes:** `src/hooks/usePuedeVerCostos.ts`, `src/stores/ordenesStore.ts`, `src/components/plano/PanelOT.tsx`, informes/dashboard, esquema y Realtime.
- **Dependencias:** decisión de negocio sobre confidencialidad; B001/B002/B004/B003.
- **Aceptación:** miembro restringido no obtiene costos por API directa, evento, CSV, PDF o Dexie; supervisor autorizado sí; sumatorias no filtran indirectamente cifras fuera de permiso. Si no se requiere restricción, documentar y quitar la promesa engañosa.
- **Riesgo / dificultad / esfuerzo:** alto · alta · **16–32 h**.

### B013 — Demostrar backup y recuperación de datos y archivos

- **Prioridad / área:** P0 · Continuidad.
- **Descripción:** inventariar mecanismos reales de DB y Storage, configurar cobertura faltante y restaurar una copia aislada. Definir RPO/RTO, retención, dueño, frecuencia y evidencia de ensayo; distinguir snapshot funcional, export portátil y backup operacional.
- **Motivo:** `.otproj` contiene metadatos parciales y no constituye un backup restaurable del sistema.
- **Archivos/componentes:** Supabase/backups/Storage; nuevo runbook de recuperación; `src/services/otprojService.ts` solo para corregir su promesa en UI/documentación.
- **Dependencias:** B001; ambiente aislado y acceso operacional autorizado.
- **Aceptación:** recuperar proyecto/OT/fotos/documentos/permisos de una fecha conocida, con conteos e integridad de referencias; tiempo medido y pérdida máxima documentados; alguien distinto al autor puede seguir el runbook.
- **Riesgo / dificultad / esfuerzo:** alto si se apunta al destino incorrecto; ensayo aislado obligatorio · media · **12–24 h**.

### B014 — Conservar coordenadas ausentes y validar anclajes 2D

- **Prioridad / área:** P1 · Ubicación.
- **Descripción:** preservar null como OT sin ubicación; validar par de coordenadas y rango normalizado, distinguiendo `(0,0)` legítimo. Corregir conteos/lista de pendientes/importación y render de marcadores.
- **Motivo:** el mapper convierte null en cero y ubica órdenes no posicionadas en una esquina.
- **Archivos/componentes:** `src/stores/ordenesStore.ts`, `src/types/orden.ts`, `src/components/plano/VistaPlano.tsx`, `ModalImportPendiente.tsx`, `Marcador.tsx`, `src/services/csvService.ts`.
- **Dependencias:** B004.
- **Aceptación:** null permanece sin pin tras recargar/sincronizar; `(0,0)` se conserva; valores inválidos se rechazan con mensaje; importaciones y exportaciones respetan la distinción; T01 corregido.
- **Riesgo / dificultad / esfuerzo:** bajo-medio · baja · **4–8 h**.

## B — Production Ready

### B015 — Crear regresiones críticas y CI reproducible

- **Prioridad / área:** P1, gate de piloto · Calidad.
- **Descripción:** incorporar pruebas de dominio/mapper, integración real con IndexedDB y Supabase de staging/local, y E2E de sesión/offline/evidencias. Configurar CI con instalación por lock, typecheck, lint, tests y build, con datos sintéticos.
- **Motivo:** no existe suite rastreada ni pipeline; las reproducciones del diagnóstico no validan producto completo.
- **Archivos/componentes:** nuevas carpetas de tests y `.github/workflows` o CI elegido; `package.json`; módulos críticos de A.
- **Dependencias:** B004 como primer contrato; B001/B016 para integración. Infraestructura puede comenzar durante A.
- **Aceptación:** checkout limpio ejecuta checks; un fallo deliberado de aislamiento/sync hace fallar CI; prueba crítica cubre creación→offline→reconexión→cierre→informe; secretos aislados y ningún cliente real usado; flakes identificados.
- **Riesgo / dificultad / esfuerzo:** medio · media · **20–36 h** iniciales, excluye QA continuada.

### B016 — Versionar esquema, migraciones y tipos de Supabase

- **Prioridad / área:** P1 · Base de datos/despliegue.
- **Descripción:** capturar baseline revisado y crear migraciones repetibles; generar tipos desde schema y usarlos en el cliente. Añadir datos sintéticos, constraints e índices justificados; documentar expand/contract y compatibilidad con clientes PWA anteriores.
- **Motivo:** esquema y políticas no están reproducidos en el repositorio; tipos manuales permiten drift.
- **Archivos/componentes:** nuevas migraciones Supabase y tipos generados; `src/db/supabase.ts`, `src/types/orden.ts`, servicios.
- **Dependencias:** B001; no requiere esperar B002 para crear infraestructura.
- **Aceptación:** base vacía reproduce esquema/políticas acordados; segunda aplicación no duplica; diff revisado sin datos secretos; tipos detectan columna inválida; migración de muestra conserva filas y permite recuperación documentada.
- **Riesgo / dificultad / esfuerzo:** alto de migración · alta · **12–24 h**.

### B017 — Completar recuperación, alta y roles confiables

- **Prioridad / área:** P1 · Autenticación/onboarding.
- **Descripción:** implementar reset de contraseña y respuesta fiel a errores/confirmación de email; retirar asignación de rol de `user_metadata` como autoridad. Google login debe funcionar con configuración validada o mostrarse deshabilitado sin promesa falsa.
- **Motivo:** auth tiene placeholders y registro puede mostrar éxito tras fallo; el perfil permite cambiar un rol editable por el usuario.
- **Archivos/componentes:** `src/stores/authStore.ts`, `src/components/ui/AuthForm.tsx`, `src/components/views/Configuracion.tsx`; Auth settings y callbacks.
- **Dependencias:** B001/B002; B022 para membresías multiempresa.
- **Aceptación:** alta confirmada/no confirmada/error, reset válido/expirado y sesión vencida tienen mensajes correctos; editar perfil no cambia privilegios; redirects allowlisted; callbacks funcionan en entorno publicado de staging.
- **Riesgo / dificultad / esfuerzo:** medio · media · **12–24 h**.

### B018 — Registrar transiciones de OT como comando atómico

- **Prioridad / área:** P1 · Reglas de negocio.
- **Descripción:** definir permisos e invariantes de cierre/reapertura/asignación y un comando transaccional servidor que guarde cambio y evento con actor del token, command_id y versión esperada. Evidencia se referencia solo cuando esté confirmada; todos los clientes usan el mismo comando.
- **Motivo:** estado, foto y comentario separados permiten cierres sin trazabilidad o éxito parcial.
- **Archivos/componentes:** `src/components/plano/PanelOT.tsx`, `src/stores/ordenesStore.ts`, `src/services/comentariosService.ts`, `comentariosOtService.ts`; nueva RPC/API.
- **Dependencias:** B002/B004/B005/B016; B021 para ciclo de evidencia.
- **Aceptación:** falla de evento revierte transición; reintento no duplica; actor no es falsificable por payload; cierre/reapertura registran motivo según regla acordada; todas las entradas UI/import/API respetan invariantes.
- **Riesgo / dificultad / esfuerzo:** alto · alta · **16–32 h**.

### B019 — Hacer consistente la persistencia de campos personalizados

- **Prioridad / área:** P1 · Formularios.
- **Descripción:** elegir edición online con error explícito o comandos offline durables para definiciones; no reportar éxito local tras fallo remoto. Corregir opciones de selección múltiple y serialización; versionar definición cuando cambia tipo o se elimina una opción usada.
- **Motivo:** campos pueden existir solo en un dispositivo y perderse; multiselección no conserva sus opciones correctamente.
- **Archivos/componentes:** `src/services/camposService.ts`, `src/components/plano/GestorCampos.tsx`, `CampoRenderer.tsx`, `src/db/dexie.ts`.
- **Dependencias:** B005 si se ofrece offline; B016 y B002 para esquema/permisos.
- **Aceptación:** error de red no produce falso guardado; otro dispositivo obtiene definición/opciones; caracteres especiales se conservan; migración de campos usados no destruye valores; T14 corregido.
- **Riesgo / dificultad / esfuerzo:** medio · media · **12–24 h**.

### B020 — Hacer verificable y segura la restauración de snapshots

- **Prioridad / área:** P1; deshabilitar restore antes del piloto mientras falle · Recuperación funcional.
- **Descripción:** definir qué cubre un snapshot y su versión; restaurar con transacción/comando, preview y conteos de cambios; comprobar copia previa y cada resultado. Declarar explícitamente exclusiones de archivos/modelos si siguen fuera de alcance.
- **Motivo:** el servicio devuelve true aunque fallen todas las actualizaciones; la UI ignora un posible fallo del snapshot previo.
- **Archivos/componentes:** `src/services/versionesService.ts`, `src/components/plano/ModalVersiones.tsx`, `VistaPlano.tsx`, `ComparadorVersiones.tsx`; RPC/migración.
- **Dependencias:** B004/B013/B016/B018.
- **Aceptación:** permisos/red/error de una fila no terminan como éxito; restore completo conserva campos del contrato; backup previo verificado; prueba de rollback y concurrencia; T08 corregido. Hasta entonces el botón no debe permitir restauraciones.
- **Riesgo / dificultad / esfuerzo:** alto, puede sobrescribir datos · alta · **16–28 h**.

### B021 — Unificar el ciclo de vida de fotos, videos y derivados

- **Prioridad / área:** P1 · Evidencia/Storage.
- **Descripción:** entidad de archivo original/derivado con path canónico y estado de carga; compensación de fallos y limpieza de huérfanos con inventario y retención. Actualizar anotaciones y videos; MIME/límites/cuotas servidor; liberar FFmpeg y recursos en cancelación.
- **Motivo:** editar cambia URL sin path, borrar mezcla pasos no atómicos y videos no siguen el mismo registro; límites solo cliente son insuficientes.
- **Archivos/componentes:** `src/services/fotosService.ts`, `editorFotoService.ts`, `src/components/plano/EditorFoto.tsx`, `CampoVideo.tsx`, `src/db/dexie.ts`, buckets y worker de limpieza nuevo.
- **Dependencias:** B002/B005/B011/B016.
- **Aceptación:** fallo entre upload y metadata se recupera; borrar/editar no deja referencias rotas; original preservado; limpieza primero ofrece dry run; usuario ajeno no sube/baja; archivo sobredimensionado o formato no admitido se rechaza en servidor; cancelación libera recursos.
- **Riesgo / dificultad / esfuerzo:** alto, eliminación y migración de archivos · alta · **24–40 h**.

### B022 — Modelar organizaciones, miembros e invitaciones reales

- **Prioridad / área:** P1; requisito antes de SaaS multiempresa · Tenancy.
- **Descripción:** definir organización, membresía y roles de proyecto; asignaciones por ID sin perder texto histórico. Reemplazar miembros/invitaciones simulados; tokens de invitación limitados, expirables y de un uso. Migrar proyectos existentes con propietario confirmado.
- **Motivo:** la aplicación está centrada en proyectos y no tiene aislamiento organizacional explícito ni administración real de miembros.
- **Archivos/componentes:** schema/RLS; `src/components/views/Configuracion.tsx`, `Responsables.tsx`, `Contratistas.tsx`; stores y tipos; nuevo servicio de membresías.
- **Dependencias:** B001/B002/B016/B017; B003 para namespace local.
- **Aceptación:** alta/invitación/aceptación/revocación funcionan con dos organizaciones; admin de A no cambia B; revocación corta acceso posterior; no queda proyecto huérfano; migración mantiene OTs y evidencia; pruebas API/UI verifican roles.
- **Riesgo / dificultad / esfuerzo:** alto · alta · **32–64 h**.

### B023 — Construir historial auditable de la orden

- **Prioridad / área:** P1 · Trazabilidad.
- **Descripción:** eventos append-only servidor para creación, campos relevantes, ubicación, asignación, estado, evidencia y reapertura; actor/instante servidor, origen, versión y correlation_id. Integrar comentarios preservando IDs/historia; timeline paginada con permisos.
- **Motivo:** timestamps, comentarios y heartbeat actuales no reconstruyen quién cambió cada dato; antecedente de trigger de borrado cubre solo una parte.
- **Archivos/componentes:** servicios de comentarios, `src/components/plano/HistorialComentarios.tsx`, `PanelComentarios.tsx`, schema y nueva timeline.
- **Dependencias:** B018/B021/B022; B016.
- **Aceptación:** cada mutación del flujo crítico genera evento consultable; usuario normal no puede alterar/borrar historia; import/offline identifican origen sin falsificar actor; retención definida; no se inventa historia anterior inexistente.
- **Riesgo / dificultad / esfuerzo:** alto de diseño de datos · alta · **24–40 h**.

### B024 — Preparar operación, despliegue y recuperación de versión

- **Prioridad / área:** P1 · DevOps/soporte.
- **Descripción:** documentar staging/producción, variables sin valores, HTTPS/domino, headers, releases, migraciones, rollback compatible, actualización del service worker, alertas mínimas y responsables. Validar restauración y runbook de incidentes.
- **Motivo:** faltan pipeline, evidencia de hosting, monitoreo y práctica operacional reproducible en el repo.
- **Archivos/componentes:** nueva documentación operativa y configuración del hosting elegido; `.env.example`, `vite.config.ts`, CI, monitor externo.
- **Dependencias:** B001/B013/B015/B016; integrar B028.
- **Aceptación:** una persona distinta despliega staging desde commit y vuelve a versión compatible; se prueba PWA antigua con backend nuevo; alerta útil llega al responsable en simulacro; no se imprimen secretos en logs ni build.
- **Riesgo / dificultad / esfuerzo:** alto si se ejecuta en producción, medio en ensayo · media · **16–32 h**.

## D — Escalabilidad

Los IDs se mantienen estables por área; la ejecución sigue dependencias y gates, no el orden numérico.

### B025 — Paginar datos y obtener agregados completos

- **Prioridad / área:** P2; adelantar si el piloto supera límites · Consultas.
- **Descripción:** medir límites y volúmenes; paginación por cursor estable y totales autorizados en servidor. Separar lista visible de conjunto completo usado por estadísticas/export; revisar índices con planes de consulta reales.
- **Motivo:** SELECT sin paginación puede truncar resultados o crecer sin límite de memoria.
- **Archivos/componentes:** `src/stores/ordenesStore.ts`, `proyectosStore.ts`, `src/services/statsService.ts`, grilla/dashboard; consultas/índices.
- **Dependencias:** B002/B016; contrato B004.
- **Aceptación:** dataset sintético mayor al máximo API devuelve todos los registros al paginar y totales exactos; filtros no mezclan tenants; orden estable sin duplicados; latencia y presupuesto se miden antes/después.
- **Riesgo / dificultad / esfuerzo:** medio · media · **16–32 h**.

### B026 — Acotar consultas de evidencias y generación de miniaturas

- **Prioridad / área:** P2 · Red/memoria.
- **Descripción:** agrupar fotos por proyecto/lotes, limitar concurrencia, cancelar al cambiar vista y generar thumbnails bajo demanda. Definir cache por tamaño y almacenamiento de derivados; errores parciales visibles en export.
- **Motivo:** informes hacen N consultas secuenciales y el selector puede renderizar muchos PDFs simultáneos.
- **Archivos/componentes:** `src/services/informeService.ts`, `reportService.ts`, `otprojService.ts`, `pdfThumbnailService.ts`, `src/components/proyecto/SelectorProyectos.tsx`, `PlanoThumb.tsx`.
- **Dependencias:** B009/B011/B021/B025.
- **Aceptación:** muestra con cientos de OTs/proyectos mantiene concurrencia y memoria acotadas; no se crean thumbnails fuera de necesidad; cancelación detiene trabajo; informe no omite fotos silenciosamente; registrar reducción de requests/tiempo.
- **Riesgo / dificultad / esfuerzo:** medio · media · **12–24 h**.

## C — Comercialización y calidad percibida

### B027 — Hacer fieles y seguros los exports/imports

- **Prioridad / área:** P1 · Portabilidad/reportes.
- **Descripción:** definir contrato CSV y `.otproj` versionado, campos incluidos y exclusiones; neutralizar fórmulas y quoting; corregir DESPUÉS/DESPUES y descripción de evidencia. Si se promete recuperación portable, implementar importación validada con límites, manifest y reporte de errores; si no, llamarlo export de metadatos.
- **Motivo:** datos extendidos y binarios quedan fuera, fotos de cierre pueden omitirse y CSV interpreta fórmulas.
- **Archivos/componentes:** `src/services/csvService.ts`, `otprojService.ts`, `informeService.ts`, `fotosService.ts`, `src/components/grilla/VistaGrilla.tsx`, `src/components/informes/InformePanel.tsx`, importadores.
- **Dependencias:** B004/B008/B011/B012; B021 para referencias. El alcance portable completo debe estimarse aparte si agrega muchos medios.
- **Aceptación:** round-trip de campos declarados conserva valores; =,+,-,@ y controles no ejecutan fórmulas; fotos antes/durante/después aparecen; manifest distingue faltantes; errores no anuncian éxito; T12/T15 corregidos según alcance elegido.
- **Riesgo / dificultad / esfuerzo:** medio · media · **20–36 h** para contrato/exports y CSV; import portable completo sujeto a reestimación.

### B028 — Observar fallos sin registrar contenido sensible

- **Prioridad / área:** P1 · Diagnóstico/privacidad.
- **Descripción:** retirar logs de filas/payloads; logger por nivel/entorno con IDs de correlación y eventos de sync/upload/export. Capturar errores no manejados con redacción y política de retención; mensajes de UI distinguen pendiente, guardado y fallido.
- **Motivo:** consola imprime datos de órdenes mientras faltan métricas útiles para soporte.
- **Archivos/componentes:** `src/stores/ordenesStore.ts`, `src/sync/SyncManager.ts`, servicios y punto de entrada; proveedor de telemetría elegido.
- **Dependencias:** ninguna para retirar logs; B005/B024 para correlación operacional.
- **Aceptación:** simular fallo identificable por operation_id sin textos, costos, tokens ni URLs firmadas en el registro; producción respeta nivel; usuario puede reportar el ID; no se pierde el error al cerrar una pantalla.
- **Riesgo / dificultad / esfuerzo:** bajo-medio · media · **8–16 h**.

### B029 — Dividir cargas pesadas y liberar recursos del visor

- **Prioridad / área:** P2 · Rendimiento, etapa D.
- **Descripción:** lazy load real de 3D, reportes y vistas pesadas; medir y corregir imports estáticos que anulan chunks. Revisar destroy/cancel de PDF, blob URLs, canvas y workers al navegar/desmontar.
- **Motivo:** bundle inicial de 2,19 MB y procesamiento de archivos en cliente afectan tablet/red de obra.
- **Archivos/componentes:** `src/App.tsx`, `src/components/plano3d/VisorPlano3D.tsx`, `src/components/plano/VistaPlano.tsx`, `src/services/pdfThumbnailService.ts`, reportes, `vite.config.ts`.
- **Dependencias:** B009; B040 para dispositivo objetivo.
- **Aceptación:** 3D no se descarga al abrir login/2D; métricas comparables de carga y memoria; ciclos repetidos abrir/cerrar plano no muestran crecimiento sostenido atribuible a recursos retenidos; PWA precache sigue dentro del presupuesto acordado.
- **Riesgo / dificultad / esfuerzo:** medio · media · **12–24 h**.

### B030 — Eliminar promesas falsas de los flujos visibles

- **Prioridad / área:** P2; adelantar botones engañosos antes del piloto · UX.
- **Descripción:** inventariar acciones simuladas de configuración, invitación, billing, cuenta, calendario y OAuth; conectar las esenciales o mostrarlas explícitamente no disponibles. Consistencia de mensajes y navegación hacia OT/proyecto.
- **Motivo:** éxito simulado o botón sin acción erosiona confianza aunque el núcleo funcione.
- **Archivos/componentes:** `src/components/views/Configuracion.tsx`, `Calendario.tsx`, `src/components/ui/AuthForm.tsx`, `src/App.tsx`, ayuda.
- **Dependencias:** coordinar B017/B022; no incluye implementar billing.
- **Aceptación:** recorrido guiado de cada acción visible produce resultado real, error fiel o estado deshabilitado explicado; ningún setTimeout simula persistencia; documentación coincide con alcance de piloto.
- **Riesgo / dificultad / esfuerzo:** bajo · baja · **4–8 h**.

### B031 — Preparar onboarding, administración y documentación de cliente

- **Prioridad / área:** P2 · Producto comercial.
- **Descripción:** guiar primer proyecto/plano/OT/evidencia/informe, explicar estados offline y roles; parametrizar marca/contacto de informes cuando corresponda. Documentar ayuda, soporte y procedimiento de alta del primer cliente.
- **Motivo:** una interfaz existente no equivale a una operación comercial repetible; hay marcas e instrucciones incrustadas.
- **Archivos/componentes:** `src/components/ayuda/*`, `src/components/proyecto/ModalNuevoProyecto.tsx`, configuración, `src/services/reportTemplates.ts`, `reportService.ts`; guía de usuario.
- **Dependencias:** B017/B022/B030 y alcance de piloto acordado.
- **Aceptación:** persona sin guía del desarrollador completa flujo principal con datos de prueba; informe usa identidad correcta; ayuda explica pending/error/offline y recuperación; soporte tiene pasos reproducibles.
- **Riesgo / dificultad / esfuerzo:** bajo-medio · media · **12–24 h**.

### B032 — Llevar IA a un backend autorizado antes de habilitarla

- **Prioridad / área:** P1 condicional; P0 antes de cargar clave real · Integración IA.
- **Descripción:** proxy/función servidor autenticada con secreto fuera del bundle, permisos por proyecto, presupuesto, rate limit, timeouts y minimización de datos. Mantener función deshabilitada hasta tener esa infraestructura.
- **Motivo:** `VITE_ANTHROPIC_API_KEY` sería público si tuviera valor real; hoy solo se observó placeholder.
- **Archivos/componentes:** `src/services/iaService.ts`, `.env.example`, consumidores; nuevo endpoint y secreto servidor.
- **Dependencias:** B001/B002/B024; decisión de alcance y proveedor.
- **Aceptación:** build/red del cliente no contienen clave privada; usuario ajeno no invoca sobre datos ajenos; cuotas/errores/timeouts probados; logs sin prompts sensibles; función sigue opcional y no bloquea flujo de OT.
- **Riesgo / dificultad / esfuerzo:** medio, consumo y confidencialidad · media · **16–32 h**.

## E — Plataforma e interoperabilidad

### B033 — Inspeccionar Fio Pro y acordar un contrato mínimo

- **Prioridad / área:** P2 · Arquitectura compartida.
- **Descripción:** auditar en Fio Pro identidad, organizaciones, proyectos, permisos, IDs, archivos y stack; escoger un flujo vertical de interoperabilidad y propietario de cada entidad/campo. Registrar ADR y matriz de mappings.
- **Motivo:** no se tuvo acceso a ese repositorio; asumir compatibilidad o extraer módulos ahora puede duplicar problemas.
- **Archivos/componentes:** repositorio Fio Pro aún no inspeccionado; nuevos ADR/contratos de integración; modelos de Plan-OTs.
- **Dependencias:** acceso al repo/documentación de Fio Pro y responsable del producto; no necesita cambios de producción.
- **Aceptación:** diagrama de flujo concreto, ownership, autenticación, tenant mapping, errores y límites; ejemplo versionado del contrato y prueba de compatibilidad acordada; incertidumbres explícitas.
- **Riesgo / dificultad / esfuerzo:** bajo de implementación, alto de suposición · media · **12–24 h**.

### B034 — Extraer el primer paquete reutilizable con adaptadores

- **Prioridad / área:** P3 · Módulos compartidos.
- **Descripción:** seleccionar un paquete de alcance pequeño tras B033: contratos espaciales, renderer 2D/anotaciones o templates puros. Separar dominio de Zustand/Supabase y proveer adaptadores; versionado y ejemplos consumidores.
- **Motivo:** copiar stores y servicios acoplados crearía implementaciones divergentes; extraer todo de una vez sería un refactor innecesario.
- **Archivos/componentes:** candidatos `src/components/plano/VistaPlano.tsx`, `Marcador.tsx`, `EditorFoto.tsx`, `src/services/reportTemplates.ts`, `src/types/orden.ts`; paquete nuevo.
- **Dependencias:** B033 y estabilización de A; B037 si el paquete elegido contiene anclajes.
- **Aceptación:** Plan-OTs y ejemplo/consumidor Fio Pro usan la misma versión sin imports internos de la otra app; contratos probados; comportamiento existente conservado; publicación y actualización documentadas.
- **Riesgo / dificultad / esfuerzo:** medio-alto de acoplamiento · alta · **24–48 h** para un paquete, no para todos.

### B035 — Exponer una API versionada y autorizada de integración

- **Prioridad / área:** P2 · APIs.
- **Descripción:** implementar primer flujo B033 con `/v1`, tokens verificados, scopes/tenant, paginación, errores estables e idempotencia. Mapear IDs externos sin usar nombres/URLs; deep links a proyecto/OT con chequeo de permiso.
- **Motivo:** escritura directa de dos apps en las mismas tablas saltaría reglas de dominio y complicaría cambios de schema.
- **Archivos/componentes:** nueva capa API/contratos; B018 comandos; `src/App.tsx` o navegación; modelo de mappings.
- **Dependencias:** B018/B022/B033; B024 para operación.
- **Aceptación:** llamada válida del consumidor funciona; tokens con issuer/audience/scope incorrectos fallan; tenant ajeno rechazado; reintento conserva resultado; contrato y ejemplo ejecutable no contienen service_role del servidor.
- **Riesgo / dificultad / esfuerzo:** alto de límite de confianza · alta · **16–32 h** para primer flujo.

### B036 — Publicar eventos con outbox y recuperación

- **Prioridad / área:** P3 · Integración asíncrona.
- **Descripción:** outbox transaccional, worker, webhook firmado y consumidor idempotente con replay protection, reintentos y cola de fallos; cursor de reconciliación y dueño por campo. No implementar bidireccionalidad sin reglas de conflicto.
- **Motivo:** Realtime de navegador no es entrega durable entre productos.
- **Archivos/componentes:** nueva tabla outbox/worker/API y consumidor Fio Pro; eventos B023.
- **Dependencias:** B018/B023/B033/B035.
- **Aceptación:** caída del consumidor, entrega duplicada y fuera de orden no pierden cambios ni producen bucle; firma inválida/replay rechazados; evento fallido puede reintentarse; reconciliación detecta y recupera huecos.
- **Riesgo / dificultad / esfuerzo:** alto · alta · **24–48 h**.

## F — BIM / 3D

### B037 — Introducir documentos versionados y ubicación jerárquica

- **Prioridad / área:** P3; preparar contratos antes de ampliar planos · Fundamentos espaciales.
- **Descripción:** separar proyecto/activo/edificio/piso/sector/ambiente, documento/revisión/página y anclaje de OT. Preservar UV del plano original con transformaciones/unidades/revisión explícitas; permitir varias localizaciones y referencias externas sin exigir BIM.
- **Motivo:** un plano por proyecto y dos números sin revisión no soportan varios pisos, planos ni modelos de forma trazable.
- **Archivos/componentes:** esquema nuevo, `src/types/orden.ts`, `src/stores/proyectosStore.ts`, `ordenesStore.ts`, `src/components/plano/VistaPlano.tsx`, import/export; contratos espaciales.
- **Dependencias:** B016/B021/B023; coordinación con B033, sin requerir extraer paquete primero.
- **Aceptación:** proyecto legado mantiene todos sus pins; nuevo proyecto tiene varios documentos/páginas/revisiones; OT abre su revisión original y ubicación jerárquica; anclaje sin posición es válido; originales se preservan; transformación invertible con fixtures.
- **Riesgo / dificultad / esfuerzo:** alto de migración · alta · **120–220 h**.

### B038 — Construir un piloto IFC con procesamiento y visor

- **Prioridad / área:** P3 · BIM.
- **Descripción:** escoger motor mediante modelos representativos/licencias; pipeline asíncrono aislado que preserve IFC original, extraiga propiedades/GlobalId/jerarquía y genere derivados web. Visor permite selección, búsqueda de elemento y viewpoint de OT con descarga autorizada.
- **Motivo:** el visor GLB de ejemplo no procesa IFC, semántica BIM ni archivos de clientes.
- **Archivos/componentes:** `src/components/plano3d/*`, nuevo worker/cola/job API, Storage y contratos de modelos/revisiones.
- **Dependencias:** B011/B021/B024/B037; muestras reales autorizadas y objetivos de tamaño/dispositivo.
- **Aceptación:** modelos acordados completan conversión o reportan error/cancelación; elemento se selecciona por ID de revisión, propiedades y permisos correctos; progreso/memoria medidos; retry no duplica artefactos; sin URL fija del modelo demo.
- **Riesgo / dificultad / esfuerzo:** alto por formato, memoria y licencias · alta · **140–280 h** para piloto acotado.

### B039 — Validar correspondencia 2D↔3D y continuidad entre revisiones

- **Prioridad / área:** P3 · Precisión/trazabilidad espacial.
- **Descripción:** almacenar calibraciones/transformaciones y tolerancia; anclaje local al elemento, posición global/local, unidad, revisión y viewpoint. Resolver cambio de GlobalId/elemento eliminado mediante candidatos y validación, sin reasignar silenciosamente; medir error con puntos conocidos.
- **Motivo:** GlobalId no garantiza continuidad de todas las exportaciones y una coordenada no garantiza precisión física.
- **Archivos/componentes:** contratos B037, visor 2D/3D, registro de correspondencias y herramienta de calibración nuevos.
- **Dependencias:** B037/B038; modelos/planos con referencias verificables.
- **Aceptación:** mismo punto se ubica dentro de tolerancia acordada en ambos visores; revisiones mantienen anclaje o exponen conflicto; cambio de unidad/origen no desplaza silenciosamente OTs; informe registra fuente de precisión y revisión.
- **Riesgo / dificultad / esfuerzo:** alto · alta · **60–140 h**. Junto con B038: +200–420 h después de fundamentos.

## C — Validación de campo y cierre operativo

### B040 — Validar tablet, PWA y trabajo offline en dispositivos reales

- **Prioridad / área:** P1, gate de piloto · QA de campo.
- **Descripción:** acordar dispositivos/navegadores y matriz de red, suspensión, cuota llena, reinicio, actualización PWA, edición multicuenta y archivos grandes. Ejecutar recorrido con observador y registrar tiempos, pérdidas, consumo y problemas táctiles/accesibilidad esenciales.
- **Motivo:** build y mocks no prueban IndexedDB, cámara, memoria ni background en el equipo de obra.
- **Archivos/componentes:** app completa, `src/styles/tablet.css`, hooks tablet/fullscreen, visor, cámara, `vite.config.ts`; plan de prueba.
- **Dependencias:** A y B015; diseño del ensayo puede comenzar antes.
- **Aceptación:** matriz con evidencia por dispositivo; ninguna pérdida silenciosa; pending/error/éxito correctos tras reinicio; zoom/tacto/cámara utilizables; límites conocidos documentados y bloqueantes resueltos o función retirada del alcance.
- **Riesgo / dificultad / esfuerzo:** medio de cobertura · media · **16–32 h** de ensayo, correcciones adicionales se asignan a su tarea.

### B041 — Definir retención, exportación, eliminación y soporte

- **Prioridad / área:** P1 · Operación comercial/privacidad.
- **Descripción:** inventario de datos, accesos y proveedores; política del producto para export/retención/borrado, bajas de miembros y cierre de organización. Implementar proceso autorizado, verificable y recuperable donde corresponda; asesoría legal local valida términos, no este informe.
- **Motivo:** eliminación de cuenta simulada y archivos/caches dispersos impiden cumplir una promesa fiable de administración de datos.
- **Archivos/componentes:** configuración/cuenta, Auth, DB, Storage, caches, logs/backups; documentación de privacidad/soporte y procedimiento nuevo.
- **Dependencias:** B003/B013/B021/B022/B027; decisiones comerciales/legales del responsable.
- **Aceptación:** solicitud de prueba exporta el alcance declarado y una baja elimina/restringe datos según política, incluyendo derivados; conserva auditoría mínima justificada; no borra otra organización; retención de backups y límites del borrado se explican fielmente.
- **Riesgo / dificultad / esfuerzo:** alto por eliminación irreversible · alta · **24–40 h** de ingeniería, revisión legal excluida.

### B042 — Reducir deuda de lint, duplicados y documentación obsoleta

- **Prioridad / área:** P2 · Mantenibilidad.
- **Descripción:** resolver errores de hooks/immutabilidad/tipos según intención, no desactivando reglas globalmente; retirar código/assets/backups solo tras rastrear importaciones y comprobar uso. Actualizar arquitectura, variables y docs que contradicen comportamiento actual.
- **Motivo:** 57 errores/16 advertencias, ramas de informes antiguas y auditorías contradictorias dificultan cambios seguros.
- **Archivos/componentes:** archivos del reporte `evidencias/eslint.json`, `src/services/reportService.ts`, módulos duplicados dashboard/thumbnail, assets de plantilla, documentación histórica.
- **Dependencias:** correcciones funcionales de A; B015 para regresión. Archivo histórico puede conservarse claramente fechado en vez de borrarse.
- **Aceptación:** lint pasa en alcance del producto sin supresión general; efecto corregido preserva comportamiento; código retirado no tiene consumidor; documentación diferencia vigente/histórico; bundle/build y recorrido crítico siguen pasando.
- **Riesgo / dificultad / esfuerzo:** medio · media · **12–24 h**.

## F — Exploración avanzada

### B043 — Validar SketchUp y navegación indoor antes de prometerlos

- **Prioridad / área:** P3 · Factibilidad.
- **Descripción:** evaluar export interoperable frente a SDK/servicio autorizado para SKP con costos/licencias; estudiar navegación por jerarquía/QR frente a posicionamiento indoor medido. Preparar spike de muestras sin convertir el prototipo en promesa comercial de precisión.
- **Motivo:** SKP no es equivalente a GLB/IFC y el navegador no determina por sí solo posición física precisa en interior.
- **Archivos/componentes:** documentación/pipeline de modelos nuevos, contratos B037, visor y prototipo de navegación; sin cambios al núcleo hasta concluir factibilidad.
- **Dependencias:** B033/B037; muestras SketchUp, caso de uso, hardware y tolerancia requerida.
- **Aceptación:** matriz de formatos/licencias/tamaños, resultado de conversión representativo, método de identidad espacial y error medido; recomendación go/no-go y estimación separada para implementación; ninguna precisión no demostrada en materiales comerciales.
- **Riesgo / dificultad / esfuerzo:** alto de incertidumbre · alta · **24–60 h** de investigación aplicada, implementación completa excluida.

## Orden recomendado del primer lote

1. B001 y baseline de B016; simultáneamente preparar B004/B008/B009/B010/B014 y retirar acciones engañosas de alto impacto.
2. B002/B003/B005/B006/B007; introducir regresiones de B015 mientras se corrige cada comportamiento.
3. B011/B012/B013, limitar restore hasta B020, completar estados de error y ensayar B040.
4. Reestimar con evidencia del servidor y dispositivos; aprobar alcance del piloto contra gates del informe, luego B/C.

La dependencia entre B018 y B021 se resuelve por contrato: B021 define evidencia confirmada antes de integrar el cierre transaccional B018. No se necesita implementar webhooks, IFC, billing automático ni todos los paquetes compartidos para el primer cliente.
