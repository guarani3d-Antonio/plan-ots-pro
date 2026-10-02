import { useId } from 'react';
import { VoiceInputButton } from '../ui/VoiceInputButton';
import styles from './ModalInformeOT.module.css';

export function CampoTextoInforme({ etiqueta, value, onChange, disabled, multiline = false, rows = 2, placeholder = 'No registrado', type = 'text', maxLength }: {
  etiqueta:string; value:string; onChange:(value:string) => void; disabled?:boolean;
  multiline?:boolean; rows?:number; placeholder?:string; type?:string; maxLength?:number;
}) {
  const dictable = multiline || ['text','email','tel'].includes(type);
  const id = useId();
  return <div className={`${styles.originField} ${multiline ? styles.narrativeField : ''}`}>
    <span className={styles.fieldLabel}><label htmlFor={id}>{etiqueta}</label>{dictable && <VoiceInputButton compact value={value} onChange={onChange} disabled={disabled} maxLength={maxLength} />}</span>
    {multiline ? <textarea id={id} value={value} onChange={e => onChange(e.target.value)} disabled={disabled} rows={rows} placeholder={placeholder} maxLength={maxLength} />
      : <input id={id} type={type} value={value} onChange={e => onChange(e.target.value)} disabled={disabled} placeholder={placeholder} maxLength={maxLength} />}
  </div>;
}
