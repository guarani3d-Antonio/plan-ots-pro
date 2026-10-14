const tenant='30000000-0000-4000-8000-000000000010',work='30000000-0000-4000-8000-000000000020',client='30000000-0000-4000-8000-000000000030';
let sites=[{id:'lugar-qa',cliente_id:client,proyecto_id:work,obra_id:work,nombre_obra:'Edificio Bernardino QA',proyecto_nombre:'Edificio Bernardino QA',direccion:'Dirección de la obra QA',ciudad:'Asunción',obra_tipo:'Residencial',tipo_inmueble:'residencial_altura',piso:'4',unidad:'402',sector:'',activo:true,datos_adicionales:{torre:'Torre A'}}];
let customers=[{id:client,tenant_id:tenant,datos:{nombre:'Lucía QA',tipo:'persona',identificacion:'Documento QA',telefono:'00000000',correo:'lucia@example.test',activo:true,potencialmente_conflictivo:false},completa:true,codigo:1,actualizado_en:'2026-10-14T12:00:00Z',vinculos:[],ubicaciones:sites}];
const orders=[{id:'orden-qa',ot:'OT-QA001',proyecto_id:work,obra:'Edificio Bernardino QA',unidad:'402',torre:'Torre A',sector:'',descripcion:'Revisar aire acondicionado',rubro:'Aire acondicionado',estado:'Pendiente',prioridad:'Media',ubicacion:'Departamento 402',responsable:'Técnico QA',recepcion:'2026-10-13',cierre:null,comentarios:'Coordinar visita.',reclamos_qr:[{numero:'REC-QA001',fecha:'2026-10-13',estado:'Vinculado a OT'}]}];
const ratings=[{respondente:'Lucía QA',fechaRespuesta:'2026-10-10',referenciaFuente:'Respuesta original QA',modalidad:'Presencial',rapidez:'8',calidadTrabajo:'9',sugerencias:'Muy buena atención.'}];
const ok=(data:any)=>Promise.resolve({data,error:null});
let failDirectory=false;
export function escenarioDirectorioQA(fallo:boolean){failDirectory=fallo;}
export const supabase:any={
 rpc:async(name:string,args:any)=>{
 if(name==='plan_clientes_directorio')return failDirectory?{data:null,error:{message:'Error de conexión simulado QA'}}:{data:customers.filter(c=>c.tenant_id===args.p_tenant).map(c=>({...c,ubicaciones:sites.filter(u=>u.cliente_id===c.id),indicadores:{total:c.id===client?1:0,abiertas:c.id===client?1:0,ultima:c.id===client?'2026-10-13':null,encuestasRespondidas:c.id===client?1:0,satisfaccion:c.id===client?8.5:null}})),error:null};
 if(name==='plan_clientes_fichas')return {data:customers.map(c=>({...c,ubicaciones:sites.filter(u=>u.cliente_id===c.id)})),error:null};
 if(name==='plan_directorio_listar')return {data:args.p_tipo==='empresa'?[{id:tenant,tenant_id:tenant,datos:{nombre:'Empresa QA',activo:true},vinculos:[],completa:true}]:[],error:null};
 if(name==='plan_cliente_obras')return {data:[{id:work,obra_id:work,nombre:'Edificio Bernardino QA',proyecto_nombre:'Edificio Bernardino QA',direccion:'Dirección de la obra QA',ciudad:'Asunción',tipo:'Residencial',activo:true}],error:null};
 if(name==='plan_cliente_ubicaciones_listar')return {data:sites.filter(u=>u.cliente_id===args.p_cliente),error:null};
 if(name==='plan_cliente_perfil'){const rows=args.p_estado==='Cerrada'?[]:orders;return {data:{resumen:{total:1,pendiente:1,enProceso:0,cerrada:0,noAplica:0,diasCierre:null,cierresConFecha:0},meses:[{mes:'2026-10',cantidad:1}],ordenes:rows,encuestas:[{id:'encuesta-qa',codigo:'POT-QA-ENC-1',orden_id:'orden-qa',ot:'OT-QA001',obra:'Edificio Bernardino QA',revision_id:'revision-qa',revision:1,fecha:'2026-10-10',datos:ratings[0],guardada:true}],valoraciones:ratings,totalOrdenes:rows.length,totalEncuestas:1,pagina:0,tamanoPagina:20},error:null};}
 if(name==='plan_cliente_ficha_guardar'){const cid=args.p_id||crypto.randomUUID(),old=customers.find(c=>c.id===cid);if(old)old.datos=args.p_datos;else customers.push({id:cid,tenant_id:tenant,datos:args.p_datos,completa:args.p_completa,codigo:2,actualizado_en:'2026-10-14',vinculos:[],ubicaciones:[]});if(args.p_proyecto){const u=sites.find(u=>u.id===args.p_ubicacion);if(u){u.unidad=args.p_lugar.unidad;u.datos_adicionales.torre=args.p_lugar.torre}else sites.push({...sites[0],id:crypto.randomUUID(),cliente_id:cid,unidad:args.p_lugar.unidad,datos_adicionales:{torre:args.p_lugar.torre}})}return {data:cid,error:null};}
 if(name==='plan_foto_directorio')return {data:'fixture.jpg',error:null};
 return {data:[],error:null};
 },
 from:()=>{const q:any={select:()=>q,eq:()=>q,in:()=>q,order:()=>q,limit:()=>q,maybeSingle:()=>ok(null),single:()=>ok(null),then:(resolve:any)=>ok([]).then(resolve)};return q;},
 storage:{from:()=>({createSignedUrl:()=>ok({signedUrl:'/tmp/customer-profiles-qa/foto.jpg'}),upload:()=>ok({}),remove:()=>ok({})})},
 auth:{onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},channel:()=>({on(){return this},subscribe(){return this}}),removeChannel:()=>ok(null)
};
