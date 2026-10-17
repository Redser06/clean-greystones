import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { applyTownBranding } from './config/branding';
import { town } from './config/town';
import './index.css';

applyTownBranding(town);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
