import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

if (typeof window !== 'undefined' && import.meta.env.PROD && 'serviceWorker' in navigator) {
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return;
    reloading = true;
    window.location.reload();
  });
  const checkForSwUpdate = () => {
    navigator.serviceWorker.getRegistrations().then((regs) => {
      regs.forEach((reg) => {
        reg.update().catch(() => null);
      });
    }).catch(() => null);
  };
  window.addEventListener('load', checkForSwUpdate, { once: true });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkForSwUpdate();
  });
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
