# Dashboard operativo y editor contextual — implementación y publicación

Alcance inicial: implementación local, sin modificar datos reales. Baseline publicado: `0169572`. Punto de retorno local anterior a la edición: `e5c60b3`. Luego el propietario autorizó publicar `a578afb` junto con búsqueda/pestañas y lectura configurable. Checkpoint previo a esas correcciones: `1b8c68d`.

## Resultado

- Desde/hasta visibles, libres e inclusivos. Se admite día único o un extremo abierto. Los atajos quedan dentro del menú de filtros; no sustituyen el rango libre.
- Gráfico temporal adaptado al ancho real, ejes rotulados, comparación de ingresos/cierres, líneas, barras y áreas, agrupación automática/día/semana/mes, colores, puntos, valores y cuadrícula.
- Las áreas se almacenan como `type: line` y una opción temporal adicional. El validador del cliente publicado `0169572` puede leer ese documento; no se requiere migración SQL.
- Las preferencias anteriores conservan sus bloques y filtros. Un bloque antiguo de ingresos sigue mostrando ingresos hasta que su dueño cambie las series.
- Editor contextual con vista previa del bloque seleccionado. Cancelar no altera el documento; aplicar deja el cambio pendiente de guardado privado.
- Asistente de gráficos bajo MIA: interpretación local limitada de tipo, series y agrupación. No utiliza API de IA ni genera gastos. No es un constructor general de interfaces por IA.
- Lectura operativa compacta: riesgo, asignación, fechas de cierre, saldo de eventos, prioridades y vinculación de contratistas; incorpora también un resumen por bloque del dashboard. Cada señal abre su regla y las OT que la sustentan. Los temas sin coincidencias no inventan alertas.
- Lectura configurable por dashboard: elegir temas/bloques, títulos, explicación completa y 3/6/12 resúmenes al entrar, con ampliación a todos los disponibles. No hay un límite fijo de tres. Los indicadores numéricos se excluyen inicialmente para evitar duplicación y pueden incluirse.
- Navegación con hasta cuatro pestañas abiertas, búsqueda textual entre los veinte dashboards permitidos y alta superpuesta. Cerrar una pestaña no elimina su dashboard. Las pestañas abiertas son estado de navegación de la sesión; las fechas y configuración son preferencias privadas persistentes.
- La propiedad opcional `reading` se guarda en el documento v1 existente. Compatibilidad de lectura comprobada con el validador publicado `0169572`; no se requiere migración SQL ni cambio de permisos.

## Semántica de datos

- Ingreso: fecha de ingreso válida; se utiliza created_at si no hay fecha de ingreso registrada, conforme al modelo existente.
- Cierre: estado actual Cerrada y fecha de fin de trabajos registrada, válida y no anterior al ingreso. No se infieren cierres desde updated_at. No aplica no cuenta como cierre.
- Cada serie aplica desde/hasta a su propia fecha de evento, para incluir cierres de OT ingresadas antes del rango. El detalle unifica por ID las OT presentes en ambas series.
- Las otras tarjetas y las señales de situación actual aplican la referencia de fechas seleccionada en filtros. La interfaz lo indica. No se reconstruye un estado histórico que la consulta no contiene.
- Los intervalos vacíos muestran cero; las fechas inválidas no se convierten en cero fechado ni se inventan. Los extremos de semanas/meses se recortan al rango elegido.
- Se limita a 730 puntos por gráfico; un intervalo explícito mayor pide cambiar agrupación, sin truncar los datos silenciosamente.

## Actualización

El cliente recarga datos mediante la consulta existente y sus políticas RLS al recibir avisos de cambios, al volver a la ventana y cada 60 segundos mientras está visible. Esto conserva preferencias y borradores abiertos; una lectura fallida conserva los datos anteriores y ofrece reintento. Los avisos Realtime dependen de la configuración ya existente del servidor; no se cambió ninguna publicación ni permiso de Supabase. La respuesta a un aviso y a una falla se verificó con transporte ficticio. La entrega de avisos del servidor de producción queda sin comprobar en esta etapa local.

