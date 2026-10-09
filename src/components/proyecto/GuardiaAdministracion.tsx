import {useCallback,useEffect,useMemo,useRef,useState,type ReactNode} from 'react';
import {GuardiaAdministracionContext} from './guardiaAdministracionContext';
import {PanelAdministracion} from './PanelAdministracion';
import styles from './AdministracionCreador.module.css';
export function GuardiaAdministracion({children}:{children:ReactNode}){
 const registros=useRef(new Map<string,{dirty:boolean;busy:boolean}>());
 const [pendiente,setPendiente]=useState<(()=>void)|null>(null),[mensaje,setMensaje]=useState('');
 const registrar=useCallback((id:string,dirty:boolean,busy:boolean)=>{registros.current.set(id,{dirty,busy});return()=>{registros.current.delete(id)}},[]);
 const solicitar=useCallback((accion:()=>void,id?:string)=>{const valores=id?[registros.current.get(id)].filter((v):v is {dirty:boolean;busy:boolean}=>!!v):[...registros.current.values()];if(valores.some(v=>v.busy)){setMensaje('Esperá a que termine el guardado.');return}if(valores.some(v=>v.dirty))setPendiente(()=>accion);else accion()},[]);
 useEffect(()=>{const advertir=(e:BeforeUnloadEvent)=>{if([...registros.current.values()].some(v=>v.dirty||v.busy)){e.preventDefault();e.returnValue=''}};window.addEventListener('beforeunload',advertir);return()=>window.removeEventListener('beforeunload',advertir)},[]);
 const value=useMemo(()=>({registrar,solicitar}),[registrar,solicitar]);
 return <GuardiaAdministracionContext.Provider value={value}>{children}{mensaje&&<p role="status">{mensaje}</p>}{pendiente&&<PanelAdministracion titulo="Cambios sin guardar" onCerrar={()=>setPendiente(null)} acciones={<button type="button" className={styles.primaryButton} onClick={()=>{setPendiente(null);pendiente()}}>Descartar y continuar</button>}><p>Hay datos o una foto que todavía no guardaste. Podés volver a la ficha para guardarlos o descartarlos antes de continuar.</p><button type="button" className={styles.secondaryButton} onClick={()=>setPendiente(null)}>Seguir editando</button></PanelAdministracion>}</GuardiaAdministracionContext.Provider>;
}
