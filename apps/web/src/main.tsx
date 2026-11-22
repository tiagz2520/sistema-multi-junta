import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/app';
import './shared/styles/styles.css';

const root = document.getElementById('root');

if (!root) {
  throw new Error('Falta el elemento raíz de la aplicación.');
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
