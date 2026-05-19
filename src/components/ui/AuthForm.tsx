import React, { useState } from 'react';
import styles from './AuthForm.module.css';
import { useAuthStore } from '../../stores/authStore';
import { useToast } from './Toast';

type Modo = 'login' | 'register';

export const AuthForm: React.FC = () => {
  const [modo, setModo]         = useState<Modo>('login');
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

  const { signIn, signUp } = useAuthStore();
  const { mostrar, ToastComponent } = useToast();

  const cambiarModo = (m: Modo) => {
    setModo(m);
    setError('');
  };

  const handleSubmit = async () => {
    setError('');

    if (!email.trim())        { setError('Ingresá tu email.'); return; }
    if (!password)            { setError('Ingresá tu contraseña.'); return; }
    if (password.length < 6)  { setError('La contraseña debe tener al menos 6 caracteres.'); return; }

    setLoading(true);
    try {
      if (modo === 'login') {
        await signIn(email.trim(), password);
      } else {
        await signUp(email.trim(), password);
        // Cuenta creada — Supabase enviará email de confirmación.
        mostrar('Cuenta creada. Revisá tu email para confirmar el registro antes de ingresar.', 'success');
        cambiarModo('login');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error de autenticación.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = () => {
    // Stub — provider OAuth de Google aún no implementado en Supabase.
    console.log('google-login');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSubmit();
  };

  return (
    <div className={styles.page}>
      {/* Panel izquierdo */}
      <div className={styles.left}>
        <div className={styles.logo}>
          <div className={styles.logoIcon}>P</div>
          <span className={styles.logoText}>Plan-OTs</span>
        </div>
        <p className={styles.tagline}>Gestión visual de obras en campo</p>
        <ul className={styles.features}>
          <li className={styles.feature}>
            <span className={styles.featureCheck}>✓</span>
            Optimiza el flujo de trabajo con planos interactivos.
          </li>
          <li className={styles.feature}>
            <span className={styles.featureCheck}>✓</span>
            Reporta incidencias directamente en la obra.
          </li>
          <li className={styles.feature}>
            <span className={styles.featureCheck}>✓</span>
            Accede a la documentación de tus instalaciones en tiempo real.
          </li>
        </ul>
      </div>

      {/* Panel derecho */}
      <div className={styles.right}>
        <div className={styles.formCard}>
          <h1 className={styles.heading}>Bienvenido de nuevo.</h1>

          {/* Tabs */}
          <div className={styles.tabs}>
            <button
              className={`${styles.tab} ${modo === 'login' ? styles.active : ''}`}
              onClick={() => cambiarModo('login')}
              type="button"
            >
              Iniciar sesión
            </button>
            <button
              className={`${styles.tab} ${modo === 'register' ? styles.active : ''}`}
              onClick={() => cambiarModo('register')}
              type="button"
            >
              Crear cuenta
            </button>
          </div>

          {error && <div className={styles.error}>{error}</div>}

          {/* Campo email */}
          <div className={styles.field}>
            <label className={styles.label}>Correo electrónico</label>
            <input
              className={styles.input}
              type="email"
              placeholder="usuario@empresa.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              onKeyDown={handleKeyDown}
              autoComplete="email"
              autoFocus
              disabled={loading}
            />
          </div>

          {/* Campo contraseña */}
          <div className={styles.field}>
            <label className={styles.label}>Contraseña</label>
            <div className={styles.inputWrap}>
              <input
                className={styles.input}
                type={showPass ? 'text' : 'password'}
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                onKeyDown={handleKeyDown}
                autoComplete={modo === 'login' ? 'current-password' : 'new-password'}
                disabled={loading}
              />
              <button
                className={styles.eyeBtn}
                onClick={() => setShowPass(p => !p)}
                type="button"
                tabIndex={-1}
              >
                {showPass ? '🙈' : '👁️'}
              </button>
            </div>
          </div>

          <button
            className={styles.submitBtn}
            onClick={handleSubmit}
            disabled={loading}
            type="button"
          >
            {loading ? 'Ingresando...' : (modo === 'login' ? 'Ingresar' : 'Crear cuenta')}
          </button>

          {modo === 'login' && (
            <a className={styles.forgotLink}>¿Olvidaste tu contraseña?</a>
          )}

          <div className={styles.divider}>o</div>

          <button
            className={styles.googleBtn}
            onClick={handleGoogleLogin}
            type="button"
          >
            <span>🔵</span> Continuar con Google
          </button>
        </div>
      </div>
      {/* Toast — feedback de signup exitoso */}
      {ToastComponent}
    </div>
  );
};
