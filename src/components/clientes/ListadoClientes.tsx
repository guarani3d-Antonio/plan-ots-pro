import {useMemo,useState} from 'react';
import type {ClienteDirectorio} from '../../services/customerProfileService';
import {filtrarDirectorioClientes} from '../../services/customerDirectoryModel';
import {fechaPerfil} from '../../services/customerProfileModel';
import {FotoDirectorio} from '../plano/FotoDirectorio';
import {CargaDirectorio} from './CargaDirectorio';
import s from './ListadoClientes.module.css';

export function ListadoClientes({registros,cargando,error,puedeCrear,onCrear,onVer,onReintentar}:{
 registros:ClienteDirectorio[];cargando:boolean;error:string;puedeCrear:boolean;
 onCrear:()=>void;onVer:(f:ClienteDirectorio)=>void;onReintentar:()=>void;
}){
 const [buscar,setBuscar]=useState(''),[obra,setObra]=useState('todos'),[estado,setEstado]=useState('todos');
 const obras=useMemo(()=>[...new Map(registros.flatMap(c=>c.ubicaciones.map(u=>[u.obra_id,u.nombre_obra] as const))).entries()].sort((a,b)=>a[1].localeCompare(b[1],'es')),[registros]);
 const obraActual=obras.some(([id])=>id===obra)?obra:'todos';
 const resultados=filtrarDirectorioClientes(registros,buscar,obraActual,estado);
 return <section className={s.listado} aria-label="Directorio de clientes">
  <div className={s.toolbar}>
   <label className={s.search}><span aria-hidden="true">⌕</span><input type="search" aria-label="Buscar clientes" placeholder="Buscar cliente, CI / RUC, obra o unidad…" value={buscar} onChange={e=>setBuscar(e.target.value)}/></label>
   <select aria-label="Filtrar clientes por obra" value={obraActual} onChange={e=>setObra(e.target.value)}><option value="todos">Todas las obras</option>{obras.map(([id,nombre])=><option key={id} value={id}>{nombre}</option>)}</select>
   <select aria-label="Filtrar clientes por estado" value={estado} onChange={e=>setEstado(e.target.value)}><option value="todos">Todos los clientes</option><option value="activos">Activos</option><option value="inactivos">Inactivos</option><option value="abiertas">Con OTs abiertas</option></select>
   <button className={s.crear} type="button" disabled={cargando||!puedeCrear} onClick={onCrear}>+ Crear cliente</button>
  </div>
  {error?<div className={s.message} role="alert"><p>No se pudo cargar el directorio. {error}</p><button type="button" onClick={onReintentar}>Reintentar</button></div>:cargando&&!registros.length?<CargaDirectorio nombre="clientes"/>:<>
   {resultados.length?<table className={s.table}><thead><tr><th>Cliente</th><th>Obra / unidad</th><th>Contacto</th><th>Atenciones / encuestas</th><th><span className={s.srOnly}>Abrir ficha</span></th></tr></thead><tbody>{resultados.map(c=>{const i=c.indicadores,ubicaciones=obraActual==='todos'?c.ubicaciones:c.ubicaciones.filter(u=>u.obra_id===obraActual);return <tr key={c.id}>
    <td><div className={s.identity}><div className={s.photo}><FotoDirectorio tipo="cliente" id={c.id} nombre={String(c.datos.nombre??'Cliente')}/></div><div><strong>{String(c.datos.nombre??'Cliente')}</strong><small>{String(c.datos.identificacion??'Sin CI / RUC')}</small><small>{c.datos.activo===false?'Inactivo':'Activo'}{!c.completa?' · Datos por completar':''}</small></div></div></td>
    <td>{ubicaciones.length?ubicaciones.slice(0,2).map(u=><div className={s.location} key={u.id}><strong>{u.nombre_obra}</strong><small>{[u.datos_adicionales.torre,u.piso&&`Piso ${u.piso}`,u.unidad,u.sector].filter(Boolean).join(' · ')||u.direccion||'Dirección por completar'}{!u.activo?' · Ubicación inactiva':''}</small></div>):<small>Obra por vincular</small>}{ubicaciones.length>2&&<small>+{ubicaciones.length-2} ubicaciones en la ficha</small>}</td>
    <td>{String(c.datos.telefono||'Sin teléfono')}<small>{String(c.datos.correo||'Sin correo')}</small></td>
    <td>{i.total?<><strong>{i.total} {i.total===1?'OT':'OTs'}</strong>{i.abiertas>0&&<> · <span className={s.open}>{i.abiertas} {i.abiertas===1?'abierta':'abiertas'}</span></>}</>:'Sin atenciones'}<small className={i.satisfaccion!==null?s.rating:undefined}>{i.encuestasRespondidas?`${i.satisfaccion!==null?'☆ '+i.satisfaccion.toLocaleString('es-PY',{maximumFractionDigits:1})+' / 10 · ':''}${i.encuestasRespondidas} ${i.encuestasRespondidas===1?'respuesta':'respuestas'}`:'Sin encuestas respondidas'}</small>{i.ultima&&<small>Última OT · {fechaPerfil(i.ultima)}</small>}</td>
    <td><button type="button" aria-label={`Ver cliente ${c.datos.nombre}`} onClick={()=>onVer(c)}>Ver</button></td>
   </tr>})}</tbody></table>:<p className={s.message}>{registros.length?'No hay clientes que coincidan con los filtros.':'Todavía no hay clientes registrados en esta empresa.'}</p>}
   <footer className={s.footer} aria-live="polite"><span>{resultados.length} de {registros.length} clientes</span><span role={cargando?'status':undefined}>{cargando?'Actualizando directorio…':'Historial vinculado a cada ficha'}</span></footer>
  </>}
 </section>;
}
