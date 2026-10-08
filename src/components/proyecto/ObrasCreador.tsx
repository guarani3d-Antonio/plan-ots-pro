import { useEffect,useState } from 'react';
import { supabase } from '../../db/supabase';
import { assertSession,sessionTicket } from '../../security/sessionScope';
import { useAccessStore } from '../../stores/accessStore';
import { useProyectosStore } from '../../stores/proyectosStore';
import { type FichaObra,type ContactoObra } from '../../services/workDirectoryService';
import { PanelAdministracion } from './PanelAdministracion';
import { EliminarDirectorio } from './EliminarDirectorio';
import { FotoDirectorio } from '../plano/FotoDirectorio';
import { guardarFotoDirectorio } from '../../services/directoryPhotoService';
import { VoiceInputButton } from '../ui/VoiceInputButton';
import {SelectorColorObra,EtiquetaObra} from '../ui/ColorObra';
import {colorObra} from '../../utils/colorObra';
import styles from './AdministracionCreador.module.css';

const vacio=()=>({nombre:'',direccion:'',color:colorObra()});
const contactoVacio=()=>({nombre:'',cargo:'',telefono:'',correo:''});
const normalizar=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
export function ObrasCreador({tenantId,crearAbierto,onCerrarCrear}:{tenantId:string;crearAbierto:boolean;onCerrarCrear:()=>void}) {
 const [obras,setObras]=useState<FichaObra[]>([]),[texto,setTexto]=useState('');
 const [editar,setEditar]=useState<string|null>(null),[lectura,setLectura]=useState(false);
 const [foto,setFoto]=useState<File|null>(null),[datos,setDatos]=useState(vacio);
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[version,setVersion]=useState(0);
 const [contactoId,setContactoId]=useState(''),[contacto,setContacto]=useState(contactoVacio);
 const [mensaje,setMensaje]=useState('');
 useEffect(()=>{let active=true;const ticket=sessionTicket();void Promise.resolve(supabase.rpc('plan_directorio_obras',{p_tenant:tenantId})).then(({data,error})=>{
   assertSession(ticket);if(!active)return;if(error)throw new Error(error.message);setObras((data??[]) as FichaObra[]);
 }).catch(e=>{if(active){setObras([]);setError(e instanceof Error?e.message:'No se pudo cargar el directorio.')}});return()=>{active=false}},[tenantId,version]);
 const cerrar=()=>{setEditar(null);onCerrarCrear();setFoto(null);setError('');setMensaje('')};
 function abrir(w?:FichaObra,ver=false){setEditar(w?.id??'nueva');setDatos(w?{nombre:w.nombre,direccion:w.direccion??'',color:colorObra(w.color)}:vacio());setLectura(ver);setFoto(null);elegirContacto(w?.contactos[0]);setError('');setMensaje('')}
 async function guardar(){if(busy||lectura||!datos.nombre.trim())return;setBusy(true);setError('');try{
   const ticket=sessionTicket();const {data,error}=await supabase.rpc('plan_guardar_obra_completa',{p_tenant:tenantId,p_obra:editar==='nueva'?null:editar,p_nombre:datos.nombre,p_direccion:datos.direccion,p_color:datos.color,p_contacto:Object.values(contacto).some(v=>v.trim())?{...contacto,id:contactoId||null}:null});
   assertSession(ticket);if(error)throw new Error(error.message);const id=(data as {obra_id:string;contacto_id:string|null}).obra_id;setEditar(id);setContactoId(data.contacto_id??'');setVersion(v=>v+1);
   if(foto){try{await guardarFotoDirectorio('obra',id,foto)}catch(e){setError('La obra se guardó, pero la foto no: '+(e instanceof Error?e.message:'Reintentá.'));return;}}
   setFoto(null);onCerrarCrear();setMensaje('Obra guardada. Podés completar sus contactos.');
   await useProyectosStore.getState().cargarProyectos();await useAccessStore.getState().refresh();
 }catch(e){setError(e instanceof Error?e.message:'No se pudo guardar la obra.')}finally{setBusy(false)}}
 function elegirContacto(c?:ContactoObra){setContactoId(c?.id??'');setContacto(c?{nombre:c.nombre,cargo:c.cargo??'',telefono:c.telefono??'',correo:c.correo??''}:contactoVacio());setError('');setMensaje('')}
 async function guardarContacto(){if(busy||lectura||!editar||editar==='nueva'||!contacto.nombre.trim())return;setBusy(true);setError('');try{
   const ticket=sessionTicket();const r=await supabase.rpc('plan_guardar_contacto_obra',{p_proyecto:editar,p_id:contactoId||null,p_nombre:contacto.nombre,p_cargo:contacto.cargo,p_telefono:contacto.telefono,p_correo:contacto.correo});assertSession(ticket);if(r.error)throw new Error(r.error.message);setContactoId(String(r.data));setVersion(v=>v+1);setMensaje('Contacto guardado.');
 }catch(e){setError(e instanceof Error?e.message:'No se pudo guardar el contacto.')}finally{setBusy(false)}}
 const actual=obras.find(w=>w.id===editar);
 const resultados=obras.filter(w=>normalizar([w.nombre,w.direccion,...w.contactos.map(c=>`${c.nombre} ${c.telefono??''} ${c.correo??''}`)].join(' ')).includes(normalizar(texto)));
 return <section className={styles.workspace} aria-label="Obras">
  <div className={styles.sectionHeader}><div><h2>Obras</h2><p>{obras.length} registrada(s) · Fichas, contactos y color de referencia</p></div><button className={styles.primaryButton} type="button" onClick={()=>abrir()}>+ Crear obra</button></div>
  <label className={styles.search}>Buscar obra<input type="search" placeholder="Nombre, dirección o contacto…" value={texto} onChange={e=>setTexto(e.target.value)}/></label>
  <div className={styles.recordList}>{resultados.map(w=><article key={w.id} className={styles.recordRow} style={{borderLeft:`3px solid ${colorObra(w.color)}`}}>
   <div className={styles.recordPhoto}><FotoDirectorio tipo="obra" id={w.id} nombre={w.nombre}/></div><div className={styles.recordIdentity}><EtiquetaObra nombre={w.nombre} color={w.color}/><small>{w.direccion||'Dirección sin registrar'}</small><small>{w.contactos.length} contacto(s)</small></div>
   <div className={styles.creationActions}><button className={styles.secondaryButton} type="button" aria-label={`Ver obra ${w.nombre}`} onClick={()=>abrir(w,true)}>Ver</button><button className={styles.secondaryButton} type="button" aria-label={`Editar obra ${w.nombre}`} onClick={()=>abrir(w)}>Editar</button><EliminarDirectorio tipo="obra" id={w.id} nombre={w.nombre} onEliminar={()=>setVersion(v=>v+1)}/></div>
  </article>)}</div>
  {!resultados.length&&<p className={styles.hint}>{texto?'No hay obras que coincidan.':'Todavía no hay obras registradas.'}</p>}
  {error&&!crearAbierto&&!editar&&<p role="alert">{error}</p>}
  {(crearAbierto||editar)&&<PanelAdministracion titulo={lectura?'Ficha de la obra':editar&&editar!=='nueva'?'Editar obra':'Crear obra'} busy={busy} onCerrar={cerrar} acciones={!lectura&&<button className={styles.primaryButton} type="button" disabled={busy||!datos.nombre.trim()} onClick={()=>void guardar()}>{busy?'Guardando…':'Guardar obra'}</button>}>
   <FotoDirectorio tipo="obra" id={editar&&editar!=='nueva'?editar:undefined} nombre={datos.nombre||'Nueva obra'} archivo={foto} onArchivo={lectura?undefined:setFoto} disabled={busy}/>
   <fieldset className={styles.editorFields} disabled={busy||lectura}>{(['nombre','direccion'] as const).map(key=><label key={key} className={styles.field}><span className={styles.fieldLabel}>{key==='nombre'?'Nombre de la obra':'Dirección de la obra'}<VoiceInputButton compact value={datos[key]} onChange={v=>setDatos(d=>({...d,[key]:v}))} maxLength={key==='nombre'?180:500}/></span><input aria-label={key==='nombre'?'Nombre de la obra':'Dirección de la obra'} placeholder={key==='nombre'?'Ej.: Distrito Perseverancia':'Ej.: Bernardino Caballero 236'} value={datos[key]} maxLength={key==='nombre'?180:500} onChange={e=>setDatos(d=>({...d,[key]:e.target.value}))}/></label>)}
    <details className={styles.editorDetails}><summary>Color de referencia</summary><SelectorColorObra value={datos.color} nombre={datos.nombre} onChange={color=>setDatos(d=>({...d,color}))}/></details>
   </fieldset>
   {lectura&&<EtiquetaObra nombre={datos.nombre} color={datos.color}/>}
   {(actual||editar==='nueva')&&<details className={styles.editorDetails} open><summary>Contactos de la obra · {actual?.contactos.length??0}</summary>
    {lectura?<div className={styles.recordList}>{actual?.contactos.map(c=><div key={c.id} className={styles.contactCard}><strong>{c.nombre}</strong><small>{c.cargo||'Contacto de obra'}</small><small>{c.telefono||'Sin teléfono'}</small><small>{c.correo||'Sin correo'}</small></div>)}</div>:<>
     <label className={styles.field}>Contacto<select value={contactoId} disabled={busy} onChange={e=>elegirContacto(actual?.contactos.find(c=>c.id===e.target.value))}><option value="">+ Nuevo contacto</option>{actual?.contactos.map(c=><option key={c.id} value={c.id}>{c.nombre}</option>)}</select></label>
     <fieldset className={`${styles.editorFields} ${styles.contactFields}`} disabled={busy}>{([['nombre','Nombre',160],['cargo','Cargo / función',160],['telefono','Teléfono',80],['correo','Correo',254]] as const).map(([key,label,max])=><label key={key} className={styles.field}><span className={styles.fieldLabel}>{label}<VoiceInputButton compact value={contacto[key]} maxLength={max} onChange={v=>setContacto(d=>({...d,[key]:v}))}/></span><input aria-label={`Contacto: ${label}`} type={key==='correo'?'email':key==='telefono'?'tel':'text'} placeholder={key==='cargo'?'Ej.: Administradora':undefined} value={contacto[key]} maxLength={max} onChange={e=>setContacto(d=>({...d,[key]:e.target.value}))}/></label>)}
      <button className={styles.secondaryButton} type="button" disabled={busy||!contacto.nombre.trim()||editar==='nueva'} onClick={()=>void guardarContacto()}>Guardar solo contacto</button>
     </fieldset>
    </>}
   </details>}
   {error&&<p role="alert">{error}</p>}{mensaje&&<p role="status">{mensaje}</p>}
  </PanelAdministracion>}
 </section>;
}
