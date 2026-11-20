import { useMemo } from 'react';
import { ArrowRight, CheckCircle2, ChevronLeft, Clock, Layers, XCircle } from 'lucide-react';
import { StepServicesPortfolio } from '../components/steps/StepServicesPortfolio';
import { useHelperSession } from '../context/HelperSessionContext';

export function ServicesPage({ onNavigate }) {
  const { user, catalog, offerings, evaluation } = useHelperSession();

  const counts = useMemo(() => {
    let approved = 0;
    let pending = 0;
    let declined = 0;
    for (const item of offerings) {
      if (item.status === 'approved' && item.approved === true) approved += 1;
      else if (item.status === 'declined') declined += 1;
      else pending += 1;
    }
    return { approved, pending, declined };
  }, [offerings]);

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-5 sm:py-8 space-y-6">
      <button
        type="button"
        onClick={() => (window.history.length > 1 ? window.history.back() : onNavigate('/profile'))}
        className="inline-flex items-center gap-1 text-xs font-extrabold text-tealbrand-700 hover:text-tealbrand-800"
      >
        <ChevronLeft className="h-4 w-4" />
        <span>Back</span>
      </button>

      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div className="space-y-1">
          <div className="text-xs font-semibold uppercase tracking-[0.12em] text-tealbrand-700 flex items-center gap-1.5">
            <Layers className="h-3.5 w-3.5" />
            Service Offerings
          </div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-ink-900">
            Manage Your Services &amp; Work Photos
          </h1>
          <p className="text-sm text-ink-500 max-w-2xl">
            Add new services from the Uncedo catalogue, update work portfolio photos, or remove offerings anytime. Changes sync directly with your helper dispatch profile.
          </p>
        </div>

        {!evaluation.fullyVerified && (
          <button
            type="button"
            onClick={() => onNavigate('/onboarding')}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg border border-border bg-surface hover:bg-well text-xs font-semibold text-ink-900 shrink-0 self-start sm:self-auto min-h-[44px]"
          >
            Open 7-Step Onboarding
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Summary Row */}
      <div className="grid grid-cols-3 border border-border rounded-xl bg-surface divide-x divide-border">
        <div className="p-4 sm:p-5 flex items-center gap-3">
          <CheckCircle2 className="h-5 w-5 text-tealbrand-600 shrink-0 hidden sm:block" />
          <div>
            <div className="tabular-nums-mono text-xl font-bold text-ink-900">{counts.approved}</div>
            <div className="text-xs text-ink-500">Approved</div>
          </div>
        </div>
        <div className="p-4 sm:p-5 flex items-center gap-3">
          <Clock className="h-5 w-5 text-amber-700 shrink-0 hidden sm:block" />
          <div>
            <div className="tabular-nums-mono text-xl font-bold text-ink-900">{counts.pending}</div>
            <div className="text-xs text-ink-500">Pending Review</div>
          </div>
        </div>
        <div className="p-4 sm:p-5 flex items-center gap-3">
          <XCircle className="h-5 w-5 text-red-700 shrink-0 hidden sm:block" />
          <div>
            <div className="tabular-nums-mono text-xl font-bold text-ink-900">{counts.declined}</div>
            <div className="text-xs text-ink-500">Declined</div>
          </div>
        </div>
      </div>

      <section className="rounded-xl border border-border bg-surface p-5 sm:p-8">
        <StepServicesPortfolio
          user={user}
          catalog={catalog}
          offerings={offerings}
          showContinueButton={false}
        />
      </section>
    </div>
  );
}
