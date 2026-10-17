import React from 'react';
import ReactDOM from 'react-dom/client';
import { BootError, townLoadErrorText } from './components/BootError';
import './index.css';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root');

void boot(root);

async function boot(element: HTMLElement) {
  try {
    await import('./config/town');
    const { default: App } = await import('./App');
    ReactDOM.createRoot(element).render(
      <React.StrictMode>
        <App />
      </React.StrictMode>,
    );
  } catch (error) {
    ReactDOM.createRoot(element).render(
      <React.StrictMode>
        <BootError message={townLoadErrorText(error)} />
      </React.StrictMode>,
    );
  }
}
