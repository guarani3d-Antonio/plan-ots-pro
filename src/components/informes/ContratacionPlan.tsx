import {useEffect,useRef,useState} from 'react';
import {fichasContratista,type FichaContratista} from '../../services/workDirectoryService';
import {crearContratistaDesdePlan,type ContratistaDesdePlan} from '../../services/planContractingService';
import {leerContrataciones,nuevaContratacion,type ContratacionPlan,type OrigenPresupuestoPlan} from '../../services/planContractingModel';
import type {ItemAlcance} from '../../services/reportService';
import {useAccessStore,permisoObra,tienePermiso} from '../../stores/accessStore';
import {DialogoComercio} from '../contratistas/DialogoComercio';
import {PresupuestosContratista} from '../contratistas/PresupuestosContratista';
import {coincideBusqueda} from '../../utils/busqueda';
import {FichaPersonaOT} from '../plano/FichaPersonaOT';
import {FotoDirectorio} from '../plano/FotoDirectorio';
import {CamposContratista} from '../contratistas/CamposContratista';
import {guardarFotoDirectorio} from '../../services/directoryPhotoService';
import s from './ContratacionPlan.module.css';
const datosVacios=():ContratistaDesdePlan=>({nombre:'',identificacion:'',contacto:'',direccion:'',especialidad:'',telefono:'',correo:''});
function Necesidad({labor,material,disabled,onChange}:{labor:boolean;material:boolean;disabled:boolean;onChange:(key:'manoObra'|'materiales',value:boolean)=>void}){
 return <div className={s.needs} role="group" aria-label="Qué necesitás contratar">{([['manoObra','Mano de obra','Servicio y ejecución',labor],['materiales','Materiales','Suministro de insumos',material]] as const).map(([key,label,desc,checked])=><button key={key} type="button" role="switch" aria-label={label} aria-checked={checked} disabled={disabled} className={s.need} onClick={()=>onChange(key,!checked)}><span className={s.switch} aria-hidden="true"><i/></span><span><strong>{label}</strong><small>{desc}</small></span><b>{checked?'Incluido':'No incluido'}</b></button>)}</div>;
}

