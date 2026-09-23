# Plan-OTs: auditoría de las primeras pruebas en tablet

Fecha: 22/09/2026. Referencia de código: `ff80af8`.

## Alcance y conclusión

Se cruzaron las 44 capturas y sus nombres con el código local. Se consultaron las cabeceras públicas del sitio y documentación técnica primaria. No se modificaron la aplicación, la base de datos, los permisos ni los datos de la prueba de campo. Este documento es diagnóstico y especificación de trabajo; no certifica que la aplicación esté lista para producción.

La base visual y la organización por proyecto/OT son aprovechables. Los problemas principales son: controles pensados para mouse, recorridos de guardado poco claros, módulos heredados que no representan los permisos reales, datos inconsistentes entre pantallas e informes y un uso del espacio poco adecuado para tablet. Cambiar colores o agregar animaciones por sí solo no resuelve esos problemas.

Conviene mantener la identidad azul y clara, mejorar los componentes compartidos y corregir los recorridos completos. Calendario, grilla, Kanban y tarjetas de proyecto necesitan ajustes focalizados, no una reconstrucción indiscriminada.

### Cómo leer la evidencia

- **Confirmado en código:** existe una implementación concreta que explica el problema o una limitación.
- **Visible/reportado:** la captura o su nombre muestran el síntoma; no significa que se haya reproducido interactuando con la tablet.
- **Reproducido:** se ejecutó una comprobación específica durante esta auditoría.
- **Pendiente:** requiere dispositivo, sesión o archivo exportado para concluir.

Las capturas no permiten medir tiempos, fotogramas por segundo, pérdida de datos ni aislamiento entre empresas. Tampoco permiten deducir la resolución CSS del dispositivo a partir de los 1600 píxeles de la imagen. Las medidas propuestas abajo son en **píxeles CSS**.

## 1. Bloqueos funcionales y de confianza

### F01. Configuración: roles aparentes y funciones simuladas — prioridad crítica

**Evidencia:** `src/components/views/Configuracion.tsx:49`, `:67`, `:93`, `:129`.

El usuario puede seleccionar un rol y guardarlo en `user_metadata`. La lista de miembros presenta al usuario actual como “Creador” mediante un valor fijo. “Invitar” espera 800 ms y muestra una invitación enviada sin ejecutar una invitación real; eliminar cuenta es otro placeholder. La barra lateral, por su parte, muestra “Operador” fijo (`Sidebar.tsx:222`). Son tres representaciones incompatibles de la misma identidad.

Esto **no demuestra una escalada real de permisos**: la función `plan_es_creador()` del SQL consulta `plataforma_administradores`, no ese metadato editable (`supabase/migrations/202609200001_multitenancy_foundation.sql:75`). Falta repetir las pruebas de autorización contra el servidor desplegado antes de un lanzamiento.

**Propuesta:** perfil personal accesible a cada usuario; administración de plataforma exclusivamente para Creador; administración de empresa solamente según las capacidades reales disponibles. Unificar etiquetas con el contexto de acceso del servidor. Retirar el selector de autoasignación de rol y las funciones simuladas de la interfaz operativa. No inventar una delegación administrativa que el backend todavía no soporte.

**Aceptación:** una cuenta de campo no ve administración de plataforma; manipular metadatos o llamar directamente a una operación restringida no concede permisos. Mismo rol real en perfil, miembros y menú. Ninguna acción informa “enviado”, “eliminado” o “guardado” sin haber realizado esa operación.

### F02. Guardado de OT: falta confirmación positiva — prioridad alta

**Evidencia:** `src/components/plano/PanelOT.tsx:688–740`. Existe “Guardando…”, pero la ruta normal de éxito no muestra confirmación. Sí muestra errores y un aviso excepcional cuando no pudo verificar fotos.

**Propuesta:** estado visible junto al pie: “Cambios sin guardar” → “Guardando…” → “Guardado · 19:17”. Deshabilitar doble envío mientras espera. Ante error, mantener el formulario y permitir reintentar. Avisar al cerrar solamente si hay cambios pendientes. Definir por separado el guardado del formulario y la subida/edición de fotografías: actualmente son operaciones diferentes.

**Aceptación:** editar, guardar, cerrar, reabrir y recargar conserva los datos; una segunda sesión ve lo mismo. Ante corte de red no aparece éxito falso ni se pierde silenciosamente lo escrito. Las ediciones concurrentes explican el conflicto y conservan el borrador para resolverlo.

