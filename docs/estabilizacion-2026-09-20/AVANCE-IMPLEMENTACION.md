# Avance de implementación

Estado vigente: **día 5 completado**. Fundamento y aislamiento de dominio están aplicados desde días 3–4; ahora Storage es privado y el cliente local carga planos/fotos mediante autorización temporal. Ver [informe y límites del día 5](dia-5/INFORME.md) y [calendario actualizado](CALENDARIO-TRABAJO.md). El registro siguiente conserva el estado histórico del primer bloque.

## 20/09/2026

### Fundamento multitenant

- Migración aditiva, rollback y verificación creados.
- Contrato local `tenant -> proyecto -> miembro`. Fio Pro permanece independiente y solo reutilizará el patrón cuando se replique el módulo de planos.
- Fixtures validados: dos empresas, cuatro obras, diez usuarios de tenant y un Creador.
- Sprint intensivo de diez días creado con base de 5–6 horas efectivas diarias.
- Estado remoto: **no aplicado**. Requiere revisión Astra antes de modificar RLS/Storage o sembrar cuentas.

### Contrato canónico de órdenes

- Un solo mapper para lectura, inserción y actualización parcial.
- `null` en `pos_x/pos_y` conserva el estado “sin ubicar”; no se convierte en `(0,0)`.
- `descripcion` y `comentarios` se mantienen como columnas independientes.
- Los campos extendidos viajan por creación offline, actualización offline y Realtime.
- Un DELETE recibido por Realtime solo actualiza estado/caché local; no vuelve a borrar en Supabase.
- `undefined` en un patch significa “no modificar”; cero, `false`, cadena vacía y `null` explícito se preservan.

Validación ejecutada: TypeScript, ESLint del lote, prueba determinista del mapper, prueba de fixtures y build PWA. El build conserva advertencias conocidas del baseline por PDF.js 3 y tamaño del bundle; su corrección sigue calendarizada.

### Siguiente paso

Completar pruebas de integración del store/sync, eliminar logs con datos sensibles y preparar la migración fase 2 de capacidades/RLS. Antes de aplicar la fase 1 en Supabase, cambiar a Astra alto para la revisión de seguridad.