## Verificaciones

- `npx tsc -p tsconfig.app.json --noEmit` y `npm run build`.
- `node scripts/test-dashboard-operational.mjs`: fechas inclusivas/abiertas/invertidas, semanas y meses parciales, bisiesto, ceros, eventos de arrastre, fechas faltantes, deduplicación, filtros, señales, propuestas locales y compatibilidad con el validador publicado.
- `node scripts/test-personal-dashboards.mjs`: filtros, sesión, guardado, conflictos e aislamiento de preferencias de dos cuentas con PostgreSQL en memoria.
- ESLint sin errores en los componentes y modelo nuevos y en el servicio de lectura. Los archivos originales de dashboard/modelo conservan avisos de lint preexistentes; se contrastaron con las copias del baseline. No se afirma que el lint global del proyecto esté limpio.
- Navegador local: rango 01/09/2026–30/09/2026, 89 ingresos, 24 cierres y 92 OT únicas en el detalle; guardado y recarga; alertas y fundamentos; edición manual y asistida, cancelación, colores y restauración; actualización y falla simuladas; separación de cuentas A/B.
- Revisión de 1024, 768 y 320 px: controles sin desbordes, editor apilado en tamaños pequeños y ejes sin etiquetas superpuestas en los casos revisados.

Ensayo: `node node_modules/vite/bin/vite.js --config scripts/qa-dashboard-operational-vite.config.mjs`, luego abrir `http://127.0.0.1:5233/scripts/qa-dashboard-operational.html`.

El transporte del ensayo sustituye Supabase, bloquea escrituras operativas y rechaza solicitudes fetch fuera del origen local. Guardados locales ensayados con preferencias ficticias. La variante `?many=1` permite verificar veinte dashboards sin servicios externos.

## Revisión adicional previa a publicación

- Búsqueda entre veinte dashboards, apertura y cierre de pestañas sin eliminar registros; alta y cancelación de un dashboard ficticio.
- Guardado y recarga de fechas, límite de doce resúmenes, explicaciones completas, selección de bloques y título personalizado en la cuenta ficticia A; preferencias independientes de B.
- Resúmenes con más de tres resultados, ocultación de temas, cambios de datos, evidencia y compatibilidad antigua cubiertos por pruebas automatizadas.
- Notebook de 1366 px y móvil de 390 px sin desbordamiento horizontal; editor contextual en diálogo contenido.
- TypeScript, pruebas de modelo, aislamiento con PostgreSQL en memoria y compilación de producción correctos. Se conservan advertencias de empaquetado preexistentes (tamaño, pdfjs y mezcla de imports).
- Huella inicial de producción tomada por consulta de solo lectura: 113 OT, 15 documentos, 16 revisiones, 15 borradores, 2 firmas. Evidencia y verificación posterior en `output/dashboard-publicacion-final-20261019/`.

## Corrección de estabilidad visual al editar

La revisión del propietario mostró que se ocultaban todos los bloques excepto el seleccionado y se aplicaban anchos especiales para el editor. Se eliminan ambas conductas: el borrador se representa en su posición dentro del dashboard completo, con un contorno de selección y un panel flotante sin redistribuir la grilla. El panel se coloca del lado opuesto al bloque en escritorio y como panel inferior contenido en móvil; sus campos tienen desplazamiento interno y sus acciones permanecen visibles. Escape/cancelar restaura el bloque y devuelve el foco. Un bloque nuevo se agrega solo como vista previa, se lleva a la vista y desaparece al cancelar.

Comprobado con datos ficticios: ocho bloques antes y durante la edición, mismas coordenadas relativas y dimensiones tanto en consulta como en edición general, vista previa temporal/cancelación, aplicar y descartar edición general, alta asistida (8→9→8) y pantalla de 320×568 sin desborde horizontal y con pie del editor accesible. No cambian el formato de preferencias, el guardado ni los servicios de datos. Evidencia: `output/dashboard-stable-editor-20261019/`.
