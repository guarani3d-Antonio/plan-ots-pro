import {useCallback,useContext,useEffect,useImperativeHandle,useMemo,useState,type Ref} from 'react';
import {useAccessStore} from '../../stores/accessStore';
import {categoriasDirectorio,empresaDelDirectorio,puedeVerDirectorio,unirObrasDirectorio,type CategoriaDirectorio,type ObraFiltroDirectorio} from '../../services/directoryNavigationModel';
import {GuardiaAdministracion} from '../proyecto/GuardiaAdministracion';
import {GuardiaAdministracionContext} from '../proyecto/guardiaAdministracionContext';
import {PanelAdministracionContext} from '../proyecto/panelAdministracionContext';
import {PanelAdministracion} from '../proyecto/PanelAdministracion';
import {FichasAdministracion} from '../proyecto/FichasAdministracion';
import {ContenidoResponsables} from '../responsables/DirectorioResponsables';
import {FiltroObraDirectorioContext} from './FiltroObraDirectorio';
import {IconoDirectorio} from './IconoDirectorio';
import s from './Directorio.module.css';

export interface DirectorioHandle {irInicio:()=>void}
export default function Directorio({categoriaInicial=null,ref}:{categoriaInicial?:CategoriaDirectorio|null;ref?:Ref<DirectorioHandle>}){
 const[target,setTarget]=useState<HTMLDivElement|null>(null);
 return <PanelAdministracionContext.Provider value={target}><GuardiaAdministracion><Contenido categoriaInicial={categoriaInicial} handleRef={ref}/><div ref={setTarget}/></GuardiaAdministracion></PanelAdministracionContext.Provider>;
}