**Límite actual:** `src/security/sessionScope.ts` requiere conexión y desactiva el modo offline legado. No prometer “se sincronizará después” para una operación sin cola duradera probada. Mientras el producto sea conectado, debe decirlo claramente y conservar el borrador en el alcance que efectivamente soporte.

### F03. Fecha de ingreso aparece un día antes — prioridad alta

**Evidencia:** captura de grilla: 21/09 frente a 22/09 en el formulario. `VistaGrilla.tsx:177` usa `new Date(iso)`; la tarjeta también lo hace en `:899`. Hay otro formateador similar en `reportService.ts:87`.

**Reproducción:** `new Date('2026-09-22').toLocaleDateString('es-PY', {timeZone:'America/Asuncion'})` devolvió **21/9/2026**.

**Propuesta:** separar fechas civiles (`YYYY-MM-DD`, sin conversión de zona) de instantes (`created_at`, `updated_at`, con zona). Centralizar su formato y los cálculos de duración. No fijar manualmente el desfase horario de Paraguay. Revisar también valores por defecto basados en `toISOString().slice(0,10)` cuando se busca el día local.

**Aceptación:** ingreso 22/09 conserva ese día en formulario, grilla, tarjeta, calendario, Gantt e informes; probar cerca de medianoche y con otra zona configurada. Los registros de actividad sí muestran fecha y hora del instante correspondiente.

### F04. Informes: Obra y Unidad usan campos equivocados — prioridad alta

**Evidencia:** `src/services/reportTemplates.ts:275`. “Obra” lee `proyecto_nombre` mediante un cast a `any`; “Unidad o Sector” lee `ubicacion`. El formulario guarda `obra` y `unidad_amenities`. `ModalInformeOT.tsx:173–179` pasa la orden a varias plantillas sin incorporar el nombre del proyecto a ese campo esperado.

**Propuesta:** contrato tipado único para proyecto, obra, unidad, OT, emisor y evidencias. Usar los campos correctos, con una regla explícita para faltantes; no reemplazar “Obra” por “Proyecto” accidentalmente. Definir qué sucede si se genera un informe con cambios todavía sin guardar: ofrecer guardar y generar, o usar un borrador claramente identificado.

**Aceptación:** los datos de una OT de prueba coinciden campo por campo en formulario, vista de detalle, HTML y PDF. El informe no muestra “No especificado” cuando existe un dato válido. El informe compartido utiliza una versión identificable de la OT.

### F05. Marcadores del editor de fotos: falta soporte táctil explícito — prioridad alta

**Evidencia:** `src/components/plano/EditorFoto.tsx:285–309` y `:559–562`: dibujo mediante `onMouseDown`, `onMouseMove`, `onMouseUp`. El texto de la foto reporta que los marcadores no funcionan. No confundir estos marcadores con los pines de OT sobre el plano.

**Propuesta:** eventos de puntero para dedo, lápiz y mouse; captura/cancelación del puntero y transformación correcta de coordenadas con zoom. Diferenciar seleccionar, dibujar y navegar. Aumentar superficie táctil e identificar la herramienta activa con icono y etiqueta. Mantener original, anotaciones y resultado exportado de forma recuperable.

**Aceptación:** trazo libre, flecha, círculo y texto funcionan con dedo; deshacer/rehacer no borra la foto; guardar/reabrir y exportar conserva anotaciones y ubicación a diferentes escalas. Probar también mouse y lápiz si el dispositivo lo utiliza.

### F06. Plano: no existe pinch de dos dedos — prioridad alta

**Evidencia:** `VistaPlano.tsx:230–282`: zoom por rueda/botones y un único estado de arrastre; no hay seguimiento de dos punteros. Un segundo dedo puede reemplazar el origen del arrastre. Pulsar una zona libre también crea una OT (`:285`).

**Propuesta:** dos dedos amplían/reducen manteniendo el punto bajo el centro del gesto; un dedo desplaza; tocar un pin selecciona. Crear o reubicar OT mediante modo explícito para evitar altas accidentales. Mantener botones +/−/ajustar como alternativa accesible. Limitar el tratamiento especial de gestos al plano, conservando el zoom de la página fuera de él.

