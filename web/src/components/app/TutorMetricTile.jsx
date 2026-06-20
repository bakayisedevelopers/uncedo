export default function TutorMetricTile({ label, value }) {
  return (
    <article className="inline-grid w-fit max-w-full grid-cols-[auto_auto] items-center gap-3 justify-self-start rounded-2xl border border-brand/20 bg-emerald-50/60 px-4 py-3">
      <p className="min-w-0 text-[10px] font-bold uppercase tracking-[0.16em] text-brand">
        {label}
      </p>
      <div className="shrink-0 text-right text-sm font-black text-zinc-900 md:text-base">{value}</div>
    </article>
  );
}
