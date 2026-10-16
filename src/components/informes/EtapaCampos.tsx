import {CronogramaRelevamiento} from './CronogramaRelevamiento';
import { useId, useState } from 'react';
import {actualizarActividades,datosActividadFuente,type FuenteActividad} from '../../services/workScheduleActivities';
import {leerCronograma,periodoCronograma} from '../../services/workScheduleModel';
import type {ItemAlcance} from '../../services/reportService';
import type { TipoDocumento } from '../../services/documentService';
import { ETAPAS_OT, TEXTO_ACTA, claveEtapa, type CampoEtapa, type GrupoEtapa } from '../../services/otStageSchema';
import { VoiceInputButton } from '../ui/VoiceInputButton';
import { EJEMPLOS_ETAPA } from '../../services/otStageExamples';
import styles from './EtapasOT.module.css';
import { CAMPOS_HEREDADOS, CAMPOS_VINCULADOS, type ContextoCamposInforme } from '../../services/reportFieldPolicy';
import { SelectorBusqueda } from '../ui/SelectorBusqueda';
import { DatoInforme } from './CampoTextoInforme';
import fields from './InformeCampos.module.css';

function Campo({campo,value,onChange,disabled,placeholder,readOnly=false}:{campo:CampoEtapa;value:string;onChange:(v:string)=>void;disabled?:boolean;placeholder?:string;readOnly?:boolean}) {
 const id=useId();
 if(readOnly||disabled){
  const shown=campo.type==='date'&&/^\d{4}-\d{2}-\d{2}$/.test(value)?value.split('-').reverse().join('/'):
   campo.type==='datetime-local'&&/^\d{4}-\d{2}-\d{2}T/.test(value)?`${value.slice(0,10).split('-').reverse().join('/')} ${value.slice(11,16)}`:value;
  return <div className={styles.field} style={{'--field-span':campo.span??6} as React.CSSProperties}><DatoInforme etiqueta={campo.label} value={shown} multiline={campo.type==='textarea'}/></div>;
 }
 const dictable=!campo.options&&!['date','time','datetime-local','scale'].includes(campo.type??'text');
 if(campo.type==='scale')return <fieldset className={styles.scaleField}><legend>{campo.label}</legend><div className={styles.scale}>{[...Array.from({length:10},(_,i)=>String(i+1)),'N/A'].map(n=><label key={n} className={styles.rating}><input type="radio" name={id} value={n} checked={value===n} disabled={disabled} onChange={()=>onChange(n)}/><span>{n}</span></label>)}</div>{value&&!/^(?:[1-9]|10|N\/A)$/.test(value)&&<small>Respuesta anterior conservada: {value}</small>}</fieldset>;
 return <div className={styles.field} style={{'--field-span':campo.span??6} as React.CSSProperties}>
  <div className={fields.label}><label htmlFor={id}>{campo.label}</label>{dictable&&<VoiceInputButton compact value={value} onChange={onChange}/>}</div>
  {campo.options?<select id={id} value={value} disabled={disabled} onChange={e=>onChange(e.target.value)}><option value="">Seleccionar…</option>{value&&!campo.options.includes(value)&&<option value={value}>{value} (registro anterior)</option>}{campo.options.map(v=><option key={v}>{v}</option>)}</select>
   :campo.type==='textarea'?<textarea id={id} rows={4} value={value} placeholder={placeholder ?? EJEMPLOS_ETAPA[campo.key]} onChange={e=>onChange(e.target.value)} disabled={disabled}/>
   :<input id={id} type={campo.type??'text'} value={value} placeholder={dictable?EJEMPLOS_ETAPA[campo.key]:undefined} onChange={e=>onChange(e.target.value)} disabled={disabled}/>}
 </div>;
}

