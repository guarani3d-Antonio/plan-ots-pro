# Primera ronda visual del expediente

Estos mockups representan una **OT ficticia** y sirven para revisar composición y distribución de información. No son documentos emitidos ni la interfaz de producción. La especificación aprobada y el contrato de contenido están en `../../ESPECIFICACION_EXPEDIENTE_2026-09-23.md`.

| Página | Archivo de imagen | Qué aporta |
|---|---|---|
| 1 | `vista-1.png` | Reclamo, observación inicial, acceso y compromiso de visita. |
| 2 | `vista-2.png` | Hallazgo, diagnóstico, alcance y criterios de aceptación. |
| 3 | `vista-3.png` | Período, avance acumulado, hitos y siguiente decisión. |
| 4 | `vista-4.png` | Pruebas de cierre, pendiente administrativo y verificación. |
| 5 | `vista-5.png` | Recepción propuesta, reserva, condiciones y firma pendiente. |

`vista_conjunta.png` presenta las cinco páginas lado a lado. `menu_creador_politicas.png` muestra cómo quedarían las decisiones por empresa: aprobada, pendiente o no aprobada, con habilitación condicionada y respaldo. `variantes_estados.png` compara visita incompleta, prueba de cierre fallida, recepción favorable y rechazo. Los PDF A4 están en `../../../output/pdf/expediente-2026-09-23/`, incluidos cinco archivos independientes y `00_expediente_completo.pdf`.

Se usaron esquemas pequeños y explícitamente ficticios en lugar de fotos reales. Así se puede evaluar el espacio para evidencia y leyenda sin atribuir una imagen a una intervención que no ocurrió. Las firmas y aprobaciones del ejemplo están rotuladas como pendientes o simuladas.

Verificación de esta ronda: los cinco PDF se generaron en A4; se renderizaron a PNG y se inspeccionó el conjunto y las páginas de visita y acta a tamaño original. El generador comprueba que el contenido permanezca por encima del pie. Se comprobó extracción de texto y número de páginas. La revisión de BBC sobre políticas y textos oficiales sigue pendiente; este mockup no afirma cumplir por sí solo un procedimiento ISO.

Pendientes de la siguiente ronda tras comentarios del usuario: integrar las variantes de la lámina en documentos completos si se aprueban, probar texto largo y múltiples fotografías reales de prueba, además de aplicar las decisiones institucionales que BBC apruebe. La implementación de informes y políticas comienza después de validar los mockups.

Para regenerar, usar la Python incluida en el entorno con `reportlab`, `pypdf` y `Pillow`, ejecutar los tres scripts `generar_*.py`, y volver a renderizar los PDF con Poppler antes de entregar una revisión.
