import { useId } from 'react';
import type { TipoDocumento } from '../../services/documentService';
import { ETAPAS_OT, TEXTO_ACTA, claveEtapa, type CampoEtapa } from '../../services/otStageSchema';
import { VoiceInputButton } from '../ui/VoiceInputButton';
import { EJEMPLOS_ETAPA } from '../../services/otStageExamples';
import styles from './EtapasOT.module.css';

function Campo({campo,value,onChange,disabled}:{campo:CampoEtapa;value:string;onChange:(v:string)=>void;disabled?:boolean}) {
 const id=useId();
 const dictable=!campo.options&&!['date','time','datetime-local','scale'].includes(campo.type??'text');
 if(campo.type==='scale')return <fieldset className={styles.scaleField}><legend>{campo.label}</legend><div className={styles.scale}>{[...Array.from({length:10},(_,i)=>String(i+1)),'N/A'].map(n=><label key={n} className={styles.rating}><input type="radio" name={id} value={n} checked={value===n} disabled={disabled} onChange={()=>onChange(n)}/><span>{n}</span></label>)}</div>{value&&!/^(?:[1-9]|10|N\/A)$/.test(value)&&<small>Respuesta anterior conservada: {value}</small>}</fieldset>;
 return <div className={styles.field} style={{'--field-span':campo.span??6} as React.CSSProperties}>
  <div className={styles.labelRow}><label htmlFor={id}>{campo.label}</label>{dictable&&<VoiceInputButton compact value={value} onChange={onChange} disabled={disabled}/>}</div>
  {campo.options?<select id={id} value={value} disabled={disabled} onChange={e=>onChange(e.target.value)}><option value="">Seleccionar…</option>{value&&!campo.options.includes(value)&&<option value={value}>{value} (registro anterior)</option>}{campo.options.map(v=><option key={v}>{v}</option>)}</select>
   :campo.type==='textarea'?<textarea id={id} rows={4} value={value} placeholder={EJEMPLOS_ETAPA[campo.key]} onChange={e=>onChange(e.target.value)} disabled={disabled}/>
   :<input id={id} type={campo.type??'text'} value={value} placeholder={dictable?EJEMPLOS_ETAPA[campo.key]:undefined} onChange={e=>onChange(e.target.value)} disabled={disabled}/>}
 </div>;
}

