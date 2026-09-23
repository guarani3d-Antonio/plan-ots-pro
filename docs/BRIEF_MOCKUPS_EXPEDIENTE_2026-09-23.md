# Encargo de mockups para Sol Alto

Fecha: 23/09/2026. Estado: cinco mockups A4 y vista del menú Creador generados; revisión visual del usuario pendiente. Leer primero `ESPECIFICACION_EXPEDIENTE_2026-09-23.md`. La auditoría previa solo se consulta para rastrear un hallazgo; no rehacerla.

## Objetivo y límites de esta entrega

Crear cinco modelos visuales de documentos que, juntos, expliquen una intervención completa: ficha de visita, relevamiento, avance, cierre técnico y acta de conformidad. Mostrar un caso consistente y las variantes necesarias para decidir contenido y diseño. El usuario revisará estos mockups antes de implementar. No cambiar plantillas activas, base de datos ni producción durante esta entrega.

Usar Sol Alto para contenido ya definido, composición y ajustes. Reservar Astra para una revisión técnica posterior de permisos, emisión inmutable y firma si aparecen decisiones nuevas de arquitectura; no usarlo para retoques rutinarios. No crear tareas ni subagentes sin petición del usuario.

Entregar originales editables de los mockups y una vista cómoda para comparar; PDF solo si se logra generar y revisar visualmente. Leer la skill PDF al aplicarla. No afirmar revisión visual de archivos que no se hayan podido abrir. En la auditoría anterior el navegador bloqueó archivos locales: respetar ese bloqueo, no eludirlo por otro puerto, navegador o ruta indirecta. Si persiste una limitación, usar un mecanismo permitido y declarar qué se pudo verificar.

## Lenguaje visual común

- A4 vertical; azul institucional sobrio, grises y blanco; color de estado con texto, nunca color solo.
- Emisor y título visibles, cabecera corta, ficha de identificación compacta, secciones numeradas y pie con ID/revisión/página.
- Cuerpo 10,5–11 pt; etiqueta 9–10 pt; pie mínimo 9 pt; fotos sin recortar, leyendas legibles, tablas con columnas suficientes.
- Cada mockup incluye marca discreta y persistente **MUESTRA — DATOS FICTICIOS — SIN VALIDEZ**. Las decisiones simuladas se identifican como tales; no dibujar firmas que parezcan auténticas.
- El hash completo y los detalles técnicos van en un comprobante/anexo de verificación, no llenan la página principal. Para muestra usar “hash de ejemplo no calculado”; no inventar un hash que aparente validar bytes.
- No logos ISO, leyendas de certificación, promesas de garantía ni afirmaciones universales. No usar nombres/correos de prueba reales de las capturas como firmantes ficticios.
- Código de formulario de calidad: “por confirmar” en ficha del diseño, no inventar FOR-09-02, etc. Distinguir código del formulario/revisión de plantilla y número/revisión del registro emitido.

## Caso ficticio único

Emisor: **Servicios Técnicos Ejemplo S.A.** Cliente: **Administración Edificio Ejemplo**. Proyecto: **Edificio Parque de Prueba**. OT: **OT-042**. Ciclo: **01**. Ubicación: **oficina 204, segundo piso**. Activo: **equipo de aire acondicionado AC-204**. Estos nombres son exclusivos de la muestra y no identifican entidades reales.

Personas ficticias: **Técnica A**, autora; **Supervisor B**, revisor técnico; **Representante C**, receptor autorizado según supuesto del caso. Usar nombres completos ficticios si el diseño lo necesita, conservándolos en las cinco piezas.

Fechas del caso: 21–24/09/2026, zona America/Asuncion. No confundir fecha prevista, efectiva y de emisión. Referencias propuestas:

| Registro | Fecha/período | Identificador corto de muestra |
|---|---|---|
| Visita | 21/09, 09:00–09:40 | OT-042/C01/VT-01 R00 |
| Relevamiento | 21/09, 11:00 | OT-042/C01/REL-01 R00 |
| Avance 1 | 22/09 | OT-042/C01/AV-01 R00 |
| Avance 2 | 23/09 | OT-042/C01/AV-02 R00 |
| Cierre técnico | 23/09, 16:00 | OT-042/C01/CIE-01 R00 |
| Acta | 24/09, 10:00 | OT-042/C01/ACT-01 R00 |

### Hechos de visita

Reclamo: “Se observa goteo debajo de la unidad interior durante el uso”. Condición registrada: humedad bajo el equipo, sin desmontaje ni diagnóstico en esta etapa. Evidencia E01: vista inicial del área/equipo. Restricción: coordinar acceso a la oficina ocupada; horario acordado 08:00–10:00. Compromiso: acceso y protección de mobiliario a cargo del contacto del cliente el 22/09. Resultado: realizar relevamiento técnico. Checklist breve con respuestas explícitas y un no aplica justificado; no trasladar el checklist completo a documentos posteriores.

### Hechos de relevamiento

Hallazgo H01: obstrucción observada en tramo accesible de drenaje; E02. Diagnóstico: obstrucción como causa probable del goteo, pendiente de confirmación mediante prueba posterior a limpieza. La muestra no pretende prescribir un procedimiento técnico real.

Alcance aprobado de ejemplo:

| Ítem | Trabajo | Criterio de aceptación de muestra | Peso |
|---|---|---|---|
| T01 | Limpiar tramo accesible de drenaje | Descarga libre en prueba acordada, sin rebalse visible | 40% |
| T02 | Reinstalar y comprobar conexiones intervenidas | Sin fugas visibles durante comprobación | 30% |
| T03 | Verificar funcionamiento y entregar registro | Sin goteo observado durante período de prueba acordado y registro entregado | 30% |