**Aceptación:** 20 gestos consecutivos en modo normal y pantalla completa, sin mover barras de la app, crear OTs involuntarias, desplazar pines respecto al plano ni saltar al retirar un dedo. Probar gesto cancelado, rotación y límites de zoom. [Referencia técnica: Pointer Events y pinch](https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events/Pinch_zoom_gestures).

### F07. Dictado: restricción de micrófono y errores silenciosos — prioridad alta

**Evidencia:** `public/_headers:5` contiene `microphone=()`. Una consulta HEAD al sitio público confirmó la misma cabecera en producción. `VoiceInputButton.tsx:76` descarta el detalle del error y solo apaga “Escuchando”. Detectar la existencia del constructor no garantiza que el servicio funcione.

**Propuesta:** revisar la política para permitir la captura necesaria desde el propio sitio, manteniendo el permiso del navegador. Mostrar estados de solicitud, escucha, transcripción y fallo; distinguir permiso denegado, dispositivo no disponible, servicio no soportado y problema de red. Dar alternativa de escritura y, cuando corresponda, dictado del teclado del sistema.

**Límite de la conclusión:** la restricción de micrófono está confirmada y afecta la captura mediante `getUserMedia`; su intervención exacta en el motor `SpeechRecognition` de esa tablet requiere prueba. No presentar un cambio de cabecera como solución comprobada de todo el dictado. [Política de micrófono](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Permissions-Policy/microphone).

**Aceptación:** pruebas reales concediendo/denegando permiso, sin conexión y con servicio no soportado. Nunca silencio inexplicable tras pulsar Dictar. La compatibilidad de `SpeechRecognition` es limitada y algunos motores procesan audio en un servidor; no prometer dictado offline general. [Documentación de SpeechRecognition](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition).

### F08. Contratistas: directorio local y asignación son distintos — prioridad alta

**Evidencia:** `Contratistas.tsx:21–27` guarda el directorio en `localStorage`. `sessionScope.ts:17` separa la clave por usuario, no por empresa. En `PanelOT.tsx:899`, “Agregar” incorpora el texto a `form.contratistas`; Guardar envía ese array. El mapper incluye el campo (`src/data/ordenMapper.ts:83`, `:127`).

**Diagnóstico:** no está demostrado que todas las asignaciones fallen. Sí está confirmado que el directorio no es un catálogo compartido en servidor; tampoco se incorpora al array el texto que quede sin agregar. La captura correspondiente muestra Responsables, por lo que no alcanza para identificar el paso exacto fallido.

**Propuesta:** directorio por empresa en servidor y asignación por OT; comportamiento explícito al guardar un nombre todavía escrito en el campo. Mostrar chips seleccionados y confirmación. Migrar nombres locales con control de duplicados y empresa de destino, sin mezclarlos automáticamente.

**Aceptación:** agregar desde directorio y desde OT, guardar, recargar, abrir otra sesión/dispositivo de la misma empresa y comprobar persistencia; otra empresa no accede al directorio. Mensajes claros ante error o falta de permiso.

### F09. Historial y notificaciones no son una auditoría completa — prioridad alta

**Evidencia:** `HistorialComentarios.tsx:35` lee comentarios de cambios de estado. El RPC de estado registra actor y transición de forma conjunta (`202609210005_connected_ot_flow.sql:39–64`). `Notificaciones.tsx:118–169` mantiene hasta 30 avisos en memoria, escucha solo el proyecto activo y depende del contenido anterior del evento; `detectarCambio` devuelve solo el primer campo relevante.

**Propuesta:** eventos de negocio duraderos generados en servidor: creación, edición con diferencias, cambios de estado, asignación, fotos/anotaciones, comentarios, movimiento en plano, eliminación y generación de informes cuando corresponda. Registrar actor autenticado, empresa, proyecto, OT, hora del servidor, tipo y resultado. El historial es la fuente; la notificación selecciona lo que requiere atención y guarda lectura por usuario.

No registrar cada toque o zoom como actividad de la OT. No inventar un historial anterior: mostrar que el registro completo empieza con la implantación. Respetar permisos también en los valores anteriores y posteriores, particularmente costos. Mantener eventos de eliminación sin perderlos por borrado en cascada.

