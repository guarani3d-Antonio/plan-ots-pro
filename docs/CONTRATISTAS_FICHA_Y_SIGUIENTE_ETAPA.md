# Ficha de contratistas y continuación inmediata

Mockup aprobado: listado compacto, foto/logo, datos, historial de trabajos y dashboard; mismo lenguaje visual de Clientes. Selector de empresa exclusivo del creador. Las demás cuentas trabajan dentro de su empresa y permisos.

## Entrega actual

- Se reutilizan las fichas, contactos y fotos privadas existentes; altas y edición superpuestas, con advertencia de cambios sin guardar.
- Historial y métricas mediante `plan_orden_contratistas.contratista_id`, con filtro de empresa, obra accesible, estado, período y paginación. Un nombre corregido conserva la identidad.
- Promedio inclusivo entre inicio y fin reales de OT cerradas con fechas válidas. Es una duración de OT, no una medición individual cuando intervienen varios contratistas.
- Presupuestos y evaluaciones aparecen como próximas etapas. No se presentan montos, saldos o calificaciones ficticias en producción.
- Migración aditiva, referencia previa y reversión en `output/contratistas-implementation-20261015/`. La instalación no reescribe registros ni documentos guardados.

## Continuación acordada

El usuario indicó continuar inmediatamente después de esta entrega; no pidió un recordatorio para otro día.

Presupuestos: diseñar creación desde la OT y consulta desde la ficha; ítems, cantidades, precios, moneda, totales, versión y aprobación. Distinguir presentado, adjudicado y trabajo finalizado. Resumen de cantidad e importe de adjudicados y finalizados; comprobantes, vencimientos, pagos parciales, anticipos y saldo facturado pendiente. No sumar monedas distintas ni confundir ejecución con pago. Definir permisos económicos y trazabilidad antes de habilitar importes.

Evaluaciones: diseñar registro del técnico/supervisor asociado a una OT y versión del documento; calidad, plazo acordado, coordinación y cuidado/seguridad. Definir escala, N/A, evidencia, responsables y correcciones. La ausencia de evaluación nunca equivale a cero. Conservar quién evaluó, cuándo y sobre qué trabajo.

La culminación integral requiere conectar ambos módulos con esta misma identidad de contratista y validar el recorrido completo: asignación → presupuesto → aprobación → ejecución → evaluación → comprobantes/pagos → resumen económico y operativo.
