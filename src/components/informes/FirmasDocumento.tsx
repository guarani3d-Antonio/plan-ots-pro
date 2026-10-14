import { useEffect, useRef, useState, useId } from 'react';
import { createPortal } from 'react-dom';
import SignaturePad from 'signature_pad';
import { CATEGORIAS_FIRMA, firmaPngValida, type EspacioFirma, type FirmaDocumento } from '../../services/documentSignatureModel';
import type { RevisionDocumento } from '../../services/documentService';
import styles from './FirmasDocumento.module.css';
interface Props {
 espacios:EspacioFirma[];firmas:FirmaDocumento[];revision?:RevisionDocumento;codigo?:string;
 editable:boolean;puedeFirmar:boolean;cargando:boolean;error:string|null;compact?:boolean;confirmacion?:(espacio:EspacioFirma)=>string|undefined;
 onChange:(espacios:EspacioFirma[])=>void;onFirmar:(espacio:string,imagen:string,solicitud:string)=>Promise<void>;onActualizar:()=>void;
}
export function FirmasDocumento(p:Props){
 const instance=useId();
 const [picker,setPicker]=useState(false),[query,setQuery]=useState('');
 const [slot,setSlot]=useState<EspacioFirma|null>(null),[sending,setSending]=useState(false),[error,setError]=useState<string|null>(null),[consent,setConsent]=useState(false),[drawn,setDrawn]=useState(false);
 const canvas=useRef<HTMLCanvasElement>(null),pad=useRef<SignaturePad|null>(null),request=useRef<{image:string;id:string}|null>(null),dialog=useRef<HTMLDivElement>(null);
 useEffect(()=>{
  if(!slot||!canvas.current)return;
  const c=canvas.current;const ink=getComputedStyle(c).color;
  const s=new SignaturePad(c,{penColor:ink,minWidth:1,maxWidth:2.4,minDistance:1});pad.current=s;
  let width=0,height=0;
  const resize=()=>{const rect=c.getBoundingClientRect();if(!rect.width||!rect.height)return;const data=s.toData();const ratio=Math.min(window.devicePixelRatio||1,2);c.width=Math.round(rect.width*ratio);c.height=Math.round(rect.height*ratio);c.getContext('2d')?.scale(ratio,ratio);s.clear();if(width&&height&&data.length)s.fromData(data.map(g=>({...g,points:g.points.map(v=>({...v,x:v.x*rect.width/width,y:v.y*rect.height/height}))})));width=rect.width;height=rect.height;};
  resize();const observer=new ResizeObserver(resize);observer.observe(c);
  const end=()=>{setDrawn(s.toData().some(g=>g.points.length>=2));request.current=null;};s.addEventListener('endStroke',end);
  return()=>{observer.disconnect();s.off();pad.current=null;};
 },[slot]);
 useEffect(()=>{if(!slot&&!picker)return;const prev=document.activeElement as HTMLElement|null;dialog.current?.querySelector<HTMLElement>('input,button')?.focus();const key=(e:KeyboardEvent)=>{if(e.key==='Escape'&&!sending){setSlot(null);setPicker(false);}if(e.key==='Tab'&&dialog.current){const nodes=Array.from(dialog.current.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled)'));const first=nodes[0],last=nodes.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}};document.addEventListener('keydown',key);return()=>{document.removeEventListener('keydown',key);prev?.focus();};},[slot,picker,sending]);
 // A changed document/revision dismisses a capture; it can never be posted to a different version.
 useEffect(()=>{setSlot(null);setPicker(false);setError(null);request.current=null;},[p.revision?.id,p.codigo]);
 const open=(s:EspacioFirma)=>{setSlot(s);setConsent(false);setDrawn(false);setError(null);request.current=null;};
 const save=async()=>{
  if(!slot||!pad.current||!consent||!drawn||sending)return;
  const image=pad.current.toDataURL('image/png');if(!firmaPngValida(image)){setError('La firma supera el tamaño permitido. Borrá y volvé a dibujarla.');return;}
  const attempt=request.current?.image===image?request.current:{image,id:crypto.randomUUID()};request.current=attempt;
  setSending(true);setError(null);
  try{await p.onFirmar(slot.id,image,attempt.id);setSlot(null);}catch(e){setError(e instanceof Error?e.message:'No se pudo registrar la firma. El trazo se conserva para reintentar.');}finally{setSending(false);}
 };
 const normalize=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 return <section aria-label="Firmas del documento" className={p.compact?styles.compact:undefined}>
  <div className={styles.heading}><h3>Firmantes del documento</h3><span className={styles.status}>{p.espacios.length} de 4 espacios</span></div>
  <p className={styles.note}>{p.editable?'Configurá los espacios y guardá la versión antes de firmar. Las categorías pueden repetirse.':p.revision?'Las firmas quedan vinculadas a esta versión. Una versión corregida requiere nuevas firmas.':'Esta versión anterior no tiene espacios configurados. Creá una versión corregida para agregarlos.'}</p>
  {p.error&&<p role="alert" className={styles.error}>{p.error}</p>}
  <div className={styles.cards}>{p.espacios.map((s,i)=>{
   const f=p.firmas.find(f=>f.espacio_id===s.id&&f.revision_id===p.revision?.id&&f.contenido_sha256===p.revision?.contenido_sha256);
   return <div key={s.id} className={styles.card}><div className={styles.row}><label htmlFor={'signature-'+instance+'-'+s.id}>Firmante {i+1}</label>{p.editable&&<button type="button" className={styles.remove} aria-label={`Quitar firmante ${i+1}`} onClick={()=>p.onChange(p.espacios.filter(v=>v.id!==s.id))}>×</button>}</div>
    <select id={'signature-'+instance+'-'+s.id} value={s.categoria} disabled={!p.editable} onChange={e=>p.onChange(p.espacios.map(v=>v.id===s.id?{...v,categoria:e.target.value as EspacioFirma['categoria']}:v))}>{CATEGORIAS_FIRMA.map(r=><option key={r}>{r}</option>)}</select>
    <div className={styles.box}>{f&&<img src={f.imagen_png} alt={`Firma manuscrita: ${s.categoria}`}/>}<div className={styles.line}/><span>{s.categoria}</span></div>
    {f?<div className={styles.status}>Firma registrada · {new Date(f.registrada_en).toLocaleString('es-PY')}</div>:<button type="button" className={styles.button} disabled={!p.puedeFirmar||p.cargando||sending} onClick={()=>open(s)}>Firmar</button>}
   </div>;
  })}</div>
  <div className={styles.actions}>{p.editable&&<button type="button" className={styles.button} disabled={p.espacios.length>=4} onClick={()=>{setQuery('');setPicker(true);}}>+ Agregar firma</button>}{p.revision&&<button type="button" className={styles.button} disabled={p.cargando||sending} onClick={p.onActualizar}>Actualizar firmas</button>}</div>
  {p.revision&&<div className={styles.binding}>{p.codigo} · versión {p.revision.borrador_version} · {p.firmas.length} firma(s) registrada(s)</div>}
  {(picker||slot)&&createPortal(<div className={styles.shade}><div ref={dialog} className={styles.dialog} role="dialog" aria-modal="true" aria-label={picker?'Agregar firmante':`Firma de ${slot?.categoria}`}>
   {picker?<><h3>Agregar firmante</h3><input className={styles.search} value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar categoría…" aria-label="Buscar categoría de firmante"/><div className={styles.options}>{CATEGORIAS_FIRMA.filter(r=>normalize(r).includes(normalize(query))).map(r=><button type="button" className={styles.button} key={r} onClick={()=>{if(p.espacios.length<4)p.onChange([...p.espacios,{id:crypto.randomUUID(),categoria:r}]);setPicker(false);}}>{r}</button>)}</div><div className={styles.actions}><button type="button" className={styles.button} onClick={()=>setPicker(false)}>Cancelar</button></div></>:<>
    <h3>Firma de {slot?.categoria}</h3><p className={styles.binding}>{p.codigo} · versión {p.revision?.borrador_version}. Firmá con el dedo o el mouse.</p>
    <canvas ref={canvas} className={styles.canvas} aria-label="Área para dibujar la firma" aria-disabled={sending}/>
    <label className={styles.check}><input type="checkbox" checked={consent} disabled={sending} onChange={e=>setConsent(e.target.checked)}/>{slot&&p.confirmacion?.(slot)||'Confirmo que esta es mi firma y que corresponde al documento y versión indicados.'}</label>
    {error&&<p className={styles.error} role="alert">{error}</p>}
    <div className={styles.actions}><button type="button" className={styles.button} disabled={sending} onClick={()=>{pad.current?.clear();setDrawn(false);request.current=null;}}>Borrar trazo</button><span className={styles.spacer}/><button type="button" className={styles.button} disabled={sending} onClick={()=>setSlot(null)}>Cancelar</button><button type="button" className={`${styles.button} ${styles.primary}`} disabled={sending||!drawn||!consent} onClick={()=>void save()}>{sending?'Registrando…':'Registrar mi firma'}</button></div>
   </>}
  </div></div>,document.body)}
 </section>;
}
