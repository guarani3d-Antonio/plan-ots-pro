import s from './ListadoClientes.module.css';

/** Static placeholders reserve the list geometry without flashing or looping motion. */
export function CargaDirectorio({nombre}:{nombre:string}){
 return <div className={s.loading} role="status" aria-label={`Cargando ${nombre}…`}>
  <span className={s.srOnly}>Cargando {nombre}…</span>
  <div className={s.loadingHeader} aria-hidden="true"/>
  {[0,1].map(n=><div className={s.loadingRow} key={n} aria-hidden="true">
   <span className={s.loadingPhoto}/><div><span/><span/></div><div><span/><span/></div><div><span/><span/></div>
  </div>)}
 </div>;
}
