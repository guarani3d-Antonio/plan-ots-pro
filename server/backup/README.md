# Respaldo y recuperación de Plan-OTs

Estado al 11/10/2026: R2 pendiente por decisión del propietario. No hay bucket,
credenciales de respaldo ni motor alojado. La preparación incluye cola, inventario,
estado operativo y frontend; no equivale a una copia real ni a recuperación verificada.
La instalación SQL se registra en `output/backup-operativo-20261011`.

## Formato

`plan-ots-<id>.potbackup` es un ZIP cifrado y autenticado con AES-256-GCM.
Incluye JSON de tablas/campos/relaciones, originales de Storage, configuración de
buckets, huellas SHA-256 por entrada y manifiesto con alcance y fecha de corte.
La copia de plataforma incluye un dump PostgreSQL de public/Auth/Storage. La de
empresa incluye el esquema y los registros/archivos de esa empresa, excluyendo
credenciales Auth globales. No se comparte con clientes: primera versión exclusiva
del Creador. Nuevas tablas sin alcance conocido bloquean la copia de empresa.

La clave debe mantenerse en el servidor y en un lugar de recuperación independiente
de R2. Una descarga sin esa clave no puede recuperarse. No regenerar la clave
existente ni rotarla sin conservar las claves de las copias anteriores.
Los secretos de despliegue y configuración de proveedor se custodian por separado.
Un dump recuperable no sustituye esa configuración ni garantiza login en otro
proyecto Supabase. `BACKUP_RELEASE_ID` identifica la aplicación compatible.

“Informe” descarga `verificacion-<id>.json`. No duplica los archivos.
“Verificar” vuelve a leer la copia remota, autentica el cifrado y comprueba cada
huella/tamaño. Con laboratorio configurado también restaura datos y archivos en
un entorno temporal, sin red. En empresa usa identidades de prueba para comprobar
referencias; recuperar en producción exige las identidades originales compatibles.
Esta prueba no certifica login, entrega de correos, visualización de todos los PDF
ni que el despliegue completo de Supabase funcione. Esas comprobaciones se hacen
en la validación final de recuperación, antes de habilitarla en producción.

## Medición observada en Supabase

Consulta de lectura en SQL Editor del proyecto iqgbyqyoovzvhhdjawnt:

| Depósito | Archivos | Bytes |
| --- | ---: | ---: |
| directory-photos | 4 | 519667 |
| exports | 7 | 493049 |
| fotos | 195 | 174016867 |
| planos | 22 | 19729385 |
| profile-photos | 1 | 31409 |
| Total Storage | 229 | 194790377 |

Base física PostgreSQL: 20835475 bytes. Incluye índices y estructuras que pueden
no formar parte del dump; no es el tamaño del paquete. Catorce copias a volumen
constante rondarían 3.02 GB tomando esa referencia. Compresión, metadatos y crecimiento
pueden cambiarlo. El paquete real se mide tras generarlo.

R2 Standard ofrece 10 GB-mes, 1 millón de operaciones A y 10 millones B gratuitos.
La cuenta mostró **R2 sin activar**, US$0 inicial/mensual más consumo adicional,
suscripción con renovación automática y términos que deben aceptar el propietario.
No se aceptaron. https://developers.cloudflare.com/r2/pricing/

El servicio reserva como máximo 8 GB en un bucket exclusivo y detiene nuevas copias
si no caben. No borra copias antiguas automáticamente. Propuesta pendiente de
confirmar: 7 diarias, 4 semanales, 3 mensuales. Sin conservación/borrado activado,
eventualmente habrá que liberar espacio o cambiar el límite; se mostrará fallo,
nunca una copia incompleta como creada. El tope no controla otros buckets, consumo
de operaciones de la cuenta, egreso de Supabase ni alojamiento del motor.

## Conexión después de aceptar los términos

1. Propietario acepta R2 si está de acuerdo con la facturación por excedentes.
2. Crear bucket **privado, Standard**, sin URL pública, exclusivo para estas copias.
   No usar Infrequent Access ni activar un plan Workers pago.
3. Crear una credencial de objetos limitada a ese bucket (lectura/escritura/listado).
   La creación de acceso y la aceptación de términos requieren intervención del
   propietario; no introducir secretos en chats ni en variables `VITE_*`.
4. Instalar el motor en un servidor con Node, pg_dump de versión compatible y
   acceso seguro a PostgreSQL. **R2 almacena; no ejecuta este motor. Cloudflare Pages
   tampoco aloja este proceso Node.** No se ha contratado ese servidor. Si el objetivo
   es cero costo permanente, decidir un alojamiento gratuito adecuado antes de
   activar, considerando memoria/tiempo/disponibilidad y políticas actuales.
5. Configurar variables del `.env.example` en el gestor de secretos del servidor.
   El endpoint HTTP se publica por HTTPS con origen exacto; por defecto solo escucha
   localhost. Frontend: `VITE_BACKUP_SERVICE_URL=https://<servicio>`.
6. Aplicar `supabase/migrations/202610100001_backup_jobs.sql` después de revisión.
7. Ejecutar `npm run backup:check`: hace una lectura de DB y escribe/lee/elimina
   únicamente un pequeño objeto de prueba con nombre aleatorio propio. Solo después
   marca el destino conectado. No activa programación ni crea copias de usuarios.
8. Iniciar `npm run backup:worker` en el servidor. Crear copia manual de prueba,
   comprobarla, descargarla y ensayar recuperación. Antes de aprobar “Verificada”
   como recuperación operativa, validar permisos, numeración OT, PDF, documentos
   congelados, fotos y aplicación compatible en un Supabase de prueba aislado.
