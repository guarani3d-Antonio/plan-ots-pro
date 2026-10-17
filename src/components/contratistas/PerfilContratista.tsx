import {useEffect,useState} from 'react';
import {PresupuestosContratista} from './PresupuestosContratista';
import {EvaluacionesContratista} from './EvaluacionesContratista';
import {ResumenComercioContratista} from './ResumenComercioContratista';
import {cargarPerfilContratista,type PerfilContratistaDatos,type TrabajoContratista} from '../../services/contractorProfileService';
import {fechaPerfil,limitesPerfil} from '../../services/customerProfileModel';
import {ModalDetalleOT} from '../grilla/ModalDetalleOT';
import s from '../clientes/PerfilCliente.module.css';
import c from './PerfilContratista.module.css';
import {CargaDirectorio} from '../clientes/CargaDirectorio';
export type PestanaContratista='dashboard'|'datos'|'trabajos'|'presupuestos'|'evaluaciones';
export function PerfilContratista({tenantId,contratistaId,tab,onTab}:{tenantId:string;contratistaId:string;tab:Exclude<PestanaContratista,'datos'>;onTab:(t:PestanaContratista)=>void}){
 const [periodo,setPeriodo]=useState('todos'),[estado,setEstado]=useState('Todos'),[pagina,setPagina]=useState(0),[perfil,setPerfil]=useState<PerfilContratistaDatos|null>(null),[error,setError]=useState(''),[cargando,setCargando]=useState(true),[revision,setRevision]=useState(0),[detalle,setDetalle]=useState<string|null>(null),[modal,setModal]=useState<TrabajoContratista|null>(null);
 useEffect(()=>{if(tab==='presupuestos'||tab==='evaluaciones')return;let active=true;setPerfil(null);setError('');setCargando(true);const {desde,hasta}=limitesPerfil(periodo);
 void cargarPerfilContratista(tenantId,contratistaId,desde,hasta,pagina,tab==='trabajos'?estado:'Todos').then(r=>{if(active)setPerfil(r)}).catch(e=>{if(active)setError(e.message)}).finally(()=>{if(active)setCargando(false)});return()=>{active=false};
 },[tenantId,contratistaId,tab,periodo,estado,pagina,revision]);
 const go=(next:PestanaContratista,filter='Todos')=>{setEstado(filter);setPagina(0);setDetalle(null);onTab(next)};
 const n=(x:number)=>x.toLocaleString('es-PY',{maximumFractionDigits:1});
 if(tab==='presupuestos')return <PresupuestosContratista contratistaId={contratistaId}/>;
 if(tab==='evaluaciones')return <EvaluacionesContratista contratistaId={contratistaId}/>;
 return <div className={s.profile}><div className={s.toolbar}><strong>{tab==='dashboard'?'Dashboard del contratista':'Historial de trabajos'}</strong><label>Período<select aria-label="Período del historial" value={periodo} onChange={e=>{setPeriodo(e.target.value);setPagina(0)}}><option value="todos">Todo el historial</option><option value="90">Últimos 90 días</option><option value="mes">Mes actual</option></select></label></div>
 {cargando&&<CargaDirectorio nombre="historial del contratista"/>}{error&&<div role="alert"><p>{error}</p><button onClick={()=>setRevision(v=>v+1)}>Reintentar</button></div>}
 {perfil&&<>{tab==='dashboard'?<><div className={s.metrics}>
 <button onClick={()=>go('trabajos')}><span>OT vinculadas</span><b>{perfil.resumen.total}</b><small>Según fecha de ingreso</small></button>
 <button onClick={()=>go('trabajos','Activos')}><span>Por atender</span><b>{perfil.resumen.pendiente+perfil.resumen.enProceso}</b><small>Pendientes y en proceso</small></button>
 <button onClick={()=>go('trabajos','Cerrada')}><span>OT cerradas</span><b>{perfil.resumen.cerrada}</b><small>Cierre registrado</small></button>
 <button onClick={()=>go('trabajos','Cerrada')}><span>Inicio → fin real</span><b>{perfil.resumen.diasEjecucion===null?'—':`${n(perfil.resumen.diasEjecucion)} días`}</b><small>{perfil.resumen.cierresConFecha?`Promedio de ${perfil.resumen.cierresConFecha} OT · días corridos`:'Sin fechas suficientes'}</small></button></div>
 <div className={s.summary}><section className={s.section}><h3>Trabajos por obra</h3>{perfil.obras.map(o=><div className={c.barRow} key={o.id}><span>{o.nombre}</span><div className={s.track} role="img" aria-label={`${o.nombre}: ${o.cantidad} OT`}><div style={{width:`${o.cantidad/Math.max(1,...perfil.obras.map(w=>w.cantidad))*100}%`}}/></div><strong>{o.cantidad}</strong></div>)}{!perfil.obras.length&&<p>Sin trabajos registrados.</p>}</section>
 <section className={s.section}><h3>Estado de las OT vinculadas</h3>{[['Pendiente',perfil.resumen.pendiente],['En proceso',perfil.resumen.enProceso],['Cerrada',perfil.resumen.cerrada],['No aplica',perfil.resumen.noAplica]].map(([label,value])=><div className={s.stateRow} key={label}><button onClick={()=>go('trabajos',String(label))}>{label}</button><strong>{value}</strong></div>)}</section></div>
 <small>El plazo corresponde a la OT completa. La participación de varios contratistas no permite atribuir ese tiempo a uno solo.</small>
 <ResumenComercioContratista id={contratistaId} onPresupuestos={()=>go('presupuestos')} onEvaluaciones={()=>go('evaluaciones')}/>
 <section className={s.section}><h3>Actividad reciente</h3>{perfil.ordenes.slice(0,3).map(o=><div className={s.activity} key={o.id}><div><strong>{o.descripcion||o.rubro||o.ot}</strong><small>{o.ot} · {o.obra} · {fechaPerfil(o.recepcion)}</small></div><button onClick={()=>{go('trabajos');setDetalle(o.id)}}>Ver</button></div>)}{!perfil.ordenes.length&&<p>El historial se completará con los trabajos vinculados.</p>}</section></>:<>
 <div className={s.toolbar}><label>Estado<select aria-label="Estado de los trabajos" value={estado} onChange={e=>{setEstado(e.target.value);setPagina(0);setDetalle(null)}}>{['Todos','Activos','Pendiente','En proceso','Cerrada','No aplica'].map(v=><option key={v}>{v}</option>)}</select></label><small>{perfil.totalOrdenes} OT vinculadas</small></div>
 {perfil.ordenes.map(o=><article className={s.record} key={o.id}><div className={s.recordHead}><div><strong>{o.descripcion||o.rubro||o.ot}</strong><small>{o.ot} · {o.obra}</small></div><span className={s.status}>{o.estado}</span><button aria-expanded={detalle===o.id} onClick={()=>setDetalle(v=>v===o.id?null:o.id)}>{detalle===o.id?'Cerrar':'Ver OT'}</button></div>{detalle===o.id&&<div className={c.detail}><strong>{o.ot}</strong><dl>{[['Obra',o.obra],['Técnico / supervisor',o.responsable||'Sin registrar'],['Inicio real',fechaPerfil(o.inicio)],['Fin real',fechaPerfil(o.fin)],['Fecha límite de la OT',fechaPerfil(o.previsto)],['Participación',o.compartida?'Compartida con otro contratista':'Contratista único vinculado']].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl><div className={c.actions}><button type="button" onClick={()=>go('evaluaciones')}>Ver evaluaciones</button><button onClick={()=>setModal(o)}>Abrir detalle de OT</button></div></div>}</article>)}{!perfil.ordenes.length&&<p>Sin trabajos para este filtro.</p>}
 {perfil.totalOrdenes>perfil.tamanoPagina&&<div className={s.toolbar}><button disabled={!pagina} onClick={()=>setPagina(v=>v-1)}>Anterior</button><small>Página {pagina+1} de {Math.ceil(perfil.totalOrdenes/perfil.tamanoPagina)}</small><button disabled={(pagina+1)*perfil.tamanoPagina>=perfil.totalOrdenes} onClick={()=>setPagina(v=>v+1)}>Siguiente</button></div>}</>}
 </>}
 <small>Solo registros vinculados por identidad y visibles para tu perfil.</small>
 {modal&&<ModalDetalleOT orden={{...modal,created_at:modal.recepcion,fecha_ingreso:modal.recepcion,fecha_inicio_trabajos:modal.inicio??undefined,fecha_fin_trabajos:modal.fin??undefined,descripcion:modal.descripcion??''}} proyectoId={modal.proyecto_id} onClose={()=>setModal(null)} onGuardado={()=>setRevision(v=>v+1)}/>}
 </div>;
}
