# Cierre de Plan-OTs v1 por etapas

Estado al 29/09/2026. El piloto de campo y el uso con clientes reales son dos hitos distintos. La publicacion de codigo por si sola no aprueba ninguno.

## 1. Flujo documental

**Estado: en curso.** Ya existen siete tipos de borrador y revisiones de datos. La migracion `202609290022_document_sources.sql` agrega una instantanea de OT, obra y metadatos de fotos seleccionadas para cada revision nueva, con huella SHA-256 y lectura solo para supervisores. Comprueba los archivos privados elegidos y no rehace revisiones anteriores con datos actuales. La migracion `202609290023_document_issue.sql` reserva un candidato por revision, exige un manifiesto de originales/ediciones preservados con rutas y hashes, ata la decision de otra persona al hash exacto del PDF, exige politicas institucionales vigentes y registra una unica emision con las versiones de esas politicas. Ambas migraciones estan probadas localmente y aplicadas en Supabase el 29/09/2026. La verificacion posterior encontro cuatro tablas nuevas con RLS, cinco politicas restrictivas de Storage y ningun expediente creado. El rol authenticated no puede declarar un PDF listo; solo service_role puede hacerlo. Por si solas no constituyen emision operativa.

La emision bloquea el documento mientras comprueba la revision vigente y tiene una restriccion unica por documento en la base. Esto evita que dos solicitudes concurrentes emitan versiones diferentes del mismo expediente. La prueba local `npm run test:documents` y las siete pruebas de materializacion `npm run test:reports` pasan al 29/09/2026; falta ensayar la concurrencia contra Supabase real.

El renderizador rechaza JSON nulo o malformado y mide un limite real de 4 KB al leer la solicitud, aun sin cabecera Content-Length; cancela los cuerpos que lo exceden. La llamada al proveedor PDF tiene un tiempo maximo de 65 segundos. `npm run test:document-request` verifica el rechazo y la cancelacion por partes. Con confirmacion explicita del usuario se creo el token plan-ots-pdf-piloto-2026, limitado a Browser Run Write en su cuenta y con vencimiento el 28/12/2026. Se guardo como CLOUDFLARE_BROWSER_TOKEN en Edge Secrets junto con CLOUDFLARE_ACCOUNT_ID. El valor no esta en archivos ni en el repositorio. Las llamadas de prueba usaron exclusivamente datos sinteticos.

Las siete plantillas ya diferencian el borrador del candidato y hay una funcion pura que materializa HTML desde revision y fuentes congeladas, sin aceptar HTML enviado por el cliente. La prueba local comprueba identidad de OT/proyecto/revision, texto de control y presencia de todas las fotos seleccionadas en la orden de servicio. El servicio `render-documento` ya tiene la copia y verificacion de los binarios, la llamada a Cloudflare Browser Run, la conservacion del PDF privado y el reintento por solicitud. El panel supervisor ya permite abrir y comprobar el hash del PDF, observar o aprobar con otra cuenta, emitir y reabrir el PDF emitido. Todo esta oculto tras `VITE_DOCUMENT_ISSUANCE_ENABLED=true`, que no esta activado. Las migraciones estan aplicadas. El servicio pasa deno check con Supabase JS fijado a 2.105.4. La impresion real en Cloudflare se probo con las siete plantillas y un cierre largo de siete paginas, ocho fotos y dieciocho items. Se revisaron las dieciocho paginas resultantes. Se corrigio la ausencia de pies usando footerTemplate de Chromium: codigo, revision y pagina X de Y en cada hoja. El materializador rechaza fotos de una etapa ajena al tipo documental.

El servicio `render-documento` esta desplegado en Supabase con verificacion JWT activa. La prueba remota `scripts/test-document-edge-live.mjs` confirma 401 sin sesion, 401 con JWT invalido, 401 con clave publica sin usuario y 403 desde origen ajeno. No se publicaron cambios de interfaz ni se activo la bandera documental. Sigue pendiente el recorrido positivo con sesiones reales: esos rechazos no lo sustituyen.

