// src/components/plano/ModalImportPendiente.tsx
//
// Aparece cuando el usuario importó OTs por CSV pero todavía no las ubicó +
// cargó fotos válidas, y está intentando navegar fuera del plano. Le ofrece
// "Continuar cargando" (quedarse en el plano) o "Cancelar importación"
// (borrar las pendientes y permitir la navegación).

import styles from './ModalImportPendiente.module.css';

export interface OTPendienteResumen {
  id:          string;
  ot:          string;
  descripcion?: string;
}

interface Props {
  pendientes:   OTPendienteResumen[];
  onContinuar:  () => void;
  onCancelar:   () => void;
}

export default function ModalImportPendiente({ pendientes, onContinuar, onCancelar }: Props) {
  return (
    <div className={styles.overlay}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          <h3 className={styles.title}>Importación incompleta</h3>
          <p className={styles.subtitle}>
            Las siguientes OTs aún no fueron ubicadas y cargadas correctamente:
          </p>
        </div>

        <div className={styles.body}>
          <ul className={styles.lista}>
            {pendientes.map(p => (
              <li key={p.id} className={styles.item}>
                <span className={styles.codigo}>{p.ot}</span>
                {p.descripcion && (
                  <span className={styles.desc}>{p.descripcion}</span>
                )}
              </li>
            ))}
          </ul>
        </div>

        <div className={styles.footer}>
          <button
            type="button"
            className={styles.btnCancelar}
            onClick={onCancelar}
          >
            Cancelar importación
          </button>
          <button
            type="button"
            className={styles.btnContinuar}
            onClick={onContinuar}
            autoFocus
          >
            Continuar cargando
          </button>
        </div>
      </div>
    </div>
  );
}
