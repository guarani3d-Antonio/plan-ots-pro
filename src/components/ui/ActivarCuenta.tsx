import { useEffect, useState } from 'react';
import { supabase } from '../../db/supabase';
import { enlaceContieneSesion, tokenDeEnlace, urlActivacion } from '../../security/authLink';
import styles from './AuthForm.module.css';

type Estado = 'verificando' | 'lista' | 'invalida' | 'guardando' | 'completa';

export function ActivarCuenta() {
  const [estado, setEstado] = useState<Estado>(enlaceContieneSesion ? 'verificando' : 'invalida');
  const [correo, setCorreo] = useState('');
  const [clave, setClave] = useState('');
  const [repeticion, setRepeticion] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [enlaceSolicitado, setEnlaceSolicitado] = useState(false);

  useEffect(() => {
    if (!enlaceContieneSesion) return;
    let vigente = true;
    void (async () => {
      const { data: sesion, error: sesionError } = await supabase.auth.getSession();
      if (!vigente) return;
      if (sesionError || !sesion.session || sesion.session.access_token !== tokenDeEnlace) {
        setEstado('invalida');
        return;
      }
      const { data: identidad, error: identidadError } = await supabase.auth.getUser();
      if (!vigente) return;
      if (identidadError || identidad.user?.id !== sesion.session.user.id) {
        setEstado('invalida');
        return;
      }
      setCorreo(identidad.user.email ?? '');
      setEstado('lista');
    })();
    return () => { vigente = false; };
  }, []);

  const guardarClave = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    if (clave.length < 8) { setError('Usá al menos 8 caracteres.'); return; }
    if (clave !== repeticion) { setError('Las contraseñas no coinciden.'); return; }
    setEstado('guardando');
    const { error: guardarError } = await supabase.auth.updateUser({ password: clave });
    if (guardarError) {
      setError('No pudimos guardar la contraseña. Volvé a intentarlo o pedí otro enlace.');
      setEstado('lista');
      return;
    }
    setClave('');
    setRepeticion('');
    setEstado('completa');
  };

  const pedirEnlace = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo.trim())) {
      setError('Ingresá un correo válido.');
      return;
    }
    setEnviando(true);
    const { error: envioError } = await supabase.auth.resetPasswordForEmail(correo.trim(), {
      redirectTo: urlActivacion,
    });
    setEnviando(false);
    if (envioError) { setError('No pudimos enviar el enlace ahora. Intentá de nuevo más tarde.'); return; }
    setEnlaceSolicitado(true);
  };

  return <div className={styles.page}>
    <div className={styles.left}>
      <div className={styles.logo}><div className={styles.logoIcon}>P</div><span className={styles.logoText}>Plan-OTs</span></div>
      <p className={styles.tagline}>Gestión visual de obras en campo</p>
    </div>
    <div className={styles.right}><div className={styles.formCard}>
      {estado === 'verificando' && <p role="status">Verificando tu invitación…</p>}
      {(estado === 'lista' || estado === 'guardando') && <>
        <h1 className={styles.heading}>Activá tu cuenta</h1>
        <p className={styles.helpText}>Elegí una contraseña para ingresar a Plan-OTs{correo ? ` con ${correo}` : ''}.</p>
        <form onSubmit={guardarClave}>
          <div className={styles.field}><label className={styles.label} htmlFor="nueva-clave">Nueva contraseña</label>
            <input id="nueva-clave" className={styles.input} type="password" autoComplete="new-password" minLength={8}
              value={clave} onChange={event => setClave(event.target.value)} disabled={estado === 'guardando'} required />
          </div>
          <div className={styles.field}><label className={styles.label} htmlFor="repetir-clave">Repetí la contraseña</label>
            <input id="repetir-clave" className={styles.input} type="password" autoComplete="new-password" minLength={8}
              value={repeticion} onChange={event => setRepeticion(event.target.value)} disabled={estado === 'guardando'} required />
          </div>
          {error && <p className={styles.error} role="alert">{error}</p>}
          <button className={styles.submitBtn} type="submit" disabled={estado === 'guardando'}>
            {estado === 'guardando' ? 'Guardando…' : 'Guardar contraseña'}
          </button>
        </form>
      </>}
      {estado === 'invalida' && <>
        <h1 className={styles.heading}>Necesitás un enlace nuevo</h1>
        <p className={styles.helpText}>El enlace ya se usó o venció. Escribí el correo al que llegó la invitación y te enviaremos uno nuevo.</p>
        {enlaceSolicitado ? <p className={styles.success} role="status">Si la cuenta existe, recibirás un enlace para elegir tu contraseña. Revisá también la carpeta de spam.</p> :
          <form onSubmit={pedirEnlace}>
            <div className={styles.field}><label className={styles.label} htmlFor="correo-invitado">Correo electrónico</label>
              <input id="correo-invitado" className={styles.input} type="email" autoComplete="email" value={correo}
                onChange={event => setCorreo(event.target.value)} disabled={enviando} required />
            </div>
            {error && <p className={styles.error} role="alert">{error}</p>}
            <button className={styles.submitBtn} type="submit" disabled={enviando}>{enviando ? 'Enviando…' : 'Enviar otro enlace'}</button>
          </form>}
        <a className={styles.forgotLink} href="/">Volver al inicio de sesión</a>
      </>}
      {estado === 'completa' && <>
        <h1 className={styles.heading}>Tu cuenta está lista</h1>
        <p className={styles.helpText}>Ya podés ingresar a Plan-OTs con tu correo y contraseña.</p>
        <button className={styles.submitBtn} type="button" onClick={() => window.location.replace('/')}>Entrar a Plan-OTs</button>
      </>}
    </div></div>
  </div>;
}
