# Contratación y presupuesto desde el Plan de Trabajo

La contratación se configura después de la evidencia fotográfica del Informe de Relevamiento (Plan de Trabajo). Se indica mano de obra y/o materiales, se selecciona o crea el contratista de la empresa y se eligen las actividades del plan que atenderá. Una contratación sin costo registra su motivo o cobertura; una contratación con costo habilita el presupuesto una vez guardada la versión del plan.

La ficha de Datos del contratista se habilita al vincularlo desde el plan. Las participaciones anteriores de la OT se conservan como historia; el alta no sobreescribe fichas existentes. Un editor de la obra puede registrar una ficha pendiente mediante un RPC acotado a esa empresa y obra. La administración completa del directorio mantiene sus permisos existentes.

El presupuesto conserva la OT, la revisión del plan, la identidad de contratación y los identificadores de sus actividades. Mantiene los cálculos de IVA incluido o agregado al 10%, el PDF autocontenido y las firmas por versión. Reabrir la misma contratación recupera su presupuesto existente. Una nueva versión del plan no reescribe presupuestos ni firmas previas; el sistema avisa de la diferencia y exige revisar el origen y los importes al crear una revisión.

En el editor del documento, la sección está después de las fotos, en «Fotos y contratación». En el Panel OT está después de «Evidencia inicial» del relevamiento. Se eliminó el botón provisional «Presupuesto · futuro» y el inicio genérico de presupuestos desde Informes. La ficha global del contratista conserva la consulta histórica; las evaluaciones permanecen separadas de la planificación.

## Validación

- TypeScript y compilación de producción.
- Pruebas SQL con PGlite: evidencia previa, actividades ajenas, contratación sin costo, revisión anterior, autor y permisos por obra/empresa, alta pendiente e idempotencia, rechazo de clientes que omiten la contratación conservada.
- Regresión: IVA PYG/USD, decisiones administrativas, firmas, evaluadores, inmutabilidad y fuentes de los siete informes, actividades/Gantt y desfases.
- Ensayo local con componentes React reales y Supabase sustituido por datos ficticios: habilitación por fotos, selección/alta, datos de contratista, sin/con costo, guardado del plan e importación de actividades al presupuesto.
- Reversión probada: restaura las funciones anteriores y conserva los registros.

Evidencia del lote: `output/plan-contracting-20261016/`. Punto de retorno: `0068d16`; respaldo verificado de archivos sensibles en `backups/contratacion-plan-20261016/`. No se ejecutan pruebas de escritura sobre la base real, no se borran archivos y no se hacen consultas pagas de IA.

## Instalación y reversión

Instalar `supabase/migrations/202610160001_plan_contracting.sql` antes de publicar el cliente. Consultar `output/plan-contracting-20261016/verificar-instalacion.sql` para comparar las diez funciones contra las probadas y verificar los permisos y recuentos existentes. La migración no transforma filas históricas.

Si fuera necesario revertir, usar `supabase/rollback/202610160001_plan_contracting.rollback.sql` y el punto de retorno del cliente. La reversión cambia funciones y elimina únicamente los objetos de comportamiento añadidos; conserva los contratistas, eventos, planes, presupuestos y firmas ya registrados.
