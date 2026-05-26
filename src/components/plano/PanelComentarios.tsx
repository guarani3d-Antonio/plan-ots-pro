import { useEffect, useRef, useState, useCallback } from 'react';
import { supabase } from '../../db/supabase';
import { useAuthStore } from '../../stores/authStore';
import { obtenerComentarios, crearComentario, eliminarComentario, type Comentario } from '../../services/comentariosOtService';
import styles from './PanelComentarios.module.css';

interface Props { ordenId: string; proyectoId: string; }

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'ahora';
  if (mins < 60) return `hace ${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `hace ${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `hace ${days}d`;
  return new Date(dateStr).toLocaleDateString('es-PY', { day: '2-digit', month: 'short' });
}

function iniciales(nombre: string): string {
  return nombre.trim().split(' ').slice(0, 2).map(p => p[0]).join('').toUpperCase();
}

function stringToColor(str: string): string {
  const colors = ['#2563EB','#7C3AED','#DB2777','#DC2626','#D97706','#059669','#0891B2','#4F46E5'];
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

function renderTexto(texto: string) {
  const parts = texto.split(/(@\w+)/g);
  return parts.map((part, i) =>
    part.startsWith('@') ? <span key={i} className={styles.mencion}>{part}</span> : <span key={i}>{part}</span>
  );
}

export default function PanelComentarios({ ordenId, proyectoId }: Props) {
  const { user } = useAuthStore();
  const [comentarios, setComentarios] = useState<Comentario[]>([]);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const userMeta = (user?.user_metadata ?? {}) as { name?: string; full_name?: string };
  const userName = userMeta.name ?? userMeta.full_name ?? user?.email ?? 'Usuario';
  const userId = user?.id ?? '';

  const cargar = useCallback(async () => {
    try { const data = await obtenerComentarios(ordenId); setComentarios(data); } catch { /* silencioso */ }
  }, [ordenId]);

  useEffect(() => { cargar(); }, [cargar]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [comentarios]);

  useEffect(() => {
    const channel = supabase
      .channel(`comentarios-ot-${ordenId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'comentarios_ot', filter: `orden_id=eq.${ordenId}` }, () => { cargar(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [ordenId, cargar]);

  async function handleEnviar() {
    const t = texto.trim();
    if (!t || enviando || !userId) return;
    setEnviando(true); setError(null);
    try {
      await crearComentario({ orden_id: ordenId, proyecto_id: proyectoId, user_id: userId, user_name: userName, texto: t });
      setTexto(''); textareaRef.current?.focus();
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Error al enviar'); }
    finally { setEnviando(false); }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleEnviar(); }
  }

  async function handleEliminar(id: string) {
    try { await eliminarComentario(id); setComentarios(prev => prev.filter(c => c.id !== id)); } catch { /* silencioso */ }
  }

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <span className={styles.headerTitle}>💬 Comentarios</span>
        <span className={styles.headerCount}>{comentarios.length}</span>
      </div>
      <div className={styles.lista}>
        {comentarios.length === 0 ? (
          <div className={styles.vacio}><span>Sin comentarios aún.</span><span>Escribí el primero ↓</span></div>
        ) : comentarios.map(c => (
          <div key={c.id} className={styles.item}>
            <div className={styles.avatar} style={{ background: stringToColor(c.user_name) }}>{iniciales(c.user_name)}</div>
            <div className={styles.body}>
              <div className={styles.meta}>
                <span className={styles.nombre}>{c.user_name}</span>
                <span className={styles.tiempo}>{timeAgo(c.created_at)}</span>
                {c.user_id === userId && <button className={styles.btnEliminar} onClick={() => handleEliminar(c.id)} title="Eliminar">×</button>}
              </div>
              <div className={styles.texto}>{renderTexto(c.texto)}</div>
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      {error && <div className={styles.error}>{error}</div>}
      <div className={styles.inputWrap}>
        <textarea ref={textareaRef} className={styles.input} placeholder="Comentar... (Enter envía, Shift+Enter nueva línea)" value={texto} onChange={e => setTexto(e.target.value)} onKeyDown={handleKeyDown} rows={2} disabled={enviando} />
        <button className={styles.btnEnviar} onClick={handleEnviar} disabled={!texto.trim() || enviando}>{enviando ? '…' : '↑'}</button>
      </div>
    </div>
  );
}
