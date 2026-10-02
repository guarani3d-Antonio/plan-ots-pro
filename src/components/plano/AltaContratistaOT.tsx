import { useRef, useState } from 'react';
import { supabase } from '../../db/supabase';
import { assertSession, sessionTicket } from '../../security/sessionScope';
import { useAccessStore } from '../../stores/accessStore';
import { VoiceInputButton } from '../ui/VoiceInputButton';
import styles from './AltaClienteOT.module.css';

export function AltaContratistaOT({ tenantId, onGuardar, onCancelar, onBusy }: {
  tenantId: string; onGuardar: (nombre: string) => void; onCancelar: () => void; onBusy: (busy: boolean) => void;
}) {
  const [datos, setDatos] = useState({ nombre:'', identificacion:'', contacto:'', telefono:'', correo:'', direccion:'' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const lock = useRef(false);
  async function guardar() {
    if (lock.current || !datos.nombre.trim()) return;
    if (!useAccessStore.getState().contexto?.creador) { setError('El Creador debe registrar los contratistas del directorio.'); return; }
    if (datos.correo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(datos.correo)) { setError('Revisá el correo del contratista.'); return; }
    lock.current = true; setBusy(true); onBusy(true); setError('');
    try {
      const ticket = sessionTicket();
      const existente = await supabase.from('plan_contratistas').select('id').eq('tenant_id', tenantId)
        .eq('nombre_clave', datos.nombre.trim().toLocaleLowerCase('es')).maybeSingle();
      assertSession(ticket);
      if (existente.error) throw new Error(existente.error.message);
      if (existente.data) throw new Error('Este contratista ya existe. Seleccionalo con «Buscar contratista»; su ficha no se modificó.');
      const { data, error } = await supabase.rpc('plan_guardar_contratista_ficha', { p_tenant:tenantId, p_id:null,
        p_nombre:datos.nombre, p_identificacion:datos.identificacion, p_contacto:datos.contacto,
        p_telefono:datos.telefono, p_correo:datos.correo, p_direccion:datos.direccion, p_activo:true });
      assertSession(ticket);
      if (error) throw new Error(error.message);
      const ficha = await supabase.from('plan_contratistas').select('nombre').eq('id', data as string).single();
      assertSession(ticket);
      if (ficha.error) throw new Error(ficha.error.message);
      onGuardar(ficha.data.nombre);
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo guardar el contratista.'); }
    finally { lock.current = false; setBusy(false); onBusy(false); }
  }
  return <section className={styles.card}>
    <fieldset disabled={busy}><div className={styles.grid}>
      {([['nombre','Nombre o razón social',160],['identificacion','RUC o documento',80],['contacto','Persona de contacto',160],
        ['telefono','Teléfono',80],['correo','Correo',254],['direccion','Dirección',500]] as const).map(([key,label,max]) => <label key={key} htmlFor={`alta-${key}`}>
        <span className={styles.labelRow}>{label}{key === 'nombre' ? ' *' : ''}<VoiceInputButton compact value={datos[key]} maxLength={max} onChange={v => setDatos(d => ({ ...d,[key]:v }))} /></span>
        <input id={`alta-${key}`} value={datos[key]} maxLength={max} type={key === 'correo' ? 'email' : key === 'telefono' ? 'tel' : 'text'} onChange={e => setDatos(d => ({ ...d,[key]:e.target.value }))} />
      </label>)}
    </div></fieldset>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    <div className={styles.actions}><button disabled={busy || !datos.nombre.trim()} type="button" onClick={() => void guardar()}>{busy ? 'Guardando…' : 'Guardar y seleccionar'}</button>
      <button disabled={busy} type="button" onClick={onCancelar}>Cancelar</button></div>
  </section>;
}
