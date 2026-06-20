export default function StatCard({ title, value, icon: Icon, tone = 'brand' }) {
  const toneMap = {
    brand: 'bg-emerald-50 text-emerald-500 border-emerald-100',
    zinc: 'bg-slate-50 text-slate-500 border-slate-200',
    sky: 'bg-emerald-50 text-emerald-500 border-emerald-100',
  };

  return (
    <div className="rounded-[24px] border border-zinc-200/80 bg-white/90 p-5 shadow-[0_12px_30px_rgba(15,23,42,0.06)] backdrop-blur">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-400">{title}</p>
          <p className="mt-2 text-3xl font-black tracking-tight text-zinc-900 md:text-4xl">{value}</p>
        </div>
        {Icon ? (
          <div className={`rounded-2xl border p-2.5 ${toneMap[tone] || toneMap.brand}`}>
            <Icon className="h-5 w-5" />
          </div>
        ) : null}
      </div>
    </div>
  );
}
