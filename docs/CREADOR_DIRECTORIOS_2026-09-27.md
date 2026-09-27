# Creador: empresas, accesos y directorios

El Creador puede crear empresas y obras, invitar una cuenta nueva por correo, asignarle un rol en la empresa y darle acceso a cada obra. Supervisor y técnico son cuentas reales de Auth; el campo «Responsable» de una OT selecciona esas cuentas.

## Clientes y ubicaciones

Una ficha de cliente guarda nombre o razón social, RUC/documento, contacto, teléfono, correo y domicilio. Un cliente puede tener varias ubicaciones, incluso varios departamentos en la misma obra. Cada ubicación guarda tipo de inmueble (residencial en altura, oficinas en altura, industrial u otro), obra vinculada, dirección del inmueble, piso, unidad y sector.

La OT almacena los identificadores de cliente y ubicación, y conserva sus campos históricos de obra/unidad para compatibilidad. En una obra, elegir un cliente con una sola ubicación disponible la selecciona automáticamente sin mostrar un selector adicional; con varias ubicaciones, el usuario debe elegir una antes de guardar. Cambiar de cliente o dejar la ubicación sin elegir limpia la unidad anterior. Los datos de contacto se muestran recién cuando queda definida la ubicación. El Creador puede consultar las OTs vinculadas a la ficha del cliente.

La relación cliente/ubicación/obra/empresa se valida en PostgreSQL, además de la interfaz. No se puede trasladar a otra obra una ubicación que ya tenga OTs. La identificación es única dentro de cada empresa cuando se carga. Desactivar una ficha impide seleccionarla para nuevas OTs y conserva su historial.

## Contratistas

El Creador crea o edita su ficha con nombre o razón social, RUC/documento, contacto, teléfono, correo y dirección. Los demás usuarios solo ven los nombres activos del directorio de su empresa y los seleccionan en la OT. Los nombres históricos permanecen en las OTs existentes.

## Estado de este lote

La migración `202609270018` está aplicada en el proyecto Supabase `iqgbyqyoovzvhhdjawnt` y registrada en `supabase_migrations.schema_migrations`. Se verificaron las tres tablas, la función de selección por obra y los disparadores de validación y bloqueo de reubicación. La reversión conservadora sigue disponible en el repositorio. Antes del despliegue se probó con PostgreSQL embebido y datos ficticios, incluyendo aislamiento entre empresas, permisos, identificación duplicada y relación OT-ubicación. La función `invitar-usuario` está desplegada con verificación JWT, sesión y rol Creador. Se comprobaron sus rechazos por origen no permitido y por falta de sesión; falta probar una invitación autenticada de extremo a extremo. El frontend se publicó en `tablet-v1` hasta el commit `26c1534`; el HTML público sirve el paquete `index-DQGlUbdI.js`, que contiene los nuevos directorios y la invitación. La PWA abierta en el navegador de prueba conservaba un paquete anterior en caché, así que esa sesión aún no demuestra el funcionamiento de la interfaz nueva.

## Pendiente para operación con clientes reales

- Se envió desde Supabase Auth la invitación a `grupodiazvillaverde@gmail.com` y se registró su membresía activa como Técnico de Empresa de prueba 1. Se verificó `invited_at`, que la cuenta aún no está confirmada y que tiene cero obras asignadas. Falta que la persona acepte el enlace y pruebe el ingreso y el aislamiento de permisos. Esta invitación se completó desde el panel de Supabase; el flujo autenticado de `invitar-usuario` desde la interfaz Creador aún requiere prueba de extremo a extremo.
- Probar en la Samsung y en notebook cliente con una ubicación y con varias, guardado/reapertura e historial desde dos cuentas.
- Definir con BBC campos obligatorios, deduplicación de clientes sin RUC y política de privacidad/retención. Los indicadores de conflictividad son históricos manuales; no existe un puntaje automático.
- Completar las compuertas documentales, de seguridad y recuperación indicadas en `docs/CIERRE_PRODUCTO_2026-09-27.md` antes de operar con clientes reales.
- El futuro reset general debe cubrir Auth, base de datos, Storage y cachés de la PWA; no se ejecutó en este lote.
