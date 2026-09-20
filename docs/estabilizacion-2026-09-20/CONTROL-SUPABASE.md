# Control actual de Supabase y preparación de correcciones

20/09/2026 · continuación del diagnóstico inicial · proyecto **Plan-ots-2**. Revisión mediante sesión del usuario en Dashboard y consultas SQL de catálogo. Este documento actualiza los pendientes remotos del informe anterior; no convierte la revisión en certificación de seguridad ni en pruebas E2E completas.

## Resultado principal

El servidor tiene protecciones reales por proyecto y varias correcciones posteriores a la auditoría de julio. El riesgo más claro que permanece es Storage: los buckets `fotos` y `planos` son públicos y las políticas de lectura/subida de objetos no comprueban membresía de proyecto. El tercer bucket, `exports`, es privado pero sus políticas también permiten lectura/subida a cualquier autenticado.

Una consulta de solo lectura, dentro de una transacción terminada con ROLLBACK, simuló el rol PostgreSQL `authenticated` con claims de una identidad ficticia sin membresías. Resultado:

```json
{"role":"authenticated","orders":0,"projects":0,"order_view":0,"photo_rows":0,"memberships":0,"project_view":0,"storage_metadata":180}
```

Esto comprueba el comportamiento de RLS en la base para esa identidad sintética; no crea un usuario Auth, no valida un JWT firmado y no sustituye los ensayos REST/Storage/Realtime entre dos cuentas reales. Se contaron objetos visibles sin descargar archivos ni revelar nombres/rutas. Evidencia SQL: [prueba-lectura-externa.sql](prueba-lectura-externa.sql).

## Qué cambió respecto del diagnóstico anterior

| Control | Evidencia actual | Consecuencia |
|---|---|---|
| RLS público | Las 12 tablas de negocio tienen RLS activado; force RLS false, propietario postgres | Base razonable; el dueño sigue pudiendo saltar RLS, por eso las pruebas deben usar roles de aplicación |
| Tabla `fotos` | Ya no aparecen las antiguas políticas SELECT/INSERT/DELETE `true`; hay cuatro políticas por proyecto/autor | Hallazgo histórico de permisos indiscriminados de esa tabla corregido en el catálogo actual; faltan casos de escritura/revocación |
| Vistas | `vista_proyectos_resumen` y `vista_ordenes_fotos` tienen `security_invoker=on` | Advertencia histórica de esas vistas como definer resuelta; prueba sin membresías devuelve cero |
| Códigos OT | `idx_ordenes_ot_unique`: UNIQUE (proyecto_id, ot) WHERE deleted_at IS NULL | Dos clientes pueden proponer el mismo código, pero el servidor rechazará la segunda OT activa; hay que gestionar ese conflicto sin perder cola |
| Autorización de helpers | `es_miembro`/`es_supervisor` consultan proyecto_miembros con auth.uid(); supervisor exige rol supervisor | No se basan en el rol editable del perfil. No se demostró escalada por user_metadata |
| Funciones | Cinco funciones públicas; cuatro SECURITY DEFINER; proconfig null; EXECUTE para anon/authenticated | Fijar search_path y privilegios mínimos con regresión de triggers. No se demuestra ejecución arbitraria por ese dato aislado |
| Schema public | anon/authenticated tienen USAGE, no CREATE | Reduce una vía de sustitución de objetos en public; no sustituye endurecer funciones |
| Grants de tablas/vistas | anon/authenticated tienen privilegios amplios, incluidos TRUNCATE/TRIGGER/REFERENCES | Reducir a operaciones necesarias; no afirmar que PostgREST expone TRUNCATE como endpoint ni ejecutar uno para probar |
| Auditoría de borrado | Trigger BEFORE DELETE copia row_to_json(OLD) en ordenes_eliminadas con auth.uid() | Existe auditoría servidor de borrado; no hay registro equivalente completo de cambios/asignaciones/estado |
| Realtime | Publica ordenes, fotos, versiones, comentarios_ot; replica identity default en tablas públicas | Notificaciones basadas en old-row completo requieren rediseño/configuración probada; la publicación incluye costo |
| Storage | fotos/planos públicos; exports privado; lectura/subida autenticada sin tenant/proyecto; borrado por owner | B011/B002 son prioritarios; hacer solo privado un bucket no corrige su política de lectura |
| Límites de buckets | file_size_limit y allowed_mime_types null en los tres | Sin límites específicos por bucket; no implica ausencia de límite global del servicio, aún no comprobado |

## Hallazgos nuevos de integridad y roles

1. **Comentarios y rol lector:** `proyecto_miembros_rol_check` admite supervisor/tecnico/viewer. La política `comentarios_insert` exige `rol <> 'lector'`: viewer satisface esa condición. Si lector significa solo lectura, hay que corregirla y probarlo. `ot_comentarios` usa otra lista, con creador/editor que ni siquiera son roles válidos en ese CHECK. Unificar vocabulario y capacidades.
2. **Referencias cruzadas:** fotos y las dos tablas de comentarios tienen FK independientes a orden y proyecto; no hay FK compuesta que garantice que la orden pertenece al proyecto declarado. Sus políticas autorizan por proyecto. Se requiere validar esa relación; se identificó la brecha en schema/políticas, sin insertar datos para explotarla.
3. **Actores:** varias políticas de creación no exigen que created_by/uploaded_by/user_id coincida con auth.uid(). Tener una FK a auth.users garantiza existencia, no identidad del autor. Los comandos del servidor deben fijar actor.
4. **Revocación:** algunas políticas DELETE autorizan por autor sin exigir membresía actual (fotos/versiones/comentarios). Definir y probar la intención; no asumir que retirar de una obra corta todas las operaciones.
5. **Restauración:** el nombre de política «Restaurar versión (solo supervisor)» se aplica a UPDATE de la fila de versiones. No protege por sí mismo la restauración actual que modifica ordenes, donde el técnico tiene UPDATE. B018/B020 deben tener una operación de dominio autorizada explícita.

