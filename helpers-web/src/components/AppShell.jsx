import { X } from 'lucide-react';
import { BottomNav } from './BottomNav';
import { useHelperSession } from '../context/HelperSessionContext';

export function AppShell({ pathname, onNavigate, children }) {
  const session = useHelperSession();
  const isOnline = Boolean(session?.isOnline);
  const shiftBusy = Boolean(session?.shiftBusy);
  const gpsError = String(session?.gpsError || '');
  const pendingOffersCount = session?.offers?.length || 0;
  const fullyVerified = Boolean(session?.evaluation?.fullyVerified);

  return (
    <div className="min-h-screen flex flex-col bg-canvas text-ink-900 overflow-x-clip">
      <main className="flex-1 w-full min-w-0 pb-28">
        {children}
      </main>

      {/* Global GPS / Shift Error Toast visible on any page */}
      {gpsError && (
        <div
          role="alert"
          className="fixed bottom-24 inset-x-4 sm:left-1/2 sm:-translate-x-1/2 sm:max-w-md z-40 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 shadow-lg flex items-start justify-between gap-2 text-xs font-semibold text-red-800"
        >
          <span className="leading-relaxed">{gpsError}</span>
          <button
            type="button"
            onClick={() => session?.setGpsError?.('')}
            className="text-red-700 hover:text-red-900 p-0.5 shrink-0"
            aria-label="Dismiss location notice"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <BottomNav
        pathname={pathname}
        onNavigate={onNavigate}
        pendingOffersCount={pendingOffersCount}
        showOnboardingBadge={!fullyVerified}
        isOnline={isOnline}
        shiftBusy={shiftBusy}
        onToggleOnline={session?.toggleOnline}
      />
    </div>
  );
}
