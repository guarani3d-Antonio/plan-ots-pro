import { useEffect, useState } from 'react';
import { supabase } from '../../db/supabase';
import { assertSession, sessionTicket } from '../../security/sessionScope';
import { PanelAdministracion } from './PanelAdministracion';
import styles from './AdministracionCreador.module.css';

export function EliminarDirectorio({ tipo,id,nombre,onEliminar,permitido=true }: {tipo:'empresa'|'obra'|'cliente'|'contratista'|'contacto';id:string;nombre:string;onEliminar:()=>void;permitido?:boolean}) {
  const [estado,setEstado]=useState<{bloqueo:string|null;cargado:boolean}>({bloqueo:null,cargado:false});
  const [confirmar,setConfirmar]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
  useEffect(()=>{let active=true;const ticket=sessionTicket();void Promise.resolve(supabase.rpc('plan_directorio_bloqueo',{p_tipo:tipo,p_id:id})).then(r=>{
    assertSession(ticket);if(active)setEstado({bloqueo:r.error?'No se pudo verificar si tiene vínculos.':r.data as string|null,cargado:!r.error});
  }).catch(()=>{if(active)setEstado({bloqueo:'No se pudo verificar si tiene vínculos.',cargado:false})});return()=>{active=false}},[tipo,id]);
  async function eliminar(){if(busy)return;setBusy(true);setError('');try{const ticket=sessionTicket();const r=await supabase.rpc('plan_eliminar_directorio',{p_tipo:tipo,p_id:id});assertSession(ticket);if(r.error)throw new Error(r.error.message);setConfirmar(false);onEliminar()}catch(e){setError(e instanceof Error?e.message:'No se pudo eliminar.');setEstado({bloqueo:'Volvé a verificar los vínculos antes de eliminar.',cargado:false})}finally{setBusy(false)}}
  return <><button type="button" className={styles.secondaryButton} aria-label={`Eliminar ${nombre}`} title={!permitido?'Tu perfil no permite eliminar este registro':estado.bloqueo??(!estado.cargado?'Verificando vínculos…':`Eliminar ${nombre}`)} disabled={!permitido||!estado.cargado||!!estado.bloqueo||busy} onClick={()=>setConfirmar(true)}>Eliminar</button>
    {confirmar&&<PanelAdministracion titulo="Confirmar eliminación" busy={busy} onCerrar={()=>setConfirmar(false)}><p>¿Eliminar <strong>{nombre}</strong>?</p><p className={styles.hint}>Solo se permite cuando no tiene registros asociados. Esta acción no se puede deshacer.</p>{error&&<p role="alert">{error}</p>}<div className={styles.creationActions}><button type="button" className={styles.secondaryButton} disabled={busy} onClick={()=>setConfirmar(false)}>Cancelar</button><button type="button" className={styles.primaryButton} disabled={busy} onClick={()=>void eliminar()}>{busy?'Eliminando…':'Eliminar registro'}</button></div></PanelAdministracion>}
  </>;
}
