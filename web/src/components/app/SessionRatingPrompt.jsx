import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useStudentSessions, useTutorSessions } from '../../hooks/useSessions';
import { submitSessionRating } from '../../services/sessionService';
import { SESSION_STATUS } from '../../constants/lifecycle';

const HANDLED_KEY = 'parakleo_handled_session_ratings';
const RATABLE_STATUSES = new Set([
  SESSION_STATUS.COMPLETED,
  SESSION_STATUS.CANCELED,
  SESSION_STATUS.CANCELED_DURING,
]);

function StarRating({ value, onChange }) {
  return (
    <div className="flex items-center gap-1" role="radiogroup" aria-label="Overall rating">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          role="radio"
          aria-checked={value === star}
          aria-label={`${star} star${star > 1 ? 's' : ''}`}
          onClick={() => onChange(star)}
          className="text-3xl leading-none transition-transform hover:scale-110"
        >
          <span className={star <= value ? 'text-amber-400' : 'text-zinc-300'}>★</span>
        </button>
      ))}
    </div>
  );
}

export default function SessionRatingPrompt() {
  const { user } = useAuth();
  const role = user?.role === 'tutor' ? 'tutor' : 'student';
  const { sessions: studentSessions } = useStudentSessions(role === 'student' ? user?.uid : null);
  const { sessions: tutorSessions } = useTutorSessions(role === 'tutor' ? user?.uid : null);
  const sessions = role === 'tutor' ? tutorSessions : studentSessions;

  const [form, setForm] = useState({ overall: 5 });
  const [isSaving, setIsSaving] = useState(false);
  const [handledIds, setHandledIds] = useState([]);

  useEffect(() => {
    try {
      const parsed = JSON.parse(sessionStorage.getItem(HANDLED_KEY) || '[]');
      setHandledIds(Array.isArray(parsed) ? parsed : []);
    } catch {
      setHandledIds([]);
    }
  }, []);

  const markHandled = (sessionId) => {
    if (!sessionId) return;
    setHandledIds((prev) => {
      if (prev.includes(sessionId)) return prev;
      const next = [...prev, sessionId];
      sessionStorage.setItem(HANDLED_KEY, JSON.stringify(next));
      return next;
    });
  };

  const target = useMemo(
    () => sessions.find((item) => RATABLE_STATUSES.has(item.status) && !handledIds.includes(item.id)),
    [sessions, handledIds],
  );

  useEffect(() => {
    if (!target) return;
    setForm({ overall: 5 });
  }, [target?.id]);

  if (!target) return null;

  const submit = async (overall) => {
    if (!target || isSaving) return;
    setIsSaving(true);
    try {
      await submitSessionRating(target, role, {
        overall: Number(overall),
      });
      markHandled(target.id);
    } finally {
      setIsSaving(false);
    }
  };

  const statusCopy = target.status === SESSION_STATUS.COMPLETED ? 'Session ended' : 'Session canceled';

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-white/80 p-4 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-3xl bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">{statusCopy}</p>
            <h3 className="text-2xl font-black text-zinc-900">Rate this session</h3>
          </div>
          <button
            type="button"
            onClick={() => markHandled(target.id)}
            className="rounded-xl border border-zinc-300 bg-zinc-50 px-3 py-1 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-100"
          >
            Close
          </button>
        </div>

        <div className="mt-4 grid gap-4">
          <div>
            <p className="mb-2 text-sm font-semibold text-zinc-700">Overall rating</p>
            <StarRating
              value={Number(form.overall)}
              onChange={(value) => {
                setForm({ overall: value });
                submit(value);
              }}
            />
          </div>
          <p className="text-xs font-semibold text-zinc-500">
            {isSaving ? 'Saving rating...' : 'Tap a star to submit your rating.'}
          </p>
        </div>
      </div>
    </div>
  );
}
