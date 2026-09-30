import { useEffect, useState } from 'react';
import { supabase } from '../../db/supabase';
import { useAuthStore } from '../../stores/authStore';
import { useAccessStore } from '../../stores/accessStore';

interface Delegacion { limite: number; activa: boolean }
interface Invitacion { id: string; email: string; proyecto_id: string; estado: string }

const card: React.CSSProperties = { padding: 24, border: '1px solid var(--border-default)', borderRadius: 12, background: 'var(--bg-surface)' };
const field: React.CSSProperties = { display: 'grid', gap: 6, minWidth: 0 };
const input: React.CSSProperties = { width: '100%', minHeight: 44, padding: '10px 12px', border: '1px solid var(--border-default)', borderRadius: 8, background: 'var(--bg-surface)', color: 'var(--text-primary)', font: 'inherit', boxSizing: 'border-box' };

export function InvitacionesEquipo() {
  const userId = useAuthStore(s => s.user?.id);
  const contexto = useAccessStore(s => s.contexto);
  const empresaId = useAccessStore(s => s.empresaId);
  const [delegacion, setDelegacion] = useState<Delegacion | null>(null);
  const [invitaciones, setInvitaciones] = useState<Invitacion[]>([]);
  const [torres, setTorres] = useState<string[]>([]);
  const [email, setEmail] = useState('');
  const [nombre, setNombre] = useState('');
  const [apellidos, setApellidos] = useState('');
  const [obraId, setObraId] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!userId || !empresaId || contexto?.creador) return;
    let active = true;
    Promise.all([
      supabase.from('plan_delegaciones_invitacion').select('limite,activa').eq('tenant_id', empresaId).eq('supervisor_id', userId).maybeSingle(),
      supabase.from('plan_invitaciones_equipo').select('id,email,proyecto_id,estado').eq('tenant_id', empresaId).eq('supervisor_id', userId).order('created_at', { ascending: true }),
      supabase.from('proyectos').select('id').eq('tenant_id', empresaId).is('proyecto_padre_id', null).is('deleted_at', null),
    ]).then(([grant, invites, works]) => {
      if (!active) return;
      if (grant.error || invites.error || works.error) throw new Error(grant.error?.message ?? invites.error?.message ?? works.error?.message);
      setDelegacion(grant.data as Delegacion | null);
      setInvitaciones((invites.data ?? []) as Invitacion[]);
      setTorres((works.data ?? []).map(obra => obra.id));
    }).catch(error => { if (active) setMensaje(error instanceof Error ? error.message : 'No se pudieron cargar las invitaciones.'); });
    return () => { active = false; };
  }, [userId, empresaId, contexto?.creador]);

  if (!delegacion || contexto?.creador) return null;
  const obras = (contexto?.obras ?? []).filter(o => o.tenant_id === empresaId && o.administrar && torres.includes(o.id));
  const restantes = Math.max(0, delegacion.limite - invitaciones.length);

  async function enviar() {
    if (!empresaId || !obraId || !email.trim() || !delegacion?.activa || restantes === 0 || busy) return;
    setBusy(true); setMensaje('');
    try {
      const result = await supabase.functions.invoke('invitar-usuario', {
        body: { tenantId: empresaId, proyectoId: obraId, rol: 'tecnico', email: email.trim(), nombre: nombre.trim(), apellidos: apellidos.trim() },
      });
      if (result.error) {
        const response = result.error.context;
        const detail = response instanceof Response ? await response.json().catch(() => null) : null;
        throw new Error(detail?.error ?? result.error.message);
      }
      const { data, error } = await supabase.from('plan_invitaciones_equipo')
        .select('id,email,proyecto_id,estado').eq('tenant_id', empresaId).eq('supervisor_id', userId).order('created_at', { ascending: true });
      if (error) throw error;
      setInvitaciones((data ?? []) as Invitacion[]);
      setMensaje(`Invitación enviada a ${email.trim()}. El acceso será solo a la obra seleccionada.`);
      setEmail(''); setNombre(''); setApellidos('');
    } catch (error) { setMensaje(error instanceof Error ? error.message : 'No se pudo enviar la invitación.'); }
    finally { setBusy(false); }
  }

  return <section style={card}>
    <h2 style={{ margin: '0 0 8px', fontSize: 20 }}>Invitar a tu equipo</h2>
    <p style={{ margin: '0 0 16px', color: 'var(--text-secondary)' }}>
      {delegacion.activa ? `Quedan ${restantes} de ${delegacion.limite} invitaciones de prueba.` : 'El Creador desactivó temporalmente las invitaciones.'}
      {' '}Cada cuenta entra como Técnico y ve solo la torre que elijas.
    </p>
    {delegacion.activa && restantes > 0 && <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
        <label style={field}>Nombre<input style={input} value={nombre} onChange={e => setNombre(e.target.value)} /></label>
        <label style={field}>Apellidos<input style={input} value={apellidos} onChange={e => setApellidos(e.target.value)} /></label>
        <label style={field}>Correo electrónico<input style={input} type="email" value={email} onChange={e => setEmail(e.target.value)} /></label>
      </div>
      <label style={field}>Obra asignada
        <select className="app-select" value={obraId} onChange={e => setObraId(e.target.value)}>
          <option value="">Elegí una obra</option>
          {obras.map(obra => <option key={obra.id} value={obra.id}>{obra.nombre}</option>)}
        </select>
      </label>
      <button type="button" disabled={busy || !email.trim() || !obraId} onClick={() => void enviar()}
        style={{ width: 'fit-content', minHeight: 44, padding: '0 18px', border: 0, borderRadius: 8, background: 'var(--accent)', color: 'white', font: 'inherit', fontWeight: 600, cursor: 'pointer' }}>
        {busy ? 'Enviando…' : 'Enviar invitación'}
      </button>
    </div>}
    {invitaciones.length > 0 && <div style={{ marginTop: 18 }}>
      <strong>Invitaciones utilizadas</strong>
      <ul style={{ marginBottom: 0, paddingLeft: 20 }}>{invitaciones.map(item => <li key={item.id}>
        {item.email} · {obras.find(o => o.id === item.proyecto_id)?.nombre ?? 'Obra asignada'} · {item.estado === 'enviada' ? 'Enviada' : 'Pendiente de completar'}
      </li>)}</ul>
    </div>}
    {mensaje && <p role="status" style={{ marginBottom: 0 }}>{mensaje}</p>}
  </section>;
}
