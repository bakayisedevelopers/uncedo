import { Award, BadgeCheck, Check, Crown, Medal, ShieldCheck } from 'lucide-react';
import {
  buildMasteryProgressModel,
  DEFAULT_MASTERY_CONFIG,
  getMasteryMeta,
  getMembershipMeta,
} from '../../utils/masteryModel';

const TONE_CLASSES = {
  neutral: {
    container: 'border-slate-300 bg-slate-100 text-slate-700',
    icon: 'text-slate-600',
  },
  sky: {
    container: 'border-sky-300 bg-sky-50 text-sky-800',
    icon: 'text-sky-700',
  },
  teal: {
    container: 'border-tealbrand-600/30 bg-tealbrand-50 text-tealbrand-800',
    icon: 'text-tealbrand-700',
  },
  indigo: {
    container: 'border-indigo-300 bg-indigo-50 text-indigo-800',
    icon: 'text-indigo-700',
  },
  amber: {
    container: 'border-amber-300 bg-amber-50 text-amber-900',
    icon: 'text-amber-700',
  },
};

function resolveBadgeIcon(level) {
  switch (String(level || '').toLowerCase()) {
    case 'legend':
    case 'family':
      return Crown;
    case 'master':
    case 'friend':
      return Medal;
    case 'specialist':
    case 'partner':
      return Award;
    case 'verified':
      return BadgeCheck;
    default:
      return ShieldCheck;
  }
}

export function MasteryBadge({ level = 'beginner', size = 'sm', className = '' }) {
  const meta = getMasteryMeta(level);
  const tone = TONE_CLASSES[meta.tone] || TONE_CLASSES.neutral;
  const Icon = resolveBadgeIcon(meta.level);
  const sizing = size === 'md'
    ? 'px-2.5 py-1 text-xs gap-1.5 rounded-lg'
    : 'px-2 py-0.5 text-[11px] gap-1 rounded-md';

  return (
    <span
      className={`inline-flex items-center border font-semibold whitespace-nowrap shrink-0 ${sizing} ${tone.container} ${className}`}
      title={meta.description}
    >
      <Icon className={`${size === 'md' ? 'h-3.5 w-3.5' : 'h-3 w-3'} shrink-0 ${tone.icon}`} aria-hidden="true" />
      <span>{meta.label}</span>
    </span>
  );
}

export function MembershipBadge({ level = 'neighbour', size = 'sm', className = '' }) {
  const meta = getMembershipMeta(level);
  const tone = TONE_CLASSES[meta.tone] || TONE_CLASSES.neutral;
  const Icon = resolveBadgeIcon(meta.level);
  const sizing = size === 'md'
    ? 'px-2.5 py-1 text-xs gap-1.5 rounded-lg'
    : 'px-2 py-0.5 text-[11px] gap-1 rounded-md';

  return (
    <span
      className={`inline-flex items-center border font-semibold whitespace-nowrap shrink-0 ${sizing} ${tone.container} ${className}`}
      title={meta.description}
    >
      <Icon className={`${size === 'md' ? 'h-3.5 w-3.5' : 'h-3 w-3'} shrink-0 ${tone.icon}`} aria-hidden="true" />
      <span>{meta.label}</span>
    </span>
  );
}

export function MasteryProgressPanel({ mastery, masteryConfig = DEFAULT_MASTERY_CONFIG }) {
  const progress = buildMasteryProgressModel({ mastery, masteryConfig });
  const ratingText = mastery?.averageRating > 0
    ? `${Number(mastery.averageRating).toFixed(1)}★ (${mastery.ratingCount || 0})`
    : 'No ratings yet';

  return (
    <div className="border-t border-border/70 pt-3 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <MasteryBadge level={mastery?.level} size="md" />
          <span className="text-xs text-ink-500">
            Highest achieved: <strong className="font-semibold text-ink-800">{mastery?.highestMeta?.label || 'Beginner'}</strong>
          </span>
        </div>
        <div className="text-xs text-ink-600 flex items-center gap-2 tabular-nums-mono">
          <span>{mastery?.eligibleCompletedJobCount || 0} paid jobs</span>
          <span className="text-ink-300" aria-hidden="true">·</span>
          <span>{ratingText}</span>
        </div>
      </div>

      {progress.nextLevel ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="font-semibold text-ink-800">
              Progress to {progress.nextMeta?.label}
            </span>
            <span className="tabular-nums-mono text-ink-500">
              {Math.round(progress.overallProgress * 100)}%
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            {progress.requirements.map((req) => (
              <div key={req.label} className="space-y-1">
                <div className="flex items-center justify-between gap-1.5 text-[11px]">
                  <span className="text-ink-600 truncate">{req.label}</span>
                  <span className={`tabular-nums-mono font-semibold shrink-0 inline-flex items-center gap-1 ${req.met ? 'text-tealbrand-700' : 'text-ink-800'}`}>
                    {req.met && <Check className="h-3 w-3" aria-hidden="true" />}
                    {req.current} / {req.target}
                  </span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-well overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-200 ${req.met ? 'bg-tealbrand-600' : 'bg-ink-400'}`}
                    style={{ width: `${Math.round(req.progress * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-xs text-tealbrand-800 font-medium">
          Top Legend experience tier reached for this service option.
        </p>
      )}

      <p className="text-[11px] text-ink-500 leading-relaxed">
        Uncedo service experience level for this specific option only. It is not a statutory or trade certification.
      </p>
    </div>
  );
}
