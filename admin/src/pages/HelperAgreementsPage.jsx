import { useEffect, useMemo, useState } from 'react';
import { Badge, Card, LoadingState, SectionTitle } from '../components/ui';
import { getHelperAgreementBundle, publishHelperAgreementVersion } from '../services/helperAgreementService';

function formatDate(value) {
  if (!value) return 'Not set';
  const parsed = typeof value?.toDate === 'function' ? value.toDate() : new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Not set';
  return parsed.toLocaleDateString();
}

export default function HelperAgreementsPage() {
  const [bundle, setBundle] = useState({ activeVersion: null, document: null, versions: [], acceptances: [] });
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [form, setForm] = useState({
    version: '1.0.1',
    effectiveDate: new Date().toISOString().slice(0, 10),
    reviewedAt: new Date().toISOString().slice(0, 10),
    nextReviewAt: new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString().slice(0, 10),
    reviewedBy: 'Uncedo',
    stampLabel: 'UNCEDO HELPER AGREEMENT RECORD',
    changeSummary: 'Initial helper agreement rollout with versioned acceptance tracking and signed records.',
    contentMarkdown: '',
    title: 'Helper Agreement',
    status: 'active',
  });

  const activeVersion = bundle.activeVersion || null;

  const load = async () => {
    setIsLoading(true);
    try {
      const result = await getHelperAgreementBundle();
      setBundle({
        activeVersion: result?.activeVersion || null,
        document: result?.document || null,
        versions: Array.isArray(result?.versions) ? result.versions : [],
        acceptances: Array.isArray(result?.acceptances) ? result.acceptances : [],
      });
      setForm((current) => ({
        ...current,
        title: result?.activeVersion?.title || current.title,
        contentMarkdown: result?.activeVersion?.contentMarkdown || current.contentMarkdown,
        version: current.version || String(result?.document?.currentVersion || ''),
      }));
    } catch (error) {
      setMessage(error.message || 'Unable to load helper agreements.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const versionHistory = useMemo(() => bundle.versions || [], [bundle.versions]);

  const publish = async (event) => {
    event.preventDefault();
    setIsSubmitting(true);
    setMessage('');
    try {
      await publishHelperAgreementVersion({
        version: form.version,
        title: form.title,
        effectiveDate: form.effectiveDate,
        reviewedAt: form.reviewedAt,
        nextReviewAt: form.nextReviewAt,
        reviewedBy: form.reviewedBy,
        stampLabel: form.stampLabel,
        changeSummary: form.changeSummary,
        contentMarkdown: form.contentMarkdown,
        status: form.status,
      });
      setMessage('Helper Agreement version published successfully.');
      await load();
    } catch (error) {
      setMessage(error.message || 'Unable to publish the Helper Agreement.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <SectionTitle
          eyebrow="Contracts"
          title="Helper agreement management"
          description="Publish the active helper contract version. A new publish invalidates profile completion for every helper until they accept the latest version."
        />

        {message ? (
          <div className="rounded-[20px] border border-brand/20 bg-brand/10 px-4 py-3 text-sm font-semibold text-brand-soft">
            {message}
          </div>
        ) : null}

        {isLoading ? <LoadingState label="Loading helper agreement versions..." /> : null}

        {!isLoading ? (
          <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
            <Card className="bg-white/7">
              <SectionTitle
                eyebrow="Current version"
                title={activeVersion?.title || 'Helper Agreement'}
                description="This is the version helpers must read and sign before their profile is considered complete again."
                action={<Badge tone={activeVersion?.status === 'active' ? 'success' : 'neutral'}>{activeVersion?.status || 'active'}</Badge>}
              />

              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  ['Version', activeVersion?.version || 'Not set'],
                  ['Effective date', formatDate(activeVersion?.effectiveDate)],
                  ['Reviewed at', formatDate(activeVersion?.reviewedAt)],
                  ['Next review', formatDate(activeVersion?.nextReviewAt)],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-[20px] border border-white/10 bg-white/5 p-4">
                    <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-ink-300">{label}</p>
                    <p className="mt-2 text-sm text-white">{value}</p>
                  </div>
                ))}
              </div>

              <div className="mt-4 rounded-[20px] border border-white/10 bg-white/5 p-4">
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-ink-300">Change summary</p>
                <p className="mt-2 text-sm leading-6 text-ink-200">{activeVersion?.changeSummary || 'No change summary provided.'}</p>
              </div>

              <form onSubmit={publish} className="mt-6 space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="space-y-2">
                    <span className="text-xs font-bold uppercase tracking-[0.16em] text-ink-300">Version</span>
                    <input
                      required
                      value={form.version}
                      onChange={(event) => setForm((current) => ({ ...current, version: event.target.value }))}
                      className="w-full rounded-2xl border border-white/10 bg-ink-950/50 px-4 py-3 text-sm text-white outline-none placeholder:text-ink-400 focus:border-brand"
                      placeholder="1.0.2"
                    />
                  </label>
                  <label className="space-y-2">
                    <span className="text-xs font-bold uppercase tracking-[0.16em] text-ink-300">Effective date</span>
                    <input
                      required
                      type="date"
                      value={form.effectiveDate}
                      onChange={(event) => setForm((current) => ({ ...current, effectiveDate: event.target.value }))}
                      className="w-full rounded-2xl border border-white/10 bg-ink-950/50 px-4 py-3 text-sm text-white outline-none focus:border-brand"
                    />
                  </label>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <label className="space-y-2">
                    <span className="text-xs font-bold uppercase tracking-[0.16em] text-ink-300">Reviewed by</span>
                    <input
                      value={form.reviewedBy}
                      onChange={(event) => setForm((current) => ({ ...current, reviewedBy: event.target.value }))}
                      className="w-full rounded-2xl border border-white/10 bg-ink-950/50 px-4 py-3 text-sm text-white outline-none focus:border-brand"
                    />
                  </label>
                  <label className="space-y-2">
                    <span className="text-xs font-bold uppercase tracking-[0.16em] text-ink-300">Reviewed at</span>
                    <input
                      type="date"
                      value={form.reviewedAt}
                      onChange={(event) => setForm((current) => ({ ...current, reviewedAt: event.target.value }))}
                      className="w-full rounded-2xl border border-white/10 bg-ink-950/50 px-4 py-3 text-sm text-white outline-none focus:border-brand"
                    />
                  </label>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <label className="space-y-2">
                    <span className="text-xs font-bold uppercase tracking-[0.16em] text-ink-300">Next review</span>
                    <input
                      type="date"
                      value={form.nextReviewAt}
                      onChange={(event) => setForm((current) => ({ ...current, nextReviewAt: event.target.value }))}
                      className="w-full rounded-2xl border border-white/10 bg-ink-950/50 px-4 py-3 text-sm text-white outline-none focus:border-brand"
                    />
                  </label>
                  <label className="space-y-2">
                    <span className="text-xs font-bold uppercase tracking-[0.16em] text-ink-300">Stamp label</span>
                    <input
                      value={form.stampLabel}
                      onChange={(event) => setForm((current) => ({ ...current, stampLabel: event.target.value }))}
                      className="w-full rounded-2xl border border-white/10 bg-ink-950/50 px-4 py-3 text-sm text-white outline-none focus:border-brand"
                    />
                  </label>
                </div>

                <label className="space-y-2">
                  <span className="text-xs font-bold uppercase tracking-[0.16em] text-ink-300">Title</span>
                  <input
                    required
                    value={form.title}
                    onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                    className="w-full rounded-2xl border border-white/10 bg-ink-950/50 px-4 py-3 text-sm text-white outline-none focus:border-brand"
                  />
                </label>

                <label className="space-y-2">
                  <span className="text-xs font-bold uppercase tracking-[0.16em] text-ink-300">Change summary</span>
                  <input
                    value={form.changeSummary}
                    onChange={(event) => setForm((current) => ({ ...current, changeSummary: event.target.value }))}
                    className="w-full rounded-2xl border border-white/10 bg-ink-950/50 px-4 py-3 text-sm text-white outline-none focus:border-brand"
                    placeholder="Clarified payout and safety wording."
                  />
                </label>

                <label className="space-y-2">
                  <span className="text-xs font-bold uppercase tracking-[0.16em] text-ink-300">Agreement content</span>
                  <textarea
                    required
                    rows={18}
                    value={form.contentMarkdown}
                    onChange={(event) => setForm((current) => ({ ...current, contentMarkdown: event.target.value }))}
                    className="w-full rounded-3xl border border-white/10 bg-ink-950/50 px-4 py-4 text-sm leading-6 text-white outline-none placeholder:text-ink-400 focus:border-brand"
                  />
                </label>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="rounded-2xl bg-brand px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"
                  >
                    {isSubmitting ? 'Publishing...' : 'Publish version'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setForm((current) => ({ ...current, contentMarkdown: activeVersion?.contentMarkdown || current.contentMarkdown }))}
                    className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-bold text-white"
                  >
                    Restore current text
                  </button>
                </div>
              </form>
            </Card>

            <Card>
              <SectionTitle
                eyebrow="History"
                title="Published versions"
                description="Old versions remain immutable so each signed helper record still matches the exact text accepted."
              />

              <div className="space-y-3">
                {versionHistory.length ? versionHistory.map((version) => (
                  <div key={version.id} className="rounded-[22px] border border-white/10 bg-white/5 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-base font-bold text-white">Version {version.version}</p>
                        <p className="mt-1 text-xs text-ink-300">{version.status || 'active'} - {formatDate(version.effectiveDate)}</p>
                      </div>
                      <Badge tone={version.status === 'active' ? 'success' : 'neutral'}>{version.status || 'active'}</Badge>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-ink-200">{version.changeSummary || 'No change summary provided.'}</p>
                  </div>
                )) : (
                  <p className="text-sm text-ink-200">No versions found.</p>
                )}
              </div>
            </Card>
          </div>
        ) : null}
      </Card>
    </div>
  );
}
