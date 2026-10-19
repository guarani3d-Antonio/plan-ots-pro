# Dashboard operativo y editor contextual — validación local

Alcance aprobado: implementación local, sin publicar ni modificar datos reales. Baseline publicado: `0169572`. Punto de retorno local anterior a la edición: `e5c60b3`.

## Resultado

- Desde/hasta visibles, libres e inclusivos. Se admite día único o un extremo abierto. Los atajos quedan dentro del menú de filtros; no sustituyen el rango libre.
- Gráfico temporal adaptado al ancho real, ejes rotulados, comparación de ingresos/cierres, líneas, barras y áreas, agrupación automática/día/semana/mes, colores, puntos, valores y cuadrícula.
- Las áreas se almacenan como `type: line` y una opción temporal adicional. El validador del cliente publicado `0169572` puede leer ese documento; no se requiere migración SQL.
- Las preferencias anteriores conservan sus bloques y filtros. Un bloque antiguo de ingresos sigue mostrando ingresos hasta que su dueño cambie las series.
- Editor contextual con vista previa del bloque seleccionado. Cancelar no altera el documento; aplicar deja el cambio pendiente de guardado privado.
- Asistente de gráficos bajo MIA: interpretación local limitada de tipo, series y agrupación. No utiliza API de IA ni genera gastos. No es un constructor general de interfaces por IA.
- Lectura operativa compacta: riesgo alto/extremo en activas, asignación faltante, fechas de fin inválidas en cerradas y, cuando hay espacio, saldo de eventos. Cada señal abre su regla y las OT que la sustentan.

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

El transporte del ensayo sustituye Supabase, bloquea escrituras operativas y rechaza solicitudes fetch fuera del origen local. Los únicos guardados ensayados son preferencias ficticias en almacenamiento local. No se publicaron commits, ejecutaron migraciones ni cambiaron OT, documentos, firmas, permisos, credenciales o respaldos de producción.