interface Props {ordenId:string;proyectoId:string;valor:unknown;actividades:ItemAlcance[];evidencias:number;disabled:boolean;dirty:boolean;historical?:boolean;revision?:{id:string;codigo:string;version:number};onChange:(json:string)=>void;onVinculados?:(fichas:FichaContratista[])=>void}
export function ContratacionPlan({ordenId,proyectoId,valor,actividades,evidencias,disabled,dirty,historical=false,revision,onChange,onVinculados}:Props){
 const [rows,setRows]=useState<FichaContratista[]>([]),[loadedProject,setLoadedProject]=useState(''),[loading,setLoading]=useState(true),[error,setError]=useState(''),[refresh,setRefresh]=useState(0);
 const [picking,setPicking]=useState<ContratacionPlan|null>(null),[search,setSearch]=useState(''),[creating,setCreating]=useState(false),[busy,setBusy]=useState(false),[createError,setCreateError]=useState('');
 const [newData,setNewData]=useState<ContratistaDesdePlan>(datosVacios);
 const [newPhoto,setNewPhoto]=useState<File|null>(null),[created,setCreated]=useState<FichaContratista|null>(null);const formRef=useRef<HTMLFormElement>(null);
 const tenant=permisoObra(proyectoId)?.tenant_id,canManage=!!tenant&&tienePermiso('contratista.editar',undefined,tenant);
 const creador=useAccessStore(s=>s.contexto?.creador===true);
 const [budget,setBudget]=useState<OrigenPresupuestoPlan|null>(null);const createRequest=useRef({payload:'',id:crypto.randomUUID()}),callback=useRef(onVinculados);callback.current=onVinculados;
 let contracts:ContratacionPlan[]=[],parseError='';try{contracts=leerContrataciones(valor)?.contrataciones??[];}catch(e){parseError=e instanceof Error?e.message:'No se pudo leer la contratación.';}
 useEffect(()=>{let active=true;setLoading(true);setLoadedProject('');void fichasContratista(proyectoId).then(r=>{if(active){setRows(r);setLoadedProject(proyectoId);setError('');}}).catch(e=>{if(active)setError(e.message||'No se pudo cargar el directorio.');}).finally(()=>{if(active)setLoading(false);});return()=>{active=false};},[proyectoId,refresh]);
 useEffect(()=>{if(historical||parseError||loading||error||loadedProject!==proyectoId)return;const ids=new Set(contracts.map(c=>c.contratistaId).filter(Boolean));callback.current?.(rows.filter(f=>ids.has(f.id)));},[valor,rows,historical,loading,error,parseError,loadedProject,proyectoId]); // callback is refreshed without resetting directory state.
 const change=(next:ContratacionPlan[])=>onChange(JSON.stringify({version:1,contrataciones:next}));
 const update=(c:ContratacionPlan,next:Partial<ContratacionPlan>)=>change(contracts.map(v=>v.id===c.id?{...v,...next}:v));
 const open=(c:ContratacionPlan)=>{setPicking(structuredClone(c));setSearch('');setCreateError('');};
 async function create(){
  if(!picking||busy||!formRef.current?.reportValidity())return;
  setBusy(true);setCreateError('');try{
   const payload=JSON.stringify(newData);if(createRequest.current.payload!==payload)createRequest.current={payload,id:crypto.randomUUID()};
   const f=created??await crearContratistaDesdePlan(ordenId,newData,createRequest.current.id);setCreated(f);
   setRows(prev=>[...prev.filter(x=>x.id!==f.id),f]);
   if(newPhoto){try{await guardarFotoDirectorio('contratista',f.id,newPhoto);}catch(e){setCreateError(`La ficha se creó. Falta guardar la foto: ${e instanceof Error?e.message:'Reintentá.'} Podés reintentar o descartar la foto nueva para continuar.`);return;}}
   setPicking(p=>p?{...p,contratistaId:f.id}:null);setCreating(false);setSearch('');setNewPhoto(null);
  }catch(e){setCreateError(e instanceof Error?e.message:'No se pudo registrar el contratista.');}finally{setBusy(false);}
 }
 const card=(c:ContratacionPlan,n:number)=>{const f=rows.find(f=>f.id===c.contratistaId),need=c.manoObra||c.materiales;return <div key={c.id} className={s.contract}>
  <div className={s.row}><strong>{contracts.length>1?`Contratación ${n+1}`:'Necesidad de contratación'}</strong>{!disabled&&<button type="button" className={s.quiet} onClick={()=>change(contracts.filter(x=>x.id!==c.id))}>Quitar del plan</button>}</div>
  <Necesidad labor={c.manoObra} material={c.materiales} disabled={disabled||!evidencias} onChange={(key,value)=>update(c,{[key]:value})}/><div className={s.row}>{!disabled&&<button type="button" disabled={!need||!evidencias||loading||!!error} onClick={()=>open(c)}>{c.contratistaId?'Cambiar contratista':'Seleccionar o crear contratista'}</button>}</div>
  {c.contratistaId&&<><details className={s.sheet} open><summary>Datos del contratista <small>{c.actividadIds.length} actividades vinculadas</small></summary>{f?<FichaPersonaOT tipo="contratista" ficha={f} tenantId={tenant} puedeGestionar={!historical&&canManage} onGuardar={saved=>setRows(prev=>prev.map(v=>v.id===saved.id?saved:v))}/>:<p role="status">{loading?'Cargando ficha…':'No se pudo consultar la ficha. Reintentá cargar el directorio.'}</p>}</details><fieldset className={s.cost} disabled={disabled}><legend>¿Esta contratación tiene costo?</legend><label className={s.check}><input type="radio" name={`costo-${c.id}`} checked={c.costo==='con_costo'} onChange={()=>update(c,{costo:'con_costo'})}/>Sí</label><label className={s.check}><input type="radio" name={`costo-${c.id}`} checked={c.costo==='sin_costo'} onChange={()=>update(c,{costo:'sin_costo'})}/>No</label></fieldset>
   {c.costo==='sin_costo'&&<label className={s.field}>Motivo / cobertura{disabled?<span>{c.motivoSinCosto||'Sin registrar'}</span>:<textarea rows={2} maxLength={2000} placeholder="Ej.: incluido en la garantía del contratista" value={c.motivoSinCosto} onChange={e=>update(c,{motivoSinCosto:e.target.value})}/>}<small>Contratación sin costo. No se genera presupuesto.</small></label>}
   {c.costo==='con_costo'&&<div className={s.row}><button type="button" className={s.primary} disabled={historical||dirty||!revision||!tienePermiso('costos.editar',proyectoId)||!evidencias||!!error||loading||!c.actividadIds.length} onClick={()=>revision&&setBudget({revisionId:revision.id,codigo:revision.codigo,version:revision.version,contratacion:structuredClone(c),actividades:structuredClone(actividades)})}>Generar presupuesto</button><small>{historical?'Versión histórica · consultá el presupuesto conservado en la ficha del contratista.':dirty||!revision?'Guardá la versión del plan antes de generar el presupuesto.':!tienePermiso('costos.editar',proyectoId)?'Sin permiso para presupuestar en esta obra.':`Origen: ${revision.codigo} · v${revision.version} · esta OT`}</small></div>}
  </>}
 </div>};
 return <section className={s.root} aria-label="Contratación desde el Plan de Trabajo"><div className={s.row}><h3>Contratación y presupuesto</h3><small>Vinculados a las actividades y a la versión del plan</small></div>
  {parseError?<p role="alert" className={s.error}>{parseError}</p>:<>{loading&&<small role="status">Cargando contratistas…</small>}{error&&<p role="alert" className={s.error}>{error} <button type="button" onClick={()=>setRefresh(v=>v+1)}>Reintentar</button></p>}
  {!evidencias&&<p className={s.note}>Cargá la evidencia fotográfica de este relevamiento antes de contratar.</p>}
  {contracts.length?contracts.map(card):<><Necesidad labor={false} material={false} disabled={disabled||!evidencias} onChange={(key,value)=>change([{...nuevaContratacion(actividades),[key]:value}])}/><small>Activá una o ambas necesidades. Después elegí el contratista y definí si tiene costo.</small></>}
  {!disabled&&contracts.length>0&&<button type="button" disabled={!evidencias||contracts.length>=20} onClick={()=>change([...contracts,nuevaContratacion(actividades)])}>+ Otra contratación</button>}
  </>}
  {picking&&<DialogoComercio titulo="Contratar para este plan" onClose={()=>setPicking(null)} acciones={<button type="button" className={s.primary} disabled={!picking.contratistaId||!picking.actividadIds.length||!rows.some(f=>f.id===picking.contratistaId&&f.activo)} onClick={()=>{update(picking,{...picking,...(contracts.find(c=>c.id===picking.id)?.contratistaId!==picking.contratistaId?{costo:'',motivoSinCosto:''}:{})});setPicking(null);}}>Vincular al plan</button>}><div className={s.root}>
   <div className={s.row}><label className={`${s.field} ${s.grow}`}>Buscar contratistas de la empresa<input type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Nombre, RUC, contacto…"/></label><button type="button" onClick={()=>{setNewData(datosVacios());setNewPhoto(null);setCreated(null);setCreateError('');setCreating(true);}}>+ Crear contratista</button></div>
   <div className={s.results}>{rows.filter(f=>f.activo&&coincideBusqueda([f.nombre,f.identificacion,f.contacto,f.correo].join(' '),search)).map(f=><button key={f.id} type="button" aria-pressed={picking.contratistaId===f.id} onClick={()=>setPicking({...picking,contratistaId:f.id})}><strong>{f.nombre}</strong><small>{[f.identificacion,f.contacto,f.telefono].filter(Boolean).join(' · ')||'Datos del directorio'}</small><span>{picking.contratistaId===f.id?'Seleccionado':'Seleccionar'}</span></button>)}</div>
   <h3>Actividades a contratar</h3><div className={s.activities}>{actividades.map(a=><label key={a.id} className={s.check}><input type="checkbox" checked={picking.actividadIds.includes(a.id)} disabled={!a.trabajo.trim()} onChange={e=>setPicking({...picking,actividadIds:e.target.checked?[...picking.actividadIds,a.id]:picking.actividadIds.filter(id=>id!==a.id)})}/>{a.id} · {a.trabajo||'Actividad por completar'}</label>)}</div>{!actividades.length&&<p>Agregá las actividades del plan antes de vincular la contratación.</p>}
  </div></DialogoComercio>}
  {creating&&<DialogoComercio titulo="Crear contratista desde el plan" dirty={Object.values(newData).some(Boolean)||!!newPhoto} busy={busy} onClose={()=>setCreating(false)} acciones={<button type="button" className={s.primary} disabled={busy||!newData.nombre.trim()} onClick={()=>void create()}>{created?'Completar y seleccionar':'Crear y seleccionar'}</button>}><form ref={formRef} className={s.root} onSubmit={e=>e.preventDefault()}><small>La ficha queda en el directorio de esta empresa y disponible para este plan.</small><FotoDirectorio tipo="contratista" id={created?.id} nombre={newData.nombre||'Nuevo contratista'} archivo={newPhoto} onArchivo={canManage||creador?setNewPhoto:undefined} disabled={busy}/>{!canManage&&!creador&&<small>El administrador de la empresa puede agregar la foto desde el directorio.</small>}<CamposContratista datos={newData} disabled={busy||!!created} onChange={(key,value)=>setNewData(d=>({...d,[key]:value}))}/>{created&&<small>Datos ya guardados. Reintentá la foto o descartala para continuar; no se creará otra ficha.</small>}{createError&&<p role="alert" className={s.error}>{createError}</p>}</form></DialogoComercio>}
  {budget&&<PresupuestosContratista ordenId={ordenId} contratistaId={budget.contratacion.contratistaId} origenPlan={budget} onCerrarOrigen={()=>setBudget(null)}/>}
 </section>;
}
