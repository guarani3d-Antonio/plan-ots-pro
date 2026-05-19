// src/components/views/Configuracion.tsx
//
// Vista de Configuración rediseñada en grid 7/5:
//   • Izquierda: Datos Personales + Gestión de Roles
//   • Derecha:   Suscripción y Pago + Acciones de Cuenta
//
// Lee TODO desde `user` del authStore (email + user_metadata). Cambios de perfil
// y rol persisten vía supabase.auth.updateUser; sign-out delega al store.

import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { useAuthStore } from '../../stores/authStore';
import { useProyectosStore } from '../../stores/proyectosStore';
import { supabase } from '../../db/supabase';
import { useToast } from '../ui/Toast';

interface Rol {
  id:    'creador' | 'editor' | 'comentarista' | 'lector';
  label: string;
  desc:  string;
}

// ─── Miembros del proyecto (gestión + invitaciones) ────────────────────────
type RolMiembro = 'Creador' | 'Editor' | 'Comentarista' | 'Lector';
interface Miembro {
  id:                string;
  nombre:            string;
  email:             string;
  rol:               RolMiembro;
  ultima_actividad?: string;
  avatar_url?:       string;
}

const ROLES: Rol[] = [
  { id: 'creador',      label: 'Creador',      desc: 'Control total, gestión de usuarios y configuración.' },
  { id: 'editor',       label: 'Editor',       desc: 'Puede crear y modificar órdenes de trabajo.' },
  { id: 'comentarista', label: 'Comentarista', desc: 'Visualización y añadido de notas técnicas.' },
  { id: 'lector',       label: 'Lector',       desc: 'Acceso restringido a consulta de reportes.' },
];

