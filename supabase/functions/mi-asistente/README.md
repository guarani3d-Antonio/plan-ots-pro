# Mi asistente · etapa 1

Implementa custodia personal y conversación de texto. Los comandos de navegación
se resuelven en el cliente desde el mensaje del usuario, sin invocar IA. La salida
del modelo nunca ejecuta comandos, código, cambios de documentos o envíos.

La interfaz conserva Sidebar y TopBar. El avatar usa los tokens naranja existentes
y se superpone sin cambiar el ancho ni el scroll del contenido de trabajo. La
conversación se conserva sólo en memoria; cambia de empresa o sesión y se vacía.
No se persisten claves ni mensajes en localStorage. Sólo nombre, posición y la
preferencia de voz se conservan, por usuario. La voz no se implementa en esta fase.

## Instalación, sin consultas pagadas

1. Conservar el baseline `ad11ce4` y los respaldos verificados del lote.
2. Aplicar `202610130003_personal_assistant.sql` en una transacción. No cambia
   tablas existentes ni invita usuarios. Las nuevas tablas y sus RPCs no son
   accesibles por anon/authenticated: sólo el servicio autenticado verifica al
   propietario antes de usarlas.
3. Compilar con `node scripts/build-assistant-edge.mjs` y desplegar el servicio
   `mi-asistente`, con validación de JWT y verificación explícita getUser.
4. Crear una clave AES de 32 bytes exclusivamente para custodia del asistente.
   Guardarla como `ASSISTANT_MASTER_KEY` en los secretos de Edge Functions y
   custodiar otra copia fuera de esta computadora. No reutilizar la clave de
   respaldo, no usar prefijo VITE, no guardar en Git ni imprimir en el chat.
5. Mantener `ASSISTANT_ENABLED=false` hasta verificar custodia y revisar las
   tarifas. El estado de conexión funciona sin llamar a los proveedores. Para
   habilitarlo, usar `ASSISTANT_ENABLED=true`. No se crean claves de OpenAI o
   Claude automáticamente: cada usuario introduce su clave en la aplicación.
6. Actualizar el ejecutor de respaldo con la exclusión explícita de las dos
   tablas personales en exportaciones de empresa. Las copias completas cifradas
   las conservan. La clave maestra del asistente permanece por separado; sin ella
   los datos operativos se pueden recuperar, pero las conexiones personales
   requieren introducir nuevamente las claves o recuperar su custodia.

Guardar conexión cifra la clave, pero no prueba inferencia ni afirma que el
proveedor la haya validado. Se rechazan claves con prefijo administrativo.
La primera consulta sólo se realiza a pedido del usuario, después del consentimiento.

## Límites y modelos iniciales

Se admiten GPT-4.1 mini y Claude Haiku 4.5. Las tarifas de referencia verificadas
el 13/10/2026 son USD 0.40/1.60 y USD 1/5 por millón de tokens de entrada/salida.
Antes de habilitar producción, revisar otra vez los precios y disponibilidad en
las fuentes oficiales. El catálogo restringido permite controlar el consumo;
añadir un modelo requiere actualizar su tarifa y validación.

Cada consulta admite hasta 8 mensajes, 4000 caracteres por mensaje, 16000 bytes
de conversación y 600 tokens de salida. Se reserva un costo conservador bajo
bloqueo de fila antes de llamar al proveedor. Las respuestas reconcilian la
reserva según tokens; errores y timeouts conservan la reserva. Los identificadores
de consulta son únicos, no hay reintentos automáticos y reconectar no reinicia el
consumo mensual. La estimación usa tarifa de lista, sin impuestos ni otros usos
de la cuenta. No representa créditos reales ni un saldo de tokens del proveedor.

## Validación y reversión

`node scripts/test-personal-assistant.mjs` comprueba cifrado/AAD por propietario,
rechazo de roles de mensaje, cuota, deduplicación, finalización idempotente,
reserva incierta, mes y permisos SQL con datos ficticios y sin llamadas externas.
`node scripts/test-backups.mjs` comprueba recuperación y exclusión de datos
personales en copias de empresa. `npx tsc -p tsconfig.app.json --noEmit` y
`npm run build` validan el cliente. La prueba local de componentes se abre con
`node scripts/qa-personal-assistant.mjs`; reemplaza Supabase y no conecta APIs.

Si hay que revertir después de instalar: apagar `ASSISTANT_ENABLED`, restaurar
el cliente anterior y conservar las tablas, claves y reservas. No borrar las
tablas ni ejecutar borrados de claves como mecanismo de reversión. La función
se puede redesplegar con el lote anterior. Conservar el ejecutor de respaldo que
reconoce las tablas personales mientras existan esas tablas.

La búsqueda de documentos de obra, la evaluación de garantías con fuentes y la
aplicación de propuestas a versiones protegidas corresponden a la etapa siguiente.
El contador de uso/saldo solicitado está registrado en `docs/asistente-etapa2.json`.

Fuentes de tarifas y protocolo:
- https://developers.openai.com/api/docs/models/gpt-4.1-mini
- https://developers.openai.com/api/docs/guides/migrate-to-responses
- https://platform.claude.com/docs/en/about-claude/pricing
- https://platform.claude.com/docs/en/api/messages/create
