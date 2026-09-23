# Especificación del expediente documental de Plan-OTs

Fecha: 23/09/2026. Estado: diseño propuesto para revisión mediante mockups; aún no implementado.

Base: auditoría `AUDITORIA_EXPEDIENTE_INFORMES_2026-09-23.md`, código `98ee86c` y estructuras actuales de acceso, almacenamiento, fotos e historial. Alcance: visita, relevamiento, avances, cierre técnico y acta de conformidad de una OT. El usuario solicita completar este análisis con Astra y realizar los mockups con Sol Alto antes de implementar.

## 1. Decisiones rectoras

1. Cada documento responde una pregunta y aporta hechos nuevos. La identificación mínima se repite para que una copia aislada sea comprensible. Las narraciones, pruebas y fotos se referencian; no se duplican automáticamente.
2. Una OT puede tener varios ciclos, visitas, relevamientos y avances. Los cinco tipos de documento forman el expediente; no se fuerza que existan exactamente cinco archivos.
3. Estado operativo de la OT, estado documental y decisión del cliente son independientes. Cerrar una OT no significa que el cliente haya aceptado el trabajo.
4. Una versión emitida conserva los datos, archivos, evidencias y aprobaciones exactos. Corregir crea una nueva revisión con motivo y relación con la anterior.
5. Nada afirma conformidad, limpieza, ausencia de daños, garantía, cumplimiento ISO o firma sin un dato verificable que lo respalde.
6. Un borrador admite faltantes visibles. La emisión exige los requisitos propios del documento y de su procedimiento. No se inventan registros para completar una secuencia.
7. El alcance es una OT. Su cierre no implica que haya terminado el proyecto.

## 2. Distribución de información y ausencia de duplicación

| Información | Documento de origen | Uso posterior permitido |
|---|---|---|
| Reclamo del solicitante y condiciones encontradas al llegar | Visita | Relevamiento referencia reclamo; cierre solo identifica el objeto intervenido. |
| Hallazgos, pruebas de diagnóstico y causa probable | Relevamiento | Avance cita hallazgo si surge un desvío; cierre referencia diagnóstico sin volver a desarrollarlo. |
| Alcance, exclusiones y criterios de aceptación aprobados | Relevamiento y sus revisiones | Avances citan ítems; cierre compara ejecución y resultados con esos ítems. |
| Ejecución de un período, impedimentos y acciones | Cada avance | Cierre resume resultado final y cita avances, sin copiar la bitácora. |
| Pruebas finales y resultado del trabajo | Cierre técnico | Acta referencia cierre/revisión y entrega, sin repetir diagnóstico, mediciones ni todas las fotos. |
| Recepción, reservas y decisión del cliente | Acta | Expediente muestra decisión y acciones pendientes; no la infiere retrospectivamente en documentos previos. |
| Cambios de alcance | Revisión de relevamiento o registro controlado vinculado | Avance registra solicitud/impacto; solo una autorización explícita cambia la base aprobada. |
| Garantía contractual del trabajo entregado | Condición contractual identificada y resumida en acta | Cierre enlaza si es relevante; no usa `en_garantia` para prometer una garantía nueva. |

Identificación común impresa: emisor, cliente, proyecto, OT, ubicación/activo, tipo y número del documento, revisión, fecha del hecho/período, fecha de emisión y responsables pertinentes. En páginas siguientes basta cabecera corta y pie con número/revisión/página X de Y. Evitar repetir estado, rubros secundarios, prioridad, riesgos genéricos y costos cuando no aportan a la decisión de esa pieza.

Una referencia muestra tipo, número, revisión y sección/ítem. Las fotos tienen ID y leyenda estable. Se repite una foto únicamente si sustenta una comparación necesaria; por ejemplo, antes/después en cierre. El acta no lleva una galería por defecto. Un archivo individual incorpora las conclusiones necesarias y sus anexos indispensables; no depende exclusivamente de enlaces que exijan sesión. El expediente completo conserva cada evidencia una sola vez en su repositorio y permite varios vínculos.

