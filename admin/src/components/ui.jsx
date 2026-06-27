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
    <div className={`rounded-[28px] border border-white/10 bg-white/5 p-5 shadow-glow backdrop-blur ${className}`}>
      {children}
    </div>
  );
}

export function SectionTitle({ eyebrow, title, description, action }) {
  return (
    <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
      <div className="max-w-2xl space-y-1">
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
    <div className={`rounded-[24px] border bg-gradient-to-br p-4 ${toneClasses[tone] || toneClasses.brand}`}>
      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-ink-200">{label}</p>
      <p className="mt-3 text-3xl font-bold tracking-tight text-white">{value}</p>
      {detail ? <p className="mt-2 text-sm text-ink-200">{detail}</p> : null}
    </div>
  );
}

export function EmptyState({ title, description, action }) {
  return (
    <div className="rounded-[24px] border border-dashed border-white/10 bg-white/5 p-8 text-center">
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
