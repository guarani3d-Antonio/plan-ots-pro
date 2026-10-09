/** Stable action identifiers shared with the database permission catalogue. */
export interface PermissionDefinition { key: string; group: string; label: string; help: string; planned?: boolean }
const groups: [string, string, [string, string, string?][]][] = [
  ['empresa', 'Empresas', [['ver','Ver ficha'],['crear','Crear empresas'],['editar','Editar ficha'],['estado','Activar o desactivar'],['eliminar','Eliminar sin dependencias']]],
  ['obra', 'Obras', [['ver','Ver obras'],['crear','Crear obras'],['editar','Editar datos, foto y color'],['estado','Activar o desactivar'],['eliminar','Eliminar sin dependencias']]],
  ['cliente', 'Clientes', [['ver','Consultar clientes'],['crear','Crear clientes'],['editar','Editar clientes'],['estado','Activar o desactivar'],['eliminar','Eliminar sin dependencias'],['ubicaciones','Administrar ubicaciones']]],
  ['contratista', 'Contratistas', [['ver','Consultar contratistas'],['crear','Crear contratistas'],['editar','Editar contratistas'],['estado','Activar o desactivar'],['eliminar','Eliminar sin dependencias']]],
  ['contacto', 'Contactos', [['ver','Consultar contactos'],['crear','Crear contactos'],['editar','Editar datos y vínculos'],['estado','Activar o desactivar'],['eliminar','Eliminar sin dependencias']]],
  ['equipo', 'Equipo', [['ver','Ver organigrama y usuarios'],['invitar','Invitar personas','Sujeto a cupos y obras autorizadas.'],['editar','Administrar integrantes','Solo personas inferiores de su propia rama.'],['permisos','Asignar permisos','Únicamente acciones marcadas como delegables.'],['alcances','Asignar obras','Nunca fuera de sus propias obras.']]],
  ['proyecto', 'Proyectos y planos', [['ver','Ver proyectos'],['crear','Crear planos'],['editar','Editar proyectos y planos'],['mover','Mover proyectos'],['eliminar','Eliminar proyectos']]],
  ['carpeta', 'Carpetas', [['ver','Ver carpetas'],['crear','Crear carpetas'],['editar','Renombrar carpetas'],['mover','Mover carpetas'],['eliminar','Eliminar carpetas vacías']]],
  ['ot', 'Órdenes de trabajo', [['ver','Consultar OTs'],['crear','Crear OTs'],['editar','Editar datos del reclamo'],['clasificar','Clasificar rubros, prioridad y riesgo'],['asignar','Asignar responsables y contratistas'],['estado','Cambiar estado'],['cerrar','Cerrar OTs'],['reabrir','Reabrir OTs'],['eliminar','Eliminar OTs'],['ubicacion','Modificar ubicación en el plano'],['historial','Consultar historial'],['restaurar','Restaurar versiones']]],
  ['foto', 'Fotos y evidencias', [['ver','Ver fotos'],['cargar','Cargar fotos'],['editar','Editar anotaciones y descripciones'],['eliminar','Eliminar fotos','El técnico puede borrar sus propias fotos; un supervisor, las de sus obras autorizadas.']]],
  ['conversacion', 'Conversaciones', [['ver','Leer conversaciones'],['crear','Agregar comentarios'],['editar','Editar comentarios propios'],['eliminar','Eliminar comentarios propios']]],
  ['informe', 'Informes', [['ver','Ver documentos'],['crear','Crear documento o versión corregida'],['editar','Editar borradores'],['imprimir','Imprimir y descargar borradores'],['preparar','Preparar PDF definitivo'],['aprobar','Revisar y aprobar PDF','También requiere las reglas documentales vigentes.'],['emitir','Emitir documento definitivo','No reemplaza los controles de firma, revisión y aprobación.']]],
  ['costos','Costos',[['ver','Consultar costos'],['editar','Editar costos']]],
  ['grilla','Grilla',[['ver','Ver y filtrar'],['editar','Editar OTs desde la grilla'],['exportar','Exportar CSV y PDF']]],
  ['dashboard','Dashboard',[['ver','Ver indicadores'],['personalizar','Personalizar su dashboard'],['configurar','Configurar dashboards de otros']]],
  ['gantt','Gantt',[['ver','Ver planificación'],['editar','Editar fechas de planificación']]],
  ['calendario','Calendario',[['ver','Ver calendario'],['editar','Editar fechas']]],
  ['campo','Campos adicionales',[['ver','Ver campos'],['editar','Completar valores'],['configurar','Crear y editar definiciones']]],
  ['notificacion','Notificaciones',[['ver','Ver notificaciones'],['configurar','Configurar reglas de empresa']]],
  ['auditoria','Auditoría',[['ver','Ver cambios de permisos']]],
];
const planned=new Set(['dashboard.personalizar','gantt.editar','calendario.editar']);
export const permissionCatalog: PermissionDefinition[] = groups.flatMap(([prefix,group,items])=>items.map(([action,label,help])=>({key:`${prefix}.${action}`,group,label,planned:planned.has(`${prefix}.${action}`),help:planned.has(`${prefix}.${action}`)?'Reservado para la futura edición desde esta pantalla. Hoy este módulo permite consultar; este permiso todavía no se puede habilitar.':help??''})));
