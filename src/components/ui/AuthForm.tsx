import { useState, type FormEvent } from 'react';
import styles from './AuthForm.module.css';
import { supabase } from '../../db/supabase';
import { urlActivacion } from '../../security/authLink';
import { useAuthStore } from '../../stores/authStore';

export function AuthForm() {
  const [recuperar, setRecuperar] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [enlaceSolicitado, setEnlaceSolicitado] = useState(false);
  const signIn = useAuthStore(s => s.signIn);
  const errorStore = useAuthStore(s => s.error);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    const correo = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) { setError('Ingresá un correo válido.'); return; }
    if (!recuperar && !password) { setError('Ingresá tu contraseña.'); return; }
    setLoading(true);
    try {
      if (recuperar) {
        const { error: envioError } = await supabase.auth.resetPasswordForEmail(correo, { redirectTo: urlActivacion });
        if (envioError) throw envioError;
        setEnlaceSolicitado(true);
      } else {
        await signIn(correo, password);
      }
    } catch {
      setError(recuperar ? 'No pudimos enviar el enlace ahora. Intentá de nuevo más tarde.' : 'No pudimos iniciar sesión. Revisá tu correo y contraseña.');
    } finally {
      setLoading(false);
    }
  };

  const cambiarVista = () => {
    setRecuperar(value => !value);
    setError('');
    setEnlaceSolicitado(false);
  };

  return <div className={styles.page}>
    <div className={styles.left}>
      <div className={styles.logo}><div className={styles.logoIcon}>P</div><span className={styles.logoText}>Plan-OTs</span></div>
      <p className={styles.tagline}>Gestión visual de obras en campo</p>
      <ul className={styles.features}>
        <li className={styles.feature}><span className={styles.featureCheck}>✓</span>Optimizá el trabajo con planos interactivos.</li>
        <li className={styles.feature}><span className={styles.featureCheck}>✓</span>Registrá incidencias directamente en la obra.</li>
        <li className={styles.feature}><span className={styles.featureCheck}>✓</span>Consultá la documentación en tiempo real.</li>
      </ul>
    </div>
    <div className={styles.right}><div className={styles.formCard}>
      <h1 className={styles.heading}>{recuperar ? 'Recuperá tu acceso' : 'Ingresá a Plan-OTs'}</h1>
      <p className={styles.helpText}>{recuperar
        ? 'Te enviaremos un enlace para elegir una contraseña.'
        : 'Usá el correo y la contraseña que elegiste al aceptar la invitación.'}</p>
      {enlaceSolicitado ? <>
        <p className={styles.success} role="status">Solicitud registrada para {email.trim()}. Si la cuenta existe y el servicio de correo permite el envío, recibirás un enlace para elegir tu contraseña.</p>
        <p className={styles.helpText}>Revisá spam y correo no deseado. Si no llega, contactá a quien te invitó para que te facilite un enlace nuevo. No necesitás crear otra cuenta.</p>
        <button className={styles.textButton} type="button" onClick={() => setEnlaceSolicitado(false)}>Revisar el correo ingresado</button>
      </> :
        <form onSubmit={handleSubmit}>
          {error && <p className={styles.error} role="alert">{error}</p>}
          {!recuperar && errorStore && <p className={styles.error} role="alert">{errorStore}</p>}
          <div className={styles.field}>
            <label className={styles.label} htmlFor="correo-acceso">Correo electrónico</label>
            <input id="correo-acceso" className={styles.input} type="email" placeholder="usuario@empresa.com" value={email}
              onChange={event => setEmail(event.target.value)} autoComplete="email" autoFocus disabled={loading} required />
          </div>
          {!recuperar && <div className={styles.field}>
            <label className={styles.label} htmlFor="clave-acceso">Contraseña</label>
            <div className={styles.inputWrap}>
              <input id="clave-acceso" className={styles.input} type={showPass ? 'text' : 'password'} value={password}
                onChange={event => setPassword(event.target.value)} autoComplete="current-password" disabled={loading} required />
              <button className={styles.eyeBtn} onClick={() => setShowPass(value => !value)} type="button"
                aria-label={showPass ? 'Ocultar contraseña' : 'Mostrar contraseña'}>{showPass ? '🙈' : '👁️'}</button>
            </div>
          </div>}
          <button className={styles.submitBtn} disabled={loading} type="submit">
            {loading ? 'Esperá un momento…' : recuperar ? 'Enviar enlace' : 'Ingresar'}
          </button>
        </form>}
      <button className={styles.textButton} onClick={cambiarVista} type="button">
        {recuperar ? 'Volver al inicio de sesión' : '¿Primera vez u olvidaste tu contraseña?'}
      </button>
    </div></div>
  </div>;
}