## 3. Contrato de contenido por documento

R = obligatorio para emitir; C = obligatorio cuando aplica, con justificación registrada si no aplica. Las secciones no aplicables se resumen, no se rellenan con páginas vacías. Toda respuesta negativa o reserva exige tratamiento, responsable y fecha cuando corresponda.

### 3.1 Ficha de visita técnica — ¿qué se pidió y qué se encontró al llegar?

| Bloque | Datos y procedencia | Regla |
|---|---|---|
| Identificación de visita | Fecha/hora real, visitante, participantes y representación; registro nuevo de visita. Proyecto/OT/ubicación desde entidades seleccionadas, confirmados en visita. | R. Fecha de ingreso de OT no sustituye fecha de visita. |
| Solicitud | Reclamo original desde `orden.descripcion`, solicitante y fecha/fuente del pedido. | R. Mantener separado de la observación técnica. Si el reclamo cambió, conservar el recibido y registrar la aclaración. |
| Condición inicial | Observación del visitante, activo/equipo/sector; fotos iniciales seleccionadas por condición. | R observación; C activo/fotos según procedimiento. Serie, modelo y etiqueta si existen y son relevantes. |
| Acceso y preparación | Checklist contestado: conforme/no conforme/no aplica, observación y evidencia requerida. | C por tipo de intervención. Registrar quién/cuándo verificó; no imprimir casillas vacías como verificación. |
| Restricciones | Accesos, horarios, interferencias, disponibilidad y riesgos observados; derivación de seguridad cuando corresponda. | R respuesta explícita. No sustituye permisos de trabajo ni evaluación especializada. |
| Compromisos | Acción, responsable, fecha y condición de acceso/próxima visita. | C. Sin compromisos: indicarlo. |
| Resultado de visita | Requiere relevamiento / información pendiente / derivación / no procede con motivo; constancia del visitante y del contacto si el procedimiento lo exige. | R. Constatar visita no equivale a aceptar trabajos futuros. |

Excluir: diagnóstico desarrollado, presupuesto, avance, pruebas finales y recepción. Extensión objetivo: 1–2 páginas más evidencia necesaria. El código FOR-09-01 solo se adopta si BBC confirma formulario y revisión oficial; no inventar los códigos de calidad.

### 3.2 Informe de relevamiento — ¿qué se diagnosticó y qué se propone realizar?

| Bloque | Datos y procedencia | Regla |
|---|---|---|
| Referencia | Visita/revisión o motivo de intervención directa; fecha, técnico y activo. | R. Resumen de necesidad en una frase, sin copiar relato de visita. |
| Hallazgos | ID, condición observada, localización y evidencia enlazada. | R al menos un hallazgo o conclusión justificada de ausencia de falla. |
| Pruebas y mediciones | Método, valor/unidad, condición de prueba, referencia y equipo usado cuando sea relevante; certificado/calibración si el procedimiento lo exige. | C. Foto no equivale a medición. No fabricar lecturas. |
| Diagnóstico | Causa confirmada/probable/no determinada; sustento y limitaciones. | R. Explicitar incertidumbre. |
| Alcance propuesto | Ítems con ID estable, acción, cantidad/unidad cuando aplica, entregable y exclusiones. | R. Añadir supuestos, recursos/materiales y plazo estimado relevantes. |
| Aceptación prevista | Criterio verificable por ítem, método de prueba y resultado esperado/tolerancia; fuente técnica o acuerdo. | R para cada ítem ejecutable. No usar “funciona bien” como único criterio. |
| Decisión de alcance | Propuesto/aprobado/rechazado; persona con autoridad, fecha y versión exacta. | R estado explícito. Puede emitirse propuesta; ejecución utiliza versión aprobada o excepción de emergencia autorizada y registrada. |

Excluir: cronología diaria, resultados finales y conformidad del cliente con la entrega. Costos solo en presupuesto/anexo comercial con permisos propios, si se requieren. Objetivo: 2–3 páginas más anexos técnicos.

