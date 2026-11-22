import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/app';
import '@fontsource/ibm-plex-sans/latin-400.css';
import '@fontsource/ibm-plex-sans/latin-500.css';
import '@fontsource/ibm-plex-sans/latin-600.css';
import '@fontsource/ibm-plex-sans/latin-700.css';
import './shared/styles/styles.css';
import './shared/styles/editorial.css';

const root = document.getElementById('root');

if (!root) {
  throw new Error('Falta el elemento raíz de la aplicación.');
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
