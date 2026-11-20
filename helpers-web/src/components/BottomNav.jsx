import { useCallback, useEffect, useRef, useState } from 'react';
import { Briefcase, CreditCard, Home, Loader2, Power, Radio, User } from 'lucide-react';

const HOLD_DURATION_MS = 2200;
const RING_RADIUS = 28;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

const LEFT_ITEMS = [
  { id: 'home', path: '/home', label: 'Home', Icon: Home },
  { id: 'jobs', path: '/jobs', label: 'Jobs', Icon: Briefcase },
];

const RIGHT_ITEMS = [
  { id: 'payments', path: '/payments', label: 'Payments', Icon: CreditCard },
  { id: 'profile', path: '/profile', label: 'Profile', Icon: User },
];

export function resolveActiveTab(pathname = '') {
  const clean = String(pathname || '/').toLowerCase().replace(/\/+$/, '') || '/';
  if (clean === '/' || clean === '/home' || clean === '/workspace' || clean === '/services' || clean === '/service-photos') {
    return 'home';
  }
  if (clean === '/jobs' || clean.startsWith('/requests/')) return 'jobs';
  if (clean === '/payments' || clean === '/profile/payouts' || clean === '/payout-details') return 'payments';
  if (
    clean === '/profile'
    || clean.startsWith('/profile/')
    || clean === '/onboarding'
    || clean === '/profile-photo'
    || clean === '/sign-agreement'
    || clean === '/police-clearance'
    || clean === '/verification'
  ) {
    return 'profile';
  }
  return 'home';
}

