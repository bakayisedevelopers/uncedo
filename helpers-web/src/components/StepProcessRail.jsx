import { AlertCircle, Check, Clock } from 'lucide-react';
import { ONBOARDING_STEPS } from '../utils/onboardingSteps';

export function StepProcessRail({ evaluation, activeStepId, onSelectStep }) {
  const {
    stepStates,
    progressPercent,
    completedTotalSteps,
    totalSteps,
    fullyVerified,
    allHelperStepsSubmitted,
  } = evaluation;

  return (
    <aside className="w-full lg:w-80 shrink-0">
      <div className="bg-surface border border-border rounded-xl overflow-hidden lg:sticky lg:top-20">
        {/* Progress Header inside Deep Forest Anchor */}
        <div className="bg-forest-900 text-white p-5 space-y-3.5">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-tealbrand-500">
              Application Progress
            </span>
            <span className="tabular-nums-mono text-sm font-bold text-white">
              {completedTotalSteps} / {totalSteps}
            </span>
          </div>

          <div className="h-2 w-full bg-white/15 rounded-full overflow-hidden">
            <div
              className="h-full bg-tealbrand-500 transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          <div className="flex items-center justify-between text-xs text-white/80">
            <span>
              <span className="tabular-nums-mono font-semibold text-white">{progressPercent}%</span> complete
            </span>
            <span>
              {fullyVerified
                ? 'Verified partner'
                : allHelperStepsSubmitted
                  ? 'Awaiting review'
                  : 'Saves automatically'}
            </span>
          </div>
        </div>

        {/* Connected Vertical Step Timeline */}
        <nav aria-label="Onboarding Steps" className="p-3 space-y-1">
          {ONBOARDING_STEPS.map((step, index) => {
            const state = stepStates[step.id] || {
              complete: false,
              statusLabel: 'Required',
              tone: 'pending',
            };
            const isCurrent = step.id === activeStepId;
            const isLast = index === ONBOARDING_STEPS.length - 1;

            return (
              <button
                key={step.id}
                type="button"
                onClick={() => onSelectStep(step.id)}
                className={`relative w-full text-left flex items-start gap-3.5 px-3 py-3 rounded-lg transition-colors ${
                  isCurrent
                    ? 'bg-tealbrand-50 text-ink-900 ring-1 ring-inset ring-tealbrand-600/35'
                    : 'bg-transparent hover:bg-well/70 text-ink-700'
                }`}
              >
                {/* Connector vertical line */}
                {!isLast && (
                  <span
                    aria-hidden="true"
                    className={`absolute left-[25px] top-10 bottom-[-6px] w-px ${
                      state.tone === 'done' ? 'bg-tealbrand-600/40' : 'bg-border'
                    }`}
                  />
                )}

                <span className="relative z-10 mt-0.5 shrink-0">
                  {state.tone === 'done' ? (
                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-tealbrand-600 text-white">
                      <Check className="h-4 w-4" strokeWidth={2.5} />
                    </span>
                  ) : state.tone === 'review' ? (
                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-amber-100 text-amber-800 border border-amber-300">
                      <Clock className="h-3.5 w-3.5" />
                    </span>
                  ) : state.tone === 'error' ? (
                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-red-100 text-red-700 border border-red-300">
                      <AlertCircle className="h-3.5 w-3.5" />
                    </span>
                  ) : isCurrent ? (
                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-md border-2 border-tealbrand-600 bg-surface text-tealbrand-700 tabular-nums-mono text-xs font-bold">
                      {step.number}
                    </span>
                  ) : (
                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border bg-well text-ink-500 tabular-nums-mono text-xs font-semibold">
                      {step.number}
                    </span>
                  )}
                </span>

                <span className="min-w-0 flex-1 pt-0.5">
                  <span className={`block text-sm font-semibold leading-tight ${isCurrent ? 'text-ink-900' : 'text-ink-700'}`}>
                    {step.title}
                  </span>
                  <span
                    className={`mt-1 block text-xs ${
                      state.tone === 'done'
                        ? 'text-tealbrand-700 font-medium'
                        : state.tone === 'review'
                          ? 'text-amber-800 font-medium'
                          : state.tone === 'error'
                            ? 'text-red-700 font-medium'
                            : isCurrent
                              ? 'text-tealbrand-700 font-medium'
                              : 'text-ink-400'
                    }`}
                  >
                    {state.statusLabel}
                  </span>
                </span>
              </button>
            );
          })}
        </nav>
      </div>
    </aside>
  );
}