**Aceptación:** editar desde una segunda sesión produce un evento único con autor y hora; persiste tras recarga, respeta empresa/obra/costos y abre la OT autorizada. Leer un aviso no borra el historial. Probar entrega repetida, reconexión, cambio de empresa y revocación de acceso. Inspeccionar el payload Realtime real; no asumir que cambiar `REPLICA IDENTITY` basta para resolverlo bajo RLS.

## 2. Diseño concreto por recorrido

### Base visual y táctil

- Mantener azul de marca, superficies claras y texto oscuro; eliminar Vidrio y normalizar preferencias antiguas para que no reaparezca al recargar.
- Texto principal/formularios de 16 px; secundario normalmente 14 px; títulos 22–28 px. Evitar texto de 10–11 px para información necesaria. Usar una familia tipográfica coherente y tokens compartidos en lugar de ajustes dispersos.
- Objetivo de producto: áreas táctiles de 44–48 px, preferiblemente 48 en controles de campo. No confundir esa propuesta con el mínimo WCAG 2.2 AA, que es 24×24 CSS px con condiciones y excepciones. [W3C: tamaño de objetivo](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html).
- Estados con texto/icono además del color; foco visible, botones nombrados para lectores de pantalla y retorno de foco al cerrar diálogos. Contraste verificado y soporte de texto ampliado.
- Animación corta y localizada, aproximadamente 150–200 ms, respetando movimiento reducido. No usar desvanecimientos de toda la página para disimular una recarga.

### Crear proyecto y elegir empresa

El formulario de proyecto tiene `autoFocus` (`ModalNuevoProyecto.tsx:175`), consistente con el teclado abierto en las capturas. Proponer apertura sin teclado automático en uso táctil y enfoque inicial accesible del diálogo; al tocar un campo, este y las acciones deben permanecer alcanzables. Usar altura adaptable al área visible, desplazamiento interior y verificar el teclado real: `dvh` por sí solo no garantiza resolver todas las variantes Android/PWA.

Con una empresa autorizada, mostrar el nombre legible como contexto estable. Con varias, ofrecer selector con búsqueda cuando la lista lo justifique. No truncar la única información que identifica a la empresa ni asociar un filtro “Todas” con un destino de creación ambiguo.

Conservar tarjetas de proyecto de ancho razonable: tener un solo proyecto no exige estirarlo a toda la pantalla. Mejorar nombre, cliente, resumen de estados y menú táctil. La miniatura de un plano vertical debe conservar su proporción, aunque queden márgenes.

### Formulario de OT y conversaciones

Propuesta de estructura para tablet horizontal:

1. Cabecera compacta: código, rubro, estado y acciones claras.
2. Pestañas de contenido con área táctil amplia.
3. Datos agrupados en dos columnas cuando el ancho disponible lo permita: código/fecha; obra/unidad; responsable/contratistas; fechas de ejecución. Descripciones a todo el ancho del grupo.
4. Metadatos como “Creado por” y “Días abierto” en una línea informativa, evitando inputs deshabilitados enormes.
5. Pie siempre alcanzable con estado de guardado y acción principal.

Campos cortos orientativamente 160–220 px y selectores 240–360 px; son tamaños de referencia, no anchos rígidos en móvil. Reducir columnas al aumentar texto o abrir el teclado. El objetivo es menos desplazamiento y buena legibilidad simultáneamente.

El panel de conversación actual es absoluto y ocupa toda la altura (`PanelOT.module.css:186`), coherente con la superposición del pie en las imágenes. En ancho suficiente, reservarle una columna dentro de una carcasa estable; en ancho reducido, abrir una subvista con regreso visible. No tapar Guardar ni dejar controles activos bajo el panel. Conservar el borrador del comentario y distinguir cerrar conversación de cerrar OT. En tablet, botón Enviar explícito; Enter debe permitir escribir cómodamente.

La vista de detalle de las tarjetas aprovecha mejor dos columnas que el formulario de edición. Reutilizar los grupos y formateadores entre ambas, manteniendo clara la diferencia entre consultar y editar.

### Selectores, fecha, hora y modal de estado

Hay dos orígenes distintos de los cuadros oscuros:

- Rubro, empresa, calendario y reloj muestran controles nativos del sistema/navegador. El CSS del campo no controla íntegramente esos paneles.
- El diálogo de comentario de estado sí es de la app y tiene colores oscuros fijos (`ModalComentarioEstado.module.css:9`). Debe adoptar el tema claro.

