import { useState, type ReactNode } from 'react';
import { supabase } from '../../db/supabase';
import { assertSession, sessionTicket } from '../../security/sessionScope';
import { guardarFotoDirectorio } from '../../services/directoryPhotoService';
import type { FichaContratista } from '../../services/workDirectoryService';
import { useAccessStore } from '../../stores/accessStore';
import { FotoDirectorio } from './FotoDirectorio';
import { DialogDirectorioOT } from './DialogDirectorioOT';
import { VoiceInputButton } from '../ui/VoiceInputButton';
import styles from './FichaDirectorio.module.css';

export function FichaPersonaOT({ tipo, ficha, tenantId, puedeGestionar, onGuardar, children }: {
  tipo:'cliente'|'contratista'; ficha:FichaContratista; tenantId?:string|null;
  puedeGestionar:boolean; onGuardar:(ficha:FichaContratista)=>void; children?:ReactNode;
}) {
  const [editar,setEditar]=useState(false);
  return <div className={styles.sheet}>
    <div className={styles.identity}><FotoDirectorio tipo={tipo} id={ficha.id} nombre={ficha.nombre}/>
      <div className={styles.name}><h3>{ficha.nombre}</h3><p className={styles.muted}>{tipo==='cliente'?'Cliente vinculado a esta OT':'Contratista asignado · planificación'}</p></div>
      <div className={styles.actions}><button type="button" className={styles.button} disabled={!puedeGestionar||!tenantId}
        title={puedeGestionar?'Editar el registro compartido':'El Creador administra esta ficha'} onClick={()=>setEditar(true)}>Editar ficha</button></div>
    </div>
    <dl className={styles.grid}>
      {([['identificacion','RUC / documento'],['contacto','Contacto'],['telefono','Teléfono'],['correo','Correo'],['direccion',tipo==='cliente'?'Domicilio del cliente':'Dirección']] as const).map(([key,label])=>
        <div key={key}><dt>{label}</dt><dd>{ficha[key]||'Sin registrar'}</dd></div>)}
    </dl>{children}
    {editar&&tenantId&&<EditarFichaPersona tipo={tipo} ficha={ficha} tenantId={tenantId} onCerrar={()=>setEditar(false)} onDatos={onGuardar} onGuardar={f=>{onGuardar(f);setEditar(false)}}/>}
  </div>;
}

function EditarFichaPersona({tipo,ficha,tenantId,onCerrar,onGuardar,onDatos}:{tipo:'cliente'|'contratista';ficha:FichaContratista;tenantId:string;onCerrar:()=>void;onGuardar:(f:FichaContratista)=>void;onDatos:(f:FichaContratista)=>void}) {
 const [datos,setDatos]=useState(()=>({nombre:ficha.nombre,identificacion:ficha.identificacion??'',contacto:ficha.contacto??'',telefono:ficha.telefono??'',correo:ficha.correo??'',direccion:ficha.direccion??''}));
 const [foto,setFoto]=useState<File|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const campos=[['nombre','Nombre / razón social',160],['identificacion','RUC / documento',80],['contacto','Contacto',160],['telefono','Teléfono',80],['correo','Correo',254],['direccion',tipo==='cliente'?'Domicilio del cliente':'Dirección',500]] as const;
 async function guardar(){
  if(busy||!datos.nombre.trim())return;
  if(!useAccessStore.getState().contexto?.creador){setError('No tiene permiso para editar esta ficha.');return;}
  if(datos.correo&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(datos.correo)){setError('Revisá el correo.');return;}
  setBusy(true);setError('');
  try{
   const ticket=sessionTicket();const {error}=await supabase.rpc(tipo==='cliente'?'plan_guardar_cliente':'plan_guardar_contratista_ficha',{
    p_tenant:tenantId,p_id:ficha.id,p_nombre:datos.nombre,p_identificacion:datos.identificacion,p_contacto:datos.contacto,p_telefono:datos.telefono,p_correo:datos.correo,p_direccion:datos.direccion,p_activo:ficha.activo});
   assertSession(ticket);if(error)throw new Error(error.message);
   const updated={...ficha,...Object.fromEntries(Object.entries(datos).map(([k,v])=>[k,v.trim()||null])),nombre:datos.nombre.trim()} as FichaContratista;
   onDatos(updated);
   if(foto){try{await guardarFotoDirectorio(tipo,ficha.id,foto)}catch(e){setError(`Los datos se guardaron, pero la foto no: ${e instanceof Error?e.message:'Reintentá la carga.'}`);return;}}
   onGuardar(updated);
  }catch(e){setError(e instanceof Error?e.message:'No se pudo guardar la ficha.');}finally{setBusy(false);}
 }
 return <DialogDirectorioOT titulo={`Editar ficha del ${tipo}`} busy={busy} onCerrar={onCerrar}>
  <p className={styles.status}>La edición actualiza el registro compartido del directorio de Creador.</p>
  <fieldset disabled={busy} style={{border:0,padding:0,margin:0,minWidth:0}}>
   <div className={styles.editorPhoto}><FotoDirectorio tipo={tipo} id={ficha.id} nombre={datos.nombre} archivo={foto} onArchivo={setFoto} disabled={busy}/></div>
   <div className={styles.editGrid}>{campos.map(([key,label,max])=><div key={key} className={styles.field}><span className={styles.label}>{label}<VoiceInputButton compact value={datos[key]} maxLength={max} onChange={v=>setDatos(d=>({...d,[key]:v}))}/></span><input aria-label={label} maxLength={max} value={datos[key]} type={key==='correo'?'email':key==='telefono'?'tel':'text'} placeholder={`Ej.: ${label.toLowerCase()}`} onChange={e=>setDatos(d=>({...d,[key]:e.target.value}))}/></div>)}</div>
  </fieldset>{error&&<p role="alert">{error}</p>}<div className={styles.actions}><button type="button" className={`${styles.button} ${styles.primary}`} disabled={busy||!datos.nombre.trim()} onClick={()=>void guardar()}>{busy?'Guardando…':'Guardar ficha'}</button><button type="button" className={styles.button} disabled={busy} onClick={onCerrar}>Cancelar</button></div>
 </DialogDirectorioOT>;
}
