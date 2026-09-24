import { useEffect, useState } from 'react';
import { useAuthStore } from '../../stores/authStore';
import { useAccessStore } from '../../stores/accessStore';
import { supabase } from '../../db/supabase';
import type { Vista } from './Sidebar';
import styles from './ApplicationTopBar.module.css';

const TITULOS: Partial<Record<Vista, string>> = {
  dashboard: 'Dashboard', proyectos: 'Proyectos', responsables: 'Responsables',
  contratistas: 'Contratistas', gantt: 'Gantt', calendario: 'Calendario',
  ayuda: 'Ayuda', configuracion: 'Configuración',
  creador: 'Creador',
};

export function ApplicationTopBar({ vista }: { vista: Vista }) {
  const user = useAuthStore(s => s.user);
  const empresaId = useAccessStore(s => s.empresaId);
  const empresa = useAccessStore(s => s.contexto?.empresas.find(e => e.id === empresaId)?.nombre);
  const meta = (user?.user_metadata ?? {}) as Record<string, unknown>;
  const nombre = [meta.nombre, meta.apellidos].filter(v => typeof v === 'string' && v.trim()).join(' ') || user?.email || 'Usuario';
  const inicial = nombre.charAt(0).toUpperCase();
  const avatarPath = typeof meta.avatar_path === 'string' ? meta.avatar_path : '';
  const [avatar, setAvatar] = useState({ path: '', url: '' });

  useEffect(() => {
    if (!user || !avatarPath.startsWith(`${user.id}/`)) return;
    let activo = true;
    supabase.storage.from('profile-photos').createSignedUrl(avatarPath, 3600)
      .then(({ data, error }) => { if (activo && !error) setAvatar({ path: avatarPath, url: data?.signedUrl ?? '' }); });
    return () => { activo = false; };
  }, [avatarPath, user?.id]);

  return <header className={styles.bar}>
    <div className={styles.identity}><span className={styles.logo}>P</span><strong>Plan-OTs</strong><span className={styles.divider} /><span>{TITULOS[vista] ?? 'Plan-OTs'}</span></div>
    <div className={styles.account}>
      <span className={styles.company} title={empresa}>{empresa || '\u00a0'}</span>
      <span className={styles.avatar}>{avatar.path === avatarPath && avatar.url ? <img src={avatar.url} alt="" /> : inicial}</span>
      <span className={styles.name} title={nombre}>{nombre}</span>
      <button type="button" onClick={() => void useAuthStore.getState().signOut()}>Cerrar sesión</button>
    </div>
  </header>;
}
