# Estabilidad de Clientes y Contratistas

## Alcance

Corrección de los saltos visuales del directorio y de la ficha enriquecida, sin cambiar consultas, permisos, datos, firmas ni versiones de documentos.

- Primera carga: estructura estática en lugar de un párrafo que contraía toda la tabla. No tiene animación ni destellos.
- Actualización del mismo directorio: conserva las filas visibles; indica «Actualizando directorio…». Ante error se muestra el error y la acción de reintento.
- Fichas de Clientes/Contratistas: altura estable limitada por el espacio disponible; encabezado y acciones se mantienen, y solo el cuerpo desplaza su contenido.
- El foco inicial se asigna antes de pintar y utiliza `preventScroll`, también al cerrar.
- El historial del contratista muestra una estructura de carga mientras espera la base.
- Eliminado el rótulo obsoleto «Evaluaciones · próxima etapa» del listado.

La corrección no elimina la espera de red ni conserva datos entre empresas. Se mantienen las claves por empresa, la cancelación lógica de respuestas al desmontar y los controles de acceso existentes. No se ha auditado cada transición de todos los módulos.

## Verificación

- TypeScript y compilación de producción correctos.
- `node scripts/test-commerce-dialogs.mjs`: conserva los cálculos y validaciones comerciales.
- Ensayo con componentes reales y Supabase sustituido por datos ficticios, retrasando 1,8 segundos la lectura del directorio y del historial: `scripts/qa-directory-transitions.html` con `scripts/qa-directory-transitions-vite.config.mjs`.
- Antes/después del historial en escritorio: top 75 px, altura 630 px, bottom 705 px; desplazamiento de página 0 en ambas mediciones (viewport de ensayo de 720 px).
- Actualización con filas existentes: la tabla y su fila permanecen; cambia únicamente el aviso de actualización.
- Ficha en viewport de 320 px: left 6 px, ancho 308 px; cabe sin desbordar horizontalmente.

## Responsables / Técnicos

El mockup es independiente de producción y contiene datos ficticios. Incluye listado, búsqueda, ficha superpuesta, foto, datos profesionales, vinculación de cuentas existentes, historial filtrable y dashboard con acceso a sus OT. Se comprobó escritorio y 320 px (ancho de contenido y scrollWidth: 320 px; ficha 306 px).

Para una implementación posterior, vincular por `responsable_id`/cuenta y resolver por separado los registros históricos que solo tengan nombre. La pantalla actual agrupa por texto y no prueba por sí sola identidad de personas. Los indicadores de duración y cumplimiento propuestos explicitan fechas y denominadores; no atribuyen automáticamente a una sola persona el tiempo de una OT con participación compartida. La ficha no administra permisos ni crea cuentas.
