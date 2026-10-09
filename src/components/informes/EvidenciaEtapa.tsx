import type { TipoDocumento } from '../../services/documentService';
import { categoriaEtapa } from '../../services/otStageSchema';
import styles from './EvidenciaEtapa.module.css';

interface Foto {id:string;url:string;descripcion?:string|null;pendiente?:boolean}
export function EvidenciaEtapa({tipo,fotos,cargando,subiendo,disabled,soloLectura,error,onArchivo,onGaleria,puedeVer=true}:{
 tipo:TipoDocumento;fotos:Foto[];cargando:boolean;subiendo:boolean;disabled:boolean;soloLectura:boolean;error?:string|null;
 onArchivo:(file:File)=>void;onGaleria:()=>void;
 puedeVer?:boolean;
}){
 const categoria=categoriaEtapa(tipo);if(!categoria)return null;
 const fase=categoria==='ANTES'?'inicial':categoria==='DURANTE'?'de avance':'de cierre';
 const hint=cargando?'Verificando evidencias…':fotos.length?`${fotos.length} evidencia(s)${fotos.some(f=>f.pendiente)?' · pendiente de sincronización':''}`:soloLectura?'Sin evidencia vinculada a esta versión':'Agregá al menos una foto y su descripción.';
 return <section className={styles.root} aria-label={`Evidencia ${fase}`}>
  <div className={styles.info}><strong>Evidencia {fase}</strong><small>{hint}</small></div>
  <div className={styles.thumbs}>{fotos.slice(-3).map(f=><img key={f.id} src={f.url} alt={f.descripcion||`Evidencia ${fase}`} title={f.descripcion||undefined}/>)}</div>
  <div className={styles.actions}>{!soloLectura&&(['Cámara','Galería'] as const).map(label=><label key={label} className={styles.upload} aria-disabled={disabled||cargando||subiendo}>{subiendo?'Subiendo…':label}<input aria-label={`${label}: evidencia ${fase}`} type="file" accept="image/*" capture={label==='Cámara'?'environment':undefined} disabled={disabled||cargando||subiendo} onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(file)onArchivo(file)}}/></label>)}<button type="button" disabled={!puedeVer} onClick={onGaleria}>Ver fotos</button></div>
  {error&&<p role="alert" className={styles.error}>{error}</p>}
 </section>;
}