Para cerrar la etapa: probar render y descarga con cuenta autorizada, fallo antes y despues de subir el objeto, concurrencia, recuperacion de objetos huerfanos y la lectura con dos cuentas reales de roles distintos. Activar la bandera solo despues de esa evidencia. Un retry de la misma solicitud debe devolver el mismo resultado y un payload distinto con la misma clave debe fallar. Nunca permitir que la impresion local se rotule como emision. La primera emision por documento queda bloqueada si ya existe otra; un reemplazo requerira un flujo expreso y no una sobrescritura.

La prueba repetible `scripts/qa-controlled-pdfs.mjs` genera siete fixtures sintéticos desde el materializador, solicita sus PDFs a Browser Run y guarda un manifiesto local de tamaños y SHA-256 para inspección. Necesita las dos variables de entorno de Cloudflare, no imprime el token y deja los resultados ignorados por Git en `tmp/pdfs/rendered/`. Ejecutada contra la API el 29/09/2026; manifest.json registra bytes y SHA-256, y checks.json comprueba A4, identidad y numeracion en cada pagina. El caso largo conserva las ocho referencias fotograficas y los dieciocho items. Estos archivos son evidencia de QA, no documentos emitidos. El plan Cloudflare observado es Free; la [tarifa vigente](https://developers.cloudflare.com/browser-run/pricing/) incluye diez minutos diarios de navegador, y [el endpoint PDF](https://developers.cloudflare.com/browser-run/quick-actions/pdf-endpoint/) acepta hasta 50 MB por solicitud. El servicio limita el payload a 48 MB y las fuentes fotografícas a 100 MB en total.

Condicion de salida: descargar dos veces el PDF emitido produce bytes identicos aunque se editen despues la OT, las fotos o la plantilla; un usuario sin permiso no lo ve; la revision rechazada no se puede emitir. No exponer el boton «Emitir» hasta cumplirlo.

## 2. Aceptacion verificable del cliente

**Estado: pendiente de la etapa 1.** El acta y la encuesta siguen separadas. La aceptacion se vincula al hash y codigo del acta exacta emitida, al receptor identificado, su calidad/autoridad, la manifestacion expresa y la hora del servidor. Se conservan las tres decisiones: aceptar, aceptar con reservas (detallar cada reserva) y rechazar. Una reserva o rechazo crea seguimiento; no convierte el cierre tecnico en conformidad. La encuesta opcional no condiciona el acta.

Para el piloto se puede ensayar un portal de receptor con cuenta invitada y correo verificado, dejando claro que verifica la cuenta y el acto registrado, no una firma cualificada. Antes de uso real BBC debe aprobar quien puede recibir por el cliente, el mecanismo de identificacion/firma, texto de consentimiento, vigencia y conservacion. WhatsApp/Gmail pueden ser canales de aviso posteriores; un clic en un mensaje no se presume firma.

Condicion de salida: decision y reservas quedan unidas a un PDF emitido recuperable; doble envio no duplica decisiones; un enlace vencido, una cuenta ajena y un callback tardio no pueden aceptar otra revision; el cliente descarga el mismo archivo antes y despues de decidir.

## 3. Prueba completa entre cuentas y dispositivos

**Estado: pendiente de los flujos anteriores.** Usar datos ficticios y registrar cuenta, empresa, obra, rol, dispositivo, navegador/PWA y version publicada. Creador, Ariel como supervisor de cuatro obras, un supervisor limitado a una torre, tecnico y usuario de otra empresa son actores distintos. Probar lectura/escritura permitida y prohibida, costos privados, adjuntos, cambio/revocacion de rol, dos editores, doble toque, modo sin red y recuperacion al volver. Repetir el flujo OT → visita → relevamiento → avance → cierre → acta en notebook y Samsung Galaxy Tab S7 FE vertical/horizontal. Confirmar camara, dictado, reapertura de PWA, PDF A4 corto/largo y lectura en una segunda cuenta. Registrar evidencia y defectos, no solo «funciona».

Condicion de salida: matriz completa sin bloqueos ni filtraciones, defectos criticos corregidos y nueva corrida de los casos afectados.

## 4. Seguridad y recuperacion

**Estado: pendiente.** Inventariar claves administrativas historicas y confirmar rotacion/revocacion sin copiarlas al repositorio ni al informe. Revisar RLS/RPC/Storage para cada rol, aislamiento por empresa y obra, funciones `SECURITY DEFINER`, buckets privados y caducidad de enlaces. Fijar limites de tamano y retencion; impedir sobreescritura/borrado de emitidos. Ensayar respaldo y restauracion en entorno aislado de Auth, tablas, Storage y recibos; verificar hashes de PDF/anexos y una aceptacion recuperada. Medir tiempos y designar responsables.

Condicion de salida: evidencia fechada de restauracion, controles de acceso y revocacion. Solo entonces evaluar el uso con clientes reales y retirar/resetear los datos de prueba mediante un procedimiento que preserve cualquier expediente emitido.

## Criterio de modelos

Sol es suficiente para formularios, presentacion y casos de prueba acotados. Astra conviene para la arquitectura de emision, migraciones/RLS, aceptacion, autorizaciones y restauracion. Cambiar de modelo no reemplaza pruebas ni decisiones institucionales; el trabajo se entrega por bloque con evidencia antes de pasar al siguiente.

## Verificacion del 02/10/2026

El usuario confirma que Ariel ya ingreso. Su equipo se invita desde Configuracion > Invitar a tu equipo: nombre, apellidos, correo y una obra. El rol Tecnico se asigna automaticamente; Ariel no configura permisos arbitrarios. Probar primero una invitacion y su acceso antes de continuar con las otras tres. No dar por garantizada la entrega de cuatro correos: el transporte SMTP de produccion sigue pendiente.

Pasan `test:documents`, `test:reports`, `test:document-request` y `npm run build`. La compilacion informa advertencias de tamano/importaciones y eval en pdfjs-dist; no errores. Esto no equivale a una publicacion ni a la aprobacion del flujo remoto.

Se agrego `scripts/test-document-flow-live.mjs`, usando clave publica y cuentas ficticias existentes, sin claves administrativas. La primera corrida creo una OT sintetica, un documento de visita y su revision en Empresa de prueba 1. La comprobacion inicial confundia la lectura de revisiones, permitida a miembros de la obra, con las fuentes congeladas, limitadas a supervisores; se corrigio el ensayo para consultar estas ultimas. La segunda corrida no llego a ejecutarse: la revision automatica de permisos fallo por limite de uso de la cuenta. No fue un rechazo por inseguridad. No evadir ese control con otro canal. Reanudar cuando el servicio de aprobacion vuelva a estar disponible.

El checkpoint ignorado en `tmp/pdfs/live-flow/state.json` permite retomar sin crear otro documento. Aun no hay resultado positivo de render, descarga, aprobacion ni emision en esta corrida; no activar la bandera ni declarar definitivos los informes. No se modifico la empresa de Ariel, no se enviaron invitaciones nuevas y no se publico una version en este bloque. Los respaldos automaticos y su restauracion siguen pendientes: deben incluir tablas, Auth y binarios de Storage, con destino independiente, retencion y credenciales apropiadas.

### Reintento autorizado del mismo dia

El usuario solicito reintentar; la revision automatica volvio a funcionar y el ensayo remoto termino correctamente. `tmp/pdfs/live-flow/results.json` registra diez comprobaciones: fuentes privadas, render autorizado, descarga con hash por dos cuentas, reintento, reintentos concurrentes de candidato ya listo, estabilidad del PDF tras editar la OT sintetica, denegacion de descarga a tecnico/otra empresa, prohibicion de autoaprobacion, aprobacion por segunda cuenta y rechazo de emision con politicas pendientes. No confundir esta concurrencia de un PDF listo con la carrera de dos primeras generaciones, todavia pendiente. Ninguna politica institucional se cambio y no se emitio un documento definitivo. No hay bloqueo actual por limite de uso. Quedan el ensayo positivo de emision en entorno de prueba, casos de fallo/recuperacion y los demas puntos del plan.

### Historial de notificaciones y emision de ensayo

Correccion `556d629` publicada por Cloudflare Pages el 02/10 a las 10:45 (Asuncion), despliegue `fffde82b-e006-4f49-b7dc-77dc569161cb`: boton Cerrar visible fuera del contenido desplazable, Escape, toque fuera, foco de vuelta a Notificaciones y cancelacion de apertura tardia de OT. Prueba del componente real con datos simulados y carga demorada: todos los cierres, desplazamiento y ausencia de reapertura pasaron. Compilacion del checkout y del commit limpio pasaron. Solo se publicaron los dos archivos de notificaciones.

`scripts/test-document-issue-live.mjs` completa seis verificaciones remotas sobre el documento sintetico ya preparado: dos emisiones concurrentes devuelven un solo registro; descarga identica por dos cuentas; aislamiento tecnico/otra empresa; rechazo de sobrescritura; conservacion del PDF despues de editar la OT; y restauracion de politicas de Empresa de prueba 1. Se utilizaron tres decisiones de prueba temporales, rotuladas QA SIMULADA; ninguna pertenece a BBC. El estado de las tres politicas volvio a pendiente al terminar. El expediente sintetico emitido se conserva como evidencia, no se intenta borrarlo. Resultado en `tmp/pdfs/live-flow/issue-results.json`, checkpoint recuperable en `issue-journal.json`.

El usuario difiere los respaldos de pago hasta el final del piloto. No autoriza cargos ni nuevas suscripciones y no tiene aun otro repositorio elegido. Se pueden preparar procedimientos, pero no afirmar que existe respaldo automatico ni contratar almacenamiento. Sigue pendiente elegir destino y ejecutar una restauracion completa; una copia de tablas sola no protege los binarios de Storage.

### Fotos y recuperacion documental verificadas el 02/10

El cierre del historial tambien se comprobo en produccion con la cuenta sintetica de administrador, despues de recargar para recibir el bundle `index-CVmVVyIS.js`. Evidencia visual: `output/evidence/notificaciones-produccion-2026-10-02.jpg`. El boton cierra el dialogo y devuelve el foco a Notificaciones.

`scripts/test-document-photo-live.mjs` paso cuatro comprobaciones remotas: dos primeras generaciones concurrentes conservan un unico candidato; original y edicion quedan archivados con bytes y hashes exactos; se deniega la sobrescritura del original; y un PDF observado no puede emitirse. Resultado: `tmp/pdfs/live-flow/photo-results.json`. Las dos paginas de `cierre-con-foto.pdf` se renderizaron y revisaron visualmente: texto, tabla, imagen sintetica, referencia de evidencia y pies legibles sin recortes. Son datos de Empresa de prueba 1, sin validez operativa.

`scripts/test-document-render-recovery.mjs` ejecuta el handler real en una VM local, con transporte, Storage y RPC simulados; no usa claves ni red. Pasan siete escenarios: fallo antes de subir, fallo de registro posterior a la subida y recuperacion del mismo objeto sin regenerar, bytes alterados, dos PDF previos ambiguos, candidato listo alterado, bloqueo de otro trabajador y caida del proveedor con reintento. Resultado: `tmp/pdfs/live-flow/recovery-results.json`. No sustituye una interrupcion real de infraestructura ni una restauracion de Supabase; estas ultimas no se ejecutaron.

La etapa documental tiene ahora evidencia positiva remota de generacion, descarga, revision, emision de ensayo, aislamiento y concurrencia. La bandera de emision permanece desactivada: quedan la comprobacion del recorrido completo desde la interfaz y las decisiones institucionales reales. No se aprobaron politicas de BBC ni se habilitaron informes definitivos para Ariel.

### Preparacion de respaldo sin contratar servicios

Decision vigente: diferir el destino y cualquier pago hasta cerrar el piloto. No crear bucket R2, suscripcion, credenciales nuevas ni tarea programada que dependa de un destino inexistente. Actualmente no hay un respaldo automatico independiente verificado.

Al retomar, el paquete recuperable debe incluir:

- Base de datos: esquema, migraciones, tablas operativas, permisos, RLS, funciones, politicas institucionales y registros documentales.
- Identidades: exportacion/restauracion soportada de Auth y sus relaciones con empresas, obras y roles; no reemplazarla por una lista de correos.
- Storage: originales, ediciones, planos, PDFs emitidos y anexos. Un manifiesto por objeto con bucket, ruta, cantidad de bytes y SHA-256 permite comprobar completitud e integridad.
- Configuracion necesaria para reconstruir el servicio y version publicada; secretos en un mecanismo seguro separado, nunca en Git ni en un manifiesto legible.
- Marca de inicio/fin y estrategia de consistencia. Si hay escrituras durante la copia, reconciliar objetos y referencias; una copia parcial no se anuncia como completa.

Antes de automatizar: elegir destino independiente y capacidad/costo, cifrado, acceso minimo, frecuencia, retencion y responsable. Despues ensayar una restauracion aislada con correos salientes desactivados: iniciar sesion con cuenta de prueba, verificar empresa/obra/roles y denegaciones, reabrir OT, fotos y PDF emitido, comparar hashes y comprobar decisiones asociadas. Registrar tiempo y perdida maxima de datos observados. Solo esa evidencia permite marcar recuperacion como aprobada; sincronizar codigo o exportar CSV no equivale a este respaldo.

### Retorno de Ariel: pantalla en blanco al generar informes (02/10, mediodia)

Las capturas muestran un error en DevTools pero la pestana Elements no revela su mensaje. El HTML aparece `translated-ltr`; se comprobo que el sitio declaraba `lang=en` pese a estar en espanol. Traduccion automatica es una hipotesis, no una causa confirmada. Se pidio el texto rojo de Console y no se asume perdida de datos ni error de uso.

En produccion, administrador de Empresa de prueba 1 abrio Orden de Servicio de OT-003048 y obtuvo vista previa sin errores de consola. No reproduce por si solo el caso de Ariel. Hotfix `cdfcfcf`: declara idioma espanol y excluye traduccion automatica; agrega un Error Boundary acotado al editor de informes con Volver a la OT y Escape. Un error de render del editor no debe desmontar la OT. No modifica permisos, base de datos, plantillas ni activa emision.

Compilan el checkout y el commit limpio. Ensayo local del commit limpio con servicios ficticios: error forzado muestra recuperacion, Escape vuelve a la OT conservando su campo; se reabre Cierre y se incorpora foto, confirmada cargada e incrustada en el iframe. Esto verifica la mitigacion; falta el error concreto de Ariel y su repeticion posterior para declarar resuelto su incidente. No confundir pruebas del PDF del servidor con el comportamiento del editor en su navegador.

Publicado a las 12:23 de Asuncion: Cloudflare `19412eef-3419-42ef-bf15-01193f4bb745`, estado success. Verificado en el dominio publico `lang=es`, `translate=no`, bundle `index-DF44NV2k.js`. La primera recarga aun uso la version anterior del Service Worker; la siguiente cargo la nueva. Evidencia del fallo simulado y su salida: `output/evidence/informe-recuperacion-2026-10-02.jpg`. La captura es de QA local, no del fallo de Ariel.

### Recuperacion del generador y descarga de fotos (02/10)

El usuario pide no solicitar mas capturas ni diagnosticos a Ariel. Investigacion propia: los generadores pasan 98 combinaciones de 14 OTs del conjunto Distrito Perseverancia. La OT reciente OT-003049 conserva tres fotos accesibles; una segunda prueba incorpora sus bytes reales en los siete tipos de informe, sin fallos y sin escribir datos remotos (`tmp/deploy/pilot-portable-photo-check.json`). Esto no reproduce el navegador de Ariel ni acredita la impresion desde su equipo.

Hotfix `08621d8`: la descarga portable ahora tiene limite de 10 segundos por foto y 30 segundos por documento, cancela lecturas detenidas y verifica el limite de 30 MiB mientras recibe los bytes. La vista previa captura tambien errores sincronos del generador, limpia una vista obsoleta y muestra instrucciones de recuperacion. Las exportaciones siguen rechazando documentos con imagenes faltantes.

`scripts/test-portable-report-recovery.mjs` verifica bytes intactos, deduplicacion, fetch que no responde, stream detenido, exceso de tamano, archivo ausente/vacio/no imagen, plazo global y reintento. Compilacion de la version aislada correcta. En el editor real con servicios simulados, datos invalidos muestran aviso y permiten cerrar; reabrir Cierre con datos validos y foto genera la vista previa. Evidencia local: `output/evidence/informe-error-controlado-2026-10-02.jpg`. La causa exacta de la pantalla blanca reportada sigue sin confirmarse; no atribuirla al usuario ni declarar comprobada su resolucion en su dispositivo.

Publicado `08621d8` a las 12:47 Asuncion, despliegue Cloudflare `a6bbbc5b-6568-4084-aeef-7e33aff0fbe3`, success. Bundle publico confirmado `index-CFHFpJeg.js` despues de dos recargas por el Service Worker.

Durante la comprobacion publicada se encontro un defecto adicional reproducible: Grilla > Acciones de una OT > Generar informe solo ejecutaba console.log, sin abrir nada. `775e8cd` conecta esa accion al PanelOT existente en la pestana Informes, conservando los permisos y cierres del editor. Compilan checkout y version aislada. Las acciones Editar y Eliminar de ese menu tambien requieren una auditoria posterior (Editar actualmente abre el detalle; Eliminar solo registra console.log); no se cambiaron en este hotfix.

Publicado `775e8cd` a las 12:54 Asuncion, Cloudflare `14309581-bee2-4419-aa22-48b405f9098f`, success, bundle publico `index-C2ot7Sji.js`. Prueba UI publicada con admin sintetico: Grilla > OT-003048 > Generar informe abre Informes; Orden de Servicio genera iframe completo, sin errores de consola; Cerrar y Cerrar panel devuelven a la grilla. Sin guardar ni modificar registros. Evidencia: `output/evidence/informe-grilla-produccion-2026-10-02.jpg`. No se verifico el dialogo nativo de impresion ni se reprodujo la pantalla blanca especifica de Ariel.

## 2026-10-02 — Precarga de los siete documentos

- Corrección b20cfd5 enviada a tablet-v1: datos de OT, cliente y ubicación exactamente vinculados, y borradores previos pertinentes. No se inventan aprobaciones, verificaciones ni respuestas del cliente.
- Edición previa a exportar; los valores guardados, incluidos vacíos intencionales, prevalecen. Botón para completar solamente vacíos de borradores antiguos. Textos sin recortes silenciosos. Fotos elegibles por etapa seleccionadas inicialmente.
- Verificación: regresión automática de los siete HTML; prueba UI de los siete formularios, guardar/reabrir sin perder edición ni selección de fotos; compilación aislada aprobada.
- Lectura real OT-003049: observaciones y fechas presentes y copiadas literalmente. No tiene cliente/ubicación vinculados al directorio: no se puede traer su domicilio/teléfono hasta asociarlo. Sin cambios en la OT del piloto.
- Pendiente confirmar despliegue Cloudflare y prueba publicada. La emisión formal sigue deshabilitada; esto corrige los documentos de trabajo existentes.
- Publicación confirmada: b20cfd5, Cloudflare b7f5c971-6df3-4dbe-9881-546434852dd3, éxito 15:26 local. Prueba publicada con QA-REST-a1000000: obra/unidad/responsable precargados, foto seleccionada, vista previa correcta, sin errores de consola; no se guardaron cambios remotos.
- Ajuste visual 52e78d3: bloque de identificación a todo el ancho del panel, verificado visualmente en local. Despliegue final en curso.
- Ajuste final publicado y confirmado: 52e78d3, Cloudflare 06c01056-4ef0-4631-86e5-512afa83c32e, éxito 15:29 local. Sin migraciones ni alteración de permisos/datos del piloto.

## 2026-10-02 — Clientes desde OT y selector de visitas

- b73c499: supervisor/Creador puede registrar cliente y primera ubicación desde Datos > Nuevo cliente; reutilizar clientes de obras que supervisa y agregar ubicaciones. Técnico conserva selección de clientes de su obra. Sin cuentas de acceso para clientes ni cambios de rol.
- Migración 202610020024 aplicada en Supabase: dos RPC acotadas a obra y empresa activas, alta atómica e idempotente, sin ampliar SELECT de tablas. Rollback elimina RPC sin borrar datos.
- Selector de visitas: primera visita / otra visita / código existente. Corrección de comparación de JSONB para evitar falsos cambios pendientes y bloqueo del selector después de guardar.
- Pruebas: 11 grupos PostgreSQL local; 6 controles API con cuentas sintéticas reales (supervisor, técnico y otra empresa); compilación aislada; formulario real creó cliente y dos ubicaciones, guardó y reabrió la OT, selección múltiple exigió ubicación. Informe de visita recibió los datos exactos del cliente y unidad. Borrador de ensayo guardado POT-2026-VIS-00000006, selector habilitado y cambio a nueva visita comprobado.
- Datos de ensayo exclusivamente Empresa de prueba 1: QA Cliente alta desde OT 2026-10-02 y QA Cliente formulario 02-10; OT QA-REST-a1000000. No se modificaron OTs de Ariel.
- Publicación enviada a tablet-v1, Cloudflare 95dfed27-fdf9-41d7-984e-12938a847080; pendiente confirmación final.
- Publicación confirmada 15:57 Asunción: Cloudflare success 95dfed27-fdf9-41d7-984e-12938a847080, commit b73c499. Bundle público index-BwBT9lKc.js tras recargar la versión almacenada. Formulario publicado comprobado en cuenta sintética admin; pruebas previas de alta realizadas como supervisor. Evidencia: output/evidence/clientes-desde-ot-2026-10-02.jpg.

## 2026-10-04 — Emisión controlada del piloto

El usuario confirmó emisor Benítez Bittar Constructora / Facility Services, preparación por Ariel/supervisor, revisión y emisión por el Creador desde su propia cuenta, conservación inmutable durante el piloto y aceptación del cliente separada del acta emitida. Las políticas identidad/revisión/conservación quedaron aprobadas en BBC y se verificaron por lectura. Firma/evidencias/garantía siguen pendientes; no se atribuye una firma al cliente.

- Migraciones 025/026 aplicadas: revisión/emisión restringidas al Creador también en servidor, rechazo de candidato con borrador guardado más reciente y captura de empresa emisora en las revisiones nuevas. Dos personas distintas siguen siendo necesarias. No se reescribieron revisiones anteriores.
- Plantilla `expediente-controlado-2026-10-04`: los siete documentos respetan la identificación editada y los vacíos intencionales del borrador guardado. La versión anterior conserva su comportamiento histórico. Edge Function desplegada con este materializador.
- La interfaz habilita preparar, verificar, revisar y emitir. PDF privado con comprobación de tamaño y SHA-256, descarga acotada y visor propio sin depender del plugin PDF del navegador. Borradores siguen disponibles, claramente separados del archivo emitido.
- Ensayo remoto exclusivamente con cuentas/OT ficticias: generación simultánea produjo un candidato, aprobación por Creador y emisión simultánea una sola emisión; supervisor/admin/técnico/otra empresa rechazados. Las políticas QA se restauraron en `finally` y se verificaron pendientes. Fixture OT-003053, POT-2026-VIS-00000007; ningún reclamo de Ariel fue modificado.
- Verificaciones: PostgreSQL local, materializador de siete tipos y compatibilidad anterior, descarga íntegra y recuperación de fallos, compilación TypeScript/Vite; 13 controles de Storage con 11 cuentas; cinco entradas PDF con evaluación desactivada. PDF real de dos páginas extraído/renderizado y revisado visualmente. Visor probado a 820×1180 y 1180×820, apertura/cierre y descarga desde navegador. Esto no sustituye la prueba física en tablets/PWA del equipo.
- Evidencia local en `output/cierre-2026-10-04/`. La publicación del frontend se confirma por separado después del despliegue.

Pendientes del cierre completo: aceptación verificable del cliente, rotación comprobada de credenciales históricamente expuestas y actualización de PDF.js (mitigación activa, no auditoría total), respaldo independiente automático y ensayo de restauración integral DB/Auth/Storage. Supabase no muestra backups programados; no se activó servicio pago. Dashboard final y carpetas jerárquicas no se modificaron en esta entrega documental. No declarar la aplicación 100% terminada.
