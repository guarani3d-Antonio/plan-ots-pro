// src/components/plano/ModalDuplicadosOT.tsx
//
// Modal de confirmación que se muestra al importar un CSV cuando algunas OTs
// del archivo colisionan con códigos ya existentes del proyecto. El caller
// (useAccionesProyecto) inyecta la lista de renombres ya resueltos y un callback
// onConfirmar(boolean) que cierra el modal y reanuda el flujo async.

import styles from './ModalDuplicadosOT.module.css';

export interface RenombreOT {
  original: string;
  nuevo:    string;
}

interface Props {
  renombres:   RenombreOT[];
  onConfirmar: (aceptar: boolean) => void;
}

export default function ModalDuplicadosOT({ renombres, onConfirmar }: Props) {
  return (
    <div className={styles.overlay} onClick={() => onConfirmar(false)}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          <h3 className={styles.title}>OTs duplicadas detectadas</h3>
          <p className={styles.subtitle}>
            Las siguientes OTs ya existen. Se importarán con códigos disponibles.
          </p>
        </div>

        <div className={styles.body}>
          <table className={styles.tabla}>
            <thead>
              <tr>
                <th>Código original</th>
                <th>Nuevo código asignado</th>
              </tr>
            </thead>
            <tbody>
              {renombres.map(r => (
                <tr key={r.original}>
                  <td>
                    <span className={styles.codigoOriginal}>{r.original}</span>
                  </td>
                  <td>
                    <span className={styles.flecha}>→</span>
                    <span className={styles.codigoNuevo}>{r.nuevo}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className={styles.footer}>
          <button
            type="button"
            className={styles.btnCancel}
            onClick={() => onConfirmar(false)}
          >
            Cancelar
          </button>
          <button
            type="button"
            className={styles.btnConfirmar}
            onClick={() => onConfirmar(true)}
            autoFocus
          >
            Aceptar y continuar
          </button>
        </div>
      </div>
    </div>
  );
}