9. Elegir frecuencia/conservación y habilitar las copias automáticas desde Creador.
   Una ejecución diaria admite pérdida potencial de hasta 24 horas del servidor;
   dispositivos sin sincronizar están fuera de ese corte.

## Motor y protección

El motor informa una señal después de comprobar R2. Una señal de más de dos horas
se considera atrasada. La activación exige una copia de **plataforma** recuperada en
las últimas 48 horas y motor vigente. `plan_respaldo_listo(tenant)` sólo es ejecutable
por el backend: exige programación activa, copia reciente, recuperación y ausencia de
un fallo posterior a la última copia recuperada. La interfaz consulta el estado con
permiso Creador. Este control es una precondición para el futuro portal; no activa la
recepción pública por sí mismo.

`BACKUP_AUTO_REHEARSAL=true` comprueba la recuperación de cada copia remota después
de crearla. Un fallo del laboratorio conserva la copia íntegra y la distingue de una
recuperación comprobada. No habilita programación ni recepción en ese caso.

### Ejecutor sin servidor permanente (preparado, desactivado)

`.github/workflows/respaldo-operativo.yml` admite un ejecutor temporal de GitHub Actions.
Procesa una tarea por ejecución (`BACKUP_RUN_ONCE=true`), sin publicar el endpoint de
descarga y sin subir archivos descifrados como artifacts. No corre en cada push.
Está bloqueado por la variable **de repositorio** `BACKUP_RUNNER_ENABLED`; no crearla
en `true` hasta verificar R2, secretos, laboratorio y límite de gasto en GitHub.

Antes de activarlo: configurar entorno protegido `respaldo` y las variables/secretos
nombrados en el workflow, comprobar que el runner tenga pg_dump 17 (origen observado:
17.6) y fijar por digest una imagen oficial `supabase/postgres` con las extensiones
compatibles. No adivinar una imagen ni cambiar contraseñas de origen. Las credenciales
se ingresan en el gestor de secretos, nunca en el código ni en el chat. Conservar la
clave maestra también fuera de GitHub y R2. El workflow debe existir en la rama por
defecto para tener programación; el código respaldado debe coincidir con la release.

GitHub Actions dispone de cupos según el plan, compartidos con otros workflows.
No es una garantía de costo cero ni de puntualidad: confirmar presupuesto cero con
bloqueo de excedentes y cupos antes de habilitar. El timeout es de 20 minutos por
ejecución y la revisión horaria limita trabajo a una tarea; medir el consumo real.
https://docs.github.com/en/billing/concepts/product-billing/github-actions
https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule

Para descarga desde la aplicación seguirá haciendo falta el endpoint HTTPS del
servicio o un puente de descarga autenticado que se validará al conectar R2.
La interfaz lo indica y no ofrece un enlace ficticio. El modo temporal no ejecuta
`backup:check`: la prueba inicial de escritura/lectura debe hacerse explícitamente
antes de marcar el destino verificado. No se ha ejecutado un runner remoto.

Cola durable en PostgreSQL, una reserva con vencimiento y máximo cinco intentos
tras caídas; errores funcionales se conservan para diagnóstico. Solicitudes
idempotentes. Un trabajo activo por vez entre instancias limita competencia por
espacio. Corte repeatable-read compartido entre JSON y pg_dump. Se detectan cambios
en el inventario para reutilizar archivos verificados de una copia R2 anterior del
mismo alcance. Se reconstruye un paquete completo: descargarlo no exige disponer
de copias anteriores. Archivos nuevos/modificados se toman de Supabase. Esto reduce
el egreso; descargar 195 MB diarios durante 30 días usaría unos 5.8 GB. Supabase
Free dispone de cupos independientes de 5 GB cacheado y 5 GB sin caché, compartidos
con la aplicación. Reutilización y metadatos se prueban localmente; el ahorro real
debe medirse con las ejecuciones del motor. https://supabase.com/docs/guides/platform/manage-your-usage/egress

Se comparan los metadatos de objetos antes/después de copiar. Esta comprobación no protege contra
una modificación externa del archivo que no cambie los metadatos de Storage; para
una garantía más fuerte deben restringirse sobrescrituras y conservar originales.

Si el motor deja de responder, un destino previamente verificado no garantiza
operación actual. Comprobar últimas copias y fallos; la supervisión externa y alertas
de copia atrasada son pendientes de la activación operativa.

Archivos remotos leídos de nuevo antes de marcar “creada”. Enlaces de descarga
privados de 60 segundos tras autenticar Creador en Supabase. Claves solo backend.
No hay endpoint que reemplace datos productivos. Preparar recuperación exige comparar
con lo actual y conservar un respaldo previo; aplicar requiere aprobación específica.

## Pruebas

`npm run test:backups` prueba PostgreSQL local (PGlite), aislamiento/RLS, permisos,
precisión decimal/bigint, idempotencia, cola/reserva, campos añadidos, cifrado,
alteración, clave incorrecta, límites y alcance por empresa, motor vencido,
fallo posterior y rechazo de programación sin recuperación comprobada.
`npm run build` verifica integración de interfaz. El ensayo Docker/pg_restore,
prueba real R2 y recuperación visual no están ejecutados: faltan herramientas,
activación y credenciales. No confundir esas pruebas pendientes con las locales.

## Volver atrás sin perder información

Desactivar programación, detener el motor y retirar la entrada de menú si hiciera
falta. Conservar tablas, paquetes y claves para auditoría y recuperación. No borrar
el historial ni el bucket como parte de una reversión de interfaz.
