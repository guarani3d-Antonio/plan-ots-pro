import {createRoot} from 'react-dom/client';
import {useRef,useState} from 'react';
import Directorio,{type DirectorioHandle} from '../src/components/directorio/Directorio';
import {bindIdentity} from '../src/security/sessionScope';
import {useAccessStore} from '../src/stores/accessStore';
import {tenant,work,work2,requests,failContactSave,failContactPhoto} from './qa-contact-profiles-mock';
import '../src/index.css';
bindIdentity('61000000-0000-4000-8000-000000000001');
function scenario(mode:string){useAccessStore.setState({disponible:true,empresaId:mode==='creador'?'':tenant,contexto:{creador:mode==='creador',empresas:[{id:tenant,nombre:'Empresa QA',rol:'supervisor',puede_crear:false,permisos:['contacto.ver',...(mode==='lectura'?[]:['contacto.crear','contacto.editar']), 'cliente.ver','contratista.ver','equipo.ver']}],obras:[work,work2].map((id,i)=>({id,tenant_id:tenant,nombre:i?'Casa QA':'Edificio Bernardino QA',editar:true,administrar:true,ver_costos:false}))}})}
scenario('creador');
function QA(){const [mode,setMode]=useState('creador'),[debug,setDebug]=useState(''),ref=useRef<DirectorioHandle|null>(null);return <main style={{padding:8}}><p>Ensayo aislado · datos ficticios</p><label>Cuenta de ensayo<select value={mode} onChange={e=>{scenario(e.target.value);setMode(e.target.value)}}><option value="creador">Creador</option><option value="empresa">Empresa</option><option value="lectura">Solo lectura</option></select></label><button onClick={failContactSave}>Fallar próximo guardado</button><button onClick={failContactPhoto}>Fallar próxima foto</button><button onClick={()=>ref.current?.irInicio()}>Inicio desde menú</button><button onClick={()=>setDebug(JSON.stringify(requests.filter(r=>r.name==='plan_contacto_comunicacion_guardar').map(r=>r.args)))}>Ver registros enviados</button><output aria-label="Registros del ensayo">{debug}</output><Directorio key={mode} categoriaInicial="contactos" ref={ref}/></main>}
createRoot(document.getElementById('root')!).render(new URLSearchParams(location.search).has('narrow')?<iframe title="Contactos a 320 px" src="/scripts/qa-contact-profiles.html?frame=1" style={{width:320,height:1400,border:0}}/>:<QA/>);