Para consistencia visual completa, usar componentes accesibles compartidos para listas y calendario, con búsqueda donde aporte valor. No sustituir controles nativos por imitaciones sin teclado, foco, selección y lectura accesible. Primero resolver el recorte y la claridad del dato: una fecha civil no debería pedir hora si el proceso no la necesita. Si se necesita hora, diferenciarla explícitamente de la fecha.

Al subir una evidencia que habilita una transición, explicar el efecto y conservar la foto si el usuario vuelve atrás. La política de fotos requeridas debe ser coherente entre cliente y servidor; no cambiar estados de manera sorpresiva.

### Fotografías

**Respuesta a Agenda/Galería:** ambas muestran la misma agrupación por fase. En el CSS, la diferencia principal es ancho/altura de tarjeta (`PanelOT.module.css:582`, `:590`, `:700`). No existe una agenda temporal suficientemente distinta que justifique dos nombres.

Propuesta: una única “Evidencia fotográfica”, filtros Todas/Antes/Durante/Después con cantidades y una grilla adaptable. Agregar evidencia con dos acciones inequívocas: cámara y archivos. Tarjetas con miniatura consistente, descripción de hasta dos líneas, estado de subida y menú de acciones táctil. No usar un panel verde enorme como confirmación de una sola foto; basta un indicador de requisito cumplido.

En el editor, mantener la foto como protagonista; herramientas identificables, color y grosor visibles, deshacer/rehacer y guardar accesibles. Ocultar funciones “próximamente” del recorrido principal. Verificar fotos verticales, horizontales, orientación EXIF, archivos grandes, cancelación y errores parciales.

### Informes y vista previa

Corregir F03/F04 antes del trabajo gráfico. Después:

- Lista de informes en filas compactas: nombre, breve explicación, disponibilidad y botón Generar ajustado al contenido. Cuando no esté disponible, decir qué falta.
- Vista previa ajustada al ancho de su panel por defecto, con zoom explícito y controles de página cuando existan páginas reales. No exigir desplazamiento horizontal para leer el documento.
- Edición y vista previa lado a lado solo con ancho suficiente; en vertical, dos pestañas o pasos claros. Pie de exportación estable y menos altura desperdiciada en datos repetidos.
- Ya existe una estrategia de actualización del texto dentro del iframe sin recargar (`ModalInformeOT.tsx`). Revisar qué obliga a regenerar el documento antes de reemplazarla: no reinstalar un flujo que parpadee con cada tecla.
- Documento con emisor y logo configurados, cabecera proporcionada, OT/proyecto/obra/unidad, fechas correctas y evidencia legible. Cambiar “Filmografía” por “Evidencia fotográfica”.
- Fotos según cantidad y orientación: una foto puede ocupar más ancho; pares equilibrados cuando convenga. Evitar recortar detalles técnicos y separar la foto de su descripción en un salto de página.
- Checklist y firmas deben corresponder al proceso real. Un espacio de firma en blanco no equivale a conformidad ni una plantilla debe afirmar hechos técnicos no verificados. Distinguir documento para completar de informe emitido.
- Evitar marcas y textos institucionales fijos de otra empresa. Verificar encabezados repetidos, numeración, tablas y pies en PDF real; una captura del visor Android no demuestra paginación correcta.

**Aceptación:** revisar exportaciones con 0, 1 y varias fotos, textos largos y nombres extensos; sin textos cortados, páginas vacías involuntarias o imágenes rotas. HTML portable con recursos necesarios incluidos; PDF idéntico en datos. Abrir ambos fuera de la sesión emisora cuando se hayan exportado intencionalmente como documentos compartibles.

### Dashboard

Retirar Vidrio. El estado vacío debe orientar a crear/abrir un proyecto, no llenar la pantalla de métricas sin datos.

Para operación diaria, priorizar: OTs abiertas, vencidas, cierres próximos y sin responsable. Mantener total, distribución por estado y avance como contexto. Cada indicador debe abrir la lista que explica su número.

El cálculo actual de “En riesgo” es riesgo Alto/Extremo y el avance es promedio simple de todas las OTs (`Dashboard.tsx:94–104`). No son sinónimos de atraso ni de porcentaje de OTs cerradas. Definir las métricas antes de cambiar sus etiquetas: excluir “No aplica” del denominador operativo y mostrar “Sin datos” cuando corresponda; confirmar esa definición como regla de producto al implementarla.

