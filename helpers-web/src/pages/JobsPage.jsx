import { useMemo, useState } from 'react';
import { ArrowRight, Briefcase, Clock, MapPin, Navigation } from 'lucide-react';
import { useHelperSession } from '../context/HelperSessionContext';
import { resolveHelperPayoutAmount, resolveRequestCustomerTotal } from '../services/helperDataService';

function formatDate(val) {
  if (!val) return 'Recent';
  const parsed = typeof val?.toDate === 'function' ? val.toDate() : new Date(val);
  return Number.isNaN(parsed.getTime())
    ? 'Recent'
    : parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function getJobAmount(job) {
  return resolveHelperPayoutAmount(job);
}

const ACTIVE_STATUSES = new Set(['accepted', 'en_route', 'driving', 'buying_resources', 'arrived', 'work_started']);

export function JobsPage({ onNavigate }) {
  const {
    offers,
    jobHistory,
    activeRequest,
    queuedRequest,
    offerBusyId,
    offerError,
    offerNotice,
    setOfferError,
    setOfferNotice,
    respondToOffer,
  } = useHelperSession();

  const [filter, setFilter] = useState('all');

  const filteredHistory = useMemo(() => {
    return jobHistory.filter((job) => {
      const st = String(job.status || '').toLowerCase();
      if (filter === 'active') return ACTIVE_STATUSES.has(st);
      if (filter === 'completed') return st === 'completed';
      if (filter === 'cancelled') return st.includes('cancel');
      return true;
    });
  }, [filter, jobHistory]);

  const completedTotal = useMemo(() => {
    return jobHistory
      .filter((job) => String(job.status || '').toLowerCase() === 'completed')
      .reduce((sum, job) => sum + getJobAmount(job), 0);
  }, [jobHistory]);

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div className="space-y-1">
          <div className="text-xs font-semibold uppercase tracking-[0.12em] text-tealbrand-700 flex items-center gap-1.5">
            <Briefcase className="h-3.5 w-3.5" />
            Jobs &amp; Activity
          </div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-ink-900">
            Active Requests &amp; Job History
          </h1>
          <p className="text-sm text-ink-500">
            Review incoming offers, manage ongoing customer visits, and track completed earnings.
          </p>
        </div>

        <div className="rounded-xl border border-border bg-surface px-4 py-3 flex items-center gap-4 shrink-0">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-ink-500">Completed Earnings</div>
            <div className="tabular-nums-mono text-lg font-bold text-tealbrand-700">
              R{completedTotal.toFixed(2)}
            </div>
          </div>
        </div>
      </div>

      {/* Active Assigned Request */}
      {activeRequest && (
        <section className="rounded-xl border border-tealbrand-600/40 bg-tealbrand-50 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="text-xs font-semibold uppercase tracking-wider text-tealbrand-800 flex items-center gap-1.5">
              <Navigation className="h-3.5 w-3.5" />
              Active Job · {String(activeRequest.status || '').replace(/_/g, ' ')}
            </div>
            <h2 className="font-display text-base font-bold text-ink-900">
              {activeRequest.serviceSummary || activeRequest.subject || 'Assigned Request'}
            </h2>
            <p className="text-xs text-ink-700 flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5 text-tealbrand-700 shrink-0" />
              <span>{activeRequest.requestPayload?.address || 'View customer address inside job'}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate(`/requests/${activeRequest.id}`)}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-tealbrand-600 hover:bg-tealbrand-700 text-xs font-semibold text-white min-h-[44px] shrink-0"
          >
            Open Job Details
            <ArrowRight className="h-4 w-4" />
          </button>
        </section>
      )}

      {offerNotice && (
        <div className="rounded-lg border border-tealbrand-300 bg-tealbrand-50 px-4 py-3 text-sm text-tealbrand-900 flex items-center justify-between gap-3">
          <span>{offerNotice}</span>
          <button type="button" onClick={() => setOfferNotice?.('')} className="text-xs font-semibold underline shrink-0">
            Dismiss
          </button>
        </div>
      )}

      {queuedRequest && (
        <section className="rounded-xl border border-amber-300 bg-amber-50/70 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="text-xs font-semibold uppercase tracking-wider text-amber-900 flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              {String(queuedRequest.status || '').toLowerCase() === 'helper_queued'
                ? 'Queued Next Job · Customer Confirmed'
                : 'Queued Next Job · Waiting Customer ETA Confirmation'}
            </div>
            <h2 className="font-display text-base font-bold text-ink-900">
              {queuedRequest.serviceSummary || queuedRequest.subject || 'Upcoming Request'}
            </h2>
            <p className="text-xs text-ink-700 flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5 text-amber-800 shrink-0" />
              <span>{queuedRequest.requestPayload?.address || queuedRequest.serviceAddress || 'Customer location confirmed'}</span>
            </p>
          </div>
          <div className="text-xs font-semibold text-amber-900 shrink-0">
            Starts automatically after your current job
          </div>
        </section>
      )}

      {/* Pending Offers */}
      {offers.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-500">
            Pending Job Offers ({offers.length})
          </h2>
          {offerError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 flex items-center justify-between">
              <span>{offerError}</span>
              <button type="button" onClick={() => setOfferError('')} className="text-xs font-semibold underline">
                Dismiss
              </button>
            </div>
          )}
          <div className="space-y-3">
            {offers.map((offer) => {
              const busy = offerBusyId === offer.id;
              const amount = getJobAmount(offer);
              const isBusyFallback = String(offer.offerType || '').trim().toLowerCase() === 'busy_helper_fallback';
              return (
                <div
                  key={offer.id}
                  className="rounded-xl border border-border bg-surface p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-ink-500">
                      <span>{offer.serviceSummary || 'Offer'}</span>
                      <span>·</span>
                      <span className="tabular-nums-mono font-semibold text-ink-900">
                        {amount > 0 ? `R${amount.toFixed(2)}` : 'Priced'}
                      </span>
                      {isBusyFallback && (
                        <>
                          <span>·</span>
                          <span className="font-semibold text-amber-800">
                            Next Job After Current
                          </span>
                        </>
                      )}
                    </div>
                    <h3 className="text-base font-bold text-ink-900">
                      {offer.subject || offer.serviceSummary || 'Service Offer'}
                    </h3>
                    <p className="text-xs text-ink-500 flex items-center gap-1.5">
                      <MapPin className="h-3.5 w-3.5 text-tealbrand-700 shrink-0" />
                      <span>{offer.requestPayload?.address || 'Customer location specified'}</span>
                    </p>
                  </div>
                  <div className="flex items-center gap-2.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => respondToOffer(offer, 'decline')}
                      disabled={busy}
                      className="px-4 py-2.5 rounded-lg border border-border bg-surface hover:bg-well text-xs font-semibold text-ink-700 min-h-[44px]"
                    >
                      Decline
                    </button>
                    <button
                      type="button"
                      onClick={() => respondToOffer(offer, 'accept', onNavigate)}
                      disabled={busy}
                      className="px-5 py-2.5 rounded-lg bg-tealbrand-600 hover:bg-tealbrand-700 text-xs font-semibold text-white min-h-[44px]"
                    >
                      {busy ? 'Accepting…' : isBusyFallback ? 'Accept Next Job' : 'Accept Job'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Historical / Assigned Requests */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-lg font-bold text-ink-900">Assigned Jobs</h2>
          <div className="inline-flex rounded-lg border border-border bg-well p-1">
            {[
              { id: 'all', label: 'All' },
              { id: 'active', label: 'Active' },
              { id: 'completed', label: 'Completed' },
              { id: 'cancelled', label: 'Cancelled' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilter(tab.id)}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                  filter === tab.id
                    ? 'bg-surface text-ink-900 shadow-sm'
                    : 'text-ink-500 hover:text-ink-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {filteredHistory.length === 0 ? (
          <div className="rounded-xl border border-border bg-surface p-8 text-center space-y-2">
            <div className="w-11 h-11 rounded-lg bg-well text-ink-400 flex items-center justify-center mx-auto">
              <Clock className="h-5 w-5" />
            </div>
            <h3 className="text-sm font-semibold text-ink-900">No jobs in this view yet</h3>
            <p className="text-xs text-ink-500 max-w-sm mx-auto">
              Accepted and completed customer requests assigned to your helper account appear here automatically.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border rounded-xl border border-border bg-surface">
            {filteredHistory.map((job) => {
              const status = String(job.status || 'pending').toLowerCase();
              const amount = getJobAmount(job);
              const customerTotal = resolveRequestCustomerTotal(job);
              return (
                <button
                  key={job.id}
                  type="button"
                  onClick={() => onNavigate(`/requests/${job.id}`)}
                  className="w-full text-left p-4 sm:px-5 hover:bg-well/40 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-ink-500">
                      <span
                        className={`font-semibold capitalize ${
                          status === 'completed'
                            ? 'text-tealbrand-700'
                            : status.includes('cancel')
                              ? 'text-red-700'
                              : 'text-amber-800'
                        }`}
                      >
                        {status.replace(/_/g, ' ')}
                      </span>
                      <span>·</span>
                      <span>{formatDate(job.createdAt)}</span>
                      {job.customerName && (
                        <>
                          <span>·</span>
                          <span className="truncate">{job.customerName}</span>
                        </>
                      )}
                    </div>
                    <div className="text-sm font-semibold text-ink-900 truncate">
                      {job.serviceSummary || job.subject || 'Service Session'}
                    </div>
                    <div className="text-xs text-ink-500 truncate">
                      {job.requestPayload?.address || 'Customer address'}
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                    {status === 'completed' && (
                      <span
                        className={`text-[11px] font-bold px-2.5 py-0.5 rounded-md ${
                          String(job.paymentStatus || '').toLowerCase() === 'paid'
                            ? 'bg-emerald-50 text-emerald-700'
                            : String(job.paymentStatus || '').toLowerCase() === 'awaiting_cash_confirmation'
                              ? 'bg-amber-50 text-amber-800'
                              : 'bg-well text-ink-600'
                        }`}
                      >
                        {String(job.paymentStatus || '').toLowerCase() === 'paid'
                          ? 'Paid'
                          : String(job.paymentStatus || '').toLowerCase() === 'awaiting_cash_confirmation'
                            ? 'Confirm Cash'
                            : 'Payment Pending'}
                      </span>
                    )}
                    <div className="text-right">
                      <span className="tabular-nums-mono text-sm font-bold text-ink-900 block">
                        {amount > 0 ? `R${amount.toFixed(2)}` : '—'}
                      </span>
                      {customerTotal > 0 && !status.includes('cancel') && (
                        <span className="tabular-nums-mono text-[11px] text-ink-500 block">
                          Customer: R{Math.round(customerTotal)}
                        </span>
                      )}
                    </div>
                    <ArrowRight className="h-4 w-4 text-ink-400" />
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
