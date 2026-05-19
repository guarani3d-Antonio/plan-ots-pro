import { useRef, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import SignaturePad from 'signature_pad';
import CampoVideo from './CampoVideo';
import styles from './CampoRenderer.module.css';
import type { CampoDefinicion } from '../../services/camposService';

interface Props {
  campo:       CampoDefinicion;
  valor:       unknown;
  onChange:    (valor: unknown) => void;
  readonly?:   boolean;
  ordenId?:    string;
  proyectoId?: string;
}

export default function CampoRenderer({
  campo,
  valor,
  onChange,
  readonly    = false,
  ordenId     = '',
  proyectoId  = '',
}: Props) {
  const { tipo, nombre, obligatorio, opciones } = campo;

  const labelEl = (
    <label className={styles.label}>
      {nombre}
      {obligatorio && <span className={styles.requerido}>*</span>}
    </label>
  );

  if (readonly) {
    return (
      <div className={styles.campoWrap}>
        {labelEl}
        <div className={styles.valorReadonly}>
          {renderValorReadonly(tipo, valor, opciones)}
        </div>
      </div>
    );
  }

  return (
    <div className={styles.campoWrap}>
      {labelEl}
      {renderInput(tipo, valor, onChange, opciones, campo.id, ordenId, proyectoId)}
    </div>
  );
}

// ── Readonly display ────────────────────────────────────────────────────────

function renderValorReadonly(
  tipo: string,
  valor: unknown,
  _opciones: string[] | null
): ReactNode {
  if (valor === null || valor === undefined || valor === '') {
    return <span className={styles.vacio}>—</span>;
  }

  switch (tipo) {
    case 'booleano':
      return <span>{valor ? '✅ Sí' : '❌ No'}</span>;

    case 'fecha':
      try {
        return <span>{new Date(valor as string).toLocaleDateString('es-PY')}</span>;
      } catch {
        return <span>{String(valor)}</span>;
      }

    case 'fechahora':
      try {
        return (
          <span>
            {new Date(valor as string).toLocaleString('es-PY', {
              dateStyle: 'short',
              timeStyle: 'short',
            })}
          </span>
        );
      } catch {
        return <span>{String(valor)}</span>;
      }

    case 'hora':
      return <span>{String(valor)}</span>;

    case 'seleccion_multiple': {
      const arr = Array.isArray(valor) ? (valor as string[]) : [];
      if (arr.length === 0) return <span className={styles.vacio}>—</span>;
      return (
        <div className={styles.selMultipleBadges}>
          {arr.map(op => (
            <span key={op} className={styles.badge}>{op}</span>
          ))}
        </div>
      );
    }

    case 'firma':
      return (
        <img
          src={valor as string}
          alt="Firma"
          className={styles.firmaImagenReadonly}
        />
      );

    case 'video':
      return (
        <video
          src={valor as string}
          controls
          style={{ width: '100%', maxHeight: 160, borderRadius: 6 }}
        />
      );

    case 'url':
      return (
        <a href={valor as string} target="_blank" rel="noreferrer" className={styles.urlLink}>
          {String(valor)}
        </a>
      );

    default:
      return <span>{String(valor)}</span>;
  }
}

// ── Editable inputs ─────────────────────────────────────────────────────────

function renderInput(
  tipo:       string,
  valor:      unknown,
  onChange:   (v: unknown) => void,
  opciones:   string[] | null,
  campoId:    string,
  ordenId:    string,
  proyectoId: string,
): ReactNode { 
  switch (tipo) {

    case 'texto':
      return (
        <input
          className={styles.input}
          type="text"
          value={(valor as string) ?? ''}
          onChange={e => onChange(e.target.value)}
          maxLength={500}
        />
      );

    case 'numero':
    case 'decimal':
      return (
        <input
          className={styles.input}
          type="number"
          step={tipo === 'decimal' ? '0.01' : '1'}
          value={(valor as string) ?? ''}
          onChange={e => onChange(e.target.value === '' ? null : Number(e.target.value))}
        />
      );

    case 'fecha':
      return (
        <input
          className={styles.input}
          type="date"
          value={(valor as string) ?? ''}
          onChange={e => onChange(e.target.value)}
        />
      );

    case 'fechahora':
      return (
        <input
          className={styles.input}
          type="datetime-local"
          value={(valor as string) ?? ''}
          onChange={e => onChange(e.target.value)}
        />
      );

    case 'hora':
      return (
        <input
          className={styles.input}
          type="time"
          value={(valor as string) ?? ''}
          onChange={e => onChange(e.target.value)}
        />
      );

    case 'seleccion_unica':
      return (
        <select
          className={styles.select}
          value={(valor as string) ?? ''}
          onChange={e => onChange(e.target.value)}
        >
          <option value="">— Seleccionar —</option>
          {(opciones ?? []).map(op => (
            <option key={op} value={op}>{op}</option>
          ))}
        </select>
      );

    case 'seleccion_multiple':
      return (
        <CampoSeleccionMultiple
          valor={valor}
          onChange={onChange}
          opciones={opciones}
        />
      );

    case 'booleano':
      return (
        <label className={styles.checkboxLabel}>
          <input
            type="checkbox"
            checked={Boolean(valor)}
            onChange={e => onChange(e.target.checked)}
          />
          <span>{Boolean(valor) ? 'Sí' : 'No'}</span>
        </label>
      );

    case 'url':
      return (
        <input
          className={styles.input}
          type="url"
          value={(valor as string) ?? ''}
          onChange={e => onChange(e.target.value)}
          placeholder="https://"
        />
      );

    case 'firma':
      return (
        <CampoFirma valor={valor} onChange={onChange} />
      );

    case 'video':
      return (
        <CampoVideo
          valor={valor}
          onChange={onChange}
          ordenId={ordenId}
          proyectoId={proyectoId}
          campoId={campoId}
        />
      );

    default:
      return <span className={styles.vacio}>Tipo no soportado: {tipo}</span>;
  }
}

// ── Sub-componente: Selección múltiple ──────────────────────────────────────

interface SelMultipleProps {
  valor:    unknown;
  onChange: (v: unknown) => void;
  opciones: string[] | null;
}

function CampoSeleccionMultiple({ valor, onChange, opciones }: SelMultipleProps) {
  const seleccionados: string[] = Array.isArray(valor) ? (valor as string[]) : [];

  const toggle = (op: string) => {
    if (seleccionados.includes(op)) {
      onChange(seleccionados.filter(s => s !== op));
    } else {
      onChange([...seleccionados, op]);
    }
  };

  if (!opciones || opciones.length === 0) {
    return <span className={styles.vacio}>Sin opciones definidas</span>;
  }

  return (
    <div className={styles.selMultipleWrap}>
      {opciones.map(op => (
        <label key={op} className={styles.selMultipleItem}>
          <input
            type="checkbox"
            checked={seleccionados.includes(op)}
            onChange={() => toggle(op)}
          />
          <span>{op}</span>
        </label>
      ))}
    </div>
  );
}

// ── Sub-componente: Firma digital ───────────────────────────────────────────

interface FirmaProps {
  valor:    unknown;
  onChange: (v: unknown) => void;
}

function CampoFirma({ valor, onChange }: FirmaProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const padRef    = useRef<SignaturePad | null>(null);

  const [modo, setModo] = useState<'ver' | 'dibujar'>(
    valor && typeof valor === 'string' ? 'ver' : 'dibujar'
  );

  useEffect(() => {
    if (modo !== 'dibujar' || !canvasRef.current) return;

    const pad = new SignaturePad(canvasRef.current, {
      backgroundColor: 'rgb(255, 255, 255)',
      penColor: 'rgb(0, 0, 0)',
      minWidth: 1,
      maxWidth: 3,
    });
    padRef.current = pad;

    const canvas = canvasRef.current;
    const ratio  = Math.max(window.devicePixelRatio || 1, 1);
    canvas.width  = canvas.offsetWidth  * ratio;
    canvas.height = canvas.offsetHeight * ratio;
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.scale(ratio, ratio);
    pad.clear();

    return () => { pad.off(); };
  }, [modo]);

  const handleGuardar  = () => {
    if (!padRef.current || padRef.current.isEmpty()) return;
    onChange(padRef.current.toDataURL('image/png'));
    setModo('ver');
  };
  const handleLimpiar  = () => { padRef.current?.clear(); };
  const handleEliminar = () => { onChange(null); setModo('dibujar'); };

  if (modo === 'ver' && valor && typeof valor === 'string') {
    return (
      <div className={styles.firmaWrap}>
        <img src={valor} alt="Firma guardada" className={styles.firmaImagen} />
        <div className={styles.firmaBtns}>
          <button type="button" className={styles.firmaBtn} onClick={() => setModo('dibujar')}>
            ✏️ Redibujar
          </button>
          <button
            type="button"
            className={`${styles.firmaBtn} ${styles.firmaBtnEliminar}`}
            onClick={handleEliminar}
          >
            🗑 Eliminar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.firmaWrap}>
      <canvas ref={canvasRef} className={styles.firmaCanvas} />
      <div className={styles.firmaBtns}>
        <button type="button" className={styles.firmaBtn} onClick={handleLimpiar}>
          Limpiar
        </button>
        <button
          type="button"
          className={`${styles.firmaBtn} ${styles.firmaBtnGuardar}`}
          onClick={handleGuardar}
        >
          ✔ Guardar firma
        </button>
        {typeof valor === 'string' && valor !== '' && (
          <button type="button" className={styles.firmaBtn} onClick={() => setModo('ver')}>
            Cancelar
          </button>
        )}
      </div>
      <p className={styles.firmaHint}>Dibuje con dedo, stylus o ratón</p>
    </div>
  );
}
