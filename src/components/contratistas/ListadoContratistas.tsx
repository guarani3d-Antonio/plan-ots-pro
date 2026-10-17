import {useMemo,useState} from 'react';
import type {ContratistaDirectorio} from '../../services/contractorProfileService';
import {normalizarMaestro} from '../../services/masterDirectoryService';
import {FotoDirectorio} from '../plano/FotoDirectorio';
import {CargaDirectorio} from '../clientes/CargaDirectorio';
import s from '../clientes/ListadoClientes.module.css';
export function ListadoContratistas({registros,cargando,error,puedeCrear,onCrear,onVer,onReintentar}:{registros:ContratistaDirectorio[];cargando:boolean;error:string;puedeCrear:boolean;onCrear:()=>void;onVer:(f:ContratistaDirectorio)=>void;onReintentar:()=>void}){
 const [buscar,setBuscar]=useState(''),[obra,setObra]=useState('todos');
 const obras=useMemo(()=>[...new Map(registros.flatMap(c=>c.obras.map(o=>[o.id,o.nombre] as const)))].sort((a,b)=>a[1].localeCompare(b[1],'es')),[registros]);
 const filtro=obras.some(([id])=>id===obra)?obra:'todos',q=normalizarMaestro(buscar.trim());
 const resultados=registros.filter(c=>(filtro==='todos'||c.obras.some(o=>o.id===filtro))&&normalizarMaestro([...Object.values(c.datos),...c.vinculos.map(v=>v.contacto_nombre)].join(' ')).includes(q));
 return <section className={s.listado} aria-label="Directorio de contratistas"><div className={s.toolbar}>
  <label className={s.search}><span aria-hidden="true">⌕</span><input type="search" aria-label="Buscar contratistas" placeholder="Nombre, RUC, especialidad o contacto…" value={buscar} onChange={e=>setBuscar(e.target.value)}/></label>
  <select aria-label="Filtrar contratistas por obra" value={filtro} onChange={e=>setObra(e.target.value)}><option value="todos">Todas las obras</option>{obras.map(([id,nombre])=><option key={id} value={id}>{nombre}</option>)}</select>
  <button type="button" className={s.crear} disabled={cargando||!puedeCrear} onClick={onCrear}>+ Contratista</button>
 </div>{error?<div className={s.message} role="alert"><p>No se pudo cargar el directorio. {error}</p><button onClick={onReintentar}>Reintentar</button></div>:cargando&&!registros.length?<CargaDirectorio nombre="contratistas"/>:<>
 {resultados.length?<table className={s.table}><thead><tr><th>Contratista</th><th>Especialidad / obras</th><th>Contacto</th><th>Trabajos</th><th><span className={s.srOnly}>Abrir ficha</span></th></tr></thead><tbody>{resultados.map(c=><tr key={c.id}>
  <td><div className={s.identity}><div className={s.photo}><FotoDirectorio tipo="contratista" id={c.id} nombre={String(c.datos.nombre??'Contratista')}/></div><div><strong>{String(c.datos.nombre??'Contratista')}</strong><small>{c.datos.tipo==='empresa'?'Empresa':c.datos.tipo==='independiente'?'Independiente':'Tipo por completar'} · {String(c.datos.identificacion||'Sin CI / RUC')}</small><small>{c.datos.activo===false?'Inactivo':c.completa?'Activo':'Datos por completar'}</small></div></div></td>
  <td>{String(c.datos.especialidad||'Especialidad por completar')}<small>{c.obras.length?`${c.obras.length} ${c.obras.length===1?'obra vinculada':'obras vinculadas'}`:'Sin obras vinculadas'}</small></td>
  <td>{String(c.datos.telefono||'Sin teléfono')}<small>{c.vinculos.find(v=>v.principal&&v.activo)?.contacto_nombre??String(c.datos.contacto||'Sin contacto principal')}</small><small>{String(c.datos.correo||'Sin correo')}</small></td>
  <td><strong>{c.indicadores.total} OT</strong>{c.indicadores.abiertas>0&&<> · <span className={s.open}>{c.indicadores.abiertas} {c.indicadores.abiertas===1?'abierta':'abiertas'}</span></>}<small>Presupuestos y evaluaciones en la ficha</small></td>
  <td><button type="button" aria-label={`Ver contratista ${c.datos.nombre}`} onClick={()=>onVer(c)}>Ver</button></td>
 </tr>)}</tbody></table>:<p className={s.message}>{registros.length?'Sin contratistas para esta búsqueda.':'Todavía no hay contratistas registrados en esta empresa.'}</p>}
 <footer className={s.footer} aria-live="polite"><span>{resultados.length} de {registros.length} contratistas</span><span role={cargando?'status':undefined}>{cargando?'Actualizando directorio…':'Historial vinculado a cada ficha'}</span></footer></>}</section>;
}
