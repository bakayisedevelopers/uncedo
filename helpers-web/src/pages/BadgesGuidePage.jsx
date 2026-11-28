import { useMemo, useState } from 'react';
import {
  Award,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Layers,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
} from 'lucide-react';
import { MasteryBadge, MasteryProgressPanel, MembershipBadge } from '../components/rewards/MasteryBadge';
import { useHelperSession } from '../context/HelperSessionContext';
import {
  buildHelperApprovedMasteryList,
  buildMasteryProgressModel,
  DEFAULT_MASTERY_CONFIG,
  DEFAULT_MEMBERSHIP_CONFIG,
  getMasteryMeta,
  getMembershipMeta,
  MASTERY_LEVELS,
  MEMBERSHIP_LEVELS,
  mergeMasteryConfig,
  mergeMembershipConfig,
  normalizeStrictToken,
} from '../utils/masteryModel';

const MASTERY_GRADE5_EXPLANATIONS = {
  beginner: {
    tagline: 'Your starting badge',
    story: 'You get Beginner the moment Uncedo approves a service option for you. Every helper starts here — zero jobs needed!',
    example: 'Just got approved for Lawn Mowing? You are a Beginner right away.',
  },
  verified: {
    tagline: 'First big milestone',
    story: 'Shows customers you have finished at least 10 paid jobs on this service option and earned happy ratings. Bridges the step from Beginner to Specialist!',
    example: 'Great early milestone once your first customers rate your work.',
  },
  specialist: {
    tagline: 'Trusted & steady',
    story: 'Shows customers you have finished this exact job many times and people are happy with your work.',
    example: 'Great for helpers who do the same job well week after week.',
  },
  master: {
    tagline: 'Pro experience',
    story: 'Shows customers you are very experienced in this exact option and almost everyone gives you 5 stars.',
    example: 'Customers see you have completed lots of paid jobs with very high stars.',
  },
  legend: {
    tagline: 'Highest service badge',
    story: 'The biggest badge you can earn on a service option! Only helpers with huge experience and top ratings reach Legend.',
    example: 'You are one of the most experienced helpers on Uncedo for this option.',
  },
};

const MEMBERSHIP_GRADE5_EXPLANATIONS = {
  neighbour: {
    tagline: 'Where every helper starts',
    story: 'You get Neighbour as soon as you join Uncedo Helpers. No minimum jobs or stars required.',
  },
  partner: {
    tagline: 'Verified & dependable',
    story: 'Shows you are verified, finish most jobs you accept, and customers enjoy working with you.',
  },
  friend: {
    tagline: 'Very reliable across Uncedo',
    story: 'Shows you rarely cancel, keep a high star score across all your jobs, and have completed many paid bookings.',
  },
  family: {
    tagline: 'Top overall Uncedo helper',
    story: 'Our highest helper membership tier. Earned by verified helpers with hundreds of paid jobs and almost no cancellations.',
  },
};

function describeMissingMasterySteps(progress) {
  if (!progress?.nextLevel) {
    return 'You reached the top Legend badge for this service option!';
  }
  const missing = [];
  for (const req of progress.requirements || []) {
    if (req.met) continue;
    if (req.label === 'Completed paid jobs') {
      const left = Math.max(1, Math.ceil(req.targetValue - req.currentValue));
      missing.push(`${left} more completed paid job${left === 1 ? '' : 's'}`);
    } else if (req.label === 'Average rating') {
      missing.push(`a ${req.target}★ average (yours is ${req.current}★)`);
    } else if (req.label === 'Customer ratings') {
      const left = Math.max(1, Math.ceil(req.targetValue - req.currentValue));
      missing.push(`${left} more customer rating${left === 1 ? '' : 's'}`);
    }
  }
  if (!missing.length) {
    return `All numbers met for ${progress.nextMeta?.label}!`;
  }
  return `To reach ${progress.nextMeta?.label}, you still need ${missing.join(', ')}.`;
}

