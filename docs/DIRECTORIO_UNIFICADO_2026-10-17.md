# Directorio unificado · Inicio con accesos

## Comportamiento

- La barra lateral agrupa Clientes, Responsables/Técnicos, Contratistas y el acceso previsto a Contactos bajo **Directorio**. Gantt y Calendario mantienen sus entradas.
- El inicio muestra cuatro accesos. Dentro se usan flechas Atrás y Adelante para recorrer las pantallas visitadas, sin repetir las categorías como pestañas. Directorio vuelve al inicio conservando el contexto. Una visita nueva después de retroceder reemplaza el recorrido hacia adelante; los extremos quedan deshabilitados.
- Solo el creador ve la búsqueda y selección de empresa. Se aprovecha una empresa activa válida; si aún no la eligió, se muestran opciones con búsqueda después de entrar en la categoría.
- Una cuenta de empresa utiliza su empresa asignada o su contexto activo autorizado. No existe selector de empresa para estas cuentas. Si hay varias membresías y no hay contexto activo válido, se informa el problema sin asumir una empresa arbitraria.
- La obra se comparte entre las categorías y se conserva también al volver al inicio. Los filtros se guardan en memoria por empresa durante esta visita al Directorio; no se escribe información de negocio en almacenamiento nuevo.
- Las opciones de obra se obtienen de las mismas fichas visibles que devuelven las lecturas actuales. Se unen por identificador canónico, sin inferir relaciones por nombres ni confundir un plano con la obra. Una categoría sin fichas en la obra mantiene el filtro y muestra cero coincidencias.
- Las fichas, fotos, historiales, KPIs, presupuestos y evaluaciones existentes se reutilizan. La guardia compartida protege ediciones y fotos sin guardar al cambiar el contexto.
- Contactos se señala como **Próxima etapa**. No se inventó un listado enriquecido ni un dashboard. Los contactos actuales continúan en Administración → Contactos.
- Los accesos históricos a Clientes, Responsables y Contratistas siguen abriendo la categoría correspondiente dentro de Directorio. Las categorías respetan los permisos existentes.

## Alcance y conservación

Este lote cambia navegación y estado de filtros en el cliente. No incluye migraciones, cambios de RLS, nuevas credenciales, nuevas cuentas, modificaciones de jerarquía, consultas pagas de IA ni operaciones sobre documentos o firmas.

Punto de retorno: `be86c77`; respaldos verificados en `backups/directorio-unificado-20261017/`. Se dejaron fuera del lote las modificaciones anteriores de documentación de respaldos.

## Verificación

- `node scripts/test-directory-navigation.mjs`: correcto. Empresa única, contexto explícito, rechazo de empresa ajena, permisos por empresa y unión de obras sin perder las anteriores.
- `node node_modules/typescript/bin/tsc -p tsconfig.app.json --noEmit`: correcto tras la integración y el regreso al inicio desde el menú.
- `npm run build`: correcto para la integración. Advertencias existentes de tamaño de bundles y pdf.js. El despliegue de producción vuelve a compilar el commit final.
- Ensayo con componentes reales y Supabase reemplazado por datos ficticios: entrada del creador con elección de empresa; cuenta de empresa sin selector ni buscador de empresas; cambio Clientes → Contratistas manteniendo una obra sin coincidencias; cambio a otra obra → Responsables; apertura de la ficha actual del contratista; aviso de cambios sin guardar y conservación del borrador; cambio de empresa; regreso al inicio y apertura de otra categoría manteniendo la obra.
- A 320 px, inicio y listado medidos con ancho de documento y contenido de 320 px, sin desborde horizontal.
- El ensayo de desarrollo generó un aviso de `createRoot` durante la recarga de módulos del propio arnés. No se cambió la inicialización de la app de producción.

Evidencia local: `output/directorio-implementation-20261017/`. Verificar Cloudflare y la versión pública antes de dar la publicación por terminada.

## Ajuste visual posterior

- Se eliminan los topes de ancho del inicio y del selector de empresa. Los accesos se distribuyen en cuatro, dos o una columna según el espacio real del contenido, incluyendo la barra lateral expandida o contraída.
- Las empresas usan columnas adaptativas que ocupan el ancho disponible; la búsqueda se alinea con el encabezado y se apila en pantallas pequeñas.
- Tarjetas más compactas, con iconos menores y el aviso de Contactos junto al título. En la comprobación amplia, los cuatro accesos miden 120 px de alto y sus acciones quedan alineadas.
- Verificación local de TypeScript y compilación Vite correcta; selección de empresa a 320 px con contenido de 320 px y sin controles fuera del ancho. No se modifica la lógica de permisos, empresa, obra o fichas.
- Punto de retorno del ajuste: `3547205`; respaldos en `backups/directorio-interfaz-20261017/`. Evidencias en `output/directorio-layout-20261017/`.

## Navegación y aprovechamiento del ancho

- Flechas con nombres accesibles y enlace al inicio. Las entradas históricas directas a categorías permiten retroceder al inicio. La guardia de cambios sigue protegiendo las fichas; empresa y obra quedan fuera del historial y conservan su selección actual.
- Mi asistente elimina el tope de 850 px y distribuye preferencias y consumo a la izquierda, conexión a la derecha cuando el contenido dispone de 960 px. En espacios menores se apila sin desbordes.
- Configuración, Ayuda, Proyectos y las secciones de reglas de notificaciones y configuración de dashboard del creador eliminan topes de ancho fijos. Ayuda distribuye los pasos en dos columnas cuando hay espacio suficiente. Se mantienen los límites de campos, diálogos, imágenes y avisos que corresponden a su contenido.
- Dashboard, Grilla, Gantt, Calendario y Administración ya disponen de contenedores fluidos; no se modifican por este motivo.
- Verificación: prueba de historial, TypeScript y compilación correctos; ensayo con datos ficticios de retroceso/avance, selección de obra conservada, nueva categoría y guardia de borrador. Asistente a 1280 px utiliza el ancho completo y a 320 px no desborda. Ayuda ocupa el ancho restante y presenta pasos en dos columnas a 1280 px.
- Punto de retorno: `048cbc7`; respaldos con hashes verificados en `backups/directorio-navegacion-20261017/`. Evidencia: `output/directorio-navigation-20261017/`.
