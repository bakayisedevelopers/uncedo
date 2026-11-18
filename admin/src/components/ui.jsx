import { useEffect } from 'react';

export function Badge({ tone = 'neutral', children }) {
  const tones = {
    neutral: 'border-white/10 bg-white/5 text-ink-200',
    success: 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200',
    warning: 'border-amber-400/20 bg-amber-400/10 text-amber-200',
    danger: 'border-rose-400/20 bg-rose-400/10 text-rose-200',
    brand: 'border-brand/20 bg-brand/15 text-brand-soft',
  };

  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.14em] ${tones[tone] || tones.neutral}`}>
      {children}
    </span>
  );
}

export function Card({ className = '', children }) {
  return (
    <div className={`min-w-0 w-full rounded-[28px] border border-white/10 bg-white/5 p-5 shadow-glow backdrop-blur ${className}`}>
      {children}
    </div>
  );
}

export function SectionTitle({ eyebrow, title, description, action }) {
  return (
    <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0 max-w-2xl space-y-1">
        {eyebrow ? <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-brand-soft/80">{eyebrow}</p> : null}
        <h2 className="text-2xl font-bold tracking-tight text-white">{title}</h2>
        {description ? <p className="text-sm leading-6 text-ink-200">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function MetricCard({ label, value, detail, tone = 'brand' }) {
  const toneClasses = {
    brand: 'from-brand/20 to-brand/5 border-brand/20',
    accent: 'from-amber-500/20 to-amber-500/5 border-amber-400/20',
    danger: 'from-rose-500/20 to-rose-500/5 border-rose-400/20',
    neutral: 'from-white/10 to-white/5 border-white/10',
  };

  return (
    <div className={`min-w-0 rounded-[24px] border bg-gradient-to-br p-4 ${toneClasses[tone] || toneClasses.brand}`}>
      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-ink-200">{label}</p>
      <p className="mt-3 text-3xl font-bold tracking-tight text-white">{value}</p>
      {detail ? <p className="mt-2 text-sm text-ink-200">{detail}</p> : null}
    </div>
  );
}

export function EmptyState({ title, description, action }) {
  return (
    <div className="min-w-0 w-full rounded-[24px] border border-dashed border-white/10 bg-white/5 p-6 sm:p-8 text-center">
      <h3 className="text-lg font-bold text-white">{title}</h3>
      {description ? <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-ink-200">{description}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function LoadingState({ label = 'Loading admin data...' }) {
  return (
    <div className="flex items-center justify-center rounded-[24px] border border-white/10 bg-white/5 p-10 text-sm font-medium text-ink-200">
      <span className="mr-3 inline-flex h-3 w-3 animate-pulse rounded-full bg-brand" />
      {label}
    </div>
  );
}

export function ConfirmDialog({
  open = false,
  title = 'Confirm action',
  description = '',
  details = [],
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'danger',
  isBusy = false,
  errorMessage = '',
  onConfirm,
  onCancel,
}) {
  useEffect(() => {
    if (!open) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && !isBusy) {
        onCancel?.();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isBusy, onCancel, open]);

  if (!open) return null;

  const confirmButtonClass = tone === 'danger'
    ? 'bg-rose-600 text-white hover:bg-rose-500 border border-rose-400/30'
    : 'bg-brand text-white hover:opacity-95';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/80 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      onClick={() => {
        if (!isBusy) onCancel?.();
      }}
    >
      <div
        className="w-full max-w-md rounded-[28px] border border-white/15 bg-ink-900 p-6 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-rose-300/90">
          {tone === 'danger' ? 'Destructive action' : 'Confirmation'}
        </p>
        <h3 id="confirm-dialog-title" className="mt-2 text-xl font-bold tracking-tight text-white">
          {title}
        </h3>
        {description ? (
          <p className="mt-2 text-sm leading-6 text-ink-200">{description}</p>
        ) : null}

        {Array.isArray(details) && details.length ? (
          <ul className="mt-4 space-y-2 rounded-[20px] border border-white/10 bg-white/5 p-3.5 text-xs leading-5 text-ink-200">
            {details.map((item, idx) => (
              <li key={idx} className="flex items-start gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-rose-400" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        ) : null}

        {errorMessage ? (
          <div className="mt-4 rounded-2xl border border-rose-400/30 bg-rose-500/15 px-4 py-3 text-xs font-medium text-rose-200">
            {errorMessage}
          </div>
        ) : null}

        <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
          <button
            type="button"
            onClick={() => onCancel?.()}
            disabled={isBusy}
            className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={() => onConfirm?.()}
            disabled={isBusy}
            className={`rounded-2xl px-4 py-2.5 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-60 ${confirmButtonClass}`}
          >
            {isBusy ? 'Deleting...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

