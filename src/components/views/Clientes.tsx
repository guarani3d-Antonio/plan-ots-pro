import {useContext,useState} from 'react';
import {tienePermiso,useAccessStore} from '../../stores/accessStore';
import {FichasAdministracion} from '../proyecto/FichasAdministracion';
import {GuardiaAdministracion} from '../proyecto/GuardiaAdministracion';
import {GuardiaAdministracionContext} from '../proyecto/guardiaAdministracionContext';
import {PanelAdministracionContext} from '../proyecto/panelAdministracionContext';
import s from '../proyecto/AdministracionCreador.module.css';

export default function Clientes(){const [target,setTarget]=useState<HTMLDivElement|null>(null);return <PanelAdministracionContext.Provider value={target}><GuardiaAdministracion><DirectorioClientes setTarget={setTarget}/></GuardiaAdministracion></PanelAdministracionContext.Provider>}
function DirectorioClientes({setTarget}:{setTarget:(el:HTMLDivElement|null)=>void}){
 const guard=useContext(GuardiaAdministracionContext),{contexto,empresaId}=useAccessStore();
 const empresas=contexto?.empresas.filter(e=>tienePermiso('cliente.ver',undefined,e.id))??[];
 const empresa=contexto?.empresas.find(e=>e.id===empresaId);
 return <div className={s.creator}>
  <header className={s.pageHeader}><div><h1>Clientes</h1><p>Fichas, reclamos y encuestas de tu empresa.</p></div><label className={s.companyContext}>Empresa<select aria-label="Empresa del directorio de clientes" value={empresaId} onChange={e=>guard.solicitar(()=>useAccessStore.setState({empresaId:e.target.value}))}><option value="">Seleccionar una empresa…</option>{empresas.map(e=><option key={e.id} value={e.id}>{e.nombre}</option>)}</select></label></header>
  {empresa&&tienePermiso('cliente.ver',undefined,empresaId)?<FichasAdministracion mostrarTitulo={false} key={empresaId} tipo="cliente" tenantId={empresaId} onSeleccionar={()=>{}}/>:<p>Seleccioná una empresa para consultar sus clientes.</p>}
  <div ref={setTarget}/>
 </div>;
}
