import { createRoot } from 'react-dom/client';
import {contextoPortal} from './services/portalPilot';
import './index.css';
// S37-T · Modo tablet. Todas sus reglas están prefijadas con `body.modo-tablet`,
// así que sin esa clase este import no altera nada de la versión notebook.
import './styles/tablet.css';

const root = createRoot(document.getElementById('root')!);
// El piloto público no carga SessionGate, sincronización ni directorios privados.
if (new URLSearchParams(window.location.search).get('portal') === 'demo') {
  void import('./components/portal/PortalReclamosPiloto').then(({PortalReclamosPiloto}) => {
    root.render(<PortalReclamosPiloto context={contextoPortal(window.location.search)}/>);
  });
} else {
  void import('./App.tsx').then(({default: App}) => root.render(<App/>));
}