export function BadgesGuidePage({ onNavigate }) {
  const {
    profile,
    catalog,
    offerings,
    evaluation,
    rewardAccount,
    serviceOptionMasteryMap,
    serviceMasteryMap,
    serviceOptionRatingMap,
    serviceRatingMap,
    masteryConfig,
    membershipConfig,
  } = useHelperSession();

  const [catalogSearch, setCatalogSearch] = useState('');
  const [expandedServiceIds, setExpandedServiceIds] = useState({});

  const liveMasteryConfig = useMemo(
    () => mergeMasteryConfig(masteryConfig || DEFAULT_MASTERY_CONFIG),
    [masteryConfig],
  );
  const liveMembershipConfig = useMemo(
    () => mergeMembershipConfig(membershipConfig || DEFAULT_MEMBERSHIP_CONFIG),
    [membershipConfig],
  );

  const approvedMasteryItems = useMemo(
    () =>
      buildHelperApprovedMasteryList({
        offerings,
        catalog,
        serviceOptionMasteryMap,
        serviceMasteryMap,
        optionRatingMap: serviceOptionRatingMap,
        serviceRatingMap,
      }),
    [catalog, offerings, serviceOptionMasteryMap, serviceMasteryMap, serviceOptionRatingMap, serviceRatingMap],
  );

  const pendingOfferings = useMemo(
    () =>
      (Array.isArray(offerings) ? offerings : []).filter(
        (item) => !(item.status === 'approved' && item.approved === true) && item.status !== 'declined',
      ),
    [offerings],
  );

  const approvedByOptionKey = useMemo(() => {
    const map = new Map();
    for (const item of approvedMasteryItems) {
      const key = item.optionId ? `${item.serviceId}__${item.optionId}` : item.serviceId;
      if (key) map.set(key, item);
    }
    return map;
  }, [approvedMasteryItems]);

  const filteredCatalog = useMemo(() => {
    const term = catalogSearch.trim().toLowerCase();
    const list = Array.isArray(catalog) ? catalog : [];
    if (!term) return list;
    return list
      .map((service) => {
        const serviceName = String(service?.label || service?.serviceName || service?.id || '').toLowerCase();
        const options = Array.isArray(service?.options) ? service.options : [];
        const matchingOptions = options.filter((opt) =>
          String(opt?.title || opt?.label || opt?.id || '').toLowerCase().includes(term),
        );
        if (serviceName.includes(term)) return service;
        if (matchingOptions.length > 0) return { ...service, options: matchingOptions };
        return null;
      })
      .filter(Boolean);
  }, [catalog, catalogSearch]);

  const membershipData = rewardAccount?.membership || {};
  const currentMembershipLevel = String(membershipData.currentLevel || 'neighbour').trim().toLowerCase();
  const highestMembershipLevel = String(membershipData.highestLevel || currentMembershipLevel).trim().toLowerCase();
  const membershipCurrentMeta = getMembershipMeta(currentMembershipLevel);
  const membershipHighestMeta = getMembershipMeta(highestMembershipLevel);

  const safeMetrics = profile?.metrics && typeof profile.metrics === 'object' ? profile.metrics : {};
  const qualSnap = membershipData.qualificationSnapshot || {};
  const overallPaidJobs = Number(
    qualSnap.eligibleCompletedPaidJobs ?? rewardAccount?.eligibleCompletedPaidJobs ?? 0,
  );
  const overallRating = Number(
    qualSnap.overallAverage ?? safeMetrics.overallRating ?? profile?.rating ?? 0,
  );
  const overallRatingCount = Number(qualSnap.overallCount ?? 0);
  const completionRate = Number(
    qualSnap.completionRate ?? (safeMetrics.completionRate !== undefined ? safeMetrics.completionRate : 1),
  );
  const cancellationRate = Number(
    qualSnap.cancellationRate ?? (safeMetrics.cancellationRate !== undefined ? safeMetrics.cancellationRate : 0),
  );
  const isVerifiedProfile = Boolean(
    evaluation?.fullyVerified || String(profile?.verificationStatus || '').trim().toLowerCase() === 'verified',
  );

  const toggleCatalogService = (serviceId) => {
    setExpandedServiceIds((prev) => ({
      ...prev,
      [serviceId]: !prev[serviceId],
    }));
  };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-5 sm:py-8 space-y-6">
      <button
        type="button"
        onClick={() => onNavigate('/profile')}
        className="inline-flex items-center gap-1 text-xs font-extrabold text-tealbrand-700 hover:text-tealbrand-800 min-h-[36px]"
      >
        <ChevronLeft className="h-4 w-4" />
        <span>Back to profile</span>
      </button>

      {/* Hero Header */}
      <header className="space-y-2">
        <div className="text-xs font-extrabold uppercase tracking-[0.14em] text-tealbrand-700 flex items-center gap-1.5">
          <Award className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Badges &amp; Leveling Guide</span>
        </div>
        <h1 className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight text-ink-900">
          How Uncedo Badges Work
        </h1>
        <p className="text-sm text-ink-600 leading-relaxed max-w-2xl">
          Everything you need to know about the badges you can earn on Uncedo Helpers — explained simply, with exact numbers for every level.
        </p>
      </header>

      {/* 1. Simple Overview: Two Types of Badges */}
      <section className="rounded-[24px] border border-tealbrand-600/20 bg-tealbrand-50/45 p-5 sm:p-6 space-y-4">
        <div className="space-y-1">
          <h2 className="font-display text-lg font-extrabold text-ink-900">
            First, there are 2 kinds of badges
          </h2>
          <p className="text-sm text-ink-600 leading-relaxed">
            Think of it like school: you get a separate mark for each subject, and you also get one overall report card for the whole year.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <div className="rounded-2xl border border-border bg-surface p-4 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-extrabold uppercase tracking-wider text-tealbrand-700">
                1. Service Option Badges
              </span>
              <MasteryBadge level="verified" size="sm" />
            </div>
            <h3 className="font-display text-base font-bold text-ink-900">
              One badge for each service option
            </h3>
            <p className="text-xs sm:text-sm text-ink-600 leading-relaxed">
              Every service option you do has its own counter and star score. Going up in one option does not change your other options.
            </p>
            <div className="text-xs text-ink-500 font-semibold pt-1">
              Beginner → Verified → Specialist → Master → Legend
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-surface p-4 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-extrabold uppercase tracking-wider text-tealbrand-700">
                2. Helper Membership
              </span>
              <MembershipBadge level={currentMembershipLevel} size="sm" />
            </div>
            <h3 className="font-display text-base font-bold text-ink-900">
              One overall badge for your account
            </h3>
            <p className="text-xs sm:text-sm text-ink-600 leading-relaxed">
              Adds together <strong>all</strong> your paid jobs, your overall star rating, how often you finish accepted jobs, and verification.
            </p>
            <div className="text-xs text-ink-500 font-semibold pt-1">
              Neighbour → Partner → Friend → Family
            </div>
          </div>
        </div>
      </section>

      {/* 2. The 4 Service Option Badges (Exact Rules) */}
      <section className="rounded-[24px] border border-border bg-surface p-5 sm:p-6 space-y-4">
        <div className="space-y-1">
          <h2 className="font-display text-lg font-extrabold text-ink-900">
            Part 1: Service Option Badges (Beginner to Legend)
          </h2>
          <p className="text-sm text-ink-600 leading-relaxed">
            To unlock a badge for a service option, you must reach <strong>all 3 numbers</strong> in that box at the same time — and every level from Verified up requires only a <strong>4.0★ or higher</strong> average rating.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          {MASTERY_LEVELS.map((levelKey) => {
            const meta = getMasteryMeta(levelKey);
            const rule = liveMasteryConfig[levelKey] || DEFAULT_MASTERY_CONFIG[levelKey];
            const copy = MASTERY_GRADE5_EXPLANATIONS[levelKey];
            return (
              <div
                key={levelKey}
                className="rounded-2xl border border-border bg-canvas/60 p-4 flex flex-col justify-between gap-3"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <MasteryBadge level={levelKey} size="md" />
                    <span className="text-[11px] font-bold text-ink-500">{copy.tagline}</span>
                  </div>
                  <p className="text-xs sm:text-sm text-ink-700 leading-relaxed">
                    {copy.story}
                  </p>
                </div>

                <div className="rounded-xl border border-border bg-surface p-3 space-y-1.5 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-ink-500">Completed paid jobs</span>
                    <span className="tabular-nums-mono font-extrabold text-ink-900">
                      {rule.minCompletedPaidJobs === 0 ? '0 (start)' : `${rule.minCompletedPaidJobs}+`}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-ink-500">Average star rating</span>
                    <span className="tabular-nums-mono font-extrabold text-ink-900">
                      {rule.minAverageRating === 0 ? 'Any' : `${Number(rule.minAverageRating).toFixed(1)}★+`}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-ink-500">Customers who rated you</span>
                    <span className="tabular-nums-mono font-extrabold text-ink-900">
                      {rule.minRatingCount === 0 ? '0' : `${rule.minRatingCount}+ ratings`}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 3. Your Own Service & Option Progress */}
      <section className="rounded-[24px] border border-border bg-surface p-5 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <h2 className="font-display text-lg font-extrabold text-ink-900">
              Your Service Options Right Now
            </h2>
            <p className="text-sm text-ink-600 leading-relaxed">
              Here is how each of your approved services and options is doing today.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('/services')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 min-h-[40px] rounded-xl border border-border bg-well/60 hover:bg-well text-xs font-bold text-tealbrand-800 shrink-0"
          >
            <span>Manage services</span>
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>

        {approvedMasteryItems.length > 0 ? (
          <div className="space-y-3">
            {approvedMasteryItems.map((item) => {
              const progress = buildMasteryProgressModel({
                mastery: item.mastery,
                masteryConfig: liveMasteryConfig,
              });
              return (
                <div
                  key={item.offeringId}
                  className="rounded-2xl border border-border bg-canvas/50 p-4 space-y-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm sm:text-base font-extrabold text-ink-900">
                        {item.optionTitle || item.serviceName}
                      </div>
                      <div className="text-xs text-ink-500">
                        {item.optionTitle
                          ? `Service: ${item.serviceName} · Tracked separately for this option`
                          : 'Whole-service offering · Tracked across this service'}
                      </div>
                    </div>
                  </div>

                  <MasteryProgressPanel
                    mastery={item.mastery}
                    masteryConfig={liveMasteryConfig}
                  />

                  <div className="rounded-xl bg-tealbrand-50/70 border border-tealbrand-600/20 px-3.5 py-2.5 text-xs font-semibold text-tealbrand-900 leading-relaxed">
                    {describeMissingMasterySteps(progress)}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-2xl border border-border bg-canvas/60 p-4 space-y-2">
            <p className="text-sm font-bold text-ink-900">
              No approved service options yet
            </p>
            <p className="text-xs sm:text-sm text-ink-600 leading-relaxed">
              Add your services and work photos in <strong>Service offerings</strong>. As soon as an option is approved, it will start at <strong>Beginner</strong> and appear right here.
            </p>
          </div>
        )}

        {pendingOfferings.length > 0 && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-3.5 text-xs text-amber-900 leading-relaxed">
            <strong>{pendingOfferings.length}</strong> service option{pendingOfferings.length === 1 ? ' is' : 's are'} waiting for admin review. Once approved, each one starts at <strong>Beginner</strong>.
          </div>
        )}
      </section>

      {/* 4. Explore Different Services & Options in the Uncedo Catalogue */}
      <section className="rounded-[24px] border border-border bg-surface p-5 sm:p-6 space-y-4">
        <div className="space-y-1">
          <h2 className="font-display text-lg font-extrabold text-ink-900 flex items-center gap-2">
            <Layers className="h-4 w-4 text-tealbrand-700" aria-hidden="true" />
            <span>Different Services &amp; Options on Uncedo</span>
          </h2>
          <p className="text-sm text-ink-600 leading-relaxed">
            Look up any service below to see its options. Every option listed under a service earns its <strong>own</strong> Beginner → Verified → Specialist → Master → Legend badge.
          </p>
        </div>

        <label className="relative block">
          <Search className="h-4 w-4 text-ink-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden="true" />
          <input
            type="text"
            value={catalogSearch}
            onChange={(e) => setCatalogSearch(e.target.value)}
            placeholder="Search a service or option (e.g. cleaning, hair, plumbing)…"
            className="w-full min-h-[44px] rounded-xl border border-border bg-canvas pl-10 pr-4 py-2 text-sm text-ink-900 placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-tealbrand-600/30"
          />
        </label>

        {filteredCatalog.length === 0 ? (
          <p className="text-xs sm:text-sm text-ink-500 py-2">
            {Array.isArray(catalog) && catalog.length > 0
              ? 'No services matched that search word. Try another word.'
              : 'Loading the Uncedo service list…'}
          </p>
        ) : (
          <div className="divide-y divide-border rounded-2xl border border-border overflow-hidden">
            {filteredCatalog.map((service) => {
              const serviceId = String(service?.id || service?.serviceId || '').trim();
              const serviceKey = normalizeStrictToken(serviceId);
              const serviceName = String(service?.label || service?.serviceName || serviceId || 'Service').trim();
              const options = Array.isArray(service?.options) ? service.options : [];
              const isOpen = Boolean(catalogSearch.trim()) || Boolean(expandedServiceIds[serviceId]);
              const serviceWideMatch = approvedByOptionKey.get(serviceKey);

              return (
                <div key={serviceId || serviceName} className="bg-surface">
                  <button
                    type="button"
                    onClick={() => toggleCatalogService(serviceId)}
                    className="w-full px-4 py-3.5 flex items-center justify-between gap-3 text-left hover:bg-well/40 transition-colors min-h-[52px]"
                    aria-expanded={isOpen}
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-extrabold text-ink-900 truncate">{serviceName}</div>
                      <div className="text-xs text-ink-500">
                        {options.length > 0
                          ? `${options.length} separate option badge${options.length === 1 ? '' : 's'}`
                          : 'Whole-service badge (no sub-options)'}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {options.length === 0 && serviceWideMatch && (
                        <MasteryBadge level={serviceWideMatch.mastery.level} size="sm" />
                      )}
                      {isOpen ? (
                        <ChevronUp className="h-4 w-4 text-ink-500" aria-hidden="true" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-ink-500" aria-hidden="true" />
                      )}
                    </div>
                  </button>

                  {isOpen && (
                    <div className="border-t border-border/70 bg-canvas/50 px-4 py-3 space-y-2">
                      {options.length > 0 ? (
                        options.map((opt) => {
                          const optionId = String(opt?.id || '').trim();
                          const optionKey = normalizeStrictToken(optionId || opt?.title || opt?.label || '');
                          const optionTitle = String(opt?.title || opt?.label || optionId || 'Option').trim();
                          const match = approvedByOptionKey.get(`${serviceKey}__${optionKey}`);
                          return (
                            <div
                              key={optionId || optionTitle}
                              className="rounded-xl border border-border bg-surface px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2"
                            >
                              <div className="min-w-0">
                                <div className="text-xs sm:text-sm font-bold text-ink-900">{optionTitle}</div>
                                <div className="text-[11px] text-ink-500">
                                  {match
                                    ? `${match.mastery.eligibleCompletedJobCount} paid jobs · ${match.mastery.averageRating > 0 ? `${match.mastery.averageRating.toFixed(1)}★ (${match.mastery.ratingCount})` : 'No ratings yet'}`
                                    : `Needs ${liveMasteryConfig.verified.minCompletedPaidJobs} paid jobs, ${Number(liveMasteryConfig.verified.minAverageRating).toFixed(1)}★, ${liveMasteryConfig.verified.minRatingCount} ratings for Verified`}
                                </div>
                              </div>
                              {match ? (
                                <MasteryBadge level={match.mastery.level} size="sm" />
                              ) : (
                                <span className="text-[11px] font-semibold text-ink-500">
                                  Starts at Beginner
                                </span>
                              )}
                            </div>
                          );
                        })
                      ) : (
                        <p className="text-xs text-ink-600 leading-relaxed">
                          This service has no separate options, so all paid jobs for <strong>{serviceName}</strong> count together toward one service badge (Beginner → Verified → Specialist → Master → Legend).
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* 5. Grade 5 Plain-English Rules */}
      <section className="rounded-[24px] border border-border bg-surface p-5 sm:p-6 space-y-4">
        <div className="space-y-1">
          <h2 className="font-display text-lg font-extrabold text-ink-900 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-tealbrand-700" aria-hidden="true" />
            <span>5 Simple Rules to Remember</span>
          </h2>
          <p className="text-sm text-ink-600 leading-relaxed">
            Here is exactly how the Uncedo system calculates your badges behind the scenes.
          </p>
        </div>

        <div className="space-y-3">
          <div className="rounded-2xl border border-border bg-canvas/50 p-4 space-y-1.5">
            <h3 className="text-sm font-extrabold text-ink-900">
              1. Only finished &amp; paid jobs count
            </h3>
            <p className="text-xs sm:text-sm text-ink-600 leading-relaxed">
              A job counts only after you mark it finished <strong>and</strong> the payment is done. Card jobs count once paid; cash jobs count once you tap <strong>Confirm Received</strong>. Cancelled or unpaid jobs never add to your badge count, and one job only counts once per option.
            </p>
          </div>

          <div className="rounded-2xl border border-border bg-canvas/50 p-4 space-y-1.5">
            <h3 className="text-sm font-extrabold text-ink-900">
              2. Each option is like its own jar
            </h3>
            <p className="text-xs sm:text-sm text-ink-600 leading-relaxed">
              Say you do <strong>Standard Clean</strong> and <strong>Deep Clean</strong>. If you finish {liveMasteryConfig.verified.minCompletedPaidJobs} paid jobs on Standard Clean with good stars, Standard Clean becomes <strong>Verified</strong>. Deep Clean stays <strong>Beginner</strong> until Deep Clean also reaches its own numbers.
            </p>
          </div>

          <div className="rounded-2xl border border-border bg-canvas/50 p-4 space-y-1.5">
            <h3 className="text-sm font-extrabold text-ink-900">
              3. You must meet ALL 3 numbers at once
            </h3>
            <p className="text-xs sm:text-sm text-ink-600 leading-relaxed">
              Example: If you already have <strong>12 paid jobs</strong> and a <strong>4.2★</strong> average (which meets the <strong>{Number(liveMasteryConfig.verified.minAverageRating).toFixed(1)}★+</strong> rule), but only <strong>2 customers</strong> left a rating, you stay at <strong>Beginner</strong> until <strong>{Math.max(1, liveMasteryConfig.verified.minRatingCount - 2)} more customer</strong> rates you to hit {liveMasteryConfig.verified.minRatingCount} ratings. Then you jump straight to Verified!
            </p>
          </div>

          <div className="rounded-2xl border border-border bg-canvas/50 p-4 space-y-1.5">
            <h3 className="text-sm font-extrabold text-ink-900">
              4. Current badge vs. Highest achieved badge
            </h3>
            <p className="text-xs sm:text-sm text-ink-600 leading-relaxed">
              Every time a paid job finishes or a customer rates you, Uncedo checks your live numbers. If your star average dips below a target, your current badge matches your numbers right now — and we always save your <strong>Highest achieved</strong> badge too. Bring your stars back up and your badge goes right back up!
            </p>
          </div>

          <div className="rounded-2xl border border-border bg-canvas/50 p-4 space-y-1.5">
            <h3 className="text-sm font-extrabold text-ink-900">
              5. Badges show Uncedo experience, not a school certificate
            </h3>
            <p className="text-xs sm:text-sm text-ink-600 leading-relaxed">
              Badges tell customers how active and well-rated you are inside the Uncedo app. They are not government, trade, or school certificates.
            </p>
          </div>
        </div>
      </section>

      {/* 6. Part 2: Overall Helper Membership Levels */}
      <section className="rounded-[24px] border border-border bg-surface p-5 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <h2 className="font-display text-lg font-extrabold text-ink-900 flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-tealbrand-700" aria-hidden="true" />
              <span>Part 2: Overall Helper Membership (Neighbour to Family)</span>
            </h2>
            <p className="text-sm text-ink-600 leading-relaxed">
              Your Membership level looks at <strong>all your services combined</strong>, requires a <strong>4.0★ or higher</strong> overall rating for Partner, Friend, and Family, and checks how reliably you finish accepted jobs.
            </p>
          </div>
          <MembershipBadge level={currentMembershipLevel} size="md" />
        </div>

        {/* Live Membership Snapshot */}
        <div className="rounded-2xl border border-tealbrand-600/20 bg-tealbrand-50/45 p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="font-bold text-ink-800">
              Current level: <strong>{membershipCurrentMeta.label}</strong>
              {membershipHighestMeta.rank > membershipCurrentMeta.rank && (
                <span className="text-ink-500"> · Highest achieved: {membershipHighestMeta.label}</span>
              )}
            </span>
            <span className={`font-bold ${isVerifiedProfile ? 'text-tealbrand-700' : 'text-amber-800'}`}>
              {isVerifiedProfile ? 'Verified helper profile ✓' : 'Verification pending'}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div className="rounded-xl border border-border bg-surface p-3">
              <div className="tabular-nums-mono text-base font-extrabold text-ink-900">{overallPaidJobs}</div>
              <div className="text-[11px] text-ink-500">Total paid jobs</div>
            </div>
            <div className="rounded-xl border border-border bg-surface p-3">
              <div className="tabular-nums-mono text-base font-extrabold text-ink-900 flex items-center gap-1">
                <span>{overallRating > 0 ? overallRating.toFixed(1) : '0.0'}</span>
                <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-500" aria-hidden="true" />
              </div>
              <div className="text-[11px] text-ink-500">{overallRatingCount} rating{overallRatingCount === 1 ? '' : 's'}</div>
            </div>
            <div className="rounded-xl border border-border bg-surface p-3">
              <div className="tabular-nums-mono text-base font-extrabold text-tealbrand-700">
                {Math.round(completionRate * 100)}%
              </div>
              <div className="text-[11px] text-ink-500">Completion rate</div>
            </div>
            <div className="rounded-xl border border-border bg-surface p-3">
              <div className="tabular-nums-mono text-base font-extrabold text-ink-900">
                {Math.round(cancellationRate * 100)}%
              </div>
              <div className="text-[11px] text-ink-500">Cancellation rate</div>
            </div>
          </div>

          <p className="text-xs text-ink-600 leading-relaxed">
            <strong>Completion rate</strong> means: out of every 10 jobs you accept, how many you finish.{' '}
            <strong>Cancellation rate</strong> means: how often a job gets cancelled after you accept — keep cancellations low to move up!
          </p>
        </div>

        {/* All 4 Membership Levels */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          {MEMBERSHIP_LEVELS.map((levelKey) => {
            const rule = liveMembershipConfig[levelKey] || DEFAULT_MEMBERSHIP_CONFIG[levelKey];
            const copy = MEMBERSHIP_GRADE5_EXPLANATIONS[levelKey];
            const isCurrent = currentMembershipLevel === levelKey;
            return (
              <div
                key={levelKey}
                className={`rounded-2xl border p-4 space-y-3 ${
                  isCurrent
                    ? 'border-tealbrand-600/40 bg-tealbrand-50/35'
                    : 'border-border bg-canvas/60'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <MembershipBadge level={levelKey} size="md" />
                  <span className="text-[11px] font-bold text-ink-500 inline-flex items-center gap-1">
                    {isCurrent && <Check className="h-3 w-3 text-tealbrand-700" aria-hidden="true" />}
                    {isCurrent ? 'Your current level' : copy.tagline}
                  </span>
                </div>

                <p className="text-xs sm:text-sm text-ink-700 leading-relaxed">{copy.story}</p>

                <div className="rounded-xl border border-border bg-surface p-3 space-y-1.5 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-ink-500">Total paid jobs</span>
                    <span className="tabular-nums-mono font-extrabold text-ink-900">
                      {rule.minCompletedPaidJobs === 0 ? '0 (start)' : `${rule.minCompletedPaidJobs}+`}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-ink-500">Overall star rating</span>
                    <span className="tabular-nums-mono font-extrabold text-ink-900">
                      {rule.minAverageRating === 0 ? 'Any' : `${Number(rule.minAverageRating).toFixed(1)}★+`}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-ink-500">Total customer ratings</span>
                    <span className="tabular-nums-mono font-extrabold text-ink-900">
                      {rule.minRatingCount === 0 ? '0' : `${rule.minRatingCount}+`}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-ink-500">Finish accepted jobs</span>
                    <span className="tabular-nums-mono font-extrabold text-ink-900">
                      {rule.minCompletionRate > 0 ? `${Math.round(rule.minCompletionRate * 100)}%+` : 'Any'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-ink-500">Keep cancellations at</span>
                    <span className="tabular-nums-mono font-extrabold text-ink-900">
                      {rule.maxCancellationRate !== null && rule.maxCancellationRate !== undefined
                        ? `${Math.round(rule.maxCancellationRate * 100)}% or less`
                        : 'Any'}
                    </span>
                  </div>
                  {rule.requireVerified && (
                    <div className="flex items-center justify-between gap-2 pt-0.5 text-tealbrand-800 font-semibold">
                      <span>Verified helper profile</span>
                      <CheckCircle2 className="h-3.5 w-3.5 text-tealbrand-700" aria-hidden="true" />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
