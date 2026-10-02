import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import styles from './DialogDirectorioOT.module.css';

export function DialogDirectorioOT({ titulo, onCerrar, busy = false, children }: {
  titulo: string; onCerrar: () => void; busy?: boolean; children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const tituloId = useId();
  useEffect(() => {
    const anterior = document.activeElement as HTMLElement | null;
    (ref.current?.querySelector<HTMLElement>('input:not(:disabled)')
      ?? ref.current?.querySelector<HTMLElement>('button:not(:disabled)'))?.focus();
    return () => { if (anterior?.isConnected) anterior.focus(); };
  }, []);
  return createPortal(<div className={styles.backdrop} onClick={e => {
    e.stopPropagation();
    if (e.target === e.currentTarget && !busy) onCerrar();
  }}>
    <div ref={ref} className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby={tituloId}
      onKeyDown={e => {
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (!busy) onCerrar(); }
        if (e.key !== 'Tab') return;
        const controles = [...(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]') ?? [])];
        const primero = controles[0], ultimo = controles.at(-1);
        if (e.shiftKey && document.activeElement === primero) { e.preventDefault(); ultimo?.focus(); }
        else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primero?.focus(); }
      }}>
      <header className={styles.header}><h3 id={tituloId}>{titulo}</h3>
        <button type="button" disabled={busy} aria-label={`Cerrar ${titulo}`} onClick={onCerrar}>✕</button>
      </header>
      <div className={styles.body}>{children}</div>
    </div>
  </div>, document.body);
}

export type OpcionDirectorio = { id: string; nombre: string; detalle?: string };
const normalizar = (texto: string) => texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es');
export function BuscarDirectorioOT({ titulo, opciones, onSeleccionar, onCerrar, seleccionados = [], multiple = false, error, etiquetaBusqueda = 'Buscar por nombre o identificación' }: {
  titulo: string; opciones: OpcionDirectorio[]; onSeleccionar: (id: string) => void;
  onCerrar: () => void; seleccionados?: string[]; multiple?: boolean; error?: string | null; etiquetaBusqueda?: string;
}) {
  const [texto, setTexto] = useState('');
  const palabras = normalizar(texto).split(/\s+/).filter(Boolean);
  const resultados = opciones.filter(o => palabras.every(p => normalizar(`${o.nombre} ${o.detalle ?? ''}`).includes(p)));
  return <DialogDirectorioOT titulo={titulo} onCerrar={onCerrar}>
    <label className={styles.search}>{etiquetaBusqueda}
      <input autoFocus type="search" value={texto} onChange={e => setTexto(e.target.value)} placeholder="Empezá a escribir…" />
    </label>
    {error ? <p role="alert">{error}</p> : <>
      <p className={styles.hint} aria-live="polite">{resultados.length} resultado{resultados.length === 1 ? '' : 's'}{multiple ? ' · Podés seleccionar varios.' : ''}</p>
      <ul className={styles.results}>{resultados.map(o => <li key={o.id}>
        <button type="button" aria-pressed={multiple ? seleccionados.includes(o.id) : undefined}
          onClick={() => { onSeleccionar(o.id); if (!multiple) onCerrar(); }}>
          <span><strong>{o.nombre}</strong>{o.detalle && <small>{o.detalle}</small>}</span>
          {multiple && <span aria-hidden="true">{seleccionados.includes(o.id) ? '✓' : '+'}</span>}
        </button>
      </li>)}</ul>
      {!resultados.length && <p>No hay coincidencias. Probá con otro nombre o identificación.</p>}
    </>}
    <div className={styles.actions}><button type="button" onClick={onCerrar}>{multiple ? 'Listo' : 'Cancelar'}</button></div>
  </DialogDirectorioOT>;
}
