import { useEffect, type ReactNode } from 'react';
import { useAuthStore } from '../../stores/authStore';
import { useAccessStore } from '../../stores/accessStore';
import { AuthForm } from './AuthForm';
export function SessionGate({children}:{children:ReactNode}) {
  const {user,loading,initialize,signOut}=useAuthStore();
  const userId=user?.id;
  const {contexto,disponible,error,refresh}=useAccessStore();
  useEffect(()=>{void initialize();},[initialize]);
  useEffect(()=>{
    if(!userId)return;
    const validate=()=>{if(document.visibilityState==='visible')void refresh();};
    const offline=()=>useAccessStore.setState({disponible:false,error:'Sin conexión. Conserva esta pantalla abierta y vuelve a intentar cuando tengas señal.'});
    window.addEventListener('online',validate);window.addEventListener('offline',offline);window.addEventListener('focus',validate);document.addEventListener('visibilitychange',validate);
    const timer=window.setInterval(validate,60_000);
    return()=>{window.clearInterval(timer);window.removeEventListener('online',validate);window.removeEventListener('offline',offline);window.removeEventListener('focus',validate);document.removeEventListener('visibilitychange',validate);};
  },[userId,refresh]);
  if(loading)return <div role="status">Verificando sesión…</div>;
  if(!user)return <AuthForm/>;
  return <>
    {!disponible&&<div role="alert" style={{padding:24,color:'var(--text-primary)',background:'var(--bg-surface)'}}>
      <p>{error??'Verificando empresas y permisos…'}</p><button onClick={()=>void refresh()}>Volver a intentar</button>{' '}<button onClick={()=>void signOut()}>Cerrar sesión</button>
    </div>}
    {contexto&&<div hidden={!disponible} style={{display:disponible?'contents':'none'}}>{children}</div>}
  </>;
}
