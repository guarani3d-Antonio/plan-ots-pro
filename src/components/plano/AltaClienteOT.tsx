import { useEffect, useRef, useState } from 'react';
import { supabase } from '../../db/supabase';
import { assertSession, sessionTicket } from '../../security/sessionScope';
import styles from './AltaClienteOT.module.css';
import { VoiceInputButton } from '../ui/VoiceInputButton';

export type ClienteObra = { cliente_id: string; ubicacion_id: string; nombre: string;
  identificacion: string | null; contacto: string | null; telefono: string | null;
  correo: string | null; domicilio: string | null; tipo_inmueble: string;
  nombre_obra: string; direccion_obra: string | null; piso: string | null;
  unidad: string | null; sector: string | null };
type Cliente = { id: string; nombre: string; identificacion: string | null };
const campos = [
  ['nombre', 'Nombre o razón social', 160], ['identificacion', 'RUC o documento', 80],
  ['contacto', 'Persona de contacto', 160], ['telefono', 'Teléfono', 80],
  ['correo', 'Correo', 254], ['domicilio', 'Domicilio del cliente', 500],
] as const;
const lugar = [['direccion_obra', 'Dirección de la obra', 500], ['piso', 'Piso', 40],
  ['unidad', 'Departamento, oficina o unidad', 80], ['sector', 'Sector', 120]] as const;
const inicial = { nombre: '', identificacion: '', contacto: '', telefono: '', correo: '', domicilio: '',
  tipo_inmueble: 'residencial_altura', direccion_obra: '', piso: '', unidad: '', sector: '' };

export function AltaClienteOT({ proyectoId, obra, clienteInicial, onGuardar, onCancelar, onBusy }:
  { proyectoId: string; obra: string; clienteInicial?: string; onGuardar: (cliente: ClienteObra) => void;
    onCancelar: () => void; onBusy: (busy: boolean) => void }) {
  const [datos, setDatos] = useState(inicial);
  const clienteId = clienteInicial ?? '';
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const solicitud = useRef(crypto.randomUUID());
  const lock = useRef(false);
  const activo = useRef(true);
  useEffect(() => {
    activo.current = true;
    void Promise.resolve().then(() => { const ticket = sessionTicket(); return supabase.rpc('plan_clientes_gestion_obra', { p_proyecto: proyectoId }).then(({ data, error }) => {
      if (!activo.current) return;
      assertSession(ticket);
      if (error) setError('No se pudo cargar el directorio. Cerrá este formulario y volvé a abrirlo.');
      else { setClientes((data ?? []) as Cliente[]); setCargando(false); }
    }); }).catch(() => { if (activo.current) setError('No se pudo conectar con el directorio. Volvé a abrir el formulario.'); });
    return () => { activo.current = false; };
  }, [proyectoId]);

  async function guardar() {
    if (lock.current || cargando) return;
    if ((!clienteId && !datos.nombre.trim()) || !datos.direccion_obra.trim()) {
      setError('Completá el nombre del cliente y la dirección de la obra.'); return;
    }
    if (!clienteId && datos.correo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(datos.correo)) {
      setError('Revisá el correo del cliente.'); return;
    }
    lock.current = true; setBusy(true); onBusy(true); setError('');
    try {
      const ticket = sessionTicket();
      const { data, error } = await supabase.rpc('plan_alta_cliente_obra', {
        p_proyecto: proyectoId, p_solicitud: solicitud.current, p_cliente: clienteId || null, p_datos: datos,
      });
      assertSession(ticket);
      if (error) throw new Error(error.code === '23505'
        ? 'Ya existe un cliente con ese documento. Buscalo en «Buscar cliente» y agregá una ubicación. Si no aparece, solicitá su vinculación al Creador.'
        : error.message);
      if (activo.current) onGuardar(data as ClienteObra);
    } catch (e) { if (activo.current) setError(e instanceof Error ? e.message : 'No se pudo guardar. Podés reintentar.'); }
    finally { lock.current = false; if (activo.current) setBusy(false); onBusy(false); }
  }

  return <section className={styles.card} aria-label="Alta de cliente y ubicación">
    <p>{clienteId ? `Nueva ubicación de ${clientes.find(c => c.id === clienteId)?.nombre ?? 'cliente seleccionado'}. Se conservará su ficha.` : 'Registrá el cliente y la ubicación del reclamo. Podrás reutilizarlos en próximas OTs.'}</p>
    <fieldset disabled={busy || cargando}>
      {!clienteId ? <div className={styles.grid}>{campos.map(([key, label, max]) => <label key={key} htmlFor={`alta-${key}`}>
        <span className={styles.labelRow}>{label}{key === 'nombre' ? ' *' : ''}<VoiceInputButton compact value={datos[key]} maxLength={max} onChange={v => setDatos(d => ({ ...d, [key]: v }))} /></span>
        <input id={`alta-${key}`} value={datos[key]} maxLength={max} type={key === 'correo' ? 'email' : key === 'telefono' ? 'tel' : 'text'}
          onChange={e => setDatos(d => ({ ...d, [key]: e.target.value }))} />
      </label>)}</div> : <p>Se conservarán los datos de la ficha existente; solo se agregará la nueva ubicación.</p>}
      <h4>Ubicación del reclamo</h4>
      <p><strong>Obra:</strong> {obra}</p>
      <div className={styles.grid}>
        <label>Tipo de inmueble
          <select value={datos.tipo_inmueble} onChange={e => setDatos(d => ({ ...d, tipo_inmueble: e.target.value }))}>
            <option value="residencial_altura">Residencial en altura</option><option value="oficina_altura">Oficinas en altura</option>
            <option value="industrial">Industrial / fábrica</option><option value="otro">Otro / centro comercial</option>
          </select>
        </label>
        {lugar.map(([key, label, max]) => <label key={key} htmlFor={`alta-${key}`}>
          <span className={styles.labelRow}>{label}{key === 'direccion_obra' ? ' *' : ''}<VoiceInputButton compact value={datos[key]} maxLength={max} onChange={v => setDatos(d => ({ ...d, [key]: v }))} /></span>
          <input id={`alta-${key}`} value={datos[key]} maxLength={max} onChange={e => setDatos(d => ({ ...d, [key]: e.target.value }))} />
        </label>)}
      </div>
      <p>* Obligatorio. Piso y unidad se dejan vacíos cuando no aplican.</p>
    </fieldset>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {cargando && !error && <p role="status">Cargando clientes disponibles…</p>}
    <div className={styles.actions}>
      <button type="button" disabled={busy || cargando} onClick={() => void guardar()}>{busy ? 'Guardando…' : 'Guardar y usar en esta OT'}</button>
      <button type="button" disabled={busy} onClick={onCancelar}>Cancelar</button>
    </div>
    <p>Al terminar, pulsá «Guardar cambios» en la OT para conservar la vinculación.</p>
  </section>;
}
