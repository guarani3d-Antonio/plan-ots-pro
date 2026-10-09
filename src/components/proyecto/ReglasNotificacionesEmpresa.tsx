import {useEffect,useState} from 'react';
import {supabase} from '../../db/supabase';
import {assertSession,sessionTicket} from '../../security/sessionScope';
import styles from './AdministracionCreador.module.css';
import notificationStyles from './ReglasNotificacionesEmpresa.module.css';
const roles=[['administrador','Administrador'],['supervisor','Jefe / supervisor'],['tecnico','Técnico'],['viewer','Lector']];
const tipos=[['nueva_ot','OT nuevas'],['estado','Cambios de estado'],['riesgo','Riesgo alto o extremo']];
export function ReglasNotificacionesEmpresa({tenant}:{tenant:string}){
 const [values,setValues]=useState<Record<string,string[]>>({}),[busy,setBusy]=useState(false),[loaded,setLoaded]=useState(false),[message,setMessage]=useState('');
 useEffect(()=>{let active=true;const ticket=sessionTicket();void Promise.resolve(supabase.rpc('plan_notificaciones_config',{p_tenant:tenant})).then(r=>{assertSession(ticket);if(r.error)throw new Error(r.error.message);if(active){setValues(Object.fromEntries((r.data??[]).map((v:{rol:string;tipos:string[]})=>[v.rol,v.tipos])));setLoaded(true)}}).catch(e=>{if(active)setMessage(e.message)});return()=>{active=false}},[tenant]);
 async function save(){setBusy(true);try{const ticket=sessionTicket();for(const [rol] of roles){const r=await supabase.rpc('plan_configurar_notificaciones',{p_tenant:tenant,p_rol:rol,p_tipos:values[rol]??['nueva_ot','estado']});assertSession(ticket);if(r.error)throw new Error(r.error.message)}setMessage('Reglas de notificación guardadas.')}catch(e){setMessage(e instanceof Error?e.message:'No se pudo guardar')}finally{setBusy(false)}}
 return <details className={`${styles.seccion} ${notificationStyles.section}`}>
  <summary className={styles.titulo}>Notificaciones por perfil</summary>
  <div className={`${styles.contenido} ${notificationStyles.content}`}>
   <p className={styles.hint}>Cada persona recibe únicamente eventos de sus obras autorizadas.</p>
   <div className={notificationStyles.tableContainer} role="region" aria-label="Notificaciones por perfil" tabIndex={0}>
    <table className={notificationStyles.table}>
     <thead><tr><th scope="col">Perfil</th>{tipos.map(([type,name])=><th scope="col" key={type}>{name}</th>)}</tr></thead>
     <tbody>{roles.map(([role,label])=><tr key={role}>
      <th scope="row">{label}</th>
      {tipos.map(([type,name])=><td key={type}>
       <label className={notificationStyles.control}>
        <input type="checkbox" aria-label={`${label}: ${name}`} disabled={busy||!loaded} checked={(values[role]??['nueva_ot','estado']).includes(type)} onChange={e=>setValues(v=>({...v,[role]:e.target.checked?[...new Set([...(v[role]??['nueva_ot','estado']),type])]:(v[role]??['nueva_ot','estado']).filter(t=>t!==type)}))}/>
       </label>
      </td>)}
     </tr>)}</tbody>
    </table>
   </div>
   <div className={notificationStyles.footer}>
    <button className={styles.primaryButton} disabled={busy||!loaded} onClick={()=>void save()}>{busy?'Guardando…':'Guardar notificaciones'}</button>
    {message&&<p className={styles.hint} role="status">{message}</p>}
   </div>
  </div>
 </details>;
}
