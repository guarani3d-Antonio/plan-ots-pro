import {useMemo,useState} from 'react';
import type {ResponsableFicha} from '../../services/responsibleProfileService';
import {coincideBusqueda} from '../../utils/busqueda';
import {CargaDirectorio} from '../clientes/CargaDirectorio';
import {FotoResponsable} from './FotoResponsable';
import {useFiltroObraDirectorio} from '../directorio/FiltroObraDirectorio';
import s from '../clientes/ListadoClientes.module.css';
export function ListadoResponsables({registros,cargando,error,puedeCrear,onCrear,onVer,onReintentar}:{registros:ResponsableFicha[];cargando:boolean;error:string;puedeCrear:boolean;onCrear:()=>void;onVer:(p:ResponsableFicha)=>void;onReintentar:()=>void}){
 const [texto,setTexto]=useState('');
 const locales=useMemo(()=>[...new Map(registros.flatMap(p=>p.obras.map(w=>[w.id,w.nombre] as const)))].sort((a,b)=>a[1].localeCompare(b[1],'es')),[registros]);
 const {obras,obra:actual,setObra}=useFiltroObraDirectorio(locales);
 const visibles=registros.filter(p=>(!actual||p.obras.some(w=>w.id===actual))&&coincideBusqueda([p.nombre,p.email,p.cargo,...Object.values(p.datos)].join(' '),texto));
 return <section className={s.listado} aria-label="Directorio de responsables"><div className={s.toolbar}>
  <label className={s.search}><span aria-hidden="true">⌕</span><input type="search" aria-label="Buscar responsables" placeholder="Nombre, documento, especialidad o correo…" value={texto} onChange={e=>setTexto(e.target.value)}/></label>
  <select aria-label="Filtrar responsables por obra" value={actual} onChange={e=>setObra(e.target.value)}><option value="">Todas las obras</option>{obras.map(([id,nombre])=><option key={id} value={id}>{nombre}</option>)}</select>
  {puedeCrear&&<button className={s.crear} type="button" onClick={onCrear} disabled={cargando}>+ Vincular responsable</button>}
 </div>{error?<div className={s.message} role="alert"><p>No se pudo cargar el directorio. {error}</p><button onClick={onReintentar}>Reintentar</button></div>:cargando&&!registros.length?<CargaDirectorio nombre="responsables"/>:<>
 {visibles.length?<table className={s.table}><thead><tr><th>Responsable / Técnico</th><th>Especialidad / obras</th><th>Contacto</th><th>Carga de trabajo</th><th><span className={s.srOnly}>Abrir ficha</span></th></tr></thead><tbody>{visibles.map(p=><tr key={p.id}>
  <td><div className={s.identity}><FotoResponsable compacta id={p.id} nombre={p.nombre} path={p.avatar_path}/><div><strong>{p.nombre}</strong><small>{p.activo?'Cuenta activa':'Cuenta inactiva'}</small><small>{p.datos.documento||'Documento por completar'}</small></div></div></td>
  <td>{p.datos.especialidad||p.cargo||'Especialidad por completar'}<small>{p.obras.length?`${p.obras.length} ${p.obras.length===1?'obra vinculada':'obras vinculadas'}`:'Sin obras visibles vinculadas'}</small></td>
  <td>{p.datos.telefono||'Sin teléfono cargado'}<small>{p.email}</small></td>
  <td><strong>{p.indicadores.total} OT</strong> · <span className={s.open}>{p.indicadores.abiertas} {p.indicadores.abiertas===1?'abierta':'abiertas'}</span><small>{p.indicadores.cerradas} {p.indicadores.cerradas===1?'cerrada':'cerradas'} · todas sus obras visibles</small></td>
  <td><button type="button" aria-label={`Ver responsable ${p.nombre}`} onClick={()=>onVer(p)}>Ver</button></td>
 </tr>)}</tbody></table>:<p className={s.message}>{registros.length?'Sin responsables para esta búsqueda.':'Sin responsables vinculados todavía. Las cuentas con OT asignadas aparecen automáticamente.'}</p>}
 <footer className={s.footer} aria-live="polite"><span>{visibles.length} de {registros.length} responsables</span><span role={cargando?'status':undefined}>{cargando?'Actualizando directorio…':'Cuentas vinculadas · historial por identidad'}</span></footer></>}</section>;
}
