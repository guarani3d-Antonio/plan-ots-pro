# Marca de empresa y presentación documental · 16/10/2026

## Uso
Administración → Empresas → seleccionar la empresa → Editar → Cargar logo (o Cambiar logo). JPG, PNG o WebP de hasta 8 MB; se reduce proporcionalmente, sin recorte, a JPEG privado de hasta 2 MB. Guardar completa o Guardar pendiente si faltan otros datos.

Se usa la empresa propietaria de la obra. Sin logo, se muestra su nombre; no se inventa una marca ni se toma la de otro tenant. El logo y la presentación se congelan por versión. Para ver un logo nuevo en un documento previamente guardado, crear una versión corregida. Ningún registro anterior se actualiza con esta migración.

## Implementación y conservación
- Informes: expediente-controlado-2026-10-16-marca. Captura de ruta privada en fuentes; copiado del binario y SHA-256 al manifiesto del PDF. Lectura por permiso de informes de la obra; archivo histórico protegido contra reemplazo y borrado por usuarios.
- Presupuestos: presupuesto-arquitectura-2026-10-16 en fuentes. Logo y datos congelados; PDF autónomo con fuente e imágenes embebidas. Versiones sin marcador conservan exactamente el generador anterior.
- Plantilla de informes anterior archivada; cabeceras/pies nuevos solo para el nuevo marcador. No se reescriben PDF emitidos.
- Firmas medidas y agrupadas al final; tres en una fila, dos/cuatro en dos columnas. Si falta espacio, se desplaza el grupo. Descripciones que exceden una página continúan con indicación explícita, sin repetir importes.
- Fuente Liberation Sans 2.1.5 completa (SIL OFL), de https://github.com/liberationfonts/liberation-fonts/files/7261482/liberation-fonts-ttf-2.1.5.tar.gz . Licencia en public/licenses/LiberationSans.txt. Regular SHA256 76d04c18ea243f426b7de1f3ad208e927008f961dc5945e5aad352d0dfde8ee8; Bold 788abee4c806d660e8aee46689dd8540cd4bb98da03dcc9d171ce3efd99a9173. Generación reproducible con scripts/prepare-document-fonts.mjs.

## Verificación
Pruebas locales con datos ficticios: siete renderizadores iguales en cliente/servidor, histórica sin cambios, fuentes de empresa congeladas, aislamiento, manifiesto completo del logo, validación de hashes, reintentos seguros y rollback exacto sin eliminar registros. IVA incluido/agregado y redondeos PYG/USD; PDF de 65 ítems (7 páginas), descripción de 160 líneas, firmas dibujadas, 3/4 firmantes y caracteres del guaraní.

PDF de referencia leído: P-0002-v1 (1).pdf, 2 páginas, IVA 200.000 sobre base 2.000.000; tercera firma huérfana. No modificado. Ejemplo nuevo sintético de tres firmantes: una página. Los archivos de QA no son documentos reales ni crean firmas en producción.

Evidencias y copias anteriores: output/branding-documents-20261016 y backups/branding-documents-20261016. Migración 202610160003 y rollback homónimo. Antes/después en servidor: 16 revisiones y fuentes, 2 firmas de informes, 5 candidatos, 2 emisiones, 2 versiones de presupuesto y 0 firmas de presupuesto: mismos conteos y hashes.

## Continuación acordada
Próximos refinamientos: interfaces de presupuesto/pago/factura/anticipo. Luego fichas enriquecidas de Responsables/Técnicos y Contactos. No se implementan módulos nuevos en este lote.