function Contenido({categoriaInicial,handleRef}:{categoriaInicial:CategoriaDirectorio|null;handleRef?:Ref<DirectorioHandle>}){
 const guard=useContext(GuardiaAdministracionContext),{contexto,empresaId,disponible}=useAccessStore();
 const [categoria,setCategoria]=useState<CategoriaDirectorio|null>(categoriaInicial),[cambiarEmpresa,setCambiarEmpresa]=useState(false);
 const [obrasPorEmpresa,setObrasPorEmpresa]=useState<Record<string,{seleccion:string;obras:ObraFiltroDirectorio[]}>>({});
 const tenant=disponible?empresaDelDirectorio(contexto,empresaId):'',empresa=contexto?.empresas.find(e=>e.id===tenant),creador=!!contexto?.creador;
 const elegida=categoriasDirectorio.find(c=>c.id===categoria),obras=obrasPorEmpresa[tenant]?.obras??[],obra=obrasPorEmpresa[tenant]?.seleccion??'';
 useEffect(()=>{if(disponible&&!creador&&tenant&&empresaId!==tenant)useAccessStore.setState({empresaId:tenant})},[disponible,creador,tenant,empresaId]);
 const registrar=useCallback((nuevas:readonly ObraFiltroDirectorio[])=>{if(!tenant||!nuevas.length)return;setObrasPorEmpresa(prev=>{const antes=prev[tenant]??{seleccion:'',obras:[]},unidas=unirObrasDirectorio(antes.obras,nuevas);return JSON.stringify(antes.obras)===JSON.stringify(unidas)?prev:{...prev,[tenant]:{...antes,obras:unidas}}})},[tenant]);
 const cambiarObra=useCallback((id:string)=>guard.solicitar(()=>setObrasPorEmpresa(prev=>{const antes=prev[tenant]??{seleccion:'',obras:[]};return {...prev,[tenant]:{...antes,seleccion:antes.obras.some(([obraId])=>obraId===id)?id:''}}})),[guard,tenant]);
 const filtro=useMemo(()=>({obra,obras,cambiar:cambiarObra,registrar}),[obra,obras,cambiarObra,registrar]);
 const seleccionarEmpresa=(id:string)=>guard.solicitar(()=>{if(!creador||!contexto?.empresas.some(e=>e.id===id))return;useAccessStore.setState({empresaId:id});setCambiarEmpresa(false)});
 const abrir=(id:CategoriaDirectorio|null)=>guard.solicitar(()=>setCategoria(id));
 useImperativeHandle(handleRef,()=>({irInicio:()=>guard.solicitar(()=>setCategoria(null))}),[guard]);
 const permiso=(id:CategoriaDirectorio)=>disponible&&puedeVerDirectorio(contexto,tenant||undefined,id);
 return <div className={s.page}>
  {categoria&&<button type="button" className={s.back} onClick={()=>abrir(null)}><IconoDirectorio tipo="volver"/>Directorio</button>}
  {categoria&&<nav className={s.tabs} aria-label="Categorías del Directorio">{categoriasDirectorio.map(c=><button key={c.id} type="button" aria-pressed={categoria===c.id} disabled={!permiso(c.id)} onClick={()=>abrir(c.id)}><IconoDirectorio tipo={c.id}/>{'corto'in c?c.corto:c.nombre}</button>)}</nav>}
  <header className={s.header}><div><h1>{elegida?.nombre??'Directorio'}</h1><p>{elegida?.descripcion??'Personas y empresas vinculadas a tus obras.'}</p></div>{empresa&&(creador&&categoria?<button type="button" className={s.company} aria-label="Cambiar empresa del Directorio" onClick={()=>guard.solicitar(()=>setCambiarEmpresa(true))}><IconoDirectorio tipo="empresa"/>{empresa.nombre}<span aria-hidden="true">⌄</span></button>:<span className={s.scope}><IconoDirectorio tipo="empresa"/>{empresa.nombre}</span>)}</header>
  {!disponible?<p className={s.state} role="status">Validando los permisos del Directorio…</p>:!creador&&!tenant?<section className={s.state} role="alert"><h2>No se pudo identificar tu empresa activa</h2><p>Revisá con tu administrador la empresa asignada a tu cuenta. No se muestran datos de otras empresas.</p></section>:!categoria?<div className={s.cards}>{categoriasDirectorio.map(c=><button key={c.id} className={s.card} type="button" disabled={!permiso(c.id)} onClick={()=>abrir(c.id)}><span className={s.icon}><IconoDirectorio tipo={c.id}/></span><span><strong>{c.nombre}</strong><small>{c.descripcion}</small>{'proxima'in c&&<small className={s.badge}>Próxima etapa</small>}<span className={s.action}>{!permiso(c.id)?'Sin permiso':'proxima'in c?'Ver próxima etapa':`Ver ${'corto'in c?c.corto.toLocaleLowerCase('es'):c.nombre.toLocaleLowerCase('es')}`}<IconoDirectorio tipo="flecha"/></span></span></button>)}</div>:!permiso(categoria)?<section className={s.state} role="alert"><h2>Sin acceso a esta categoría</h2><p>Tu cuenta no tiene permiso para consultar {elegida?.nombre.toLocaleLowerCase('es')} en esta empresa.</p></section>:!empresa&&creador?<SeleccionEmpresa onSeleccionar={seleccionarEmpresa}/>:empresa?<FiltroObraDirectorioContext.Provider value={filtro} key={tenant}>
   {categoria==='clientes'?<FichasAdministracion key="clientes" tipo="cliente" tenantId={tenant} listadoClientes mostrarTitulo={false} onSeleccionar={()=>{}}/>:categoria==='contratistas'?<FichasAdministracion key="contratistas" tipo="contratista" tenantId={tenant} listadoContratistas mostrarTitulo={false} onSeleccionar={()=>{}}/>:categoria==='responsables'?<ContenidoResponsables key="responsables" tenant={tenant}/>:<section className={s.state}><span className={s.badge}>Próxima etapa</span><h2>Directorio de contactos</h2><p>La ficha enriquecida de Contactos todavía no está disponible. Los contactos actuales y sus vínculos se conservan en Administración → Contactos.</p>{obra&&<small>Obra seleccionada: {obras.find(([id])=>id===obra)?.[1]??'Obra del Directorio'}</small>}</section>}
  </FiltroObraDirectorioContext.Provider>:null}
  {!categoria&&<p className={s.hint}>Un acceso para tus cuatro directorios. Las fichas conservan su historial y sus permisos.</p>}
  {cambiarEmpresa&&creador&&<PanelAdministracion modal titulo="Empresa del Directorio" onCerrar={()=>setCambiarEmpresa(false)}><SeleccionEmpresa onSeleccionar={seleccionarEmpresa}/></PanelAdministracion>}
 </div>;
}

function SeleccionEmpresa({onSeleccionar}:{onSeleccionar:(id:string)=>void}){
 const contexto=useAccessStore(s=>s.contexto),[buscar,setBuscar]=useState('');
 const normal=(v:string)=>v.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('es');
 const empresas=contexto?.empresas.filter(e=>normal(e.nombre).includes(normal(buscar.trim())))??[];
 return <section className={s.choose} aria-label="Seleccionar empresa del Directorio"><span className={s.scope}><IconoDirectorio tipo="empresa"/>Acceso del creador</span><div><h2>¿Qué empresa querés consultar?</h2><p>Elegí una vez. La empresa se conserva al cambiar de categoría.</p></div><label className={s.search}>Buscar empresa<input type="search" value={buscar} placeholder="Nombre de la empresa…" onChange={e=>setBuscar(e.target.value)}/></label><div className={s.companies}>{empresas.map(e=><button type="button" key={e.id} onClick={()=>onSeleccionar(e.id)}><IconoDirectorio tipo="empresa"/><span><strong>{e.nombre}</strong><small>{e.activa===false?'Empresa inactiva · historial conservado':'Empresa del Directorio'}</small></span><IconoDirectorio tipo="flecha"/></button>)}{!empresas.length&&<p>No hay empresas con ese nombre.</p>}</div></section>;
}
