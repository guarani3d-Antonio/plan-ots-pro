# Respaldo y recuperación de Plan-OTs

Estado al 12/10/2026: el propietario activó R2 y se creó el bucket privado Standard
`plan-ots-respaldos`. El propietario autorizó dos credenciales limitadas a ese bucket,
con vencimiento el 18/10/2026: lectura/escritura en el entorno `respaldo` de GitHub y
sólo lectura en los secretos de Supabase. El propietario restableció la contraseña
PostgreSQL y se guardó `BACKUP_DATABASE_URL` en GitHub. Se ejecutó una única copia real.
La sonda corregida pasó (Actions 38253879967). Una ejecución sin tareas pasó
(38254815144) y registró el motor. La solicitud única del piloto es
`add48229-f81c-434b-9608-5e618501cd91`; fue registrada desde SQL administrativo
con guardas de destino, motor y ausencia de otras solicitudes. No hubo suplantación
de sesión ni cambios de permisos. La ejecución 38256255074 creó el paquete privado:
196362693 bytes, 229 originales de Storage, 53 tablas públicas y 3663 registros.
SHA-256: `594abcf6fa71bb56c2fcdac44328eeec7158b310914820ef564ece0972690ad2`.
La integridad pasó; el ensayo nativo falló y NO está certificado. El job global
terminó en success porque conserva una copia íntegra incluso si falla el ensayo.
Se descargó una vez desde el panel R2 al equipo del propietario y se comprobó
la misma huella. El motor manual quedó apagado (`BACKUP_RUNNER_ENABLED=false`),
la programación sigue apagada y el portal permanece simulado.
Ambos clientes del motor exigen TLS con certificado y nombre de servidor verificados.
La primera sonda falló antes de transferir datos porque faltaba la CA de Supabase.
El panel Database Settings entrega `supabase-prod-ca-2021.crt`, certificado público
oficial con huella SHA-256 `807025ad50d4ed219d2c9c7d299c004f824eb00cf7f65afef607d07b72e6cafa`.
Node y libpq lo utilizan para validar CA y hostname; no se desactiva esa verificación.
Fuente: https://supabase.com/docs/guides/platform/ssl-enforcement.
La función `descargar-respaldo` está desplegada con verificación JWT; se comprobó
rechazo sin sesión (401) y del usuario público (403). El frontend de producción
incluye la bandera de descarga. Su descarga positiva con JWT aún no está validada:
el navegador integrado falla en consultas de red y la descarga única se hizo desde R2.
La preparación incluye cola, inventario,
estado operativo y frontend; una copia íntegra no equivale a recuperación verificada.
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
La clave `principal` está en GitHub y tiene una copia local en
`backups/private-keys/principal.dpapi.xml`, excluida de Git y protegida por permisos
del propietario. Ese archivo usa DPAPI: requiere la misma cuenta de Windows y no
constituye por sí solo una custodia portátil o independiente de esta computadora.
Antes de dar por completa la recuperación operativa, el propietario debe conservar
la clave en un gestor de contraseñas o medio seguro independiente.
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
El propietario activó R2: US$0 de base más cobro por excedentes. La prueba acotada
reserva 300 MB de paquete y 300 MB de egreso de Supabase; la estimación es US$0
dentro de los cupos disponibles. Revalidarlos antes de la transferencia, pues se
comparten con otros usos de la cuenta. https://developers.cloudflare.com/r2/pricing/

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
servicio o el puente `supabase/functions/descargar-respaldo`, preparado y probado
localmente y desplegado con sus secretos limitados. Usa el JWT de Creador, RLS y una
credencial separada **sólo lectura** para el bucket de copias. Compara el tamaño y
el SHA-256 registrado en los metadatos remotos antes de firmar un GET de 60 segundos;
la verificación completa de bytes corresponde al motor. El puente no recibe clave
de cifrado ni contraseña PostgreSQL. Secretos exclusivos de Edge Functions:
`BACKUP_R2_ENDPOINT`, `BACKUP_R2_BUCKET`, `BACKUP_R2_DOWNLOAD_ACCESS_KEY_ID`,
`BACKUP_R2_DOWNLOAD_SECRET_ACCESS_KEY`. Mantener `verify_jwt=true`.
Después de desplegar, configurar y verificar el puente, publicar el frontend con
`VITE_BACKUP_DOWNLOAD_FUNCTION_ENABLED=true`; esa bandera no contiene credenciales.
La alternativa de servidor permanente conserva `VITE_BACKUP_SERVICE_URL`.
La interfaz lo indica y no ofrece un enlace ficticio.

