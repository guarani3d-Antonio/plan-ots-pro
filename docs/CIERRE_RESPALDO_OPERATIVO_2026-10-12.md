# Cierre del respaldo operativo — 12/10/2026

## Comprobado

- Una copia de plataforma, sin crear otras durante este cierre: `add48229-f81c-434b-9608-5e618501cd91`.
- Recuperación nativa aislada anterior: 53 tablas, 3663 registros, 229 originales de Storage y conteos Auth. Ejecución Actions 38266146068.
- Descarga positiva desde Administración → Respaldo y recuperación con la sesión de Creador en la versión 9ad5af8. No se accedió a credenciales mediante herramientas del navegador.
- Archivo descargado: `C:\Users\Usuario\Downloads\plan-ots-add48229-f81c-434b-9608-5e618501cd91.potbackup`.
- Tamaño: 196362693 bytes. SHA-256: `594abcf6fa71bb56c2fcdac44328eeec7158b310914820ef564ece0972690ad2`; coincide exactamente con el paquete recuperado.
- GitHub mantiene `BACKUP_RUNNER_ENABLED=false`; no existe una habilitación de programación en las variables de repositorio consultadas.
- GitHub Actions: presupuesto US$0 y Stop usage Yes. Uso facturado mostrado: US$0.
- R2: un objeto, 196.36 MB, 64 operaciones A y 22 B; US$0 de uso facturable mostrado. Las métricas pueden actualizarse con demora.
- Supabase Free, organización Guarani3d: egreso 0.636/5 GB, egreso cacheado 0.003/5 GB, Storage 0.199/1 GB. Incluye otros proyectos de la organización. No muestra excedentes; actualización hasta una hora.

Evidencia de descarga: `output/backup-operativo-20261011/descarga-app-comprobada-20261012.png`. La descarga usa R2 directamente; no vuelve a leer originales de Supabase.

## Lo que falta para declarar operación automática cerrada

1. Custodia independiente de la clave principal. La copia DPAPI depende de la cuenta y computadora Windows actuales. El propietario debe conservar la misma clave en un gestor o medio seguro independiente y comprobarla; no regenerarla.
2. Publicar e instalar la protección ya preparada y probada localmente: `server/backup/work-check.mjs` omite PostgreSQL/Docker cuando no hay trabajo; `202610120002_backup_bounded_pilot.sql` vuelve a comprobar fecha y máximo dentro del bloqueo transaccional de la cola. El workflow publicado todavía prepara el laboratorio cada hora aunque no haya trabajo. No activarlo así.
3. Acordar frecuencia, alcance, período de piloto, detención y conservación. No hay borrado automático implementado. No presentar la propuesta 7 diarias/4 semanales/3 mensuales como una política activa.
4. Revisar vencimiento y custodia de las credenciales R2: las del piloto fueron configuradas hasta el 18/10/2026. La renovación/rotación necesita una decisión explícita del propietario; conservar las claves de cifrado históricas.
5. Activación acotada tras custodiar la clave y aprobar los límites. Comprobar una primera copia programada, recuperación, estado de fallos y detención, sin encadenar pruebas ilimitadas.

La recuperación ya ensayada certifica datos y archivos, no login, secretos de despliegue ni funcionamiento completo de una plataforma Supabase nueva. El portal sigue simulado hasta cerrar su precondición y aprobar su activación de prueba.

## Propuesta de piloto para aprobar

- Una copia de plataforma cada 24 horas durante un piloto de hasta 72 horas, máximo tres solicitudes automáticas nuevas, sin borrar la copia comprobada. Son topes, no una garantía de tres copias: el primer vencimiento y retrasos de GitHub pueden producir menos. Los intentos fallidos también cuentan para detener el piloto; no se encadenan reemplazos ilimitados.
- Referencia sin crecimiento: 589088079 bytes nuevos (0.589 GB); total de cuatro paquetes, 785450772 bytes (0.785 GB).
- Reserva conservadora: hasta 300 MB por copia, 0.9 GB de paquetes nuevos y hasta 0.9 GB de egreso adicional de Supabase, más consultas de control. La reutilización de originales podría reducir el egreso, pero no se presupone ese ahorro.
- Mantener el límite del depósito exclusivo de 8 GB y del archivo fuente de 256 MiB. No aumentar esos límites sin medir de nuevo.
- R2 ofrece 10 GB-mes Standard gratuitos y no cobra egreso directo; las operaciones y consumos de cuenta son compartidos. Costo incremental esperado US$0 dentro de cupos; no garantía de gratuidad permanente.
- GitHub: conservar US$0/Stop usage Yes. La comprobación horaria preparada instala dependencias pero omite el laboratorio cuando no hay trabajo. Hasta 72 comprobaciones y hasta tres procesamientos de 20 minutos en ese período; el tiempo real de las comprobaciones todavía no está medido. Estimar de nuevo el ejecutor optimizado antes de activar.
- Detención de exportaciones automáticas tras tres solicitudes o fecha de fin. Está implementada y comprobada localmente, pero aún no instalada ni activada en producción. No renueva la señal del motor al bloquear por fin/tope. Desactivar también la programación al cerrar el piloto evita dejar su configuración visible como activa aunque no se procesen más copias.

Preparación comprobada con `npm run test:backups`: cifrado, descarga segura, aislamiento/permisos, cola y máximo transaccional de tres solicitudes incluso si la comprobación previa quedó desactualizada, límite temporal y omisión del laboratorio sin trabajo. Las pruebas usan datos ficticios locales; no transfieren originales ni generan copias R2.

Para la futura activación se necesitan variables explícitas: `BACKUP_AUTOMATIC_STARTED_AT`, `BACKUP_AUTOMATIC_UNTIL` y `BACKUP_AUTOMATIC_MAX_COPIES` (de 1 a 3). Una ventana mayor de 72 horas, incompleta o vencida impide ejecutar el piloto. El modo manual conserva la posibilidad de procesar una solicitud con programación apagada; no puede saltarse los límites si la programación está activa.

## Custodia guiada

Bitwarden gratuito permite notas seguras y acceso desde otros dispositivos. El propietario crea su cuenta, elige su contraseña y acepta términos directamente; Codex no introduce ni recibe esa contraseña.

Una vez creada la nota privada `Plan-OTs / clave de respaldo / principal`, el propietario puede ejecutar directamente:

```powershell
& 'C:\Users\Usuario\Desktop\plan-ots\scripts\custodiar-clave-respaldo.ps1'
```

El script no se ejecutó con la clave real durante esta preparación. Lee la copia DPAPI local, copia la clave al portapapeles después de confirmar GUARDAR, permite pegarla en la nota y pide recuperarla para una comparación oculta. No imprime la clave ni realiza peticiones de red. Limpia el portapapeles actual si sigue conteniendo la clave al terminar; no puede garantizar eliminar el historial o sincronización de portapapeles del sistema. Si esos servicios están habilitados, evitar este método y usar transferencia local bajo control del propietario. El comprobante local no incluye la clave y no certifica acceso desde otro dispositivo.

El propietario debe conservar también su acceso y código de recuperación del gestor fuera de esta computadora. Para una comprobación final independiente, abrir la nota desde otro dispositivo. No enviar claves por chat ni adjuntar XML DPAPI a un gestor como sustituto de la clave portátil.

Fuentes comprobadas el 12/10/2026:

- https://developers.cloudflare.com/r2/pricing/
- https://docs.github.com/en/billing/concepts/product-billing/github-actions
- https://supabase.com/docs/guides/platform/manage-your-usage/egress
- https://bitwarden.com/help/password-manager-plans/