Costos solo cuando exista permiso completo sobre el alcance seleccionado; el código ya contiene un control para evitar totales parciales. Conservarlo y probarlo en UI, exportación y backend. Reducir exportaciones a una acción con opciones. Mantener calendario, vencimientos y actividad reciente por encima de gráficos poco útiles con pocas OTs.

### Calendario, Gantt, grilla, Kanban y responsables

| Vista | Conservar | Mejorar |
|---|---|---|
| Calendario | Mes/semana/día y detalle lateral | Leyenda de eventos, selección visible, número de OTs por día, navegación táctil y detalle que abre la OT; altura adaptable. |
| Gantt | Línea de hoy, filtros y organización temporal | Barras tocables, código/estado legible o detalle accesible; evitar “EN…” como única información. No alterar duraciones al cambiar escala. |
| Grilla | Tabla densa y desplazamiento horizontal para muchas columnas | Primera columna fija, presets de campos, acciones alcanzables, fecha correcta y barra superior que se adapta al ancho. |
| Kanban | Columnas por estado y resumen de OT | Prioridad/plazo/responsable claros, gesto horizontal en pantallas estrechas; movimiento con confirmación de requisitos. Columnas vacías no son por sí mismas un fallo. |
| Responsables | Resumen y expansión de OTs | Cabecera expandible completa, chevron de 44–48 px y `aria-expanded`; enlace visible a cada OT. |

### Plano, carga y selección

La captura del rectángulo blanco acredita el defecto visual, pero no permite atribuirlo a una causa única. El código actual ya oculta el drawer cerrado y muestra miniatura cacheada; hay que reproducir la versión exacta en la tablet y revisar estilos computados, recursos y service worker antes de declarar que está resuelto.

`VistaPlano.tsx:195` y `pdfThumbnailService.ts` cargan/renderizan PDFs; la miniatura usa caché en memoria y el visor vuelve a abrir el PDF. Medir descarga, autorización de archivo, render y montaje por separado. Evaluar reutilización segura del trabajo, miniaturas generadas una vez por revisión y carga progresiva de calidad. Cancelar cargas antiguas al cambiar de proyecto y descartar resultados tardíos. Mantener versión/sesión/permisos en la invalidación de cualquier caché; no volver públicos los planos para acelerar.

`accessStore.ts:18` recarga toda la página al cambiar el contexto de acceso. Revisar los casos de alta de proyecto/cambio legítimo de contexto que no deberían producir un reinicio completo; preservar la revocación inmediata y la limpieza al cambiar de cuenta. El objetivo es una actualización controlada, no eliminar la protección.

Pin seleccionado: halo de alto contraste, código de OT visible y pulso único corto. Mantener ubicación exacta y diferenciación del estado. No usar parpadeo continuo. Apertura de OT sin perder zoom/posición al cerrar.

**Presupuestos propuestos, todavía no medidos:** respuesta visual de un toque en menos de 100 ms; miniatura ya disponible presentada en menos de 300 ms; gestos próximos a 60 fps en la tablet objetivo. Medir p50/p95 y documentar tamaño de PDF, cantidad de OTs y red. No fijar una promesa de carga completa independiente del archivo y la conexión.

## 3. Orden de ejecución y prueba

| Lote | Entrega concreta | Condición para cerrarlo |
|---|---|---|
| A — Confianza y datos | Configuración real, confirmación de guardado, fechas, campos de informes, comportamiento de contratistas | Pruebas de persistencia y permisos en dos sesiones/empresas; datos iguales entre pantallas y exportaciones. |
| B — Trabajo táctil | Dibujo con dedo/lápiz, pinch del plano, dictado con diagnóstico, teclado y botones alcanzables | Prueba física en tablet, horizontal/vertical, teclado abierto y pantalla completa. |
| C — Interfaz compartida | Formulario compacto, conversación, fotos unificadas, tema claro, tipografía, controles y retirada de Vidrio | Recorrido completo sin controles tapados ni pérdida de foco/borrador; validación también en escritorio. |
| D — Trazabilidad | Historial duradero, notificaciones y catálogo compartido de contratistas | Eventos únicos, permisos de datos sensibles, lectura persistente, reconexión y cambio de sesión. |
| E — Informes profesionales | Plantillas, vista previa adaptable, fotos y paginación | Inspección visual de HTML/PDF reales con casos cortos y extensos. |
| F — Afinado y lanzamiento | KPIs definidos, detalles de calendario/grilla/Gantt, rendimiento y actualización PWA | Métricas medidas, regresión de recorridos y versión desplegada verificada en el dispositivo. |

