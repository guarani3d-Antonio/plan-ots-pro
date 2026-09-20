# Secuencia de trabajo y uso de modelos

## Qué modelo usar a partir de este control

Recomendación de ingeniería para este proyecto, no garantía de rendimiento o ahorro. OpenAI describe Astra como su modelo para el trabajo más complejo y Sol como modelo de trabajo profesional con esfuerzo ajustable. Fuentes oficiales consultadas el 20/09/2026: [Astra](https://developers.openai.com/api/docs/models/gpt-6-astra), [Sol](https://developers.openai.com/api/docs/models/gpt-5.6-sol). No extrapolar tarifas de API a porcentaje de cuota del plan Codex.

| Trabajo | Modelo y esfuerzo recomendado | Necesidad de Astra |
|---|---|---|
| Inventario, documentación, comandos conocidos, mensajes UI | Sol bajo | Baja |
| Correcciones acotadas con contrato y aceptación definidos; escribir/ejecutar regresiones habituales | Sol medio | Baja |
| Mapper compartido, integración con Dexie, adaptación de PDF.js o Realtime | Sol alto | Media; revisar al cerrar lote si hay dudas |
| Diseñar organización/roles/RLS y estrategia de migración/rollback | Astra alto para diseño y revisión; Sol alto para implementación conforme al diseño | Alta |
| Cola idempotente, conflictos, varias pestañas, pérdidas intermitentes difíciles | Astra alto en diagnóstico/diseño; Sol alto para cambios delimitados | Alta |
| Ejecutar la suite repetible, compilar, revisar resultados conocidos | Sol medio | Baja; ejecutar tests no necesita Astra por sí solo |
| Interpretar fallos contradictorios, revisión de seguridad y decisión de salida de un hito | Astra alto | Alta |
| Réplica independiente del patrón de planos en Fio Pro; precisión/identidad espacial | Astra alto en decisión; Sol medio/alto en implementación | Alta en diseño, baja en rutina |
| Empaquetar una skill a partir de un procedimiento ya probado | Sol medio | Baja; Astra revisa solo el contrato/seguridad si cambian |

**Ya se puede pasar a Sol para el siguiente lote acotado.** Volver a Astra al revisar multitenancy/migración/sync y en los gates de entrega. No reservar todas las pruebas a Astra: tanto ejecución como mantenimiento de regresiones corrientes pueden quedar en Sol. No se cambió el modelo de la tarea durante esta revisión.

## Orden revisado tras acceso al servidor

1. **Base reversible:** conservar schema/políticas, versionar migraciones, mecanismo de restauración y procedimiento de reset de fixtures. Código ya tiene respaldo/branch/baseline.
2. **Dos empresas reales en el modelo:** organizaciones, administradores de empresa, membresías por obra, creador de plataforma y cuentas sintéticas. B022 se adelanta para cumplir el alcance expresado por el usuario; no esperar al final comercial para diseñar el tenant.
3. **Seguridad de extremo a extremo:** identidad de autor, referencias OT/proyecto, corrección viewer/lector, funciones, costos y Storage. Hacer privado el bucket y corregir políticas/descargas como un mismo cambio compatible.
4. **Integridad offline:** contrato canónico, cola durable, ack, merge y Realtime; cubrir conflicto de índice único activo y usuario equivocado. Las correcciones locales pueden avanzar mientras se prepara el servidor.
5. **Informes/dependencias/evidencia:** escape HTML, PDF.js/Vite, fotos de cierre, restauración fiel y ciclo de archivos.
6. **Ensayo completo:** pruebas entre empresas/obras/roles, tablet, fallos y recuperación; luego piloto con alcance medido.
7. **Primera comercialización:** onboarding, SMTP, soporte, backup recurrente, operación y documentación; decidir salida por gates, con previsión de fecha actualizada.

La dedicación ya acordada es de al menos 5–6 horas por día, con límite de diez días para el piloto conectado. Adelantar bloques cuando pasen sus pruebas. Cada bloque cierra con resultado, comprobación, checkpoint y pendientes. La comercialización sigue sujeta a validación posterior; el piloto usa empresas ficticias.

## Cuándo entra Fio Pro y la skill

**Primer hito, durante fundamentos:** completado en lectura el 20/09/2026. Fio Pro usa Creador → tenant → obra → membresía por obra y capacidades explícitas. Ambas aplicaciones permanecerán totalmente independientes. Después de probar Plan-OTs se reproducirá el patrón de planos dentro de Fio Pro; ver [REPLICACION-FIO-PRO.md](REPLICACION-FIO-PRO.md). Su árbol local está muy modificado y requiere checkpoint antes de editarlo.

**Segundo hito, después de validar 2D y aislamiento:** documentar el patrón de documento/revisión/página, coordenadas normalizadas y anotaciones. Implementar en Fio Pro tablas, Storage, RLS y UI propios para vincular una ubicación a una no conformidad, sin adaptadores entre aplicaciones.

**Tercer hito, después del primer caso reproducible en cada aplicación:** crear la skill para replicar esa capacidad: preflight de proyecto, migración, permisos, montaje de visor, anclaje, pruebas de aislamiento y rollback. Incluir ejemplos sintéticos. Una skill guía al agente; cada aplicación conserva su lógica y seguridad en su propio código y SQL.

BIM/IFC/SketchUp vienen después. La primera capacidad a replicar es ubicación precisa en plano 2D y navegación a una no conformidad, sin prometer GPS indoor o soporte BIM ya implementado.

La dedicación acordada es de 5–6 horas diarias y el objetivo es una build conectada para campo en diez días consecutivos. El trabajo diario y los gates están en [CALENDARIO-TRABAJO.md](CALENDARIO-TRABAJO.md).
