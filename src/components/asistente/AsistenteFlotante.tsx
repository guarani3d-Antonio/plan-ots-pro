import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { useAuthStore } from '../../stores/authStore';
import { useAccessStore } from '../../stores/accessStore';
import { useAssistantStore } from '../../stores/assistantStore';
import { askPersonalAssistant, getAssistantStatus, previewPersonalAssistant, type AssistantMessage, type AssistantQuote } from '../../services/assistantService';
import { parseAssistantCommand, type AssistantCommand } from '../../services/assistantCommands';
import { RobotAsistente } from './RobotAsistente';
import styles from './AsistenteFlotante.module.css';

function viewport() {
  const v = window.visualViewport;
  return { width: v?.width ?? innerWidth, height: v?.height ?? innerHeight, left: v?.offsetLeft ?? 0, top: v?.offsetTop ?? 0 };
}
export function AsistenteFlotante({ onCommand }: { onCommand: (command: AssistantCommand) => string }) {
  const userId = useAuthStore(s => s.user?.id);
  const company = useAccessStore(s => s.empresaId);
  const available = useAccessStore(s => s.disponible);
  const assistant = useAssistantStore();
  const expectedScope = `${userId ?? ''}:${company}`;
  const [bounds, setBounds] = useState(viewport);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [dialogPosition, setDialogPosition] = useState({ left: 16, top: 16 });
  const request = useRef<AbortController | null>(null);
  const dialog = useRef<HTMLElement>(null);
  const messages = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const avatar = useRef<HTMLButtonElement>(null);
  const drag = useRef<{ x: number; y: number; left: number; top: number; moved: boolean } | null>(null);
  const moved = useRef(false);
  const pending = useRef<{ quote: AssistantQuote; messages: AssistantMessage[]; scope: string } | null>(null);
  const left = bounds.left + 12 + assistant.position.x * Math.max(0, bounds.width - 72);
  const top = bounds.top + 12 + assistant.position.y * Math.max(0, bounds.height - 72);

  useEffect(() => {
    request.current?.abort(); request.current = null;
    pending.current = null; setBusy(false); setText('');
    if (userId) useAssistantStore.getState().resetScope(expectedScope, userId);
    return () => { request.current?.abort(); };
  }, [expectedScope, userId]);
  useEffect(() => {
    if (!available) { pending.current = null; request.current?.abort(); request.current = null; setBusy(false); }
  }, [available]);
  useEffect(() => {
    const resize = () => setBounds(viewport());
    window.addEventListener('resize', resize); window.visualViewport?.addEventListener('resize', resize); window.visualViewport?.addEventListener('scroll', resize);
    return () => { window.removeEventListener('resize', resize); window.visualViewport?.removeEventListener('resize', resize); window.visualViewport?.removeEventListener('scroll', resize); };
  }, []);
  useLayoutEffect(() => {
    if (!assistant.open || !dialog.current) return;
    const box = dialog.current.getBoundingClientRect();
    const next = { left: bounds.left + Math.max(12, Math.min(left - bounds.left + 48 - box.width, bounds.width - box.width - 12)), top: bounds.top + Math.max(12, Math.min(top - bounds.top - box.height - 10, bounds.height - box.height - 12)) };
    setDialogPosition(old => old.left === next.left && old.top === next.top ? old : next);
    messages.current?.scrollTo({ top: messages.current.scrollHeight });
  }, [assistant.open, assistant.messages, busy, bounds, left, top]);
  useEffect(() => { if (assistant.open) input.current?.focus(); }, [assistant.open]);

  async function send() {
    const content = text.trim();
    if (!content || busy || content.length > 4000 || !available) return;
    const history = [...useAssistantStore.getState().messages.filter(m => m.content !== '¿Qué necesitás?'), { role: 'user' as const, content }];
    setText(''); assistant.append({ role: 'user', content });
    const awaiting = pending.current;
    const confirmation = content.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
    const approved = !!awaiting && /^(si|si,? autorizo|autorizo|confirmo)[.!]?$/.test(confirmation);
    if (awaiting && /^(no|cancelar|cancelo)[.!]?$/.test(confirmation)) { pending.current = null; assistant.append({ role: 'assistant', content: 'Consulta cancelada. No se contactó al proveedor.' }); return; }
    if (awaiting && approved && (awaiting.scope !== expectedScope || Date.parse(awaiting.quote.expiresAt) < Date.now())) { pending.current = null; assistant.append({ role: 'assistant', content: 'La confirmación venció. Repetí el pedido para revisar su costo actualizado.' }); return; }
    const command = parseAssistantCommand(content);
    if (command) { pending.current = null; assistant.append({ role: 'assistant', content: onCommand(command) }); return; }
    if (!approved) pending.current = null;
    const controller = new AbortController(); request.current = controller; setBusy(true);
    const scope = expectedScope;
    try {
      const status = await getAssistantStatus(controller.signal);
      if (!status.ready || !status.connected) throw new Error('Para esta consulta necesitás configurar tu API personal en Mi asistente. La navegación funciona sin consumir tokens.');
      if (approved && awaiting) {
        pending.current = null;
        const result = await askPersonalAssistant(awaiting.messages, awaiting.quote.token, controller.signal);
        if (!controller.signal.aborted && useAssistantStore.getState().scope === scope) assistant.append({ role: 'assistant', content: result.text });
      } else {
        const quote = await previewPersonalAssistant(history, controller.signal);
        if (!controller.signal.aborted && useAssistantStore.getState().scope === scope) {
          pending.current = { quote, messages: history, scope };
          assistant.append({ role: 'assistant', content: `Esta consulta usará ${quote.model}. Reserva máxima estimada: USD ${quote.maximumUsd.toFixed(6)}, sin impuestos. No envié la consulta al proveedor. Respondé «Sí, autorizo» para enviarla o «No» para cancelarla. La confirmación vence en 5 minutos.` });
        }
      }
    } catch (error) {
      if (!controller.signal.aborted && useAssistantStore.getState().scope === scope) assistant.append({ role: 'assistant', content: error instanceof Error ? error.message : 'No se pudo completar la consulta.' });
    } finally { if (request.current === controller) { request.current = null; setBusy(false); } }
  }
  function moveTo(x: number, y: number, persist = false) {
    const position = { x: Math.max(0, Math.min(1, (x - bounds.left - 12) / Math.max(1, bounds.width - 72))), y: Math.max(0, Math.min(1, (y - bounds.top - 12) / Math.max(1, bounds.height - 72))) };
    if (persist && userId) assistant.preferences(userId, { position }); else useAssistantStore.setState({ position });
  }
  function pointerDown(e: PointerEvent<HTMLButtonElement>) {
    if (e.button !== 0) return;
    moved.current = false; drag.current = { x: e.clientX, y: e.clientY, left, top, moved: false }; e.currentTarget.setPointerCapture(e.pointerId);
  }
  function pointerMove(e: PointerEvent<HTMLButtonElement>) {
    const d = drag.current; if (!d) return;
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    if (Math.hypot(dx, dy) > 6) d.moved = true;
    if (d.moved) moveTo(d.left + dx, d.top + dy);
  }
  function pointerUp(e: PointerEvent<HTMLButtonElement>) {
    if (!drag.current) return;
    moved.current = drag.current.moved; drag.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    if (moved.current && userId) assistant.preferences(userId, { position: useAssistantStore.getState().position });
  }
  if (!userId || !available || assistant.scope !== expectedScope) return null;
  return createPortal(<div className={styles.root} data-assistant-root>
    {assistant.open && <section ref={dialog} className={styles.dialog} style={{ ...dialogPosition, maxHeight: Math.max(140, bounds.height - 24) }} role="region" aria-label="Conversación con Mi asistente" onKeyDown={e => { if (e.key === 'Escape') { assistant.toggle(); avatar.current?.focus(); } }}>
      <header><span className={styles.face}><RobotAsistente /></span><strong>{assistant.name}</strong><button type="button" className={styles.minimize} aria-label="Minimizar asistente" onClick={() => { assistant.toggle(); avatar.current?.focus(); }}>−</button></header>
      <div ref={messages} className={styles.messages} role="log" aria-live="polite" aria-relevant="additions">{assistant.messages.map((message, index) => <div key={index} className={message.role === 'user' ? styles.userMessage : styles.assistantMessage}>{message.content}</div>)}{busy && <div role="status" className={styles.assistantMessage}>Consultando…</div>}</div>
      <div className={styles.composer}><label className={styles.srOnly} htmlFor="assistant-question">Mensaje para Mi asistente</label><textarea id="assistant-question" ref={input} value={text} maxLength={4000} placeholder="Escribí tu pedido…" rows={2} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(); } }} /><button type="button" onClick={() => void send()} disabled={busy || !text.trim()} aria-label="Enviar mensaje">↑</button></div>
    </section>}
    <button ref={avatar} type="button" className={styles.avatar} style={{ left, top }} aria-label="Mi asistente. Arrastrar para mover o usar las flechas del teclado." aria-expanded={assistant.open} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={() => { drag.current = null; moved.current = false; }} onClick={() => { if (moved.current) { moved.current = false; return; } assistant.toggle(); }} onKeyDown={e => { const delta: Record<string, [number, number]> = { ArrowLeft: [-16, 0], ArrowRight: [16, 0], ArrowUp: [0, -16], ArrowDown: [0, 16] }; const d = delta[e.key]; if (d) { e.preventDefault(); moveTo(left + d[0], top + d[1], true); } }}><RobotAsistente /></button>
  </div>, document.body);
}
