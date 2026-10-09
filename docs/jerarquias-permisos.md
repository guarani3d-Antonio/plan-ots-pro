# Jerarquías y permisos de Administración

Implementación local; no confundir la compilación con un despliegue.

## Comportamiento

- Usuarios, Permisos y Jerarquías son vistas separadas de la misma base de personas.
- El Creador selecciona una empresa. El cliente entra en Mi empresa. Su respuesta del servidor nunca incluye al Creador en el organigrama.
- Una persona puede administrar únicamente subordinados de su propia rama, con permisos explícitos. No puede editarse a sí misma, a superiores, a pares ni otra empresa.
- `Permitido` autoriza una acción; `Puede delegar` permite transmitirla. La cadena completa debe autorizarla y permanecer activa. Revocar a un superior suspende el permiso efectivo de su rama.
- Las obras son un alcance separado; cada subordinado queda limitado por las obras de sus superiores.
- Los cupos incluyen cuentas activas e invitaciones pendientes en toda la rama. Varias obras no duplican la cuenta. Los lectores usan cupo técnico. Cancelar una invitación libera el cupo.
- El Creador modifica jerarquía y cupos; un jefe autorizado invita técnicos o ayudantes. Un técnico autorizado invita ayudantes. El nombre del cargo es editable.
- Fotos tomadas del perfil; iniciales cuando no hay foto. Ayuda por clic o puntero, búsqueda, controles bloqueados visibles y protección de cambios sin guardar.
- Se admiten 16 niveles y se rechazan ciclos. El guardado detecta versiones concurrentes y registra antes/después.
- El perfil técnico inicial no concede edición/borrado general de proyectos ni borrado de OTs. El borrado de fotos conserva la regla de autor o supervisor, además del permiso explícito. Cancelar una OT propia recién creada sigue siendo posible durante 15 minutos, pendiente y sin evidencias, comentarios ni documentos.

## Alcance de la matriz

86 entradas. Tres permanecen bloqueadas como Próximamente porque la aplicación aún no ofrece esa edición: personalización propia del dashboard, edición desde Gantt y edición desde Calendario. Configuración del dashboard de otros y emisión documental mantienen además sus reglas de plataforma/aprobación.

Los permisos de navegación distinguen pantallas que usan los mismos datos: ocultar Grilla no revoca por sí solo la lectura de OTs autorizada para el panel. Los permisos de impresión controlan la exportación de borradores de la aplicación; un documento ya descargado no se puede retirar del dispositivo.

## Validación

```text
node scripts/test-hierarchical-permissions.mjs
node scripts/test-permission-integration.mjs
node scripts/test-rich-master-directories.mjs
node scripts/test-team-invitation-edge.mjs
node scripts/build-hierarchy-release.mjs
node scripts/test-permission-integration.mjs --bundle
npm run build
```

La integración aplica todas las migraciones reales en PostgreSQL embebido. Verifica RLS y escrituras directas, aislamiento, ocultación del Creador, revocación, cupos, confirmación de invitaciones y denegación por acción. Auth y Storage externos no se prueban enviando invitaciones reales.

## Orden de publicación

1. Comprobar historial y compatibilidad de producción; conservar respaldo de los objetos afectados y de accesos existentes.
2. Generar `node scripts/build-hierarchy-release.mjs`. El SQL resultante aplica las cinco migraciones en una transacción y registra sus versiones; no ejecutar parcialmente ni volver a ejecutar si existe cualquiera de ellas.
3. Aplicar el SQL únicamente cuando esté autorizada la activación de permisos en producción.
4. Desplegar `supabase/functions/invitar-usuario/index.ts`; el flujo delegado anterior se reemplaza por la reserva transaccional nueva.
5. Publicar frontend después del backend. No publicar el frontend nuevo contra el contexto antiguo sin catálogo de permisos.
6. Verificar contexto de Creador y usuario de empresa, obras conservadas, cupos y bloqueo de acciones. Las invitaciones reales se envían solo desde la acción explícita del usuario.

Las relaciones existentes se importan solamente si existe una invitación previa que las demuestra y sus obras caben dentro del superior. No se deducen vínculos por nombre o correo. Revisar las cuentas sin superior antes de entregar a una empresa el manejo de su equipo.