El workflow distingue `comprobar-conexion` (sonda explícita de 64 bytes) de
`procesar-cola` (una tarea y su ensayo). `BACKUP_RUNNER_ENABLED` permite pruebas
manuales; la programación horaria además exige `BACKUP_SCHEDULE_ENABLED=true`.
El piloto manual habilitó temporalmente `BACKUP_RUNNER_ENABLED` y lo devolvió a
`false` tras la ejecución; la variable de
programación sigue sin activar. La programación interna de Supabase también
continúa apagada. La rama por defecto se comprobó en GitHub: **tablet-v1**.
Presupuesto Actions observado: **US$0, Stop usage: Yes**. Las sondas y el motor
sin tareas pasaron; el ensayo real tiene su propio resultado fallido.

## Primera prueba acotada: copia íntegra, recuperación pendiente

El propietario aceptó R2 y aprobó una copia, un ensayo y una descarga con reserva
de 300 MB y programación apagada. Las credenciales ya están conectadas. Las pruebas locales
usan datos ficticios y no consumen R2/Supabase. Para la primera prueba remota:

1. Revisar consumo disponible en Supabase y R2, custodiar la clave y conectar.
2. Una sonda de conexión; una ejecución del motor sin trabajo para registrar señal.
3. Solicitar **una** copia de plataforma y procesarla una vez con recuperación
   aislada incluida. Leer de nuevo ese mismo archivo y descargarlo una vez.
4. Detenerse, presentar tamaños/operaciones reales y resultado. No activar el
   horario recurrente ni recepción persistente hasta la validación y aprobación.

Referencia actual: 194.8 MB decimales de archivos, base física 20.8 MB; no es
medición de paquete final. Reserva prudente para una copia: 300 MB. Storage de
origen se lee una vez (~195 MB); también se exportan tablas y el dump. Para esa
primera lectura, reservar 300 MB de egreso de Supabase y comprobar el cupo restante.
Las verificaciones posteriores usan R2. Una copia,
lectura de comprobación y descarga representarían alrededor de 900 MB de flujo
R2 con esa reserva, no 900 MB almacenados. R2 Standard no cobra egreso. Manteniendo
la cuenta dentro de sus cupos gratuitos, costo incremental esperado: **US$0**.
No es una garantía: otros buckets, crecimiento y operaciones comparten los cupos.
R2 tiene términos con cobro por excedentes aceptados por el propietario. La referencia
de 14 copias de 300 MB sería 4.2 GB retenidos, sin crecimiento ni rotación automática.
El motor actualmente limita fuentes a 256 MiB y falla al superarlo, en vez de
continuar consumiendo sin límite. No aumentar ese límite sin volver a estimar.
Fuentes: https://developers.cloudflare.com/r2/pricing/ y
https://docs.github.com/en/billing/concepts/product-billing/github-actions.

La corrección `202610110002_backup_latest_recovery.sql` está probada localmente y
instalada en el servidor el 11/10/2026: una copia o un ensayo posterior sin
recuperación comprobada bloquea la activación, aunque exista un éxito anterior.
Volver a verificar una copia antigua registra también la fecha de ese intento.

### Laboratorio previo sin consumo de datos reales

