import styles from './ColorObra.module.css';

import {COLORES_OBRA,colorObra,estiloObra} from '../../utils/colorObra';
export function EtiquetaObra({ nombre, color }: { nombre: string; color?: string | null }) {
  return <span className={styles.pill} style={estiloObra(color)} title={nombre}><i style={{background:colorObra(color)}} aria-hidden="true"/>{nombre}</span>;
}
export function SelectorColorObra({ value, onChange, nombre, disabled=false }: { value:string;onChange:(color:string)=>void;nombre:string;disabled?:boolean }) {
  return <fieldset className={styles.selector} disabled={disabled}><legend>Color de referencia · 60 colores</legend>
    <EtiquetaObra nombre={nombre||'Nombre de la obra'} color={value}/>
    <div className={styles.palette} role="group" aria-label="Colores de referencia">{COLORES_OBRA.map((color,i)=><button key={color} type="button" style={{background:color}} aria-label={`Color ${i+1}: ${color}`} title={color} aria-pressed={value.toUpperCase()===color} onClick={()=>onChange(color)}>{value.toUpperCase()===color?'✓':''}</button>)}</div>
    <label className={styles.custom}>Color personalizado<input type="color" value={value} onChange={e=>onChange(e.target.value.toUpperCase())} /></label>
  </fieldset>;
}
