# Ventanas comerciales compactas · 16/10/2026

Implementación del mockup aprobado de presupuesto, factura, pago y anticipo.

## Alcance
- Presupuesto desde la contratación con costo del Plan de Trabajo, manteniendo OT, origen, actividades, contratista y revisión. Monedas PYG/USD y reglas de IVA existentes conservadas.
- Cabecera con identidad de empresa, contexto de OT/versión, importes separados y botones compactos. Logo proporcional; su lectura no escribe la ficha ni las versiones.
- Ítems y firmantes se agregan en ventanas superpuestas. Dos firmantes mínimos y cuatro máximos; firmas y PDF siguen habilitados sobre la versión guardada.
- Factura: comprobante recibido, importe final con IVA y saldo por facturar.
- Pago: se vincula a una factura; muestra anticipo aplicado, nuevo desembolso y saldo. Aplicar un anticipo no vuelve a sumarlo al dinero entregado.
- Anticipo: ventana independiente ligada al presupuesto adjudicado, con atajos de 10/20/30/50%, además del importe editable.
- Los tres registros administrativos siguen usando los RPC anteriores. Mismos permisos, idempotencia y validación autoritativa en servidor. No realizan transferencias bancarias.

## Conservación
No hay migraciones, modificaciones de funciones, escrituras de mantenimiento ni cambios de almacenamiento. No se modifica el generador PDF ni su selección por versión. Se conserva guardarPresupuesto (solicitud, base y nueva revisión), registrarComprobante y registrarPago. Anticipo envía comprobante nulo y aplicar_anticipo=false. No se guardan registros mediante efectos de montaje.

## Pruebas
- TypeScript app sin errores.
- scripts/test-commerce-dialogs.mjs: límites por moneda y saldo, IVA/precisión conservados, pago cero con aplicación de anticipo, no duplicación, factura ajena, presupuesto sin adjudicación, inmutabilidad de entradas.
- scripts/test-contractor-commerce.mjs: pruebas reales SQL en PGlite con datos ficticios, incluyendo permisos, fuentes congeladas, versiones, IVA, firmas, facturación, pago/anticipo e idempotencia; rollback sin pérdida de filas.
- Componentes reales en scripts/qa-commerce-dialogs.html con Supabase reemplazado por un doble local. No se usan cuentas ni datos reales. Se comprobó presupuesto desde plan, IVA incluido y agregado, alta superpuesta de firmante/ítem, factura con tope, anticipo por porcentaje, pago y reintento ante error.
- Caso local: factura 1.100.000, anticipo aplicado 440.000 y nuevo pago 660.000 → saldo 0, entregado total 1.100.000; intento de 660.001 bloqueado. El reintento de un anticipo mantuvo el mismo p_solicitud y no creó una fila adicional por el fallo.
- Revisión visual en escritorio y en un iframe de 320 px: campos apilados, cuerpo desplazable, encabezado y acciones visibles.

Copias verificadas en backups/commerce-dialogs-20261016; evidencias locales en output/commerce-dialogs-20261016. Los ensayos de escritura fueron únicamente sobre datos ficticios en memoria o en la base SQL local de pruebas.
