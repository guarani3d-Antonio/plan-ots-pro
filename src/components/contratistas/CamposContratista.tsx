import {VoiceInputButton} from '../ui/VoiceInputButton';
import s from './CamposContratista.module.css';

// Same core form in the directory and in the work plan.
export const camposContratista = [
 ['nombre','Nombre / razón social',160],['identificacion','RUC / documento',80],
 ['contacto','Persona de contacto',160],['telefono','Teléfono',80],
 ['correo','Correo',254],['direccion','Dirección del contratista',500],
 ['especialidad','Especialidad principal',254],
] as const;
export function CamposContratista({datos,onChange,disabled=false,especialidad=true}:{especialidad?:boolean;datos:object;onChange:(key:string,value:string)=>void;disabled?:boolean}) {
 const values=datos as Record<string,unknown>;
 return <div className={s.grid}>{camposContratista.filter(([key])=>especialidad||key!=='especialidad').map(([key,label,max])=><label key={key} className={s.field}>
  <span>{label}<VoiceInputButton compact disabled={disabled} value={String(values[key]??'')} maxLength={max} onChange={v=>onChange(key,v)}/></span>
  <input aria-label={label} disabled={disabled} required={key==='nombre'} type={key==='correo'?'email':key==='telefono'?'tel':'text'} maxLength={max} value={String(values[key]??'')} onChange={e=>onChange(key,e.target.value)}/>
 </label>)}</div>;
}
