import { ArrowRight, CheckCircle2, Clock, MessageSquare, RefreshCw, ShieldCheck } from 'lucide-react';
import { WHATSAPP_CHAT_URL } from '../../services/helperDataService';

export function StepVerificationStatus({
  evaluation,
  verificationCheck = null,
  syncingVerification = false,
  onRefreshVerification,
  onJumpStep,
}) {
  const {
    stepStates,
    approvedOffering,
    clearanceRequired,
    clearanceStatus,
    accountVerified,
    fullyVerified,
    allHelperStepsSubmitted,
  } = evaluation;

  const missingWhatsappLinkOnly = Boolean(
    !accountVerified
      && verificationCheck
      && verificationCheck.verified === false
      && verificationCheck.whatsappVerified === false,
  );

  const checklist = [
    {
      stepId: 'basics',
      label: 'Profile basics & WhatsApp number',
      done: stepStates.basics.complete,
      actionLabel: 'Complete Basics',
      detail: stepStates.basics.complete ? 'Saved' : 'Add full name, address, and WhatsApp number',
    },
    {
      stepId: 'photo',
      label: 'Profile selfie photo',
      done: stepStates.photo.complete,
      actionLabel: 'Upload Selfie',
      detail: stepStates.photo.complete ? 'Uploaded' : 'Upload a clear headshot photo',
    },
    {
      stepId: 'services',
      label: 'Service selection & admin approval',
      done: approvedOffering,
      pendingReview: !approvedOffering && stepStates.services.complete,
      actionLabel: stepStates.services.complete ? 'View Services' : 'Add Service',
      detail: approvedOffering
        ? 'Approved service active'
        : stepStates.services.complete
          ? 'Work photos submitted — awaiting Uncedo admin approval'
          : 'Select a service and upload portfolio photos',
    },
    {
      stepId: 'agreement',
      label: 'Uncedo Helper Agreement',
      done: stepStates.agreement.complete,
      actionLabel: 'Sign Agreement',
      detail: stepStates.agreement.complete ? 'Signed current version' : 'Read and sign electronically',
    },
    ...(clearanceRequired
      ? [
          {
            stepId: 'clearance',
            label: 'Police clearance verification',
            done: clearanceStatus === 'approved',
            pendingReview: clearanceStatus === 'pending' || clearanceStatus === 'uploading',
            actionLabel: clearanceStatus === 'pending' ? 'View Upload' : 'Upload Clearance',
            detail:
              clearanceStatus === 'approved'
                ? 'Approved'
                : clearanceStatus === 'pending' || clearanceStatus === 'uploading'
                  ? 'Document submitted — awaiting Uncedo admin review'
                  : 'Upload your valid police-clearance certificate',
          },
        ]
      : []),
    {
      stepId: 'payout',
      label: 'South African bank payout account',
      done: stepStates.payout.complete,
      actionLabel: 'Verify Bank',
      detail: stepStates.payout.complete ? 'Verified recipient linked' : 'Verify your bank account via Paystack',
    },
    {
      stepId: null,
      label: 'Final Uncedo account activation',
      done: accountVerified,
      pendingReview: !accountVerified && allHelperStepsSubmitted,
      actionLabel: '',
      detail: accountVerified
        ? 'Account verified and active'
        : missingWhatsappLinkOnly
          ? 'Open Uncedo on WhatsApp from your registered number once to link your chat and activate your account'
          : 'Uncedo Trust & Safety activates your account once all reviews are complete',
    },
  ];

  return (
    <div className="space-y-7">
      {fullyVerified ? (
        <div className="rounded-xl bg-forest-900 text-white p-6 sm:p-7 space-y-4">
          <div className="flex items-start gap-4">
            <div className="h-11 w-11 rounded-lg bg-tealbrand-600 text-white flex items-center justify-center shrink-0">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div className="space-y-1.5">
              <div className="text-xs font-semibold uppercase tracking-[0.12em] text-tealbrand-500">
                Active Uncedo Partner
              </div>
              <h3 className="font-display text-lg font-bold text-white">
                Your helper profile is verified and ready for jobs
              </h3>
              <p className="text-sm text-white/80 leading-relaxed max-w-2xl">
                Whenever you are ready to receive nearby customer requests, open your Uncedo WhatsApp chat and reply with <span className="tabular-nums-mono font-semibold text-white">online</span> to start your shift.
              </p>
            </div>
          </div>

          <div className="pt-1 flex flex-wrap gap-3">
            <a
              href={WHATSAPP_CHAT_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-tealbrand-600 hover:bg-tealbrand-500 text-sm font-semibold text-white"
            >
              <MessageSquare className="h-4 w-4" />
              Open Uncedo WhatsApp &amp; Go Online
            </a>
          </div>
        </div>
      ) : allHelperStepsSubmitted ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50/75 p-6 flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="h-11 w-11 rounded-lg bg-amber-100 border border-amber-300 text-amber-800 flex items-center justify-center shrink-0">
              <Clock className="h-5 w-5" />
            </div>
            <div className="space-y-1">
              <h3 className="font-display text-base font-bold text-ink-900">
                {missingWhatsappLinkOnly
                  ? 'Almost done — link your WhatsApp chat'
                  : 'All required items submitted — under admin review'}
              </h3>
              <p className="text-sm text-ink-700 leading-relaxed">
                {missingWhatsappLinkOnly
                  ? 'All documents and approvals are complete. Send a quick message from your registered phone number in WhatsApp to finish linking your chat.'
                  : 'Thank you for completing your helper profile. Our team reviews service photos, police clearance, and activates eligible accounts within 1–2 business days. You will be notified on WhatsApp as soon as you can go online.'}
              </p>
            </div>
          </div>

          {onRefreshVerification && (
            <button
              type="button"
              onClick={onRefreshVerification}
              disabled={syncingVerification}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-amber-300 bg-white hover:bg-amber-50 text-xs font-semibold text-amber-900 shrink-0 self-start disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${syncingVerification ? 'animate-spin' : ''}`} />
              {syncingVerification ? 'Checking…' : 'Check Activation'}
            </button>
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-well/60 p-5 sm:p-6">
          <h3 className="text-sm font-semibold text-ink-900">
            Complete the remaining steps below
          </h3>
          <p className="text-xs sm:text-sm text-ink-500 mt-1">
            Every requirement marked pending must be completed before your account can be verified to receive customer jobs.
          </p>
        </div>
      )}

      <div className="divide-y divide-border rounded-xl border border-border bg-surface">
        {checklist.map((item) => (
          <div key={item.label} className="p-4 sm:px-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3.5">
              <span className="mt-0.5 shrink-0">
                {item.done ? (
                  <CheckCircle2 className="h-5 w-5 text-tealbrand-600" />
                ) : item.pendingReview ? (
                  <Clock className="h-5 w-5 text-amber-700" />
                ) : (
                  <span className="inline-block h-5 w-5 rounded-md border border-border bg-well" />
                )}
              </span>
              <div>
                <div className="text-sm font-semibold text-ink-900">{item.label}</div>
                <div
                  className={`text-xs mt-0.5 ${
                    item.done
                      ? 'text-tealbrand-700 font-medium'
                      : item.pendingReview
                        ? 'text-amber-800 font-medium'
                        : 'text-ink-500'
                  }`}
                >
                  {item.detail}
                </div>
              </div>
            </div>

            {!item.done && item.stepId && (
              <button
                type="button"
                onClick={() => onJumpStep?.(item.stepId)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-border bg-surface hover:bg-well text-xs font-semibold text-ink-900 self-start sm:self-center shrink-0"
              >
                {item.actionLabel}
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
