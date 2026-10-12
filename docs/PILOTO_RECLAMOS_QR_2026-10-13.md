# Circuito QR — preparación del piloto

## Estado

La aplicación publicada fue revisada con Empresa de prueba 1 / Obra número 1.
El QR y el formulario funcionan como demostración: la confirmación indica
explícitamente que no guarda ni envía solicitudes. La recepción muestra ejemplos
independientes. Ese recorrido no certifica un circuito operativo.

Se preparó la conexión conservando el diseño aprobado. Todavía requiere instalar
la migración y la función, publicar el cliente y activar una obra desde Creador.
No se habilitó la recepción pública ni se compartió un QR de recepción.

## Límites del piloto preparado

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

## Activación pendiente y ensayo de campo

1. Revisar instalación de SQL + función portal-reclamos y publicación del cliente
   con VITE_PORTAL_FUNCTION_ENABLED=true. La migración no activa ninguna obra.
2. Con autorización del propietario, activar exactamente Empresa de prueba 1 /
   Obra número 1. Confirmar cupo y vencimiento en pantalla.
3. Tres recorridos inicialmente: crear OT asignada, vincular a OT de esa obra,
   archivar con motivo. Incluir una foto ficticia, actualizar recepción y comprobar
   persistencia; repetir un envío para confirmar que no se duplica.
4. Reservar los restantes tres cupos para ayudantes con teléfono. Compartir el QR
   únicamente después de comprobar el servicio real.
5. Comprobar la inclusión del módulo y evidencia en una copia ya programada,
   sin ampliar el número de copias autorizado. No declarar recuperados estos
   reclamos hasta ver ese informe de recuperación.
6. Pausar la recepción al finalizar. WhatsApp será la siguiente etapa después de
   aprobar el resultado del circuito; sin habilitación para Ariel todavía.
