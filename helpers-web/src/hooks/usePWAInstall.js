import { useCallback, useEffect, useState } from 'react';

const DISMISS_STORAGE_KEY = 'uncedo_helpers_pwa_install_dismissed_at';
const DISMISS_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

function checkIsStandalone() {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone === true
  );
}

function checkIsIOS() {
  if (typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
}

function wasRecentlyDismissed() {
  if (typeof window === 'undefined') return false;
  try {
    const raw = window.localStorage.getItem(DISMISS_STORAGE_KEY);
    if (!raw) return false;
    const ts = Number(raw);
    return Number.isFinite(ts) && Date.now() - ts < DISMISS_COOLDOWN_MS;
  } catch {
    return false;
  }
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [isInstalled, setIsInstalled] = useState(checkIsStandalone);
  const [isIOS] = useState(checkIsIOS);
  const [popupOpen, setPopupOpen] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);

  useEffect(() => {
    if (checkIsStandalone()) {
      setIsInstalled(true);
      return undefined;
    }

    const mediaQuery = window.matchMedia('(display-mode: standalone)');
    const onDisplayChange = (event) => {
      if (event.matches) {
        setIsInstalled(true);
        setPopupOpen(false);
        setDeferredPrompt(null);
      }
    };
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', onDisplayChange);
    }

    const onBeforeInstallPrompt = (event) => {
      event.preventDefault();
      setDeferredPrompt(event);
      if (!wasRecentlyDismissed()) {
        setPopupOpen(true);
      }
    };

    const onAppInstalled = () => {
      setIsInstalled(true);
      setPopupOpen(false);
      setShowInstructions(false);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onAppInstalled);

    // Show the install prompt popup on mobile/web visits if not standalone and not recently dismissed
    let fallbackTimer = null;
    if (!wasRecentlyDismissed()) {
      fallbackTimer = window.setTimeout(() => {
        if (!checkIsStandalone()) {
          setPopupOpen(true);
        }
      }, 1400);
    }

    return () => {
      if (fallbackTimer) window.clearTimeout(fallbackTimer);
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onAppInstalled);
      if (mediaQuery.removeEventListener) {
        mediaQuery.removeEventListener('change', onDisplayChange);
      }
    };
  }, []);

  const dismissPopup = useCallback(() => {
    setPopupOpen(false);
    setShowInstructions(false);
    try {
      window.localStorage.setItem(DISMISS_STORAGE_KEY, String(Date.now()));
    } catch {
      // ignore storage failure
    }
  }, []);

  const openInstallPopup = useCallback(() => {
    setShowInstructions(!deferredPrompt);
    setPopupOpen(true);
  }, [deferredPrompt]);

  const promptInstall = useCallback(async () => {
    if (deferredPrompt) {
      try {
        await deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') {
          setIsInstalled(true);
          setPopupOpen(false);
        }
        setDeferredPrompt(null);
        return outcome === 'accepted';
      } catch {
        setShowInstructions(true);
        return false;
      }
    }
    setShowInstructions(true);
    return false;
  }, [deferredPrompt]);

  return {
    isInstalled,
    isIOS,
    hasNativePrompt: Boolean(deferredPrompt),
    popupOpen,
    showInstructions,
    openInstallPopup,
    dismissPopup,
    promptInstall,
  };
}
