# Circuito QR — piloto instalado y validación controlada

## Estado

Instalación autorizada expresamente por el propietario el 12/10/2026:
migraciones 202610130001 y 202610130002, función portal-reclamos y cliente
con VITE_PORTAL_FUNCTION_ENABLED=true. Publicaciones f5b429c y f1fc6ae
confirmadas exitosas en Cloudflare Pages. La demostración permanece separada.

Piloto activo exclusivamente para Empresa de prueba 1 / Obra número 1
(11000000-0000-4000-8000-000000000001). Vence el 14/10/2026 a las
20:30:17 de Paraguay. Tres de seis cupos usados en los ensayos iniciales;
los tres restantes se reservan para prueba física con teléfono y ayudantes.

El recorrido publicado guardó registros reales con contenido ficticio. No se
declara completa la prueba de campo ni la recuperación de estos nuevos registros
desde R2: falta escaneo físico y una copia ya programada posterior al módulo.

## Límites del piloto

- Solo Creador: una obra activa de una empresa de prueba, durante 48 horas.
- Seis reservas por piloto. Las cargas incompletas también consumen cupo;
  pausar/reactivar no reinicia el contador ni extiende el plazo.
- Hasta tres fotos JPG, PNG o WebP por solicitud; máximo 2 MiB por foto.
  Máximo 36 MiB de originales nuevos por piloto. Tres intentos por carga
  incompleta, con las mismas rutas y los mismos hashes; no multiplican archivos.
- No atiende emergencias; usar datos ficticios y fotografías sin personas ni
  documentos privados. Aviso visible antes de confirmar.
- No activa WhatsApp, correo, IA, eliminación automática ni nuevos permisos para
  el equipo de Ariel.
- El servidor comprueba respaldo activo, motor disponible y última recuperación
  vigente en cada admisión y confirmación. Al cerrar el piloto de respaldos,
  deja de admitir solicitudes, aunque el QR no haya vencido.

El límite de archivos controla almacenamiento, no garantiza un costo total
perpetuamente cero: siguen existiendo consultas y solicitudes al servicio. Este
piloto no debe difundirse públicamente ni sustituye los controles de abuso y la
política de privacidad necesarios para una apertura comercial.

## Conservación y revisión

El servidor resuelve la obra y la empresa a partir del identificador del portal;
no acepta nombres, tenant u obra elegidos por el visitante. El identificador va
en el fragmento del QR, sin introducirlo en el query de logs/referrers.

La recepción registra número único, fecha/hora del servidor, contacto, pedido
original y hashes de evidencia. Los originales son privados. No se entrega un
comprobante hasta confirmar que todas las fotos declaradas están guardadas.
Reintentar el mismo contenido conserva un único reclamo; cambiarlo con el mismo
identificador se rechaza. No existe consulta pública de reclamos por número.

Solo Creador puede revisar. Crear una OT exige un técnico activo autorizado de la
obra; copia pedido, origen, unidad y evidencias, deja ubicación sobre plano
pendiente y asigna número por el mecanismo existente. Vincular solo admite una
OT de la misma obra/empresa y conserva su texto original y documentos anteriores.
Archivar conserva todo y exige motivo. Cada decisión registra actor y fecha.

Se reutiliza el bucket privado fotos y las referencias privadas existentes de
proyecto; no se duplican binarios al convertir a OT. Nuevas tablas incluyen
tenant_id y claves foráneas para el inventario y las copias de plataforma.

## Comprobaciones locales

`npm run test:claims` usa PostgreSQL local PGlite, migraciones completas, HTTP
sintético y metadatos de Storage ficticios. Verifica permisos, admisión, MIME y
tamaño, duplicados, conservación, creación/vinculación/archivo, pausa, cupo,
vencimiento y aparición del módulo en el snapshot de respaldo. No llama a
Supabase, R2 ni destinatarios. El estado del respaldo se controla artificialmente
en esta prueba; sus predicados reales se prueban con `npm run test:backups`.

Esta prueba no certifica JWT del despliegue, binarios del Storage real, cuotas
actuales, lectura del QR con un teléfono ni restauración de reclamos nuevos desde
R2. La copia ya recuperada es anterior a este módulo. No solicitar copias extra
fuera del máximo de tres del piloto aprobado.

El exportador completo de empresa actualmente falla de forma cerrada ante el
catálogo global plan_politica_modulos. No se cambió esa política en este trabajo.
El respaldo de plataforma incorpora todas las tablas; la prueba de pertenencia
por tenant aquí certifica solo las tablas nuevas de reclamos.

