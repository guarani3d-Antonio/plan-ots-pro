# Presupuestos y evaluaciones de contratistas

Implementación del diseño aprobado el 15/10/2026. Continúa la ficha de contratistas existente.

## Recorrido

Ficha de contratista: Dashboard, Datos, Trabajos, Presupuestos y Evaluaciones. Panel OT → Informes permite abrir estos módulos sin salir de la OT, después de guardar sus cambios.

Obra, rubro y contratista provienen de la OT. Cada versión de presupuesto conserva esas fuentes, empresa y versión opcional de informe. Las evaluaciones exigen una OT cerrada y una versión real del informe de esa OT.

## IVA, versiones y administración

Los ítems contienen descripción, cantidad, unidad y precio. Si los precios incluyen IVA, el total no aumenta y se desglosan base e impuesto. Si no lo incluyen, se agrega el 10% al final. El servidor valida y calcula: guaraníes enteros o dos decimales USD. Las monedas no se suman entre sí.

Las versiones son inmutables, tienen hash e idempotencia y rechazan bases obsoletas. Presentación y adjudicación son eventos separados. Una revisión en borrador no modifica la adjudicación anterior.

Comprobantes, vencimientos, pagos parciales y anticipos tienen registros separados. Aplicar un anticipo disminuye el saldo sin duplicar el pago. No se permite facturar ni pagar más de lo adjudicado. Estos registros no ejecutan pagos bancarios.

## PDF y firmas

Preparar PDF → Descargar PDF mediante enlace explícito. El archivo incorpora logo y firmas como imágenes, sin depender de enlaces externos para visualizarse.

El logo proviene de la ficha de Empresa y su referencia se conserva por versión. Al instalar, ninguna empresa tenía logo cargado; se informa en pantalla. Para incorporarlo a una versión posterior, se debe cargar el logo y crear una revisión. No se inventa un logo ni se copia el de otra empresa.

Dos espacios obligatorios: Jefe / Supervisor y Técnico; ampliables hasta cuatro. La captura admite dedo y mouse. Cada firma se vincula a ID y hash de versión. Una corrección no hereda trazos. Si faltan firmas, el PDF se identifica como borrador. Las firmas fluyen al final del contenido, con salto de página solo cuando hace falta espacio.

## Evaluaciones

Calidad, plazo, coordinación y seguridad/cuidado: escala 1–5. No evaluable se excluye del promedio; la falta de evaluación no representa un cero.

El evaluador es un ID de cuenta técnica o de supervisión activa con acceso efectivo a la obra y permiso de edición de informes. Una cuenta se selecciona automáticamente; varias requieren elección; ninguna impide guardar y muestra el motivo. No se permite escribir libremente el nombre.

Se conservan separadamente la cuenta evaluadora y la que registra. Informe, hash, fecha, criterios, fundamento y evidencia opcional se congelan por versión. Las correcciones agregan versiones.

## Permisos y respaldo

Presupuestos: costos.ver / costos.editar; adjudicación también requiere informe.aprobar. Evaluaciones: informe.ver / informe.editar. Se conserva el alcance efectivo de la obra y no se conceden permisos nuevos a cuentas existentes.

Ocho tablas con RLS, sin escritura directa para usuarios, y RPC con controles de identidad, empresa y obra. Adjuntos y evidencias privados y sin sobrescritura o eliminación desde el cliente. El respaldo dinámico incluye tablas, relaciones, firmas y archivos nuevos.

Migraciones: 202610150002_contractor_budgets.sql y 202610150003_contractor_evaluations.sql. Baseline: afe4c7b. Respaldos: backups/contractor-commerce-20261015. Desactivación reversible sin eliminar registros: output/contractor-commerce-20261015/desactivar-sin-borrar.sql.

## Verificación

TypeScript, build, PostgreSQL/PGlite y regresiones de directorio y de firmas en los siete documentos. Casos de IVA, permisos, redondeo, versiones, reintentos, topes, anticipos, firmas, evaluadores, correcciones e inclusión en respaldo.

UI aislada: IVA, revisión guardada, trazo sintético y evaluador automático o seleccionable. PDF corto de una página y largo de siete con 65 ítems; logo embebido, cero caracteres fuera de márgenes y revisión visual.

En la base real se compararon las 16 funciones con el código probado y se verificaron ocho tablas con RLS y buckets privados. Se conservaron 113 OT y 14 revisiones existentes; no se crearon presupuestos o evaluaciones ficticios en producción.

Los ejemplos de scripts/qa-contractor-commerce solo usan la configuración de QA que sustituye Supabase; no forman parte del build público.
