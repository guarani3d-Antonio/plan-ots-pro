# Dashboards personales — implementación y validación local

Fecha: 19/10/2026. Alcance autorizado: implementar y probar localmente, con datos ficticios. **No publicar ni modificar producción.**

## Implementado

- Varios dashboards privados por usuario; crear vacío/con plantilla, duplicar, renombrar, quitar y elegir el inicial.
- Bloques configurables: indicador, barras, líneas, torta, dona y tabla. Agrupaciones por estado, rubro, responsable, contratista, obra y semana de ingreso.
- Medidas de cantidad de OT, categorías distintas con OT y duración registrada de cerradas con fechas válidas. El fin registrado no se presenta como evidencia de ejecución.
- Filtros de obra y descendientes, rubro, estado, responsable, contratista, fechas y búsqueda de texto. Filtros propios del bloque combinados con el alcance general.
- Anchos de cuarto, media o fila completa; orden por arrastre y flechas; agregar/quitar y cancelar sin perder la versión guardada.
- Colores iniciales: pendientes rojo, en proceso azul, cerradas verde cítrico, no aplica gris. Categorías con colores estables; selector visual, código de color y restablecimiento por bloque.
- Detalle de contribuyentes: gráfico/indicador → lista de OT con búsqueda → ficha existente → vista previa de documento en modo de consulta.
- Exportación CSV de las OT filtradas. El resumen anterior y sus exportaciones permanecen accesibles desde el menú adicional; no se reemplazaron los PDF existentes.

## Persistencia y aislamiento

Migración aditiva `202610190001_personal_dashboards.sql`: tabla nueva `plan_dashboards_personales`, lectura RLS exclusivamente del propietario y escritura mediante RPC que obtiene `auth.uid()`, sin recibir una identidad elegida por el cliente. Revisiones comparadas atómicamente impiden sobrescribir otra ventana.

No modifica `dashboard_configs`, OT, documentos, firmas ni perfiles. Un error de guardado conserva la edición y no simula éxito. Cambio de sesión invalida respuestas anteriores. La reversión preparada conserva la tabla y las preferencias.

**Esta migración no fue aplicada a Supabase real.** La publicación futura necesita autorización tanto para esta migración como para el frontend, en ese orden. La prueba local de RLS no equivale a una auditoría nueva de las políticas existentes sobre OT y obras.

## Pruebas realizadas

- `node scripts/test-personal-dashboards.mjs`: modelo, búsqueda sin acentos, obras descendientes, fechas inválidas, agrupaciones, dos responsables homónimos con cuentas diferentes, contratistas sin doble conteo de una misma asignación, duración sin inventar fechas, contribuyentes exactos, colores estables, validación y cambio de sesión.
- La misma prueba ejecuta la migración SQL real en PostgreSQL PGlite, con dos cuentas ficticias: privacidad de lectura, denegación de escritura directa, revisiones concurrentes, rechazo anónimo y reversión conservando ambas preferencias.
- Banco React/Vite: componente de producción con transporte sustituido completamente. 1.350 OT ficticias, escrituras operativas bloqueadas, ningún acceso a Supabase real.
- Navegador: crear un dashboard vacío, agregar bloque por responsable y contratista, ancho completo, reordenar con flechas y arrastre, guardar, cancelar, recargar, escoger dashboard inicial, cambiar de cuenta y comprobar separación de preferencias.
- Conexión fallida simulada: conserva nombre y edición. Conflicto simulado: avisa sin sobrescribir. Fechas invertidas: aviso y guardado deshabilitado. Búsqueda de una coincidencia en la última página: 1 OT.
- Color exacto `#B1D936`: guardado y verificado nuevamente en el editor después de recargar.
- Recorrido funcional desde barra de rubro hasta OT-01349 y vista previa de Orden de Servicio, sin escrituras.
- Geometría a 1024, 768 y 320 px: ancho de documento igual al viewport y cero intersecciones entre tarjetas. Ajuste adicional de filtros a dos columnas en celular.
- TypeScript y compilación Vite local; pruebas de regresión de grilla y de preparación de vistas previas.

Durante la edición en caliente, el banco de pruebas produjo errores de remontaje de React por ejecutar de nuevo su entrada. Se desactivó HMR en el banco y se protegió el ciclo de apertura del diálogo. Esos mensajes de desarrollo no deben confundirse con resultados de una prueba en producción; no se afirma haber validado consola limpia en producción.

Evidencias locales: `output/dashboards-local-20261019/dashboard-local.png`, `editor-colores.png` y respaldo verificado `Dashboard.before.tsx`. Banco reproducible: `node node_modules/vite/bin/vite.js --config scripts/qa-dashboards-vite.config.mjs`, abrir `/scripts/qa-dashboards.html`; tamaños en `/scripts/qa-dashboards-responsive.html`.

## Límites explícitos

- Los indicadores de contratistas y responsables derivan de las OT autorizadas y sus asignaciones; no inventan evaluaciones, presupuestos o ingresos económicos.
- Semanas mostradas son semanas con ingresos. No se presentan como una serie de cierres ni como fechas de ejecución.
- El guardado entre dispositivos depende de la migración pendiente y de la conexión; no se anuncia sincronización si falla.
- No se activaron respaldos, workflows, integraciones ni servicios. No se publicaron commits ni se cambiaron datos reales.
