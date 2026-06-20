import { useEffect, useMemo, useState } from 'react';
import PageHeader from '../../../components/ui/PageHeader';
import SectionCard from '../../../components/ui/SectionCard';
import LoadingState from '../../../components/ui/LoadingState';
import FormField from '../../../components/ui/FormField';
import { getTutorAgreementBundle, LEGAL_ENTITY_NAME, publishTutorAgreementVersion } from '../../../services/legalAgreementService';

export default function AdminTutorAgreementsPage() {
  const [bundle, setBundle] = useState({ activeVersion: null, document: null, versions: [], acceptances: [] });
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [form, setForm] = useState({
    version: '1.0.1',
    effectiveDate: new Date().toISOString().slice(0, 10),
    reviewedAt: new Date().toISOString().slice(0, 10),
    nextReviewAt: new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString().slice(0, 10),
    reviewedBy: 'Parakleo',
    stampLabel: 'PARAKLEO AGREEMENT RECORD',
    changeSummary: 'Improved signed PDF formatting, added Parakleo agreement stamp, and added email delivery of signed agreement PDFs.',
    contentMarkdown: '',
    title: 'Tutor Agreement',
    status: 'active',
  });

  const activeVersion = bundle.activeVersion || null;

  const load = async () => {
    setIsLoading(true);
    try {
      const result = await getTutorAgreementBundle();
      setBundle(result);
      setForm((prev) => ({
        ...prev,
        contentMarkdown: result?.activeVersion?.contentMarkdown || '',
        title: result?.activeVersion?.title || prev.title,
        version: prev.version || (result?.document?.currentVersion ? `${result.document.currentVersion}` : ''),
      }));
    } catch (error) {
      setMessage(error.message || 'Unable to load tutor agreements.');
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
      await publishTutorAgreementVersion({
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
      setMessage('Tutor Agreement version published successfully.');
      await load();
    } catch (error) {
      setMessage(error.message || 'Unable to publish the Tutor Agreement.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tutor Agreement Management"
        description="Publish the active tutor contract version and review the version history."
      />

      {message ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          {message}
        </div>
      ) : null}

      {isLoading ? <LoadingState message="Loading tutor agreement versions..." /> : null}

      {!isLoading ? (
        <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <SectionCard title="Current active version" subtitle={LEGAL_ENTITY_NAME}>
            <div className="space-y-3 text-sm text-zinc-700">
              <p><span className="font-semibold">Version:</span> {activeVersion?.version || 'Not set'}</p>
              <p><span className="font-semibold">Effective date:</span> {activeVersion?.effectiveDate || 'Not set'}</p>
              <p><span className="font-semibold">Status:</span> {activeVersion?.status || 'active'}</p>
              <p><span className="font-semibold">Change summary:</span> {activeVersion?.changeSummary || 'Initial version'}</p>
            </div>

            <form onSubmit={publish} className="mt-6 space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <FormField label="Version" name="version" value={form.version} onChange={(event) => setForm((prev) => ({ ...prev, version: event.target.value }))} placeholder="1.0.1" required />
                <FormField label="Effective date" name="effectiveDate" type="date" value={form.effectiveDate} onChange={(event) => setForm((prev) => ({ ...prev, effectiveDate: event.target.value }))} required />
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <FormField label="Reviewed by" name="reviewedBy" value={form.reviewedBy} onChange={(event) => setForm((prev) => ({ ...prev, reviewedBy: event.target.value }))} />
                <FormField label="Reviewed at" name="reviewedAt" type="date" value={form.reviewedAt} onChange={(event) => setForm((prev) => ({ ...prev, reviewedAt: event.target.value }))} />
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <FormField label="Next review at" name="nextReviewAt" type="date" value={form.nextReviewAt} onChange={(event) => setForm((prev) => ({ ...prev, nextReviewAt: event.target.value }))} />
                <FormField label="Stamp label" name="stampLabel" value={form.stampLabel} onChange={(event) => setForm((prev) => ({ ...prev, stampLabel: event.target.value }))} />
              </div>
              <FormField label="Title" name="title" value={form.title} onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))} required />
              <FormField label="Change summary" name="changeSummary" value={form.changeSummary} onChange={(event) => setForm((prev) => ({ ...prev, changeSummary: event.target.value }))} placeholder="Clarify payout timing and safety language." />
              <FormField
                label="Agreement content"
                name="contentMarkdown"
                as="textarea"
                rows={18}
                value={form.contentMarkdown}
                onChange={(event) => setForm((prev) => ({ ...prev, contentMarkdown: event.target.value }))}
                required
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="rounded-2xl bg-brand px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
                >
                  {isSubmitting ? 'Publishing...' : 'Publish version'}
                </button>
                <button
                  type="button"
                  onClick={() => setForm((prev) => ({ ...prev, contentMarkdown: activeVersion?.contentMarkdown || prev.contentMarkdown }))}
                  className="rounded-2xl border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-700"
                >
                  Restore current text
                </button>
              </div>
            </form>
          </SectionCard>

          <SectionCard title="Version history" subtitle="Old versions remain immutable and downloadable through tutor acceptances.">
            <div className="space-y-3">
              {versionHistory.length ? versionHistory.map((version) => (
                <div key={version.id} className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                  <p className="text-sm font-semibold text-zinc-900">Version {version.version}</p>
                  <p className="mt-1 text-xs text-zinc-500">{version.status || 'active'} • {version.effectiveDate || 'No effective date'}</p>
                  <p className="mt-2 text-sm text-zinc-700">{version.changeSummary || 'No change summary provided.'}</p>
                </div>
              )) : (
                <p className="text-sm text-zinc-500">No versions found.</p>
              )}
            </div>
          </SectionCard>
        </div>
      ) : null}
    </div>
  );
}
