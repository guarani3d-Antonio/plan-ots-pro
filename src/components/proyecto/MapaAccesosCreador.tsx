import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../db/supabase';
import { useAuthStore } from '../../stores/authStore';
import { useAccessStore } from '../../stores/accessStore';

interface Usuario { user_id: string; email: string; nombre: string }
interface Membresia { user_id: string; rol: string; activo: boolean }
interface Obra { id: string; nombre: string; proyecto_padre_id: string | null }
interface AccesoObra { user_id: string; proyecto_id: string; rol: string }
interface Invitacion { email: string; supervisor_id: string; proyecto_id: string; estado: string }
interface Delegacion { supervisor_id: string; limite: number; activa: boolean }
interface Mapa {
  usuarios: Usuario[];
  membresias: Membresia[];
  obras: Obra[];
  accesos: AccesoObra[];
  invitaciones: Invitacion[];
  delegaciones: Delegacion[];
}

const panel: React.CSSProperties = { border: '1px solid var(--border-default)', borderRadius: 12, padding: 20, background: 'var(--bg-surface)' };
const boton: React.CSSProperties = { minHeight: 40, width: 'fit-content', padding: '8px 14px', border: '1px solid var(--border-default)', borderRadius: 8, background: 'var(--bg-surface)', color: 'var(--text-primary)', font: 'inherit', cursor: 'pointer' };
const etiquetas: Record<string, string> = { administrador: 'Administrador', supervisor: 'Supervisor', tecnico: 'Técnico', viewer: 'Lector' };

function permisoEfectivo(rolEmpresa: string, rolObra: string): string {
  if (rolObra === 'supervisor' && ['administrador', 'supervisor'].includes(rolEmpresa)) return 'Supervisor · ve costos';
  if (['supervisor', 'tecnico'].includes(rolObra) && ['administrador', 'supervisor', 'tecnico'].includes(rolEmpresa)) return 'Técnico · trabaja OTs';
  return 'Lector · consulta';
}

