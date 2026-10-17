import {createRoot} from 'react-dom/client';
import {useState} from 'react';
import Responsables from '../src/components/views/Responsables';
import {bindIdentity} from '../src/security/sessionScope';
import {useAccessStore} from '../src/stores/accessStore';
import {tenant,work,work2,failNextResponsibleSave,responsibleReadOnly} from './qa-responsible-profiles-mock';
import '../src/index.css';
bindIdentity('61000000-0000-4000-8000-000000000001');
function scenario(company:boolean){responsibleReadOnly(company);useAccessStore.setState({disponible:true,empresaId:company?'':tenant,contexto:{creador:!company,empresas:[{id:tenant,nombre:'Empresa QA',rol:'supervisor',puede_crear:true,permisos:['equipo.ver']},...(!company?[{id:'61000000-0000-4000-8000-000000000011',nombre:'Otra empresa QA',rol:'supervisor',puede_crear:true,permisos:['equipo.ver']}]:[])],obras:[work,work2].map((id,i)=>({id,tenant_id:tenant,nombre:i?'Casa QA':'Edificio Bernardino QA',editar:true,administrar:true,ver_costos:false}))}})}
scenario(false);
function QA(){const[company,setCompany]=useState(false);return <main style={{padding:12}}><p>Ensayo local · componentes reales · datos ficticios · sin acceso a producción</p><button onClick={()=>{setCompany(!company);scenario(!company)}}>{company?'Probar como creador':'Probar cuenta de empresa'}</button><button onClick={failNextResponsibleSave}>Simular error en próximo guardado</button><Responsables key={String(company)}/></main>}
createRoot(document.getElementById('root')!).render(new URLSearchParams(location.search).has('narrow')?<iframe title="Ensayo Responsables a 320 px" src="/scripts/qa-responsible-profiles.html?frame=1" style={{width:320,height:950,border:0}}/>:<QA/>);
