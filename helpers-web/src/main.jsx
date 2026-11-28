import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

if (typeof window !== 'undefined' && import.meta.env.PROD && 'serviceWorker' in navigator) {
  const isStandaloneDisplay = () =>
    Boolean(
      window.matchMedia?.('(display-mode: standalone)')?.matches
      || window.matchMedia?.('(display-mode: window-controls-overlay)')?.matches
      || window.navigator?.standalone === true,
    );

  const reportClientModeToSw = async (installedHint = false) => {
    try {
      const isStandalone = isStandaloneDisplay();
      let pwaInstalled = Boolean(installedHint || isStandalone);
      if (!pwaInstalled && typeof navigator.getInstalledRelatedApps === 'function') {
        const related = await navigator.getInstalledRelatedApps().catch(() => []);
        if (Array.isArray(related) && related.length > 0) {
          pwaInstalled = true;
        }
      }
      const reg = await navigator.serviceWorker.ready.catch(() => null);
      const target = navigator.serviceWorker.controller || reg?.active;
      if (target) {
        target.postMessage({
          type: 'REGISTER_CLIENT_MODE',
          isStandalone,
          pwaInstalled,
        });
      }
    } catch {
      // Ignore client mode reporting failures
    }
  };

  const checkForSwUpdate = () => {
    navigator.serviceWorker.getRegistrations().then((regs) => {
      regs.forEach((reg) => {
        reg.update().catch(() => null);
      });
    }).catch(() => null);
  };

  window.addEventListener('load', () => {
    checkForSwUpdate();
    reportClientModeToSw();
  }, { once: true });

  window.addEventListener('focus', () => reportClientModeToSw());
  window.addEventListener('appinstalled', () => reportClientModeToSw(true));
  navigator.serviceWorker.addEventListener('controllerchange', () => reportClientModeToSw());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      checkForSwUpdate();
      reportClientModeToSw();
    }
  });
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
