export default function PageHeader({ title, description, action }) {
  return (
    <div className="mb-5 rounded-[1.5rem] border border-zinc-200 bg-white/90 px-4 py-4 shadow-[0_14px_30px_rgba(15,23,42,0.06)] backdrop-blur sm:flex sm:items-center sm:justify-between sm:gap-4 md:mb-6 md:rounded-[1.75rem] md:px-6">
      <div>
        <h1 className="text-2xl font-black tracking-tight text-zinc-900 md:text-4xl">{title}</h1>
        {description ? <p className="mt-1 text-sm text-zinc-600">{description}</p> : null}
      </div>
      {action ? <div className="mt-3 sm:mt-0">{action}</div> : null}
    </div>
  );
}
