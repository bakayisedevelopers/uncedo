import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  ExternalLink,
  FileCheck2,
  FileUp,
  Lock,
  RefreshCw,
  ShieldAlert,
} from 'lucide-react';
import {
  getMyPoliceClearanceReview,
  getMyPoliceClearanceViewUrl,
  submitWebHelperPoliceClearance,
  subscribeToHelperPoliceClearanceReview,
} from '../../services/helperDataService';

function formatBytes(bytes = 0) {
  if (!bytes || bytes < 1024) return `${bytes || 0} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDateTime(ms) {
  if (!ms) return '—';
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString(undefined, { dateStyle: 'medium' });
}

export function StepPoliceClearance({ profile, onReviewLoaded, onCompleteNext }) {
  const fileInputRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [review, setReview] = useState({ required: true, status: profile?.policeClearanceStatus || 'missing', submissions: [] });
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [openingId, setOpeningId] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const loadReview = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getMyPoliceClearanceReview();
      setReview(data);
      onReviewLoaded?.(data);
    } catch (err) {
      setError(err?.message || 'Unable to load police clearance status right now.');
    } finally {
      setLoading(false);
    }
  }, [onReviewLoaded]);

  useEffect(() => {
    loadReview();
    if (!profile?.uid) return undefined;
    const unsub = subscribeToHelperPoliceClearanceReview(profile.uid, (liveData) => {
      if (!liveData) return;
      setReview((prev) => ({
        required: prev?.required !== false,
        status: liveData.status || prev?.status || 'missing',
        submissions: Array.isArray(liveData.submissions) ? liveData.submissions : (prev?.submissions || []),
      }));
      onReviewLoaded?.(liveData);
      setLoading(false);
    });
    return () => unsub?.();
  }, [loadReview, onReviewLoaded, profile?.uid]);

  const status = String(review?.status || profile?.policeClearanceStatus || 'missing').trim().toLowerCase();
  const required = review?.required !== false;
  const submissions = Array.isArray(review?.submissions) ? review.submissions : [];

  const isApproved = !required || status === 'approved';
  const isInReview = status === 'pending' || status === 'uploading';
  const canUpload = required && !isApproved && !isInReview;
  const canContinue = isApproved || isInReview;

  const handleFileChange = (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setError('');
    setNotice('');
    const mime = String(file.type || '').toLowerCase();
    if (!['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'].includes(mime)) {
      setError('Unsupported file format. Select a PDF, JPG, or PNG file.');
      return;
    }
    const maxBytes = mime === 'application/pdf' ? 10 * 1024 * 1024 : 5 * 1024 * 1024;
    if (file.size > maxBytes) {
      setError(mime === 'application/pdf' ? 'PDF files must be 10 MB or smaller.' : 'Image files must be 5 MB or smaller.');
      return;
    }
    setSelectedFile(file);
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      setError('Select your police-clearance certificate (PDF, JPG, or PNG) first.');
      return;
    }
    setUploading(true);
    setError('');
    setNotice('');
    try {
      await submitWebHelperPoliceClearance(selectedFile);
      setSelectedFile(null);
      setNotice('Police clearance uploaded to private storage and queued for Uncedo administrator review.');
      await loadReview();
    } catch (err) {
      setError(err?.message || 'Could not upload your police clearance certificate.');
    } finally {
      setUploading(false);
    }
  };

  const handleViewDocument = async (submissionId) => {
    setOpeningId(submissionId);
    setError('');
    try {
      const res = await getMyPoliceClearanceViewUrl(submissionId);
      if (res?.url) {
        window.open(res.url, '_blank', 'noopener,noreferrer');
      } else {
        throw new Error('Secure preview link was unavailable.');
      }
    } catch (err) {
      setError(err?.message || 'Could not open your uploaded document.');
    } finally {
      setOpeningId('');
    }
  };

  return (
    <div className="space-y-7">
      <div className="rounded-xl border border-border bg-well/60 p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <div
            className={`h-11 w-11 rounded-lg border flex items-center justify-center shrink-0 ${
              isApproved
                ? 'bg-tealbrand-50 border-tealbrand-600/30 text-tealbrand-700'
                : isInReview
                  ? 'bg-amber-50 border-amber-300 text-amber-800'
                  : ['resubmission_required', 'rejected', 'expired', 'failed'].includes(status)
                    ? 'bg-red-50 border-red-200 text-red-700'
                    : 'bg-surface border-border text-ink-500'
            }`}
          >
            {isApproved ? (
              <CheckCircle2 className="h-5 w-5" />
            ) : isInReview ? (
              <Clock className="h-5 w-5" />
            ) : ['resubmission_required', 'rejected', 'expired', 'failed'].includes(status) ? (
              <ShieldAlert className="h-5 w-5" />
            ) : (
              <FileUp className="h-5 w-5" />
            )}
          </div>
          <div>
            <div className="text-sm font-semibold text-ink-900">
              {!required
                ? 'Police clearance is currently optional'
                : isApproved
                  ? 'Police clearance approved'
                  : isInReview
                    ? 'Document received — awaiting admin review'
                    : ['resubmission_required', 'rejected', 'expired', 'failed'].includes(status)
                      ? 'Resubmission required'
                      : 'Police clearance certificate required'}
            </div>
            <p className="text-xs sm:text-sm text-ink-500 mt-1 leading-relaxed max-w-xl">
              {isApproved
                ? 'Your clearance certificate has been verified by an Uncedo administrator.'
                : isInReview
                  ? 'Your private submission is queued with Uncedo Trust & Safety. You can proceed to bank payouts while our team reviews it.'
                  : 'Upload a clear scan or photo of your valid South African police-clearance certificate (PDF up to 10 MB, or JPG/PNG up to 5 MB).'}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={loadReview}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-border bg-surface hover:bg-well text-xs font-semibold text-ink-700 shrink-0 self-start sm:self-center disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh Status
        </button>
      </div>

      {canUpload && (
        <div className="rounded-xl border-2 border-dashed border-border hover:border-tealbrand-600/45 transition-colors bg-canvas/50 p-6 sm:p-7 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1.5">
              <div className="text-sm font-semibold text-ink-900">
                Upload SAPS clearance certificate
              </div>
              <p className="text-xs text-ink-500 flex items-center gap-1.5">
                <Lock className="h-3.5 w-3.5 text-tealbrand-700 shrink-0" />
                Stored encrypted in private verification storage under POPIA Special Personal Information safeguards — reviewed only by authorised Uncedo vetting administrators and never shared publicly or sent to AI.
              </p>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,image/jpeg,image/png"
              onChange={handleFileChange}
              className="hidden"
            />

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-tealbrand-600 hover:bg-tealbrand-700 text-sm font-semibold text-white shrink-0 disabled:opacity-50"
            >
              <FileUp className="h-4 w-4" />
              Select PDF / Image
            </button>
          </div>

          {selectedFile && (
            <div className="rounded-lg border border-border bg-surface px-4 py-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <FileCheck2 className="h-4 w-4 text-tealbrand-700 shrink-0" />
                <span className="text-sm font-medium text-ink-900 truncate">{selectedFile.name}</span>
                <span className="tabular-nums-mono text-xs text-ink-500">
                  ({formatBytes(selectedFile.size)})
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedFile(null)}
                  disabled={uploading}
                  className="px-3 py-1.5 rounded-md border border-border bg-surface text-xs font-medium text-ink-600 hover:bg-well"
                >
                  Clear
                </button>
                <button
                  type="button"
                  onClick={handleUpload}
                  disabled={uploading}
                  className="px-4 py-1.5 rounded-md bg-tealbrand-600 hover:bg-tealbrand-700 text-xs font-semibold text-white disabled:opacity-50"
                >
                  {uploading ? 'Uploading securely…' : 'Submit Clearance'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {submissions.length > 0 && (
        <div className="space-y-2.5">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-500">
            Submission history
          </h3>
          <div className="divide-y divide-border rounded-xl border border-border bg-white">
            {submissions.map((sub) => (
              <div key={sub.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-ink-900">
                    <span>
                      {sub.mimeType === 'application/pdf' ? 'PDF Document' : 'Image Scan'}
                    </span>
                    <span className="text-ink-400 font-normal">·</span>
                    <span
                      className={
                        sub.status === 'approved'
                          ? 'text-tealbrand-700'
                          : ['resubmission_required', 'rejected', 'expired', 'failed'].includes(String(sub.status || '').toLowerCase())
                            ? 'text-red-700'
                            : 'text-amber-800'
                      }
                    >
                      {String(sub.status || 'pending').replace(/_/g, ' ')}
                    </span>
                  </div>
                  <div className="text-xs text-ink-500">
                    Uploaded {formatDateTime(sub.uploadedAtMs)} · {formatBytes(sub.size)}
                    {sub.reviewDeadlineAtMs ? ` · Review window closes ${formatDateTime(sub.reviewDeadlineAtMs)}` : ''}
                  </div>
                  {sub.reviewerReason && (
                    <p className="text-xs text-red-700">Reviewer note: {sub.reviewerReason}</p>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => handleViewDocument(sub.id)}
                  disabled={openingId === sub.id}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-white hover:bg-well text-xs font-medium text-ink-700 self-start sm:self-center shrink-0 disabled:opacity-50"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  {openingId === sub.id ? 'Opening…' : 'Open Copy'}
                </button>
              </div>
            ))}
          </div>
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

      <div className="pt-2 flex items-center justify-end gap-3 border-t border-border">
        <button
          type="button"
          onClick={() => onCompleteNext?.()}
          disabled={!canContinue || uploading}
          className="px-5 py-2.5 rounded-lg bg-tealbrand-600 hover:bg-tealbrand-700 text-sm font-semibold text-white disabled:opacity-40"
        >
          Continue to Bank Payouts
        </button>
      </div>
    </div>
  );
}
