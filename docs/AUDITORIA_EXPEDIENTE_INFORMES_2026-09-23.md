# Auditoría del expediente documental de una OT

**Fecha:** 23/09/2026
**Versión examinada:** `98ee86c`
**Alcance:** las cinco plantillas activas, su modal de generación, los datos de la OT, las fotos, el registro de exportación y las capturas de tablet de la ficha, el avance y la vista previa. No se modificó el comportamiento de producción en esta revisión.

## Dictamen

Las cinco salidas tienen una identidad visual común y ya toman `obra` y `unidad_amenities` de los campos correctos. También identifican el código de OT, muestran parte de los datos técnicos y pueden incrustar las fotos para un HTML portable. **Todavía no constituyen un expediente profesional, verificable y coherente de principio a fin.** Son plantillas imprimibles alimentadas en gran medida por el estado actual de la OT, textos transitorios y espacios para completar a mano. No conservan una versión emitida de cada documento ni prueban que las declaraciones de cierre y conformidad sean verdaderas.

La prioridad no debe ser sumar párrafos o adornos. Primero hay que evitar afirmaciones automáticas sin evidencia, establecer una fuente y una versión para cada dato y registrar las decisiones de cada fase. La guía de ISO sobre información documentada distingue una plantilla de un registro que demuestra lo sucedido, y destaca identificación, cambios, criterios de aceptación y autorización cuando corresponde. Se usa aquí como **referencia de diseño documental**, no como afirmación de certificación o de cumplimiento normativo del producto: [guía oficial de ISO sobre información documentada](https://www.iso.org/iso/documented_information.pdf).

## Lo que cada pieza debe aportar al conjunto

| Etapa | Pregunta que debe responder | Evidencia o decisión que entrega a la etapa siguiente |
|---|---|---|
| Ficha de visita técnica | ¿Qué se pidió, dónde, cuándo, quién visitó y en qué condiciones se puede intervenir? | Reclamo original, identificación del activo/sector, observaciones de visita, checklist efectivamente contestado, restricciones y compromisos con responsables y fechas. |
| Relevamiento | ¿Cuál es el diagnóstico sustentado y qué trabajo se propone? | Hallazgos, mediciones/pruebas, causa probable con incertidumbre, alcance, materiales, plazo, riesgos, exclusiones y criterios de aceptación; aprobación del alcance cuando corresponda. |
| Avance | ¿Qué cambió durante un período concreto respecto del plan aprobado? | Versión del alcance de referencia, fecha/período, tareas terminadas y pendientes, cantidades o hitos, porcentaje con método explícito, incidencias, desvíos, decisiones y próximos pasos. Puede haber varios avances. |
| Cierre | ¿Qué se ejecutó y qué pruebas demuestran que cumple el alcance y los criterios acordados? | Resultado por trabajo/criterio, pruebas finales, pendientes y reservas, fechas reales, evidencias antes/durante/después, responsable de la verificación y autorización de cierre técnico. |
| Acta de conformidad | ¿Qué recibió y aceptó realmente el cliente, con qué reservas y bajo qué condiciones? | Referencia inequívoca al cierre emitido, identidad y decisión del receptor, firma/fecha o constancia de rechazo, reservas, pendientes, garantía acordada y fecha de entrega. |

Estas funciones son una propuesta de flujo para Plan-OTs; el texto contractual y los roles de firma deben ser confirmados por BBC y por quien apruebe sus documentos. Un acta sin firma o aceptación registrada puede ser un **borrador para firma**, pero no una recepción conforme.

## Hallazgos transversales

### P0 — Declaraciones no sustentadas

El cierre imprime “Aplica Garantía: SÍ”, limpieza completada, ausencia de daños colaterales, “Validado sin observaciones”, “PROYECTO FINALIZADO” y una frase de cumplimiento “bajo norma ISO-9001” de forma fija. No provienen de verificaciones ni firmas registradas. “Proyecto finalizado” además confunde el cierre de una OT con el del proyecto. El acta declara recepción “a entera satisfacción” y “TRABAJOS RECIBIDOS CONFORME” antes de recibir la decisión del cliente; promete una garantía con el plazo sin completar y también invoca ISO 9001. Véanse `reportService.ts:1029–1114` y `:1333–1391`. **No deberían emitirse como hechos hasta contar con evidencia y autorización.** El dato `en_garantia` de la OT tampoco equivale necesariamente a prometer una nueva garantía sobre el trabajo.

### P0 — No existe una versión documental recuperable

El modal genera HTML a partir de la OT **actual** y las fotos **actuales**. El texto que se edita en el modal se usa para la exportación, pero no se guarda como contenido versionado del documento. `updated_at` rotulado “Versión OT” es un instante de la OT, no la versión del informe. El HTML se descarga localmente; “Exportar PDF” abre la impresión del navegador. `registrarExportacion` solo registra una **solicitud** con tipo y formato antes de descargar/imprimir; no almacena el archivo, su hash, su contenido, su versión, su fecha de emisión ni su firma. Las columnas `informe_*_url` y `acta_conformidad_url` existen en el modelo, pero esta ruta de exportación no las escribe. Véanse `ModalInformeOT.tsx:229–243`, `:315–430`, `trustService.ts:50–58` y la función SQL `plan_solicitar_exportacion`.

Así, regenerar mañana un informe con el mismo nombre puede producir otro contenido sin dejar constancia de qué vio el cliente ayer. Las fotos editadas o eliminadas también pueden cambiar el expediente retrospectivamente. El historial de eventos de la OT es valioso, pero no sustituye una copia inmutable de cada documento emitido.

### P0 — La cadena de aprobaciones no está implementada

El estado “Cerrada” habilita el cierre y el acta (`reportService.ts:789–796`), pero no acredita inspección final, aceptación del cliente o firma. Todas las firmas en las cinco salidas son líneas vacías (`reportTemplates.ts:335–343`); la encuesta del acta muestra números, no respuestas capturadas. Los estados documentales de la OT (`Pendiente`, `enviada`, `firmada`) no son actualizados automáticamente por exportar y no representan el ciclo real de un documento. No hay referencia de un documento a la versión aprobada del anterior. El código no debe inferir “conforme” de “OT cerrada”.

### P1 — Identidad y procedencia incompletas

Cuatro documentos no muestran el nombre del proyecto; solo cierre recibe `proyectoNombre`. El código de OT puede no bastar para identificar globalmente el trabajo. Faltan identificador del documento, revisión, fecha/hora y zona de emisión, autor, revisor, emisor, empresa/cliente y referencia cruzada al expediente. Los encabezados/footers usan siempre BBC Constructora y Guaraní 3D y un logo remoto fijo (`reportTemplates.ts:211–258`), aunque la aplicación maneja empresas y proyectos distintos. Esto debe resolverse mediante configuración de emisor aprobada, no con un texto libre en cada exportación.

### P1 — Fuentes de datos y momento equivocados

La ficha prellena “Descripción del Trabajo” desde `orden.comentarios`, que el formulario llama **“Observaciones del técnico”**; el reclamo del cliente está en `orden.descripcion` y no aparece explícito. El relevamiento y el avance usan el último comentario de transición “Pendiente → En proceso”. Por ello un avance posterior puede repetir un comentario antiguo en vez de reflejar el período. El cierre toma “En proceso → Cerrada”, que puede estar vacío si la secuencia fue distinta. El porcentaje del avance sale del valor actual de la OT; “Días en ejecución” se calcula contra `Date.now()`, incluso al regenerar una OT cerrada, de modo que el mismo informe envejece. Véanse `ModalInformeOT.tsx:245–275`, `reportService.ts:1248–1253` y `PanelOT.tsx:1075–1078`, `:1195–1200`.

### P1 — Fotos y recursos sin criterio de emisión

Las secciones de fotos leen las imágenes actuales del servidor, no una selección aprobada ni un snapshot de los IDs/revisiones usados. Las fotos pendientes de sincronizar no entran en ese fetch. El usuario puede desmarcar “Incluir fotos” incluso para un informe que se presenta como evidencia final; la plantilla entonces muestra el aviso de que no hay fotografías registradas, que puede ser falso. Cuando una imagen no se incorpora al HTML portable se inserta un aviso y se permite exportar. El informe debería distinguir **sin evidencia**, **evidencia excluida a propósito** y **evidencia faltante por error**, y bloquear emisión oficial si falta una evidencia obligatoria.

### P1 — Impresión y legibilidad sin prueba de aceptación

En las capturas entregadas, el logo es diminuto, la cabecera deja demasiado aire, el checklist comprime “No conforme”, las etiquetas y el pie usan texto muy pequeño y las fotos de avance aparecen desproporcionadas. La corrección reciente de fotos eliminó el recorte, pero todavía no hay una inspección de un PDF nuevo. El CSS mezcla páginas A4 internas, `@page`, márgenes adicionales, footer fijo y saltos de página explícitos; relevamiento, avance y cierre combinan `page-break` con `break-before` en la siguiente sección. Es un riesgo concreto de páginas vacías, contenido huérfano o pie superpuesto. El contador de página usa color blanco con opacidad sobre fondo blanco (`reportTemplates.ts:209`), por lo que no resulta visible. La generación con `window.print()` tampoco verifica que la impresión se haya completado. Estos puntos requieren renderizar y revisar PDFs cortos y largos en A4, no inferirlos solo del HTML.

**Límite de esta auditoría visual:** se generaron los cinco HTML de muestra con datos ficticios y se inspeccionó su contenido; la automatización local no logró producir PDFs y el navegador de inspección bloqueó la URL local por su política de seguridad. No se afirma que la paginación exacta ya esté comprobada. La valoración visual se apoya además en las capturas de tablet 24–28 y 42, que corresponden a una versión anterior de las fotos.

## Evaluación por documento

| Documento | Lo que ya resuelve | Lo que impide considerarlo registro final |
|---|---|---|
| **Ficha de visita técnica** | OT, obra, unidad, responsable, rubro, fechas de trabajos, texto editable, checklist imprimible, compromisos y firmas. | No muestra fecha/hora real de visita ni visitante/participantes; no incluye el reclamo original como tal; el checklist y compromisos son espacios vacíos y no se registran en el sistema; “Descripción del Trabajo” se precarga desde observaciones del técnico. No hay decisión de habilitación, riesgos o restricciones trazables. |
| **Relevamiento** | Diagnóstico textual inicial y fotos ANTES, además de metadatos compartidos. | El diagnóstico depende de un comentario de cambio de estado; trabajos, materiales y plazo son cuatro líneas vacías cada uno. Faltan activo/equipo, mediciones y pruebas, hipótesis/causa, alcance propuesto, exclusiones, criterio de aceptación y aprobación de cambios. La foto no queda ligada a un hallazgo concreto. |
| **Avance** | Porcentaje, estado, prioridad, días y fotos ANTES/DURANTE. | No indica período ni número de avance; no compara plan vs. realizado ni documenta tareas, cantidades, impedimentos, desviaciones o acciones. Precarga el comentario inicial y deja las observaciones de avance en blanco. Los días se recalculan al abrir; el porcentaje no explica base ni método. |
| **Cierre** | Fecha de inicio/cierre, antecedentes textuales, fotos ANTES/DESPUÉS y zona de firmas. | Declara hechos no verificados; no lista trabajos ejecutados, inspecciones, pruebas, resultados, defectos/reservas ni evidencia por criterio. El título “Proyecto finalizado” es incorrecto para una OT. Garantía y conformidad están preafirmadas. No vincula los relevamientos/avances emitidos. |
| **Acta de conformidad** | Datos básicos, texto de recepción, encuesta imprimible y firmas. | La conformidad se afirma antes de la decisión/firma; encuesta no captura respuestas; no admite recepción con reservas o rechazo; no nombra firmantes ni documenta poderes/fecha de firma; garantía promete cobertura con plazo vacío; no referencia una versión del cierre. Debe distinguir borrador, enviado, aceptado, aceptado con reservas y rechazado. |

## Diseño mínimo del expediente coherente

1. **Identidad común:** ID interno de OT, proyecto y empresa; código legible; ubicación/activo; cada documento con tipo, número, revisión, fecha de emisión, estado, autor y referencias a documentos previos. El código impreso debe permitir encontrar el registro exacto.
2. **Datos por fase, con dueño:** conservar `reclamo` y `observación técnica` separados. Guardar visita, diagnóstico, alcance aprobado, avances por período, pruebas de cierre y decisión del cliente como registros tipados; no derivarlos de un comentario genérico o de un estado actual.
3. **Snapshots emitidos:** previsualización en borrador, revisión y emisión. Al emitir, congelar datos, texto, evidencias/IDs/revisiones y representación final; registrar versión, actor, instante y hash del archivo. Las correcciones crean una revisión nueva y la anterior queda recuperable como sustituida.
4. **Evidencia verificable:** cada foto tiene categoría, autor, fecha y relación con hallazgo/trabajo/criterio; falta de foto, exclusión deliberada y error de descarga son estados diferentes. Un cambio de foto posterior no cambia el documento emitido.
5. **Aprobación separada:** cierre técnico interno y recepción del cliente son decisiones distintas. El acta debe capturar nombre, cargo, fecha, firma o mecanismo de aceptación, y reservas/rechazo. No escribir “conforme” sin esa decisión.
6. **Reglas de emisión:** exigir solo los datos relevantes para cada fase, mostrar los faltantes y permitir borrador marcado. No emitir cierre/acta oficial con afirmaciones o evidencia obligatoria sin verificar. Las firmas en blanco y respuestas en blanco deben aparecer como **pendientes de completar**, nunca como validaciones ya ocurridas.
7. **Plantilla gráfica única:** jerarquía sobria de portada/cabecera, datos esenciales, cuerpo y anexos; fuente legible en A4, tablas con espacio suficiente, fotos completas con número/caption, pie con ID/revisión/página; logos locales/configurados. HTML de vista previa y PDF deben usar la misma representación comprobada.

## Orden de corrección y prueba de aceptación

| Prioridad | Entrega | Prueba que la cierra |
|---|---|---|
| **1 — Confianza inmediata** | Quitar o condicionar afirmaciones fijas de limpieza, daños, auditoría, ISO, garantía y recepción conforme. Marcar salidas no firmadas como borradores. | Ningún PDF generado desde una OT de prueba afirma un hecho que no esté registrado y aprobado. |
| **2 — Contrato documental** | Modelo de expediente, datos tipados de cada fase, estados de documento y vínculo entre versiones. | Una OT atraviesa las cinco etapas y se puede reconstruir exactamente qué información aprobó cada persona y cuándo. |
| **3 — Plantillas** | Reescribir las cinco fichas alrededor de sus decisiones propias, con campos reales y sin duplicación innecesaria. | Cada dato visible tiene fuente conocida; cada campo esencial faltante se señala; informe regenerado no cambia una versión emitida. |
| **4 — Emisión y firma** | Guardar archivo/hash, registrar emisión y recepción, capturar reservas y firma. | Exportar, compartir y abrir desde otra sesión recupera el mismo documento; cancelar impresión no se registra como documento emitido. |
| **5 — QA visual** | Render A4 con 0/1/5+ fotos, texto largo, datos faltantes y acta con reservas; revisar en tablet y escritorio. | Sin páginas en blanco, cortes, footer superpuesto, texto diminuto ni fotos truncadas. |

**No corresponde afirmar aún que el compendio cumple ISO 9001 ni que el cliente aceptó los trabajos.** El objetivo es que pueda sostener ambas clases de afirmaciones solo cuando existan los registros y aprobaciones pertinentes.