### 3.3 Informe de avance — ¿qué se hizo en este período y qué falta?

| Bloque | Datos y procedencia | Regla |
|---|---|---|
| Corte | Número de avance, período desde/hasta, autor y alcance aprobado de referencia. | R. Fecha de corte fija; no usar el día en que se vuelve a descargar. |
| Ejecución | Por ítem: previsto, realizado en período, acumulado y saldo; unidad/hito y evidencia durante. | R. Diferenciar período y acumulado. |
| Progreso | Método y base: cantidades, hitos ponderados o estimación declarada; porcentaje calculado/validado al corte. | R si se informa porcentaje. Denominador versionado, sin comparar cantidades heterogéneas como si fueran equivalentes. |
| Desvíos | Impedimento, impacto en plazo/alcance, acción, responsable y fecha; solicitudes de cambio enlazadas. | R respuesta, aunque sea “sin desvíos registrados al corte”. No implica ausencia comprobada si no hubo revisión. |
| Próximo período | Tareas/objetivos y dependencias concretas. | R mientras haya trabajo pendiente. |
| Validación | Autor y revisión exigida por procedimiento. | R. La firma del cliente no es obligatoria por defecto en cada avance. |

Excluir: diagnóstico completo, repetición de fotos iniciales, garantía y recepción final. Duración se calcula con fechas reales y corte; días calendario/laborables debe estar rotulado. Objetivo: 1–2 páginas por período más evidencia pertinente.

### 3.4 Informe de cierre técnico — ¿qué quedó ejecutado y con qué resultados?

| Bloque | Datos y procedencia | Regla |
|---|---|---|
| Base | Alcance aprobado/revisión, cambios aprobados y avances relacionados; fechas reales de ejecución. | R. Un resumen breve del objeto del trabajo. |
| Ejecución final | Ítem contratado/aprobado, trabajo efectivamente realizado, cantidades finales si aplican y desvío autorizado. | R cobertura de todo el alcance. |
| Verificación | Por criterio: método, resultado/valor, conforme/no conforme/no verificable, evidencia, verificador y fecha. | R. Los criterios vienen de la base aprobada; las lecturas se capturan al verificar. |
| Pendientes | Defectos, pruebas pendientes, exclusiones sobrevenidas, restricciones de uso y acciones con responsable/fecha. | R respuesta. Una condición insegura o criterio esencial incumplido bloquea declarar cierre satisfactorio. |
| Entrega técnica | Manuales, certificados, llaves, capacitación y otros entregables efectivamente entregados, con referencias. | C según alcance. |
| Conclusión | Conforme técnicamente / con pendientes autorizados / no conforme; autorización interna identificada. | R. No equivale a conformidad del cliente. Los pendientes permitidos dependen del procedimiento y no eluden seguridad ni requisitos esenciales. |

Checklist de limpieza/daños únicamente con respuestas registradas. Fotos finales esenciales, comparación antes/después cuando demuestre resultado y leyendas relacionadas con criterios. Excluir: relato de diagnóstico, bitácora íntegra, encuesta de satisfacción, garantía automática y “proyecto finalizado”. Objetivo: 2 páginas más anexos de pruebas/evidencias cuando hagan falta.

### 3.5 Acta de conformidad — ¿qué recibe y decide el cliente?

| Bloque | Datos y procedencia | Regla |
|---|---|---|
| Objeto de recepción | Descripción breve del servicio entregado, cierre técnico exacto (ID/revisión) y anexos recibidos. | R. No copiar pruebas o diagnóstico. |
| Receptor | Nombre, organización, cargo/calidad en que interviene y autoridad para recibir; mecanismo de identificación. | R. El usuario técnico de Plan-OTs no firma por el cliente. |
| Decisión | Aceptado / aceptado con reservas / rechazado; fecha/hora y manifestación expresa. | R para acta formalizada. Borrador o pendiente de firma no se rotula conforme. |
| Reservas | Detalle preciso, vínculo con pendiente/ítem, responsable, plazo y tratamiento acordado. | C obligatorias para reservas/rechazo; no esconderlas en anexos. |
| Condiciones | Garantía acordada: referencia contractual, cobertura, inicio, duración y exclusiones aplicables; documentos/instrucciones entregados. | C. Si no está definida, mostrar pendiente y resolver antes de prometerla. `en_garantia` no es esta fuente. |
| Manifestaciones y firmas | Decisión y alcance del consentimiento, firmantes, fechas, método y vínculo con archivo/revisión; recibo de validación. | R según política de firma acordada. |