## Auth, despliegue y recuperación

- Registro público desactivado; email habilitado; confirmación de email activada; Google y los demás proveedores listados desactivados. La pantalla de registro/OAuth no debe ofrecer operaciones que el backend no permite. El modelo de creador e invitaciones debe implementarse de forma explícita.
- URL del sitio: `https://plan-ots-pro.pages.dev`; una redirect allowlist: `https://plan-ots-pro.pages.dev/**`. No se observó callback local/staging autorizado.
- SMTP personalizado no configurado: Dashboard indica servicio integrado limitado y no destinado a producción. Configurar proveedor antes de onboarding/recuperación comercial; no se enviaron mensajes.
- Access token: 3600 segundos; detección de reutilización de refresh tokens activada y ventana de 10 segundos. Sin límite absoluto/inactividad configurado; controles de sesión avanzada deshabilitados por plan. No se propone activar sesión única automáticamente porque puede impedir el flujo multi-dispositivo.
- Backups programados: Dashboard muestra **Free Plan does not include project backups**. No hay copia administrada del proyecto disponible desde esa pantalla. No se probó restauración ni se creó un backup remoto. Antes de clientes se necesita backup DB + objetos y ensayo; pasar a plan pago no demuestra por sí solo recuperación de archivos.
- HTTPS del sitio respondió HTTP 200, servidor Cloudflare. HEAD no devolvió CSP, X-Frame-Options, Permissions-Policy ni cabecera HSTS; sí nosniff y referrer-policy strict-origin-when-cross-origin. La ausencia de header HSTS en esta respuesta no demuestra que el navegador carezca de protección heredada/preload. [Resultado](hosting-headers.json). No se estableció equivalencia entre código publicado y HEAD local.

## Respaldo y autorización de trabajo

- Rama: `codex/estabilizacion-20260920`.
- Punto de retorno previo a cambios: commit **11a6a5b**, con árbol de aplicación igual a **4d1851e**.
- ZIP local: `.backups.local/2026-09-20-pre-estabilizacion/checkout.zip`; 199 archivos incluidos verificados por SHA-256 contra lectura de sus entradas. Incluye archivos seguidos/no ignorados y entorno local explícito; excluye dependencias instaladas y otros archivos ignorados. No es copia de Supabase.
- Historial Git: `repository.bundle`, creado con todas las refs existentes y verificado con `git bundle verify`. El bundle antecede al commit vacío 11a6a5b; contiene el HEAD de código 4d1851e.
- [Manifest público del respaldo](respaldo-local.json). La carpeta de respaldo está ignorada por `.gitignore` porque termina en `.local`; contiene configuración privada y no debe publicarse.
- `CLAUDE.md` actualizado para registrar autorización persistente de modificar archivos críticos con respaldo/regresión, quitando el bloqueo de pedir permiso en cada mensaje. Conserva el resto de reglas útiles y actualiza el baseline TypeScript.

Para recuperar código, extraer el ZIP en una carpeta separada y comparar antes de reemplazar; o crear un checkout separado de 11a6a5b/4d1851e. No ejecutar reset --hard sobre trabajo posterior. El ZIP se verificó en memoria entrada por entrada; no se restauró sobre el directorio activo.

## Datos ficticios y siguiente decisión

El usuario confirmó que los datos actuales son descartables y pidió dos empresas, cada una con dos obras y usuarios de prueba. Se prepararon [escenario y matriz](ESCENARIO-PRUEBAS.md) y [fixtures](fixtures-tenants.json). Su estado es **definido, todavía no sembrado**: hoy no existe organización como entidad del sistema y hay que incorporarla antes de afirmar aislamiento multitenant.

La primera prioridad será baseline de schema/migraciones y organización/membresías, junto con las correcciones locales de sync e informes. No se adelantó el reset general. No se modificaron datos, políticas ni configuración remota durante estos controles. Los cambios locales de esta sesión son respaldo, reglas de colaboración y documentos de ejecución; la implementación del producto es el siguiente lote.

## Controles todavía pendientes

- Cuentas de prueba reales, CRUD allow/deny, REST/RPC, revocación y Storage privado después de corregir políticas; simulación SQL de lectura no cubre estos casos.
- Backup remoto/restore de DB y objetos; schema versionado completo y procedimiento de reset.
- Matriz tablet física, cámara, suspensión, cuota y actualización PWA.
- Configuración de rate limits/protección de ataques y pruebas de entrega SMTP. El repositorio Fio Pro ya fue revisado en lectura; el contrato resultante está en [INTEGRACION-FIO-PRO.md](INTEGRACION-FIO-PRO.md) y falta crear un checkpoint seguro antes de editar su árbol actualmente sucio.
- Calendario con dedicación acordada y revisión de alcance tras primer lote. Se puede planificar ahora, pero la salida a clientes seguirá condicionada a pruebas y recuperación, no solo a fecha.
