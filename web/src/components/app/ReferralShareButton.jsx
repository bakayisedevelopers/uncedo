import { useMemo, useRef, useState } from 'react';
import { Check, Copy, Share2 } from 'lucide-react';

function buildReferralLink(referralSlug) {
  const safeSlug = String(referralSlug || '').trim();
  if (!safeSlug || typeof window === 'undefined') return '';
  return `${window.location.origin}/signup?ref=${encodeURIComponent(safeSlug)}`;
}

function buildReferralPreview(referralLink, maxLength = 42) {
  const normalizedLink = String(referralLink || '').trim();
  if (!normalizedLink) return '';
  if (normalizedLink.length <= maxLength) return normalizedLink;
  return `${normalizedLink.slice(0, maxLength)}...`;
}

export default function ReferralShareButton({
  referralSlug,
  className = '',
  variant = 'card',
  showIntro = true,
  freeMinutesRemaining = null,
}) {
  const [feedback, setFeedback] = useState('');
  const feedbackTimerRef = useRef(null);
  const referralLink = useMemo(() => buildReferralLink(referralSlug), [referralSlug]);
  const referralPreview = useMemo(() => buildReferralPreview(referralLink), [referralLink]);

  if (!referralLink) return null;

  const shareData = {
    title: 'Join Parakleo',
    text: 'Use my Parakleo referral link to sign up and start learning.',
    url: referralLink,
  };

  const updateFeedback = (message) => {
    setFeedback(message);
    window.clearTimeout(feedbackTimerRef.current);
    feedbackTimerRef.current = window.setTimeout(() => setFeedback(''), 2200);
  };

  const handleShare = async () => {
    try {
      if (navigator.share) {
        await navigator.share(shareData);
        updateFeedback('Link shared.');
        return;
      }

      await navigator.clipboard.writeText(referralLink);
      updateFeedback('Link copied.');
    } catch (error) {
      if (error?.name === 'AbortError') return;

      try {
        await navigator.clipboard.writeText(referralLink);
        updateFeedback('Link copied.');
      } catch {
        updateFeedback('Unable to share link.');
      }
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(referralLink);
      updateFeedback('Link copied.');
    } catch {
      updateFeedback('Unable to copy link.');
    }
  };

  if (variant === 'icon') {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <button
          type="button"
          onClick={handleShare}
          className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-emerald-200 bg-emerald-50 text-emerald-700 transition hover:bg-emerald-100"
          aria-label="Share referral link"
          title="Share referral link"
        >
          <Share2 className="h-4 w-4" />
        </button>
        {feedback ? <span className="text-xs font-semibold text-emerald-700">{feedback}</span> : null}
      </div>
    );
  }

  return (
    <div className={`rounded-[1.5rem] border border-emerald-200 bg-emerald-50/80 p-4 ${className}`}>
      {showIntro ? (
        <p className="text-sm font-bold leading-6 text-zinc-900">
          Get free 15 minutes when a student joins and completes their profile using your link.
        </p>
      ) : null}
      <div className={`${showIntro ? 'mt-3' : ''} rounded-2xl border border-emerald-200/70 bg-white/80 p-3`}>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">Referral link</p>
        <p className="mt-2 break-all text-sm font-medium text-zinc-700">{referralPreview}</p>
        <p className="mt-1 break-all text-xs text-zinc-500">{referralLink}</p>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-zinc-200 bg-white px-4 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50"
        >
          {feedback === 'Link copied.' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          Copy
        </button>
        <button
          type="button"
          onClick={handleShare}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-brand px-4 text-sm font-semibold text-white transition hover:bg-brand-dark"
        >
          <Share2 className="h-4 w-4" />
          Share
        </button>
      </div>
      {feedback ? (
        <p className="mt-2 text-xs font-semibold text-emerald-700">{feedback}</p>
      ) : null}
      {typeof freeMinutesRemaining === 'number' ? (
        <p className="mt-2 text-sm text-zinc-900">
          <span className="font-semibold">Free minutes remaining:</span> {freeMinutesRemaining.toFixed(2)} min
        </p>
      ) : null}
    </div>
  );
}