export default function Configuracion() {
  const user    = useAuthStore(s => s.user);
  const signOut = useAuthStore(s => s.signOut);
  const { mostrar, ToastComponent } = useToast();

  const meta = (user?.user_metadata ?? {}) as Record<string, unknown>;
  const [nombre, setNombre]       = useState<string>(typeof meta.nombre    === 'string' ? meta.nombre    : '');
  const [apellidos, setApellidos] = useState<string>(typeof meta.apellidos === 'string' ? meta.apellidos : '');
  const [rolActual, setRolActual] = useState<Rol['id']>(
    (typeof meta.rol === 'string' && ROLES.some(r => r.id === meta.rol)) ? meta.rol as Rol['id'] : 'editor'
  );
  const [guardando, setGuardando] = useState(false);
  const [cerrando,  setCerrando]  = useState(false);

  // ── Gestión de Miembros del proyecto ─────────────────────────────────────
  const [miembros, setMiembros]               = useState<Miembro[]>([]);
  const [buscarMiembro, setBuscarMiembro]     = useState('');
  const [mostrarInvitar, setMostrarInvitar]   = useState(false);
  const [invEmail, setInvEmail]               = useState('');
  const [invNombre, setInvNombre]             = useState('');
  const [invRol, setInvRol]                   = useState<RolMiembro>('Editor');
  const [enviandoInv, setEnviandoInv]         = useState(false);

  useEffect(() => {
    // Sin proyecto activo o aún sin tabla de proyecto_miembros (S21): mostramos
    // sólo al usuario actual como Supervisor. Cuando se implemente la query a
    // proyecto_miembros JOIN auth.users, reemplazar el cuerpo del effect.
    if (!user) return;
    void useProyectosStore.getState().proyectoActivo?.id; // referenciado a propósito para futura migración
    const nombreUser =
      (typeof meta.nombre === 'string' && meta.nombre) ||
      user.email?.split('@')[0] ||
      'Usuario';
    setMiembros([{
      id:               user.id,
      nombre:           nombreUser,
      email:            user.email ?? '',
      rol:              'Creador',
      ultima_actividad: 'Ahora',
    }]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const miembrosFiltrados = miembros.filter(m =>
    m.nombre.toLowerCase().includes(buscarMiembro.toLowerCase()) ||
    m.email.toLowerCase().includes(buscarMiembro.toLowerCase())
  );

  const handleEnviarInvitacion = async () => {
    if (!invEmail || !invNombre) {
      mostrar('Completá el email y el nombre', 'error');
      return;
    }
    setEnviandoInv(true);
    // Stub — en S21 se implementa supabase auth invite + insert en proyecto_miembros.
    await new Promise(r => setTimeout(r, 800));
    mostrar(`Invitación enviada a ${invEmail} (funcionalidad en desarrollo)`, 'info');
    setMostrarInvitar(false);
    setInvEmail(''); setInvNombre(''); setInvRol('Editor');
    setEnviandoInv(false);
  };

  const idCorto = user?.id ? user.id.slice(0, 8).toUpperCase() : '—';
  const inicial = (
    (typeof meta.nombre === 'string' && meta.nombre[0]) ||
    user?.email?.[0] ||
    '?'
  ).toUpperCase();

  const handleGuardarPerfil = async () => {
    setGuardando(true);
    try {
      const { error } = await supabase.auth.updateUser({
        data: { ...meta, nombre, apellidos, rol: rolActual },
      });
      if (error) {
        mostrar('Error al guardar el perfil: ' + error.message, 'error');
      } else {
        mostrar('Perfil actualizado correctamente.', 'success');
      }
    } catch (err) {
      mostrar('Error al guardar el perfil.', 'error');
      console.error('[Configuracion] updateUser:', err);
    } finally {
      setGuardando(false);
    }
  };

  const handleCambioRol = async (nuevo: Rol['id']) => {
    setRolActual(nuevo);
    try {
      const { error } = await supabase.auth.updateUser({
        data: { ...meta, nombre, apellidos, rol: nuevo },
      });
      if (error) {
        mostrar('Error al cambiar el rol: ' + error.message, 'error');
      } else {
        mostrar(`Rol actualizado a "${ROLES.find(r => r.id === nuevo)?.label}".`, 'success');
      }
    } catch (err) {
      console.error('[Configuracion] updateUser rol:', err);
    }
  };

  const handleCerrarSesion = async () => {
    setCerrando(true);
    try { await signOut(); }
    finally { setCerrando(false); }
  };

  const handleEliminarCuenta = () => {
    const ok = window.confirm('¿Estás seguro? Esta acción es irreversible.');
    if (!ok) return;
    mostrar('Funcionalidad en desarrollo.', 'info');
  };

  // ── Estilos compartidos ───────────────────────────────────────────────────
  const cardStyle: CSSProperties = {
    background: 'white', border: '1px solid #E2E2E7', borderRadius: 8,
    padding: 24, position: 'relative',
  };
  const cardHeaderStyle: CSSProperties = {
    fontSize: 12, fontWeight: 700, color: '#001E40',
    textTransform: 'uppercase', letterSpacing: '0.06em',
    marginBottom: 18,
  };
  const inputStyle: CSSProperties = {
    width: '100%', height: 36, padding: '0 12px', fontSize: 13,
    border: '1px solid #E2E2E7', borderRadius: 6, outline: 'none',
    fontFamily: 'inherit', color: '#0F172A', background: 'white',
    boxSizing: 'border-box',
  };
  const inputReadonlyStyle: CSSProperties = {
    ...inputStyle, background: '#F4F3F8', color: '#6B7280',
    display: 'flex', alignItems: 'center', gap: 6,
  };
  const labelStyle: CSSProperties = {
    fontSize: 10, fontWeight: 700, color: '#9CA3AF',
    textTransform: 'uppercase', letterSpacing: '0.06em',
    marginBottom: 4, display: 'block',
  };
  const btnPrimary: CSSProperties = {
    background: '#001E40', color: 'white', border: 'none',
    borderRadius: 6, padding: '8px 18px', fontSize: 13, fontWeight: 700,
    cursor: 'pointer', fontFamily: 'inherit',
  };
  const btnOutline: CSSProperties = {
    background: 'white', color: '#001E40', border: '1px solid #E2E2E7',
    borderRadius: 6, padding: '8px 14px', fontSize: 13, fontWeight: 600,
    cursor: 'pointer', fontFamily: 'inherit', width: '100%',
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
  };

  return (
    <div style={{
      flex: 1, overflow: 'auto', background: '#F9F9FE',
      padding: 32,
    }}>
      <div style={{
        maxWidth: 900, margin: '0 auto',
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 7fr) minmax(0, 5fr)',
        gap: 20,
      }}>

        {/* ═══ COLUMNA IZQUIERDA ═══ */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* CARD 1: Datos Personales */}
          <div style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
              <span style={{
                fontSize: 12, fontWeight: 700, color: '#001E40',
                textTransform: 'uppercase', letterSpacing: '0.06em',
              }}>Datos Personales</span>
              <span style={{
                fontSize: 11, color: '#9CA3AF',
                fontFamily: 'Menlo, Monaco, Consolas, monospace',
              }}>ID: {idCorto}</span>
            </div>

            <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
              {/* Avatar */}
              <div style={{ position: 'relative', flexShrink: 0 }}>
                <div style={{
                  width: 80, height: 80, borderRadius: '50%',
                  border: '2px solid #003366', background: '#416181',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'white', fontSize: 32, fontWeight: 700,
                }}>{inicial}</div>
                <button
                  type="button"
                  onClick={() => mostrar('Subida de foto: próximamente.', 'info')}
                  title="Cambiar foto"
                  style={{
                    position: 'absolute', bottom: -2, right: -2,
                    width: 26, height: 26, borderRadius: '50%',
                    background: '#2462C9', color: 'white', border: '2px solid white',
                    cursor: 'pointer', fontSize: 12,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontFamily: 'inherit', padding: 0,
                  }}
                >✏️</button>
              </div>

              {/* Campos */}
              <div style={{
                flex: 1, display: 'grid',
                gridTemplateColumns: '1fr 1fr', gap: 12,
              }}>
                <div>
                  <label style={labelStyle}>Nombre</label>
                  <input
                    style={inputStyle}
                    value={nombre}
                    onChange={e => setNombre(e.target.value)}
                    placeholder="Tu nombre"
                  />
                </div>
                <div>
                  <label style={labelStyle}>Apellidos</label>
                  <input
                    style={inputStyle}
                    value={apellidos}
                    onChange={e => setApellidos(e.target.value)}
                    placeholder="Tus apellidos"
                  />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={labelStyle}>Email (no editable)</label>
                  <div style={inputReadonlyStyle}>
                    <span>🔒</span>
                    <span style={{ fontSize: 13 }}>{user?.email ?? '—'}</span>
                  </div>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 18 }}>
              <button
                type="button"
                onClick={handleGuardarPerfil}
                disabled={guardando}
                style={{
                  ...btnPrimary,
                  opacity: guardando ? 0.6 : 1,
                  cursor: guardando ? 'wait' : 'pointer',
                }}
              >{guardando ? 'Guardando…' : 'Guardar cambios'}</button>
            </div>
          </div>

          {/* CARD 2: Gestión de Roles */}
          <div style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <span style={{
                fontSize: 12, fontWeight: 700, color: '#001E40',
                textTransform: 'uppercase', letterSpacing: '0.06em',
              }}>Gestión de Roles</span>
              <span style={{
                fontSize: 10, fontWeight: 700, color: '#2462C9',
                background: '#EFF6FF', padding: '3px 10px', borderRadius: 10,
                textTransform: 'uppercase', letterSpacing: '0.06em',
              }}>Acceso Admin</span>
            </div>

            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12,
            }}>
              {ROLES.map(r => {
                const seleccionado = rolActual === r.id;
                return (
                  <div
                    key={r.id}
                    onClick={() => handleCambioRol(r.id)}
                    style={{
                      border: `1px solid ${seleccionado ? '#001E40' : '#E2E2E7'}`,
                      borderRadius: 8, padding: 14, cursor: 'pointer',
                      background: seleccionado ? 'rgba(0,30,64,0.04)' : 'white',
                      position: 'relative',
                      transition: 'border-color 0.15s, background 0.15s',
                    }}
                    onMouseEnter={(e) => {
                      if (!seleccionado) (e.currentTarget as HTMLDivElement).style.borderColor = '#A7C8FF';
                    }}
                    onMouseLeave={(e) => {
                      if (!seleccionado) (e.currentTarget as HTMLDivElement).style.borderColor = '#E2E2E7';
                    }}
                  >
                    <input
                      type="radio"
                      checked={seleccionado}
                      onChange={() => handleCambioRol(r.id)}
                      style={{
                        position: 'absolute', top: 12, right: 12,
                        accentColor: '#001E40', cursor: 'pointer',
                      }}
                    />
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#001E40', marginBottom: 4 }}>{r.label}</div>
                    <div style={{ fontSize: 11, color: '#6B7280', lineHeight: 1.4, paddingRight: 20 }}>{r.desc}</div>
                  </div>
                );
              })}
            </div>

            <div style={{
              marginTop: 14, padding: '8px 12px',
              background: '#FFFBEB', border: '1px solid #FCD34D', borderRadius: 6,
              fontSize: 11, color: '#92400E',
            }}>
              ⚠️ Cambiar el rol afectará inmediatamente los permisos de acceso.
            </div>
          </div>

        </div>

        {/* ═══ COLUMNA DERECHA ═══ */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* CARD 3: Suscripción y Pago */}
          <div style={cardStyle}>
            <span style={{
              position: 'absolute', top: 18, right: 24,
              fontSize: 10, fontWeight: 700, color: '#15803D',
              background: '#DCFCE7', padding: '3px 10px', borderRadius: 10,
              textTransform: 'uppercase', letterSpacing: '0.06em',
            }}>Activo</span>
            <div style={cardHeaderStyle}>Suscripción y Pago</div>

            {/* Sub-card azul claro */}
            <div style={{
              background: '#EFF6FF', border: '1px solid #BFDBFE',
              borderRadius: 6, padding: '12px 14px', marginBottom: 14,
            }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#001E40' }}>Licencia Plan-OTs</div>
              <div style={{ fontSize: 11, color: '#2462C9', marginTop: 2 }}>Activa · BBC Facility Services</div>
            </div>

            <button
              type="button"
              style={btnOutline}
              onClick={() => mostrar('Gestión de suscripción: próximamente.', 'info')}
            >💳 Administrar suscripción</button>

            <div style={{ borderTop: '1px solid #F3F4F6', margin: '18px 0 14px' }}/>

            <div style={{ ...cardHeaderStyle, marginBottom: 12, fontSize: 10 }}>Método de pago</div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <label style={labelStyle}>Número de tarjeta</label>
                <div style={{ position: 'relative' }}>
                  <span style={{
                    position: 'absolute', left: 10, top: '50%',
                    transform: 'translateY(-50%)', fontSize: 12, color: '#9CA3AF',
                    pointerEvents: 'none',
                  }}>🔒</span>
                  <input
                    style={{ ...inputStyle, paddingLeft: 32, background: '#F9F9FE' }}
                    placeholder="0000 0000 0000 0000"
                    disabled
                  />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={labelStyle}>Expiración</label>
                  <input style={{ ...inputStyle, background: '#F9F9FE' }} placeholder="MM/AA" disabled />
                </div>
                <div>
                  <label style={labelStyle}>CVV</label>
                  <input style={{ ...inputStyle, background: '#F9F9FE' }} placeholder="123" disabled />
                </div>
              </div>
              <div>
                <label style={labelStyle}>Nombre en tarjeta</label>
                <input style={{ ...inputStyle, background: '#F9F9FE' }} placeholder="Como aparece" disabled />
              </div>

              <button
                type="button"
                disabled
                style={{
                  background: '#2462C9', color: 'white', border: 'none',
                  borderRadius: 6, padding: '8px 14px', fontSize: 13, fontWeight: 700,
                  cursor: 'not-allowed', opacity: 0.5, fontFamily: 'inherit',
                  marginTop: 4,
                }}
              >Pagar ahora</button>

              <p style={{
                fontSize: 10, fontStyle: 'italic', color: '#9CA3AF',
                margin: '4px 0 0', textAlign: 'center',
              }}>
                Funcionalidad en desarrollo · Próximamente
              </p>
            </div>
          </div>

          {/* CARD 4: Acciones de Cuenta */}
          <div style={{
            background: 'white', border: '1px solid #FECACA', borderRadius: 8,
            padding: 24,
          }}>
            <div style={{
              fontSize: 12, fontWeight: 700, color: '#DC2626',
              textTransform: 'uppercase', letterSpacing: '0.06em',
              marginBottom: 16,
            }}>Acciones de Cuenta</div>

            <button
              type="button"
              onClick={handleCerrarSesion}
              disabled={cerrando}
              style={{
                ...btnOutline,
                opacity: cerrando ? 0.6 : 1,
                cursor: cerrando ? 'wait' : 'pointer',
              }}
            >🚪 {cerrando ? 'Cerrando…' : 'Cerrar sesión'}</button>

            <div style={{ borderTop: '1px solid #F3F4F6', margin: '18px 0 12px' }}/>

            <div style={{ fontSize: 11, color: '#6B7280', marginBottom: 8 }}>Solo para administradores:</div>

            <button
              type="button"
              onClick={handleEliminarCuenta}
              style={{
                width: '100%',
                background: '#FEE2E2', color: '#DC2626',
                border: '1px solid #FECACA', borderRadius: 6,
                padding: '8px 14px', fontSize: 13, fontWeight: 700,
                cursor: 'pointer', fontFamily: 'inherit',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}
            >🗑 Eliminar cuenta permanentemente</button>

            <p style={{
              fontSize: 10, color: '#DC2626', margin: '8px 0 0',
              textAlign: 'center',
            }}>
              Esta acción borrará todos los datos de forma irreversible.
            </p>
          </div>

        </div>

        {/* ═══ CARD ANCHO COMPLETO: Gestión de Miembros y Roles ═══ */}
        <div style={{
          gridColumn: '1 / -1',
          background: 'white',
          border: '1px solid #E2E2E7',
          borderRadius: 8,
          overflow: 'hidden',
        }}>

          {/* Header */}
          <div style={{
            padding: '20px 24px', borderBottom: '1px solid #F3F4F6',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <div>
              <h2 style={{
                fontSize: 12, fontWeight: 700, textTransform: 'uppercase',
                letterSpacing: '0.08em', color: '#001E40', margin: 0,
              }}>Gestión de Miembros y Roles</h2>
              <p style={{ fontSize: 11, color: '#9CA3AF', margin: '2px 0 0' }}>
                Ajustes / Miembros y Permisos
              </p>
            </div>
            <button
              type="button"
              onClick={() => setMostrarInvitar(true)}
              style={{
                background: '#001E40', color: 'white', border: 'none',
                padding: '8px 16px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                fontFamily: 'inherit',
              }}
            >+ Invitar Miembro</button>
          </div>

          {/* Buscador */}
          <div style={{ padding: '12px 24px', borderBottom: '1px solid #F3F4F6' }}>
            <input
              value={buscarMiembro}
              onChange={e => setBuscarMiembro(e.target.value)}
              placeholder="🔍 Buscar miembro por nombre o correo..."
              style={{
                width: '100%', maxWidth: 400, height: 36, padding: '0 12px',
                border: '1px solid #E2E2E7', borderRadius: 8, fontSize: 13,
                outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Tabla */}
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#F9F9FE' }}>
                {['Miembro', 'Correo Electrónico', 'Rol', 'Última Actividad', ''].map(h => (
                  <th key={h} style={{
                    padding: '10px 24px', textAlign: 'left',
                    fontSize: 11, fontWeight: 700, color: '#6B7280',
                    textTransform: 'uppercase', letterSpacing: '0.05em',
                    borderBottom: '1px solid #E2E2E7',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {miembrosFiltrados.map((m, i) => {
                const colorRol = m.rol === 'Creador'      ? { bg: '#EDE9FE', color: '#7C3AED' }
                              : m.rol === 'Editor'       ? { bg: '#EFF6FF', color: '#1D4ED8' }
                              : m.rol === 'Comentarista' ? { bg: '#F0FDF4', color: '#15803D' }
                              :                            { bg: '#F3F4F6', color: '#6B7280' };
                return (
                  <tr key={m.id} style={{
                    background: i % 2 === 0 ? 'white' : '#FAFAFA',
                    borderBottom: '1px solid #F3F4F6',
                  }}>
                    {/* Avatar + nombre */}
                    <td style={{ padding: '12px 24px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{
                          width: 38, height: 38, borderRadius: '50%', flexShrink: 0,
                          background: m.avatar_url ? 'transparent' : '#416181',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          overflow: 'hidden', border: '2px solid #E2E2E7',
                        }}>
                          {m.avatar_url
                            ? <img src={m.avatar_url} alt={m.nombre} style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
                            : <span style={{ color: 'white', fontWeight: 700, fontSize: 14 }}>
                                {m.nombre[0]?.toUpperCase() ?? '?'}
                              </span>
                          }
                        </div>
                        <span style={{ fontWeight: 600, fontSize: 13, color: '#1a1c1f' }}>{m.nombre}</span>
                      </div>
                    </td>
                    <td style={{ padding: '12px 24px', fontSize: 13, color: '#6B7280' }}>
                      {m.email}
                    </td>
                    <td style={{ padding: '12px 24px' }}>
                      <span style={{
                        background: colorRol.bg, color: colorRol.color,
                        padding: '3px 10px', borderRadius: 20,
                        fontSize: 11, fontWeight: 700,
                      }}>{m.rol}</span>
                    </td>
                    <td style={{ padding: '12px 24px', fontSize: 12, color: '#9CA3AF' }}>
                      {m.ultima_actividad ?? '—'}
                    </td>
                    <td style={{ padding: '12px 24px', textAlign: 'right' }}>
                      <button
                        type="button"
                        style={{
                          background: 'none', border: 'none', cursor: 'pointer',
                          fontSize: 18, color: '#9CA3AF', padding: '4px 8px',
                          fontFamily: 'inherit',
                        }}
                      >···</button>
                    </td>
                  </tr>
                );
              })}
              {miembrosFiltrados.length === 0 && (
                <tr><td colSpan={5} style={{
                  padding: 32, textAlign: 'center', fontSize: 13, color: '#9CA3AF',
                }}>No se encontraron miembros</td></tr>
              )}
            </tbody>
          </table>
        </div>

      </div>

      {/* Modal "Invitar Nuevo Miembro" */}
      {mostrarInvitar && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
            zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          onClick={() => setMostrarInvitar(false)}
        >
          <div
            style={{
              background: 'white', borderRadius: 12, width: 440, padding: 28,
              boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
            }}
            onClick={e => e.stopPropagation()}
          >
            <h3 style={{ fontSize: 18, fontWeight: 700, color: '#001E40', margin: '0 0 20px' }}>
              Invitar Nuevo Miembro
            </h3>

            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>
                Dirección de Correo
              </label>
              <input
                value={invEmail}
                onChange={e => setInvEmail(e.target.value)}
                placeholder="ejemplo@empresa.com"
                type="email"
                style={{
                  width: '100%', height: 40, padding: '0 12px',
                  border: '1px solid #E2E2E7', borderRadius: 8, fontSize: 13,
                  outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit',
                }}
              />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>
                Nombre Completo
              </label>
              <input
                value={invNombre}
                onChange={e => setInvNombre(e.target.value)}
                placeholder="Ingrese el nombre"
                style={{
                  width: '100%', height: 40, padding: '0 12px',
                  border: '1px solid #E2E2E7', borderRadius: 8, fontSize: 13,
                  outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit',
                }}
              />
            </div>

            <div style={{ marginBottom: 24 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>
                Rol
              </label>
              <select
                value={invRol}
                onChange={e => setInvRol(e.target.value as RolMiembro)}
                style={{
                  width: '100%', height: 40, padding: '0 12px',
                  border: '2px solid #001E40', borderRadius: 8, fontSize: 13,
                  background: 'white', cursor: 'pointer', outline: 'none',
                  fontFamily: 'inherit',
                }}
              >
                <option value="Creador">Creador</option>
                <option value="Editor">Editor</option>
                <option value="Comentarista">Comentarista</option>
                <option value="Lector">Lector</option>
              </select>
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setMostrarInvitar(false)}
                style={{
                  padding: '9px 20px', border: '1px solid #E2E2E7',
                  borderRadius: 8, background: 'white', fontSize: 13,
                  fontWeight: 600, cursor: 'pointer', color: '#374151',
                  fontFamily: 'inherit',
                }}
              >Cancelar</button>
              <button
                type="button"
                onClick={handleEnviarInvitacion}
                disabled={enviandoInv}
                style={{
                  padding: '9px 20px', background: '#001E40', color: 'white',
                  border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700,
                  cursor: enviandoInv ? 'not-allowed' : 'pointer',
                  opacity: enviandoInv ? 0.7 : 1,
                  fontFamily: 'inherit',
                }}
              >{enviandoInv ? '⏳ Enviando...' : '✉️ Enviar Invitación'}</button>
            </div>
          </div>
        </div>
      )}

      {ToastComponent}
    </div>
  );
}
