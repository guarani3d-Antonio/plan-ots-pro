# Escenario acordado: dos empresas y cuatro obras

El usuario autorizó datos ficticios y declaró desechables los datos actuales el 20/09/2026. El reset general se hará después, como una operación separada. Este documento y el JSON asociado son fixtures de diseño: todavía no crean cuentas Auth ni filas remotas y no demuestran aislamiento por sí mismos.

## Entidades y roles

| Empresa | Obras |
|---|---|
| Empresa de prueba 1 | Obra de la empresa de prueba 1, número 1; Obra de la empresa de prueba 1, número 2 |
| Empresa de prueba 2 | Obra de la empresa de prueba 2, número 1; Obra de la empresa de prueba 2, número 2 |

Por empresa: un administrador de empresa, un supervisor, dos técnicos (uno por obra) y un lector. Son diez usuarios de tenant, más un creador/administrador de plataforma separado. `viewer` es el identificador actual del lector; no usar `lector` como si fuera un rol válido del schema existente.

Propuesta de alcance inicial: administrador y supervisor cubren ambas obras de su propia empresa; cada técnico está asignado solo a su obra; el lector solo a la obra 1. La autorización organizacional no debe dar acceso automático a todas las obras: membership de empresa y permiso de proyecto son requisitos distintos. El creador provisiona empresas y sus administradores; cualquier acceso excepcional de soporte a sus datos debe ser explícito y auditable. No poner un rol global editable en user_metadata ni service_role en el navegador.

Los emails `.test` del JSON son identificadores sintéticos reservados; no enviar invitaciones, recuperación ni correos a ellos. Crear las cuentas por un mecanismo Admin autorizado y confirmado, usando contraseñas aleatorias fuera del repositorio o credenciales inyectadas al runner. No compartir una contraseña fija entre usuarios.

## Datos por obra

- Un plano 2D sintético y una revisión identificable; conservar opcionalmente un ejemplo actual que aporte un caso real, sin necesitar sus datos personales.
- OTs en Pendiente, En proceso, Cerrada y No aplica; otra sin ubicar y una captura offline.
- Coordenadas distintas, incluida `(0,0)` legítima, y campos null/0/texto con tildes.
- Fotos sintéticas ANTES/DURANTE/DESPUES, comentario y dato de costo distinguible por empresa.
- Código OT coincidente entre obras permitido; duplicación de código activo dentro de la misma obra rechazada con recuperación explícita de la cola.

## Matriz de aceptación

1. Empresa 1 no enumera, consulta, edita, exporta ni descarga datos o archivos de Empresa 2 mediante UI, REST/RPC, Storage, Realtime o caches. Repetir en sentido inverso.
2. Técnico de obra 1 no accede a obra 2 aunque comparta empresa. Supervisor sí según membresías. Lector no crea, edita ni borra; resolver expresamente si se quisiera permitir comentarios como una capacidad distinta.
3. Cambiar de usuario en la misma tablet, offline y con pendientes, no muestra ni envía datos de la otra identidad.
4. Revocar membresía bloquea solicitudes posteriores y evita nuevas descargas; definir por separado la política de bytes ya descargados y trabajo offline.
5. IDs cruzados no permiten asociar una foto/comentario de la obra A a una OT B; servidor valida pertenencia conjunta.
6. Autor del evento deriva de la identidad autenticada; payload no puede atribuir cambios a otro usuario.
7. Dos dispositivos con el mismo próximo código OT no pierden la segunda creación al recibir conflicto de unicidad.
8. Reintento, reinicio, tres fallos de red, quota llena y actualización PWA preservan trabajo o exponen un error recuperable.
9. Usuario anónimo y usuario autenticado sin membresías no acceden a ninguna empresa; permisos se prueban también directamente fuera de la UI.
10. Reset de fixtures identifica únicamente entidades por namespace/IDs de prueba y presenta conteos antes de ejecutarse. El reset total definitivo incluye DB, objetos y caches y será un trabajo posterior.

## Orden de incorporación

Primero versionar schema/políticas y respaldar su definición; después introducir organización y asignación de proyectos con migración compatible. Sembrar empresas/obras y cuentas de prueba con el mismo flujo de dominio que se usará en el producto. Finalmente ejecutar la matriz y conservar resultados. No simular multitenancy agrupando por el texto `cliente`.
