# Cierre de Plan-OTs: piloto primero, clientes reales después

Estado al 27/09/2026. La aplicación publicada permite trabajar con cuentas y obras ficticias; la creación de una OT desde el plano funciona en dos pasos. Esta entrega mejora la visibilidad de esos pasos y reajusta el plano al cambiar el tamaño de la pantalla. Un navegador con ancho de tablet no sustituye la prueba en la Samsung real.

## 1. Piloto de campo conectado

Se considera aprobado cuando un técnico y un supervisor completan en la Samsung y en un segundo dispositivo una OT ficticia desde el plano hasta su cierre: ubicación, cambios de estado, fotos antes/durante/después, dictado, guardado, reapertura, informe borrador y lectura desde la otra cuenta. Repetir el recorrido en ambas orientaciones, con suspensión/reapertura de la PWA y cambio entre las dos cuentas de campo. Confirmar que una cuenta de otra empresa no ve la obra ni sus archivos. Una operación sin red debe indicar claramente que no quedó guardada. La guía detallada existente está en `docs/estabilizacion-2026-09-20/dia-8/PRUEBA-CAMPO.md`.

Antes de cerrar este hito: comprobar en el sitio publicado la nueva instrucción de creación, el ajuste de zoom al girar y la ausencia de regresiones en Grilla; registrar dispositivo, navegador, versión instalada, cuenta y resultado de cada prueba. Corregir cualquier bloqueo encontrado. Mantener datos ficticios y documentos marcados como borrador.

## 2. Uso con clientes reales

No habilitarlo por la mera aprobación del piloto. Exige cerrar y verificar, en este orden:

1. **Seguridad operativa:** confirmar rotación/revocación coordinada de las claves administrativas históricas señaladas en el informe del día 10; volver a probar acceso por rol, empresa, obra y Storage. Ensayar restauración de Auth, base de datos y archivos en un entorno aislado, con tiempos y responsables definidos.
2. **Expediente documental:** completar el flujo de revisión y emisión sobre los borradores versionados actuales; conservar el archivo final, hash, evidencias, autor y fecha; hacer recuperable cada versión desde otra sesión. El cierre técnico y la aceptación del cliente son decisiones distintas. No afirmar firma, conformidad, garantía ni cumplimiento normativo sin sus registros. Contrastar el estado actual con `docs/ESPECIFICACION_EXPEDIENTE_2026-09-23.md`; la auditoría del 23/09 precede a los borradores persistentes actuales y no debe asumirse íntegramente vigente.
3. **Aprobaciones de la empresa:** BBC debe decidir procedimientos, formularios, responsables de revisión/emisión, evidencias requeridas, método de aceptación/firma, garantías y retención. El Creador registra esas políticas con vigencia y respaldo; no puede firmar por el cliente con una opción de configuración.
4. **Verificación final:** probar PDFs A4 cortos/largos, fotos y reservas, actualización de PWA instalada, cámara y rendimiento en el equipo real; ejecutar regresiones de permisos, concurrencia, sincronización y recuperación. Resolver las advertencias de dependencia PDF.js y tamaño del paquete según riesgo medido, sin confundir la mitigación de una vulnerabilidad con actualización completa.

El resultado de cada bloque se marca **aprobado** solo con evidencia reproducible. La publicación técnica de un cambio no equivale a aprobar el piloto ni a declarar la app apta para clientes reales.

## Reparto de trabajo por modelo

- **Sol:** interfaz, formularios, correcciones visuales, accesibilidad, pruebas dirigidas y cambios acotados sin modificación de permisos ni contratos de datos.
- **Astra:** arquitectura del expediente, migraciones de Supabase, RLS/Storage, sincronización, firmas, recuperación, revisión de seguridad y decisión de los dos hitos.

Cada bloque debe tener un alcance pequeño, prueba de aceptación y revisión del diff. Las decisiones de producto y la aprobación institucional quedan con el usuario y BBC.
