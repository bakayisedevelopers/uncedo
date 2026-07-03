import { Link } from 'react-router-dom';
import { CalendarClock, Link as LinkIcon, User2 } from 'lucide-react';
import { getMeetingProviderLabel } from '../../constants/meetingProviders';
import StatusBadge from '../ui/StatusBadge';

export default function SessionCard({ session, role = 'student', action }) {
  return (
    <article className="rounded-[26px] border border-zinc-200 bg-white p-5 shadow-[0_16px_35px_rgba(15,23,42,0.06)] transition-all hover:border-emerald-300">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">{session.subject}</p>
          <h3 className="text-2xl font-black text-zinc-900">{session.topic}</h3>
        </div>
        <StatusBadge status={session.status} />
      </div>

      <div className="mt-4 grid gap-2 text-sm text-zinc-700 sm:grid-cols-2">
        <p className="flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-zinc-400" />
          {session.scheduledDate || 'Live'} • {session.scheduledTime || 'Now'} • {session.duration || '60 mins'}
        </p>
        <p className="flex items-center gap-2">
          <User2 className="h-4 w-4 text-zinc-400" />
          {role === 'student' ? session.tutorName || 'Tutor pending' : session.studentName || 'Student'}
        </p>
      </div>

      <p className="mt-2 text-sm text-zinc-500">Provider: {getMeetingProviderLabel(session.meetingProvider)}</p>
      {session.meetingLink ? (
        <a
          href={session.meetingLink}
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-flex items-center gap-2 text-sm font-semibold text-emerald-700 hover:text-emerald-800"
        >
          <LinkIcon className="h-4 w-4" />
          Open meeting link
        </a>
      ) : (
        <p className="mt-2 text-sm text-zinc-500">Meeting link not added yet.</p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <Link to={`/app/session/${session.id}`} className="rounded-2xl bg-brand px-4 py-2 text-sm font-bold text-white hover:bg-brand-dark">
          {session.status === 'in_progress' ? 'Rejoin Call' : 'Open Session Room'}
        </Link>
        {action ? <div>{action}</div> : null}
      </div>
    </article>
  );
}
