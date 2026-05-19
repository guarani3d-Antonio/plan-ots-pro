import { useState, useEffect } from 'react';
import {
  getCamposDeProyecto,
  crearCampo,
  actualizarCampo,
  eliminarCampo,
  reordenarCampos,
  type CampoDefinicion,
  type TipoCampo,
} from '../../services/camposService';
import styles from './GestorCampos.module.css';

interface Props {
  proyectoId: string;
  onClose: () => void;
}

const TIPOS: { value: TipoCampo; label: string }[] = [
  { value: 'texto',           label: 'Texto' },
  { value: 'numero',          label: 'Número' },
  { value: 'decimal',         label: 'Decimal' },
  { value: 'fecha',           label: 'Fecha' },
  { value: 'seleccion_unica', label: 'Lista de opciones' },
  { value: 'seleccion_multiple', label: 'Selección múltiple' },
{ value: 'fechahora',          label: 'Fecha y hora'       },
{ value: 'hora',               label: 'Hora'               },
{ value: 'firma',              label: 'Firma digital'       },
{ value: 'video',              label: 'Video'               },
  { value: 'booleano',        label: 'Sí / No' },
  { value: 'url',             label: 'URL / Enlace' },
  
];

const TIPO_ICONOS: Record<TipoCampo, string> = {
  texto:              '✏️',
  numero:             '🔢',
  decimal:            '🔣',
  fecha:              '📅',
  seleccion_unica:    '📋',
  booleano:           '☑️',
  url:                '🔗',
  seleccion_multiple: '☑️',
  fechahora:          '🕐',
  hora:               '⏱️',
  firma:              '✍️',
  video:              '🎥',
};

interface FormState {
  nombre: string;
  tipo: TipoCampo;
  obligatorio: boolean;
  opciones: string;
}

const FORM_DEFAULT: FormState = {
  nombre: '',
  tipo: 'texto',
  obligatorio: false,
  opciones: '',
};

