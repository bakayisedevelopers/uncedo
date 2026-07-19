import { useEffect, useState, useRef } from 'react';
import { FileText, RefreshCw, Upload, X } from 'lucide-react';
import { subscribeToUserAiLogs } from '../../services/aiLogService';
import {
  deleteTutorDocument,
  normalizeDocumentStatus,
  retryTutorDocument,
  subscribeToTutorDocuments,
  uploadTutorDocument,
} from '../../services/tutorDocumentService';

const STATUS_STYLES = {
  UPLOADED: 'border-sky-200 bg-sky-50 text-sky-700',
  PROCESSING: 'border-amber-200 bg-amber-50 text-amber-700',
  VERIFIED: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  FAILED: 'border-rose-200 bg-rose-50 text-rose-700',
};

function getDocumentSummary(document) {
  const status = normalizeDocumentStatus(document.status);
  const qualifiedSubjects = Array.isArray(document.qualifiedSubjects) ? document.qualifiedSubjects : [];
  const extractedSubjects = Array.isArray(document.extractedSubjects) ? document.extractedSubjects : [];

  if (status === 'FAILED') {
    return 'Document processing failed. Upload another file or try again later.';
  }

  if (status === 'UPLOADED' || status === 'PROCESSING') {
    return 'Waiting for subject verification';
  }

  if (qualifiedSubjects.length) {
    return `${qualifiedSubjects.length} qualified subject(s)`;
  }

  if (extractedSubjects.length) {
    return 'Processed, but no subjects at 60% or higher were found.';
  }

  return 'Processed, but no supported subjects were detected.';
}

export default function TutorDocumentsManager({ user, onMessage }) {
  const [documents, setDocuments] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState('');
  const [retryingDocumentId, setRetryingDocumentId] = useState('');
  const [deletingDocumentId, setDeletingDocumentId] = useState('');
  const loggedDocsRef = useRef(new Set());
  const loggedAiLogsRef = useRef(new Set());

  useEffect(() => {
    documents.forEach((doc) => {
      if ((doc.aiPrompt || doc.aiRawOutput) && !loggedDocsRef.current.has(doc.id)) {
        console.log(`=== TUTOR RESULTS EXTRACTION AI PROMPT (${doc.fileName || doc.id}) ===`);
        console.log(doc.aiPrompt);
        console.log(`=== TUTOR RESULTS EXTRACTION AI OUTPUT (${doc.fileName || doc.id}) ===`);
        console.log(doc.aiRawOutput);
        loggedDocsRef.current.add(doc.id);
      }
    });
  }, [documents]);

  useEffect(() => {
    if (!user?.uid) return undefined;

    return subscribeToUserAiLogs(user.uid, (logs) => {
      logs.forEach((log) => {
        if (loggedAiLogsRef.current.has(log.id)) return;
        loggedAiLogsRef.current.add(log.id);
        if (String(log.source || '').startsWith('tutor_results_extraction')) {
          console.log(`=== TUTOR RESULTS EXTRACTION LOG (${log.step || log.id}) ===`);
          console.log(log);
          if (log.prompt) {
            console.log('AI PROMPT:');
            console.log(log.prompt);
          }
          if (log.rawOutput) {
            console.log('AI OUTPUT:');
            console.log(log.rawOutput);
          }
          if (log.error) {
            console.log('AI ERROR:');
            console.log(log.error);
          }
        }
      });
    });
  }, [user?.uid]);

  useEffect(() => {
    if (!user?.uid) return undefined;
    return subscribeToTutorDocuments(user.uid, setDocuments);
  }, [user?.uid]);

  const uploadDocuments = async (event) => {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (!files.length) return;

    setIsUploading(true);
    setError('');
    try {
      await Promise.all(files.map((file) => uploadTutorDocument({ uid: user.uid, file })));
      onMessage?.('Result document uploaded. Processing will update automatically.');
    } catch (uploadError) {
      setError(uploadError.message || 'Unable to upload result document.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleRetry = async (documentId) => {
    setRetryingDocumentId(documentId);
    setError('');
    try {
      await retryTutorDocument(documentId);
      onMessage?.('Document queued for subject verification again.');
    } catch (retryError) {
      setError(retryError.message || 'Unable to retry document processing.');
    } finally {
      setRetryingDocumentId('');
    }
  };

  const handleDelete = async (documentRecord) => {
    setDeletingDocumentId(documentRecord.id);
    setError('');
    try {
      await deleteTutorDocument(documentRecord);
      onMessage?.('Document deleted.');
    } catch (deleteError) {
      setError(deleteError.message || 'Unable to delete document.');
    } finally {
      setDeletingDocumentId('');
    }
  };

  return (
    <div className="space-y-4">
      <label className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-5 text-center transition hover:bg-zinc-100">
        <Upload className="h-5 w-5 text-brand" />
        <span className="mt-2 text-sm font-semibold text-zinc-900">
          {isUploading ? 'Uploading...' : 'Upload result documents'}
        </span>
        <span className="mt-1 text-xs text-zinc-500">PDF, JPG, JPEG, or PNG. You can upload more later.</span>
        <input
          type="file"
          accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/*"
          multiple
          disabled={isUploading}
          onChange={uploadDocuments}
          className="hidden"
        />
      </label>

      {error ? <p className="text-sm text-rose-600">{error}</p> : null}

      <div className="space-y-2">
        {documents.length ? documents.map((document) => {
          const status = normalizeDocumentStatus(document.status);
          const canDelete = status !== 'VERIFIED';
          return (
            <div key={document.id} className="rounded-2xl border border-zinc-200 bg-white p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <FileText className="mt-0.5 h-5 w-5 shrink-0 text-zinc-500" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-zinc-900">{document.fileName}</p>
                    <p className="mt-1 text-xs text-zinc-500">
                      {getDocumentSummary(document)}
                    </p>
                    {document.error ? <p className="mt-1 text-xs text-rose-600">{document.error}</p> : null}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleRetry(document.id)}
                    disabled={retryingDocumentId === document.id}
                    className="inline-flex items-center gap-1 rounded-full border border-zinc-300 px-2 py-1 text-[11px] font-bold text-zinc-700 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50"
                    title="Retry subject and mark detection"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${retryingDocumentId === document.id ? 'animate-spin' : ''}`} />
                    Retry
                  </button>
                  {canDelete ? (
                    <button
                      type="button"
                      onClick={() => handleDelete(document)}
                      disabled={deletingDocumentId === document.id}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-rose-200 text-rose-600 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
                      title="Delete document"
                      aria-label={`Delete ${document.fileName || 'document'}`}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                  <span className={`shrink-0 rounded-full border px-2 py-1 text-[11px] font-bold ${STATUS_STYLES[status]}`}>
                    {status}
                  </span>
                </div>
              </div>
            </div>
          );
        }) : (
          <p className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-600">
            Upload your school results so Parakleo can verify which subjects you qualify to tutor.
          </p>
        )}
      </div>
    </div>
  );
}
