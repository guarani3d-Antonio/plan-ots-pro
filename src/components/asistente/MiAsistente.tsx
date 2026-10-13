import { useEffect, useState } from 'react';
import { useAuthStore } from '../../stores/authStore';
import { useAssistantStore } from '../../stores/assistantStore';
import { disconnectAssistant, getAssistantStatus, saveAssistantConnection, type AssistantProvider, type AssistantStatus } from '../../services/assistantService';
import { normalizeAssistantText } from '../../services/assistantCommands';
import { RobotAsistente } from './RobotAsistente';
import styles from './MiAsistente.module.css';

const providers = [{ id: 'openai' as const, name: 'OpenAI (ChatGPT)' }, { id: 'anthropic' as const, name: 'Anthropic (Claude)' }];
export function MiAsistente() {
  const userId = useAuthStore(s => s.user?.id);
  const assistant = useAssistantStore();
  const [name, setName] = useState(assistant.name);
  const [readAloud, setReadAloud] = useState(assistant.readAloud);
  const [status, setStatus] = useState<AssistantStatus | null>(null);
  const [provider, setProvider] = useState<AssistantProvider>('openai');
  const [providerText, setProviderText] = useState(providers[0].name);
  const [providerQuery, setProviderQuery] = useState('');
  const [providerOpen, setProviderOpen] = useState(false);
  const [model, setModel] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [budget, setBudget] = useState('0.05');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [connectionFeedback, setConnectionFeedback] = useState<{ error: boolean; text: string } | null>(null);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [usageRevision, setUsageRevision] = useState(0);

  useEffect(() => {
    // An unfinished credential belongs only to the session that typed it.
    setApiKey(''); setConsent(false); setStatus(null); setError(''); setNotice('');
    setConnectionFeedback(null); setProviderOpen(false); setProviderQuery('');
    setConfirmDisconnect(false); setBudget('0.05'); setProvider('openai'); setProviderText(providers[0].name); setModel('');
  }, [userId]);

  useEffect(() => {
    const controller = new AbortController();
    getAssistantStatus(controller.signal).then(result => {
      if (controller.signal.aborted) return;
      setStatus(result); setBudget(String(result.budgetUsd ?? 0.05));
      const selected = result.provider ?? 'openai';
      setProvider(selected); setProviderText(providers.find(p => p.id === selected)!.name);
      setModel(result.model ?? result.models.find(m => m.provider === selected)?.id ?? '');
    }).catch(e => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'No se pudo revisar la conexión.'); });
    return () => controller.abort();
  }, [userId, usageRevision]);

  async function connect() {
    if (busy || !status?.ready || !userId) return;
    setBusy(true); setError(''); setConnectionFeedback(null);
    try {
      const result = await saveAssistantConnection({ provider, model, apiKey, budgetUsd: Number(budget), consent });
      if (!result.connected) throw new Error('El servicio no confirmó el guardado. Actualizá el estado antes de intentar de nuevo.');
      setStatus({ ...result, usage: status.usage }); setApiKey(''); setConsent(false);
      setConnectionFeedback({ error: false, text: 'Conexión guardada. Tu API está cifrada. Todavía no se probó con el proveedor ni se hizo una consulta paga.' });
    } catch (e) { setConnectionFeedback({ error: true, text: e instanceof Error ? e.message : 'No se pudo guardar la conexión.' }); }
    finally { setBusy(false); }
  }
  async function disconnect() {
    if (busy) return; setBusy(true); setError(''); setConnectionFeedback(null);
    try { setStatus(await disconnectAssistant()); setApiKey(''); setConsent(false); setConfirmDisconnect(false); setConnectionFeedback({ error: false, text: 'Clave desconectada. Los comandos de navegación siguen disponibles.' }); }
    catch (e) { setConnectionFeedback({ error: true, text: e instanceof Error ? e.message : 'No se pudo desconectar.' }); }
    finally { setBusy(false); }
  }
  const models = status?.models.filter(m => m.provider === provider) ?? [];
  const selectedModel = models.find(m => m.id === model);
  const remaining = status?.budgetUsd === undefined ? null : Math.max(0, status.budgetUsd - (status.usedUsd ?? 0));
  return <section className={styles.settings} aria-label="Mi asistente">
    <header className={styles.heading}><span className={styles.face}><RobotAsistente /></span><div><h1>Mi asistente</h1><p>Tu conexión personal de IA y tus preferencias.</p></div></header>
    <div className={styles.section}>
      <h2>Avatar y conversación</h2>
      <label className={styles.field}>Nombre del asistente<input value={name} maxLength={24} onChange={e => setName(e.target.value)} /></label>
      <label className={styles.check}><input type="checkbox" checked={readAloud} onChange={e => setReadAloud(e.target.checked)} />Ofrecer lectura en voz alta</label>
      {readAloud && <small>La voz del dispositivo se habilitará en la etapa de audio. No se conecta ningún servicio de voz con esta preferencia.</small>}
      <div className={styles.actions}><button type="button" onClick={() => { if (userId) { assistant.preferences(userId, { name, readAloud }); setNotice('Preferencias guardadas.'); } }}>Guardar preferencias</button><button type="button" className={styles.secondary} onClick={() => { if (userId) assistant.preferences(userId, { position: { x: 1, y: 1 } }); }}>Restablecer posición</button></div>
    </div>
    <div className={styles.section}>
      <h2>API personal</h2>
      <p className={styles.hint}>{status === null ? error ? 'No se pudo comprobar el servicio. Los comandos de navegación siguen disponibles.' : 'Revisando el servicio…' : !status.ready ? 'La conexión de IA está pendiente de activar. Podés usar el avatar para navegar sin API.' : status.connected ? `Clave guardada ${status.hint ?? ''} · uso sujeto al saldo y acceso de tu proveedor.` : 'Sin clave conectada.'}</p>
      <div className={styles.fields}>
        <div className={styles.choice} onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget)) { setProviderOpen(false); setProviderQuery(''); setProviderText(providers.find(p => p.id === provider)!.name); } }}>
          <label className={styles.field}>Proveedor<span className={styles.providerControl}><input role="combobox" aria-expanded={providerOpen} aria-controls="assistant-providers" aria-autocomplete="list" value={providerText} autoComplete="off" disabled={busy} onFocus={e => { setProviderQuery(''); setProviderOpen(true); e.target.select(); }} onChange={e => { setProviderText(e.target.value); setProviderQuery(e.target.value); setProviderOpen(true); }} onKeyDown={e => { if (e.key === 'Escape') { setProviderOpen(false); setProviderText(providers.find(p => p.id === provider)!.name); } if (e.key === 'ArrowDown') { e.preventDefault(); setProviderOpen(true); setProviderQuery(''); } }} /><button type="button" aria-label="Mostrar proveedores de IA" aria-expanded={providerOpen} disabled={busy} onClick={() => { setProviderQuery(''); setProviderOpen(open => !open); }}>⌄</button></span></label>
          {providerOpen && <div className={styles.options} id="assistant-providers" role="listbox" aria-label="Proveedores de IA">{providers.filter(p => normalizeAssistantText(p.name).includes(normalizeAssistantText(providerQuery))).map(p => <button type="button" role="option" aria-selected={provider === p.id} key={p.id} onClick={() => { setProvider(p.id); setProviderText(p.name); setProviderQuery(''); setProviderOpen(false); setApiKey(''); setConsent(false); setConnectionFeedback(null); setModel(status?.models.find(m => m.provider === p.id)?.id ?? ''); }}>{p.name}</button>)}{!providers.some(p => normalizeAssistantText(p.name).includes(normalizeAssistantText(providerQuery))) && <p className={styles.hint}>Sin coincidencias. Buscá OpenAI o Anthropic.</p>}</div>}
        </div>
        <label className={styles.field}>Modelo<select value={model} onChange={e => setModel(e.target.value)} disabled={!models.length}>{!models.length && <option value="">Disponible al activar el servicio</option>}{models.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
      </div>
      <label className={styles.field}>Clave de API<input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} autoComplete="off" data-lpignore="true" spellCheck={false} maxLength={512} disabled={!status?.ready || busy} placeholder={status?.connected && status.provider === provider ? 'Dejá vacío para conservar tu clave' : 'Tu clave personal de API'} /></label>
      <label className={styles.field}>Tope mensual de consumo estimado en Plan-OTs (USD)<input type="number" min="0" max="1000" step="0.01" value={budget} onChange={e => setBudget(e.target.value)} disabled={busy} /></label>
      {selectedModel && <small>Tarifa de referencia por millón de tokens: entrada USD {selectedModel.inputUsd}; salida USD {selectedModel.outputUsd}. Sin impuestos ni otros usos de tu cuenta.</small>}
      <label className={styles.check}><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} disabled={!status?.ready || busy} />Autorizo guardar mi API cifrada. Cada consulta pedirá mi confirmación de costo antes de enviar los mensajes al proveedor.</label>
      <div className={styles.actions}><button type="button" onClick={() => void connect()} disabled={busy || !status?.ready || !consent || !model || !Number.isFinite(Number(budget)) || (!apiKey && !(status.connected && status.provider === provider))}>{busy ? 'Guardando…' : 'Guardar conexión'}</button>{status?.connected && <button type="button" className={styles.secondary} onClick={() => setConfirmDisconnect(true)} disabled={busy}>Desconectar</button>}</div>
      {connectionFeedback && <p className={connectionFeedback.error ? styles.error : styles.feedback} role={connectionFeedback.error ? 'alert' : 'status'}>{connectionFeedback.text}</p>}
      {confirmDisconnect && <div className={styles.confirm}><p>¿Desconectar tu clave del asistente? El consumo ya registrado se conserva.</p><div className={styles.actions}><button type="button" onClick={() => void disconnect()} disabled={busy}>Confirmar desconexión</button><button type="button" className={styles.secondary} onClick={() => setConfirmDisconnect(false)} disabled={busy}>Cancelar</button></div></div>}
    </div>
    {remaining !== null && <div className={styles.section}>
      <div className={styles.usageHeader}><h2>Consumo de este mes en Plan-OTs</h2><button type="button" onClick={() => setUsageRevision(value => value + 1)}>Actualizar consumo</button></div>
      <div className={styles.metrics}><div><small>Consumo y reservas estimadas</small><strong>USD {(status?.usedUsd ?? 0).toFixed(4)}</strong></div><div><small>Disponible de tu tope</small><strong>USD {remaining.toFixed(4)}</strong></div><div><small>Tokens registrados</small><strong>{status?.usage ? (status.usage.inputTokens + status.usage.outputTokens).toLocaleString('es-PY') : 'No disponible'}</strong></div></div>
      {status?.usage && <><p className={styles.hint}>Entrada: {status.usage.inputTokens.toLocaleString('es-PY')} · Salida: {status.usage.outputTokens.toLocaleString('es-PY')} · Reservas pendientes: USD {status.usage.reservedUsd.toFixed(4)}</p>{(status.usage.pendingRequests > 0 || status.usage.unknownTokenRequests > 0) && <small>Hay consultas sin consumo de tokens confirmado. Sus reservas se conservan.</small>}<details className={styles.history}><summary>Últimas consultas ({status.usage.recent.length})</summary>{status.usage.recent.length === 0 ? <p className={styles.hint}>Todavía no hiciste consultas pagas desde Plan-OTs.</p> : status.usage.recent.map(row => <div key={row.id} className={styles.historyRow}><span>{new Date(row.created_at).toLocaleString('es-PY', { timeZone: 'America/Asuncion' })}<small>{row.model ?? 'Modelo no registrado'}</small></span><span>{row.state === 'completed' ? 'Registrada' : 'Reserva pendiente'}<small>{row.input_tokens === null || row.output_tokens === null ? 'Tokens no confirmados' : `${row.input_tokens} entrada · ${row.output_tokens} salida`} · USD {((row.charged_micro ?? row.reserved_micro) / 1e6).toFixed(6)}</small></span></div>)}</details></>}
      <small>Saldo total del proveedor: no disponible. Este contador sólo incluye Plan-OTs; los importes son estimados, sin impuestos. No equivale a tokens restantes en tu cuenta.</small>
    </div>}
    {error && <p className={styles.error} role="alert">{error}</p>}{notice && <p className={styles.hint} role="status">{notice}</p>}
  </section>;
}

