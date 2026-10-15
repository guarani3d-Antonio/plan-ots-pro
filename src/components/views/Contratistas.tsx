import {useContext,useEffect,useState} from 'react';
import {tienePermiso,useAccessStore,type ContextoAcceso} from '../../stores/accessStore';
import {FichasAdministracion} from '../proyecto/FichasAdministracion';
import {GuardiaAdministracion} from '../proyecto/GuardiaAdministracion';
import {GuardiaAdministracionContext} from '../proyecto/guardiaAdministracionContext';
import {PanelAdministracionContext} from '../proyecto/panelAdministracionContext';
const empresaDirectorio=(contexto:ContextoAcceso|null,seleccion:string)=>{if(!contexto)return '';const empresas=contexto.empresas.filter(e=>contexto.creador||e.permisos?.includes('contratista.ver'));return empresas.some(e=>e.id===seleccion)?seleccion:!contexto.creador&&empresas.length===1?empresas[0].id:'';};
import s from '../clientes/Clientes.module.css';

export default function Contratistas(){const [target,setTarget]=useState<HTMLDivElement|null>(null);return <PanelAdministracionContext.Provider value={target}><GuardiaAdministracion><DirectorioContratistas setTarget={setTarget}/></GuardiaAdministracion></PanelAdministracionContext.Provider>}
function DirectorioContratistas({setTarget}:{setTarget:(el:HTMLDivElement|null)=>void}){
 const guard=useContext(GuardiaAdministracionContext),{contexto,empresaId,disponible}=useAccessStore();
 const empresas=contexto?.empresas.filter(e=>tienePermiso('contratista.ver',undefined,e.id))??[];
 const tenant=disponible?empresaDirectorio(contexto,empresaId):'',empresa=contexto?.empresas.find(e=>e.id===tenant),creador=!!contexto?.creador;
 useEffect(()=>{if(disponible&&!creador&&tenant&&tenant!==empresaId)useAccessStore.setState({empresaId:tenant});},[disponible,creador,tenant,empresaId]);
 return <div className={s.creator}>
  <header className={s.pageHeader}><div><h1>Contratistas</h1><p>{creador&&empresa?empresa.nombre+' · ':''}Directorio de contratistas</p></div>{creador?<label className={s.companyContext}>Empresa<select aria-label="Empresa del directorio de contratistas" value={tenant} onChange={e=>guard.solicitar(()=>useAccessStore.setState({empresaId:e.target.value}))}><option value="">Seleccionar una empresa…</option>{empresas.map(e=><option key={e.id} value={e.id}>{e.nombre}</option>)}</select></label>:empresa&&<span className={s.companyName}>{empresa.nombre}</span>}</header>
  {empresa&&tienePermiso('contratista.ver',undefined,tenant)?<FichasAdministracion listadoContratistas mostrarTitulo={false} key={tenant} tipo="contratista" tenantId={tenant} onSeleccionar={()=>{}}/>:<p className={s.hint}>{!disponible?'Validando los permisos…':creador?'Seleccioná una empresa para consultar sus contratistas.':'No se pudo identificar la empresa de este perfil. Revisá el acceso asignado.'}</p>}
  <div ref={setTarget}/>
 </div>;
}
