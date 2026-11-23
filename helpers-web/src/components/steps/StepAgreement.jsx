import { useEffect, useState } from 'react';
import { Check, CheckCircle2, ExternalLink, FileText } from 'lucide-react';
import {
  acceptHelperAgreement,
  acceptWhatsAppHelperAgreement,
  getHelperAgreementBundle,
  getWhatsAppHelperAgreementSession,
  subscribeToHelperAgreementBundle,
} from '../../services/helperDataService';

function cleanInlineMarkdown(line = '') {
  return String(line || '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .trim();
}

function formatDate(val) {
  if (!val) return 'Not specified';
  const parsed = typeof val?.toDate === 'function' ? val.toDate() : new Date(val);
  return Number.isNaN(parsed.getTime()) ? String(val) : parsed.toLocaleDateString();
}

export function StepAgreement({ user, profile, whatsappAgreementToken = '', onAgreementLoaded, onCompleteNext }) {
  const [loading, setLoading] = useState(true);
  const [bundle, setBundle] = useState({ activeVersion: null, acceptances: [] });
  const [checkboxAccepted, setCheckboxAccepted] = useState(false);
  const [typedSignatureName, setTypedSignatureName] = useState(profile?.fullName || user?.displayName || '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    setTypedSignatureName((prev) => prev || profile?.fullName || user?.displayName || '');
  }, [profile?.fullName, user?.displayName]);

  useEffect(() => {
    let active = true;
    if (whatsappAgreementToken) {
      const load = async () => {
        setLoading(true);
        setError('');
        try {
          const session = await getWhatsAppHelperAgreementSession(whatsappAgreementToken);
          if (!active) return;
          setBundle({
            activeVersion: session?.activeVersion || null,
            acceptances: [],
            whatsappAccepted: session?.accepted === true,
          });
          onAgreementLoaded?.(session?.activeVersion || null);
          if (session?.accepted === true) setCheckboxAccepted(true);
        } catch (err) {
          if (active) setError(err?.message || 'Unable to load Helper Agreement.');
        } finally {
          if (active) setLoading(false);
        }
      };
      load();
      return () => { active = false; };
    }

    setLoading(true);
    setError('');
    const unsub = subscribeToHelperAgreementBundle(
      user.uid,
      (data) => {
        if (!active || !data) return;
        setBundle(data);
        onAgreementLoaded?.(data?.activeVersion || null);
        if (data?.loaded || data?.activeVersion) setLoading(false);
      },
      (err) => {
        if (active) {
          setError(err?.message || 'Unable to load Helper Agreement.');
          setLoading(false);
        }
      },
    );
    return () => {
      active = false;
      unsub?.();
    };
  }, [onAgreementLoaded, user.uid, whatsappAgreementToken]);

  const activeVersion = bundle?.activeVersion || null;
  const latestAcceptance = bundle?.acceptances?.[0] || null;
  const isSignedCurrent = Boolean(
    activeVersion?.version
      && (bundle?.whatsappAccepted === true
        || profile?.agreement?.acceptedVersion === activeVersion.version
        || latestAcceptance?.version === activeVersion.version),
  );
  const signedPdfUrl = String(latestAcceptance?.pdfUrl || profile?.agreement?.latestAcceptancePdfUrl || '').trim();

  const handleSign = async (e) => {
    e.preventDefault();
    if (!checkboxAccepted) {
      setError('Confirm the checkbox acknowledging that you agree to the Helper Agreement.');
      return;
    }
    if (String(typedSignatureName || '').trim().length < 2) {
      setError('Type your full legal name to sign the Helper Agreement.');
      return;
    }

    setSubmitting(true);
    setError('');
    setNotice('');
    try {
      if (whatsappAgreementToken) {
        await acceptWhatsAppHelperAgreement({
          token: whatsappAgreementToken,
          typedSignatureName,
          expectedVersion: activeVersion?.version,
        });
      } else {
        await acceptHelperAgreement({
          typedSignatureName,
          expectedVersion: activeVersion?.version,
        });
      }
      const refreshed = await getHelperAgreementBundle(user.uid).catch(() => null);
      if (refreshed) setBundle(refreshed);
      setNotice('Helper Agreement signed and recorded.');
    } catch (err) {
      setError(err?.message || 'Could not record agreement acceptance.');
    } finally {
      setSubmitting(false);
    }
  };

  const renderMarkdownLines = (markdown = '') =>
    String(markdown || '')
      .split('\n')
      .map((line, index) => {
        const trimmed = line.trim();
        if (!trimmed) return <div key={`gap-${index}`} className="h-2.5" />;
        if (trimmed.startsWith('# ')) {
          return (
            <h4 key={`h1-${index}`} className="text-base font-bold text-ink-900 pt-2">
              {cleanInlineMarkdown(trimmed.slice(2))}
            </h4>
          );
        }
        if (trimmed.startsWith('## ')) {
          return (
            <h5 key={`h2-${index}`} className="text-sm font-bold text-ink-900 pt-2">
              {cleanInlineMarkdown(trimmed.slice(3))}
            </h5>
          );
        }
        if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
          return (
            <div key={`li-${index}`} className="flex items-start gap-2 text-sm text-ink-700 leading-relaxed pl-1">
              <span className="text-tealbrand-700 font-bold">·</span>
              <span>{cleanInlineMarkdown(trimmed.slice(2))}</span>
            </div>
          );
        }
        return (
          <p key={`p-${index}`} className="text-sm text-ink-700 leading-relaxed">
            {cleanInlineMarkdown(trimmed)}
          </p>
        );
      });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-b border-border bg-well/40 px-4 py-3 text-xs sm:text-sm">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-ink-700">
          <span>
            Agreement <span className="tabular-nums-mono font-semibold text-ink-900">v{activeVersion?.version || '—'}</span>
          </span>
          <span className="text-ink-400">·</span>
          <span>Effective {formatDate(activeVersion?.effectiveDate)}</span>
          <span className="text-ink-400">·</span>
          <span className={isSignedCurrent ? 'text-tealbrand-700 font-semibold' : 'text-amber-800 font-semibold'}>
            {isSignedCurrent ? 'Signed' : 'Signature required'}
          </span>
        </div>

        {signedPdfUrl && (
          <a
            href={signedPdfUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-tealbrand-700 hover:underline"
          >
            <FileText className="h-3.5 w-3.5" />
            Download Signed PDF
            <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>

      <div className="rounded-xl border border-border bg-canvas/60 p-5 sm:p-6 max-h-80 overflow-y-auto space-y-2.5">
        {loading ? (
          <p className="text-sm text-ink-500">Loading active Helper Agreement…</p>
        ) : activeVersion?.contentMarkdown ? (
          renderMarkdownLines(activeVersion.contentMarkdown)
        ) : (
          <p className="text-sm text-ink-500">No active Helper Agreement found.</p>
        )}
      </div>

      {!isSignedCurrent ? (
        <form onSubmit={handleSign} className="rounded-xl border border-border bg-well/50 p-5 sm:p-6 space-y-4">
          <button
            type="button"
            onClick={() => setCheckboxAccepted((v) => !v)}
            className="w-full text-left flex items-start gap-3"
          >
            <span
              className={`mt-0.5 h-5 w-5 rounded border flex items-center justify-center shrink-0 transition-colors ${
                checkboxAccepted ? 'bg-tealbrand-600 border-tealbrand-600 text-white' : 'bg-surface border-border'
              }`}
            >
              {checkboxAccepted && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
            </span>
            <span className="text-sm text-ink-900 font-medium leading-relaxed">
              I have read and agree to the Uncedo Helper Agreement (version {activeVersion?.version || 'current'}).
            </span>
          </button>

          <div>
            <label htmlFor="typedSignatureName" className="block text-sm font-medium text-ink-900 mb-1.5">
              Type your full legal name as your electronic signature
            </label>
            <input
              id="typedSignatureName"
              type="text"
              value={typedSignatureName}
              onChange={(e) => setTypedSignatureName(e.target.value)}
              placeholder="Your full legal name"
              className="w-full rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm text-ink-900 focus:border-tealbrand-600 focus:outline-none focus:ring-2 focus:ring-tealbrand-600/15"
              required
            />
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={submitting || loading || !activeVersion}
              className="px-5 py-2.5 rounded-lg bg-tealbrand-600 hover:bg-tealbrand-700 text-sm font-semibold text-white disabled:opacity-50"
            >
              {submitting ? 'Signing…' : 'Accept & Sign Agreement'}
            </button>
          </div>
        </form>
      ) : (
        <div className="rounded-xl border border-tealbrand-600/30 bg-tealbrand-50 px-5 py-4 text-sm text-tealbrand-700 flex items-center gap-2.5 font-medium">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          Current Helper Agreement (v{activeVersion?.version}) accepted and recorded on your profile.
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}
      {notice && (
        <div className="rounded-lg border border-tealbrand-600/30 bg-tealbrand-50 px-4 py-3 text-sm text-tealbrand-700">
          {notice}
        </div>
      )}

      <div className="pt-4 flex items-center justify-end border-t border-border">
        <button
          type="button"
          onClick={() => onCompleteNext?.()}
          disabled={!isSignedCurrent || submitting}
          className="px-5 py-2.5 rounded-lg bg-tealbrand-600 hover:bg-tealbrand-700 text-sm font-semibold text-white disabled:opacity-40"
        >
          Continue to Police Clearance
        </button>
      </div>
    </div>
  );
}
