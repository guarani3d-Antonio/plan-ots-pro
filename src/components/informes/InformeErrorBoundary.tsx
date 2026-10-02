import { Component, type ErrorInfo, type ReactNode } from 'react';
import styles from './InformeErrorBoundary.module.css';

/** Un fallo del editor no debe desmontar la OT ni el resto de la aplicación. */
export class InformeErrorBoundary extends Component<{
  children: ReactNode;
  onClose: () => void;
}, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() { return { failed: true }; }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[Informe] No se pudo mostrar el editor:', error, info.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return <div className={styles.backdrop}>
      <section className={styles.panel} role="alertdialog" aria-modal="true"
        aria-labelledby="informe-error-title" aria-describedby="informe-error-help"
        onKeyDown={event => {
          if (event.key === 'Escape') this.props.onClose();
          if (event.key === 'Tab') event.preventDefault();
        }}>
        <h2 id="informe-error-title">No pudimos abrir el informe</h2>
        <p id="informe-error-help">Volvé a la OT e intentá abrirlo de nuevo. Los datos ya guardados no se borraron.
          Los cambios del informe que no hayas guardado pueden necesitar cargarse otra vez.</p>
        <p>Si continúa, envianos el mensaje de error de la consola. Si el navegador está traduciendo
          la página, seleccioná «Mostrar original»: Plan-OTs ya está en español.</p>
        <button type="button" autoFocus onClick={this.props.onClose}>Volver a la OT</button>
      </section>
    </div>;
  }
}
