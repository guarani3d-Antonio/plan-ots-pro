import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
// S37-T · Modo tablet. Todas sus reglas están prefijadas con `body.modo-tablet`,
// así que sin esa clase este import no altera nada de la versión notebook.
import './styles/tablet.css';

createRoot(document.getElementById('root')!).render(
  <App />
);