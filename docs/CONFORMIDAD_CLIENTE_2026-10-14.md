# Conformidad del cliente en Panel OT

Implementación autorizada sobre el mockup compacto aprobado. Punto de retorno: e663df7; respaldos de fuentes verificados en `backups/conformidad-20261013/`.

- Panel OT → Datos → Acta de Conformidad. Tres decisiones: Conforme, Conforme con observaciones y No conforme. Esta última requiere motivo; las observaciones requieren pendientes con descripción, responsable y fecha.
- La preparación se conserva como `acta.conformidadJSON`, texto JSON versionado dentro de la revisión inmutable. Mantiene compatibilidad con los documentos anteriores y con los campos de entrega existentes.
- Guardar versión utiliza el guardado de OT existente. El receptor se vincula a un espacio concreto Cliente o Contacto; las otras categorías de firma son independientes de los permisos del sistema. Máximo cuatro firmantes, con categorías repetidas.
- La migración 202610130007 registra atómicamente la conformidad cuando se conserva la firma designada del receptor. No infiere conformidad de firmas históricas. Comprueba el estado cerrado de las fuentes congeladas, la decisión, consentimiento de captura, pendientes y correspondencia de espacio, categoría y hash.
- Los pendientes y sus resoluciones se conservan en tablas separadas, sin sobrescribir el acta ni la observación original. Resolver exige constancia y permiso existente `informe.editar` en esa obra. RPCs con control por obra y RLS; sin acceso directo para authenticated/anon.
- La cuenta autenticada identifica al operador que registró la captura. El nombre, calidad y firma manuscrita del receptor no son una verificación certificada de identidad.
- Plantilla nueva: `expediente-controlado-2026-10-13-conformidad`. Se conserva byte por byte el generador anterior de firmas en `controlled-report-20261013-firmas.mjs`; el servicio distingue ambas versiones. Los pendientes impresos son los originales de esa revisión. Las firmas siguen al último contenido, sin salto forzado.
- El snapshot de respaldo incorpora automáticamente las tres nuevas tablas. La prueba local verifica conformidad, pendientes, resoluciones y PNG asociados.

Validación: tres decisiones en PostgreSQL de ensayo, firma designada, captura atómica e idempotente, denegaciones entre empresas, solo lectura y correcciones sin firmas heredadas, no conformidad con motivo, cierre requerido, contenido escapado y preservación del HTML tras resolver. Las pruebas de firma de siete documentos, versiones guardadas, políticas de campos, render/recuperación y compilación también pasaron. La interfaz real se ensayó con servicios de memoria y un trazo sintético de dedo, sin consultas a producción.

Instalación: migración aplicada en Supabase y render-documento actualizado con JWT conservado. Se comprobaron tres tablas con RLS, sin SELECT/INSERT directo para authenticated y cero conformidades antes de publicar. Publicación y comprobación de interfaz se documentan en `output/conformidad-20261013/`.

Reversión: revertir el frontend al punto de retorno y restaurar el renderizador respaldado. Conservar las tablas y evidencia; si se desactiva la función, revocar solo los dos RPC nuevos. No borrar decisiones o firmas ni reconstruir firmas a partir de nombres.
