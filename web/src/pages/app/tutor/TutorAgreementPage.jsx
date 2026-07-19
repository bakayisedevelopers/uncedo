import { useEffect, useMemo, useState } from 'react';
import { Download, FileText, Mail, ShieldCheck } from 'lucide-react';
import PageHeader from '../../../components/ui/PageHeader';
import SectionCard from '../../../components/ui/SectionCard';
import FormField from '../../../components/ui/FormField';
import { useAuth } from '../../../hooks/useAuth';
import { useLiveUserProfile } from '../../../hooks/useLiveUserProfile';
import {
  LEGAL_ENTITY_NAME,
  acceptTutorAgreement,
  emailSignedTutorAgreement,
  formatAgreementDate,
  getTutorAgreementBundle,
} from '../../../services/legalAgreementService';
import { getTutorOnboardingStatus, hasCurrentTutorAgreement } from '../../../utils/onboarding';

function formatTimestamp(value) {
  if (!value) return 'Not available';
  const date = new Date(typeof value?.toMillis === 'function' ? value.toMillis() : value);
  if (Number.isNaN(date.getTime())) return 'Not available';
  return date.toLocaleString();
}

function renderAgreementMarkdown(markdown = '') {
  const lines = String(markdown || '').split('\n');
  const elements = [];
  let listItems = [];
  let paragraph = [];
  let key = 0;

  const flushParagraph = () => {
    if (!paragraph.length) return;
    elements.push(
      <p key={`p-${key++}`} className="mb-3 text-sm leading-6 text-zinc-700">
        {paragraph.join(' ')}
      </p>,
    );
    paragraph = [];
  };

  const flushList = () => {
    if (!listItems.length) return;
    elements.push(
      <ul key={`ul-${key++}`} className="mb-4 list-disc space-y-1 pl-5 text-sm leading-6 text-zinc-700">
        {listItems.map((item, index) => <li key={`li-${key}-${index}`}>{item}</li>)}
      </ul>,
    );
    listItems = [];
  };

  lines.forEach((rawLine) => {
    const line = rawLine.trim();
    if (!line) {
      flushParagraph();
      flushList();
      return;
    }

    if (line.startsWith('# ')) {
      flushParagraph();
      flushList();
      elements.push(<h2 key={`h2-${key++}`} className="mb-3 mt-4 text-xl font-bold text-emerald-700">{line.slice(2).trim()}</h2>);
      return;
    }

    if (line.startsWith('## ')) {
      flushParagraph();
      flushList();
      elements.push(<h3 key={`h3-${key++}`} className="mb-2 mt-4 text-lg font-bold text-emerald-700">{line.slice(3).trim()}</h3>);
      return;
    }

    if (line.startsWith('- ') || line.startsWith('* ')) {
      flushParagraph();
      listItems.push(line.slice(2).trim());
      return;
    }

    flushList();
    paragraph.push(line.replace(/\*\*(.*?)\*\*/g, '$1'));
  });

  flushParagraph();
  flushList();
  return elements;
}