Excluir: fotos de rutina, mediciones, antecedentes extensos, costos internos y encuesta obligatoria. La satisfacción opcional es un registro aparte, no una condición para aceptar. Objetivo: una página; segunda solo para reservas o anexos de firma necesarios.

## 4. Fuentes, tiempos y permisos

| Dato actual | Uso correcto | Cambio requerido |
|---|---|---|
| `orden.descripcion` | Reclamo recibido | Snapshot de origen al registrar visita, con aclaraciones separadas. |
| `orden.comentarios` | Observaciones generales del técnico | No precargar como diagnóstico/avance/cierre certificado. Importación asistida exige confirmación y conserva fuente. |
| Comentario de transición | Evidencia contextual del historial | No es el contenido oficial de una fase. Conservar ID/actor/fecha si se cita. |
| `obra`, `unidad_amenities`, `ubicacion` | Identificación física | Confirmar diferencia proyecto/obra/sector; no sustituir un vacío con otro campo sin regla visible. |
| `fecha_inicio_trabajos`, `fecha_fin_trabajos` | Datos de planificación actuales, salvo confirmación explícita | Separar previstas/reales. No dar por realizadas las fechas planificadas. |
| `porcentaje_avance`, `costo` | Indicadores operativos actuales | Avance congela método/base/corte. Costo requiere permiso servidor y anexo apropiado. |
| `en_garantia` | Situación del reclamo original | Nueva garantía contractual independiente. |
| `Proyecto.cliente` | Nombre textual | No prueba identidad ni autoridad del firmante; agregar ficha controlada de emisor/receptor. |
| Tabla `versiones` | Snapshot restaurable del proyecto | No reutilizar para emisión: es parcial, mutable/restaurable y eliminable. |
| `fotos.revision` y originales | Procedencia de evidencia | Retener binarios exactos usados independientemente de borrado/edición de la foto operativa. |

Guardar instantes UTC y zona IANA de presentación; fechas civiles sin convertirlas a UTC ni restar un día. Separar fecha del hecho, carga, revisión, emisión y firma. No asumir un offset fijo para Paraguay. Los hechos históricos no cambian al renombrar un usuario o proyecto.

El servidor verifica tenant, proyecto, OT y todas las referencias en cada operación. Definir capacidades explícitas de redactar, revisar, emitir, aceptar, consultar y administrar archivo; los actuales `editar`/`administrar` no bastan para inferir autoridad de firma. Permiso de ver costos se aplica antes de construir el snapshot/render, no ocultando elementos con CSS. Una versión para destinatario diferente es una publicación identificada, no el mismo ID con contenidos distintos.

## 5. Identidad y modelo documental

Entidades propuestas; nombres físicos a resolver durante implementación:

