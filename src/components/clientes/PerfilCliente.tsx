import {useEffect,useState} from 'react';
import {cargarPerfilCliente,type AtencionCliente,type PerfilCliente as DatosPerfil} from '../../services/customerProfileService';
import {encuestaRespondida,fechaPerfil,limitesPerfil,resumenEncuestas} from '../../services/customerProfileModel';
import {ENCUESTA_PREGUNTAS} from '../../services/otStageSchema';
import {ModalDetalleOT} from '../grilla/ModalDetalleOT';
import s from './PerfilCliente.module.css';

export type PestanaCliente='resumen'|'datos'|'reclamos'|'encuestas';
export function PerfilCliente({tenantId,clienteId,tab,onTab,actualizacion=0}:{tenantId:string;clienteId:string;tab:Exclude<PestanaCliente,'datos'>;onTab:(tab:PestanaCliente)=>void;actualizacion?:number}){
 const [periodo,setPeriodo]=useState('todos'),[estado,setEstado]=useState('Todos'),[pagina,setPagina]=useState(0),[perfil,setPerfil]=useState<DatosPerfil|null>(null),[error,setError]=useState(''),[cargando,setCargando]=useState(true),[revision,setRevision]=useState(0),[modal,setModal]=useState<AtencionCliente|null>(null);
 useEffect(()=>{let active=true;setCargando(true);setError('');setPerfil(null);const {desde,hasta}=limitesPerfil(periodo);
 void cargarPerfilCliente(tenantId,clienteId,desde,hasta,tab,pagina,tab==='reclamos'?estado:'Todos').then(r=>{if(active)setPerfil(r)}).catch(e=>{if(active)setError(e.message)}).finally(()=>{if(active)setCargando(false)});return()=>{active=false};
 },[tenantId,clienteId,tab,periodo,pagina,estado,revision,actualizacion]);
 useEffect(()=>{setPagina(0)},[tab]);
 const n=(value:number)=>value.toLocaleString('es-PY',{maximumFractionDigits:1});
 const go=(next:PestanaCliente,filter='Todos')=>{setEstado(filter);setPagina(0);onTab(next)};
 const encuesta=perfil?resumenEncuestas(perfil.valoraciones):null;
 const total=tab==='encuestas'?perfil?.totalEncuestas:perfil?.totalOrdenes;
 return <div className={s.profile}>
  <div className={s.toolbar}><strong>{tab==='resumen'?'Dashboard del cliente':tab==='reclamos'?'Historial de reclamos':'Encuestas y comentarios'}</strong><label>Período<select aria-label="Período del historial" value={periodo} onChange={e=>{setPeriodo(e.target.value);setPagina(0)}}><option value="todos">Todo el historial</option><option value="90">Últimos 90 días</option><option value="mes">Mes actual</option></select></label></div>
  {cargando&&<p role="status">Cargando historial…</p>}{error&&<div role="alert"><p>{error}</p><button type="button" onClick={()=>setRevision(v=>v+1)}>Reintentar</button></div>}
  {perfil&&<>
   {tab==='resumen'&&<>
    <div className={s.metrics}>
     <button type="button" onClick={()=>go('reclamos')}><span>Reclamos / OTs</span><b>{perfil.resumen.total}</b><small>Atenciones vinculadas</small></button>
     <button type="button" onClick={()=>go('reclamos','Activos')}><span>Por resolver</span><b>{perfil.resumen.pendiente+perfil.resumen.enProceso}</b><small>Pendientes y en proceso</small></button>
     <button type="button" onClick={()=>go('reclamos','Cerrada')}><span>Resueltos</span><b>{perfil.resumen.cerrada}</b><small>Órdenes cerradas</small></button>
     <button type="button" onClick={()=>go('encuestas')}><span>Encuestas · promedio</span><b>{encuesta?.promedio==null?'—':`${n(encuesta.promedio)} / 10`}</b><small>{encuesta?.conPuntaje?`${encuesta.conPuntaje} encuestas con puntaje`:'Sin valoraciones registradas'}</small></button>
    </div>
    <div className={s.summary}>
     <section className={s.section}><h3>Atenciones por mes</h3>{perfil.meses.length?perfil.meses.slice(-12).map(m=><div className={s.barRow} key={m.mes}><span>{m.mes}</span><div className={s.track} role="img" aria-label={`${m.mes}: ${m.cantidad} atenciones`}><div style={{width:`${m.cantidad/Math.max(...perfil.meses.map(v=>v.cantidad))*100}%`}}/></div><strong>{m.cantidad}</strong></div>):<p>Sin atenciones en el período.</p>}<small>Fecha de recepción · últimos 12 meses con registros</small></section>
     <section className={s.section}><h3>Estado de la atención</h3>{[['Pendiente',perfil.resumen.pendiente],['En proceso',perfil.resumen.enProceso],['Cerrada',perfil.resumen.cerrada],['No aplica',perfil.resumen.noAplica]].map(([label,value])=><div className={s.stateRow} key={label}><button type="button" onClick={()=>go('reclamos',String(label))}>{label}</button><strong>{value}</strong></div>)}<div className={s.stateRow}><span>Recepción → fin registrado</span><strong>{perfil.resumen.diasCierre==null?'Sin datos':`${n(perfil.resumen.diasCierre)} días`}</strong></div><small>{perfil.resumen.cierresConFecha} cierres con fechas válidas · días corridos</small></section>
    </div>
    <section className={s.section}><h3>Actividad reciente</h3>{perfil.ordenes.slice(0,3).map(o=><div className={s.activity} key={o.id}><div><strong>{o.descripcion||o.rubro||o.ot}</strong><small>{fechaPerfil(o.recepcion)} · {o.ot} · {o.obra}</small></div><button type="button" onClick={()=>setModal(o)}>Ver OT</button></div>)}{!perfil.ordenes.length&&<p>El historial se completará al vincular OTs a esta ficha.</p>}</section>
    <small>{encuesta?.respondidas??0} de {perfil.totalEncuestas} encuestas respondidas. El promedio usa respuestas de 1 a 10; N/A y registros de escalas anteriores no se convierten.</small>
   </>}
   {tab==='reclamos'&&<>
    <div className={s.toolbar}><label>Estado<select aria-label="Estado de los reclamos" value={estado} onChange={e=>{setEstado(e.target.value);setPagina(0)}}>{['Todos','Activos','Pendiente','En proceso','Cerrada','No aplica'].map(v=><option key={v}>{v}</option>)}</select></label><small>{perfil.totalOrdenes} atenciones vinculadas</small></div>
    {perfil.ordenes.map(o=><article className={s.record} key={o.id}><div className={s.recordHead}><div><strong>{o.descripcion||o.rubro||o.ot}</strong><small>{fechaPerfil(o.recepcion)} · {o.ot} · {o.obra}</small><small>{[o.torre,o.unidad,o.sector].filter(Boolean).join(' · ')}</small></div><span className={s.status}>{o.estado}</span><button type="button" onClick={()=>setModal(o)}>Ver OT</button></div>{o.reclamos_qr.length>0&&<small>Origen QR: {o.reclamos_qr.map(r=>r.numero).join(' · ')}</small>}</article>)}
    {!perfil.ordenes.length&&<p>Sin atenciones para este filtro.</p>}
   </>}
   {tab==='encuestas'&&<>
    <small>{encuesta?.respondidas??0} respondidas · {Math.max(0,perfil.totalEncuestas-(encuesta?.respondidas??0))} sin respuesta confirmada</small>
    {perfil.encuestas.map(e=>{const responded=e.guardada&&encuestaRespondida(e.datos),value=resumenEncuestas([e.datos]).promedio;return <article className={s.record} key={e.id}><div className={s.recordHead}><div><strong>{e.codigo}{e.revision!==null?` · R${e.revision}`:''}</strong><small>{e.ot} · {e.obra} · {fechaPerfil(e.fecha)}</small></div><span className={s.status}>{responded?(value===null?'Respondida · N/A':`${n(value)} / 10`):'Sin respuesta confirmada'}</span></div>{e.datos.sugerencias&&<p>{e.datos.sugerencias}</p>}<details><summary>Ver encuesta</summary>{responded?<>{ENCUESTA_PREGUNTAS.map(([key,label])=><div className={s.answer} key={key}><span>{label}</span><strong>{e.datos[key]||'—'}</strong></div>)}<small>Respondente: {e.datos.respondente} · Fecha: {fechaPerfil(e.datos.fechaRespuesta)} · {e.datos.modalidad}<br/>{e.datos.referenciaFuente||'Sin referencia de origen registrada'}</small></>:<p>{e.guardada?'Esta versión no contiene una respuesta completa del cliente.':'Documento preparado, todavía sin versión guardada.'}</p>}</details></article>})}
    {!perfil.encuestas.length&&<p>Todavía no hay encuestas vinculadas en este período.</p>}
    <small>Se muestra la última versión de cada encuesta. Sin respuesta no equivale a cero.</small>
   </>}
   {tab!=='resumen'&&(total??0)>perfil.tamanoPagina&&<div className={s.toolbar}><button type="button" disabled={pagina===0} onClick={()=>setPagina(v=>v-1)}>Anterior</button><small>Página {pagina+1} de {Math.ceil((total??0)/perfil.tamanoPagina)}</small><button type="button" disabled={(pagina+1)*perfil.tamanoPagina>=(total??0)} onClick={()=>setPagina(v=>v+1)}>Siguiente</button></div>}
  </>}
  <small>Solo registros vinculados por identidad a esta ficha y visibles para tu perfil.</small>
  {modal&&<ModalDetalleOT orden={{...modal,created_at:modal.recepcion,fecha_ingreso:modal.recepcion,fecha_fin_trabajos:modal.cierre??undefined,descripcion:modal.descripcion??'',comentarios:modal.comentarios??''}} proyectoId={modal.proyecto_id} onClose={()=>setModal(null)} onGuardado={()=>setRevision(v=>v+1)}/>}
 </div>;
}
