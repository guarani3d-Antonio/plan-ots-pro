import {useState} from 'react';
import {tienePermiso} from '../../stores/accessStore';
import {DialogoComercio} from './DialogoComercio';
import {PresupuestosContratista} from './PresupuestosContratista';
import {EvaluacionesContratista} from './EvaluacionesContratista';
import s from './ComercioContratista.module.css';
export function OperacionesContratistaOT({ordenId,proyectoId,bloqueado,onBloqueado}:{ordenId:string;proyectoId:string;bloqueado:boolean;onBloqueado:()=>void}){
 const [open,setOpen]=useState<'presupuestos'|'evaluaciones'|null>(null);const show=(kind:typeof open)=>{if(bloqueado){onBloqueado();return;}setOpen(kind);};
 return <div className={s.root}><div className={s.toolbar}><strong>Contratistas · presupuesto y evaluación</strong><div className={s.actions}>{tienePermiso('costos.ver',proyectoId)&&<button type="button" onClick={()=>show('presupuestos')}>Presupuestos</button>}{tienePermiso('informe.ver',proyectoId)&&<button type="button" onClick={()=>show('evaluaciones')}>Evaluaciones</button>}</div></div>{open&&<DialogoComercio titulo={open==='presupuestos'?'Presupuestos de esta OT':'Evaluaciones de esta OT'} onClose={()=>setOpen(null)}>{open==='presupuestos'?<PresupuestosContratista ordenId={ordenId}/>:<EvaluacionesContratista ordenId={ordenId}/>}</DialogoComercio>}</div>;
}
