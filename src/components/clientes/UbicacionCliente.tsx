import {useEffect,useState} from 'react';
import {listarObrasCliente,type ObraCliente} from '../../services/customerProfileService';
import {SelectorBusqueda} from '../ui/SelectorBusqueda';
import s from '../proyecto/FichasAdministracion.module.css';
export interface LugarCliente {proyecto_id:string;ubicacion_id:string;torre:string;piso:string;unidad:string;sector:string}
export const nuevoLugarCliente=():LugarCliente=>({proyecto_id:'',ubicacion_id:'',torre:'',piso:'',unidad:'',sector:''});
export function UbicacionCliente({tenantId,value,onChange,disabled}:{tenantId:string;value:LugarCliente;onChange:(v:LugarCliente)=>void;disabled:boolean}){
 const [obras,setObras]=useState<ObraCliente[]>([]),[error,setError]=useState(''),[cargando,setCargando]=useState(true);
 useEffect(()=>{let active=true;setObras([]);setError('');setCargando(true);void listarObrasCliente(tenantId).then(r=>{if(active)setObras(r)}).catch(e=>{if(active)setError(e.message)}).finally(()=>{if(active)setCargando(false)});return()=>{active=false}},[tenantId]);
 const obra=obras.find(o=>o.id===value.proyecto_id),option=(o:ObraCliente)=>({id:o.id,nombre:o.nombre+(o.id!==o.obra_id?` · ${o.proyecto_nombre}`:''),detalle:[o.direccion,o.ciudad].filter(Boolean).join(' · '),busqueda:[o.nombre,o.proyecto_nombre,o.direccion,o.ciudad].filter(Boolean).join(' ')});
 return <details className={s.group} open><summary>Ubicación del cliente en la obra</summary>
  <div className={s.fields}><div className={s.full}><SelectorBusqueda label="Obra del cliente *" value={obra?option(obra):undefined} opciones={obras.filter(o=>o.activo||o.id===value.proyecto_id).map(option)} placeholder="Buscar obra, dirección o plano…" disabled={disabled||cargando} onSeleccionar={id=>onChange({...value,proyecto_id:id,torre:'',piso:'',unidad:'',sector:''})}/></div>
  <div className={s.full}><span>Dirección de la obra</span><p>{obra?.direccion||'Pendiente de completar en la ficha de la obra.'}</p><small>Se consulta desde la obra. {obra?.ciudad}</small></div>
  {(['torre','piso','unidad','sector'] as const).map(key=><label className={s.field} key={key}>{({torre:'Torre / bloque',piso:'Piso',unidad:'Unidad / departamento',sector:'Sector'})[key]}<input disabled={disabled} value={value[key]} maxLength={key==='piso'?40:key==='unidad'?80:key==='sector'?120:160} onChange={e=>onChange({...value,[key]:e.target.value})}/></label>)}
  </div><p className={s.hint}>Torre, piso, unidad y sector se completan cuando corresponden. En una casa basta con su obra y dirección.</p>
  {cargando&&<p role="status">Cargando obras…</p>}{error&&<p role="alert">{error}</p>}
 </details>;
}
