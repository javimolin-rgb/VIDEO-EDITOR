import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '@/app/App';
import { flushAutosaveOnUnload } from '@/storage/autosave';
import '@/app/styles.css';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('#root not found');

window.addEventListener('beforeunload', flushAutosaveOnUnload);

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
