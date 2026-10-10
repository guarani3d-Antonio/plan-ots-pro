import type { TipoDocumento } from '../../services/documentService';
import { categoriaEtapa } from '../../services/otStageSchema';
import styles from './EvidenciaEtapa.module.css';

interface Foto {id:string;url:string;descripcion?:string|null;pendiente?:boolean;categoria?:'ANTES'|'DURANTE'|'DESPUES'}
function IconoFoto({galeria=false}:{galeria?:boolean}){
 return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{galeria?<><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1.5"/><path d="m3 17 6-6 5 5 3-3 4 4"/></>:<><path d="M8 5 9.5 3h5L16 5h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z"/><circle cx="12" cy="12" r="4"/></>}</svg>;
}
export function EvidenciaEtapa({tipo,fotos,cargando,subiendo,disabled,soloLectura,error,onArchivo,onGaleria,puedeVer=true}:{
 tipo:TipoDocumento;fotos:Foto[];cargando:boolean;subiendo:boolean;disabled:boolean;soloLectura:boolean;error?:string|null;
 onArchivo:(file:File)=>void;onGaleria:()=>void;
 puedeVer?:boolean;
}){
 const categoria=categoriaEtapa(tipo);if(!categoria)return null;
 const fase=categoria==='ANTES'?'inicial':categoria==='DURANTE'?'de avance':'de cierre';
 const bloqueado=disabled||cargando||subiendo||soloLectura;
 const categorias=tipo==='cierre'?['ANTES','DURANTE','DESPUES'] as const:tipo==='avance'?['ANTES','DURANTE'] as const:['ANTES'] as const;
 const miniaturas=categorias.flatMap(c=>{const foto=[...fotos].reverse().find(f=>(f.categoria??categoria)===c);return foto?[{foto,categoria:c}]:[];});
 const nombres={ANTES:'Antes',DURANTE:'Durante',DESPUES:'Después'};
 const hint=cargando?'Verificando evidencias…':fotos.length?`${fotos.length} evidencia(s)${fotos.some(f=>f.pendiente)?' · pendiente de sincronización':''}`:soloLectura?'Sin evidencia vinculada a esta versión':'Agregá al menos una foto y su descripción.';
 return <section className={styles.root} aria-label={`Evidencia ${fase}`}>
  <div className={styles.info}><strong>Evidencia {fase}</strong><small>{hint}</small></div>
  <div className={styles.media}><div className={styles.thumbs}>{miniaturas.length?miniaturas.map(({foto:f,categoria:c})=><button type="button" key={f.id} className={styles.thumbnail} disabled={!puedeVer} onClick={onGaleria} aria-label={`Ver fotos · ${nombres[c]}: ${f.descripcion||`evidencia ${fase}`}`} title={`Abrir la pestaña Fotos · ${nombres[c]}${f.descripcion?': '+f.descripcion:''}`}><img src={f.url} alt={f.descripcion||`Evidencia ${fase}`} loading="lazy" decoding="async"/><span className={styles.count}>{nombres[c]}</span></button>):<div className={styles.empty}><IconoFoto galeria/><small>{cargando?'Cargando…':'Sin foto'}</small></div>}</div>
  <div className={styles.actions}>{(['Cámara','Galería'] as const).map(label=><label key={label} className={styles.upload} aria-disabled={bloqueado} title={soloLectura?'Creá una versión corregida para agregar evidencia':label==='Cámara'?'Tomar una foto':'Seleccionar una foto del dispositivo'}><IconoFoto galeria={label==='Galería'}/><span>{subiendo?'Subiendo…':label}</span><input aria-label={`${label}: evidencia ${fase}`} type="file" accept="image/*" capture={label==='Cámara'?'environment':undefined} disabled={bloqueado} onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(file)onArchivo(file)}}/></label>)}<button type="button" className={styles.view} disabled={!puedeVer} onClick={onGaleria}>Ver fotos{fotos.length?` (${fotos.length})`:''} <span aria-hidden="true">›</span></button></div></div>
  {error&&<p role="alert" className={styles.error}>{error}</p>}
 </section>;
}
