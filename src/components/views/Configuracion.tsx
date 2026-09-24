import { useEffect, useState } from 'react';
import { useAuthStore } from '../../stores/authStore';
import { useAccessStore } from '../../stores/accessStore';
import { supabase } from '../../db/supabase';
import { useToast } from '../ui/Toast';

const fieldStyle: React.CSSProperties = {
  width: '100%', minHeight: 44, padding: '10px 12px', border: '1px solid var(--border-default)',
  borderRadius: 8, background: 'var(--bg-surface)', color: 'var(--text-primary)', font: 'inherit',
  boxSizing: 'border-box',
};

const PHOTO_BUCKET = 'profile-photos';

async function prepararFoto(file: File): Promise<Blob> {
  if (!file.type.startsWith('image/') || file.size > 8 * 1024 * 1024) throw new Error('Elegí una imagen de hasta 8 MB.');
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 256;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('No se pudo preparar la foto.');
    const lado = Math.min(bitmap.width, bitmap.height);
    ctx.drawImage(bitmap, (bitmap.width - lado) / 2, (bitmap.height - lado) / 2, lado, lado, 0, 0, 256, 256);
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.82));
    if (!blob) throw new Error('No se pudo convertir la foto.');
    return blob;
  } finally { bitmap.close(); }
}

export default function Configuracion() {
  const user = useAuthStore(s => s.user);
  const signOut = useAuthStore(s => s.signOut);
  const contexto = useAccessStore(s => s.contexto);
  const empresaId = useAccessStore(s => s.empresaId);
  const { mostrar, ToastComponent } = useToast();
  const meta = (user?.user_metadata ?? {}) as Record<string, unknown>;
  const avatarPath = typeof meta.avatar_path === 'string' ? meta.avatar_path : '';
  const [nombre, setNombre] = useState(typeof meta.nombre === 'string' ? meta.nombre : '');
  const [apellidos, setApellidos] = useState(typeof meta.apellidos === 'string' ? meta.apellidos : '');
  const [telefono, setTelefono] = useState(typeof meta.telefono === 'string' ? meta.telefono : '');
  const [correo, setCorreo] = useState(user?.email ?? '');
  const [foto, setFoto] = useState<File | null>(null);
  const [fotoLocal, setFotoLocal] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [cerrando, setCerrando] = useState(false);

  useEffect(() => {
    if (!foto) { setFotoLocal(''); return; }
    const url = URL.createObjectURL(foto);
    setFotoLocal(url);
    return () => URL.revokeObjectURL(url);
  }, [foto]);

  useEffect(() => {
    if (!avatarPath || !user || !avatarPath.startsWith(`${user.id}/`)) { setAvatarUrl(''); return; }
    let activo = true;
    supabase.storage.from(PHOTO_BUCKET).createSignedUrl(avatarPath, 3600)
      .then(({ data, error }) => { if (activo && !error) setAvatarUrl(data?.signedUrl ?? ''); });
    return () => { activo = false; };
  }, [avatarPath, user?.id]);

  const empresa = contexto?.empresas.find(item => item.id === empresaId);
  const rol = contexto?.creador ? 'Creador de la plataforma' : empresa?.rol
    ? `Rol en ${empresa.nombre}: ${empresa.rol}` : 'Sin empresa seleccionada';

  const guardarPerfil = async () => {
    if (guardando || !user) return;
    const email = correo.trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { mostrar('Ingresá un correo válido.', 'error'); return; }
    setGuardando(true);
    let rutaNueva = '';
    try {
      if (foto) {
        const blob = await prepararFoto(foto);
        rutaNueva = `${user.id}/${crypto.randomUUID()}.jpg`;
        const { error: uploadError } = await supabase.storage.from(PHOTO_BUCKET).upload(rutaNueva, blob, { contentType: 'image/jpeg', upsert: false });
        if (uploadError) throw uploadError;
      }
      // Los permisos proceden del servidor, nunca de user_metadata.
      const { rol: _rolAnterior, ...datosPersonales } = meta;
      void _rolAnterior;
      const cambiaCorreo = email !== (user.email ?? '').toLowerCase();
      const { error } = await supabase.auth.updateUser({
        ...(cambiaCorreo ? { email } : {}),
        data: { ...datosPersonales, nombre: nombre.trim(), apellidos: apellidos.trim(), telefono: telefono.trim(), avatar_path: rutaNueva || avatarPath },
      });
      if (error) throw error;
      if (rutaNueva && avatarPath && avatarPath.startsWith(`${user.id}/`)) void supabase.storage.from(PHOTO_BUCKET).remove([avatarPath]);
      setFoto(null);
      mostrar(cambiaCorreo ? 'Perfil guardado. Revisá tu correo para confirmar el cambio de dirección.' : 'Perfil guardado', 'success');
    } catch (error) {
      if (rutaNueva) void supabase.storage.from(PHOTO_BUCKET).remove([rutaNueva]);
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
      <div style={{ maxWidth: 960, margin: '0 auto', display: 'grid', gap: 20 }}>
        <header>
          <h1 style={{ margin: 0, color: 'var(--text-primary)' }}>Configuración</h1>
          <p style={{ color: 'var(--text-secondary)', marginBottom: 0 }}>Tu perfil y acceso actual</p>
        </header>
        <section style={{ padding: 24, border: '1px solid var(--border-default)', borderRadius: 12, background: 'var(--bg-surface)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
            <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'var(--accent)', color: 'white', display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: 24, overflow: 'hidden', flexShrink: 0 }}>
              {fotoLocal || avatarUrl ? <img src={fotoLocal || avatarUrl} alt="Foto de perfil" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : `${nombre.charAt(0)}${apellidos.charAt(0)}`.toUpperCase() || 'U'}
            </div>
            <div><h2 style={{ margin: 0, fontSize: 20 }}>Datos personales</h2><p style={{ margin: '4px 0 0', color: 'var(--text-secondary)' }}>Tus datos de contacto en Plan-OTs</p></div>
          </div>
          <label style={{ display: 'inline-flex', padding: '8px 13px', border: '1px solid var(--border-default)', borderRadius: 8, cursor: 'pointer', marginBottom: 16 }}>Cambiar foto
            <input type="file" accept="image/*" style={{ position: 'absolute', width: 1, height: 1, opacity: 0 }} onChange={e => setFoto(e.target.files?.[0] ?? null)} />
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
            <label style={{ display: 'grid', gap: 6 }}>Nombre
              <input style={fieldStyle} autoComplete="given-name" value={nombre} onChange={e => setNombre(e.target.value)} />
            </label>
            <label style={{ display: 'grid', gap: 6 }}>Apellidos
              <input style={fieldStyle} autoComplete="family-name" value={apellidos} onChange={e => setApellidos(e.target.value)} />
            </label>
            <label style={{ display: 'grid', gap: 6 }}>Teléfono
              <input style={fieldStyle} type="tel" autoComplete="tel" value={telefono} onChange={e => setTelefono(e.target.value)} placeholder="+595 …" />
            </label>
            <label style={{ display: 'grid', gap: 6 }}>Correo de acceso
              <input style={fieldStyle} type="email" autoComplete="email" value={correo} onChange={e => setCorreo(e.target.value)} />
            </label>
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Cambiar el correo puede requerir confirmación en la dirección actual y en la nueva.</p>
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
