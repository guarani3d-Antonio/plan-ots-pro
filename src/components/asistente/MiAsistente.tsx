import { useEffect, useState } from 'react';
import { useAuthStore } from '../../stores/authStore';
import { useAssistantStore } from '../../stores/assistantStore';
import { disconnectAssistant, getAssistantStatus, saveAssistantConnection, type AssistantProvider, type AssistantStatus } from '../../services/assistantService';
import { normalizeAssistantText } from '../../services/assistantCommands';
import { RobotAsistente } from './RobotAsistente';
import styles from './MiAsistente.module.css';

const providers = [{ id: 'openai' as const, name: 'OpenAI' }, { id: 'anthropic' as const, name: 'Claude' }];
export function MiAsistente() {
  const userId = useAuthStore(s => s.user?.id);
  const assistant = useAssistantStore();
  const [name, setName] = useState(assistant.name);
  const [readAloud, setReadAloud] = useState(assistant.readAloud);
  const [status, setStatus] = useState<AssistantStatus | null>(null);
  const [provider, setProvider] = useState<AssistantProvider>('openai');
  const [providerText, setProviderText] = useState('OpenAI');
  const [providerOpen, setProviderOpen] = useState(false);
  const [model, setModel] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [budget, setBudget] = useState('5');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    getAssistantStatus(controller.signal).then(result => {
      if (controller.signal.aborted) return;
      setStatus(result); setBudget(String(result.budgetUsd ?? 5));
      const selected = result.provider ?? 'openai';
      setProvider(selected); setProviderText(providers.find(p => p.id === selected)!.name);
      setModel(result.model ?? result.models.find(m => m.provider === selected)?.id ?? '');
    }).catch(e => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'No se pudo revisar la conexión.'); });
    return () => controller.abort();
  }, [userId]);

  async function connect() {
    if (busy || !status?.ready || !userId) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await saveAssistantConnection({ provider, model, apiKey, budgetUsd: Number(budget), consent });
      setStatus(result); setApiKey(''); setNotice('Clave guardada de forma cifrada. No se hizo una consulta de IA para probarla.');
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo guardar la conexión.'); }
    finally { setBusy(false); }
  }
  async function disconnect() {
    if (busy) return; setBusy(true); setError('');
    try { setStatus(await disconnectAssistant()); setApiKey(''); setConfirmDisconnect(false); setNotice('Clave desconectada. Los comandos de navegación siguen disponibles.'); }
    catch (e) { setError(e instanceof Error ? e.message : 'No se pudo desconectar.'); }
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
        <div className={styles.choice}>
          <label className={styles.field}>Proveedor<input role="combobox" aria-expanded={providerOpen} aria-controls="assistant-providers" aria-autocomplete="list" value={providerText} autoComplete="off" onFocus={() => setProviderOpen(true)} onChange={e => { setProviderText(e.target.value); setProviderOpen(true); }} onKeyDown={e => { if (e.key === 'Escape') setProviderOpen(false); }} /></label>
          {providerOpen && <div className={styles.options} id="assistant-providers" role="listbox" aria-label="Proveedores de IA">{providers.filter(p => normalizeAssistantText(p.name).includes(normalizeAssistantText(providerText))).map(p => <button type="button" role="option" aria-selected={provider === p.id} key={p.id} onClick={() => { setProvider(p.id); setProviderText(p.name); setProviderOpen(false); setApiKey(''); setConsent(false); setModel(status?.models.find(m => m.provider === p.id)?.id ?? ''); }}>{p.name}</button>)}</div>}
        </div>
        <label className={styles.field}>Modelo<select value={model} onChange={e => setModel(e.target.value)} disabled={!models.length}>{!models.length && <option value="">Disponible al activar el servicio</option>}{models.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
      </div>
      <label className={styles.field}>Clave de API<input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} autoComplete="off" data-lpignore="true" spellCheck={false} maxLength={512} disabled={!status?.ready || busy} placeholder={status?.connected && status.provider === provider ? 'Dejá vacío para conservar tu clave' : 'Tu clave personal de API'} /></label>
      <label className={styles.field}>Tope mensual de consumo estimado en Plan-OTs (USD)<input type="number" min="0" max="1000" step="0.5" value={budget} onChange={e => setBudget(e.target.value)} disabled={busy} /></label>
      {selectedModel && <small>Tarifa de referencia por millón de tokens: entrada USD {selectedModel.inputUsd}; salida USD {selectedModel.outputUsd}. Sin impuestos ni otros usos de tu cuenta.</small>}
      <label className={styles.check}><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} disabled={!status?.ready || busy} />Autorizo usar mi API y enviar mis mensajes al proveedor elegido. Entiendo que sus consultas consumen mi saldo.</label>
      <div className={styles.actions}><button type="button" onClick={() => void connect()} disabled={busy || !status?.ready || !consent || !model || !Number.isFinite(Number(budget)) || (!apiKey && !(status.connected && status.provider === provider))}>{busy ? 'Guardando…' : 'Guardar conexión'}</button>{status?.connected && <button type="button" className={styles.secondary} onClick={() => setConfirmDisconnect(true)} disabled={busy}>Desconectar</button>}</div>
      {confirmDisconnect && <div className={styles.confirm}><p>¿Desconectar tu clave del asistente? El consumo ya registrado se conserva.</p><div className={styles.actions}><button type="button" onClick={() => void disconnect()} disabled={busy}>Confirmar desconexión</button><button type="button" className={styles.secondary} onClick={() => setConfirmDisconnect(false)} disabled={busy}>Cancelar</button></div></div>}
    </div>
    {remaining !== null && <div className={styles.section}><h2>Consumo desde Plan-OTs</h2><p>Consumo y reservas estimadas: USD {(status?.usedUsd ?? 0).toFixed(4)} · Disponible del tope: USD {remaining.toFixed(4)}</p><small>Esto no representa el saldo total de tu proveedor. Las consultas cuyo resultado no se pudo confirmar conservan una reserva para evitar superar el tope.</small></div>}
    {error && <p className={styles.error} role="alert">{error}</p>}{notice && <p className={styles.hint} role="status">{notice}</p>}
  </section>;
}
