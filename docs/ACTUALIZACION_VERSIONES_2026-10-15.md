# Actualización consistente y conservación del trabajo

## Diagnóstico comprobado

El servidor de Cloudflare entregaba el índice de e016cd6. La resolución DNS habitual de la computadora respondía NXDOMAIN, mientras que 1.1.1.1 y 8.8.8.8 resolvían el dominio y el HTTPS con esa IP respondía correctamente, sin omitir certificados.

El cliente previo precargaba index.html y registraba el service worker sin escuchar ni presentar cambios de versión. registerType autoUpdate por sí solo no recargaba el documento. Una copia offline antigua podía mostrarse sin informar ese estado. El parámetro release de la URL tampoco acreditaba la compilación ejecutada.

## Corrección

- Cada build emite version.json e incorpora ID y fecha de compilación en el HTML.
- El registro comprueba la versión al abrir, reconectar, volver al navegador y cada cinco minutos mientras la página es visible. La comprobación tiene un plazo de ocho segundos.
- Identifica versión verificada, actualización disponible, conexión sin verificar y servidor que entrega una versión anterior.
- Ofrece actualización explícita. Las guardas beforeunload de formularios con cambios bloquean la actualización hasta guardar o cerrar el formulario.
- Descarga y valida el HTML de destino antes de recargar. Activa el worker en espera y conserva el último HTML válido para conexiones lentas.
- Navegaciones: NetworkFirst, con copia de respaldo y rechazo de respuestas más antiguas que la página conservada. Un HTTP de error tampoco sustituye la copia válida.
- El worker lleva su propio identificador de compilación y rechaza una navegación cacheada anterior a él. Cuando una recarga completa ya abrió el HTML nuevo, activa únicamente el worker de esa misma compilación, sin recargar la página ni perder formularios abiertos. No activa silenciosamente un worker de otra compilación.
- El endpoint de versión y el registro quedan fuera del precache; HTML, versión y registro tienen cabeceras no-store. No se borra IndexedDB, localStorage, sesiones, cola de sincronización ni archivos del usuario.
- Si existe release en la URL se actualiza al ID real, conservando los demás parámetros, hash y estado de navegación.

## Comprobación

scripts/test-app-updates.mjs verifica estados de conexión, detección de versiones, protección ante retrocesos incluso sin historial previo, actualización voluntaria, guardas de formularios, ausencia de recargas espontáneas y coherencia entre manifiesto y HTML.

scripts/qa-app-updates-server.mjs permite probar con el service worker real del build, sin Supabase. Se comprobó en navegador que la edición permanecía al ofrecer una actualización, que la actualización explícita cargaba B y que una respuesta posterior A conservaba la interfaz B con aviso. Evidencias en output/app-update-20261015.

Las pruebas de contratistas usaron la OT-QA1 aislada: IVA incluido/agregado, dos trazos ficticios, conservación de firmas por revisión, evaluador único/varios/ninguno y promedio 4,5 con dos criterios no evaluables. PDF corto de una página y largo de seis con logo y firmas embebidos. No se guardó ninguna prueba en la base real.

## Activación y límites

El 16/10 el propietario confirmó haber seleccionado Cloudflare en Chrome y ver «Versión e5cd197 · verificada». El aviso de verificación correcta se oculta a los seis segundos; los avisos de error o actualización siguen visibles. El HTML solicitado al actualizar lleva un parámetro temporal para evitar que un worker previo responda desde precache cuando se usa la dirección raíz sin parámetros. Ambos comportamientos se comprobaron con el navegador aislado.

Una instalación anterior necesita obtener al menos una vez el código nuevo por una conexión que resuelva el dominio. No es posible reparar DNS ajeno desde JavaScript de una página. El control de Chrome no está disponible en esta sesión; el DNS seguro de Chrome no fue cambiado por el agente. No se debe afirmar que ese ajuste se completó.

Después de resolver DNS, guardar cualquier edición y hacer una recarga completa permite incorporar el nuevo registro. Desde entonces la versión y los avisos son visibles. Las pruebas de desconexión se realizaron en el entorno aislado, no desconectando la computadora ni borrando cachés.

Para volver a código anterior se debe crear una nueva compilación de ese código, con fecha nueva; cambiar el alias a un build antiguo es rechazado por la protección de navegación. El retorno de código conserva datos y no requiere borrar almacenamiento.