- **Expediente:** tenant, proyecto, OT, ciclo de intervención, índice de documentos y estado de completitud.
- **Registro de fase/borrador:** datos tipados propios, referencias de origen, autor, validaciones y contador de concurrencia. Se guarda de forma recuperable.
- **Documento:** identidad estable, tipo y secuencia de visita/avance/etc. Numeración legible propuesta: proyecto/OT/ciclo/tipo/secuencia; revisión independiente. Identificador global interno UUID.
- **Revisión:** snapshot canónico, versión de esquema y plantilla, idioma, emisor/cliente/ubicación/actores congelados, período/fechas, audiencia, referencias exactas, motivo de cambio, revisión precedente y hash de contenido.
- **Evidencia retenida:** ID, origen, revisión de foto, binario original y representación anotada usada cuando corresponda, hashes, tamaño/MIME, autor/fecha conocida y vínculos con hallazgo/ítem/criterio. Fecha de carga no se presenta como captura si esta no se conoce.
- **Artefacto:** binario PDF exacto, hash de bytes, tamaño, ubicación privada y metadatos de render. HTML portable es representación complementaria identificada. Firmado es artefacto derivado vinculado al original.
- **Decisión/aprobación:** actor, capacidad y representación comprobadas, decisión, alcance, motivo/reservas, instante, revisión/hash exactos, método y evidencia de autenticación/validación. Datos sensibles con acceso restringido.
- **Evento y entrega:** historial anexable de revisión/emisión/sustitución/anulación/envío/recepción/aceptación; destinatario y resultado. Solicitar exportación, descargar y leer son eventos diferentes.

Una aprobación del alcance no es aprobación del cierre. Una autorización interna no es firma del cliente. Los IDs del snapshot se contrastan en servidor y no se aceptan referencias a otro tenant. No usar FK con borrado en cascada desde OT/foto hacia registros emitidos. Archivar operación no destruye expediente.

## 6. Ciclo de revisión, emisión y firma

Estados de trabajo: borrador → candidato congelado → en revisión → aprobado para emitir → emitido. Rechazar revisión devuelve un nuevo borrador; nunca modifica el candidato. Sustituido/anulado son eventos posteriores que conservan los archivos y motivos. Una aprobación retirada queda registrada y no desaparece.

Recepción del cliente tiene su propio ciclo: pendiente → aceptada / aceptada con reservas / rechazada. “Enviado” y “abierto” no son decisiones. Un acta pendiente de firma puede emitirse como instrumento pendiente claramente rotulado; solo se formaliza cuando se completa la política de firma. La decisión elegida y sus reservas deben formar parte del contenido mostrado al firmar.

Proceso obligatorio:

1. Guardar y sincronizar los datos/evidencias; validar campos y permisos. La edición offline produce borrador, nunca emisión oficial offline sin controles equivalentes.
2. Congelar snapshot, referencias, número/revisión y metadatos que deban imprimirse. Registrar versión de origen y detectar edición concurrente.
3. Generar candidato PDF con plantilla, fuentes y recursos fijados. Calcular en servidor hash del snapshot canónico y hash de bytes del PDF; son valores distintos.
4. Revisar y aprobar ese contenido y ese artefacto exactos. Cambiar cualquier dato/reserva/evidencia invalida el candidato y exige nueva revisión/aprobación.
5. Emitir conservando exactamente los bytes aprobados. El instante definitivo del evento se guarda en registro/recibo externo si no podía conocerse al preparar el PDF; no se reescribe el PDF aprobado para actualizar el pie.
6. Para firma, entregar ese artefacto; conservar original, archivo firmado y comprobante/validación del proveedor. No reimprimir ni regenerar el PDF firmado. Firmas sucesivas solo mediante mecanismo compatible que preserve/verifique las anteriores.
7. Si el cliente agrega reservas antes de firmar, generar un nuevo candidato que las contenga; no adjuntarlas silenciosamente a un consentimiento sobre otro contenido. La formalización posterior se muestra con recibo asociado al documento, sin alterar sus bytes.
8. Corregir un emitido crea revisión nueva, motivo y referencias. Sustitución efectiva y notificación deben quedar registradas. La copia vieja no puede borrarse de los dispositivos que ya la recibieron.

Una revisión nueva del relevamiento posterior a un avance no altera ese avance. Si afecta un cierre o acta anteriores, abrir evaluación de impacto y nuevo ciclo/revisión; nunca trasladar automáticamente las firmas. Reabrir la OT conserva la recepción anterior y separa la nueva intervención. Una fase omitida exige motivo y autorización según procedimiento; no crear visitas ficticias.

