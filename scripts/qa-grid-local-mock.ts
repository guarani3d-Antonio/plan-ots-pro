// Adaptador cerrado de ensayo: todas las lecturas usan datos ficticios;
// cualquier escritura o RPC desconocido se rechaza.
export const user='10000000-0000-4000-8000-000000000001',tenant='20000000-0000-4000-8000-000000000001';
export const proyectos=[{id:'30000000-0000-4000-8000-000000000001',nombre:'Edificio QA',tenant_id:tenant,proyecto_padre_id:null,carpeta_id:null,deleted_at:null},{id:'30000000-0000-4000-8000-000000000002',nombre:'Casa QA',tenant_id:tenant,proyecto_padre_id:null,carpeta_id:null,deleted_at:null}];
const estados=['Pendiente','En proceso','Cerrada','No aplica'];
const ordenes=Array.from({length:1350},(_,i)=>({id:`40000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`,proyecto_id:proyectos[i%2].id,ot:`OT-${String(i+1).padStart(5,'0')}`,estado:estados[i%4],prioridad:i%2?'Media':'Alta',rubro:i%2?'Eléctrica':'Albañilería',responsable:i%2?'Ana Benítez QA':'José Muñoz QA',contratistas:[i%2?'Eléctrica Ñandutí':'Construcciones Benítez'],ubicacion:'Sector de ensayo',unidad_amenities:`Unidad ${i+1}`,descripcion:i===1349?'Coincidencia única de última página':'Reparación ficticia de prueba',comentarios:'',campos:{},fecha_ingreso:'2026-10-01',fecha_fin_trabajos:['Cerrada','No aplica'].includes(estados[i%4])?`2026-10-${String(2+i%17).padStart(2,'0')}`:undefined,created_at:'2026-10-01T12:00:00Z',updated_at:'2026-10-19T12:00:00Z',pos_x:0.5,pos_y:0.5,plano_ref_url:'',orden_costos:[],deleted_at:null,porcentaje_avance:i%101}));
const docs=['orden_servicio','visita','relevamiento','avance','cierre','acta','encuesta'].map((tipo,i)=>({id:`50000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`,tenant_id:tenant,proyecto_id:proyectos[0].id,orden_id:ordenes[0].id,ciclo:1,tipo,folio:i+1,codigo:`DOC-QA-${i+1}`,creado_por:user,creado_en:'2026-10-19T12:00:00Z'}));
const rows:Record<string,any[]>={proyectos,plan_carpetas:[],ordenes,plan_documentos:docs,plan_documento_borradores:docs.map(d=>({documento_id:d.id,datos:{observaciones:'Contenido ficticio conservado del documento',incluirFotos:false},version:0,actualizado_por:user,actualizado_en:'2026-10-19T12:00:00Z'}))};
class Query {
 filters:((r:any)=>boolean)[]=[];from=0;to=999;one=false;orders:{key:string;asc:boolean}[]=[];
 constructor(public table:string){}
 select(){return this}eq(k:string,v:any){this.filters.push(r=>r[k]===v);return this}is(k:string,v:any){this.filters.push(r=>(r[k]??null)===v);return this}in(k:string,v:any[]){this.filters.push(r=>v.includes(r[k]));return this}
 order(key:string,options:any={}){this.orders.push({key,asc:options.ascending!==false});return this}range(a:number,b:number){this.from=a;this.to=b;return this}limit(n:number){this.to=n-1;return this}maybeSingle(){this.one=true;return this}single(){this.one=true;return this}
 then(resolve:any,reject:any){return Promise.resolve().then(()=>{const list=(rows[this.table]??[]).filter(r=>this.filters.every(f=>f(r)));list.sort((a,b)=>{for(const o of this.orders){const v=String(a[o.key]??'').localeCompare(String(b[o.key]??''));if(v)return o.asc?v:-v}return 0});const data=list.slice(this.from,this.to+1);return {data:structuredClone(this.one?data[0]??null:data),error:null}}).then(resolve,reject)}
 insert(){throw Error('Escrituras bloqueadas en ensayo local')}update(){throw Error('Escrituras bloqueadas en ensayo local')}delete(){throw Error('Escrituras bloqueadas en ensayo local')}upsert(){throw Error('Escrituras bloqueadas en ensayo local')}
}
const ok=(data:any)=>Promise.resolve({data,error:null});
export const supabase:any={from:(name:string)=>new Query(name),rpc:(name:string,args:any={})=>{
 if(name==='plan_colores_obras')return ok(proyectos.map(p=>({proyecto_id:p.id,obra_id:p.id,nombre:p.nombre,color:'#3d599b'})));
 if(name==='plan_empresa_marca_obra')return ok({tenant_id:tenant,nombre:'Empresa ficticia QA',logo_path:null});
 if(name==='plan_documento_contexto_campos')return ok({identificacion:{obra:'Edificio QA',ubicacion:'Sector ficticio',responsable:'José Muñoz QA',descripcion:'Solicitud ficticia'},protegidos:{},items:null,vinculos:{},opciones:{}});
 if(name==='plan_responsables_proyecto')return ok([{user_id:user,nombre:'José Muñoz QA',rol:'tecnico'}]);
 if(['plan_clientes_para_obra','plan_clientes_gestion_obra','plan_fichas_contratistas_obra','plan_contratistas_para_obra','plan_contratista_presupuestos','plan_contratista_evaluaciones','plan_documento_firmas','plan_documento_fuentes','plan_cliente_ubicaciones'].includes(name))return ok([]);
 if(name==='plan_foto_directorio')return ok(null);
 throw Error(`RPC no permitido en ensayo: ${name}`);
},channel:()=>{const channel={on:()=>channel,subscribe:()=>channel};return channel;},removeChannel:()=>ok(null),storage:{from:()=>({download:()=>ok(null),createSignedUrl:()=>ok(null)})},auth:{getUser:()=>ok({user:{id:user}})}};
