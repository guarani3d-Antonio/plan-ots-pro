import {useContext,useEffect,useState} from 'react';
import {tienePermiso,useAccessStore} from '../../stores/accessStore';
import {FichasAdministracion} from '../proyecto/FichasAdministracion';
import {GuardiaAdministracion} from '../proyecto/GuardiaAdministracion';
import {GuardiaAdministracionContext} from '../proyecto/guardiaAdministracionContext';
import {PanelAdministracionContext} from '../proyecto/panelAdministracionContext';
import {empresaDirectorio} from '../../services/customerDirectoryModel';
import s from '../clientes/Clientes.module.css';

export default function Clientes(){const [target,setTarget]=useState<HTMLDivElement|null>(null);return <PanelAdministracionContext.Provider value={target}><GuardiaAdministracion><DirectorioClientes setTarget={setTarget}/></GuardiaAdministracion></PanelAdministracionContext.Provider>}
function DirectorioClientes({setTarget}:{setTarget:(el:HTMLDivElement|null)=>void}){
 const guard=useContext(GuardiaAdministracionContext),{contexto,empresaId,disponible}=useAccessStore();
 const empresas=contexto?.empresas.filter(e=>tienePermiso('cliente.ver',undefined,e.id))??[];
 const tenant=disponible?empresaDirectorio(contexto,empresaId):'',empresa=contexto?.empresas.find(e=>e.id===tenant),creador=!!contexto?.creador;
 useEffect(()=>{if(disponible&&!creador&&tenant&&tenant!==empresaId)useAccessStore.setState({empresaId:tenant});},[disponible,creador,tenant,empresaId]);
 return <div className={s.creator}>
  <header className={s.pageHeader}><div><h1>Clientes</h1><p>{creador&&empresa?empresa.nombre+' · ':''}Directorio de clientes</p></div>{creador?<label className={s.companyContext}>Empresa<select aria-label="Empresa del directorio de clientes" value={tenant} onChange={e=>guard.solicitar(()=>useAccessStore.setState({empresaId:e.target.value}))}><option value="">Seleccionar una empresa…</option>{empresas.map(e=><option key={e.id} value={e.id}>{e.nombre}</option>)}</select></label>:empresa&&<span className={s.companyName}>{empresa.nombre}</span>}</header>
  {empresa&&tienePermiso('cliente.ver',undefined,tenant)?<FichasAdministracion listadoClientes mostrarTitulo={false} key={tenant} tipo="cliente" tenantId={tenant} onSeleccionar={()=>{}}/>:<p className={s.hint}>{!disponible?'Validando los permisos…':creador?'Seleccioná una empresa para consultar sus clientes.':'No se pudo identificar la empresa de este perfil. Revisá el acceso asignado.'}</p>}
  <div ref={setTarget}/>
 </div>;
}
