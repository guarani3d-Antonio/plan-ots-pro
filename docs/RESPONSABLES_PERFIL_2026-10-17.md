# Responsables / Técnicos: listado y ficha por cuenta

## Implementación

- Listado compacto con foto, nombre de cuenta, documento, especialidad, obras visibles, contacto y carga de OT. Búsqueda por palabras, sin depender de tildes; filtro de personas por obra. Los conteos del listado indican expresamente que incluyen todas las obras visibles de cada persona.
- Selector de empresa exclusivo del creador. Una cuenta de empresa usa automáticamente su empresa autorizada. La vista requiere `equipo.ver`; el servidor también comprueba empresa y rama del equipo.
- Ficha superpuesta de altura estable: Dashboard, Datos e Historial de OT. El dashboard y el historial tienen filtros por obra y período; el historial suma estados y paginación de 20 OT.
- Las OT se atribuyen exclusivamente por `responsable_id`. No se convierten nombres escritos en identidades. Los registros antiguos sin cuenta se señalan aparte y se conservan.
- Las cuentas con OT visibles aparecen automáticamente. **Vincular responsable** permite completar el directorio con cuentas técnicas ya existentes, sin crear usuarios ni conceder accesos.
- Documento, especialidad, teléfono y observaciones se guardan por empresa/cuenta en `plan_responsables_fichas`, con revisión concurrente y auditoría. Nombre y correo proceden de la cuenta; las obras y jerarquías siguen administrándose en Equipo.
- La foto se carga en **Responsables → Ver → Editar datos → Foto de la cuenta**. Reutiliza el sistema privado de fotos del equipo y sus permisos existentes. No altera fotos de evidencia ni documentos.
- Solo puede editar quien ya tiene permiso para gestionar esa persona en Equipo. La lectura de una ficha no concede permiso de edición.

## Indicadores

- OT asignadas: identidades únicas de OT visibles según fecha de ingreso.
- En atención: pendientes y en proceso. No aplica no cuenta como abierta.
- Vencidas: abiertas cuya fecha límite pasó, usando la fecha local de Paraguay.
- Duración: promedio de días corridos inclusivos entre inicio y fin real, solo para OT cerradas con ambas fechas válidas.
- Cumplimiento de plazo: cierres en fecha / cierres con fin real y fecha límite válidos. Se excluye un fin anterior al inicio.
- Sin cobertura suficiente, el indicador muestra «—»; no se interpreta como cero. El tiempo corresponde a la OT completa, no acredita esfuerzo individual ni una evaluación del empleado.

## Validación

- `node node_modules/typescript/bin/tsc -p tsconfig.app.json --noEmit` y `npm run build`: correctos.
- `node scripts/test-responsible-profiles.mjs`: correcto, con todas las migraciones reales en PostgreSQL local/PGlite. Incluye homónimos, cambio de nombre, registros sin identidad, alcance de obra y empresa, ramas privadas, permisos revocados, edición autorizada, rechazo de campos de cuenta/permisos, revisiones concurrentes, fechas inválidas, ausencia de datos, paginación y acceso anónimo denegado.
- Pruebas existentes de perfiles de Clientes y Contratistas: correctas.
- `test-permission-integration.mjs` tiene un ensayo antiguo que intenta crear un cliente sin obra. Falla por la restricción de obra obligatoria **también al ejecutar el baseline sin esta migración**. No se cambió esa restricción ni se presenta esa suite como aprobada.
- Ensayo de componentes reales con datos ficticios: foto, edición, fallo y reintento sin perder campos, vinculación de cuenta única, estados, segunda página, cuenta de empresa sin selector ni edición, y ficha a 320 px.
- A 320 px: documento de 320 px, ficha de 308 px, cuerpo de 302 px sin desborde horizontal. Se preserva la altura del marco durante la carga.
- Supabase: tabla nueva inicialmente vacía y con RLS; sin acceso directo autenticado, sin ejecución anónima y sin ejecución directa de funciones internas. Las seis funciones instaladas coinciden por huella del cuerpo con las funciones probadas localmente.
- Antes/después de instalar: 113 OT, 16 revisiones, 2 firmas, 18 cuentas y 15 membresías. Se conservaron las huellas de metadatos de cuentas, nodos y permisos. No se guardaron fichas ficticias en producción.
- El respaldo completo existente incluye el esquema público; el alcance por empresa ya reconoce tablas con `tenant_id` y fotos de los miembros. No se ejecutaron ni reactivaron respaldos programados.

Evidencia local: `output/responsables-perfil-20261017/`.

## Publicación

- Implementación publicada: `2f552f0`, con Cloudflare correcto y verificación visual de la cuenta real en Empresa prueba de campo: 3 OT, 2 abiertas, 1 cerrada; promedio de 4 días con una OT con fechas válidas.
- Ajuste de cierre: el avatar cerrado de MIA queda por debajo de las ventanas modales, para que no tape los botones de la ficha en pantallas pequeñas. La conversación abierta conserva su superposición habitual.

## Reversión

Punto de retorno anterior: `ea4bd4e`. Revertir primero el cliente al estado anterior de Responsables y luego ejecutar `supabase/rollback/202610170001_responsible_profiles.sql`. La reversión deshabilita las nuevas RPC y conserva las fichas, las fotos y la auditoría; no elimina información.