export function MapaAccesosCreador({ empresaId }: { empresaId: string }) {
  const creadorId = useAuthStore(s => s.user?.id);
  const contexto = useAccessStore(s => s.contexto);
  const [mapa, setMapa] = useState<Mapa | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);

  const cargar = useCallback(() => {
    setCargando(true);
    setError('');
    setRevision(n => n + 1);
  }, []);
  useEffect(() => {
    if (!contexto?.creador || !empresaId) return;
    let vigente = true;
    void (async () => {
      try {
        const [users, memberships, projects, invitations, delegations] = await Promise.all([
          supabase.rpc('plan_usuarios_dashboard'),
          supabase.from('tenant_miembros').select('user_id,rol,activo').eq('tenant_id', empresaId),
          supabase.from('proyectos').select('id,nombre,proyecto_padre_id').eq('tenant_id', empresaId).is('deleted_at', null),
          supabase.from('plan_invitaciones_equipo').select('email,supervisor_id,proyecto_id,estado').eq('tenant_id', empresaId),
          supabase.from('plan_delegaciones_invitacion').select('supervisor_id,limite,activa').eq('tenant_id', empresaId),
        ]);
        for (const result of [users, memberships, projects, invitations, delegations]) if (result.error) throw result.error;
        const obras = (projects.data ?? []) as Obra[];
        const ids = obras.map(obra => obra.id);
        const access = ids.length
          ? await supabase.from('proyecto_miembros').select('user_id,proyecto_id,rol').in('proyecto_id', ids)
          : { data: [] as AccesoObra[], error: null };
        if (access.error) throw access.error;
        if (vigente) setMapa({
          usuarios: (users.data ?? []) as Usuario[],
          membresias: (memberships.data ?? []) as Membresia[],
          obras,
          accesos: (access.data ?? []) as AccesoObra[],
          invitaciones: (invitations.data ?? []) as Invitacion[],
          delegaciones: (delegations.data ?? []) as Delegacion[],
        });
      } catch (cause) {
        if (vigente) setError(cause instanceof Error ? cause.message : 'No se pudo cargar el mapa de accesos.');
      } finally { if (vigente) setCargando(false); }
    })();
    return () => { vigente = false; };
  }, [contexto?.creador, empresaId, revision]);

  const filas = useMemo(() => {
    if (!mapa) return [];
    const miembros = new Map(mapa.membresias.map(item => [item.user_id, item]));
    const obras = new Map(mapa.obras.map(item => [item.id, item]));
    const term = busqueda.trim().toLocaleLowerCase('es');
    return mapa.usuarios.filter(usuario => miembros.has(usuario.user_id) || usuario.user_id === creadorId ||
      mapa.invitaciones.some(item => item.email.toLowerCase() === usuario.email.toLowerCase()))
      .map(usuario => {
        const miembro = miembros.get(usuario.user_id);
        const esCreador = usuario.user_id === creadorId;
        const asignaciones = mapa.accesos.filter(item => item.user_id === usuario.user_id &&
          obras.get(item.proyecto_id)?.proyecto_padre_id === null)
          .map(item => ({ id: item.proyecto_id, nombre: obras.get(item.proyecto_id)?.nombre ?? 'Obra',
            permiso: permisoEfectivo(miembro?.rol ?? '', item.rol) }));
        const invitaciones = mapa.invitaciones.filter(item => item.email.toLowerCase() === usuario.email.toLowerCase());
        const delegacion = mapa.delegaciones.find(item => item.supervisor_id === usuario.user_id);
        const invitacionesUsadas = mapa.invitaciones.filter(item => item.supervisor_id === usuario.user_id).length;
        return { ...usuario, miembro, esCreador, asignaciones, invitaciones, delegacion, invitacionesUsadas };
      })
      .filter(fila => !term || [fila.nombre, fila.email, ...fila.asignaciones.map(item => item.nombre)]
        .some(value => value.toLocaleLowerCase('es').includes(term)))
      .sort((a, b) => Number(b.esCreador) - Number(a.esCreador) || a.nombre.localeCompare(b.nombre, 'es'));
  }, [mapa, busqueda, creadorId]);

  if (!contexto?.creador || !empresaId) return null;
  return <section style={panel} aria-labelledby="titulo-mapa-accesos">
    <div style={{ display: 'flex', alignItems: 'start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
      <div>
        <h2 id="titulo-mapa-accesos" style={{ margin: '0 0 6px', fontSize: 18 }}>Accesos por usuario</h2>
        <p style={{ margin: 0, color: 'var(--text-secondary)' }}>Personas de la empresa activa, obras asignadas y permiso efectivo. Los planos de cada obra heredan ese acceso.</p>
      </div>
      <button type="button" style={boton} onClick={cargar} disabled={cargando}>{cargando ? 'Actualizando…' : 'Actualizar'}</button>
    </div>
    <label style={{ display: 'grid', gap: 6, maxWidth: 360, margin: '16px 0' }}>Buscar persona u obra
      <input type="search" value={busqueda} onChange={event => setBusqueda(event.target.value)} placeholder="Nombre, correo u obra"
        style={{ minHeight: 42, width: '100%', padding: '8px 12px', border: '1px solid var(--border-default)', borderRadius: 8, background: 'var(--bg-surface)', color: 'var(--text-primary)', font: 'inherit' }} />
    </label>
    {error && <p role="alert" style={{ color: 'var(--text-danger, #b42318)' }}>{error}</p>}
    {!error && cargando && !mapa && <p role="status">Cargando accesos…</p>}
    {!error && !cargando && filas.length === 0 && <p style={{ color: 'var(--text-secondary)' }}>No hay personas que coincidan con la búsqueda.</p>}
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 330px), 1fr))', gap: 12 }}>
      {filas.map(fila => <article key={fila.user_id} style={{ border: '1px solid var(--border-default)', borderRadius: 10, padding: 14, minWidth: 0 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ minWidth: 0 }}>
            <strong style={{ display: 'block' }}>{fila.nombre}</strong>
            <span style={{ color: 'var(--text-secondary)', overflowWrap: 'anywhere' }}>{fila.email}</span>
          </div>
          <span style={{ color: fila.miembro && !fila.miembro.activo ? 'var(--text-secondary)' : 'var(--accent)', fontWeight: 600 }}>
            {fila.esCreador ? 'Creador' : fila.miembro?.activo ? etiquetas[fila.miembro.rol] ?? fila.miembro.rol : 'Sin acceso'}
          </span>
        </div>
        <div style={{ marginTop: 12, display: 'grid', gap: 6 }}>
          {fila.esCreador && <span>Puede ver y administrar todas las obras de la plataforma.</span>}
          {!fila.esCreador && !fila.miembro?.activo && <span style={{ color: 'var(--text-secondary)' }}>Membresía inactiva: no ve obras.</span>}
          {!fila.esCreador && fila.miembro?.activo && fila.asignaciones.length === 0 &&
            <span style={{ color: 'var(--text-secondary)' }}>Sin obras asignadas: no ve proyectos ni OTs.</span>}
          {!fila.esCreador && fila.miembro?.activo && fila.asignaciones.map(item =>
            <div key={item.id} style={{ padding: '7px 9px', background: 'var(--bg-subtle)', borderRadius: 7 }}>
              <strong>{item.nombre}</strong><span style={{ display: 'block', color: 'var(--text-secondary)', fontSize: 13 }}>{item.permiso}</span>
            </div>)}
          {fila.delegacion?.activa && <small style={{ color: 'var(--text-secondary)' }}>
            Invitaciones delegadas: {fila.invitacionesUsadas} de {fila.delegacion.limite} usadas.
          </small>}
          {fila.invitaciones.length > 0 && <small style={{ color: 'var(--text-secondary)' }}>
            {fila.invitaciones.some(item => item.estado === 'enviada') ? 'Invitación enviada por correo.' : 'Invitación en preparación.'}
            {' '}Este panel no confirma si ya eligió su contraseña.
          </small>}
        </div>
      </article>)}
    </div>
  </section>;
}
