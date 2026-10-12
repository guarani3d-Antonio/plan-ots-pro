import { useId } from 'react';
import { VoiceInputButton } from '../ui/VoiceInputButton';
import styles from './ModalInformeOT.module.css';
import fields from './InformeCampos.module.css';

export function IconoLectura() {
  return <svg className={fields.lock} viewBox="0 0 16 16" fill="none" aria-hidden="true"><rect x="3.5" y="7" width="9" height="6" rx="1.5" stroke="currentColor"/><path d="M5.5 7V4.5a2.5 2.5 0 0 1 5 0V7" stroke="currentColor"/></svg>;
}

export function EtiquetaLectura() {
  return <span className={fields.badge}><IconoLectura/>Solo lectura</span>;
}

export function DatoInforme({ etiqueta, value, multiline=false }: { etiqueta: string; value: string; multiline?:boolean }) {
  return <div className={fields.field} data-field-state="readonly"><span className={fields.label}>{etiqueta}<IconoLectura/></span><div className={`${fields.value} ${multiline?fields.multiline:''} ${!value?fields.empty:''}`}>{value || 'No registrado'}</div></div>;
}

export function CampoTextoInforme({ etiqueta, value, onChange, disabled, multiline = false, rows = 2, placeholder = 'No registrado', type = 'text', maxLength }: {
  etiqueta:string; value:string; onChange:(value:string) => void; disabled?:boolean;
  multiline?:boolean; rows?:number; placeholder?:string; type?:string; maxLength?:number;
}) {
  const dictable = multiline || ['text','email','tel'].includes(type);
  const id = useId();
  if(disabled)return <DatoInforme etiqueta={etiqueta} value={value} multiline={multiline}/>;
  return <div className={`${styles.originField} ${multiline ? styles.narrativeField : ''}`}>
    <span className={styles.fieldLabel}><label htmlFor={id}>{etiqueta}</label>{dictable && <VoiceInputButton compact value={value} onChange={onChange} disabled={disabled} maxLength={maxLength} />}</span>
    {multiline ? <textarea id={id} value={value} onChange={e => onChange(e.target.value)} disabled={disabled} rows={rows} placeholder={placeholder} maxLength={maxLength} />
      : <input id={id} type={type} value={value} onChange={e => onChange(e.target.value)} disabled={disabled} placeholder={placeholder} maxLength={maxLength} />}
  </div>;
}