## 7. Emisión y exportación fiables

El PDF emitido es el archivo canónico conservado; “imprimir” es una acción posterior sobre ese archivo. La impresión del navegador no acredita guardado, entrega ni firma. Para borradores puede mantenerse exportación marcada; debe ser imposible confundirla con emisión oficial.

La base de datos y Storage no comparten una única transacción. Implementar un trabajo idempotente por candidato:

1. Transacción de preparación: comprobar sesión/capacidad, fuentes, bloqueo de revisión y clave de idempotencia ligada al payload. Asignar identidad única; huecos por fallo quedan explicados, no reutilizados.
2. Render en servicio aislado con recursos permitidos y sin HTML arbitrario del cliente ni descargas arbitrarias. No asumir que Supabase Edge puede ejecutar Chromium; seleccionar un worker compatible antes de implementar esta etapa.
3. Subir a ubicación privada de preparación, sin sobrescritura. Verificar archivo, hashes, fuentes, imágenes, integridad y tamaño en servidor.
4. Aprobar candidato y finalizar mediante transacción que revalide capacidad, revisión y aprobaciones. Solo entonces crear evento de emisión y referencia al artefacto verificado. Fallos intermedios quedan como pendientes/fallidos recuperables.
5. Reintentos devuelven el mismo resultado; otra carga con la misma clave se rechaza. Outbox para render/entrega y callbacks autenticados, deduplicados y ligados a revisión. No crear dos emisiones por doble toque.
6. Limpiar únicamente temporales huérfanos tras comprobación. Binarios emitidos requieren políticas de no sobrescritura/no borrado y retención, además de `upsert:false`.

Bloquear emisión si falla una evidencia obligatoria, está sin sincronizar o existe conflicto. Distinguir evidencia inexistente, no aplicable, excluida justificadamente y fallida. El límite actual de 30 MB del HTML no puede causar pérdidas silenciosas: ofrecer expediente con anexos, sin rebajar automáticamente calidad ni omitir datos. Limitar tamaño en prevalidación con explicación y alternativa.

Exportación de expediente: paquete con índice legible, PDFs originales, derivados firmados, anexos/evidencias necesarias, manifiesto con IDs/revisiones/relaciones/hashes y recibos de aprobación autorizados para el destinatario. Mantener manifiesto interno completo y paquete externo con información pertinente; ambos identificados y con inventario explícito. Hashes detectan cambios, por sí solos no autentican al emisor: conservar firma/sello del manifiesto o verificación autenticada contra el registro de emisión cuando se requiera procedencia comprobable.

HTML portable conserva contenido e imágenes/fonts permitidas sin URLs temporales ni dependencias externas. Si no admite conservar firma PDF, incluye referencia y PDF firmado en el paquete; no pretende heredar la firma. Referencias offline resuelven a archivos incluidos; una consulta online de vigencia es complementaria. No concatenar PDFs firmados y presentar el resultado como original firmado: conservar cada original.

Definir retención por tipo, contrato y política de BBC; suspensión de eliminación ante controversia; backups y restauración ensayada de DB+Storage+evidencias de firma. No asumir retención eterna ni plazo legal sin validación. Los permisos de descarga se revalidan en servidor; enlaces temporales no son la referencia histórica del documento.

## 8. ISO, procedimientos y alcance de las firmas

La aplicación debe sostener el sistema de calidad con registros comprobables. Los cinco documentos no sustituyen por sí solos los procedimientos, la competencia de las personas, las auditorías ni todos los registros de una organización.

