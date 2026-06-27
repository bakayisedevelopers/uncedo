import { useEffect, useMemo, useState } from 'react';
import { updateTutorQualifiedSubjectsAndActiveSubjects } from '../../services/tutorDocumentService';

function buildRows(qualifiedSubjects = [], activeSubjects = []) {
  const safeQualified = Array.isArray(qualifiedSubjects) ? qualifiedSubjects : [];
  const safeActive = new Set(Array.isArray(activeSubjects) ? activeSubjects : []);
  return safeQualified.map((item, index) => ({
    id: `${String(item?.subject || 'subject')}-${index}-${Date.now()}`,
    subject: String(item?.subject || '').trim(),
    mark: Number(item?.mark || 0) || 0,
    active: safeActive.has(String(item?.subject || '').trim()),
  }));
}

export default function QualifiedSubjectsManager({ user, setUser, onMessage }) {
  const qualifiedSubjects = useMemo(() => user?.qualifiedSubjects || [], [user?.qualifiedSubjects]);
  const activeSubjectsFromUser = useMemo(
    () => user?.activeSubjects || user?.subjects || [],
    [user?.activeSubjects, user?.subjects],
  );
  const [rows, setRows] = useState(() => buildRows(qualifiedSubjects, activeSubjectsFromUser));
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setRows(buildRows(qualifiedSubjects, activeSubjectsFromUser));
  }, [qualifiedSubjects, activeSubjectsFromUser]);

  const updateRow = (id, updates) => {
    setRows((current) => current.map((row) => (row.id === id ? { ...row, ...updates } : row)));
  };

  const saveQualifiedSubjects = async () => {
    setIsSaving(true);
    try {
      const qualifiedPayload = rows
        .map((row) => ({
          subject: String(row.subject || '').trim(),
          mark: Number(row.mark || 0),
        }))
        .filter((row) => row.subject && Number.isFinite(row.mark));
      const activePayload = rows
        .filter((row) => row.active && String(row.subject || '').trim())
        .map((row) => String(row.subject || '').trim());

      const update = await updateTutorQualifiedSubjectsAndActiveSubjects(user.uid, qualifiedPayload, activePayload);
      setUser?.((prev) => ({ ...prev, ...update }));
      onMessage?.('Qualified subjects and active tutor subjects saved.');
    } catch (error) {
      onMessage?.(error.message || 'Unable to save tutor subjects.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {rows.length ? rows.map((row) => (
          <div key={row.id} className="grid gap-2 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 md:grid-cols-[1fr_120px_120px_auto] md:items-center">
            <div className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold text-zinc-900">
              {row.subject}
            </div>
            <div className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold text-zinc-900">
              {row.mark}%
            </div>
            <label className="inline-flex items-center gap-2 text-xs font-semibold text-zinc-700">
              <input
                type="checkbox"
                checked={Boolean(row.active)}
                onChange={(event) => updateRow(row.id, { active: event.target.checked })}
                className="h-4 w-4 rounded border-zinc-300 text-brand focus:ring-brand"
              />
              Active
            </label>
            <p className="text-xs text-zinc-500">Verified from uploaded results</p>
          </div>
        )) : (
          <p className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-600">
            No qualified subjects yet. Upload results to unlock tutor subjects with marks of 60% or higher.
          </p>
        )}
      </div>
      <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-600">
        <p className="font-semibold text-zinc-700">Tutor subject rule:</p>
        <p className="mt-1">Only verified subjects from uploaded results with marks of 60% or higher can be activated for tutor matching.</p>
      </div>
      <button
        type="button"
        onClick={saveQualifiedSubjects}
        disabled={isSaving}
        className="rounded-2xl bg-brand px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
      >
        {isSaving ? 'Saving...' : 'Save subjects'}
      </button>
    </div>
  );
}
