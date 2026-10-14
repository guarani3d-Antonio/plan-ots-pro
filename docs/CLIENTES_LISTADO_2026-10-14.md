# Listado de Clientes aprobado

Menú Clientes: búsqueda por texto, filtro de obra, activos/inactivos y OTs abiertas. Cada fila reúne foto, identificación, ubicación de obra, teléfono/correo, atenciones y satisfacción. Ver reutiliza la ficha enriquecida existente; Crear cliente abre el alta superpuesta existente. Administración conserva sus acciones de mantenimiento.

Solo el creador ve el selector de empresa. Una cuenta de empresa resuelve su empresa autorizada desde el contexto de acceso. Una selección ajena se ignora; si no hay una empresa identificable, no se consulta ningún directorio. Los permisos existentes no se amplían.

La consulta `plan_clientes_directorio` agrega indicadores conjuntamente. Usa el alcance de obras del usuario, enlaces por ID y la identidad congelada de las encuestas. Cuenta la última revisión, respuestas válidas y preguntas de 1 a 10; N/A no vale cero. Sin respuestas no se inventa satisfacción. Los indicadores cubren todo el historial visible; el filtro de obra selecciona clientes vinculados a esa obra.

Un fallo de lectura muestra Reintentar y no muestra conteos de cero ni una ficha vacía. La presentación pasa de tabla a filas adaptadas en pantallas estrechas. La foto utiliza el almacenamiento privado ya existente.

Punto de retorno: `7f10f95`. Respaldo: `backups/clientes-listado-20261014/`. Migración: `202610140002_customer_directory_listing.sql`, solo una función de consulta sin cambios en registros. Reversión: `output/clientes-listado-20261014/revertir-servidor.sql`, después de volver a la interfaz anterior.

Verificación: PostgreSQL local con migraciones reales; creador, cuenta de empresa con permiso, denegación de anónimo/otra empresa; indicadores, revisiones corregidas, encuesta congelada después de reasignar OT; búsqueda/filtros, apertura de ficha, error de lectura y ancho de 320 px en componentes reales. Sin consultas pagas a IA.
