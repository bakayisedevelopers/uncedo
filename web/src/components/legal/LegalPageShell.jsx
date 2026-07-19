import MainLayout from '../../layouts/MainLayout';

export function LegalSection({ title, children }) {
  return (
    <section className="space-y-3">
      <h2 className="text-xl font-black tracking-tight text-brand-dark sm:text-2xl">{title}</h2>
      <div className="space-y-3 text-sm leading-7 text-zinc-800">{children}</div>
    </section>
  );
}

export default function LegalPageShell({
  eyebrow = 'Legal Policy',
  title,
  updatedAt,
  intro,
  contact,
  children,
}) {
  return (
    <MainLayout>
      <div className="relative overflow-hidden bg-[#f4faf6]">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -left-24 top-6 h-72 w-72 rounded-full bg-brand/10 blur-3xl" />
          <div className="absolute -right-24 bottom-12 h-72 w-72 rounded-full bg-brand-light/10 blur-3xl" />
        </div>

        <section className="mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:px-8">
          <div className="overflow-hidden rounded-[32px] border border-brand/15 bg-white/95 shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
            <div className="border-b border-brand/15 bg-gradient-to-r from-brand/10 via-white to-brand-light/10 px-6 py-8 sm:px-10">
              <span className="inline-flex rounded-full bg-brand/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-brand-dark">
                {eyebrow}
              </span>
              <h1 className="mt-4 text-4xl font-black tracking-tight text-brand-dark sm:text-5xl">{title}</h1>
              <p className="mt-3 text-sm font-semibold text-zinc-600">Last updated: {updatedAt}</p>
              {intro ? <p className="mt-6 max-w-3xl text-base leading-7 text-zinc-700">{intro}</p> : null}
            </div>

            <div className="space-y-10 px-6 py-8 sm:px-10">
              {children}
              {contact ? (
                <div className="rounded-2xl border border-brand/15 bg-brand/5 px-4 py-4 text-sm text-zinc-800">
                  <span className="font-bold text-brand-dark">Contact</span>
                  <p className="mt-1">{contact}</p>
                </div>
              ) : null}
            </div>
          </div>
        </section>
      </div>
    </MainLayout>
  );
}