Al consultar el catálogo oficial el 23/09/2026, ISO presenta ISO 9001:2026 como edición publicada. BBC debe confirmar la edición adoptada y su transición con su organismo certificador. No se trasladan automáticamente numeraciones de cláusulas de 2015 a 2026. Fuente: [catálogo oficial ISO 9001](https://www.iso.org/standard/9001). La [guía de información documentada de 2015](https://www.iso.org/iso/documented_information.pdf) utilizada en la auditoría anterior sirve como antecedente; no equivale a auditar el texto completo de la edición vigente.

| Control documental propuesto | Registro que lo sustenta | Validación prevista |
|---|---|---|
| Identificación y control de cambios | Número, revisión, motivo, plantilla, autor y fechas | Recuperar todas las revisiones, sin sobrescribir. |
| Revisión y autorización | Decisión sobre candidato/hash exactos y capacidad del actor | Modificar contenido invalida aprobación; permisos se comprueban en servidor. |
| Disponibilidad y conservación | Artefactos, evidencias, referencias y política de retención | Restaurar expediente verificando hashes y lectura offline. |
| Requisitos y cambios de alcance | Ítems, criterios y revisiones aprobadas | Cierre cubre cada criterio o registra excepción válida. |
| Verificación y liberación del servicio | Pruebas, resultado y responsable de cierre | No afirmar conformidad ante prueba faltante o fallida. |
| Tratamiento de no conformidades | Hallazgo, disposición, responsable, plazo y verificación | Reserva sigue abierta hasta cierre comprobado. |
| Trazabilidad y recepción | Enlaces entre fases, evidencia y aceptación | Identificar qué versión recibió y decidió cada persona. |

Responsable de calidad de BBC debe vincular cada control con su procedimiento y edición/cláusula aplicable, aprobar contenido/códigos de formularios y confirmar suficiencia. Hasta entonces no imprimir certificación, logotipo ISO ni una declaración genérica de cumplimiento.

Para Paraguay, el artículo 39 de la Ley 6822 distingue firma electrónica y firma electrónica cualificada; esta última tiene equivalencia con la manuscrita, y una firma no cualificada no pierde efectos por ese solo motivo. Fuente: [Ley 6822 publicada por el MIC, artículo 39](https://www.mic.gov.py/wp-content/uploads/2023/11/Ley-Nro-6822-2021pdf-1.pdf). Esto no permite prometer que cualquier dibujo o clic satisface cada contrato. BBC debe definir mecanismo, autoridad del receptor y requisitos contractuales con su asesoría; el diseño conserva la evidencia necesaria sin anticipar esa conclusión jurídica.

Opciones que el modelo debe admitir: firma electrónica con proveedor y validación; aceptación autenticada con manifestación y evidencias según política aprobada; firma manuscrita en papel con digitalización íntegra enlazada al ID/revisión y conservación del original según política. Quien carga un escaneo certifica la carga, no se convierte en firmante. Un hash, un correo, una foto de firma o un log aislado no se rotulan como firma cualificada.

## 9. Criterios gráficos y de uso

- A4 vertical, márgenes únicos controlados, cabecera sobria, emisor visible y sin logo remoto de terceros. Título claro y estado documental separado del estado de OT.
- Cuerpo objetivo 10,5–11 pt, etiquetas 9–10 pt, pie legible de al menos 9 pt; contraste suficiente también en impresión gris. No comprimir texto para cumplir una cantidad de páginas.
- Tablas con encabezado repetido, unidades y resultados claros; filas indivisibles cuando caben. Texto largo continúa con identificación, sin cortes ni huecos artificiales.
- Fotos completas, proporción conservada, leyenda, fase/fecha conocida y referencia al hecho. No páginas decorativas ni fotos que no aporten prueba.
- Firma junto a la decisión y reservas; si continúa en otra página, repetir referencia inequívoca a condiciones aceptadas. Sin firmas huérfanas.
- Vista previa ajustada al ancho y zoom propio, misma fuente de contenido que el PDF; botones separados para guardar borrador, enviar a revisión, emitir y descargar versión. Estado de guardado visible.
- Quitar campos generales no pertinentes al documento. Mostrar campos condicionales al necesitarlos, con errores concretos y conservación del borrador.

## 10. Implementación por entregas, después de aprobar mockups

| Etapa | Entrega | Condición de salida |
|---|---|---|
| A | Cinco mockups coherentes y variantes críticas; datos ficticios | Revisión de contenido, distribución y legibilidad por el usuario. Sin cambios productivos. |
| B | Correcciones de confianza y borradores persistentes tipados | Sin afirmaciones fijas; guardado recuperable y fuentes correctas. |
| C | Esquema de expediente/revisiones, permisos, evidencia retenida | Pruebas de aislamiento, concurrencia y no alteración. Migración compatible y reversión preparada. |
| D | Candidato, revisión, emisión, render y descarga conservada | Artefacto exacto aprobado, reintentos seguros y restauración verificada. |
| E | Aceptación/firma y exportación de expediente | Identidad/decisión/hash vinculados, reservas completas y originales firmados conservados. |
| F | Validación integral y despliegue por lote | Flujo real en tablet, revisión PDF y criterios siguientes aprobados. |

Las etapas técnicas no deben liberar botones que prometan emisión/firma oficial antes de que existan sus garantías. Migración de informes históricos: inventariar archivos existentes y registrar procedencia conocida; clasificar como legado con información incompleta cuando falte evidencia. No reconstruir versiones pasadas desde la OT actual ni atribuir firmas retroactivas. No borrar datos para facilitar esta migración.

## 11. Pruebas de aceptación

1. Un caso atraviesa visita → alcance aprobado → dos avances → cierre → acta; cada dato tiene fuente, momento y dueño, sin repetir narraciones.
2. Descargar de nuevo una revisión produce exactamente los mismos bytes, aunque cambien OT, usuario, cliente, fotos o plantilla.
3. Editar/borrar una foto operativa no cambia una evidencia emitida. Un borrado de proyecto no elimina el expediente por cascada.
4. Dos editores y doble toque de emisión no pierden cambios ni duplican números. Clave repetida con otro payload se rechaza.
5. Fallo antes/después de subir archivo o finalizar DB se recupera sin emisión falsa; cancelar imprimir no es aceptación ni entrega.
6. Alterar reservas, contenido o alcance exige candidato y aprobación nuevos. Callback tardío de firma no formaliza otra revisión.
7. Usuario de otro tenant, referencia cruzada y permiso revocado durante emisión/descarga se rechazan. Ningún costo privado aparece en HTML, PDF, snapshot externo ni manifiesto del cliente.
8. Prueba fallida/no verificable, firma ausente y garantía no definida nunca se muestran como aprobadas. Cierre con pendiente autorizado no se presenta como cierre sin observaciones.
9. Recepción aceptada, con reservas y rechazada conservan decisiones y acciones diferentes. Reabrir no altera la firma anterior.
10. Expediente offline conserva PDFs, firmas, anexos e índice; hashes se verifican; la ausencia deliberada de un anexo restringido se informa sin exponer su contenido.
11. A4 con 0/1/5+ fotos, textos largos, tablas multipágina, nombres extensos, reservas y firma: sin recortes, páginas vacías, pie solapado ni texto ilegible; revisar PDF renderizado y tablet.
12. Restauración de respaldo recupera archivo original y recibos verificables; caducar URL de acceso no destruye las referencias.
13. Documentos legados se distinguen de emisiones controladas nuevas; vacíos históricos no se completan con supuestos.

## 12. Decisiones de BBC pendientes, sin impedir los mockups

Confirmar edición/procedimientos ISO y formularios; roles y separación de revisión/autorización; umbrales de evidencia por tipo de trabajo; casos de omisión/emergencia; método de firma y autoridad del cliente; condiciones contractuales/garantías; conservación y restricciones de entrega. Para mockups usar etiquetas de propuesta y datos ficticios, sin afirmar certificación ni firma real. Antes de producción estas decisiones se convierten en configuración y pruebas, no en texto libre interpretado por el desarrollador.

La definición funcional y técnica queda preparada. Siguiente paso recomendado: Sol Alto, elaborar los mockups según `BRIEF_MOCKUPS_EXPEDIENTE_2026-09-23.md` y revisarlos con el usuario antes de modificar el flujo productivo.
