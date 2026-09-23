import { useState } from 'react';
import { useAuthStore } from '../../stores/authStore';
import { useAccessStore } from '../../stores/accessStore';
import { supabase } from '../../db/supabase';
import { useToast } from '../ui/Toast';

const fieldStyle: React.CSSProperties = {
  width: '100%', minHeight: 44, padding: '10px 12px', border: '1px solid var(--border-default)',
  borderRadius: 8, background: 'var(--bg-surface)', color: 'var(--text-primary)', font: 'inherit',
  boxSizing: 'border-box',
};

export default function Configuracion() {
  const user = useAuthStore(s => s.user);
  const signOut = useAuthStore(s => s.signOut);
  const contexto = useAccessStore(s => s.contexto);
  const empresaId = useAccessStore(s => s.empresaId);
  const { mostrar, ToastComponent } = useToast();
  const meta = (user?.user_metadata ?? {}) as Record<string, unknown>;
  const [nombre, setNombre] = useState(typeof meta.nombre === 'string' ? meta.nombre : '');
  const [apellidos, setApellidos] = useState(typeof meta.apellidos === 'string' ? meta.apellidos : '');
  const [guardando, setGuardando] = useState(false);
  const [cerrando, setCerrando] = useState(false);

  const empresa = contexto?.empresas.find(item => item.id === empresaId);
  const rol = contexto?.creador ? 'Creador de la plataforma' : empresa?.rol
    ? `Rol en ${empresa.nombre}: ${empresa.rol}` : 'Sin empresa seleccionada';

  const guardarPerfil = async () => {
    if (guardando) return;
    setGuardando(true);
    try {
      // Los permisos proceden del servidor, nunca de user_metadata.
      const { rol: _rolAnterior, ...datosPersonales } = meta;
      void _rolAnterior;
      const { error } = await supabase.auth.updateUser({ data: { ...datosPersonales, nombre: nombre.trim(), apellidos: apellidos.trim() } });
      if (error) throw error;
      mostrar('Perfil guardado', 'success');
    } catch (error) {
      mostrar(error instanceof Error ? error.message : 'No se pudo guardar el perfil', 'error');
    } finally {
      setGuardando(false);
    }
  };

  const cerrarSesion = async () => {
    setCerrando(true);
    try { await signOut(); }
    catch (error) {
      mostrar(error instanceof Error ? error.message : 'No se pudo cerrar sesión', 'error');
      setCerrando(false);
    }
  };

  return (
    <main style={{ flex: 1, overflowY: 'auto', padding: 'clamp(16px, 3vw, 32px)', background: 'var(--bg-subtle)' }}>
      <div style={{ maxWidth: 720, margin: '0 auto', display: 'grid', gap: 20 }}>
        <header>
          <h1 style={{ margin: 0, color: 'var(--text-primary)' }}>Configuración</h1>
          <p style={{ color: 'var(--text-secondary)', marginBottom: 0 }}>Tu perfil y acceso actual</p>
        </header>
        <section style={{ padding: 24, border: '1px solid var(--border-default)', borderRadius: 12, background: 'var(--bg-surface)' }}>
          <h2 style={{ marginTop: 0, fontSize: 20 }}>Datos personales</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
            <label style={{ display: 'grid', gap: 6 }}>Nombre
              <input style={fieldStyle} autoComplete="given-name" value={nombre} onChange={e => setNombre(e.target.value)} />
            </label>
            <label style={{ display: 'grid', gap: 6 }}>Apellidos
              <input style={fieldStyle} autoComplete="family-name" value={apellidos} onChange={e => setApellidos(e.target.value)} />
            </label>
          </div>
          <p style={{ color: 'var(--text-secondary)' }}>Correo: <strong>{user?.email ?? '—'}</strong></p>
          <button type="button" onClick={guardarPerfil} disabled={guardando} style={{ minHeight: 44, padding: '0 20px', border: 0, borderRadius: 8, background: 'var(--accent)', color: 'white', cursor: 'pointer' }}>
            {guardando ? 'Guardando…' : 'Guardar perfil'}
          </button>
        </section>
        <section style={{ padding: 24, border: '1px solid var(--border-default)', borderRadius: 12, background: 'var(--bg-surface)' }}>
          <h2 style={{ marginTop: 0, fontSize: 20 }}>Acceso</h2>
          <p style={{ marginBottom: 0 }}>{rol}</p>
          {contexto?.creador && <p style={{ color: 'var(--text-secondary)' }}>Podés administrar empresas y accesos desde las herramientas de la plataforma.</p>}
        </section>
        <section style={{ padding: 24, border: '1px solid var(--border-default)', borderRadius: 12, background: 'var(--bg-surface)' }}>
          <h2 style={{ marginTop: 0, fontSize: 20 }}>Sesión</h2>
          <button type="button" onClick={cerrarSesion} disabled={cerrando} style={{ minHeight: 44, padding: '0 20px', border: '1px solid var(--border-default)', borderRadius: 8, background: 'var(--bg-surface)', color: 'var(--text-primary)', cursor: 'pointer' }}>
            {cerrando ? 'Cerrando…' : 'Cerrar sesión'}
          </button>
        </section>
      </div>
      {ToastComponent}
    </main>
  );
}
