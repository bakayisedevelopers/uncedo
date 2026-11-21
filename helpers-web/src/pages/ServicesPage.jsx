import { useMemo } from 'react';
import { ArrowRight, Award, CheckCircle2, ChevronLeft, Clock, Layers, XCircle } from 'lucide-react';
import { MasteryBadge } from '../components/rewards/MasteryBadge';
import { StepServicesPortfolio } from '../components/steps/StepServicesPortfolio';
import { useHelperSession } from '../context/HelperSessionContext';
import { buildHelperApprovedMasteryList, buildMasteryProgressModel } from '../utils/masteryModel';

export function ServicesPage({ onNavigate }) {
  const {
    user,
    catalog,
    offerings,
    evaluation,
    serviceOptionMasteryMap,
    serviceMasteryMap,
    serviceOptionRatingMap,
    serviceRatingMap,
    masteryConfig,
  } = useHelperSession();

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

  const approvedMasteryItems = useMemo(
    () =>
      buildHelperApprovedMasteryList({
        offerings,
        serviceOptionMasteryMap,
        serviceMasteryMap,
        optionRatingMap: serviceOptionRatingMap,
        serviceRatingMap,
      }),
    [offerings, serviceOptionMasteryMap, serviceMasteryMap, serviceOptionRatingMap, serviceRatingMap],
  );

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
            Manage Your Services &amp; Option Badges
          </h1>
          <p className="text-sm text-ink-500 max-w-2xl">
            Add new services from the Uncedo catalogue, update work portfolio photos, and track your option-specific mastery badges from Beginner through Legend.
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

      {/* Per-Option Mastery Badges Summary */}
      {approvedMasteryItems.length > 0 && (
        <section className="rounded-xl border border-border bg-surface p-5 sm:p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h2 className="font-display text-base font-bold text-ink-900 flex items-center gap-2">
                <Award className="h-4 w-4 text-tealbrand-700" aria-hidden="true" />
                <span>Service Option Mastery Badges</span>
              </h2>
              <p className="text-xs text-ink-500 mt-0.5">
                Each approved service option earns its own Beginner, Specialist, Master, or Legend tier independently from paid jobs and ratings.
              </p>
            </div>
          </div>

          <div className="divide-y divide-border rounded-xl border border-border overflow-hidden">
            {approvedMasteryItems.map((item) => {
              const progress = buildMasteryProgressModel({
                mastery: item.mastery,
                masteryConfig,
              });
              return (
                <div
                  key={item.offeringId}
                  className="px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-surface"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-ink-900 truncate">
                      {item.optionTitle || item.serviceName}
                    </div>
                    <div className="text-xs text-ink-500 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span>{item.optionTitle ? item.serviceName : 'Service-wide offering'}</span>
                      <span aria-hidden="true">·</span>
                      <span className="tabular-nums-mono">
                        {item.mastery.eligibleCompletedJobCount} paid job{item.mastery.eligibleCompletedJobCount === 1 ? '' : 's'}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="tabular-nums-mono">
                        {item.mastery.averageRating > 0
                          ? `${item.mastery.averageRating.toFixed(1)}★ (${item.mastery.ratingCount})`
                          : 'No ratings yet'}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {progress.nextLevel && (
                      <span className="text-[11px] text-ink-500 tabular-nums-mono hidden md:inline">
                        {Math.round(progress.overallProgress * 100)}% to {progress.nextMeta?.label}
                      </span>
                    )}
                    <MasteryBadge level={item.mastery.level} size="md" />
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-[11px] text-ink-500">
            Badges reflect your Uncedo platform experience per service option only — not a statutory or trade certification.
          </p>
        </section>
      )}

      <section className="rounded-xl border border-border bg-surface p-5 sm:p-8">
        <StepServicesPortfolio
          user={user}
          catalog={catalog}
          offerings={offerings}
          showContinueButton={false}
          initialExpandApproved
        />
      </section>
    </div>
  );
}
