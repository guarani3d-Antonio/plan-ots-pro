# Ficha del contratista dentro del Plan de Trabajo

Implementación: ficha con foto, identificación, contacto, teléfono, correo y dirección dentro de cada contratación del plan, después de la evidencia. Se elimina la ficha duplicada al principio del Panel OT. Las evaluaciones siguen disponibles después de las etapas de la OT y en el directorio.

Las altas desde el plan y desde el directorio comparten `CamposContratista`. El directorio mantiene además sus datos ampliados, contactos vinculados e historial. Los interruptores de Mano de obra y Materiales son independientes y tienen explicaciones visibles; el costo se decide por separado. Se conserva la exigencia de guardar el plan antes de presupuestar.

La migración `202610160002_plan_contractor_card.sql` extiende el alta acotada existente con contacto y dirección. Conserva permisos de OT/informe, empresa derivada en servidor, clientes anteriores, validación, auditoría e idempotencia. La reversión restaura el comportamiento sin eliminar registros. La carga/edición de fotos conserva los permisos existentes del directorio.

## Comprobaciones

- TypeScript, pruebas de comercio/IVA/permisos/reversión, PDF corto y largo y política de campos de los siete documentos.
- Ensayo local con componentes reales y datos ficticios: evidencia primero, ambos interruptores, alta con todos los datos, ficha visible, plan guardado y actividades trasladadas al presupuesto.
- Verificación del servidor: las diez funciones del flujo coinciden con las probadas, alta autenticada y validadores internos no expuestos.
- Base real leída sin cambiar documentos: 113 OT, 15 revisiones documentales, un presupuesto con una versión y sin firmas. P-0001 v1 tiene base PYG 999.000, IVA agregado PYG 99.900, total PYG 1.098.900; origen A-01 en POT-2026-REL-00000014 v1, contratación de mano de obra con costo. Su hash se conserva después del cambio.

## Logos: situación y siguiente lote

Los presupuestos ya congelan `fuentes.logo_path` por versión e incorporan la imagen al PDF autocontenido. La empresa del presupuesto probado no tiene logo cargado; P-0001 v1 tampoco lo tiene en sus fuentes. No se modifica esa versión al cargarlo después: requiere una nueva revisión de presupuesto. La ficha de Empresa ahora identifica la carga como **Cargar logo**, con imagen proporcional.

Pendiente autorizado para el siguiente lote: logo de la empresa emisora en la cabecera de los siete informes. Implementar captura del archivo en las fuentes de cada nueva versión, preservación del archivo histórico, acceso privado según el documento, verificación de sus bytes y renderizado coincidente entre vista previa y PDF del servidor. Mantener las plantillas anteriores para no cambiar documentos ya emitidos ni invalidar firmas. No sustituir el logo de empresa por la foto del contratista.

No se creó una automatización: se trata de una etapa de desarrollo posterior a este lote, sin fecha de recordatorio solicitada.