export default function TutorAgreementPage() {
  const { user, setUser } = useAuth();
  const { profile: liveProfile } = useLiveUserProfile(user?.uid);
  const currentUser = liveProfile || user;
  const onboardingStatus = useMemo(() => getTutorOnboardingStatus(currentUser), [currentUser]);
  const [bundle, setBundle] = useState({ activeVersion: null, document: null, versions: [], acceptances: [] });
  const [isLoading, setIsLoading] = useState(true);
  const [checkboxAccepted, setCheckboxAccepted] = useState(false);
  const [typedSignatureName, setTypedSignatureName] = useState(currentUser?.fullName || currentUser?.displayName || '');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isEmailing, setIsEmailing] = useState(false);
  const [emailDestination, setEmailDestination] = useState('');
  const [showEmailForm, setShowEmailForm] = useState(false);

  const activeVersion = bundle.activeVersion || null;
  const acceptances = bundle.acceptances || [];
  const currentAcceptance = acceptances[0] || null;
  const latestAcceptanceId = currentAcceptance?.id || currentUser?.tutorAgreement?.latestAcceptanceId || '';
  const hasSignedPdf = Boolean(currentAcceptance?.pdfUrl || currentUser?.tutorAgreement?.latestAcceptancePdfUrl);
  const agreementAccepted = hasCurrentTutorAgreement(currentUser);
  const hasSignedActiveVersion = Boolean(
    activeVersion?.version
      && (
        currentUser?.tutorAgreement?.acceptedVersion === activeVersion.version
        || currentAcceptance?.version === activeVersion.version
      ),
  );
  const canSubmit = Boolean(
    user?.uid
      && activeVersion
      && checkboxAccepted
      && String(typedSignatureName || '').trim(),
  );

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      try {
        const result = await getTutorAgreementBundle();
        if (cancelled) return;
        setBundle(result);
        if (result?.user) {
          setUser((prev) => ({ ...prev, ...result.user }));
        }
      } catch (error) {
        if (!cancelled) {
          setMessage(error.message || 'Unable to load the Tutor Agreement.');
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [setUser]);

  useEffect(() => {
    setTypedSignatureName(currentUser?.fullName || currentUser?.displayName || currentUser?.email || '');
  }, [currentUser?.displayName, currentUser?.email, currentUser?.fullName]);

  useEffect(() => {
    if (hasSignedActiveVersion) {
      setCheckboxAccepted(true);
    }
  }, [hasSignedActiveVersion]);

  useEffect(() => {
    setEmailDestination(
      currentUser?.email
      || bundle?.user?.email
      || currentAcceptance?.acceptedByEmail
      || '',
    );
  }, [bundle?.user?.email, currentAcceptance?.acceptedByEmail, currentUser?.email]);

  const handleAccept = async () => {
    if (!canSubmit) return;

    setIsSubmitting(true);
    setMessage('');
    try {
      const result = await acceptTutorAgreement({
        checkboxAccepted,
        typedSignatureName,
      });

      if (result?.tutorProfile) {
        setUser((prev) => ({
          ...prev,
          tutorProfile: {
            ...(prev?.tutorProfile || {}),
            ...result.tutorProfile,
          },
          tutorAgreement: {
            ...(prev?.tutorAgreement || {}),
            currentVersionAccepted: true,
            acceptedCurrentVersion: true,
            acceptedVersion: result?.activeVersion?.version || activeVersion?.version,
            currentVersion: result?.activeVersion?.version || activeVersion?.version,
            latestAcceptedVersion: result?.activeVersion?.version || activeVersion?.version,
            latestAcceptanceId: result?.acceptanceId || prev?.tutorAgreement?.latestAcceptanceId,
            latestAcceptancePdfUrl: result?.pdfUrl || prev?.tutorAgreement?.latestAcceptancePdfUrl,
          },
        }));
      }

      setMessage('Tutor Agreement accepted successfully.');
      const refreshed = await getTutorAgreementBundle();
      setBundle(refreshed);
    } catch (error) {
      setMessage(error.message || 'Unable to accept the Tutor Agreement.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEmailSignedAgreement = async () => {
    if (!latestAcceptanceId) {
      setMessage('No signed agreement record was found yet. Please sign the agreement first.');
      return;
    }
    const email = String(emailDestination || '').trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setMessage('Please enter a valid email address.');
      return;
    }

    setIsEmailing(true);
    setMessage('');
    try {
      await emailSignedTutorAgreement({
        acceptanceId: latestAcceptanceId,
        destinationEmail: email,
      });
      setMessage('Signed agreement emailed successfully.');
      const refreshed = await getTutorAgreementBundle();
      setBundle(refreshed);
      setShowEmailForm(false);
    } catch (error) {
      setMessage(error.message || 'We could not email the signed agreement. Please try again or download it manually.');
    } finally {
      setIsEmailing(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tutor Agreement"
        description="Review the current agreement, sign it electronically, and download your accepted PDF."
      />

      {message ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          {message}
        </div>
      ) : null}

      {onboardingStatus?.message && !onboardingStatus.complete ? (
        <div className="rounded-2xl border border-brand/20 bg-emerald-50 p-4 text-sm text-emerald-900">
          {onboardingStatus.message}
        </div>
      ) : null}

      <SectionCard className="overflow-hidden">
        <div className="rounded-[28px] border border-zinc-200 bg-gradient-to-br from-white via-white to-emerald-50/80 p-5 md:p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="flex items-start gap-4">
              <img src="/logo.png" alt="Parakleo" className="h-12 w-12 rounded-2xl object-cover shadow-sm" />
              <div>
                <div className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-700">
                  <ShieldCheck className="mr-1 h-3.5 w-3.5" />
                  Active contract
                </div>
                <h2 className="mt-3 text-2xl font-black tracking-tight text-zinc-900 md:text-3xl">
                  {activeVersion?.title || 'Tutor Agreement'}
                </h2>
                <p className="mt-1 text-sm text-zinc-600">{LEGAL_ENTITY_NAME}</p>
                <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold text-zinc-600">
                  <span className="rounded-full border border-zinc-200 bg-white px-3 py-1">Version {activeVersion?.version || 'Loading...'}</span>
                  <span className="rounded-full border border-zinc-200 bg-white px-3 py-1">Effective {formatAgreementDate(activeVersion?.effectiveDate)}</span>
                  <span className="rounded-full border border-zinc-200 bg-white px-3 py-1">{activeVersion?.status || 'active'}</span>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {hasSignedPdf ? (
                <a
                  href={currentAcceptance?.pdfUrl || currentUser?.tutorAgreement?.latestAcceptancePdfUrl || '#'}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-emerald-200 bg-white px-4 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-50"
                >
                  <Download className="h-4 w-4" />
                  Download signed PDF
                </a>
              ) : null}
              {latestAcceptanceId ? (
                <button
                  type="button"
                  onClick={() => setShowEmailForm((prev) => !prev)}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
                >
                  <Mail className="h-4 w-4" />
                  Email signed agreement
                </button>
              ) : null}
            </div>
          </div>

          <div className="mt-6 rounded-[24px] border border-zinc-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="text-sm font-bold text-zinc-900">Agreement text</h3>
              <span className="text-xs text-zinc-500">Scrollable contract preview</span>
            </div>
            <div className="max-h-[58vh] overflow-y-auto rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
              {isLoading
                ? <p className="text-sm text-zinc-600">Loading agreement...</p>
                : activeVersion?.contentMarkdown
                  ? renderAgreementMarkdown(activeVersion.contentMarkdown)
                  : <p className="text-sm text-zinc-600">No active Tutor Agreement found.</p>}
            </div>
          </div>

          {showEmailForm && latestAcceptanceId ? (
            <div className="mt-4 rounded-2xl border border-zinc-200 bg-white p-4">
              <h3 className="text-sm font-bold text-zinc-900">Email signed agreement</h3>
              <p className="mt-1 text-xs text-zinc-500">Send your existing signed PDF to an email address.</p>
              <div className="mt-3 grid gap-3 md:grid-cols-[1fr_auto]">
                <input
                  type="email"
                  value={emailDestination}
                  onChange={(event) => setEmailDestination(event.target.value)}
                  placeholder="name@example.com"
                  className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleEmailSignedAgreement}
                  disabled={isEmailing}
                  className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {isEmailing ? 'Sending...' : 'Send email'}
                </button>
              </div>
            </div>
          ) : null}

          <div className="mt-6 grid gap-4 lg:grid-cols-[1.4fr_0.9fr]">
            <div className="rounded-[24px] border border-zinc-200 bg-white p-4">
              <h3 className="text-sm font-bold text-zinc-900">Electronic acceptance</h3>
              <p className="mt-1 text-xs text-zinc-500">Checkbox plus typed full legal name constitutes electronic acceptance.</p>
              <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                <input
                  type="checkbox"
                  checked={checkboxAccepted}
                  onChange={(event) => {
                    if (hasSignedActiveVersion) return;
                    setCheckboxAccepted(event.target.checked);
                  }}
                  disabled={hasSignedActiveVersion}
                  className="mt-1 h-4 w-4 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-600"
                />
                <span className="text-sm text-zinc-700">
                  I have read and agree to the Tutor Agreement.
                </span>
              </label>
              <div className="mt-4">
                <FormField
                  label="Typed full legal name"
                  name="typedSignatureName"
                  value={typedSignatureName}
                  onChange={(event) => setTypedSignatureName(event.target.value)}
                  placeholder={currentUser?.fullName || currentUser?.displayName || 'Enter full legal name'}
                />
              </div>

              <button
                type="button"
                onClick={handleAccept}
                disabled={!canSubmit || isSubmitting || isLoading}
                className="mt-4 inline-flex items-center justify-center rounded-2xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSubmitting ? 'Submitting...' : 'Accept and sign'}
              </button>
            </div>

            <div className="space-y-4">
              <div className="rounded-[24px] border border-zinc-200 bg-white p-4">
                <h3 className="text-sm font-bold text-zinc-900">Acceptance status</h3>
                <div className="mt-3 space-y-2 text-sm text-zinc-700">
                  <p><span className="font-semibold">Current version:</span> {currentUser?.tutorAgreement?.acceptedVersion || 'Not accepted yet'}</p>
                  <p><span className="font-semibold">Accepted at:</span> {formatTimestamp(currentUser?.tutorAgreement?.acceptedAt)}</p>
                  <p><span className="font-semibold">Verification gate:</span> {agreementAccepted ? 'Open' : 'Blocked until agreement accepted'}</p>
                  <p><span className="font-semibold">Latest email status:</span> {currentAcceptance?.latestEmailDelivery?.status || 'Not sent yet'}</p>
                </div>
              </div>

              <div className="rounded-[24px] border border-zinc-200 bg-white p-4">
                <h3 className="text-sm font-bold text-zinc-900">Previous accepted versions</h3>
                <div className="mt-3 space-y-3">
                  {acceptances.length ? acceptances.map((acceptance) => (
                    <div key={acceptance.id} className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
                      <p className="text-sm font-semibold text-zinc-900">Version {acceptance.version}</p>
                      <p className="text-xs text-zinc-500">{formatTimestamp(acceptance.acceptedAt)}</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {acceptance.pdfUrl ? (
                          <a href={acceptance.pdfUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-xl border border-emerald-200 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-700">
                            <FileText className="h-3.5 w-3.5" />
                            PDF
                          </a>
                        ) : null}
                      </div>
                    </div>
                  )) : (
                    <p className="text-sm text-zinc-500">No signed versions yet.</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}
