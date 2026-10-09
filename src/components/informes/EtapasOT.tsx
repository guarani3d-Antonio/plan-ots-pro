import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type ReactNode } from 'react';
import type { OrdenLocal } from '../../types/orden';
import { cargarBorradorDocumento, guardarVersionDocumento, listarDocumentosDeOrden, listarRevisionesDocumento, reservarDocumento, type DocumentoRegistro, type RevisionDocumento, type TipoDocumento } from '../../services/documentService';
import { prepararAutocompletado, objetoFuente, type ClienteInforme, type FuentesInforme } from '../../services/reportAutofillService';
import { camposVacios, claveEtapa, ETAPAS_OT, TIPOS_CON_PLANO, validarEtapa } from '../../services/otStageSchema';
import { PLANTILLA_CONTROLADA_VERSION } from '../../services/controlledReportService';
import { generarContextoPlano } from '../../services/planLocationService';
import { informeDisponible } from '../../services/reportService';
import { EtapaCampos } from './EtapaCampos';
import { VoiceInputButton } from '../ui/VoiceInputButton';
import TooltipAyuda from '../ayuda/TooltipAyuda';
import styles from './EtapasOT.module.css';
import { tienePermiso } from '../../stores/accessStore';

interface Registro { doc:DocumentoRegistro|null; datos:Record<string,unknown>; version:number; dirty:boolean; revisiones:RevisionDocumento[]; historical:string; correcting:boolean; motivo:string; request:string; saveRequest:string }
type Estado=Record<TipoDocumento,Registro>;
export interface EtapasOTHandle {
 guardar:(orden:OrdenLocal)=>Promise<void>;
 documento:(tipo:TipoDocumento)=>string|undefined;
 abrir:(tipo:TipoDocumento)=>void;
 vincularEvidencia:(tipo:TipoDocumento,id:string)=>void;
 actualizarDocumento:(doc:DocumentoRegistro,borrador?:{datos:Record<string,unknown>;version:number},revisiones?:RevisionDocumento[])=>void;
}
interface Props { orden:OrdenLocal; cliente?:ClienteInforme|null; proyectoNombre:string; disabled:boolean; puedeRevisar:boolean; onDirty:(dirty:boolean)=>void; onPreview:(tipo:TipoDocumento,revision?:string)=>void; onOrigen?:(datos:Record<string,unknown>)=>void; onFechasReales:(inicio:string,fin:string)=>void; solicitud:(datos:Record<string,unknown>,onChange:(datos:Record<string,unknown>)=>void)=>ReactNode; ejecucion:ReactNode; evidencia?:(tipo:TipoDocumento,datos:Record<string,unknown>,readOnly:boolean)=>ReactNode; evidenciasIds?:(tipo:TipoDocumento)=>string[]; refresh:number }
const vacio=():Registro=>({doc:null,datos:{},version:0,dirty:false,revisiones:[],historical:'',correcting:false,motivo:'',request:crypto.randomUUID(),saveRequest:crypto.randomUUID()});

