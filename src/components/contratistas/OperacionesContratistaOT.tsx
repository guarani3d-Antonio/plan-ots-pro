import {useState} from 'react';
import {tienePermiso} from '../../stores/accessStore';
import {DialogoComercio} from './DialogoComercio';
import {EvaluacionesContratista} from './EvaluacionesContratista';
import s from './ComercioContratista.module.css';
export function OperacionesContratistaOT({ordenId,proyectoId,bloqueado,onBloqueado}:{ordenId:string;proyectoId:string;bloqueado:boolean;onBloqueado:()=>void}){
 const [open,setOpen]=useState(false);const show=()=>{if(bloqueado){onBloqueado();return;}setOpen(true);};
 return <div className={s.root}>{tienePermiso('informe.ver',proyectoId)&&<div className={s.actions}><button type="button" onClick={show}>Evaluaciones de esta OT</button><small>La evaluación corresponde al trabajo realizado y su cierre.</small></div>}{open&&<DialogoComercio titulo="Evaluaciones de esta OT" onClose={()=>setOpen(false)}><EvaluacionesContratista ordenId={ordenId}/></DialogoComercio>}</div>;
}