export default function GestorCampos({ proyectoId, onClose }: Props) {
  const [campos, setCampos] = useState<CampoDefinicion[]>([]);
  const [loading, setLoading] = useState(true);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [creando, setCreando] = useState(false);
  const [form, setForm] = useState<FormState>(FORM_DEFAULT);
  const [guardando, setGuardando] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  useEffect(() => {
    getCamposDeProyecto(proyectoId).then((data) => {
      setCampos(data);
      setLoading(false);
    });
  }, [proyectoId]);

  function abrirCrear() {
    setEditandoId(null);
    setForm(FORM_DEFAULT);
    setErrorMsg('');
    setCreando(true);
  }

  function abrirEditar(campo: CampoDefinicion) {
    setCreando(false);
    setForm({
      nombre: campo.nombre,
      tipo: campo.tipo,
      obligatorio: campo.obligatorio,
      opciones: campo.opciones ? campo.opciones.join(', ') : '',
    });
    setErrorMsg('');
    setEditandoId(campo.id);
  }

  function cancelarForm() {
    setCreando(false);
    setEditandoId(null);
    setErrorMsg('');
  }

  async function guardarNuevo() {
    const nombre = form.nombre.trim();
    if (!nombre) { setErrorMsg('El nombre es obligatorio.'); return; }

    const opciones = form.tipo === 'seleccion_unica'
      ? form.opciones.split(',').map(o => o.trim()).filter(Boolean)
      : undefined;

    if (form.tipo === 'seleccion_unica' && (!opciones || opciones.length < 2)) {
      setErrorMsg('Define al menos 2 opciones separadas por coma.');
      return;
    }

    setGuardando(true);
    try {
      const nuevo = await crearCampo({
        proyecto_id: proyectoId,
        nombre,
        tipo: form.tipo,
        obligatorio: form.obligatorio,
        opciones,
      });
      setCampos(prev => [...prev, nuevo]);
      cancelarForm();
    } catch {
      setErrorMsg('Error al guardar. Intentá de nuevo.');
    } finally {
      setGuardando(false);
    }
  }

  async function guardarEdicion(id: string) {
    const nombre = form.nombre.trim();
    if (!nombre) { setErrorMsg('El nombre es obligatorio.'); return; }

    const opciones = form.tipo === 'seleccion_unica'
      ? form.opciones.split(',').map(o => o.trim()).filter(Boolean)
      : null;

    setGuardando(true);
    try {
      await actualizarCampo(id, { nombre, obligatorio: form.obligatorio, opciones });
      setCampos(prev => prev.map(c =>
        c.id === id ? { ...c, nombre, obligatorio: form.obligatorio, opciones } : c
      ));
      cancelarForm();
    } catch {
      setErrorMsg('Error al guardar. Intentá de nuevo.');
    } finally {
      setGuardando(false);
    }
  }

  async function confirmarEliminar(id: string) {
    await eliminarCampo(id);
    setCampos(prev => prev.filter(c => c.id !== id));
    setConfirmDeleteId(null);
  }

  function onDragStart(index: number) { setDragIndex(index); }

  function onDragOver(e: React.DragEvent, index: number) {
    e.preventDefault();
    if (dragIndex === null || dragIndex === index) return;
    const reordenado = [...campos];
    const [item] = reordenado.splice(dragIndex, 1);
    reordenado.splice(index, 0, item);
    setCampos(reordenado);
    setDragIndex(index);
  }

  async function onDragEnd() {
    setDragIndex(null);
    await reordenarCampos(campos.map(c => c.id));
  }

  // Placeholder del input "Nombre del campo" — cambia según el tipo elegido
  // para guiar al usuario con un ejemplo del dominio correcto.
  function placeholderPorTipo(tipo: TipoCampo): string {
    switch (tipo) {
      case 'texto':              return 'Ej: Código de referencia';
      case 'numero':             return 'Ej: Metros cuadrados';
      case 'decimal':            return 'Ej: Costo en m²';
      case 'fecha':              return 'Ej: Fecha de inspección';
      case 'fechahora':          return 'Ej: Inicio del trabajo';
      case 'hora':               return 'Ej: Horario de visita';
      case 'seleccion_unica':    return 'Ej: Resultado';
      case 'seleccion_multiple': return 'Ej: Componentes afectados';
      case 'booleano':           return 'Ej: ¿Aprobado?';
      case 'url':                return 'Ej: Enlace al documento';
      case 'video':              return 'Ej: Video del estado';
      case 'firma':              return 'Ej: Firma del técnico';
      default:                   return 'Nombre del campo';
    }
  }

  const formPanel = (onGuardar: () => void) => (
    <div className={styles.formPanel}>
      {/* Tipo primero — guía la decisión del nombre con un placeholder
          contextual en el input de abajo. */}
      <div className={styles.formRow}>
        <label>Tipo</label>
        <select
          value={form.tipo}
          onChange={e => setForm(f => ({ ...f, tipo: e.target.value as TipoCampo }))}
          disabled={editandoId !== null}
        >
          {TIPOS.map(t => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
        {editandoId && <span className={styles.tipoLock}>El tipo no se puede cambiar</span>}
      </div>
      <div className={styles.formRow}>
        <label>Nombre del campo</label>
        <input
          type="text"
          value={form.nombre}
          onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
          placeholder={placeholderPorTipo(form.tipo)}
          maxLength={60}
        />
      </div>
      {form.tipo === 'seleccion_unica' && (
        <div className={styles.formRow}>
          <label>Opciones (separadas por coma)</label>
          <input
            type="text"
            value={form.opciones}
            onChange={e => setForm(f => ({ ...f, opciones: e.target.value }))}
            placeholder="Ej: Aprobado, Rechazado, Pendiente"
          />
        </div>
      )}
      <div className={styles.formRowCheck}>
        <input
          type="checkbox"
          id="obligatorio"
          checked={form.obligatorio}
          onChange={e => setForm(f => ({ ...f, obligatorio: e.target.checked }))}
        />
        <label htmlFor="obligatorio">Campo obligatorio</label>
      </div>
      {errorMsg && <p className={styles.errorMsg}>{errorMsg}</p>}
      <div className={styles.formActions}>
        <button className={styles.btnSecundario} onClick={cancelarForm}>Cancelar</button>
        <button className={styles.btnPrimario} onClick={onGuardar} disabled={guardando}>
          {guardando ? 'Guardando…' : 'Guardar campo'}
        </button>
      </div>
    </div>
  );

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          <h2>Campos personalizados</h2>
          <button className={styles.btnCerrar} onClick={onClose}>✕</button>
        </div>
        <div className={styles.body}>
          {loading ? (
            <p className={styles.placeholder}>Cargando campos…</p>
          ) : (
            <>
              {campos.length === 0 && !creando && (
                <p className={styles.placeholder}>No hay campos personalizados. Creá el primero.</p>
              )}
              <ul className={styles.lista}>
                {campos.map((campo, index) => (
                  <li
                    key={campo.id}
                    className={`${styles.item} ${dragIndex === index ? styles.dragging : ''}`}
                    draggable
                    onDragStart={() => onDragStart(index)}
                    onDragOver={e => onDragOver(e, index)}
                    onDragEnd={onDragEnd}
                  >
                    {editandoId === campo.id ? (
                      formPanel(() => guardarEdicion(campo.id))
                    ) : confirmDeleteId === campo.id ? (
                      <div className={styles.confirmDelete}>
                        <span>¿Eliminar <strong>{campo.nombre}</strong>?</span>
                        <div>
                          <button className={styles.btnDanger} onClick={() => confirmarEliminar(campo.id)}>Eliminar</button>
                          <button className={styles.btnSecundario} onClick={() => setConfirmDeleteId(null)}>Cancelar</button>
                        </div>
                      </div>
                    ) : (
                      <div className={styles.itemContent}>
                        <span className={styles.dragHandle}>⠿</span>
                        <span className={styles.tipoIcon}>{TIPO_ICONOS[campo.tipo]}</span>
                        <span className={styles.itemNombre}>{campo.nombre}</span>
                        <span className={styles.itemTipo}>
                          {TIPOS.find(t => t.value === campo.tipo)?.label}
                        </span>
                        {campo.obligatorio && <span className={styles.badge}>Obligatorio</span>}
                        <div className={styles.itemAcciones}>
                          <button onClick={() => abrirEditar(campo)} title="Editar">✏️</button>
                          <button onClick={() => setConfirmDeleteId(campo.id)} title="Eliminar">🗑️</button>
                        </div>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
              {creando && formPanel(guardarNuevo)}
              {!creando && !editandoId && (
                <button className={styles.btnAgregar} onClick={abrirCrear}>+ Agregar campo</button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}