export function EtapaCampos({tipo,datos,onChange,disabled=false}:{tipo:TipoDocumento;datos:Record<string,unknown>;onChange:(d:Record<string,unknown>)=>void;disabled?:boolean}) {
 const etapa=ETAPAS_OT.find(s=>s.tipo===tipo)!;
 const key=claveEtapa(tipo), values=(datos[key]??{}) as Record<string,string>;
 const set=(k:string,v:string)=>onChange({...datos,[key]:{...values,[k]:v}});
 const itemKey=tipo==='relevamiento'?'itemsAlcance':tipo==='avance'?'itemsAvance':'itemsCierre';
 const items=(Array.isArray(datos[itemKey])?datos[itemKey]:[]) as Record<string,string>[];
 const itemFields:CampoEtapa[]=tipo==='relevamiento'?[text('trabajo','Actividad',6),text('rubro','Rubro',3),text('profesional','Profesional / especialidad',3),text('criterio','Criterio para dar la actividad por terminada',12)]:tipo==='avance'?[text('previsto','Trabajo previsto',12),text('realizado','Realizado en este período'),text('saldo','Saldo pendiente')]:[text('trabajo','Trabajo'),text('criterio','Criterio'),text('resultado','Resultado'),text('verificadorFecha','Verificador y fecha')];
 const itemEditor=<div className={styles.items}>{items.map((item,i)=><fieldset key={item.id} className={styles.item}><legend>{item.id}</legend><div className={styles.grid}>{itemFields.map(f=><Campo key={f.key} campo={f} value={item[f.key]??''} disabled={disabled} onChange={v=>onChange({...datos,[itemKey]:items.map((it,j)=>i===j?{...it,[f.key]:v}:it)})}/>)}</div><button type="button" className={styles.button} disabled={disabled} onClick={()=>onChange({...datos,[itemKey]:items.filter((_,j)=>j!==i)})}>Quitar actividad {item.id}</button></fieldset>)}<button type="button" className={styles.button} disabled={disabled||items.length>=100} onClick={()=>{let n=1;while(items.some(i=>i.id===`A-${String(n).padStart(2,'0')}`))n++;onChange({...datos,[itemKey]:[...items,{id:`A-${String(n).padStart(2,'0')}`,...Object.fromEntries(itemFields.map(f=>[f.key,'']))}]})}}>+ Agregar actividad</button></div>;
 return <div className={styles.fields} data-report-section="texto">
  {etapa.groups.map(g=><fieldset key={g.title} className={styles.group}><legend>{g.title}</legend>{tipo === 'encuesta' && g.title === 'Tu experiencia' && <p className={styles.note}>1 = valoración mínima · 10 = máxima · N/A = no corresponde</p>}<div className={styles.grid}>{g.fields.map(f=><Campo key={f.key} campo={f} value={values[f.key]??''} onChange={v=>set(f.key,v)} disabled={disabled}/>)}</div>
   {tipo==='visita'&&g.title.startsWith('2')&&values.horaLlegada&&values.horaInicio&&<p className={styles.note}>Espera hasta el inicio: {espera(values.horaLlegada,values.horaInicio)}</p>}
   {tipo==='relevamiento'&&g.title==='Plan de trabajo'&&itemEditor}
  </fieldset>)}
  {['avance','cierre'].includes(tipo)&&itemEditor}
  {['orden_servicio','relevamiento','avance','cierre'].includes(tipo)&&<div className={styles.grid}><Campo campo={{key:'observaciones',label:tipo==='orden_servicio'?'Aclaración posterior de la solicitud':tipo==='relevamiento'?'Diagnóstico y fundamento':tipo==='avance'?'Trabajos ejecutados en el período':'Síntesis del resultado técnico',type:'textarea',span:12}} value={String(datos.observaciones??'')} onChange={v=>onChange({...datos,observaciones:v})} disabled={disabled}/></div>}
  {tipo==='relevamiento'&&<div className={styles.actions}><button type="button" className={styles.button} disabled>Gantt por etapas · futuro</button><button type="button" className={styles.button} disabled>Presupuesto · futuro</button></div>}
  {tipo==='acta'&&<div className={styles.legal}><strong>Constancia de recepción y alcance de la conformidad</strong><p>{TEXTO_ACTA}</p><small>Texto sujeto a revisión jurídica de BBC. La firma corresponde a la revisión exacta presentada.</small><div className={styles.signatures}><span>Firma del cliente o representante<br/>Nombre, documento, carácter, fecha y hora<br/>Pendiente de firma</span><span>Representante de la empresa<br/>Nombre, carácter, fecha y hora<br/>Pendiente de firma</span></div></div>}
  {tipo==='encuesta'&&<details className={styles.legacy}><summary>Otros datos de encuestas anteriores</summary><div className={styles.grid}>{[['satisfaccionGeneral','Satisfacción general'],['resolucion','Resolución'],['comunicacion','Comunicación'],['expectativas','Expectativas']].map(([k,l])=><Campo key={k} campo={text(k,l)} value={values[k]??''} onChange={v=>set(k,v)} disabled={disabled}/>)}</div></details>}
 </div>;
}
const text=(key:string,label:string,span:CampoEtapa['span']=6):CampoEtapa=>({key,label,span});
function espera(llegada:string,inicio:string){const minutos=(t:string)=>Number(t.slice(0,2))*60+Number(t.slice(3,5));const n=minutos(inicio)-minutos(llegada);return n<0?'Revisar horarios':`${n} min`}
