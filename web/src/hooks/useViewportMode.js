import { useEffect, useState } from 'react';

function resolveDeviceType() {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return {
      isMobileDevice: false,
      isTabletDevice: false,
    };
  }

  const userAgent = navigator.userAgent.toLowerCase();
  const hasTouchMac = /macintosh/.test(userAgent) && navigator.maxTouchPoints > 1;
  const mobileHint = Boolean(navigator.userAgentData?.mobile);
  const isIpad = /ipad/.test(userAgent) || hasTouchMac;
  const isAndroidTablet = /android/.test(userAgent) && !/mobile/.test(userAgent);
  const isGenericTablet = /tablet|kindle|playbook|silk/.test(userAgent);
  const isTabletDevice = isIpad || isAndroidTablet || isGenericTablet;
  const isMobileDevice = !isTabletDevice && (
    mobileHint
    || /iphone|ipod|android.*mobile|windows phone|mobile/.test(userAgent)
  );

  return {
    isMobileDevice,
    isTabletDevice,
  };
}

function resolveViewportMode() {
  if (typeof window === 'undefined') {
    return {
      isMobileDevice: false,
      isTabletDevice: false,
      isTabletPortrait: false,
      isTabletLandscape: false,
      useBottomNav: false,
    };
  }

  const shouldUseCompactNav = window.matchMedia('(max-width: 1023px)').matches;
  const isPortrait = window.matchMedia('(orientation: portrait)').matches;
  const { isMobileDevice, isTabletDevice } = resolveDeviceType();
  const isTabletPortrait = isTabletDevice && isPortrait;
  const isTabletLandscape = isTabletDevice && !isPortrait;

  return {
    isMobileDevice,
    isTabletDevice,
    isTabletPortrait,
    isTabletLandscape,
    useBottomNav: shouldUseCompactNav,
  };
}

export default function useViewportMode() {
  const [mode, setMode] = useState(resolveViewportMode);

  useEffect(() => {
    const update = () => setMode(resolveViewportMode());
    update();

    window.addEventListener('resize', update);
    const media = window.matchMedia('(orientation: portrait)');
    const mediaListener = () => update();
    media.addEventListener('change', mediaListener);

    return () => {
      window.removeEventListener('resize', update);
      media.removeEventListener('change', mediaListener);
    };
  }, []);

  return mode;
}
