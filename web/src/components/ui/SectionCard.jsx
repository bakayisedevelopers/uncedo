export default function SectionCard({ title, subtitle, action, children, className = '' }) {
  return (
    <section className={`rounded-[24px] border border-zinc-200 bg-white/92 p-4 shadow-[0_16px_35px_rgba(15,23,42,0.06)] backdrop-blur md:rounded-[28px] md:p-6 ${className}`}>
      {(title || action) && (
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            {title ? <h2 className="text-xl font-black tracking-tight text-zinc-900 md:text-2xl">{title}</h2> : null}
            {subtitle ? <p className="mt-1 text-sm text-zinc-600">{subtitle}</p> : null}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