El directorio compartido de contratistas puede requerir esquema; diseñarlo en A y entregarlo con la infraestructura de D si no cabe en una corrección acotada. No presentarlo como terminado mientras solo exista una solución local.

Por lote: respaldo y punto de retorno, implementación acotada, typecheck/build, pruebas relacionadas con el cambio y revisión visual. Las migraciones necesitan reversión y prueba con datos ficticios. No mezclar un rediseño amplio con cambios de permisos sin una frontera de revisión.

### Matriz mínima antes de llamar a esta versión “lista para producción”

- Roles: Creador, administrador de empresa y perfiles de obra disponibles; operaciones permitidas y denegadas, también por API directa.
- Dos empresas, obras distintas, cuenta con múltiples empresas y cambio de sesión; sin mezcla de catálogos, fotos, costos, cachés ni avisos.
- Crear proyecto → abrir plano → crear OT → editar → subir/anotar fotos → cambiar estado → conversar → generar informe → recargar y verificar desde otra sesión.
- Tablet física: navegador usado en campo y PWA si se usa; horizontal/vertical, teclado abierto, pantalla completa, dedo y lápiz cuando aplique. La emulación de escritorio no sustituye estas pruebas.
- Fallos: permiso de micrófono denegado, red cortada, servidor rechaza, archivo grande, subida parcial, edición concurrente y permiso revocado.
- Revisión de grilla, calendario, Gantt y tarjetas con muchas OTs y con cero; fechas cercanas a medianoche, textos largos y ampliación de texto.
- Reportes fuera de la sesión original y PDF renderizado: datos, recursos, cortes y permisos previos a exportar.
- Actualización de la PWA: identificar versión visible, detectar recursos antiguos y no exigir al usuario borrar datos de su prueba. Evitar activación que descarte un formulario abierto.

Pendiente para la prueba física: confirmar modelo exacto, navegador y versión, modo navegador/PWA y qué mensaje/permisos aparecen al pulsar Dictar. No bloquea las correcciones ya confirmadas en código.

## 4. Dependencias y herramientas

No hace falta instalar un plugin ni copiar otro proyecto para solucionar las causas identificadas. La base actual permite corregir fechas, estados de guardado, roles visibles, mapeo de informes y eventos táctiles.

Si se decide unificar todos los selectores y calendarios, evaluar un conjunto de componentes accesibles y mantenidos antes de introducir una dependencia; revisar compatibilidad, licencia, tamaño y adaptación visual. No elegir una biblioteca solo por parecerse a Apple o Google. La mejora buscada es consistencia, respuesta clara y recorridos fiables.

Para la implementación, usar inspección de navegador, pruebas táctiles reales y render de informes. No generar imágenes decorativas para resolver problemas de interacción. La calidad de producción depende de esas validaciones y del contrato de datos, no de agregar una skill por sí misma.

## 5. Trazabilidad de las 44 capturas

Numeración según el orden de entrega en la conversación; los títulos se abrevian conservando su identificación.