Condición de prueba, duración y responsable deben figurar explícitos como acuerdo ficticio, sin presentar esos parámetros como norma universal. Exclusión: intervención en red embutida fuera del tramo accesible. Plazo previsto: 22–23/09. Aprobación de alcance simulada por responsable autorizado, vinculada a REL-01 R00; no simular firma válida.

### Hechos de avances

AV-01: T01 completado; T02/T03 pendientes; progreso 40% por hitos ponderados de REL-01 R00. E03 muestra trabajo ejecutado. Sin cambio de alcance. Próximo paso: reinstalación y prueba. No copiar E01 ni diagnóstico.

AV-02: T02/T03 completados; progreso del período +60 puntos, acumulado 100% del alcance técnico. E04 muestra prueba final. Distinguir “ejecución técnica 100%” de recepción: aún pendiente. No inventar que 100% del alcance equivale a expediente formalizado.

### Hechos de cierre

T01/T02/T03 ejecutados y criterios probados con resultados explícitos, fecha y verificador. Citar REL-01 R00 y AV-01/AV-02. Usar E04 como evidencia final y E01 solo si la comparación aporta valor; no repetir todas las fotos. Conclusión: conforme técnicamente según criterios registrados; recepción del cliente pendiente.

Entregable administrativo pendiente P01: copia adicional del registro para archivo de administración, responsable Supervisor B, fecha 25/09. La copia principal ya fue entregada; no contradice T03. Declarar este pendiente como no impeditivo de la verificación técnica en el supuesto del caso. No usar un defecto de seguridad como ejemplo de pendiente tolerable.

### Hechos de acta

Referencia exacta a CIE-01 R00. Objeto: recepción del servicio de limpieza, reinstalación y verificación de AC-204. Decisión de muestra: **aceptado con reservas**, reserva P01 y fecha/responsable. Firma pendiente en una variante; formalización simulada con recibo claramente ficticio en otra. No copiar hallazgos ni pruebas del cierre.

Garantía: no inventar cobertura/plazo. En el mockup principal indicar “Condición contractual pendiente de definición para esta muestra”; por eso no se presenta como acta lista para emisión real. Mostrar además el lugar que ocupará una referencia contractual confirmada y su resumen. Si BBC proporciona condiciones, reemplazar el supuesto, manteniendo trazabilidad.

## Piezas y variantes a presentar

1. Visita: 1–2 páginas, reclamo, condición inicial, checklist legible y compromisos. Variante de borrador con dato obligatorio faltante.
2. Relevamiento: 2–3 páginas, hallazgos/pruebas, alcance por ítems, criterios y decisión de alcance. Mostrar diferencia entre propuesta y alcance aprobado sin duplicar todo el diseño.
3. Avance: diseño de 1–2 páginas usando AV-01 y una segunda instancia compacta AV-02 para probar período/acumulado y continuidad.
4. Cierre: unas 2 páginas, matriz ítem/criterio/resultado/evidencia, conclusión y pendiente P01. Variante de criterio fallido con conclusión no conforme, para comprobar que el diseño no sugiere éxito automáticamente.
5. Acta: una página más anexo si las reservas lo exigen. Comparar pendiente de firma, aceptada, aceptada con reservas y rechazada mediante cambios concretos en el mismo esquema. Para variantes aceptada sin reservas, cerrar P01 con fecha/evidencia; no borrarlo del historial.

Los objetivos de páginas son guías, no límites que justifiquen omitir datos o reducir la letra. Adjuntar una prueba visual larga con cinco fotos y una tabla multipágina para detectar defectos de paginación.

## Revisión con el usuario

Los artefactos de esta primera ronda están en `docs/mockups/expediente-2026-09-23/`: `vista_conjunta.png`, cinco vistas `vista-1.png` a `vista-5.png`, `menu_creador_politicas.png` y `variantes_estados.png`. Los cinco PDF individuales y `00_expediente_completo.pdf` se entregan en `output/pdf/expediente-2026-09-23/`. Los generadores se conservan en el directorio de mockups para ajustes de diseño. La pantalla del Creador es conceptual y no está implementada en la app.

Mostrar primero cinco vistas principales con enlaces claros y una tabla de contenido que explique qué aporta cada una. No abrumar inicialmente con todas las variantes; dejarlas disponibles para comprobar casos críticos. Recoger ajustes de contenido, jerarquía y densidad antes de implementación.

Checklist de entrega:

- Cada pieza se entiende aislada y referencia correctamente las anteriores.
- Reclamo no se confunde con diagnóstico; cierre no copia relevamiento; acta no copia cierre.
- El porcentaje se explica y no cambia por la fecha de apertura.
- Reservas y estado de firma se ven sin buscar en letra pequeña.
- Datos faltantes se reconocen; no parecen aprobaciones completadas.
- Hay número/revisión, fechas correctas y relación con evidencias.
- Tablas y fotografías son legibles en A4 y vista de tablet; revisar archivos realmente renderizados cuando sea posible.
- La marca de muestra impide confundir el mockup con documento emitido.
- Se enumeran ajustes aprobados y pendientes. Implementación comienza después de la revisión de mockups solicitada por el usuario.

## Encargo siguiente, listo para continuar

“Con Sol Alto, prepara los cinco mockups del expediente de Plan-OTs siguiendo esta especificación y este brief. Usa el caso ficticio coherente, distingue contenido exclusivo y referencias, y presenta los documentos para revisar contenido y diseño antes de implementar. Conserva trazabilidad de IDs/revisiones, estados de aprobación y reservas. No modifiques producción ni simules firmas reales. Reutiliza el análisis existente y concentra los tokens en composición y comprobación visual.”
