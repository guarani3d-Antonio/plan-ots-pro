# Contactos dentro de Directorio

La categoría Contactos reemplaza el aviso de próxima etapa y utiliza los contactos, identificadores y vínculos existentes. El contexto común de Directorio conserva empresa y obra. La cuenta de empresa usa su empresa asignada; solo el creador puede cambiarla.

El listado incluye búsqueda por nombre, función, teléfono, correo u obra, filtro por obra, foto, última comunicación y seguimientos pendientes. La ficha superpuesta contiene Datos, Obras vinculadas y Comunicaciones. Las fotos usan el servicio privado actual de Directorio, con reducción proporcional y URLs temporales.

Los vínculos directos con obra se crean y editan usando las relaciones existentes. Las ubicaciones de clientes y los vínculos con clientes o contratistas se resuelven por identidad a la obra canónica, respetando el alcance del usuario. Los vínculos generales que todavía no resuelven una obra se conservan en Administración. La función pertenece al vínculo y puede diferir entre obras.

Las comunicaciones son registros manuales. Incluyen fecha y hora, canal, dirección, asunto, resumen, obra obligatoria, OT opcional, resultado y seguimiento obligatorio cuando queda pendiente. Las opciones de OT se buscan por texto dentro de la obra autorizada. El servidor atribuye el autor; la interfaz no permite suplantarlo. No se envían mensajes, correos ni llamadas.

Una respuesta se agrega como registro nuevo. El estado mostrado del pendiente puede quedar resuelto por esa respuesta, sin sobrescribir el registro anterior. Hay paginación de 20 comunicaciones y filtros por canal y obra. Las solicitudes repetidas con el mismo identificador no duplican comunicaciones. El alta tiene una clave de solicitud para recuperar respuestas inciertas sin crear otra persona. Las fichas usan la marca de actualización para rechazar una edición concurrente desactualizada.

## Conservación y seguridad

- Punto de retorno de código: `453221b`. Respaldos verificados de los dos archivos modificados en `backups/contactos-20261018/`.
- Migración aditiva: `202610180001_contact_profiles.sql`. No reemplaza funciones anteriores ni migra registros de negocio. Agrega un diario privado, una tabla privada de solicitudes de alta y RPC con permisos existentes de Contactos.
- Tablas con RLS y sin acceso directo de `anon` ni `authenticated`. Funciones internas sin ejecución pública. Los RPC exigen sesión y permiso por empresa; obras y OT se validan en servidor.
- La instalación publicada conserva conteos y huellas de contactos, vínculos y revisiones, así como las definiciones de las funciones anteriores. La prueba previa encontró 0 contactos y 0 vínculos; no se rellenó producción con personas ficticias.
- Las ocho funciones instaladas coinciden mediante hash con las verificadas en la prueba aislada.
- Evidencia: `output/contactos-implementation-20261018/preflight.json`, `postflight.json` y `pruebas-servidor.json`.

## Validación

`node scripts/test-contact-profiles.mjs` aplica las migraciones en PostgreSQL aislado y verifica conservación, vínculos compartidos, aislamiento de empresa y obra, permiso de solo lectura, autor real, reintentos idempotentes, concurrencia, respuestas sin alterar historia, OT en la obra correcta, fechas, seguimiento, paginación y revocación de acceso anónimo o directo.

`node scripts/test-directory-navigation.mjs` comprueba el contexto y la navegación existente. TypeScript y compilación se ejecutan antes de publicar. El ensayo de interfaz utiliza componentes reales con Supabase sustituido por datos ficticios; sus archivos comienzan con `qa-contact-profiles`.

## Reversión sin pérdida de datos

Revertir únicamente el lote de interfaz y volver a desplegar. Los datos nuevos del diario y las solicitudes se conservan. Si hace falta deshabilitar temporalmente la nueva superficie de RPC, ejecutar `supabase/rollback/202610180001_contact_profiles_disable.sql`. No elimina contactos, vínculos, fotos, comunicaciones ni documentos. Las funciones anteriores permanecen disponibles.
