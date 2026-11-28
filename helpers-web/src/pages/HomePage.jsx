import {
  ArrowRight,
  Bell,
  Briefcase,
  CreditCard,
  Layers,
  MapPin,
  Navigation,
  ShieldCheck,
} from 'lucide-react';
import { useHelperSession } from '../context/HelperSessionContext';

export function HomePage({ onNavigate }) {
  const {
    user,
    profile,
    offerings,
    jobHistory,
    activeRequest,
    queuedRequest,
    offerNotice,
    setOfferNotice,
    offerError,
    setOfferError,
    evaluation,
    walletSnapshot,
    cashConfirmations = [],
    isOnline,
    gpsStatus,
    gpsError,
    liveCity,
    liveAddress,
    locationAccuracyMeters,
    notificationPermission,
    requestNotificationPermission,
  } = useHelperSession();

  const rawWalletMinor = walletSnapshot?.wallet?.balanceMinor;
  const profileWalletMinor = profile?.wallet?.balanceMinor;
  const signedWalletMinor = Number.isSafeInteger(Number(rawWalletMinor))
    ? Number(rawWalletMinor)
    : Number.isSafeInteger(Number(profileWalletMinor))
      ? Number(profileWalletMinor)
      : Math.round(Number(profile?.wallet?.balance || 0) * 100);
  const formattedWalletBalance = signedWalletMinor < 0
    ? `-R${(Math.abs(signedWalletMinor) / 100).toFixed(2)}`
    : `R${(signedWalletMinor / 100).toFixed(2)}`;

  const firstName =
    String(profile?.firstName || '').trim()
    || String(profile?.fullName || user?.displayName || '').trim().split(/\s+/)[0]
    || 'Partner';

  const statusLocationLabel = liveCity || (gpsStatus === 'acquiring' ? 'Acquiring location…' : 'Live location ready');

  return (
    <div className="max-w-4xl w-full min-w-0 mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6">
      {/* Verification / Onboarding Reminder Banner when not yet fully verified */}
      {!evaluation.fullyVerified && (
        <section className="rounded-2xl border border-amber-300 bg-amber-50/80 p-5 sm:p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="text-xs font-semibold uppercase tracking-[0.12em] text-amber-900">
              Onboarding Progress · {evaluation.completedTotalSteps} of {evaluation.totalSteps} Stages ({evaluation.progressPercent}%)
            </div>
            <h2 className="font-display text-lg font-bold text-ink-900">
              {evaluation.allHelperStepsSubmitted
                ? 'Your verification items are submitted and under review'
                : 'Finish your helper onboarding to go online and receive jobs'}
            </h2>
            <p className="text-sm text-ink-700 max-w-2xl">
              {evaluation.allHelperStepsSubmitted
                ? 'You can update services, upload additional work photos, or check activation status at any time.'
                : 'Complete your profile basics, selfie, service portfolio, agreement, police clearance, and Paystack bank details directly here on web.'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => onNavigate('/services')}
              className="px-4 py-2.5 rounded-lg border border-border bg-surface hover:bg-well text-xs font-semibold text-ink-900 min-h-[44px]"
            >
              Manage Services
            </button>
            <button
              type="button"
              onClick={() => onNavigate('/onboarding')}
              className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg bg-tealbrand-600 hover:bg-tealbrand-700 text-xs font-semibold text-white min-h-[44px]"
            >
              <ShieldCheck className="h-4 w-4" />
              {evaluation.allHelperStepsSubmitted ? 'Check Status' : 'Continue Onboarding'}
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </section>
      )}

      {/* Focused Shift Hero Card (Availability toggle lives exclusively on the center Hold button) */}
      <section className="rounded-[24px] border border-border bg-surface p-6 sm:p-8 space-y-4 min-w-0 overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 text-xs text-ink-500">
          <span className={`inline-flex items-center gap-1.5 font-semibold ${isOnline ? 'text-tealbrand-700' : 'text-ink-700'}`}>
            <span className={`h-2 w-2 rounded-full ${isOnline ? 'bg-tealbrand-600 animate-pulse' : 'bg-ink-400'}`} />
            {isOnline ? 'Shift Online' : 'Shift Offline'}
          </span>
          {statusLocationLabel && (
            <>
              <span>·</span>
              <span>{statusLocationLabel}</span>
            </>
          )}
          {isOnline && (
            <>
              <span>·</span>
              <span className="tabular-nums-mono">
                {gpsStatus === 'active'
                  ? `GPS Active${locationAccuracyMeters ? ` (±${locationAccuracyMeters}m)` : ''}`
                  : gpsStatus === 'acquiring'
                    ? 'Acquiring GPS…'
                    : gpsStatus === 'error'
                      ? 'GPS Attention Needed'
                      : 'Standby'}
              </span>
            </>
          )}
        </div>

        <div className="space-y-1.5">
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-ink-900">
            {isOnline
              ? `${firstName}, you are visible for nearby requests`
              : `Welcome back, ${firstName}`}
          </h1>
          <p className="text-sm text-ink-500 max-w-2xl leading-relaxed">
            {isOnline
              ? 'Live location tracking is active so nearby customers can be matched with you. Press and hold the center Online button below whenever you want to go offline.'
              : 'Press and hold the center Go Online button in the navigation bar below to share your live GPS location and start receiving nearby requests.'}
          </p>
        </div>

        {liveAddress && (
          <div className="flex sm:inline-flex w-full sm:w-auto max-w-full min-w-0 items-start gap-2 rounded-xl border border-border bg-well/60 px-3.5 py-2 text-xs font-medium text-ink-700 overflow-hidden">
            <MapPin className="h-3.5 w-3.5 text-tealbrand-700 mt-0.5 shrink-0" />
            <span className="min-w-0 flex-1 break-words leading-relaxed">{liveAddress}</span>
          </div>
        )}

        {gpsError && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs sm:text-sm text-red-800">
            {gpsError}
          </div>
        )}
      </section>

      {/* Browser Offer Notification Prompt (hidden once granted or unsupported) */}
      {(notificationPermission === 'default' || notificationPermission === 'denied') && (
        <section className="rounded-2xl border border-border bg-surface p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3.5">
          <div className="flex items-start gap-3 min-w-0">
            <span className="h-9 w-9 rounded-xl bg-tealbrand-50 text-tealbrand-700 flex items-center justify-center shrink-0">
              <Bell className="h-4 w-4" aria-hidden="true" />
            </span>
            <div className="min-w-0 space-y-0.5">
              <h2 className="text-sm font-bold text-ink-900">
                {notificationPermission === 'denied'
                  ? 'Browser job offer alerts are blocked'
                  : 'Turn on browser job offer alerts'}
              </h2>
              <p className="text-xs text-ink-600 leading-relaxed">
                {notificationPermission === 'denied'
                  ? 'Allow notifications for this site in your browser settings so new job offers pop up right away.'
                  : 'Get instant browser notifications with full job details and quick Accept or Decline actions when you are picked for a request.'}
              </p>
            </div>
          </div>
          {notificationPermission === 'default' && (
            <button
              type="button"
              onClick={() => requestNotificationPermission()}
              className="px-4 py-2.5 rounded-xl bg-tealbrand-600 hover:bg-tealbrand-700 text-xs font-bold text-white shrink-0 min-h-[42px]"
            >
              Enable Alerts
            </button>
          )}
        </section>
      )}

      {/* Active Assigned Request */}
      {activeRequest && (
        <section className="rounded-2xl border border-tealbrand-600/40 bg-tealbrand-50 p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 min-w-0 overflow-hidden">
          <div className="space-y-1.5 min-w-0">
            <div className="text-xs font-semibold uppercase tracking-[0.12em] text-tealbrand-800 flex items-center gap-1.5">
              <Navigation className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">
                Active Assigned Job · {String(activeRequest.status || 'in progress').replace(/_/g, ' ')}
              </span>
            </div>
            <h2 className="font-display text-lg font-bold text-ink-900 break-words">
              {activeRequest.serviceSummary || activeRequest.subject || 'Assigned Service Request'}
            </h2>
            <p className="text-sm text-ink-700 flex items-start gap-1.5 min-w-0">
              <MapPin className="h-4 w-4 text-tealbrand-700 mt-0.5 shrink-0" />
              <span className="min-w-0 break-words">
                {activeRequest.requestPayload?.serviceAddress
                  || activeRequest.requestPayload?.address
                  || activeRequest.serviceAddress
                  || 'Open job to view customer location'}
              </span>
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate(`/requests/${activeRequest.id}`)}
            className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-lg bg-tealbrand-600 hover:bg-tealbrand-700 text-xs font-semibold text-white shrink-0 min-h-[44px]"
          >
            Open Job Workspace
            <ArrowRight className="h-4 w-4" />
          </button>
        </section>
      )}

      {offerNotice && (
        <div className="rounded-2xl border border-tealbrand-300 bg-tealbrand-50 px-5 py-3.5 flex items-center justify-between gap-3 text-xs sm:text-sm text-tealbrand-900">
          <span>{offerNotice}</span>
          <button type="button" onClick={() => setOfferNotice?.('')} className="text-xs font-semibold underline shrink-0">
            Dismiss
          </button>
        </div>
      )}

      {offerError && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-3.5 flex items-center justify-between gap-3 text-xs sm:text-sm text-red-800">
          <span>{offerError}</span>
          <button type="button" onClick={() => setOfferError?.('')} className="text-xs font-semibold underline shrink-0">
            Dismiss
          </button>
        </div>
      )}

      {queuedRequest && (
        <section className="rounded-2xl border border-amber-300 bg-amber-50/70 p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 min-w-0 overflow-hidden">
          <div className="space-y-1.5 min-w-0">
            <div className="text-xs font-semibold uppercase tracking-[0.12em] text-amber-900">
              {String(queuedRequest.status || '').toLowerCase() === 'helper_queued'
                ? 'Queued Next Job · Confirmed by Customer'
                : 'Queued Next Job · Waiting Customer ETA Confirmation'}
            </div>
            <h2 className="font-display text-lg font-bold text-ink-900 break-words">
              {queuedRequest.serviceSummary || queuedRequest.subject || 'Upcoming Service Request'}
            </h2>
            <p className="text-sm text-ink-700 flex items-start gap-1.5 min-w-0">
              <MapPin className="h-4 w-4 text-amber-800 mt-0.5 shrink-0" />
              <span className="min-w-0 break-words">
                {queuedRequest.requestPayload?.serviceAddress
                  || queuedRequest.requestPayload?.address
                  || queuedRequest.serviceAddress
                  || 'Customer location confirmed'}
              </span>
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('/jobs')}
            className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-lg border border-amber-400 bg-surface hover:bg-well text-xs font-semibold text-ink-900 shrink-0 min-h-[44px]"
          >
            View Queued Job
            <ArrowRight className="h-4 w-4" />
          </button>
        </section>
      )}

      {/* Quick Actions */}
      <section className="space-y-3">
        <h2 className="font-display text-lg font-bold text-ink-900">Quick Actions</h2>
        <div className="divide-y divide-border rounded-2xl border border-border bg-surface overflow-hidden">
          <button
            type="button"
            onClick={() => onNavigate('/services')}
            className="w-full p-4 sm:p-5 text-left flex items-center justify-between gap-3 hover:bg-well/50 transition-colors"
          >
            <div className="flex items-center gap-3.5 min-w-0">
              <span className="h-10 w-10 rounded-xl bg-tealbrand-50 text-tealbrand-700 flex items-center justify-center shrink-0">
                <Layers className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <div className="text-sm font-bold text-ink-900">Add or Remove Services</div>
                <div className="text-xs text-ink-500 truncate">
                  {offerings.length} service offering{offerings.length === 1 ? '' : 's'} configured
                </div>
              </div>
            </div>
            <ArrowRight className="h-4 w-4 text-ink-400 shrink-0" />
          </button>

          <button
            type="button"
            onClick={() => onNavigate('/jobs')}
            className="w-full p-4 sm:p-5 text-left flex items-center justify-between gap-3 hover:bg-well/50 transition-colors"
          >
            <div className="flex items-center gap-3.5 min-w-0">
              <span className="h-10 w-10 rounded-xl bg-tealbrand-50 text-tealbrand-700 flex items-center justify-center shrink-0">
                <Briefcase className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <div className="text-sm font-bold text-ink-900">Jobs &amp; Activity</div>
                <div className="text-xs text-ink-500 truncate">
                  {jobHistory.length} recorded request{jobHistory.length === 1 ? '' : 's'}
                </div>
              </div>
            </div>
            <ArrowRight className="h-4 w-4 text-ink-400 shrink-0" />
          </button>

          <button
            type="button"
            onClick={() => onNavigate('/payments')}
            className="w-full p-4 sm:p-5 text-left flex items-center justify-between gap-3 hover:bg-well/50 transition-colors"
          >
            <div className="flex items-center gap-3.5 min-w-0">
              <span className="h-10 w-10 rounded-xl bg-tealbrand-50 text-tealbrand-700 flex items-center justify-center shrink-0">
                <CreditCard className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <div className="text-sm font-bold text-ink-900">Payments &amp; Earnings</div>
                <div className="text-xs text-ink-500 truncate">
                  Wallet: <span className={`tabular-nums-mono font-bold ${signedWalletMinor < 0 ? 'text-red-700' : 'text-tealbrand-700'}`}>{formattedWalletBalance}</span>
                  {cashConfirmations.length > 0
                    ? ` · ${cashConfirmations.length} cash confirmation${cashConfirmations.length === 1 ? '' : 's'} pending`
                    : ' · Incoming incomes and payout account'}
                </div>
              </div>
            </div>
            <ArrowRight className="h-4 w-4 text-ink-400 shrink-0" />
          </button>

          {!evaluation.fullyVerified && (
            <button
              type="button"
              onClick={() => onNavigate('/onboarding')}
              className="w-full p-4 sm:p-5 text-left flex items-center justify-between gap-3 hover:bg-well/50 transition-colors"
            >
              <div className="flex items-center gap-3.5 min-w-0">
                <span className="h-10 w-10 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center shrink-0">
                  <ShieldCheck className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <div className="text-sm font-bold text-ink-900">Onboarding &amp; Verification</div>
                  <div className="text-xs text-ink-500 truncate">
                    {evaluation.completedTotalSteps} of {evaluation.totalSteps} stages complete
                  </div>
                </div>
              </div>
              <ArrowRight className="h-4 w-4 text-ink-400 shrink-0" />
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