export function EtapaCampos({tipo,datos,onChange,disabled=false,compact=false,contexto,onVinculo,puedeDecidir=false,ocultarDecision=false,scopeKey,fuenteReclamo}:{tipo:TipoDocumento;datos:Record<string,unknown>;onChange:(d:Record<string,unknown>)=>void;disabled?:boolean;compact?:boolean;contexto?:ContextoCamposInforme|null;onVinculo?:(key:string,id:string)=>void;puedeDecidir?:boolean;ocultarDecision?:boolean;scopeKey?:string;fuenteReclamo?:FuenteActividad}) {
 const etapa=ETAPAS_OT.find(s=>s.tipo===tipo)!;
 const key=claveEtapa(tipo), values=(datos[key]??{}) as Record<string,string>;
 const [errorPlan,setErrorPlan]=useState('');
 const set=(k:string,v:string)=>onChange({...datos,...(tipo==='relevamiento'&&!disabled?{itemsAlcance:((datos.itemsAlcance??[]) as ItemAlcance[]).map(i=>datosActividadFuente(i,fuenteReclamo))}:{}),[key]:{...values,[k]:v}});
 const itemKey=tipo==='relevamiento'?'itemsAlcance':tipo==='avance'?'itemsAvance':'itemsCierre';
 const rawItems=(Array.isArray(datos[itemKey])?datos[itemKey]:[]) as Record<string,string>[];
 const items=tipo==='relevamiento'&&!disabled?rawItems.map(i=>datosActividadFuente(i as unknown as ItemAlcance,fuenteReclamo) as unknown as Record<string,string>):rawItems;
 const setItems=(next:Record<string,string>[])=>{try{if(tipo!=='relevamiento'){onChange({...datos,[itemKey]:next});return;}const result=actualizarActividades(values.cronogramaJSON,next as unknown as ItemAlcance[],fuenteReclamo,values.inicioPrevisto);onChange({...datos,itemsAlcance:result.actividades,[key]:{...values,...(result.json!==undefined?{cronogramaJSON:result.json}:{}),...(result.periodo?{inicioPrevisto:result.periodo.inicio,finPrevisto:result.periodo.fin}:{})}});setErrorPlan('');}catch(e){setErrorPlan((e as Error).message);}};
 let periodoPlan:{inicio:string;fin:string}|null=null;try{if(tipo==='relevamiento'){const c=leerCronograma(values.cronogramaJSON);if(c&&!disabled&&c.unificado)periodoPlan=periodoCronograma(c);}}catch{/* Incomplete draft is explained by the save validator. */}
 const faltantesReclamo=fuenteReclamo?[...(!fuenteReclamo.rubro.trim()?['rubro']:[]),]:[];

 const itemFields:CampoEtapa[]=tipo==='relevamiento'?[text('trabajo','Actividad',6),text('rubro','Rubro del reclamo',3),text('contratista','Contratista del plan',3),text('criterio','Criterio para dar la actividad por terminada',12)]:tipo==='avance'?[text('previsto','Trabajo previsto',12),text('realizado','Realizado en este período'),text('saldo','Saldo pendiente')]:[text('trabajo','Trabajo'),text('criterio','Criterio'),text('resultado','Resultado'),text('verificadorFecha','Verificador y fecha')];
 const alcanceHeredado=tipo==='avance'||tipo==='cierre';
 const itemEditor=<div className={styles.items}>{alcanceHeredado&&<p className={styles.note}>Actividades y criterios del plan referenciado. Completá sus resultados; el alcance se corrige en Relevamiento.</p>}{items.map((item,i)=><fieldset key={item.id} className={styles.item}><legend>{item.id}</legend><div className={styles.grid}>{itemFields.map(f=><Campo key={f.key} campo={f} value={item[f.key]??''} disabled={disabled} readOnly={alcanceHeredado&&['previsto','trabajo','criterio'].includes(f.key)||tipo==='relevamiento'&&['rubro','contratista'].includes(f.key)} onChange={v=>setItems(items.map((it,j)=>i===j?{...it,[f.key]:v}:it))}/>)}</div>{!alcanceHeredado&&<button type="button" className={styles.button} disabled={disabled} onClick={()=>setItems(items.filter((_,j)=>j!==i))}>Quitar actividad {item.id}</button>}</fieldset>)}{!alcanceHeredado&&<button type="button" className={styles.button} disabled={disabled||items.length>=100} onClick={()=>{let n=1;while(items.some(i=>i.id===`A-${String(n).padStart(2,'0')}`))n++;setItems([...items,{id:`A-${String(n).padStart(2,'0')}`,...Object.fromEntries(itemFields.map(f=>[f.key,'']))}])}}>+ Agregar actividad</button>}{errorPlan&&<p role="alert" className={styles.note}>{errorPlan}</p>}</div>;
 const grupos:GrupoEtapa[] = compact && tipo==='relevamiento' ? [
  {...etapa.groups[0],title:'1 · Hallazgo y diagnóstico'},
  {title:'2 · Plan de trabajo y cronograma',fields:[...etapa.groups[1].fields,...etapa.groups[2].fields]},
  {...etapa.groups[3],title:'3 · Cobertura y decisión'},
 ] : etapa.groups;
 const renderCampo=(f:CampoEtapa)=>{
  if(tipo==='acta'&&(ocultarDecision||!!values.conformidadJSON)&&['receptor','cargo','decisionPreparada','decisionReferencia','observacionesCliente','reservas'].includes(f.key))return null;
  const vinculo=CAMPOS_VINCULADOS[tipo]?.[f.key];
  if(vinculo&&contexto&&onVinculo&&!disabled){const options=contexto.opciones[vinculo]??[];return <div key={f.key} className={styles.field} style={{'--field-span':f.span??6} as React.CSSProperties}><span className={styles.inheritedLabel}>{f.label}</span><SelectorBusqueda label={f.label} opciones={options} value={options.find(o=>o.id===contexto.vinculos[vinculo])} onSeleccionar={id=>onVinculo(vinculo,id)} placeholder="Seleccioná un registro vinculado…"/></div>;}
  const field=f.key==='decisionAlcance'&&!puedeDecidir?{...f,options:f.options?.filter(v=>v!=='Aprobado con referencia')}:f;
  const readOnly=CAMPOS_HEREDADOS[tipo].includes(f.key)||(f.key==='decisionGarantia'&&!puedeDecidir)||!!(periodoPlan&&['inicioPrevisto','finPrevisto'].includes(f.key));
  return <Campo key={f.key} campo={compact&&tipo==='relevamiento'&&f.key==='alcance'?{...field,label:'Plan de trabajo propuesto',span:12}:field} value={periodoPlan&&f.key==='inicioPrevisto'?periodoPlan.inicio:periodoPlan&&f.key==='finPrevisto'?periodoPlan.fin:values[f.key]??''} onChange={v=>set(f.key,v)} disabled={disabled} readOnly={readOnly}/>;
 };
 const contenidoGrupo=(g:GrupoEtapa,index:number)=>{
  const principal=compact&&tipo==='relevamiento' ? (index===0?['hallazgos','pruebas']:index===1?['alcance','inicioPrevisto','finPrevisto','decisionAlcance']:g.fields.map(f=>f.key)) : g.fields.map(f=>f.key);
  const extras=g.fields.filter(f=>!principal.includes(f.key));
  return <>
   {tipo === 'encuesta' && g.title === 'Tu experiencia' && <p className={styles.note}>1 = valoración mínima · 10 = máxima · N/A = no corresponde</p>}
   {compact&&tipo==='relevamiento'&&index===0&&<div className={styles.grid}><Campo campo={{key:'observaciones',label:'Diagnóstico inicial y fundamento',type:'textarea',span:12}} value={String(datos.observaciones??'')} placeholder="Ej.: fisura visible en el encuentro del muro; se requiere verificar el sustrato antes de intervenir." onChange={v=>onChange({...datos,observaciones:v})} disabled={disabled}/></div>}
   <div className={styles.grid}>{g.fields.filter(f=>principal.includes(f.key)).map(renderCampo)}</div>
   {tipo==='relevamiento'&&((compact&&index===1)||(!compact&&g.title==='Plan de trabajo'))&&<>{!disabled&&faltantesReclamo.length>0&&<p className={styles.note} role="status">Datos por completar en el reclamo: {faltantesReclamo.join(' y ')}. Completalos en Datos de la OT para incorporarlos al plan de trabajo.</p>}{itemEditor}<CronogramaRelevamiento key={scopeKey} valor={values.cronogramaJSON} inicio={values.inicioPrevisto} limite={values.fechaLimitePrevista??''} actividades={items as unknown as ItemAlcance[]} fuente={fuenteReclamo} disabled={disabled} onChange={(json,periodo,actividades,limite)=>onChange({...datos,itemsAlcance:actividades,[key]:{...values,cronogramaJSON:json,fechaLimitePrevista:limite,...(periodo?{inicioPrevisto:periodo.inicio,finPrevisto:periodo.fin}:{inicioPrevisto:'',finPrevisto:''})}})}/></>}
   {extras.length>0&&<details className={styles.legacy}><summary>{index===0?'Antecedentes, condiciones y referencias':'Actividades, criterios y condiciones'}</summary><div className={styles.grid}>{extras.map(renderCampo)}</div></details>}
   {tipo==='visita'&&g.title.startsWith('2')&&values.horaLlegada&&values.horaInicio&&<p className={styles.note}>Espera hasta el inicio: {espera(values.horaLlegada,values.horaInicio)}</p>}

  </>;
 };
 return <div className={`${styles.fields} ${compact?styles.reportEditor:''}`} data-tipo={tipo} data-report-section="texto">
  <p className={styles.note}>Los datos heredados se consultan aquí y se corrigen en su fuente. Los textos propios se completan en esta versión.</p>
  {tipo==='encuesta'&&<p className={styles.note}>Transcribí únicamente respuestas del cliente e indicá su procedencia. La encuesta no acredita firma ni autoría verificada.</p>}
  {tipo==='acta'&&<p className={styles.note}>La decisión y las reservas deben provenir del receptor. Indicá su referencia; este registro no reemplaza su firma.</p>}
  {['avance','cierre'].includes(tipo)&&!values.alcanceReferencia&&<p className={styles.note}>Sin plan aprobado vinculado. Registrá su aprobación en Relevamiento para heredar actividades y criterios.</p>}
  {grupos.map((g,i)=>compact?<details key={g.title} className={styles.editorGroup} open={i===0&&tipo!=='acta'}><summary>{g.title}</summary><div className={styles.editorGroupBody}>{contenidoGrupo(g,i)}</div></details>:<fieldset key={g.title} className={styles.group}><legend>{g.title}</legend>{contenidoGrupo(g,i)}</fieldset>)}
  {['avance','cierre'].includes(tipo)&&itemEditor}
  {['orden_servicio','relevamiento','avance','cierre'].includes(tipo)&&!(compact&&tipo==='relevamiento')&&<div className={styles.grid}><Campo campo={{key:'observaciones',label:tipo==='orden_servicio'?'Aclaración posterior de la solicitud':tipo==='relevamiento'?'Diagnóstico y fundamento':tipo==='avance'?'Trabajos ejecutados en el período':'Síntesis del resultado técnico',type:'textarea',span:12}} value={String(datos.observaciones??'')} onChange={v=>onChange({...datos,observaciones:v})} disabled={disabled}/></div>}

  {tipo==='acta'&&<div className={styles.legal}><strong>Constancia de recepción y alcance de la conformidad</strong><p>{TEXTO_ACTA}</p><small>Texto sujeto a revisión jurídica de BBC. Las firmas se registran en «Ver acta → Firmas» y corresponden a esa versión exacta.</small></div>}
  {tipo==='encuesta'&&<details className={styles.legacy}><summary>Otros datos de encuestas anteriores</summary><div className={styles.grid}>{[['satisfaccionGeneral','Satisfacción general'],['resolucion','Resolución'],['comunicacion','Comunicación'],['expectativas','Expectativas']].map(([k,l])=><Campo key={k} campo={text(k,l)} value={values[k]??''} onChange={v=>set(k,v)} disabled={disabled}/>)}</div></details>}
 </div>;
}
const text=(key:string,label:string,span:CampoEtapa['span']=6):CampoEtapa=>({key,label,span});
function espera(llegada:string,inicio:string){const minutos=(t:string)=>Number(t.slice(0,2))*60+Number(t.slice(3,5));const n=minutos(inicio)-minutos(llegada);return n<0?'Revisar horarios':`${n} min`}