export const EtapasOT=forwardRef<EtapasOTHandle,Props>(function EtapasOT({orden,cliente,proyectoNombre,disabled,onDirty,onPreview,onOrigen,onFechasReales,solicitud,ejecucion,evidencia,evidenciasIds,refresh},ref){
 const puedeCorregir=tienePermiso('informe.crear',orden.proyecto_id)&&tienePermiso('informe.editar',orden.proyecto_id);
 const [state,setState]=useState<Estado>(()=>Object.fromEntries(ETAPAS_OT.map(e=>[e.tipo,vacio()])) as Estado);
 const stateRef=useRef(state);stateRef.current=state;
 const [documentos,setDocumentos]=useState<DocumentoRegistro[]>([]);
 const [open,setOpen]=useState<TipoDocumento[]>(['orden_servicio']);
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [loadFailed,setLoadFailed]=useState(false);
 const alive=useRef(true),lock=useRef(false);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[]);
 const patch=(tipo:TipoDocumento,change:Partial<Registro>)=>{const next={...stateRef.current,[tipo]:{...stateRef.current[tipo],...change}};stateRef.current=next;setState(next)};
 const sources=():FuentesInforme=>Object.fromEntries(['orden_servicio','visita','relevamiento','avance','cierre'].map(t=>[t,stateRef.current[t as TipoDocumento].datos]));
 const inicial=(tipo:TipoDocumento,ot=orden):Record<string,unknown>=>{
  const p=prepararAutocompletado(ot,proyectoNombre,cliente??null,sources());
  const key=claveEtapa(tipo);
  return {observaciones:'',incluirFotos:true,planoContexto:null,[key]:{...camposVacios(tipo),...objetoFuente(p[key as keyof typeof p])},
   ...(tipo==='relevamiento'?{itemsAlcance:[]}:tipo==='avance'?{itemsAvance:p.itemsAvance}:tipo==='cierre'?{itemsCierre:p.itemsCierre}:{})};
 };
 const content=(tipo:TipoDocumento,r:Registro=state[tipo],ot=orden)=>{
  if(r.historical)return r.revisiones.find(v=>v.id===r.historical)?.datos??r.datos;
  if(r.version>0&&!r.correcting)return r.datos;
  const base=inicial(tipo,ot),key=claveEtapa(tipo);
  return {...base,...r.datos,[key]:{...objetoFuente(base[key]),...objetoFuente(r.datos[key])}};
 };
 useEffect(()=>{onDirty(Object.values(state).some(s=>s.dirty))},[state,onDirty]);
 useEffect(()=>{
  let cancelled=false;setLoading(true);setError('');setLoadFailed(false);
  void (async()=>{const docs=await listarDocumentosDeOrden(orden.id);const next=Object.fromEntries(await Promise.all(ETAPAS_OT.map(async e=>{
   const doc=docs.filter(d=>d.tipo===e.tipo&&d.ciclo===1).at(-1)??null;
   const [b,revs]=doc?await Promise.all([cargarBorradorDocumento(doc.id),listarRevisionesDocumento(doc.id)]):[null,[]];
   return [e.tipo,{...vacio(),doc,datos:b?.datos??{},version:b?.version??0,revisiones:revs}];
  }))) as Estado;if(!cancelled){setDocumentos(docs);stateRef.current=next;setState(next)}})().catch(e=>{if(!cancelled){setLoadFailed(true);setError(e.message??'No se pudieron cargar las etapas.')}}).finally(()=>{if(!cancelled)setLoading(false)});
  return()=>{cancelled=true};
 },[orden.id,refresh]);

 const editar=(tipo:TipoDocumento,datos:Record<string,unknown>)=>{const r=stateRef.current[tipo];if(disabled||loading||busy||r.historical||r.version>0&&!r.correcting)return false;patch(tipo,{datos,dirty:true,saveRequest:crypto.randomUUID()});return true;};
 const guardar=async(ot:OrdenLocal)=>{
  if(loading)throw new Error('Esperá a que se carguen las etapas.');
  if(loadFailed)throw new Error('No se pudieron recuperar los documentos. Reabrí la OT para reintentar sin sobrescribir datos.');
  for(const etapa of ETAPAS_OT){const r=stateRef.current[etapa.tipo];if(!r.dirty)continue;
   let datos=content(etapa.tipo,r,ot);if(!Array.isArray(datos.fotoIds)&&evidenciasIds)datos={...datos,fotoIds:evidenciasIds(etapa.tipo)};const validation=validarEtapa(etapa.tipo,datos);if(validation)throw new Error(`${etapa.name}: ${validation}`);
   if(r.version>0&&!r.correcting)throw new Error(`${etapa.name}: creá una versión corregida antes de modificar la versión guardada.`);
   if(r.correcting&&!r.motivo.trim())throw new Error(`${etapa.name}: indicá el motivo de la versión corregida.`);
   // Snapshots are taken only on explicit save; existing per-report edits are preserved.
   datos={...datos,identificacion:{...prepararAutocompletado(ot,proyectoNombre,cliente??null,sources()).identificacion,...objetoFuente(datos.identificacion)},motivoCorreccion:r.motivo||String(datos.motivoCorreccion??'')};
   if(TIPOS_CON_PLANO.includes(etapa.tipo)&&!datos.planoContexto)datos.planoContexto=await generarContextoPlano(ot);
   const doc=r.doc??await reservarDocumento(ot.id,etapa.tipo,1,r.request);
   // Retain the reservation after partial failures to make retry safe.
   patch(etapa.tipo,{doc});
   const {borrador:saved,revisiones}=await guardarVersionDocumento(doc.id,datos,r.version,r.saveRequest,r.correcting,r.correcting?r.motivo.trim():null,1,PLANTILLA_CONTROLADA_VERSION);
   patch(etapa.tipo,{datos:saved.datos,version:saved.version,revisiones,historical:'',dirty:false,correcting:false,saveRequest:crypto.randomUUID()});
   setDocumentos(prev=>prev.some(d=>d.id===doc.id)?prev:[...prev,doc]);
  }
 };
 useImperativeHandle(ref,()=>({guardar,documento:tipo=>stateRef.current[tipo].doc?.id,
  abrir:tipo=>{setOpen(prev=>prev.includes(tipo)?prev:[...prev,tipo]);},
  vincularEvidencia:(tipo,id)=>{const r=stateRef.current[tipo];if(r.historical||r.version>0&&!r.correcting)return;const datos=content(tipo,r);patch(tipo,{datos:{...datos,fotoIds:[...new Set([...(Array.isArray(datos.fotoIds)?datos.fotoIds as string[]:evidenciasIds?.(tipo)??[]),id])]},dirty:true,saveRequest:crypto.randomUUID()});},
  actualizarDocumento:(doc,borrador,revisiones)=>{
   if(doc.orden_id!==orden.id||doc.ciclo!==1)return;
   setDocumentos(prev=>prev.some(d=>d.id===doc.id)?prev:[...prev,doc]);
   const r=stateRef.current[doc.tipo];if(r.dirty)return;
   const same=r.doc?.id===doc.id;
   patch(doc.tipo,{...(same?{}:vacio()),doc,
    ...(borrador?{datos:borrador.datos,version:borrador.version,dirty:false,correcting:false}:{}),
    ...(revisiones?{revisiones}:{}),
   });
  }
 }));
 const run=async(action:()=>Promise<void>)=>{if(lock.current)return;lock.current=true;setBusy(true);setError('');try{await action()}catch(e){if(alive.current)setError(e instanceof Error?e.message:'No se pudo completar la operación.')}finally{lock.current=false;if(alive.current)setBusy(false)}};
 const cambiar=async(tipo:TipoDocumento,id:string)=>{const r=stateRef.current[tipo];if(r.dirty)return;
  if(id==='nuevo'){patch(tipo,{...vacio(),dirty:true});return}
  const doc=documentos.find(d=>d.id===id);if(!doc)return;
  const [b,revs]=await Promise.all([cargarBorradorDocumento(id),listarRevisionesDocumento(id)]);patch(tipo,{...vacio(),doc,datos:b?.datos??{},version:b?.version??0,revisiones:revs});
 };
 const corregir=async(tipo:TipoDocumento)=>{
  const r=stateRef.current[tipo];if(!r.doc||r.dirty||!r.version||!puedeCorregir)return;
  patch(tipo,{revisiones:await listarRevisionesDocumento(r.doc.id),historical:'',correcting:true,motivo:'',dirty:true,datos:{...r.datos},saveRequest:crypto.randomUUID()});
 };
 const blocked=disabled||loading||busy||loadFailed;
 return <div className={styles.root} aria-label="Carga de la OT por etapas">
  <div className={styles.toolbar}><small>Completá cada etapa cuando corresponda.</small><div className={styles.actions}><button type="button" className={styles.button} onClick={()=>setOpen(ETAPAS_OT.map(e=>e.tipo))}>Expandir todo</button><button type="button" className={styles.button} onClick={()=>setOpen([])}>Contraer todo</button></div></div>
  {loading&&<p role="status">Cargando documentos y versiones…</p>}{error&&<p className={styles.error} role="alert">{error}</p>}
  {ETAPAS_OT.map((e,i)=>{const r=state[e.tipo],datos=content(e.tipo);const readOnly=!!r.historical||r.version>0&&!r.correcting;return <details key={e.tipo} className={styles.stage} data-tipo={e.tipo} open={open.includes(e.tipo)} onToggle={event=>{const isOpen=event.currentTarget.open;setOpen(prev=>isOpen?(prev.includes(e.tipo)?prev:[...prev,e.tipo]):prev.filter(t=>t!==e.tipo))}}>
   <summary className={styles.summary}><span className={styles.number}>{i+1}</span><span className={styles.name}><strong>{e.name}</strong><small>{e.subtitle}</small></span><span className={styles.tag}>{e.tag}</span><span className={styles.chevron}>›</span></summary>
   <div className={styles.body}><p className={styles.description}>{e.help}</p>
    <div className={styles.docbar}><label>{e.record} y versión<select value={r.doc?.id??'nuevo'} disabled={loading||busy||loadFailed||r.dirty} onChange={event=>void run(()=>cambiar(e.tipo,event.target.value))}>{documentos.filter(d=>d.tipo===e.tipo&&d.ciclo===1).map(d=><option key={d.id} value={d.id}>{d.codigo}</option>)}<option value="nuevo" disabled={blocked||!puedeCorregir||!e.newLabel&&!!r.doc}>Nuevo borrador</option></select></label>
     {e.newLabel&&<button type="button" className={styles.button} disabled={blocked||r.dirty} onClick={()=>void run(()=>cambiar(e.tipo,'nuevo'))}>+ {e.newLabel}</button>}
     <button type="button" className={styles.button} disabled={blocked||r.dirty||!r.doc||!r.version||!puedeCorregir} onClick={()=>void run(()=>corregir(e.tipo))}>Crear versión corregida</button><TooltipAyuda titulo="Nuevo documento o versión corregida" texto={`${e.help} Cada guardado conserva una versión de solo lectura. Cualquier corrección exige otra versión y su motivo. La emisión y la firma se autorizan por separado.`}/>
     <button type="button" className={styles.button} title={!informeDisponible(e.tipo==='acta'?'acta_conformidad':e.tipo,orden.estado)?'Disponible cuando la OT alcance el estado correspondiente.':undefined} disabled={loading||busy||loadFailed||!tienePermiso('informe.ver',orden.proyecto_id)||!r.historical&&(!informeDisponible(e.tipo==='acta'?'acta_conformidad':e.tipo,orden.estado)||e.tipo==='avance'&&!r.doc&&!r.dirty)} onClick={()=>onPreview(e.tipo,r.historical||undefined)}>Ver informe</button>
    </div>
    {r.revisiones.length>0&&<label className={styles.docbar}>Historial de versiones<select aria-label={`Historial de ${e.name}`} value={r.historical} disabled={loading||busy||r.dirty} onChange={event=>patch(e.tipo,{historical:event.target.value})}><option value="">{r.correcting?'Nueva versión en preparación':'Última versión guardada · solo lectura'}</option>{r.revisiones.map(v=><option key={v.id} value={v.id}>R{String(v.revision).padStart(2,'0')} · {v.motivo??'Versión inicial'} · {new Date(v.creada_en).toLocaleString('es-PY')} · solo lectura</option>)}</select></label>}
    {readOnly&&<p className={styles.note}>Versión conservada · solo lectura. Usá «Crear versión corregida» para preparar cambios.</p>}
    {r.correcting&&<div className={styles.reason}><div className={styles.labelRow}><label htmlFor={`motivo-${e.tipo}`}>Motivo de la versión corregida</label><VoiceInputButton compact value={r.motivo} onChange={v=>patch(e.tipo,{motivo:v,dirty:true,saveRequest:crypto.randomUUID()})} disabled={blocked}/></div><textarea rows={4} id={`motivo-${e.tipo}`} value={r.motivo} disabled={blocked} onChange={event=>patch(e.tipo,{motivo:event.target.value,dirty:true,saveRequest:crypto.randomUUID()})}/></div>}
    {e.tipo==='avance'&&!r.doc&&!r.dirty?<><p className={styles.note}>Sin informe de avance por ahora. Podés continuar con el cierre cuando corresponda.</p><button type="button" className={styles.button} disabled={blocked} onClick={()=>patch('avance',{dirty:true})}>Registrar un informe de avance</button></>:<>
     {e.tipo==='orden_servicio'&&<fieldset className={styles.slot} disabled={blocked||readOnly}>{solicitud(datos,d=>editar(e.tipo,d))}</fieldset>}
     <EtapaCampos tipo={e.tipo} datos={datos} disabled={blocked||readOnly} onChange={d=>{if(!editar(e.tipo,d))return;if(e.tipo==='orden_servicio')onOrigen?.(objetoFuente(d.origen));if(e.tipo==='cierre'){const c=objetoFuente(d.cierre);onFechasReales(String(c.inicioReal??''),String(c.finReal??''));}}}/>
     {e.tipo==='cierre'&&<fieldset className={styles.slot} disabled={blocked||readOnly}>{ejecucion}</fieldset>}
     {evidencia?.(e.tipo,datos,readOnly)}
    </>}
    {r.dirty&&<p className={styles.note}>Cambios pendientes · se guardan con «Guardar cambios» de la OT.</p>}
   </div>
  </details>})}
 </div>;
});