export function BottomNav({
  pathname,
  onNavigate,
  pendingOffersCount = 0,
  showOnboardingBadge = false,
  isOnline = false,
  shiftBusy = false,
  onToggleOnline,
}) {
  const activeTab = resolveActiveTab(pathname);
  const [holdProgress, setHoldProgress] = useState(0);
  const [isHolding, setIsHolding] = useState(false);
  const [tapHint, setTapHint] = useState('');

  const rafRef = useRef(null);
  const holdStartRef = useRef(0);
  const triggeredRef = useRef(false);
  const hintTimerRef = useRef(null);
  const onToggleOnlineRef = useRef(onToggleOnline);
  const isOnlineRef = useRef(isOnline);

  useEffect(() => {
    onToggleOnlineRef.current = onToggleOnline;
  }, [onToggleOnline]);

  useEffect(() => {
    isOnlineRef.current = isOnline;
  }, [isOnline]);

  const stopHoldAnimation = useCallback(() => {
    if (rafRef.current !== null) {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    setIsHolding(false);
    setHoldProgress(0);
  }, []);

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) window.cancelAnimationFrame(rafRef.current);
      if (hintTimerRef.current) window.clearTimeout(hintTimerRef.current);
    };
  }, []);

  const flashTapHint = useCallback(() => {
    if (hintTimerRef.current) window.clearTimeout(hintTimerRef.current);
    setTapHint(isOnlineRef.current ? 'Press & hold 2s to go offline' : 'Press & hold 2s to go online');
    hintTimerRef.current = window.setTimeout(() => setTapHint(''), 1800);
  }, []);

  const beginHold = useCallback(
    (e) => {
      if (e?.button && e.button !== 0) return;
      if (shiftBusy) return;
      if (hintTimerRef.current) {
        window.clearTimeout(hintTimerRef.current);
        setTapHint('');
      }
      if (rafRef.current !== null) window.cancelAnimationFrame(rafRef.current);

      triggeredRef.current = false;
      holdStartRef.current = performance.now();
      setIsHolding(true);
      setHoldProgress(0.02);

      const step = (now) => {
        const elapsed = now - holdStartRef.current;
        const nextProgress = Math.min(1, Math.max(0.02, elapsed / HOLD_DURATION_MS));
        setHoldProgress(nextProgress);

        if (elapsed >= HOLD_DURATION_MS && !triggeredRef.current) {
          triggeredRef.current = true;
          rafRef.current = null;
          setIsHolding(false);
          setHoldProgress(0);
          if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
            try {
              navigator.vibrate(45);
            } catch {
              // Ignore unsupported vibration errors
            }
          }
          onToggleOnlineRef.current?.();
          return;
        }

        rafRef.current = window.requestAnimationFrame(step);
      };

      rafRef.current = window.requestAnimationFrame(step);
    },
    [shiftBusy],
  );

  const cancelHold = useCallback(() => {
    if (!isHolding) return;
    const elapsed = performance.now() - holdStartRef.current;
    const fired = triggeredRef.current;
    stopHoldAnimation();
    if (!fired && elapsed > 20 && elapsed < HOLD_DURATION_MS) {
      flashTapHint();
    }
  }, [flashTapHint, isHolding, stopHoldAnimation]);

  const handleKeyDown = (e) => {
    if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) {
      e.preventDefault();
      beginHold();
    }
  };

  const handleKeyUp = (e) => {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      cancelHold();
    }
  };

  const strokeDashoffset = RING_CIRCUMFERENCE * (1 - holdProgress);
  const progressPercent = Math.round(holdProgress * 100);
  const targetGoingOffline = isOnline;
  const ringColor = targetGoingOffline ? '#ef4444' : '#14B8A6';

  const renderNavButton = ({ id, path, label, Icon }) => {
    const isActive = activeTab === id;
    const badgeCount = id === 'jobs' ? pendingOffersCount : 0;
    const dotIndicator = id === 'profile' && showOnboardingBadge;

    return (
      <button
        key={id}
        type="button"
        onClick={() => onNavigate(path)}
        aria-current={isActive ? 'page' : undefined}
        className="flex items-center justify-center px-0.5"
      >
        <span
          className={`relative flex flex-col items-center justify-center gap-0.5 w-full max-w-[74px] h-14 rounded-2xl transition-colors ${
            isActive
              ? 'bg-tealbrand-50 text-tealbrand-700'
              : 'text-ink-700 hover:bg-well/60'
          }`}
        >
          <span className="relative inline-flex items-center justify-center">
            <Icon className="h-[20px] w-[20px]" strokeWidth={isActive ? 2.25 : 1.8} />
            {badgeCount > 0 && (
              <span className="absolute -top-1.5 -right-2.5 min-w-[16px] h-4 px-1 rounded-full bg-tealbrand-600 text-white text-[10px] font-bold flex items-center justify-center tabular-nums-mono">
                {badgeCount > 9 ? '9+' : badgeCount}
              </span>
            )}
            {badgeCount === 0 && dotIndicator && (
              <span className="absolute -top-0.5 -right-1 h-2 w-2 rounded-full bg-amber-500 ring-2 ring-surface" />
            )}
          </span>
          <span
            className={`text-[10.5px] leading-none whitespace-nowrap ${
              isActive ? 'font-bold text-tealbrand-700' : 'font-semibold text-ink-700'
            }`}
          >
            {label}
          </span>
        </span>
      </button>
    );
  };

  return (
    <nav
      aria-label="Primary Navigation"
      className="fixed bottom-0 inset-x-0 md:left-1/2 md:-translate-x-1/2 md:bottom-3 md:max-w-xl md:rounded-[28px] md:border z-40 rounded-t-[28px] border-t border-border bg-surface/95 backdrop-blur-md shadow-[0_-4px_16px_rgba(15,23,42,0.08)] pb-[env(safe-area-inset-bottom)]"
    >
      {/* Floating HUD Tooltip above Center Hold Button */}
      {(isHolding || tapHint) && (
        <div
          aria-live="polite"
          className="pointer-events-none absolute -top-11 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-forest-900 text-white px-3.5 py-1.5 text-[11px] font-extrabold shadow-lg border border-white/10 flex items-center gap-2"
        >
          <span
            className={`h-2 w-2 rounded-full ${
              isHolding
                ? targetGoingOffline
                  ? 'bg-red-400 animate-pulse'
                  : 'bg-tealbrand-500 animate-pulse'
                : 'bg-amber-400'
            }`}
          />
          <span>
            {isHolding
              ? targetGoingOffline
                ? `Hold to go offline · ${progressPercent}%`
                : `Hold to go online · ${progressPercent}%`
              : tapHint}
          </span>
        </div>
      )}

      <div className="grid grid-cols-5 h-[74px] px-2 items-center">
        {LEFT_ITEMS.map(renderNavButton)}

        {/* Center Unique Press-and-Hold Go Online / Go Offline Button */}
        <div className="flex flex-col items-center justify-end h-full pb-1.5 relative">
          <button
            type="button"
            onPointerDown={beginHold}
            onPointerUp={cancelHold}
            onPointerCancel={cancelHold}
            onPointerLeave={cancelHold}
            onKeyDown={handleKeyDown}
            onKeyUp={handleKeyUp}
            onContextMenu={(e) => e.preventDefault()}
            disabled={shiftBusy}
            aria-label={isOnline ? 'Press and hold to go offline' : 'Press and hold to go online'}
            style={{ touchAction: 'none', WebkitUserSelect: 'none', userSelect: 'none' }}
            className={`relative -mt-6 flex items-center justify-center h-[62px] w-[62px] rounded-full transition-transform duration-150 focus:outline-none select-none ${
              isHolding ? 'scale-95' : 'active:scale-95'
            } ${shiftBusy ? 'opacity-80 cursor-wait' : 'cursor-pointer'}`}
          >
            {/* Expanding Ambient Hold Pulse Halo */}
            {isHolding && (
              <span
                aria-hidden="true"
                className={`absolute inset-0 rounded-full animate-helper-hold-pulse ${
                  targetGoingOffline ? 'bg-red-500/40' : 'bg-tealbrand-500/45'
                }`}
              />
            )}

            {/* Outer Radial SVG Progress Ring */}
            <svg
              aria-hidden="true"
              viewBox="0 0 64 64"
              className="absolute inset-0 h-full w-full -rotate-90 pointer-events-none"
            >
              <circle
                cx="32"
                cy="32"
                r={RING_RADIUS}
                fill="none"
                stroke={isOnline ? 'rgba(20, 184, 166, 0.25)' : 'rgba(13, 36, 32, 0.14)'}
                strokeWidth="4"
              />
              {holdProgress > 0 && (
                <circle
                  cx="32"
                  cy="32"
                  r={RING_RADIUS}
                  fill="none"
                  stroke={ringColor}
                  strokeWidth="4.5"
                  strokeLinecap="round"
                  strokeDasharray={RING_CIRCUMFERENCE}
                  strokeDashoffset={strokeDashoffset}
                />
              )}
            </svg>

            {/* Core Button Orb */}
            <span
              className={`relative z-10 h-[50px] w-[50px] rounded-full flex items-center justify-center border-2 border-surface shadow-md transition-colors ${
                isHolding
                  ? targetGoingOffline
                    ? 'bg-red-600 text-white'
                    : 'bg-tealbrand-600 text-white'
                  : isOnline
                    ? 'bg-tealbrand-600 text-white ring-4 ring-tealbrand-500/20'
                    : 'bg-forest-900 text-white'
              }`}
            >
              {shiftBusy ? (
                <Loader2 className="h-[22px] w-[22px] animate-spin" />
              ) : isOnline ? (
                <Radio className="h-[22px] w-[22px]" strokeWidth={2.2} />
              ) : (
                <Power className="h-[22px] w-[22px]" strokeWidth={2.2} />
              )}

              {isOnline && !shiftBusy && !isHolding && (
                <span className="absolute top-1 right-1 h-2.5 w-2.5 rounded-full bg-emerald-300 ring-2 ring-tealbrand-600 animate-pulse" />
              )}
            </span>
          </button>

          <span
            className={`text-[10px] leading-none mt-1 font-extrabold whitespace-nowrap select-none ${
              isHolding
                ? targetGoingOffline
                  ? 'text-red-700'
                  : 'text-tealbrand-700'
                : isOnline
                  ? 'text-tealbrand-700'
                  : 'text-ink-800'
            }`}
          >
            {shiftBusy
              ? 'Updating…'
              : isHolding
                ? targetGoingOffline
                  ? 'Going offline…'
                  : 'Going online…'
                : isOnline
                  ? 'Online'
                  : 'Go Online'}
          </span>
        </div>

        {RIGHT_ITEMS.map(renderNavButton)}
      </div>
    </nav>
  );
}
