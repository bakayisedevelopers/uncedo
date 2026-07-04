import { Link, Navigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  BookOpen,
  CalendarClock,
  FileText,
  Hash,
  Paperclip,
  UserRound,
} from 'lucide-react';
import PageHeader from '../../../components/ui/PageHeader';
import SectionCard from '../../../components/ui/SectionCard';
import LoadingState from '../../../components/ui/LoadingState';
import { useStudentRequest } from '../../../hooks/useClassRequests';
import StatusBadge from '../../../components/ui/StatusBadge';
import { useStudentSessions } from '../../../hooks/useSessions';
import { useAuth } from '../../../hooks/useAuth';

function DetailItem({ icon: Icon, label, value, muted = false }) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white/80 p-4 shadow-sm">
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
        <Icon className="h-4 w-4" />
        <span>{label}</span>
      </div>
      <p className={`text-sm leading-6 ${muted ? 'text-zinc-500' : 'text-zinc-800'}`}>
        {value}
      </p>
    </div>
  );
}

export default function StudentRequestDetailsPage() {
  const { requestId } = useParams();
  const { user } = useAuth();
  const { request, isLoading } = useStudentRequest(requestId || '');
  const { sessions } = useStudentSessions(user?.uid);

  if (!requestId) {
    return <Navigate to="/app/student/requests" replace />;
  }

  const attachments = request?.attachments?.length
    ? request.attachments
    : request?.attachment?.downloadUrl
      ? [request.attachment]
      : [];
  const relatedSession = sessions.find((session) => session.requestId === requestId);
  const extractionEntries = Array.isArray(request?.boardPreparationSource?.attachmentExtractions)
    ? request.boardPreparationSource.attachmentExtractions
    : [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Class Request Details"
        description="Review your lesson request, tutor assignment, uploaded files, and current request progress."
      />

      <SectionCard className="overflow-hidden border border-zinc-200 bg-gradient-to-br from-white via-zinc-50 to-emerald-50/40 shadow-sm">
        {isLoading ? (
          <LoadingState message="Loading class details..." />
        ) : request ? (
          <div className="space-y-6">
            <div className="rounded-3xl border border-emerald-100 bg-gradient-to-r from-emerald-500 to-emerald-600 p-6 text-white shadow-lg">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div className="space-y-3">
                  <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-white/90">
                    <BookOpen className="h-4 w-4" />
                    Class Request
                  </div>

                  <div>
                    <h2 className="text-2xl font-bold tracking-tight md:text-3xl">
                      {request.topic || 'Mathematics Request'}
                    </h2>
                    <p className="mt-2 max-w-2xl text-sm leading-6 text-emerald-50/90">
                      {request.description || 'No extra description provided for this lesson request.'}
                    </p>
                  </div>
                </div>

                <div className="shrink-0">
                  <div className="rounded-2xl bg-white/10 p-2 backdrop-blur-sm">
                    <StatusBadge status={request.status} />
                  </div>
                </div>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <DetailItem
                icon={Hash}
                label="Request ID"
                value={request.id || 'N/A'}
                muted={!request.id}
              />
              <DetailItem
                icon={BookOpen}
                label="Subject"
                value={request.subject || 'Mathematics'}
                muted={!request.subject}
              />
              <DetailItem
                icon={CalendarClock}
                label="Duration"
                value={request.duration || 'N/A'}
                muted={!request.duration}
              />
              <DetailItem
                icon={UserRound}
                label="Tutor"
                value={request.tutorName || 'Not assigned yet'}
                muted={!request.tutorName}
              />
              <DetailItem
                icon={BookOpen}
                label="Quoted total"
                value={request.pricingSnapshot?.totalAmount
                  ? `Original R${Number(request.pricingSnapshot.originalPrice ?? request.pricingSnapshot.totalAmount).toFixed(2)} • Discount R${Number(request.pricingSnapshot.discountApplied || 0).toFixed(2)} • Pay R${Number(request.pricingSnapshot.finalPrice ?? request.pricingSnapshot.totalAmount).toFixed(2)}`
                  : 'Not quoted'}
                muted={!request.pricingSnapshot?.totalAmount}
              />
              <DetailItem
                icon={CalendarClock}
                label="Session details"
                value={relatedSession
                  ? `Status ${relatedSession.status || 'waiting_student'} • Length ${relatedSession.duration || request.duration || 'TBD'}`
                  : 'Session will appear here once tutor accepts'}
                muted={!relatedSession}
              />
              <DetailItem
                icon={FileText}
                label="OCR diagnostics"
                value={extractionEntries.length
                  ? extractionEntries.map((entry) => `${entry.fileName || 'Attachment'}: ${entry.providerRoute || entry.extractionMethod || 'unknown'}`).join(' | ')
                  : 'No OCR diagnostics saved'}
                muted={!extractionEntries.length}
              />
            </div>

            <div className="grid gap-4 lg:grid-cols-[1.35fr_0.95fr]">
              <div className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm">
                <div className="mb-4 flex items-center gap-2">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
                    <FileText className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-zinc-900">Lesson description</h3>
                    <p className="text-sm text-zinc-500">More context about what you requested</p>
                  </div>
                </div>

                <div className="rounded-2xl border border-zinc-100 bg-zinc-50 p-4">
                  <p className="text-sm leading-7 text-zinc-700">
                    {request.description || 'No extra description provided.'}
                  </p>
                </div>
              </div>

              <div className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm">
                <div className="mb-4 flex items-center gap-2">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
                    <Paperclip className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-zinc-900">Attachments</h3>
                    <p className="text-sm text-zinc-500">Uploaded files for this request</p>
                  </div>
                </div>

                {attachments.length ? (
                  <div className="space-y-3">
                    {attachments.map((file, index) => (
                      <a
                        key={`${file.fileName || 'attachment'}-${index}`}
                        href={file.downloadUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="group flex items-center justify-between rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 transition hover:border-emerald-300 hover:bg-emerald-50"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-zinc-800 group-hover:text-emerald-700">
                            {file.fileName || `Attachment ${index + 1}`}
                          </p>
                          <p className="text-xs text-zinc-500">Open file</p>
                        </div>
                        <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-emerald-700 shadow-sm">
                          View
                        </span>
                      </a>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-zinc-200 bg-zinc-50 px-4 py-8 text-center">
                    <Paperclip className="mx-auto mb-3 h-6 w-6 text-zinc-400" />
                    <p className="text-sm font-medium text-zinc-700">No attachments uploaded</p>
                    <p className="mt-1 text-xs text-zinc-500">
                      Any files you upload with a request will appear here.
                    </p>
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <Link
                to="/app/student/requests"
                className="inline-flex items-center gap-2 rounded-2xl border border-zinc-300 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-800 transition hover:border-zinc-400 hover:bg-zinc-100"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to My Requests
              </Link>
            </div>
          </div>
        ) : (
          <div className="rounded-3xl border border-dashed border-zinc-200 bg-zinc-50 px-6 py-12 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-200 text-zinc-500">
              <FileText className="h-6 w-6" />
            </div>
            <h3 className="text-lg font-bold text-zinc-900">Request not found</h3>
            <p className="mt-2 text-sm text-zinc-600">
              We could not find the class request you are looking for.
            </p>
            <div className="mt-6">
              <Link
                to="/app/student/requests"
                className="inline-flex items-center gap-2 rounded-2xl border border-zinc-300 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-800 transition hover:border-zinc-400 hover:bg-zinc-100"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to My Requests
              </Link>
            </div>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
