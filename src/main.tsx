import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './index.css';

// Pedir almacenamiento persistente: evita que el navegador borre por falta de espacio
// la sesión (localStorage) y los datos de la ruta (IndexedDB) del dispositivo.
if (navigator.storage?.persist) {
  navigator.storage.persist().then(
    (granted) => console.log('[Storage] Almacenamiento persistente:', granted),
    () => { /* no soportado */ }
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
