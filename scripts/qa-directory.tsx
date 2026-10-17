import {createRoot} from 'react-dom/client';
import {useRef,useState} from 'react';
import Directorio,{type DirectorioHandle} from '../src/components/directorio/Directorio';
import {bindIdentity} from '../src/security/sessionScope';
import {useAccessStore} from '../src/stores/accessStore';
import {tenant,otherTenant,work,work2,requests} from './qa-directory-mock';
import '../src/index.css';
bindIdentity('61000000-0000-4000-8000-000000000001');
function scenario(company:boolean){useAccessStore.setState({disponible:true,empresaId:'',contexto:{creador:!company,empresas:[{id:tenant,nombre:'Empresa QA',rol:'supervisor',puede_crear:false,permisos:['cliente.ver','equipo.ver','contratista.ver','contacto.ver','empresa.ver']},...(!company?[{id:otherTenant,nombre:'Otra empresa QA',rol:'supervisor',puede_crear:false,permisos:['cliente.ver','equipo.ver','contratista.ver','contacto.ver']}]:[])],obras:[work,work2].map((id,i)=>({id,tenant_id:tenant,nombre:i?'Casa QA':'Edificio Bernardino QA',editar:true,administrar:true,ver_costos:false}))}})}
scenario(false);
function QA(){const [company,setCompany]=useState(false),[revision,setRevision]=useState(0),ref=useRef<DirectorioHandle|null>(null);return <main style={{padding:8}}><p>Ensayo aislado · componentes reales · datos ficticios</p><button onClick={()=>{scenario(!company);setCompany(!company)}}>{company?'Probar creador':'Probar cuenta de empresa'}</button><button onClick={()=>setRevision(v=>v+1)}>Ver lecturas</button><button onClick={()=>ref.current?.irInicio()}>Inicio desde menú</button><output aria-label="Consultas realizadas">{revision?requests.map(r=>r.name+': '+r.tenant).join(' | '):''}</output><Directorio key={String(company)} ref={ref}/></main>}
createRoot(document.getElementById('root')!).render(new URLSearchParams(location.search).has('narrow')?<iframe title="Directorio a 320 px" src="/scripts/qa-directory.html?frame=1" style={{width:320,height:1100,border:0}}/>:<QA/>);