El inventario del servidor mostró PostgreSQL 17.6, pg_stat_statements 1.11,
pgcrypto 1.3, supabase_vault 0.3.1 y uuid-ossp 1.1. Se consultó el manifiesto
oficial linux/amd64 de `supabase/postgres:17.6.1.095`, fijado por digest en
`PILOT_LAB_IMAGE`. No dar por comprobada su ejecución hasta finalizar el ensayo.
La imagen usa por defecto `supabase_admin` y configuración/migraciones iniciales.
El laboratorio utiliza PostgreSQL vacío, usuario local postgres, configuración
explícita, extensiones exactas, sin red ni puertos y sólo volúmenes temporales.
No modifica usuarios, autenticación ni configuración del servidor productivo.

`npm run backup:lab-check` exporta datos ficticios con referencias, bigint/numeric,
Auth, metadatos y un archivo binario, cifra el paquete y lo recupera con el mismo
código del motor. No recibe credenciales ni consulta Supabase/R2. El workflow
manual `comprobar-laboratorio` tiene un job separado sin entorno de secretos;
el procesamiento real también exige que este preflight pase antes de transferir.
Las acciones oficiales se fijaron a los commits observados del tag v4.
El primer preflight falló antes de descargar la imagen: Ubuntu 24.04 trae cliente
PostgreSQL 16, no 17. El workflow prepara el cliente 17 desde el repositorio firmado
oficial de PostgreSQL en el ejecutor temporal; no instala software en la notebook.
Fuente: https://www.postgresql.org/download/linux/ubuntu/ y el inventario oficial
https://github.com/actions/runner-images/blob/main/images/ubuntu/Ubuntu2404-Readme.md.

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
`npm run build` verifica integración de interfaz. El ensayo Docker/pg_restore con
datos sintéticos pasó en GitHub Actions (ejecución 38169984543). La copia real R2,
su lectura de comprobación y una descarga se completaron el 12/10/2026. La recuperación
nativa de esa copia falló y debe diagnosticarse usando el mismo archivo, sin crear
otra copia ni volver a leer originales de Supabase. No confundir el laboratorio
sintético ni el diagnóstico local PGlite con recuperación nativa comprobada.

El segundo ensayo nativo autorizado sobre el mismo paquete (ejecución
38263296992, commit b17e42b) comprobó otra vez su integridad y localizó el fallo
en comparar_tablas / ordenes / huellas_distintas. No creó otra copia ni volvió a
descargar originales de Supabase. El motor manual quedó apagado.

El diagnóstico offline recuperó el TOC y las filas en PGlite. La configuración
real del origen, comprobada en pg_settings el 12/10/2026, es UTC con
extra_float_digits=0; el laboratorio había usado 1. Con 0 coinciden exactamente
las 53 tablas locales, mientras que 1, 2 y 3 discrepan en ordenes y
ordenes_eliminadas. Esto identifica una diferencia de representación de las
coordenadas, sin demostrar todavía recuperación nativa completa, Auth y archivos.

El laboratorio reproduce los ajustes capturados en cada paquete. Para el primer
paquete, que no los incluía, utiliza los ajustes de su origen verificado. Las
copias futuras fijan extra_float_digits=3 sólo en la sesión de exportación y lo
registran: también conservan precisión de ida y vuelta en copias de empresa con
dump de esquema. No se redondean filas ni se aplica tolerancia a las huellas.
Las pruebas locales cubren esta diferencia y detectan coordenadas modificadas.
El preflight sintético incorpora coordenadas y fechas con microsegundos.

Los fallos registran etapa, categoría fija y número TOC si está disponible;
nunca stderr sin filtrar, SQL privado, valores COPY ni credenciales. La corrección
está validada localmente; queda pendiente autorizar un único ensayo nativo final
sobre los mismos 196362693 bytes de R2. Programación bloqueada hasta comprobarlo.

## Volver atrás sin perder información

Desactivar programación, detener el motor y retirar la entrada de menú si hiciera
falta. Conservar tablas, paquetes y claves para auditoría y recuperación. No borrar
el historial ni el bucket como parte de una reversión de interfaz.
