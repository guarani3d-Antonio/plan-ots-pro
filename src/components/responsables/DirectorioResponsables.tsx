import {useContext,useEffect,useId,useState} from 'react';
import {tienePermiso,useAccessStore} from '../../stores/accessStore';
import {listarResponsables,type ResponsableFicha} from '../../services/responsibleProfileService';
import {PanelAdministracionContext} from '../proyecto/panelAdministracionContext';
import {GuardiaAdministracion} from '../proyecto/GuardiaAdministracion';
import {GuardiaAdministracionContext} from '../proyecto/guardiaAdministracionContext';
import {PanelAdministracion} from '../proyecto/PanelAdministracion';
import {ListadoResponsables} from './ListadoResponsables';
import {FormularioResponsable} from './FormularioResponsable';
import {PerfilResponsable,type PestanaResponsable} from './PerfilResponsable';
import {FotoResponsable} from './FotoResponsable';
import page from '../clientes/Clientes.module.css';
import tabs from '../clientes/PerfilCliente.module.css';
import s from './Responsables.module.css';
export default function Responsables(){const[target,setTarget]=useState<HTMLDivElement|null>(null);return <PanelAdministracionContext.Provider value={target}><GuardiaAdministracion><Directorio setTarget={setTarget}/></GuardiaAdministracion></PanelAdministracionContext.Provider>}
function Directorio({setTarget}:{setTarget:(el:HTMLDivElement|null)=>void}){
 const guard=useContext(GuardiaAdministracionContext),{contexto,empresaId,disponible}=useAccessStore();
 const empresas=contexto?.empresas.filter(e=>tienePermiso('equipo.ver',undefined,e.id))??[],creador=!!contexto?.creador;
 const tenant=disponible?(empresas.some(e=>e.id===empresaId)?empresaId:!creador&&empresas.length===1?empresas[0].id:''):'',empresa=empresas.find(e=>e.id===tenant);
 useEffect(()=>{if(disponible&&!creador&&tenant&&empresaId!==tenant)useAccessStore.setState({empresaId:tenant})},[tenant,disponible,creador,empresaId]);
 return <div className={page.creator}><header className={page.pageHeader}><div><h1>Responsables / Técnicos</h1><p>{creador&&empresa?empresa.nombre+' · ':''}Tu equipo, sus obras y su carga de trabajo.</p></div>{creador?<label className={page.companyContext}>Empresa<select aria-label="Empresa del directorio de responsables" value={tenant} onChange={e=>guard.solicitar(()=>useAccessStore.setState({empresaId:e.target.value}))}><option value="">Seleccionar una empresa…</option>{empresas.map(e=><option key={e.id} value={e.id}>{e.nombre}</option>)}</select></label>:empresa&&<span className={page.companyName}>{empresa.nombre}</span>}</header>
  {empresa?<ContenidoResponsables key={tenant} tenant={tenant}/>:<p className={page.hint}>{!disponible?'Validando los permisos…':creador?'Seleccioná una empresa para consultar sus responsables.':'No se pudo identificar la empresa o el permiso del perfil.'}</p>}
  <div ref={setTarget}/>
 </div>;
}
export function ContenidoResponsables({tenant}:{tenant:string}){
 const guard=useContext(GuardiaAdministracionContext),[registros,setRegistros]=useState<ResponsableFicha[]>([]),[sinCuenta,setSinCuenta]=useState(0),[cargando,setCargando]=useState(true),[error,setError]=useState(''),[version,setVersion]=useState(0),[seleccion,setSeleccion]=useState<string|null>(null),[nuevo,setNuevo]=useState(false);
 useEffect(()=>{let active=true;setCargando(true);setError('');void listarResponsables(tenant).then(r=>{if(active){setRegistros(r.responsables);setSinCuenta(r.sinCuenta);setSeleccion(id=>r.responsables.some(p=>p.id===id)?id:null)}}).catch(e=>{if(active){setError(e.message);setSeleccion(null);setNuevo(false)}}).finally(()=>{if(active)setCargando(false)});return()=>{active=false}},[tenant,version]);
 const persona=registros.find(p=>p.id===seleccion);
 const actualizado=async(id:string)=>{const r=await listarResponsables(tenant);setRegistros(r.responsables);setSinCuenta(r.sinCuenta);setSeleccion(r.responsables.some(p=>p.id===id)?id:null);setNuevo(false)};
 return <><ListadoResponsables registros={registros} cargando={cargando} error={error} puedeCrear={tienePermiso('equipo.editar',undefined,tenant)} onCrear={()=>guard.solicitar(()=>setNuevo(true))} onVer={p=>guard.solicitar(()=>setSeleccion(p.id))} onReintentar={()=>setVersion(v=>v+1)}/>
  {!error&&sinCuenta>0&&<p className={s.listNotice}>{sinCuenta} {sinCuenta===1?'OT antigua tiene':'OT antiguas tienen'} un nombre escrito sin cuenta vinculada. No se incluyen en estos perfiles. Para vincularlas, seleccioná la cuenta correcta en el Panel OT.</p>}
  <p className={s.notice}>La ficha profesional y sus indicadores respetan las cuentas, las obras visibles y los permisos actuales del equipo.</p>
  {persona&&<FichaResponsable key={persona.id} tenant={tenant} persona={persona} onCerrar={()=>{setSeleccion(null);setVersion(v=>v+1)}} onGuardado={actualizado}/>}
  {nuevo&&<PanelAdministracion modal alturaEstable titulo="Vincular responsable" onCerrar={()=>guard.solicitar(()=>setNuevo(false))}><FormularioResponsable tenant={tenant} onGuardado={actualizado} onCancelar={()=>setNuevo(false)}/></PanelAdministracion>}
 </>;
}
function FichaResponsable({tenant,persona,onCerrar,onGuardado}:{tenant:string;persona:ResponsableFicha;onCerrar:()=>void;onGuardado:(id:string)=>Promise<void>}){
 const guard=useContext(GuardiaAdministracionContext),id=useId(),[tab,setTab]=useState<PestanaResponsable>('dashboard'),[editando,setEditando]=useState(false),[mensaje,setMensaje]=useState('');
 return <PanelAdministracion modal alturaEstable titulo={editando?'Editar ficha del responsable':'Ficha del responsable'} textoCerrar="Cerrar ficha" onCerrar={()=>guard.solicitar(onCerrar)}>
  {editando?<FormularioResponsable key={persona.id} tenant={tenant} persona={persona} onCancelar={()=>setEditando(false)} onGuardado={async user=>{await onGuardado(user);setEditando(false);setTab('datos');setMensaje('Ficha profesional guardada.')}}/>:<>
   <div className={s.identity}><FotoResponsable id={persona.id} nombre={persona.nombre} path={persona.avatar_path}/><div><strong>{persona.nombre}</strong><small>{persona.datos.especialidad||persona.cargo||'Especialidad por completar'}</small><small className={persona.activo?s.account:undefined}>{persona.activo?'Cuenta activa':'Cuenta inactiva'} · Técnico / supervisor</small><small>{persona.obras.length} {persona.obras.length===1?'obra visible vinculada':'obras visibles vinculadas'}</small></div>{persona.editable&&<button className={s.link} type="button" onClick={()=>{setMensaje('');setEditando(true)}}>Editar datos</button>}</div>
   <nav className={tabs.tabs} role="tablist" aria-label="Ficha del responsable">{(['dashboard','datos','historial'] as const).map(t=><button type="button" key={t} role="tab" id={`${id}-${t}`} aria-controls={`${id}-contenido`} aria-selected={tab===t} onClick={()=>setTab(t)}>{({dashboard:'Dashboard',datos:'Datos',historial:'Historial de OT'})[t]}</button>)}</nav>
   {mensaje&&<p className={s.success} role="status">{mensaje}</p>}
   <div role="tabpanel" id={`${id}-contenido`} aria-labelledby={`${id}-${tab}`}><PerfilResponsable tenant={tenant} persona={persona} tab={tab} onTab={setTab}/></div>
  </>}
 </PanelAdministracion>;
}