| Captura | Observación y decisión | Referencia |
|---|---|---|
| 01 Crear Proyecto 1 | Teclado ocupa el formulario; adaptar altura y enfoque. | Crear proyecto |
| 02 Crear Proyecto 2 | Mantener estructura, mejorar tamaños y acciones. | Crear proyecto |
| 03 Solo CREADOR 1 | Roles editables y configuración que no representa capacidades. | F01 |
| 04 Solo CREADOR 2 | Miembro Creador fijo, invitación y eliminación simuladas. | F01 |
| 05 Solo CREADOR 3 | Mismo problema; diferenciar mensajes del sistema y de la app. | F01 |
| 06 NOTIFICACIONES | Avisos en memoria y solo del proyecto activo. | F09 |
| 07 Dashboard inicial | Estado vacío orientado al primer proyecto/OT. | Dashboard |
| 08 No negro | Modal propio con colores oscuros fijos. | Selectores/modal |
| 09 Agenda/Galería | Misma organización, cambia densidad; unificar. | Fotografías |
| 10 Opciones de rubro | Selector nativo oscuro; resolver con componente accesible si se unifica. | Selectores |
| 11 Fecha 1 | Calendario nativo; consistencia y fecha civil. | F03 / Selectores |
| 12 Fecha 2 | Reloj recortado; necesidad de hora y prueba de teclado/viewport. | Selectores |
| 13 Guardar no avisa | Falta confirmación positiva en éxito normal. | F02 |
| 14 Informes anchos | Filas compactas y acción de tamaño razonable. | Informes |
| 15 Calendario bien | Conservar, mejorar leyenda, altura y acceso a OT. | Calendario |
| 16 Desplegar proyectos | Empresa truncada y selector nativo; contexto legible. | Crear proyecto |
| 17 Conversaciones | Panel tapa contenido/acciones y acumula cierres. | Formulario/conversación |
| 18 Tarjetas, documentos/fotos | Reutilizar detalle, estados documentales reales y fotos proporcionadas. | Formulario / Informes |
| 19 Dashboard y VIDRIO | Retirar tema y definir KPIs operativos. | Dashboard |
| 20 Delay/rectángulo blanco | Reproducción y medición pendientes; revisar carga y drawer. | Plano |
| 21 Placeholders anchos | Tamaños según dato, conversación sin superposición. | Formulario |
| 22 Espacio desperdiciado | Dos columnas y metadatos compactos. | Formulario |
| 23 Editar fotos | Herramientas legibles y tacto. | F05 |
| 24 Informes 1 | Datos equivocados, logo/espacio y jerarquía. | F04 / Informes |
| 25 Informes 2 | Checklist, firmas, pie y paginación real. | Informes |
| 26 Interfaz/informe | Panel de edición compacto y exportación estable. | Informes |
| 27 Previews 1 | Ajustar ancho, corregir datos y márgenes. | F04 / Informes |
| 28 Previews 2 | Lectura y tabla sin scroll horizontal inicial. | Informes |
| 29 Zoom dos dedos | Implementación multitáctil del plano. | F06 |
| 30 Funciona, mejorar | Gantt: texto de barra y objetivos táctiles. | Gantt |
| 31 Grilla bien | Conservar, corregir fecha y facilitar columnas. | F03 / Grilla |
| 32 Historial completo | Actividad duradera con actor y hora. | F09 |
| 33 Historial cambio estado | Base útil; ampliar cobertura sin inventar pasado. | F09 |
| 34 Fotos 1 | Reducir marcos vacíos y clarificar estado de subida. | Fotografías |
| 35 Fotos 2 | Eliminar duplicación Agenda/Galería. | Fotografías |
| 36 Letras grandes | Tipografía/tacto coherentes, ayuda legible. | Base visual |
| 37 Modo tarjetas bien | Mantener Kanban; optimizar lectura y gestos. | Kanban |
| 38 Marcadores no funcionan | Anotaciones sobre foto, no pines del plano. | F05 |
| 39 Primer proyecto | Conservar tarjeta, contexto empresa y conteos. | Crear proyecto |
| 40 Flecha responsables | Cabecera expandible y chevron grande. | Responsables |
| 41 Contratistas no guarda | Síntoma reportado; directorio local confirmado, caso exacto pendiente. | F08 |
| 42 Mejorar informes | Fotos legibles, distribución y terminología. | Informes |
| 43 Tarjeta bastante bien | Usar su organización para coherencia con edición. | Formulario |
| 44 Animación de selección | Halo, etiqueta y pulso único con movimiento reducido. | Plano |

## Comprobaciones ejecutadas en esta auditoría

- Inventario de 44 archivos en la carpeta de capturas; lectura de código de los recorridos citados y de las migraciones de permisos relevantes.
- Reproducción aislada del desplazamiento de fecha 22/09 → 21/09 con zona `America/Asuncion`.
- Consulta HEAD pública: `Permissions-Policy: camera=(self), microphone=(), geolocation=()`.
- Contraste con documentación de MDN y W3C enlazada en cada apartado.
- Sin pruebas destructivas, nuevas cuentas, cambios de rol, edición de OTs de campo, despliegue ni modificación del código de aplicación. No se ejecutó build porque la entrega contiene únicamente este documento.

Quedan sin certificar el error exacto de dictado en la tablet, la causa del rectángulo blanco, los tiempos reales, la operación concreta fallida de contratistas y la paginación de los archivos exportados. Son casos de aceptación explícitos, no correcciones ya realizadas.
