# Ficha enriquecida de Clientes

## Acceso y uso

- Menú lateral → Clientes → elegir empresa → Ver. Administración → Clientes usa el mismo directorio.
- Resumen: atenciones vinculadas, pendientes, cierres con fechas válidas y promedio de respuestas de encuestas.
- Datos: identificación, contacto, foto y ubicación en la obra. Dirección y ciudad se consultan desde la obra; torre, piso, unidad y sector son opcionales cuando no corresponden.
- Reclamos: OTs vinculadas por ID, referencias REC de QR, filtros, páginas de 20 y apertura del detalle de la OT.
- Encuestas: última versión de cada documento, preguntas, comentarios, origen y número de revisión. Los datos congelados de la revisión determinan a qué cliente corresponde una respuesta.

La escala vigente es 1 a 10. El promedio usa las respuestas numéricas válidas de las siete preguntas; N/A no vale cero. Las escalas anteriores no se convierten. Una encuesta preparada o incompleta no se presenta como respondida. El tiempo mostrado corresponde a recepción → fecha de fin registrada, sobre OTs cerradas con ambas fechas válidas; no es una medición de horas de trabajo del técnico.

## Integridad y límites

El alta de cliente y su primera ubicación se guardan en una transacción. Las altas nuevas requieren una obra de la empresa con dirección registrada. Los registros anteriores no se borran ni se asocian por nombre o teléfono; una ficha anterior sin obra aparece pendiente de vinculación. Para que una OT anterior aparezca en el historial debe vincularse mediante sus IDs de cliente y ubicación.

Los domicilios personales anteriores se conservan como legado en los registros existentes y sus copias; no se muestran ni se usan en la nueva ficha. Los informes y versiones congeladas anteriores no se reescriben. El selector de cliente en OT puede reutilizar ubicaciones de la obra en sus planos para perfiles con permiso de directorio; un perfil sin ese permiso conserva su alcance anterior de consulta.

Las consultas y escrituras del servidor verifican empresa, permiso de cliente y obras accesibles. Los conteos pertenecen al alcance visible para el usuario. No se cuentan conversaciones externas de WhatsApp ni se hacen consultas a proveedores de IA.

## Publicación y reversión

Punto de retorno del código: `4b5ffc7`. Respaldo de los archivos modificados: `backups/clientes-perfil-20261014/`. La migración `202610140001_enriched_customer_profiles.sql` agrega consultas y reglas, sin cambiar masivamente datos existentes. Conserva definiciones anteriores de las tres funciones modificadas.

Antes de aplicar la migración se guardó `output/clientes-perfil-20261014/preflight-servidor.json`, con las definiciones reales del servidor y conteos, sin claves. `output/clientes-perfil-20261014/revertir-servidor.sql` restaura las funciones y retira solo reglas/consultas nuevas; no borra clientes, ubicaciones, OTs ni documentos. No ejecutar esa reversión mientras esté en uso la interfaz nueva: primero volver al código anterior.

La recuperación operativa usa una base aislada y carga los datos históricos con `session_replication_role=replica`. Se comprobó localmente que ese mismo modo conserva clientes anteriores sin ubicación y su contenido de legado; no se realizó ninguna restauración en producción.

Validación: TypeScript, build, PostgreSQL local con migraciones reales, alta atómica, domicilio derivado, obra/empresa incorrecta rechazada, paginación, encuestas corregidas sin duplicar, identidad congelada, versiones antiguas inmutables, recuperación de legado y componentes React reales con servidor ficticio. Prueba responsive de 320 px; la prueba física del usuario queda pendiente.
