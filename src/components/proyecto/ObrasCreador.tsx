import { useEffect,useState } from 'react';
import { supabase } from '../../db/supabase';
import { assertSession,sessionTicket } from '../../security/sessionScope';
import { useAccessStore } from '../../stores/accessStore';
import { useProyectosStore } from '../../stores/proyectosStore';
import { fichaObra } from '../../services/workDirectoryService';
import { DialogDirectorioOT } from '../plano/DialogDirectorioOT';
import { FichaObraOT } from '../plano/FichaObraOT';
import { VoiceInputButton } from '../ui/VoiceInputButton';
import styles from './AdministracionCreador.module.css';
import datosStyles from '../plano/DatosVinculados.module.css';

export function ObrasCreador({tenantId,crearAbierto,onCerrarCrear}:{tenantId:string;crearAbierto:boolean;onCerrarCrear:()=>void}) {
 const [obras,setObras]=useState<{id:string;nombre:string}[]>([]),[texto,setTexto]=useState('');
 const [selected,setSelected]=useState<string|null>(null),[editar,setEditar]=useState<string|null>(null);
 const [datos,setDatos]=useState({nombre:'',direccion:''}),[busy,setBusy]=useState(false),[error,setError]=useState(''),[version,setVersion]=useState(0);
 useEffect(()=>{let active=true;const ticket=sessionTicket();void Promise.resolve(supabase.from('proyectos').select('id,nombre').eq('tenant_id',tenantId).is('proyecto_padre_id',null).is('deleted_at',null).order('nombre')).then(({data,error})=>{if(!active)return;assertSession(ticket);if(error)throw new Error(error.message);setObras(data??[]);setError('')}).catch(e=>{if(active){setObras([]);setError(e instanceof Error?e.message:'No se pudo cargar el directorio.')}});return()=>{active=false}},[tenantId,version]);
 async function editarFicha(id:string){setError('');try{const f=await fichaObra(id);setDatos({nombre:f.nombre,direccion:f.direccion??''});setEditar(id)}catch(e){setError(e instanceof Error?e.message:'No se pudo abrir la ficha.')}}
 async function guardar(){if(busy||!datos.nombre.trim())return;setBusy(true);setError('');try{const ticket=sessionTicket();const {data,error}=await supabase.rpc('plan_guardar_ficha_obra',{p_tenant:tenantId,p_obra:editar==='nueva'?null:editar,p_nombre:datos.nombre,p_direccion:datos.direccion});assertSession(ticket);if(error)throw new Error(error.message);setSelected(data as string);setVersion(v=>v+1);setEditar(null);onCerrarCrear();setDatos({nombre:'',direccion:''});await useProyectosStore.getState().cargarProyectos();await useAccessStore.getState().refresh()}catch(e){setError(e instanceof Error?e.message:'No se pudo guardar la obra.')}finally{setBusy(false)}}
 const normalizar=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 return <details className={styles.seccion} data-creator-section="obras"><summary className={styles.titulo}>Obras</summary><div className={styles.contenido}>
  <label className={datosStyles.search}>Buscar obra<input type="search" placeholder="Nombre de la obra…" value={texto} onChange={e=>setTexto(e.target.value)}/></label>
  <button className={datosStyles.button} type="button" onClick={()=>{setDatos({nombre:'',direccion:''});onCerrarCrear();setSelected(null);setError('');setEditar('nueva')}}>+ Crear obra</button>
  {obras.filter(w=>normalizar(w.nombre).includes(normalizar(texto))).map(w=><div key={w.id} className={datosStyles.tools}><button type="button" className={datosStyles.button} aria-pressed={selected===w.id} onClick={()=>setSelected(w.id)}>{w.nombre}</button><button type="button" className={datosStyles.button} onClick={()=>void editarFicha(w.id)}>Editar ficha</button></div>)}
  {selected&&<FichaObraOT key={`${selected}:${version}`} proyectoId={selected} puedeGestionar/>}
  {error&&!crearAbierto&&!editar&&<p role="alert">{error}</p>}
  {(crearAbierto||editar)&&<DialogDirectorioOT titulo={editar&&editar!=='nueva'?'Editar ficha de obra':'Crear obra'} busy={busy} onCerrar={()=>{setEditar(null);onCerrarCrear();setDatos({nombre:'',direccion:''});setError('')}}><div className={datosStyles.grid}>{(['nombre','direccion'] as const).map(key=><label key={key} className={datosStyles.field}><span className={datosStyles.label}>{key==='nombre'?'Nombre de la obra':'Dirección de la obra'}<VoiceInputButton compact value={datos[key]} onChange={v=>setDatos(d=>({...d,[key]:v}))} maxLength={key==='nombre'?180:500}/></span><input value={datos[key]} maxLength={key==='nombre'?180:500} onChange={e=>setDatos(d=>({...d,[key]:e.target.value}))}/></label>)}</div><p className={datosStyles.note}>La ficha de obra organiza sus planos y accesos. Los proyectos con plano se crean desde Proyectos.</p>{error&&<p role="alert">{error}</p>}<div className={datosStyles.tools}><button type="button" className={datosStyles.button} disabled={busy||!datos.nombre.trim()} onClick={()=>void guardar()}>{busy?'Guardando…':'Guardar obra'}</button><button type="button" className={datosStyles.button} disabled={busy} onClick={()=>{setEditar(null);onCerrarCrear()}}>Cancelar</button></div></DialogDirectorioOT>}
 </div></details>;
}
