export default function EmptyState({ title, description, action, compact = false }) {
  return (
    <div className={`rounded-3xl border border-zinc-200 bg-zinc-50 text-center ${compact ? 'p-5' : 'p-8'}`}>
      <h3 className="text-lg font-bold text-zinc-900">{title}</h3>
      <p className="mt-2 text-sm text-zinc-600">{description}</p>
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}
