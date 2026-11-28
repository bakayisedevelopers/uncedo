import { useState } from 'react';
import { X } from 'lucide-react';
import { BottomNav } from './BottomNav';
import { useHelperSession } from '../context/HelperSessionContext';
import { reactivateHelperAccount } from '../services/helperDataService';

export function AppShell({ pathname, onNavigate, children }) {
  const session = useHelperSession();
  const isOnline = Boolean(session?.isOnline);
  const shiftBusy = Boolean(session?.shiftBusy);
  const gpsError = String(session?.gpsError || '');
  const pendingOffersCount = session?.offers?.length || 0;
  const fullyVerified = Boolean(session?.evaluation?.fullyVerified);
  const profile = session?.profile || {};
  const isPendingDeletion = String(profile.accountStatus || '').trim().toLowerCase() === 'pending_deletion';
  const [reactivating, setReactivating] = useState(false);
  const [reactivateError, setReactivateError] = useState('');
  const deletionDateLabel = profile.deletionScheduledAtMs
    ? new Intl.DateTimeFormat('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(profile.deletionScheduledAtMs))
    : 'in 30 days';

  const handleReactivate = async () => {
    setReactivating(true);
    setReactivateError('');
    try {
      await reactivateHelperAccount();
    } catch (err) {
      setReactivateError(err?.message || 'Unable to reactivate your account right now.');
    } finally {
      setReactivating(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-canvas text-ink-900 overflow-x-clip">
      {isPendingDeletion && (
        <div className="bg-red-50 border-b border-red-200 px-4 py-3">
          <div className="max-w-3xl mx-auto flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs sm:text-sm text-red-900">
              <span className="font-bold">Account scheduled for deletion on {deletionDateLabel}.</span>{' '}
              <span>You are offline and removed from dispatch. Cancel deletion within the 30-day window to reactivate.</span>
              {reactivateError && <div className="mt-1 font-semibold text-red-800">{reactivateError}</div>}
            </div>
            <button
              type="button"
              disabled={reactivating}
              onClick={handleReactivate}
              className="px-4 py-2 rounded-xl bg-tealbrand-700 hover:bg-tealbrand-800 text-xs font-bold text-white disabled:opacity-50 shrink-0"
            >
              {reactivating ? 'Reactivating…' : 'Cancel deletion & reactivate'}
            </button>
          </div>
        </div>
      )}
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
