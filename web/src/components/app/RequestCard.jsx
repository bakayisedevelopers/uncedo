import { Clock3, DollarSign, UserCircle2 } from 'lucide-react';
import { getMeetingProviderLabel } from '../../constants/meetingProviders';
import StatusBadge from '../ui/StatusBadge';

export default function RequestCard({ request, relatedSession = null, action }) {
  return (
    <article className="min-w-0 max-w-full overflow-hidden rounded-[26px] border border-zinc-200 bg-white p-5 shadow-[0_16px_35px_rgba(15,23,42,0.06)] transition-all hover:border-emerald-300">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="break-words text-xs uppercase tracking-[0.2em] text-zinc-500">
            {request.subject}
          </p>
          <h3 className="break-words text-2xl font-black text-zinc-900 md:text-3xl">
            {request.topic}
          </h3>
        </div>

        <div className="max-w-full shrink-0">
          <StatusBadge status={request.status} />
        </div>
      </div>

      <p className="mt-3 whitespace-normal break-words text-base text-zinc-700">
        {request.description}
      </p>

      {request.attachment?.fileName || request.imageAttachment ? (
        <div className="mt-2 min-w-0 max-w-full text-xs text-emerald-700">
          <span className="mr-1 font-semibold">Attachment:</span>
          {request.attachment?.downloadUrl ? (
            <a
              href={request.attachment.downloadUrl}
              target="_blank"
              rel="noreferrer"
              className="break-all underline"
            >
              {request.attachment.fileName || 'Open file'}
            </a>
          ) : (
            <span className="break-words">
              {request.attachment?.fileName || request.imageAttachment}
            </span>
          )}
        </div>
      ) : null}

      <div className="mt-4 grid min-w-0 gap-2 text-sm text-zinc-700 sm:grid-cols-2">
        <p className="flex min-w-0 items-start gap-2 break-words">
          <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-zinc-400" />
          <span className="min-w-0 break-words">
            {request.preferredDate || 'ASAP'} • {request.preferredTime || 'Now'} • {request.duration || 'Flexible'}
          </span>
        </p>

        <p className="min-w-0 break-words text-zinc-500">
          Provider pref: {getMeetingProviderLabel(request.meetingProviderPreference)}
        </p>

        {request.budget ? (
          <p className="flex min-w-0 items-start gap-2 break-words">
            <DollarSign className="mt-0.5 h-4 w-4 shrink-0 text-zinc-400" />
            <span className="min-w-0 break-words">Budget: {request.budget}</span>
          </p>
        ) : null}

        {request.pricingSnapshot?.totalAmount ? (
          <p className="min-w-0 break-words text-zinc-500">
            Quote: R{Number((request.pricingSnapshot.originalPrice ?? request.pricingSnapshot.totalAmount) || 0).toFixed(2)}
            {' '}→ Pay R{Number((request.pricingSnapshot.finalPrice ?? request.pricingSnapshot.totalAmount) || 0).toFixed(2)}
          </p>
        ) : null}

        {request.tutorName ? (
          <p className="flex min-w-0 items-start gap-2 break-words">
            <UserCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-zinc-400" />
            <span className="min-w-0 break-words">Tutor: {request.tutorName}</span>
          </p>
        ) : null}

        {relatedSession ? (
          <p className="col-span-full rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">
            Session linked: {relatedSession.status || 'waiting_student'} • {relatedSession.duration || request.duration || 'Duration pending'}
          </p>
        ) : null}
      </div>

      {action ? <div className="mt-4 min-w-0">{action}</div> : null}
    </article>
  );
}