## Resultado de los tres ensayos publicados

| Reclamo | Hora de recepción Paraguay, 12/10 | Resultado |
| --- | --- | --- |
| REC-1 | 20:33:49 | Revisado; creó OT-003059 asignada a cuenta técnica existente de esa obra. |
| REC-2 | 20:35:02 | Vinculado a OT-003059; conserva la descripción inicial y agrega referencia. |
| REC-3 | 20:35:57 | Archivado con motivo; conserva pedido y historial. |

Una imagen sintética de 6.152 bytes fue enviada desde la galería del formulario,
confirmada en Storage privado, visualizada en Recepción y en Panel OT → Fotos.
Se conserva la atribución al solicitante y no acredita una visita técnica.
No se crearon clientes ficticios ni documentos firmados. La posición en el plano
permanece pendiente, verificada en la base de datos.

La recepción conserva sus estados después de recargar la aplicación. La
comprobación independiente del servidor confirma 3 reclamos, 1 archivo, 7
eventos, descripción inicial conservada, bucket privado y original presente.
El snapshot de inventario incorpora las cuatro tablas nuevas y el original.
Esta lectura del inventario no genera una copia en R2 ni prueba recuperación.

El SVG descargado de la aplicación se decodificó con un lector independiente:
matriz 49 × 49, destino exacto del portal activo. Esto no sustituye escanearlo
desde la cámara de un teléfono. No se reenviaron solicitudes nuevas para
comprobar duplicados en vivo; la idempotencia está validada localmente.

Evidencias locales: output/claims-pilot-20261013/QR-piloto-obra-1.svg,
recepcion-publica.png, evidencia-en-ot.png, comprobacion-servidor.txt.

## Ensayo de campo pendiente

1. Escanear el QR activo desde un teléfono y enviar una única solicitud ficticia
   con foto sin personas ni documentos privados. Verificar número REC y recepción.
2. Reservar los otros dos cupos para ayudantes. No difundir el QR públicamente.
3. Comprobar la inclusión del módulo y evidencia en una copia ya programada,
   sin ampliar el número de copias autorizado. No declarar recuperados estos
   reclamos hasta ver ese informe de recuperación.
4. Pausar la recepción al finalizar. WhatsApp será la siguiente etapa después de
   aprobar el resultado del circuito; sin habilitación para Ariel todavía.

## Prueba física desde iPhone y preparación de fotos

El propietario escaneó el QR desde su iPhone y confirmó el envío. REC-4 ingresó
el 12/10/2026 a las 21:02:23 de Paraguay con una foto elegida de la galería.
Pasó a revisión y creó OT-003060 con un técnico existente de la empresa de
prueba. Comprobación independiente SQL: pedido conservado, un archivo en el
reclamo, una foto en la OT y tres eventos. Quedan dos cupos, sin nuevas reservas
para comprobar esta corrección.

Incidencia de campo: Cámara abría, tomaba la foto y «Usar foto» dejaba cero
fotos. El formulario anterior rechazaba capturas mayores de 2 MiB o MIME distinto
de JPEG/PNG/WebP; no conocemos el archivo exacto rechazado. Se prepara la foto
antes de admitirla, reconoce MIME omitido a partir de la cabecera y convierte
HEIC cuando el navegador puede leerlo. Fotos grandes se reducen proporcionalmente
a 1920 px de lado mayor y JPEG de hasta 2 MiB. Fotos pequeñas válidas mantienen
sus bytes; no se duplica el original de alta resolución en Storage. La copia
admitida es la evidencia inmutable del reclamo. Se indica conservar el original
en el teléfono; la captura web no garantiza que el sistema lo guarde allí.

Pruebas locales reales en navegador, sin enviar solicitudes: JPEG sintético de
3.229.562 bytes con MIME omitido quedó en 1.700.895 bytes y 1920 × 1440; PNG
pequeño de 6.152 bytes con MIME omitido conservó tamaño, nombre y tipo correcto.
Carga mediante el botón Cámara mostró miniatura y «1 de 3 fotos agregadas».
Se bloquea revisión mientras se prepara y los errores se muestran junto a fotos.
TypeScript, ESLint dirigido y la prueba completa local de reclamos pasaron.

Pendiente: comprobar «Usar foto» en el iPhone con la versión publicada. No
atribuir el problema a un formato específico ni dar por validada la cámara
física a partir de la prueba de selección de archivos en escritorio.
