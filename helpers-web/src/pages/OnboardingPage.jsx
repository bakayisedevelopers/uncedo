import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, CheckCircle2, Home, LogOut, X } from 'lucide-react';
import { BottomNav } from '../components/BottomNav';
import { StepProcessRail } from '../components/StepProcessRail';
import { StepBasics } from '../components/steps/StepBasics';
import { StepProfilePhoto } from '../components/steps/StepProfilePhoto';
import { StepServicesPortfolio } from '../components/steps/StepServicesPortfolio';
import { StepAgreement } from '../components/steps/StepAgreement';
import { StepPoliceClearance } from '../components/steps/StepPoliceClearance';
import { StepPayoutDetails } from '../components/steps/StepPayoutDetails';
import { StepVerificationStatus } from '../components/steps/StepVerificationStatus';
import {
  signOutHelperAccount,
  subscribeToHelperAgreementBundle,
  subscribeToHelperOfferings,
  subscribeToHelperPoliceClearanceReview,
  subscribeToServiceCatalog,
  subscribeToUserProfile,
  syncMyHelperVerificationStatus,
} from '../services/helperDataService';
import {
  ONBOARDING_STEPS,
  evaluateHelperOnboarding,
  mapPathnameToStepId,
} from '../utils/onboardingSteps';

