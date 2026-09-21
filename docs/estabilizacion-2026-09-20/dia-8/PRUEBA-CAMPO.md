# Guion de prueba de campo conectada

Este guion se ejecutará en el día 9 con datos y usuarios ficticios. Comprueba el recorrido conectado en una tablet; no certifica todavía trabajo offline ni habilita uso comercial.

## Preparación

- Usar las dos empresas ficticias y sus cuatro obras. No cargar datos de clientes reales.
- Tener una tablet con cámara, un segundo navegador o dispositivo y conexión estable.
- Empezar con batería suficiente, fecha/hora automáticas y una carpeta vacía para los informes descargados.
- Registrar dispositivo, navegador, orientación, usuario, obra, hora y resultado de cada caso.

## Recorrido principal

1. Entrar como técnico de Empresa de prueba 1 y confirmar que solo aparecen sus obras autorizadas.
2. Abrir la obra 1, girar la tablet en vertical y horizontal, acercar el plano y crear una OT sobre una ubicación identificable.
3. Completar ubicación, rubro, responsable, prioridad y observación; guardar, cerrar el panel y volver a abrirlo. Todo debe conservarse.
4. Tomar una foto con la cámara, subirla, cerrar y reabrir la OT. La miniatura y la imagen completa deben cargar.
5. En un segundo dispositivo, abrir la misma OT como supervisor. Editar campos distintos en ambos dispositivos y confirmar que se combinan; después editar el mismo campo y comprobar que la pantalla avisa el conflicto.
6. Cambiar el estado con comentario y comprobar que ambos quedan guardados juntos. Suspender la tablet brevemente, volver y confirmar que la sesión y los datos se revalidan.
7. Generar el informe de la OT y el informe general con fotos. Descargar el HTML, cerrar sesión y abrir el archivo descargado: texto, formato y fotos deben seguir visibles sin consultar Supabase.
8. Como supervisor, guardar una versión, modificar dos OTs y restaurarla. Deben volver los valores elegidos y aparecer un backup automático previo a la restauración.
9. Entrar como lector: debe poder consultar, pero no crear, editar, subir fotos ni restaurar. Entrar con una cuenta de Empresa de prueba 2 y confirmar que no ve la obra ni sus archivos.
10. Eliminar únicamente la OT y las versiones creadas por esta prueba, o conservarlas rotuladas como evidencia ficticia.

## Registro mínimo

| Caso | Resultado | Evidencia | Incidencia |
|---|---|---|---|
| Plano y alta de OT | Pendiente | Foto/captura | — |
| Guardado y reapertura | Pendiente | Código OT | — |
| Cámara y foto privada | Pendiente | Foto visible | — |
| Dos sesiones y conflicto | Pendiente | Mensaje/valores | — |
| Estado + comentario | Pendiente | Historial | — |
| Suspensión y reanudación | Pendiente | Hora/resultado | — |
| Informe portable | Pendiente | Archivo HTML | — |
| Versión y restauración | Pendiente | IDs de versión | — |
| Lector y otra empresa | Pendiente | Rechazos/vistas | — |

Se detiene la prueba y se marca **NO-GO** si aparece información de otra empresa, se pierde una OT o foto confirmada, una acción rechazada figura como exitosa, la restauración deja datos a medias o el informe ejecuta contenido ingresado por el usuario. La pérdida de conexión debe mostrar un bloqueo claro; no se evaluará como funcionamiento offline.
