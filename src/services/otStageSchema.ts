import type { TipoDocumento } from './documentService';

export interface CampoEtapa { key: string; label: string; type?: 'text' | 'textarea' | 'date' | 'time' | 'datetime-local' | 'scale'; options?: string[]; span?: 2 | 3 | 6 | 12 }
export interface GrupoEtapa { title: string; fields: CampoEtapa[] }
export const categoriaEtapa = (tipo: TipoDocumento): 'ANTES' | 'DURANTE' | 'DESPUES' | null =>
 ['orden_servicio','visita','relevamiento'].includes(tipo) ? 'ANTES' : tipo==='avance' ? 'DURANTE' : tipo==='cierre' ? 'DESPUES' : null;
export interface EtapaDef { tipo: TipoDocumento; name: string; subtitle: string; tag: string; record: string; newLabel: string; help: string; groups: GrupoEtapa[] }
const text = (key:string,label:string,span:CampoEtapa['span']=6):CampoEtapa => ({key,label,span});
const area = (key:string,label:string,span:CampoEtapa['span']=6):CampoEtapa => ({key,label,type:'textarea',span});
const date = (key:string,label:string):CampoEtapa => ({key,label,type:'date',span:3});
const time = (key:string,label:string):CampoEtapa => ({key,label,type:'time',span:2});
const select = (key:string,label:string,options:string[],span:CampoEtapa['span']=6):CampoEtapa => ({key,label,options,span});
export const ENCUESTA_PREGUNTAS = [
 ['rapidez','Tiempo de respuesta a tu solicitud'],['plazoPrometido','Cumplimiento del plazo acordado'],
 ['calidadTrabajo','Calidad del trabajo realizado'],['profesionalismo','Profesionalismo y trato del personal'],
 ['confianza','Confianza que te transmitió el servicio'],['recontratacion','¿Volverías a contratar este servicio?'],
 ['recomendacion','¿Recomendarías este servicio?'],
] as const;
export const TEXTO_ACTA = 'La presente acta deja constancia de la entrega y de la decisión expresamente indicada por el receptor respecto de los trabajos individualizados y de los documentos referenciados. La conformidad, cuando sea otorgada, se limita al alcance entregado y verificable a la fecha de firma, con las reservas que se consignen. Este registro podrá aportarse como antecedente documental ante comunicaciones o reclamos posteriores relativos a esos trabajos. No comprende prestaciones ajenas al alcance ni implica renuncia a garantías, defectos ocultos o derechos irrenunciables que resulten aplicables.';
export const TIPOS_CON_PLANO: TipoDocumento[] = ['visita','relevamiento','avance','cierre'];
export const ETAPAS_OT: EtapaDef[] = [
 {tipo:'orden_servicio',name:'Orden de Servicio',subtitle:'Pedido recibido · qué se pidió y cuándo',tag:'Origen de la OT',record:'Solicitud',newLabel:'',help:'Nace al recibir el pedido, incluso sin visita. Una solicitud inicial por OT. Crear versión corregida conserva la versión anterior y registra el motivo de la corrección.',groups:[{title:'Recepción del pedido',fields:[{key:'fechaRecepcion',label:'Fecha y hora de recepción',type:'datetime-local',span:6},select('canal','Canal',['WhatsApp','Correo','Teléfono','Presencial','Otro'],3),select('urgencia','Urgencia manifestada',['Normal','Urgente','Por evaluar'],3),text('solicitante','Solicitante'),text('contacto','Contacto'),area('referencia','Referencia del mensaje',12),area('proximoPaso','Derivación / próximo paso',12)]}]},
 {tipo:'visita',name:'Ficha de Visita Técnica',subtitle:'Qué ocurrió en la visita y qué se pudo verificar',tag:'Una por visita',record:'Visita',newLabel:'Nueva visita',help:'Nueva visita registra otra visita o intento de acceso, con sus propios hechos y horarios. Crear versión corregida corrige esta misma visita y conserva la anterior. No copies los resultados de una visita a otra.',groups:[
 {title:'1 · Motivo',fields:[select('tipoVisita','Tipo de visita',['Inspección inicial','Seguimiento','Verificación','Intento de acceso','Otra']),date('fechaVisita','Fecha'),area('descripcion','Motivo de la visita',12)]},
 {title:'2 · Horarios',fields:[time('horaAcordada','Hora acordada'),time('horaLlegada','Llegada'),time('horaInicio','Inicio efectivo'),time('horaFin','Fin del control'),time('horaSalida','Salida'),text('esperaMotivo','Motivo de la espera',12)]},
 {title:'3 · Acceso',fields:[select('acceso','Acceso al sector',['Habilitado','Parcial','Impedido']),text('autorizaAcceso','Quién autorizó / gestionó el ingreso'),area('restricciones','Condiciones y restricciones de acceso',12)]},
 {title:'4 · Participantes',fields:[text('responsableVisita','Técnico que realizó la visita'),text('recibidoPor','Persona que recibió'),text('propietario','Propietario o solicitante'),text('contacto','Contacto'),area('participantes','Acompañantes y función',12)]},
 {title:'5 · Recorrido',fields:[text('edificio','Edificio u obra visitada'),text('unidad','Unidad o sector'),area('recorrido','Sectores efectivamente recorridos'),area('sectoresNoVisitados','Sectores no inspeccionados y motivo')]},
 {title:'6 · Seguridad de la actividad prevista',fields:[select('seguridad','Condiciones observadas',['Sin evaluar','Aptas para la actividad','Aptas con medidas registradas','No aptas / visita suspendida']),text('permiso','Permiso / autorización aplicable'),area('riesgos','Riesgos identificados'),area('medidasSeguridad','Medidas adoptadas y limitaciones')]},
 {title:'7 · Actividad',fields:[area('actividad','Qué se verificó'),area('metodo','Método / mediciones / evidencia de esta visita')]},
 {title:'8 · Resultado',fields:[select('resultado','Resultado de la visita',['Completa','Parcial','No realizada']),area('observacionesTecnicas','Observaciones técnicas'),area('limitesVerificacion','Qué no pudo comprobar el técnico'),area('compromisos','Próximo paso: compromiso, responsable y fecha'),text('representantesPrevistos','Representantes previstos para la firma',12)]}]},
 {tipo:'relevamiento',name:'Informe de Relevamiento',subtitle:'Diagnóstico · plan de trabajo · cronograma previsto',tag:'Planificación',record:'Relevamiento',newLabel:'Nuevo relevamiento',help:'Nuevo relevamiento registra otra evaluación técnica. Crear versión corregida ajusta la misma evaluación sin borrar su historia. El cronograma previsto no acredita las fechas reales de ejecución.',groups:[
 {title:'Diagnóstico y evidencia',fields:[text('visitaReferencia','Visita de referencia'),select('modalidad','Modalidad',['Visita','Remota']),date('fechaIntervencion','Fecha de intervención'),text('tecnico','Técnico interviniente'),text('participantes','Participantes'),area('antecedentes','Antecedentes de la solicitud'),area('condiciones','Condiciones y límites de observación'),area('hallazgos','Hallazgos'),area('pruebas','Pruebas y mediciones'),area('causa','Causa confirmada, probable o no determinada; fundamento'),text('planoReferencia','Ubicación referencial del hallazgo')]},
 {title:'Plan de trabajo',fields:[area('alcance','Objetivo de la intervención'),area('exclusiones','Exclusiones y supuestos'),area('criterios','Criterios generales de aceptación',12)]},
 {title:'Cronograma previsto de los trabajos',fields:[date('inicioPrevisto','Inicio previsto'),date('finPrevisto','Fin previsto'),select('decisionAlcance','Estado del plan',['Propuesto','Pendiente de aprobación','Aprobado con referencia']),area('cronograma','Condiciones y referencia del cronograma'),area('condicionesOperativas','Condiciones de ejecución y tiempos técnicos')]},
 {title:'Garantía',fields:[select('decisionGarantia','Evaluación de garantía',['Por determinar','Aplica con fundamento','No aplica con fundamento']),area('fundamentoGarantia','Fundamento de la decisión')]}
 ]},
 {tipo:'avance',name:'Informe de Avance',subtitle:'Trabajo del período, desvíos y próximos pasos',tag:'Opcional',record:'Avance',newLabel:'Nuevo avance',help:'Registrá un avance si el trabajo requiere informar un período o etapa. Puede haber ninguno, uno o varios; omitirlo no bloquea el cierre. Una versión corregida modifica el mismo corte.',groups:[
 {title:'Período y referencia',fields:[date('periodoDesde','Período desde'),date('periodoHasta','Corte hasta'),text('alcanceReferencia','Plan aprobado: código y revisión')]},
 {title:'Ejecución del período',fields:[area('acumulado','Acumulado y saldo por ítem'),text('porcentaje','Porcentaje declarado al corte',3),text('metodoPorcentaje','Método y base del porcentaje'),area('desvios','Desvíos, impedimentos y efecto en fechas'),area('proximoPeriodo','Próxima etapa y dependencias')]}
 ]},
 {tipo:'cierre',name:'Informe de Cierre Técnico',subtitle:'Ejecución real y comprobación del resultado',tag:'Resultado técnico',record:'Cierre',newLabel:'Nuevo cierre',help:'Registra trabajos efectivamente ejecutados y su comprobación. Una versión corregida conserva el cierre anterior. No declara por sí solo la aceptación del cliente.',groups:[
 {title:'Ejecución real',fields:[date('inicioReal','Inicio real del trabajo'),date('finReal','Fin real del trabajo'),text('alcanceReferencia','Plan aprobado: código y revisión'),text('cambiosAprobados','Cambios aprobados: referencias'),area('ejecucionPorItem','Trabajos efectivamente ejecutados',12)]},
 {title:'Verificación final',fields:[area('verificacion','Criterio, método, resultado, verificador y fecha',12),text('planoReferencia','Ubicación referencial del trabajo',12),area('limpiezaVerificada','Limpieza: comprobación, responsable y fecha'),area('danosVerificados','Daños: comprobación, responsable y fecha'),area('pendientes','Pendientes, restricciones y acciones'),area('entregables','Entregables efectivamente entregados'),area('conclusion','Conclusión técnica'),text('autorizacionInterna','Autorización interna: actor y referencia')]}
 ]},
 {tipo:'acta',name:'Acta de Conformidad',subtitle:'Entrega, decisión del cliente y firma',tag:'Recepción del cliente',record:'Acta',newLabel:'',help:'Deja constancia del alcance entregado y la decisión del receptor. La firma corresponde a la revisión exacta presentada; escribir el nombre no equivale a firmar. Una corrección requiere nueva revisión y, cuando corresponda, nueva firma.',groups:[
 {title:'Entrega y receptor',fields:[text('receptor','Nombre del receptor'),text('documentoReceptor','Documento de identidad / RUC'),text('organizacion','Organización'),text('cargo','Cargo o calidad'),text('facultad','Facultad de representación'),date('fechaEntrega','Fecha de entrega'),text('cierreReferencia','Informe de cierre y revisión entregados'),select('decisionPreparada','Decisión declarada del cliente',['Pendiente','Conforme','Conforme con reservas','No conforme']),area('objetoEntrega','Trabajos entregados',12),area('observacionesCliente','Observaciones del cliente'),area('reservas','Reservas y tratamiento'),area('anexosEntregados','Documentos y anexos entregados'),text('garantiaReferencia','Garantía: referencia contractual'),area('garantiaCondiciones','Cobertura, inicio, duración y exclusiones',12)]}
 ]},
 {tipo:'encuesta',name:'Encuesta de Satisfacción',subtitle:'Tiempo, calidad, confianza y recomendación',tag:'Escala de 1 a 10',record:'Encuesta',newLabel:'Nueva encuesta',help:'Nueva encuesta registra una respuesta en otra ocasión. Crear versión corregida corrige una transcripción o dato de esta encuesta, conservando su versión anterior y el motivo. Las valoraciones las proporciona el cliente.',groups:[
 {title:'Datos de la respuesta',fields:[text('respondente','Cliente que responde'),date('fechaRespuesta','Fecha de respuesta'),text('relacionConOT','Relación con el servicio'),select('modalidad','Modalidad de captura',['Presencial','Teléfono','Correo','WhatsApp','Formulario']),text('referenciaFuente','Referencia de la respuesta original',12)]},
 {title:'Tu experiencia',fields:ENCUESTA_PREGUNTAS.map(([key,label])=>({key,label,type:'scale',span:12}))},
 {title:'Tu opinión',fields:[area('sugerencias','¿Qué podríamos mejorar? ¿Querés agregar alguna observación?',12)]}
 ]},
];
export const claveEtapa = (tipo:TipoDocumento) => tipo==='orden_servicio'?'origen':tipo;
export function camposVacios(tipo:TipoDocumento):Record<string,string> {
 return Object.fromEntries(ETAPAS_OT.find(s=>s.tipo===tipo)!.groups.flatMap(g=>g.fields.map(f=>[f.key,''])));
}
export function validarEtapa(tipo:TipoDocumento,datos:Record<string,unknown>):string|null {
 const d=(datos[claveEtapa(tipo)]??{}) as Record<string,string>;
 const fechas=tipo==='relevamiento'?['inicioPrevisto','finPrevisto']:tipo==='cierre'?['inicioReal','finReal']:tipo==='avance'?['periodoDesde','periodoHasta']:[];
 if(fechas.length&&d[fechas[0]]&&d[fechas[1]]&&d[fechas[1]]<d[fechas[0]])return 'La fecha de fin no puede ser anterior al inicio.';
 if(tipo==='visita'&&d.horaInicio&&d.horaFin&&d.horaFin<d.horaInicio)return 'Revisá el horario de inicio y fin de la visita.';
 return null;
}