function parseAgreementTokenHash() {
  if (typeof window === 'undefined') return '';
  const rawHash = window.location.hash.replace(/^#/, '');
  if (!rawHash) return '';
  const token = String(new URLSearchParams(rawHash).get('wa_agreement_token') || '').trim();
  if (token) {
    window.history.replaceState(null, '', window.location.pathname);
  }
  return token;
}

export function OnboardingPage({
  user,
  pathname,
  bannerNotice = '',
  onDismissBanner,
  onNavigate,
}) {
  const [agreementToken] = useState(() => parseAgreementTokenHash());
  const [profile, setProfile] = useState(user?.profile || {});
  const [offerings, setOfferings] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [clearanceReview, setClearanceReview] = useState(null);
  const [activeAgreement, setActiveAgreement] = useState(null);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [verificationCheck, setVerificationCheck] = useState(null);
  const [syncingVerification, setSyncingVerification] = useState(false);

  const requestedRouteStep = mapPathnameToStepId(pathname);
  const [activeStepId, setActiveStepId] = useState(requestedRouteStep || 'basics');
  const initializedStepRef = useRef(Boolean(requestedRouteStep));
  const autoSyncedVerificationRef = useRef(false);

  useEffect(() => {
    if (requestedRouteStep) {
      setActiveStepId(requestedRouteStep);
      initializedStepRef.current = true;
    }
  }, [requestedRouteStep]);

  useEffect(() => {
    const unsubProfile = subscribeToUserProfile(user.uid, (nextProfile) => {
      if (nextProfile) setProfile(nextProfile);
    });
    const unsubOfferings = subscribeToHelperOfferings(user.uid, setOfferings);
    const unsubCatalog = subscribeToServiceCatalog(setCatalog);
    const unsubClearance = subscribeToHelperPoliceClearanceReview(user.uid, (reviewData) => {
      if (reviewData) setClearanceReview(reviewData);
      setLoadingInitial(false);
    });
    const unsubAgreement = subscribeToHelperAgreementBundle(user.uid, (agreementData) => {
      if (agreementData?.activeVersion) setActiveAgreement(agreementData.activeVersion);
      if (agreementData?.loaded) setLoadingInitial(false);
    });

    return () => {
      unsubProfile?.();
      unsubOfferings?.();
      unsubCatalog?.();
      unsubClearance?.();
      unsubAgreement?.();
    };
  }, [user.uid]);

  const evaluation = useMemo(
    () =>
      evaluateHelperOnboarding({
        profile,
        offerings,
        catalog,
        clearanceReview,
        activeAgreement,
      }),
    [activeAgreement, catalog, clearanceReview, offerings, profile],
  );

  useEffect(() => {
    if (!loadingInitial && !initializedStepRef.current) {
      initializedStepRef.current = true;
      setActiveStepId(evaluation.recommendedStepId || 'basics');
    }
  }, [evaluation.recommendedStepId, loadingInitial]);

  const handleRefreshVerification = useCallback(async () => {
    setSyncingVerification(true);
    try {
      const res = await syncMyHelperVerificationStatus();
      setVerificationCheck(res);
    } catch (_) {
      // keep existing UI state
    } finally {
      setSyncingVerification(false);
    }
  }, []);

  const readyForAutoActivationCheck = Boolean(
    !loadingInitial
      && evaluation.allHelperStepsSubmitted
      && evaluation.approvedOffering
      && (!evaluation.clearanceRequired || evaluation.clearanceStatus === 'approved')
      && evaluation.stepStates?.payout?.complete
      && !evaluation.accountVerified,
  );

  useEffect(() => {
    if (readyForAutoActivationCheck && !autoSyncedVerificationRef.current) {
      autoSyncedVerificationRef.current = true;
      handleRefreshVerification();
    }
  }, [handleRefreshVerification, readyForAutoActivationCheck]);

  const activeIndex = Math.max(
    0,
    ONBOARDING_STEPS.findIndex((s) => s.id === activeStepId),
  );
  const activeStep = ONBOARDING_STEPS[activeIndex] || ONBOARDING_STEPS[0];

  const handleSelectStep = useCallback((stepId) => {
    setActiveStepId(stepId);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const handleNext = useCallback(() => {
    const next = ONBOARDING_STEPS[activeIndex + 1];
    if (next) handleSelectStep(next.id);
  }, [activeIndex, handleSelectStep]);

  const handlePrev = useCallback(() => {
    const prev = ONBOARDING_STEPS[activeIndex - 1];
    if (prev) handleSelectStep(prev.id);
  }, [activeIndex, handleSelectStep]);

  const handleSignOut = async () => {
    await signOutHelperAccount();
    onNavigate('/sign-in');
  };

  return (
    <div className="min-h-screen flex flex-col bg-canvas">
      {/* 3-Zone Top Bar Contract */}
      <header className="sticky top-0 z-20 border-b border-border bg-surface/95 backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 sm:px-8 h-14 md:h-16 flex items-center justify-between gap-4">
          <a
            href="/home"
            onClick={(e) => {
              e.preventDefault();
              onNavigate('/home');
            }}
            className="flex items-center gap-2.5 font-display font-bold text-base sm:text-lg tracking-tight text-ink-900 whitespace-nowrap shrink-0"
          >
            <img
              src="/helpers-logo-192.png"
              alt="Uncedo Helpers"
              referrerPolicy="no-referrer"
              className="h-8 w-8 rounded-lg border border-border object-cover bg-white shrink-0"
            />
            <span>Uncedo Helpers</span>
          </a>

          <div className="hidden md:flex items-center gap-2 text-xs text-ink-500 whitespace-nowrap truncate">
            <span>Partner Onboarding</span>
            <span aria-hidden="true">/</span>
            <span className="tabular-nums-mono font-semibold text-ink-900">
              {activeStep.number}.
            </span>
            <span className="font-medium text-ink-900">{activeStep.title}</span>
            <span aria-hidden="true">·</span>
            <span>{profile?.fullName || user.displayName || user.email}</span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => onNavigate('/home')}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border bg-white hover:bg-well text-xs font-semibold text-ink-800 whitespace-nowrap"
            >
              <Home className="h-3.5 w-3.5 text-tealbrand-700" />
              <span className="hidden sm:inline">App Home</span>
              <span className="sm:hidden">Home</span>
            </button>
            <button
              type="button"
              onClick={handleSignOut}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border bg-white hover:bg-well text-xs font-semibold text-ink-700 whitespace-nowrap"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Sign Out</span>
            </button>
          </div>
        </div>

        {/* Mobile compact step strip */}
        <div className="lg:hidden border-t border-border bg-well/50 px-4 py-2 overflow-x-auto">
          <div className="flex items-center gap-2 min-w-max">
            {ONBOARDING_STEPS.map((step) => {
              const state = evaluation.stepStates[step.id];
              const isCurrent = step.id === activeStep.id;
              return (
                <button
                  key={step.id}
                  type="button"
                  onClick={() => handleSelectStep(step.id)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-xs font-medium whitespace-nowrap shrink-0 ${
                    isCurrent
                      ? 'border-tealbrand-600 bg-surface text-ink-900'
                      : state?.complete
                        ? 'border-tealbrand-600/30 bg-tealbrand-50 text-tealbrand-700'
                        : 'border-border bg-surface text-ink-500'
                  }`}
                >
                  <span className="tabular-nums-mono text-[11px] font-semibold">{step.number}</span>
                  <span>{step.shortTitle}</span>
                </button>
              );
            })}
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-8 pt-6 pb-24 md:py-10 space-y-6">
        {bannerNotice && (
          <div className="rounded-xl border border-tealbrand-600/30 bg-tealbrand-50 px-5 py-3.5 flex items-center justify-between gap-3 text-sm text-tealbrand-700">
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="h-5 w-5 shrink-0" />
              <span className="font-medium">{bannerNotice}</span>
            </div>
            <button
              type="button"
              onClick={() => onDismissBanner?.()}
              className="text-tealbrand-700 hover:text-ink-900 p-1"
              aria-label="Dismiss notice"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        <div className="flex flex-col lg:flex-row gap-8 items-start">
          <StepProcessRail
            evaluation={evaluation}
            activeStepId={activeStep.id}
            onSelectStep={handleSelectStep}
          />

          <section className="flex-1 min-w-0 w-full bg-surface border border-border rounded-xl p-6 sm:p-10 space-y-8">
            <div className="flex flex-wrap items-start justify-between gap-4 pb-6 border-b border-border">
              <div className="space-y-1.5">
                <div className="tabular-nums-mono text-xs font-semibold uppercase tracking-[0.12em] text-tealbrand-700">
                  Step {activeStep.number} of 0{ONBOARDING_STEPS.length}
                </div>
                <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-ink-900">
                  {activeStep.title}
                </h1>
                <p className="text-sm sm:text-base text-ink-500 max-w-2xl">{activeStep.summary}</p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handlePrev}
                  disabled={activeIndex === 0}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-border bg-white hover:bg-well text-xs font-semibold text-ink-700 disabled:opacity-35 whitespace-nowrap shrink-0"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Previous
                </button>
                <button
                  type="button"
                  onClick={handleNext}
                  disabled={activeIndex === ONBOARDING_STEPS.length - 1}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-border bg-white hover:bg-well text-xs font-semibold text-ink-700 disabled:opacity-35 whitespace-nowrap shrink-0"
                >
                  Next
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {activeStep.id === 'basics' && (
              <StepBasics user={user} profile={profile} onCompleteNext={handleNext} />
            )}
            {activeStep.id === 'photo' && (
              <StepProfilePhoto user={user} profile={profile} onCompleteNext={handleNext} />
            )}
            {activeStep.id === 'services' && (
              <StepServicesPortfolio
                user={user}
                catalog={catalog}
                offerings={offerings}
                onCompleteNext={handleNext}
              />
            )}
            {activeStep.id === 'agreement' && (
              <StepAgreement
                user={user}
                profile={profile}
                whatsappAgreementToken={agreementToken}
                onAgreementLoaded={setActiveAgreement}
                onCompleteNext={handleNext}
              />
            )}
            {activeStep.id === 'clearance' && (
              <StepPoliceClearance
                profile={profile}
                onReviewLoaded={setClearanceReview}
                onCompleteNext={handleNext}
              />
            )}
            {activeStep.id === 'payout' && (
              <StepPayoutDetails profile={profile} onCompleteNext={handleNext} />
            )}
            {activeStep.id === 'review' && (
              <StepVerificationStatus
                evaluation={evaluation}
                verificationCheck={verificationCheck}
                syncingVerification={syncingVerification}
                onRefreshVerification={handleRefreshVerification}
                onJumpStep={handleSelectStep}
              />
            )}
          </section>
        </div>
      </main>

      <BottomNav
        pathname={pathname}
        onNavigate={onNavigate}
        showOnboardingBadge={!evaluation.fullyVerified}
      />
    </div>
  );
}
