import { useEffect, useRef, useState } from 'react';
import styles from './VoiceInputButton.module.css';

interface SpeechRecognitionResultLike {
  isFinal: boolean;
  [index: number]: { transcript: string };
}

interface SpeechRecognitionEventLike extends Event {
  results: ArrayLike<SpeechRecognitionResultLike>;
}

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

interface VoiceWindow extends Window {
  SpeechRecognition?: SpeechRecognitionCtor;
  webkitSpeechRecognition?: SpeechRecognitionCtor;
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  maxLength?: number;
  compact?: boolean;
}

export function VoiceInputButton({ value, onChange, disabled = false, maxLength, compact = false }: Props) {
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const baseValueRef = useRef('');
  const [escuchando, setEscuchando] = useState(false);
  const [errorDictado, setErrorDictado] = useState('');
  const SpeechRecognition = typeof window === 'undefined'
    ? undefined
    : ((window as VoiceWindow).SpeechRecognition ?? (window as VoiceWindow).webkitSpeechRecognition);
  const disponible = !!SpeechRecognition;

  useEffect(() => () => recognitionRef.current?.abort(), []);

  const detener = () => recognitionRef.current?.stop();

  const comenzar = () => {
    if (!SpeechRecognition || disabled) return;
    setErrorDictado('');
    const recognition = new SpeechRecognition();
    recognitionRef.current = recognition;
    baseValueRef.current = value.trimEnd();
    recognition.lang = navigator.language?.toLowerCase().startsWith('es') ? navigator.language : 'es-PY';
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.onresult = event => {
      let dictado = '';
      for (let i = 0; i < event.results.length; i += 1) dictado += event.results[i][0]?.transcript ?? '';
      const separador = baseValueRef.current ? ' ' : '';
      const textoCompleto = `${baseValueRef.current}${separador}${dictado}`;
      const nuevoValor = typeof maxLength === 'number' ? textoCompleto.slice(0, maxLength) : textoCompleto;
      onChange(nuevoValor);
    };
    recognition.onerror = event => {
      const motivo = event.error;
      setErrorDictado(motivo === 'not-allowed' || motivo === 'service-not-allowed'
        ? 'Permiso de micrófono denegado. Revisá los permisos del navegador.'
        : motivo === 'no-speech' ? 'No se detectó voz. Volvé a intentarlo.'
        : motivo === 'network' ? 'El dictado necesita conexión en este navegador.'
        : motivo === 'audio-capture' ? 'No se encontró un micrófono disponible.'
        : 'No se pudo iniciar el dictado. Podés escribir el texto.');
      setEscuchando(false);
    };
    recognition.onend = () => {
      recognitionRef.current = null;
      setEscuchando(false);
    };
    try {
      recognition.start();
      setEscuchando(true);
    } catch {
      setErrorDictado('No se pudo iniciar el dictado. Revisá el permiso del micrófono.');
      setEscuchando(false);
    }
  };

  return (<span className={styles.wrap}>
    <button
      type="button"
      className={`${styles.button} ${compact ? styles.compact : ''} ${escuchando ? styles.active : ''}`}
      onClick={escuchando ? detener : comenzar}
      disabled={disabled || !disponible}
      aria-pressed={escuchando}
      title={errorDictado || (disponible ? (escuchando ? 'Detener dictado' : 'Escribir mediante voz') : 'El dictado no está disponible en este navegador')}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 15a3.5 3.5 0 0 0 3.5-3.5v-5a3.5 3.5 0 1 0-7 0v5A3.5 3.5 0 0 0 12 15Z" />
        <path d="M5.8 10.8v.7a6.2 6.2 0 0 0 12.4 0v-.7M12 17.7V21M9.2 21h5.6" />
      </svg>
      {!compact && <span>{escuchando ? 'Escuchando…' : 'Dictar'}</span>}
    </button>
    {errorDictado && <span role="alert" className={styles.error}>{errorDictado}</span>}
  </span>);
}
