# Cobertura local de archivos de contratistas — 19/10/2026

Estado: corregido y validado localmente; sin publicación ni ejecución en la nube.

## Cambio

El motor admite `contractor-files` y `contractor-evidence`, además de los cinco
depósitos originales. Una validación previa a exportar el dump o transferir
archivos mantiene el rechazo de depósitos nuevos sin revisar. También exige los
originales referenciados en `plan_presupuesto_versiones.datos.adjunto.path` y
`plan_contratista_evaluacion_versiones.fuentes.evidencia.path`.

No se modifica el formato de las copias existentes, el cifrado, las claves, las
migraciones, los permisos ni los interruptores. El preflight sintético nativo se
amplió con archivos de ambos depósitos para la siguiente ejecución autorizada.

## Evidencia local

- Punto de retorno Git: `30c9dbf` (sin incluir los cambios documentales previos).
- Preimágenes verificadas por SHA-256: `backups/backup-coverage-20261019/`.
- `npm run test:backups`: aprobado, incluidos los cuatro scripts de la suite.
- `npx tsc -p tsconfig.app.json --noEmit`: aprobado.
- `node --check`: aprobado para los módulos modificados y la nueva prueba.
- Registro: `output/backup-coverage-20261019/pruebas-locales.txt`.

La prueba nueva utiliza dos empresas ficticias, cuatro objetos binarios y dos
versiones de presupuesto y evaluación por empresa. Usa las definiciones reales
de sus tablas y la función real de snapshot. Verifica cifrado y apertura del
paquete, reconstrucción de archivos y comparación SHA-256, recuperación SQL en
bases PGlite independientes, precisión numérica, versiones, vínculos con OT y
evaluador, alcance de empresa, caché separada por bucket y rechazo de referencias
faltantes o depósitos no admitidos. No importa el ejecutor ni lee `.env` o claves.

No hay Docker, `pg_dump` ni `pg_restore` disponibles en este equipo. No se ejecutó
el preflight nativo, no se restauró un dump PostgreSQL nativo nuevo y no se ensayó
una copia real. La validación local no demuestra recuperación integral del servicio.

## Pendientes del plan de respaldos

1. Autorizar la publicación de esta corrección en `tablet-v1`; todavía es local.
2. Revisar/renovar los accesos R2 del piloto con alcance mínimo y vencimiento,
   conservando todas las copias y la clave original de cifrado.
3. Confirmar conexiones PostgreSQL/Supabase/R2, disponibilidad independiente de
   la clave y cupos/volumen al momento de ejecutar.
4. Autorizar una única copia actual de plataforma y su ensayo nativo aislado:
   integridad del objeto persistido, restauración de datos, relaciones, conteos
   Auth y reconstrucción de archivos. Sin sobrescribir producción.
5. Comprobar el resultado de esa copia y dejar el ejecutor apagado; mantener
   desactivadas la programación y la automatización de cierre.

La prueba de una aplicación completa recuperada —login, PDF e integraciones—
requiere una validación adicional acordada en un entorno separado. No queda
demostrada por un ensayo de datos y archivos.
