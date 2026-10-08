import { useEffect, useState } from 'react';
import { supabase } from '../../db/supabase';
import { assertSession, sessionTicket } from '../../security/sessionScope';
import { fichaObra, type FichaObra, type ContactoObra } from '../../services/workDirectoryService';
import { guardarFotoDirectorio } from '../../services/directoryPhotoService';
import { useAccessStore } from '../../stores/accessStore';
import { DialogDirectorioOT } from './DialogDirectorioOT';
import { FotoDirectorio } from './FotoDirectorio';
import { VoiceInputButton } from '../ui/VoiceInputButton';
import {EtiquetaObra} from '../ui/ColorObra';
import styles from './FichaDirectorio.module.css';

const empty={nombre:'',cargo:'',telefono:'',correo:''};
export function FichaObraOT({proyectoId,puedeGestionar=false,tenantId,onActualizar}:{proyectoId:string;puedeGestionar?:boolean;tenantId?:string|null;onActualizar?:()=>void}) {
 const creador=useAccessStore(s=>s.contexto?.creador??false);
 const [ficha,setFicha]=useState<FichaObra|null>(null),[error,setError]=useState(''),[version,setVersion]=useState(0);
 const [dialog,setDialog]=useState<'ficha'|'contacto'|'obra'|null>(null),[contactoId,setContactoId]=useState<string|null>(null);
 const [datos,setDatos]=useState(empty),[obra,setObra]=useState({nombre:'',direccion:''}),[foto,setFoto]=useState<File|null>(null),[busy,setBusy]=useState(false),[texto,setTexto]=useState('');
 useEffect(()=>{let active=true;void fichaObra(proyectoId).then(f=>{if(active){setFicha(f);setError('')}}).catch(e=>{if(active){setFicha(null);setError(e.message)}});return()=>{active=false}},[proyectoId,version]);
 function editar(c?:ContactoObra){if(!puedeGestionar)return;setContactoId(c?.id??null);setDatos(c?{nombre:c.nombre,cargo:c.cargo??'',telefono:c.telefono??'',correo:c.correo??''}:empty);setError('');setDialog('contacto')}
 async function guardar(){
  if(busy||!datos.nombre.trim()||!puedeGestionar)return;
  if(datos.correo&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(datos.correo)){setError('Revisá el correo del contacto.');return}
  setBusy(true);setError('');
  try{const ticket=sessionTicket();const result=await supabase.rpc('plan_guardar_contacto_obra',{p_proyecto:proyectoId,p_id:contactoId,p_nombre:datos.nombre,p_cargo:datos.cargo,p_telefono:datos.telefono,p_correo:datos.correo});assertSession(ticket);if(result.error)throw new Error(result.error.message);setDialog('ficha');setVersion(v=>v+1)}
  catch(e){setError(e instanceof Error?e.message:'No se pudo guardar.')}finally{setBusy(false)}
 }
 async function guardarObra(){
  if(busy||!obra.nombre.trim()||!tenantId||!ficha||!useAccessStore.getState().contexto?.creador)return;
  setBusy(true);setError('');
  try{const ticket=sessionTicket();const result=await supabase.rpc('plan_guardar_ficha_obra',{p_tenant:tenantId,p_obra:ficha.id,p_nombre:obra.nombre,p_direccion:obra.direccion});assertSession(ticket);if(result.error)throw new Error(result.error.message);
   setVersion(v=>v+1);
   if(foto){try{await guardarFotoDirectorio('obra',ficha.id,foto)}catch(e){setError('La obra se guardó, pero la foto no: '+(e instanceof Error?e.message:'Reintentá.'));return;}}
   setFoto(null);setDialog('ficha');onActualizar?.();
  }catch(e){setError(e instanceof Error?e.message:'No se pudo guardar.')}finally{setBusy(false)}
 }
 const norm=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 const items=ficha?.contactos.filter(c=>norm(c.nombre+' '+(c.cargo??'')+' '+(c.telefono??'')).includes(norm(texto)))??[];
 const contacts=(rows:ContactoObra[],editable=false)=>rows.map(c=><div key={c.id} className={styles.contact}><dl className={styles.grid}><div><dt>Contacto de la obra</dt><dd>{c.nombre}</dd></div><div><dt>Cargo / función</dt><dd>{c.cargo||'Sin registrar'}</dd></div><div><dt>Teléfono</dt><dd>{c.telefono||'Sin registrar'}</dd></div><div><dt>Correo</dt><dd>{c.correo||'Sin registrar'}</dd></div></dl>{editable&&<div className={styles.actions}><button type="button" className={styles.button} disabled={!puedeGestionar||busy} onClick={()=>editar(c)}>Editar contacto</button></div>}</div>);
 const identity=<><FotoDirectorio tipo="obra" id={ficha?.id} nombre={ficha?.nombre??'Obra'}/><div className={styles.name}><h3>{ficha?<EtiquetaObra nombre={ficha.nombre} color={ficha.color}/>:'Cargando ficha…'}</h3><p className={styles.muted}>{ficha?.direccion||'Dirección sin registrar'}</p></div></>;
 return <><div className={styles.sheet}>
  <div className={styles.identity}>{identity}<div className={styles.actions}><button type="button" className={styles.button} disabled={!ficha} onClick={()=>setDialog('ficha')}>Ver ficha de la obra</button></div></div>
  {contacts(ficha?.contactos??[])}{ficha&&!ficha.contactos.length&&<p className={styles.muted}>Sin contactos de obra registrados.</p>}
 </div>{error&&!dialog&&<p role="alert">{error}</p>}
 {dialog&&<DialogDirectorioOT titulo={dialog==='ficha'?'Ficha de la obra':dialog==='obra'?'Editar ficha de obra':contactoId?'Editar contacto de la obra':'Nuevo contacto de la obra'} busy={busy} onCerrar={()=>setDialog(null)}>
  {dialog==='ficha'?<div className={styles.sheet}><div className={styles.identity}>{identity}</div><div className={styles.actions}><button type="button" className={styles.button} disabled={!creador||!tenantId||!ficha||busy} onClick={()=>{if(ficha){setObra({nombre:ficha.nombre,direccion:ficha.direccion??''});setFoto(null);setError('');setDialog('obra')}}}>Editar obra y foto</button><button type="button" className={styles.button} disabled={!puedeGestionar||!ficha||busy} onClick={()=>editar()}>+ Nuevo contacto</button></div><label className={styles.search}>Buscar contacto de la obra<input type="search" value={texto} onChange={e=>setTexto(e.target.value)} placeholder="Nombre, cargo o teléfono…"/></label>{contacts(items,true)}{ficha&&!items.length&&<p className={styles.muted}>{texto?'No hay coincidencias.':'Sin contactos de obra registrados.'}</p>}</div>:
   dialog==='obra'?<><p className={styles.status}>Los datos y la foto se actualizan en el registro compartido de Creador.</p><FotoDirectorio tipo="obra" id={ficha?.id} nombre={obra.nombre} archivo={foto} onArchivo={setFoto} disabled={busy}/><fieldset disabled={busy} style={{border:0,padding:0,margin:0,minWidth:0}}><div className={styles.editGrid}>{(['nombre','direccion'] as const).map(key=><label key={key} className={styles.field}><span className={styles.label}>{key==='nombre'?'Nombre de la obra':'Dirección'}<VoiceInputButton compact value={obra[key]} maxLength={key==='nombre'?180:500} onChange={v=>setObra(d=>({...d,[key]:v}))}/></span><input aria-label={key==='nombre'?'Nombre de la obra':'Dirección'} value={obra[key]} maxLength={key==='nombre'?180:500} onChange={e=>setObra(d=>({...d,[key]:e.target.value}))}/></label>)}</div></fieldset><div className={styles.actions}><button type="button" className={styles.button} disabled={busy||!obra.nombre.trim()} onClick={()=>void guardarObra()}>{busy?'Guardando…':'Guardar ficha'}</button><button type="button" className={styles.button} disabled={busy} onClick={()=>setDialog('ficha')}>Cancelar</button></div></>:
   <><p className={styles.status}>Contacto del inmueble. Este registro no crea una cuenta ni asigna permisos.</p><fieldset disabled={busy} style={{border:0,padding:0,margin:0,minWidth:0}}><div className={styles.editGrid}>{([['nombre','Nombre',160],['cargo','Cargo / función',160],['telefono','Teléfono',80],['correo','Correo',254]] as const).map(([key,label,max])=><label key={key} className={styles.field}><span className={styles.label}>{label}<VoiceInputButton compact value={datos[key]} maxLength={max} onChange={v=>setDatos(d=>({...d,[key]:v}))}/></span><input aria-label={label} type={key==='correo'?'email':key==='telefono'?'tel':'text'} value={datos[key]} maxLength={max} onChange={e=>setDatos(d=>({...d,[key]:e.target.value}))}/></label>)}</div></fieldset><div className={styles.actions}><button type="button" className={styles.button} disabled={busy||!datos.nombre.trim()} onClick={()=>void guardar()}>{busy?'Guardando…':'Guardar contacto'}</button><button type="button" className={styles.button} disabled={busy} onClick={()=>setDialog('ficha')}>Cancelar</button></div></>}
  {error&&<p role="alert">{error}</p>}
 </DialogDirectorioOT>}</>;
}
