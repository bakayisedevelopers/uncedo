import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Camera,
  CheckCircle2,
  ChevronRight,
  CreditCard,
  FileText,
  ImageIcon,
  RefreshCw,
  Send,
  X,
} from 'lucide-react';
import OnboardingStatusBanner from '../../../components/app/OnboardingStatusBanner';
import ReferralShareButton from '../../../components/app/ReferralShareButton';
import { useAuth } from '../../../hooks/useAuth';
import { useLiveUserProfile } from '../../../hooks/useLiveUserProfile';
import { useStudentRequests } from '../../../hooks/useClassRequests';
import { useStudentSessions } from '../../../hooks/useSessions';
import { useSubjectCatalog } from '../../../hooks/useSubjectCatalog';
import { subscribeToUserAiLogs } from '../../../services/aiLogService';
import { detectAttachmentType, extractAttachments } from '../../../services/attachmentExtractionService';
import { createClassRequest } from '../../../services/classRequestService';
import { fetchPricingQuote } from '../../../services/pricingService';
import { finalizeSessionClosure } from '../../../services/sessionService';
import { uploadUserFile } from '../../../services/storageService';
import { estimateFreeMinutePricing } from '../../../services/studentGrowthService';
import { recordUnsupportedSubjectRequest } from '../../../services/unsupportedSubjectService';
import { recordAcademicBrainFeedback } from '../../../services/academicBrainFeedbackService';
import {
  buildSubjectClassificationInput,
  classifySubjectFromText,
} from '../../../services/subjectClassificationService';
import { DEFAULT_LESSON_DURATION, LESSON_DURATION_OPTIONS, formatRand } from '../../../utils/pricing';
import { REQUEST_STATUSES } from '../../../utils/requestStatus';
import { getStudentOnboardingStatus } from '../../../utils/onboarding';

const QUICK_REQUEST_SUGGESTIONS = [
  { label: 'I need help with homework', value: 'I need help with homework.' },
  { label: 'I need help preparing for an exam', value: 'I need help preparing for an exam.' },
  { label: 'I need help with an assignment', value: 'I need help with an assignment.' },
  { label: 'I need a normal lesson', value: 'I need a normal lesson.' },
];

const PENDING_STATUS_REDIRECT_KEY = 'parakleo_pending_request_status_redirect';

const SUBJECT_ALIASES = {
  Mathematics: ['math', 'mathematics', 'algebra', 'geometry', 'calculus', 'trigonometry', 'statistics', 'stats'],
};

function resolveSubjectFromText(text, supportedSubjects = []) {
  const normalizedText = String(text || '').toLowerCase();
  if (!normalizedText.trim()) return '';

  const matched = supportedSubjects.find((subject) => {
    const aliases = SUBJECT_ALIASES[subject.value] || [];
    const normalizedLabel = subject.label.toLowerCase();
    const normalizedValue = subject.value.toLowerCase();
    const checks = [normalizedLabel, normalizedValue, ...aliases];
    return checks.some((term) => normalizedText.includes(term));
  });

  return matched?.value || '';
}

function getAttachmentKey(file) {
  return `${file.name}-${file.size}-${file.lastModified}`;
}

function truncateFileName(fileName, maxLength = 28) {
  const normalizedFileName = String(fileName || '').trim();
  if (!normalizedFileName) return 'Attachment';
  if (normalizedFileName.length <= maxLength) return normalizedFileName;
  return `${normalizedFileName.slice(0, maxLength)}...`;
}

function getExtractionStatusLabel(status = '') {
  const normalizedStatus = String(status || '').toLowerCase();

  if (normalizedStatus === 'extracting' || normalizedStatus === 'ocr processing') {
    return 'Processing...';
  }

  if (normalizedStatus === 'text extracted') {
    return 'Done';
  }

  if (normalizedStatus === 'fallback needed') {
    return 'Needs extra processing';
  }

  if (normalizedStatus === 'extraction weak') {
    return 'Low confidence';
  }

  return 'Scanning...';
}

async function loadPdfJsForPreview() {
  const pdfjs = await import(/* @vite-ignore */ 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs';
  return pdfjs;
}

async function buildPdfPageImageAssets(file) {
  const pdfjs = await loadPdfJsForPreview();
  const pdfData = await file.arrayBuffer();
  const pdfDocument = await pdfjs.getDocument({ data: pdfData }).promise;
  const assets = [];

  for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber += 1) {
    const page = await pdfDocument.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1.35 });
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) continue;
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    await page.render({ canvasContext: context, viewport }).promise;
    assets.push({
      id: `${file.name}-pdf-page-${pageNumber}`,
      fileName: `${file.name} page ${pageNumber}`,
      src: canvas.toDataURL('image/png'),
      mimeType: 'image/png',
      width: canvas.width,
      height: canvas.height,
      pageNumber,
    });
  }

  return assets;
}

async function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Unable to read file as image data URL.'));
    reader.readAsDataURL(file);
  });
}

async function loadImageFromDataUrl(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Unable to load source image for cropping.'));
    image.src = src;
  });
}

function toPixelRect(block, width, height) {
  const xRaw = Number(block?.bbox?.x || 0);
  const yRaw = Number(block?.bbox?.y || 0);
  const wRaw = Number(block?.bbox?.width || 0);
  const hRaw = Number(block?.bbox?.height || 0);
  const isNormalized = xRaw >= 0 && yRaw >= 0 && wRaw > 0 && hRaw > 0 && xRaw <= 1 && yRaw <= 1 && wRaw <= 1.2 && hRaw <= 1.2;

  const x = Math.max(0, Math.round(isNormalized ? xRaw * width : xRaw));
  const y = Math.max(0, Math.round(isNormalized ? yRaw * height : yRaw));
  const w = Math.max(1, Math.round(isNormalized ? wRaw * width : wRaw));
  const h = Math.max(1, Math.round(isNormalized ? hRaw * height : hRaw));
  return {
    x: Math.min(width - 1, x),
    y: Math.min(height - 1, y),
    w: Math.min(width, w),
    h: Math.min(height, h),
  };
}

async function cropDiagramAssetsFromBlocks({ blocks = [], sourceImages = [], fileName = '' }) {
  const relevantBlocks = (blocks || [])
    .filter((block) => ['diagram', 'figure', 'graph', 'image', 'chart', 'equation', 'formula', 'table'].includes(String(block?.type || '').toLowerCase()))
    .slice(0, 24);
  if (!relevantBlocks.length || !sourceImages.length) return [];

  const assets = [];
  for (let index = 0; index < relevantBlocks.length; index += 1) {
    const block = relevantBlocks[index];
    const pageNumber = Number(block?.pageNumber || 1);
    const pageSource = sourceImages.find((entry) => Number(entry?.pageNumber || 1) === pageNumber) || sourceImages[0];
    if (!pageSource?.src) continue;
    try {
      const image = await loadImageFromDataUrl(pageSource.src);
      const rect = toPixelRect(block, image.naturalWidth || image.width, image.naturalHeight || image.height);
      const canvas = document.createElement('canvas');
      canvas.width = rect.w;
      canvas.height = rect.h;
      const context = canvas.getContext('2d');
      if (!context) continue;
      context.drawImage(image, rect.x, rect.y, rect.w, rect.h, 0, 0, rect.w, rect.h);
      assets.push({
        id: `${fileName}-crop-${pageNumber}-${index + 1}`,
        fileName: `${fileName} crop ${index + 1}`,
        src: canvas.toDataURL('image/png'),
        mimeType: 'image/png',
        width: rect.w,
        height: rect.h,
        pageNumber,
      });
    } catch (error) {
      console.error('[attachmentExtraction] block crop failed', {
        fileName,
        pageNumber,
        message: error?.message,
      });
    }
  }
  return assets;
}

function renderExtractionStatusIcon(status = '') {
  const normalizedStatus = String(status || '').toLowerCase();

  if (normalizedStatus === 'extracting' || normalizedStatus === 'ocr processing') {
    return (
      <span
        className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-400"
        aria-label="Text extraction in progress"
        title="Text extraction in progress"
      >
        <RefreshCw className="h-4 w-4 animate-spin" />
      </span>
    );
  }

  if (normalizedStatus === 'text extracted') {
    return (
      <span
        className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-400"
        aria-label="Text extraction completed"
        title="Text extraction completed"
      >
        <CheckCircle2 className="h-4 w-4" />
      </span>
    );
  }

  return null;
}

function buildBoardPreparationSource({ attachments = [], uploadedAttachments = [], attachmentExtractionByKey = {} }) {
  const attachmentExtractions = attachments.map((file, index) => {
    const fileKey = getAttachmentKey(file);
    const extraction = attachmentExtractionByKey[fileKey] || null;
    const uploadedAttachment = uploadedAttachments[index] || null;

    return {
      fileName: file.name,
      uploadedAttachment,
      extractedText: String(extraction?.extractedText || extraction?.text || '').trim(),
      text: String(extraction?.text || extraction?.extractedText || '').trim(),
      extractionMethod: extraction?.extractionMethod || '',
      extractionQuality: extraction?.extractionQuality || '',
      fileType: extraction?.fileType || '',
      source: extraction?.source || extraction?.fileType || '',
      selectedPages: Array.isArray(extraction?.selectedPages) ? extraction.selectedPages : [],
      scannedPdfDetected: Boolean(extraction?.scannedPdfDetected),
      ocrStatus: extraction?.ocrStatus || '',
      success: Boolean(extraction?.success),
      partialSuccess: Boolean(extraction?.partialSuccess),
      pages: Array.isArray(extraction?.pages) ? extraction.pages : [],
      extractedImages: Array.isArray(extraction?.extractedImages) ? extraction.extractedImages : [],
      failedPageCount: Number(extraction?.failedPageCount || 0),
      provider: extraction?.provider || '',
      providerRoute: extraction?.providerRoute || '',
      providerReason: extraction?.providerReason || '',
      confidence: Number(extraction?.confidence || 0),
      geminiSubject: extraction?.geminiSubject || extraction?.structuredData?.geminiSubject || '',
      geminiTopic: extraction?.geminiTopic || extraction?.structuredData?.geminiTopic || '',
      geminiTopics: Array.isArray(extraction?.geminiTopics || extraction?.structuredData?.geminiTopics)
        ? (extraction.geminiTopics || extraction.structuredData.geminiTopics)
        : [],
      geminiEstimatedMinutes: Number(extraction?.geminiEstimatedMinutes || extraction?.structuredData?.geminiEstimatedMinutes || 0) || 0,
      geminiVisualRegionCount: Number(extraction?.geminiVisualRegionCount || extraction?.structuredData?.geminiVisualRegionCount || 0) || 0,
      structuredData: extraction?.structuredData || null,
      pricing: extraction?.pricing || null,
      cloudVisionPriceUsd: Number(extraction?.cloudVisionPriceUsd || 0) || 0,
      cloudVisionPriceZar: Number(extraction?.cloudVisionPriceZar || 0) || 0,
      fxRateZarPerUsd: Number(extraction?.fxRateZarPerUsd || 0) || 0,
    };
  });

  const extractedText = attachmentExtractions
    .map((item) => item.extractedText || item.text)
    .filter(Boolean)
    .join('\n\n')
    .trim();

  return {
    extractedText,
    attachmentExtractions,
    ocrImageReferences: [],
  };
}

function buildAttachmentUploadFallback(file, error) {
  return {
    fileName: file?.name || 'Attachment',
    contentType: file?.type || '',
    size: Number(file?.size || 0),
    path: '',
    downloadUrl: '',
    uploadError: String(error?.code || error?.message || 'upload_failed'),
  };
}

function withTimeout(promise, timeoutMs, message) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(message)), timeoutMs);
    }),
  ]);
}

async function uploadRequestAttachment({ userId, file }) {
  try {
    const uploadResult = await withTimeout(
      uploadUserFile({
        userId,
        file,
        pathPrefix: 'request-attachments',
      }),
      12000,
      'attachment_upload_timeout',
    );

    return {
      fileName: file.name,
      contentType: file.type || '',
      size: Number(file.size || 0),
      path: uploadResult.objectPath,
      downloadUrl: uploadResult.downloadUrl,
    };
  } catch (error) {
    console.debug('[studentRequestAI] attachment upload skipped; continuing with extracted context', {
      fileName: file?.name || '',
      size: Number(file?.size || 0),
      error: error?.message || String(error || ''),
    });
    return buildAttachmentUploadFallback(file, error);
  }
}

function normalizeEstimatedDuration(estimatedMinutes) {
  const numeric = Number(estimatedMinutes || 0);
  if (!Number.isFinite(numeric) || numeric <= 0) return DEFAULT_LESSON_DURATION;
  return Math.min(90, Math.max(10, Math.round(numeric)));
}

function getDurationOptions(estimatedMinutes) {
  const normalizedEstimate = normalizeEstimatedDuration(estimatedMinutes);
  return Array.from(new Set([...LESSON_DURATION_OPTIONS, normalizedEstimate])).sort((a, b) => a - b);
}

function getReviewTopic({ classifiedTopic, topic, attachments }) {
  if (String(classifiedTopic || '').trim()) return String(classifiedTopic).trim();
  if (String(topic || '').trim()) return String(topic).trim();
  return '';
}

function getRequestFlowState({ onboardingComplete, latestOpenSession, activeOrOngoingRequest }) {
  if (!onboardingComplete) return 'blocked_onboarding';
  if (latestOpenSession) return 'blocked_active_session';
  if (activeOrOngoingRequest) return 'blocked_active_request';
  return 'request_flow';
}

function formatCardLabel(card) {
  if (!card) return 'Saved card';
  const nickname = String(card.nickname || 'card');
  return nickname.charAt(0).toUpperCase() + nickname.slice(1);
}

export default function StudentDashboardPage() {
  const { user } = useAuth();
  const { profile: liveProfile } = useLiveUserProfile(user?.uid);
  const currentUser = liveProfile || user;
  const paymentMethods = currentUser?.paymentMethods || user?.paymentMethods || [];
  const displayName = currentUser?.fullName || currentUser?.displayName || user?.fullName || user?.displayName || 'Student';
  const freeMinutesRemaining = Number(currentUser?.freeMinutesRemaining || user?.freeMinutesRemaining || 0);
  const navigate = useNavigate();
  const textareaRef = useRef(null);
  const attachmentsRef = useRef([]);
  const attachmentExtractionByKeyRef = useRef({});
  const isManualSubjectRef = useRef(false);
  const loggedUnsupportedSubjectsRef = useRef(new Set());
  const extractionOverlayRedirectTimeoutRef = useRef(null);
  const loggedAiLogIdsRef = useRef(new Set());
  const classificationRunCounterRef = useRef(0);

  const [stage, setStage] = useState('input');
  const [advanceIntent, setAdvanceIntent] = useState('');
  const [topic, setTopic] = useState('');
  const [cardId, setCardId] = useState(
    paymentMethods.find((card) => card.isDefault)?.id || paymentMethods[0]?.id || '',
  );
  const [attachments, setAttachments] = useState([]);
  const [attachmentExtractionByKey, setAttachmentExtractionByKey] = useState({});
  const [attachmentExtractionStatusByKey, setAttachmentExtractionStatusByKey] = useState({});
  const [selectedSubject, setSelectedSubject] = useState('');
  const [classifiedTopic, setClassifiedTopic] = useState('');
  const [latestClassification, setLatestClassification] = useState(null);
  const [estimatedMinutes, setEstimatedMinutes] = useState(DEFAULT_LESSON_DURATION);
  const [classificationStatus, setClassificationStatus] = useState('');
  const [classificationState, setClassificationState] = useState('idle');
  const [showSubjectFallback, setShowSubjectFallback] = useState(false);
  const [unsupportedSubjectRequest, setUnsupportedSubjectRequest] = useState(null);
  const [durationMinutes, setDurationMinutes] = useState(DEFAULT_LESSON_DURATION);
  const [hasManualDurationOverride, setHasManualDurationOverride] = useState(false);
  const [isTextEntryOpen, setIsTextEntryOpen] = useState(false);
  const [quote, setQuote] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCancelingSession, setIsCancelingSession] = useState(false);
  const [error, setError] = useState('');
  const [showExtractionOverlay, setShowExtractionOverlay] = useState(false);
  const [showSlowExtractionMessage, setShowSlowExtractionMessage] = useState(false);
  const [extractionOverlayState, setExtractionOverlayState] = useState('idle');
  const [extractionStatusEvents, setExtractionStatusEvents] = useState([]);
  const [extractionErrors, setExtractionErrors] = useState([]);
  const [pendingStatusRequestId, setPendingStatusRequestId] = useState(() => {
    if (typeof window === 'undefined') return '';
    return window.sessionStorage.getItem(PENDING_STATUS_REDIRECT_KEY) || '';
  });

  const openRequestStatus = (requestId, nextTopic = '') => {
    if (!requestId) return;
    navigate(`/app/student/request/${requestId}`, {
      replace: true,
      state: {
        requestId,
        topic: nextTopic,
      },
    });
  };
  const { requests } = useStudentRequests(user?.uid);
  const { sessions } = useStudentSessions(user?.uid);
  const { subjectOptions } = useSubjectCatalog();

  useEffect(() => {
    if (!user?.uid) return undefined;

    return subscribeToUserAiLogs(user.uid, (logs) => {
      logs.forEach((log) => {
        if (loggedAiLogIdsRef.current.has(log.id)) return;
        loggedAiLogIdsRef.current.add(log.id);
        if (log.source === 'student_subject_classification') {
          console.log(`=== STUDENT SUBJECT CLASSIFICATION DEBUG INPUT (${log.id}) ===`);
          if (log.prompt) console.log(log.prompt);
          console.log(`=== STUDENT SUBJECT CLASSIFICATION DEBUG OUTPUT (${log.id}) ===`);
          if (log.rawOutput) console.log(log.rawOutput);
          if (log.error) console.log(`=== STUDENT SUBJECT CLASSIFICATION DEBUG ERROR (${log.id}) ===`);
          if (log.error) console.log(log.error);
        }
      });
    });
  }, [user?.uid]);

  const onboardingStatus = getStudentOnboardingStatus(currentUser || user);
  const activeOrOngoingRequest = requests.find((request) => [
    REQUEST_STATUSES.PENDING,
    REQUEST_STATUSES.MATCHING,
    REQUEST_STATUSES.OFFERED,
    REQUEST_STATUSES.ACCEPTED,
    REQUEST_STATUSES.WAITING_STUDENT,
    REQUEST_STATUSES.IN_PROGRESS,
    REQUEST_STATUSES.IN_SESSION,
  ].includes(request.status));
  const latestOpenSession = sessions.find((session) => ['waiting_student', 'in_progress'].includes(session.status));
  const flowState = getRequestFlowState({
    onboardingComplete: onboardingStatus.complete,
    latestOpenSession,
    activeOrOngoingRequest,
  });

  const hasTypedText = Boolean(topic.trim());
  const hasRequestContent = hasTypedText || attachments.length > 0;
  const hasRunningExtraction = attachments.some((file) => {
    const fileKey = getAttachmentKey(file);
    const status = attachmentExtractionStatusByKey[fileKey];
    return status === 'extracting' || status === 'ocr processing';
  });
  const reviewTopic = getReviewTopic({ classifiedTopic, topic, attachments });
  const durationOptions = useMemo(() => getDurationOptions(estimatedMinutes), [estimatedMinutes]);
  const pricingPreview = quote
    ? estimateFreeMinutePricing({
        originalPrice: quote.totalAmount,
        requestedDurationMinutes: durationMinutes,
        freeMinutesRemaining,
      })
    : null;
  const readyForReview = hasRequestContent
    && !hasRunningExtraction
    && classificationState === 'done'
    && Boolean(estimatedMinutes);
  const canConfirm = readyForReview && Boolean(selectedSubject) && Boolean(cardId) && Boolean(quote) && !isSubmitting;
  const isPricingQuoteError = /pricing quote/i.test(error);
  const pricingStatusLabel = !selectedSubject
    ? 'Select a subject to calculate price.'
    : !quote
      ? 'Preparing price...'
      : '';
  const shouldShowExtractionOverlay = showExtractionOverlay && stage !== 'review';
  const isWaitingForClassification = shouldShowExtractionOverlay && !hasRunningExtraction && classificationState === 'running';

  const resizeTextarea = () => {
    if (!textareaRef.current) return;
    textareaRef.current.style.height = 'auto';
    textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
  };

  const cancelActiveSession = async () => {
    if (!latestOpenSession?.id || isCancelingSession) return;

    const reason = window.prompt('Please tell us why you want to cancel this class.');
    if (reason === null) return;

    const trimmedReason = reason.trim();
    if (!trimmedReason) {
      setError('Please enter a cancellation reason before canceling the class.');
      return;
    }

    setError('');
    setIsCancelingSession(true);
    try {
      await finalizeSessionClosure(latestOpenSession, {
        closureType: 'canceled_during',
        canceledBy: 'student',
        canceledReason: trimmedReason,
      });
    } catch (nextError) {
      setError(nextError.message || 'Unable to cancel this class right now.');
    } finally {
      setIsCancelingSession(false);
    }
  };

  const refreshQuote = async (minutes, subject = selectedSubject) => {
    const nextSubject = String(subject || selectedSubject || '').trim();
    if (!nextSubject) {
      setQuote(null);
      return null;
    }
    const nextQuote = await fetchPricingQuote({
      durationMinutes: minutes,
      subject: nextSubject,
    });
    setQuote(nextQuote);
    return nextQuote;
  };

  const recordUnsupportedSubjectOnce = async () => {
    const subject = unsupportedSubjectRequest?.subject;
    if (!subject) return;
    if (unsupportedSubjectRequest?.recorded) return;

    const normalizedKey = subject.toLowerCase();
    if (loggedUnsupportedSubjectsRef.current.has(normalizedKey)) return;
    loggedUnsupportedSubjectsRef.current.add(normalizedKey);

    try {
      await recordUnsupportedSubjectRequest({
        subject,
        inputText: unsupportedSubjectRequest.inputText || topic,
        uid: user?.uid,
      });
    } catch (recordError) {
      console.debug('[subjectClassification] unsupported subject logging failed', {
        error: recordError?.message,
      });
    }
  };

  const maybeAdvanceToReview = (intent = '') => {
    if (flowState !== 'request_flow') return;
    if (unsupportedSubjectRequest?.subject) {
      console.debug('[studentRequestAI] unsupported subject detected; continuing to review for manual correction', {
        subject: unsupportedSubjectRequest.subject,
        intent,
        topic,
      });
      recordUnsupportedSubjectOnce();
    }
    if (!readyForReview) {
      setAdvanceIntent(intent || 'text');
      return;
    }
    setAdvanceIntent('');
    setStage('review');
  };

  const onTopicChange = (event) => {
    const nextTopic = event.target.value;
    setIsTextEntryOpen(true);
    setTopic(nextTopic);
    setStage('input');
    setAdvanceIntent('');
    setError('');
    setUnsupportedSubjectRequest(null);
    console.debug('[studentRequestAI] topic changed', {
      topic: nextTopic,
      attachmentCount: attachments.length,
    });
    if (!isManualSubjectRef.current) {
      setSelectedSubject(resolveSubjectFromText(nextTopic, subjectOptions));
    }
    resizeTextarea();
  };

  const applySuggestion = (value) => {
    setIsTextEntryOpen(true);
    setTopic(value);
    setStage('input');
    setAdvanceIntent('');
    setError('');
    setUnsupportedSubjectRequest(null);
    console.debug('[studentRequestAI] quick suggestion applied', {
      topic: value,
    });
    if (!isManualSubjectRef.current) {
      setSelectedSubject(resolveSubjectFromText(value, subjectOptions));
    }
    setTimeout(() => resizeTextarea(), 0);
  };

  const onFileChange = async (event) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;

    const validFiles = files.filter((file) => file.type.startsWith('image/') || file.type === 'application/pdf');
    if (!validFiles.length) {
      event.target.value = '';
      return;
    }

    const existingKeys = new Set(attachmentsRef.current.map((file) => getAttachmentKey(file)));
    const newFilesForExtraction = validFiles.filter((file) => !existingKeys.has(getAttachmentKey(file)));

    if (!newFilesForExtraction.length) {
      event.target.value = '';
      return;
    }

    setStage('input');
    setAdvanceIntent('attachment');
    setError('');
    setUnsupportedSubjectRequest(null);
    setShowExtractionOverlay(true);
    setShowSlowExtractionMessage(false);
    setExtractionOverlayState('processing');
    setExtractionStatusEvents([
      { ts: Date.now(), phase: 'start', label: 'Upload started', level: 'info' },
    ]);
    setExtractionErrors([]);

    const nextAttachments = [...attachmentsRef.current, ...newFilesForExtraction];
    attachmentsRef.current = nextAttachments;
    setAttachments(nextAttachments);
    setAttachmentExtractionStatusByKey((prev) => {
      const next = { ...prev };
      newFilesForExtraction.forEach((file) => {
        next[getAttachmentKey(file)] = 'extracting';
      });
      return next;
    });

    const extractionRunId = classificationRunCounterRef.current + 1;
    classificationRunCounterRef.current = extractionRunId;

    try {
      setClassificationState('running');
      setClassificationStatus('Analyzing your request...');
      const extractedByKey = {};
      await extractAttachments(newFilesForExtraction, (result, index) => {
        if (classificationRunCounterRef.current !== extractionRunId) return;
        const file = newFilesForExtraction[index];
        const fileKey = getAttachmentKey(file);
        extractedByKey[fileKey] = result;
        setAttachmentExtractionByKey((prev) => ({ ...prev, [fileKey]: result }));
        setAttachmentExtractionStatusByKey((prev) => ({
          ...prev,
          [fileKey]: result.success ? 'text extracted' : 'extraction weak',
        }));
      }, (statusEvent) => {
        if (classificationRunCounterRef.current !== extractionRunId) return;
        setExtractionStatusEvents((prev) => [...prev.slice(-11), statusEvent]);
        if (statusEvent?.level === 'error') {
          setExtractionErrors((prev) => [...prev, `${statusEvent?.fileName || 'file'}: ${statusEvent?.details?.message || statusEvent?.label || 'Error'}`]);
        }
      });

      for (const file of newFilesForExtraction) {
        if (classificationRunCounterRef.current !== extractionRunId) break;
        const fileKey = getAttachmentKey(file);
        const currentResult = extractedByKey[fileKey];
        if (!currentResult) continue;

        try {
          let nextResult = currentResult;
          const sourceImages = [];
          if (detectAttachmentType(file) === 'pdf') {
            try {
              const pdfPageImages = await buildPdfPageImageAssets(file);
              if (pdfPageImages.length) {
                const existingImages = Array.isArray(nextResult?.extractedImages) ? nextResult.extractedImages : [];
                sourceImages.push(...pdfPageImages);
                nextResult = {
                  ...nextResult,
                  extractedImages: [...existingImages, ...pdfPageImages],
                };
              }
            } catch (pdfPreviewError) {
              console.error('[attachmentExtraction] pdf preview image generation failed', {
                fileName: file?.name,
                message: pdfPreviewError?.message,
              });
              setExtractionErrors((prev) => [
                ...prev,
                `PDF page render failed for ${file?.name || 'file'}: ${pdfPreviewError?.message || 'Unknown error'}`,
              ]);
            }
          } else if (detectAttachmentType(file) === 'image') {
            try {
              const src = await readFileAsDataUrl(file);
              sourceImages.push({
                id: `${file.name}-page-1`,
                fileName: `${file.name} source`,
                src,
                mimeType: file.type || 'image/png',
                pageNumber: 1,
              });
            } catch (imageSourceError) {
              console.error('[attachmentExtraction] image source conversion failed', {
                fileName: file?.name,
                message: imageSourceError?.message,
              });
            }
          }

          const structuredBlocks = Array.isArray(nextResult?.structuredData?.blocks) ? nextResult.structuredData.blocks : [];
          if (structuredBlocks.length && sourceImages.length) {
            const crops = await cropDiagramAssetsFromBlocks({
              blocks: structuredBlocks,
              sourceImages,
              fileName: file?.name || 'attachment',
            });
            if (crops.length) {
              const existingImages = Array.isArray(nextResult?.extractedImages) ? nextResult.extractedImages : [];
              nextResult = {
                ...nextResult,
                extractedImages: [...existingImages, ...crops],
              };
              setExtractionStatusEvents((prev) => [
                ...prev.slice(-11),
                { ts: Date.now(), phase: 'diagram_cropping', label: `Diagram cropping metadata applied (${crops.length})`, level: 'info' },
              ]);
            }
          }

          extractedByKey[fileKey] = nextResult;
          setAttachmentExtractionByKey((prev) => ({ ...prev, [fileKey]: nextResult }));
        } catch (enrichmentError) {
          console.error('[attachmentExtraction] enrichment failed; continuing with OCR output', {
            fileName: file?.name,
            message: enrichmentError?.message,
          });
          setExtractionErrors((prev) => [
            ...prev,
            `${file?.name || 'file'}: enrichment failed; continuing with OCR text`,
          ]);
        }
      }

      if (classificationRunCounterRef.current !== extractionRunId) {
        return;
      }

      const mergedExtractions = { ...attachmentExtractionByKeyRef.current, ...extractedByKey };
      const attachmentExtractions = nextAttachments
        .map((file) => mergedExtractions[getAttachmentKey(file)])
        .filter(Boolean);

      console.log('[studentRequestAI] extracted text from backend before classification', {
        attachmentCount: attachmentExtractions.length,
        extractedTextByAttachment: attachmentExtractions.map((entry, index) => ({
          index,
          fileName: entry?.fileName || '',
          textLength: Number(entry?.textLength || String(entry?.extractedText || entry?.text || '').length || 0),
          extractedText: String(entry?.extractedText || entry?.text || ''),
          extractionMethod: entry?.extractionMethod || '',
          provider: entry?.provider || '',
          providerRoute: entry?.providerRoute || '',
          providerReason: entry?.providerReason || '',
          errorMessage: entry?.errorMessage || '',
        })),
      });

      const supportedCatalog = subjectOptions;
      const classificationInput = buildSubjectClassificationInput({
        typedText: topic,
        attachmentExtractions,
        supportedSubjects: supportedCatalog,
      });

      const result = await classifySubjectFromText({
        inputText: classificationInput.combinedText,
        inputPayload: classificationInput.structuredPayload,
        supportedSubjects: supportedCatalog,
      });

      const nextEstimatedMinutes = normalizeEstimatedDuration(result.estimatedMinutes);
      setLatestClassification(result || null);
      setClassifiedTopic(result.topic || '');
      setEstimatedMinutes(nextEstimatedMinutes);
      setClassificationState('done');
      setExtractionStatusEvents((prev) => [
        ...prev.slice(-11),
        { ts: Date.now(), phase: 'subject_detection', label: 'Subject detection', level: 'info' },
        { ts: Date.now(), phase: 'time_estimation', label: 'Time estimation', level: 'info' },
        { ts: Date.now(), phase: 'topics_detected', label: 'Topics detected', level: 'info' },
      ]);

      const detectedSubject = result.subject || '';
      if (detectedSubject) {
        if (!isManualSubjectRef.current) {
          setSelectedSubject(detectedSubject);
        }
        setClassificationStatus(
          result.needsManualSubjectSelection || result.subjectConfidence === 'low'
            ? 'Subject detected. Please confirm before sending.'
            : 'Subject and study focus detected from your request.',
        );
      } else {
        if (!isManualSubjectRef.current) {
          setSelectedSubject('');
        }
        setClassificationStatus('Choose the subject manually before sending.');
      }

      if (result.unsupportedSubjectRequested && result.unsupportedSubject) {
        setUnsupportedSubjectRequest({
          subject: result.unsupportedSubject,
          inputText: topic,
          recorded: Boolean(result.unsupportedSubjectRecorded),
        });
      } else {
        setUnsupportedSubjectRequest(null);
      }

      if (!hasManualDurationOverride) {
        setDurationMinutes(nextEstimatedMinutes);
      }
    } catch (err) {
      console.error(err);
      setError(err.message || 'Extraction failed. Please try again or upload a clearer image.');
      setExtractionStatusEvents((prev) => [...prev.slice(-11), { ts: Date.now(), phase: 'fatal', label: 'Extraction failed', level: 'error' }]);
      setExtractionErrors((prev) => [...prev, err.message || 'Extraction failed']);
      setClassificationState('done');
      setClassificationStatus('Choose the subject manually before sending.');
      setAttachmentExtractionStatusByKey((prev) => {
        const next = { ...prev };
        nextAttachments.forEach((file) => {
          next[getAttachmentKey(file)] = 'fallback needed';
        });
        return next;
      });
    } finally {
      setExtractionOverlayState('done');
    }
    
    event.target.value = '';
  };

  const removeAttachment = (indexToRemove) => {
    const removed = attachmentsRef.current[indexToRemove];
    if (removed) {
      const removedKey = getAttachmentKey(removed);
      setAttachmentExtractionByKey((current) => {
        const updated = { ...current };
        delete updated[removedKey];
        return updated;
      });
      setAttachmentExtractionStatusByKey((current) => {
        const updated = { ...current };
        delete updated[removedKey];
        return updated;
      });
    }

    const nextAttachments = attachmentsRef.current.filter((_, index) => index !== indexToRemove);
    attachmentsRef.current = nextAttachments;
    setAttachments(nextAttachments);
    setClassifiedTopic('');
    setEstimatedMinutes(DEFAULT_LESSON_DURATION);
    setClassificationStatus('');
    setClassificationState('idle');
    setUnsupportedSubjectRequest(null);
    setQuote(null);
    setError('');
    if (!isManualSubjectRef.current) {
      setSelectedSubject(topic.trim() ? resolveSubjectFromText(topic, subjectOptions) : '');
    }
    if (!nextAttachments.length && !hasManualDurationOverride) {
      setDurationMinutes(DEFAULT_LESSON_DURATION);
    }
    setStage('input');
    setAdvanceIntent(nextAttachments.length ? 'attachment' : '');
  };

  const openAttachmentReview = () => {
    if (stage !== 'input') return;
    if (!readyForReview) {
      setAdvanceIntent('attachment');
      return;
    }
    maybeAdvanceToReview('attachment');
  };

  const confirmRequest = async () => {
    if (!canConfirm) {
      if (unsupportedSubjectRequest?.subject) {
        console.debug('[studentRequestAI] confirm blocked by unsupported subject', {
          subject: unsupportedSubjectRequest.subject,
        });
        recordUnsupportedSubjectOnce();
        setError('Please select a supported subject before confirming.');
        return;
      }
      if (!selectedSubject) {
        setError('Please select a subject before confirming.');
        return;
      }
      if (!quote) {
        setError('Please wait for the price to finish loading before confirming.');
      }
      return;
    }

    setError('');
    setIsSubmitting(true);
    console.debug('[studentRequestAI] submit request started', {
      selectedSubject,
      durationMinutes,
      topic,
      classifiedTopic,
      estimatedMinutes,
      attachmentsCount: attachments.length,
    });

    try {
      const activeQuote = quote || (await refreshQuote(durationMinutes));
      const activePricingPreview = estimateFreeMinutePricing({
        originalPrice: activeQuote.totalAmount,
        requestedDurationMinutes: durationMinutes,
        freeMinutesRemaining,
      });

      const quoteWithDiscount = {
        ...activeQuote,
        originalPrice: activePricingPreview.originalPrice,
        discountApplied: activePricingPreview.discountApplied,
        finalPrice: activePricingPreview.finalPrice,
        discountSource: activePricingPreview.discountSource,
        freeMinutesApplied: activePricingPreview.freeMinutesApplied,
        requestedDurationMinutes: durationMinutes,
      };

      let uploadedAttachments = [];
      if (attachments.length) {
        uploadedAttachments = await Promise.all(
          attachments.map((file) => uploadRequestAttachment({ userId: user.uid, file })),
        );
      }

      const boardPreparationSource = buildBoardPreparationSource({
        attachments,
        uploadedAttachments,
        attachmentExtractionByKey,
      });

      const requestId = await createClassRequest({
        subject: selectedSubject,
        topic: reviewTopic,
        classifiedTopic: classifiedTopic || reviewTopic,
        estimatedMinutes: normalizeEstimatedDuration(estimatedMinutes),
        description: topic.trim(),
        preferredDate: '',
        preferredTime: '',
        duration: `${durationMinutes} minutes`,
        durationMinutes,
        meetingProviderPreference: 'any',
        mode: 'online',
        imageAttachment: uploadedAttachments.map((file) => file.fileName).join(', '),
        attachment: uploadedAttachments[0] || null,
        attachments: uploadedAttachments,
        studentId: user.uid,
        studentName: currentUser?.fullName || currentUser?.displayName || user?.email,
        studentEmail: user.email,
        selectedCardId: cardId,
        pricingSnapshot: quoteWithDiscount,
        boardPreparationSource,
      });

      if (typeof window !== 'undefined') {
        window.sessionStorage.setItem(PENDING_STATUS_REDIRECT_KEY, requestId);
      }
      setPendingStatusRequestId(requestId);
      openRequestStatus(requestId, reviewTopic);

      const predicted = latestClassification?.academicBrainOutput || null;
      if (predicted) {
        const selectedTopic = String(reviewTopic || '').trim();
        const predictedTopic = String(latestClassification?.topic || '').trim();
        const selectedMinutes = Number(durationMinutes || 0);
        const predictedMinutes = Number(latestClassification?.estimatedMinutes || estimatedMinutes || 0);
        const correctionType = [
          selectedSubject && predicted?.subject?.subjectId && selectedSubject !== predicted.subject.subjectId ? 'subject' : '',
          selectedTopic && predictedTopic && selectedTopic !== predictedTopic ? 'topic' : '',
          selectedMinutes && predictedMinutes && selectedMinutes !== predictedMinutes ? 'minutes' : '',
        ].filter(Boolean).join('|') || 'none';

        recordAcademicBrainFeedback({
          role: 'student',
          country: 'ZA',
          grade: '',
          selectedSubjectId: selectedSubject,
          originalOcrText: String(boardPreparationSource?.extractedText || topic || ''),
          originalOcrBlocks: [],
          predictedOutput: predicted,
          correctedOutput: {
            subjectId: selectedSubject,
            topic: selectedTopic,
            estimatedMinutes: selectedMinutes,
          },
          correctionType,
          engineVersion: String(predicted?.engine?.version || '1.0.0'),
          subjectPackVersions: Array.isArray(predicted?.engine?.subjectPackVersions) ? predicted.engine.subjectPackVersions : [],
          uploadId: requestId,
          sessionId: '',
        }).catch(() => null);
      }

    } catch (requestError) {
      setError(requestError.message || 'Unable to submit request right now.');
      console.debug('[studentRequestAI] submit request failed', {
        error: requestError?.message,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    if (!pendingStatusRequestId) return;
    const targetRequest = requests.find((request) => request.id === pendingStatusRequestId);
    if (!targetRequest) return;
    if (typeof window !== 'undefined') {
      window.sessionStorage.removeItem(PENDING_STATUS_REDIRECT_KEY);
    }
    setPendingStatusRequestId('');
    openRequestStatus(pendingStatusRequestId, targetRequest.topic || topic);
  }, [navigate, pendingStatusRequestId, requests, topic]);

  useEffect(() => {
    if (!paymentMethods.length) {
      setCardId('');
      return;
    }

    const hasCurrentCard = paymentMethods.some((card) => card.id === cardId);
    if (hasCurrentCard) return;
    setCardId(paymentMethods.find((card) => card.isDefault)?.id || paymentMethods[0]?.id || '');
  }, [cardId, paymentMethods]);

  useEffect(() => {
    if (!onboardingStatus.complete) return;
    refreshQuote(durationMinutes).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onboardingStatus.complete]);

  useEffect(() => {
    attachmentsRef.current = attachments;
  }, [attachments]);

  useEffect(() => {
    attachmentExtractionByKeyRef.current = attachmentExtractionByKey;
  }, [attachmentExtractionByKey]);

  useEffect(() => {
    if (flowState !== 'request_flow') {
      setStage('input');
      setAdvanceIntent('');
      return;
    }
    if (!hasRequestContent) {
      setStage('input');
      setAdvanceIntent('');
    }
  }, [flowState, hasRequestContent]);

  useEffect(() => {
    const hasAttachments = attachmentsRef.current.length > 0;
    if (hasAttachments) return;

    const supportedCatalog = subjectOptions;
    const classificationInput = buildSubjectClassificationInput({
      typedText: topic,
      attachmentExtractions: [],
      supportedSubjects: supportedCatalog,
    });

    if (!classificationInput.hasUsableText) {
      setClassifiedTopic('');
      setEstimatedMinutes(DEFAULT_LESSON_DURATION);
      setClassificationStatus('');
      setClassificationState('idle');
      setUnsupportedSubjectRequest(null);
      if (!hasManualDurationOverride) {
        setDurationMinutes(DEFAULT_LESSON_DURATION);
      }
      return;
    }

    const runId = classificationRunCounterRef.current + 1;
    classificationRunCounterRef.current = runId;
    let isCancelled = false;

    setClassificationState('running');
    setClassificationStatus('Analyzing your request...');
    setUnsupportedSubjectRequest(null);

    const timeoutId = setTimeout(async () => {
      try {
        const result = await classifySubjectFromText({
          inputText: classificationInput.combinedText,
          inputPayload: classificationInput.structuredPayload,
          supportedSubjects: supportedCatalog,
        });
        if (isCancelled || classificationRunCounterRef.current !== runId) return;

        const nextEstimatedMinutes = normalizeEstimatedDuration(result.estimatedMinutes);
        setLatestClassification(result || null);
        setClassifiedTopic(result.topic || '');
        setEstimatedMinutes(nextEstimatedMinutes);
        setClassificationState('done');

        const detectedSubject = result.subject || '';
        if (detectedSubject) {
          if (!isManualSubjectRef.current) {
            setSelectedSubject(detectedSubject);
          }
          setClassificationStatus(
            result.needsManualSubjectSelection || result.subjectConfidence === 'low'
              ? 'Subject detected. Please confirm before sending.'
              : 'Subject and study focus detected from your request.',
          );
        } else {
          if (!isManualSubjectRef.current) {
            setSelectedSubject('');
          }
          setClassificationStatus('Choose the subject manually before sending.');
        }

        if (result.unsupportedSubjectRequested && result.unsupportedSubject) {
          setUnsupportedSubjectRequest({
            subject: result.unsupportedSubject,
            inputText: topic,
            recorded: Boolean(result.unsupportedSubjectRecorded),
          });
        } else {
          setUnsupportedSubjectRequest(null);
        }

        if (!hasManualDurationOverride) {
          setDurationMinutes(nextEstimatedMinutes);
        }
      } catch (classificationError) {
        if (isCancelled || classificationRunCounterRef.current !== runId) return;
        setClassificationState('error');
        setClassificationStatus('We could not estimate the request yet. Keep editing or try again.');
      }
    }, 350);

    return () => {
      isCancelled = true;
      clearTimeout(timeoutId);
    };
  }, [topic, hasManualDurationOverride, subjectOptions]);

  useEffect(() => {
    if (!onboardingStatus.complete) return;
    refreshQuote(durationMinutes).catch((quoteError) => {
      setError(quoteError.message || 'Unable to refresh pricing quote.');
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [durationMinutes, selectedSubject]);

  useEffect(() => {
    if (!advanceIntent || !readyForReview) return;
    if (shouldShowExtractionOverlay) return;
    maybeAdvanceToReview(advanceIntent);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [advanceIntent, readyForReview, selectedSubject, flowState, shouldShowExtractionOverlay]);

  useEffect(() => {
    if (!shouldShowExtractionOverlay || extractionOverlayState !== 'processing') {
      setShowSlowExtractionMessage(false);
      return undefined;
    }

    const timeoutId = setTimeout(() => {
      setShowSlowExtractionMessage(true);
    }, 25000);

    return () => clearTimeout(timeoutId);
  }, [shouldShowExtractionOverlay, extractionOverlayState]);

  useEffect(() => {
    if (!shouldShowExtractionOverlay) return undefined;
    if (classificationState === 'running') {
      setExtractionOverlayState('processing');
      return undefined;
    }
    if (hasRunningExtraction) {
      setExtractionOverlayState('processing');
      return undefined;
    }

    setExtractionOverlayState('done');
    setShowSlowExtractionMessage(false);
    return undefined;
  }, [shouldShowExtractionOverlay, hasRunningExtraction, classificationState]);

  useEffect(() => {
    if (!shouldShowExtractionOverlay) return undefined;
    if (hasRunningExtraction || !readyForReview) return undefined;

    if (extractionOverlayRedirectTimeoutRef.current) {
      clearTimeout(extractionOverlayRedirectTimeoutRef.current);
    }

    extractionOverlayRedirectTimeoutRef.current = setTimeout(() => {
      maybeAdvanceToReview(advanceIntent || 'attachment');
    }, 900);

    return () => {
      if (extractionOverlayRedirectTimeoutRef.current) {
        clearTimeout(extractionOverlayRedirectTimeoutRef.current);
        extractionOverlayRedirectTimeoutRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldShowExtractionOverlay, hasRunningExtraction, readyForReview, advanceIntent]);

  useEffect(() => {
    if (stage !== 'review') return undefined;

    setShowExtractionOverlay(false);
    setShowSlowExtractionMessage(false);
    setExtractionOverlayState('idle');
    setExtractionStatusEvents([]);
    setExtractionErrors([]);

    if (extractionOverlayRedirectTimeoutRef.current) {
      clearTimeout(extractionOverlayRedirectTimeoutRef.current);
      extractionOverlayRedirectTimeoutRef.current = null;
    }

    return undefined;
  }, [stage]);

  useEffect(() => () => {
    if (extractionOverlayRedirectTimeoutRef.current) {
      clearTimeout(extractionOverlayRedirectTimeoutRef.current);
    }
  }, []);

  const handleDurationChange = (event) => {
    setHasManualDurationOverride(true);
    setDurationMinutes(Number(event.target.value || DEFAULT_LESSON_DURATION));
    setError('');
  };

  const handleSubjectChange = (event) => {
    isManualSubjectRef.current = true;
    setSelectedSubject(event.target.value);
    setUnsupportedSubjectRequest(null);
    setQuote(null);
    setError('');
  };

  const renderAttachmentRow = (file, index) => {
    const isImage = file.type.startsWith('image/');
    const fileKey = getAttachmentKey(file);
    const extractionStatus = attachmentExtractionStatusByKey[fileKey];
    const extractionStatusIcon = renderExtractionStatusIcon(extractionStatus);
    return (
      <div
        key={`${file.name}-${file.size}-${file.lastModified}-${index}`}
        role="button"
        tabIndex={0}
        onClick={openAttachmentReview}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            openAttachmentReview();
          }
        }}
        className="space-y-2 rounded-3xl border border-zinc-200 bg-white p-3 text-left shadow-sm transition hover:border-emerald-300 hover:bg-emerald-50/40"
        aria-label={`Review ${file.name}`}
      >
        <div className="flex items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-zinc-200 bg-zinc-50 text-zinc-700">
            {isImage ? <ImageIcon className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-zinc-900" title={file.name}>
              {truncateFileName(file.name)}
            </p>
          </div>
          {extractionStatusIcon}
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              removeAttachment(index);
            }}
            className="inline-flex h-9 w-9 items-center justify-center rounded-2xl border border-zinc-200 bg-zinc-50 text-zinc-500 transition hover:text-zinc-900"
            aria-label={`Remove ${file.name}`}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

      </div>
    );
  };

  if (flowState === 'blocked_onboarding') {
    return (
      <div className="space-y-4">
        <OnboardingStatusBanner user={currentUser || user} role="student" />
        <div className="overflow-hidden rounded-[2rem] border border-amber-200 bg-white p-5 shadow-[0_20px_70px_rgba(15,23,42,0.08)]">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-200/80">Complete setup first</p>
          <h1 className="mt-3 text-2xl font-black tracking-tight text-zinc-900">Finish your student profile before requesting a class.</h1>
          <p className="mt-2 text-sm text-zinc-600">{onboardingStatus.message}</p>
          <Link
            to="/app/onboarding?role=student"
            className="mt-5 inline-flex items-center gap-2 rounded-2xl bg-amber-400 px-4 py-3 text-sm font-semibold text-zinc-950 transition hover:bg-amber-300"
          >
            Complete onboarding
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    );
  }

  if (flowState === 'blocked_active_session' || flowState === 'blocked_active_request') {
    const showSession = flowState === 'blocked_active_session' && latestOpenSession;

    return (
      <div className="space-y-4">
        <div className="overflow-hidden rounded-[2rem] border border-zinc-200 bg-white p-5 shadow-[0_20px_70px_rgba(15,23,42,0.08)]">
          <div className="inline-flex items-center rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-200">
            Continue current class
          </div>
          <h1 className="mt-4 text-2xl font-black tracking-tight text-zinc-900">
            {showSession ? 'Your class is already in progress.' : 'You already have a request in progress.'}
          </h1>
          <p className="mt-2 text-sm text-zinc-600">
            {showSession
              ? 'Jump back into the active session instead of starting a new intake.'
              : 'Open the current request status instead of creating another request.'}
          </p>

          <div className="mt-5 rounded-[1.75rem] border border-zinc-200 bg-zinc-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-400">
              {showSession ? (latestOpenSession?.subject || 'Current class') : (activeOrOngoingRequest?.subject || 'Current request')}
            </p>
            <p className="mt-2 text-lg font-bold text-zinc-900">
              {showSession
                ? (latestOpenSession?.topic || 'Live class')
                : (activeOrOngoingRequest?.topic || 'Live request')}
            </p>
            <p className="mt-1 text-sm text-zinc-500">
              {showSession
                ? `${latestOpenSession?.duration || 'Live now'}`
                : `${activeOrOngoingRequest?.statusDetail || 'Tutor matching is still running.'}`}
            </p>
          </div>

          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <Link
              to={showSession ? `/app/session/${latestOpenSession.id}` : `/app/student/request/${activeOrOngoingRequest.id}`}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400"
            >
              {showSession ? 'Continue current class' : 'View current request'}
              <ChevronRight className="h-4 w-4" />
            </Link>
            <Link
              to={showSession ? '/app/student/requests' : '/app/student/requests'}
              className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-100"
            >
              Open my classes
            </Link>
            {showSession ? (
              <button
                type="button"
                disabled={isCancelingSession}
                onClick={cancelActiveSession}
                className="inline-flex items-center justify-center rounded-2xl border border-rose-300 bg-rose-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isCancelingSession ? 'Canceling...' : 'Cancel'}
              </button>
            ) : null}
          </div>
          {showSession && error ? (
            <p className="mt-3 text-sm text-rose-500">{error}</p>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-4">
      <section className="overflow-hidden rounded-[2rem] border border-zinc-200 bg-white/95 shadow-[0_24px_80px_rgba(15,23,42,0.08)] backdrop-blur">
        <div className="relative overflow-hidden p-4 sm:p-5">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.18),_transparent_40%),radial-gradient(circle_at_bottom_right,_rgba(59,130,246,0.14),_transparent_36%)]" />
          <div className="relative space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                {stage !== 'review' ? (
                  <>
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-200/80">Student request</p>
                    <h1 className="mt-2 text-[1.9rem] font-black leading-tight tracking-tight text-transparent bg-gradient-to-r from-emerald-300 via-cyan-200 to-blue-300 bg-clip-text">
                      Hi {displayName.split(' ')[0]}
                    </h1>
                    <p className="mt-2 text-base leading-7 text-zinc-700">
                      <span className="bg-gradient-to-r from-zinc-700 via-emerald-700 to-cyan-700 bg-clip-text text-transparent">
                        Snap homework, upload a worksheet, or describe what you need help with. We&apos;ll estimate the session length, detect the subject, and let you review before confirming.
                      </span>
                    </p>
                    <div className="mt-4 flex items-center gap-3">
                      <label className="inline-flex flex-1 cursor-pointer items-center justify-center rounded-2xl bg-brand px-6 py-3 text-sm font-bold text-white shadow-lg shadow-brand/30 transition hover:bg-brand-dark">
                        <Camera className="mr-2 h-4 w-4" />
                        Take Picture
                        <input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          multiple
                          onChange={onFileChange}
                          className="hidden"
                        />
                      </label>

                      <label className="inline-flex flex-1 cursor-pointer items-center justify-center rounded-2xl border border-brand/30 bg-brand/10 px-6 py-3 text-sm font-bold text-brand transition hover:bg-brand/20">
                        Upload
                        <ChevronRight className="ml-2 h-4 w-4" />
                        <input
                          type="file"
                          accept="image/*,application/pdf"
                          multiple
                          onChange={onFileChange}
                          className="hidden"
                        />
                      </label>
                    </div>

                    <div className="mt-3 space-y-3">
                      {attachments.length ? (
                        <div className="space-y-3">
                          {attachments.map((file, index) => renderAttachmentRow(file, index))}
                        </div>
                      ) : null}

                      <button
                        type="button"
                        onClick={() => setIsTextEntryOpen((current) => !current)}
                        className="flex w-full items-center justify-between rounded-[1.5rem] border border-zinc-200 bg-zinc-50 px-4 py-3 text-left transition hover:bg-zinc-100"
                        aria-expanded={isTextEntryOpen}
                      >
                        <span className="text-sm font-semibold text-zinc-900">Or describe what you need help with</span>
                        <ChevronRight className={`h-4 w-4 text-zinc-500 transition ${isTextEntryOpen ? 'rotate-90' : ''}`} />
                      </button>

                      {isTextEntryOpen ? (
                        <div className="rounded-[1.5rem] border border-zinc-200 bg-zinc-50 p-4">
                          <textarea
                            ref={textareaRef}
                            value={topic}
                            onChange={onTopicChange}
                            placeholder="Type here..."
                            rows={1}
                            className="max-h-[200px] min-h-[64px] w-full resize-none overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-3 text-sm leading-6 text-zinc-900 placeholder:text-zinc-400 outline-none"
                          />
                          <div className="mt-3 flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">Detected subject</p>
                              <p className="mt-1 text-sm text-zinc-700">
                                {selectedSubject || 'Waiting for subject confirmation'}
                              </p>
                              {classificationStatus ? (
                                <p className="mt-1 text-xs text-zinc-500">{classificationStatus}</p>
                              ) : null}
                            </div>
                            <button
                              type="button"
                              onClick={() => maybeAdvanceToReview('text')}
                              disabled={!topic.trim()}
                              className={`inline-flex h-11 items-center justify-center gap-2 rounded-2xl px-4 text-sm font-semibold transition ${
                                topic.trim()
                                  ? 'bg-emerald-500 text-white hover:bg-emerald-400'
                                  : 'bg-zinc-300 text-zinc-700 disabled:cursor-not-allowed'
                              }`}
                            >
                              Continue
                              <ChevronRight className="h-4 w-4" />
                            </button>
                          </div>
                          <div className="mt-4 flex flex-wrap gap-2">
                            {QUICK_REQUEST_SUGGESTIONS.map((option) => (
                              <button
                                key={option.label}
                                type="button"
                                onClick={() => applySuggestion(option.value)}
                                className="rounded-full border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 transition hover:border-emerald-300 hover:bg-emerald-50"
                              >
                                {option.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : null}

                      <ReferralShareButton
                        referralSlug={user?.referralSlug || user?.referralCode}
                        className="mt-4"
                      />
                    </div>
                  </>
                ) : null}
              </div>
            </div>

            <div className="grid gap-3">
              {stage === 'review' ? (
                <div className="rounded-[1.75rem] border border-zinc-200 bg-zinc-50 p-4">
                  <div>
                    <h2 className="text-2xl font-black tracking-tight text-zinc-900">Review and confirm</h2>
                  </div>

                  <div className="mt-4 space-y-3 text-sm text-zinc-700">
                    <label className="flex w-full items-center justify-between gap-3 rounded-2xl border border-brand/20 bg-brand/5 px-4 py-3">
                      <span className="font-semibold text-brand">Time</span>
                      <div className="flex items-center gap-2">
                        <select
                          value={durationMinutes}
                          onChange={handleDurationChange}
                          className="bg-transparent text-right text-sm font-semibold text-zinc-900 outline-none"
                        >
                          {durationOptions.map((option) => (
                            <option key={option} value={option}>
                              {option} min
                            </option>
                          ))}
                        </select>
                        {freeMinutesRemaining > 0 ? (
                          <span className="whitespace-nowrap text-xs font-semibold text-emerald-700">
                            {freeMinutesRemaining.toFixed(2)} free
                          </span>
                        ) : null}
                      </div>
                    </label>

                    <label className="flex w-full items-center justify-between gap-3 rounded-2xl border border-brand/20 bg-brand/5 px-4 py-3">
                      <span className="font-semibold text-brand">Subject</span>
                      <select
                        value={selectedSubject}
                        onChange={handleSubjectChange}
                        className="max-w-[190px] bg-transparent text-right text-sm font-semibold text-zinc-900 outline-none"
                      >
                        <option value="">Select subject</option>
                        {subjectOptions.map((subject) => (
                          <option key={subject.value} value={subject.value}>
                            {subject.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    <div className="flex w-full items-center justify-between gap-3 rounded-2xl border border-brand/20 bg-brand/5 px-4 py-3">
                      <span className="font-semibold text-brand">Topic</span>
                      <span className="text-right font-semibold text-zinc-900">{reviewTopic || 'Not set'}</span>
                    </div>

                    <div className="space-y-3 rounded-2xl border border-brand/20 bg-brand/5 p-4">
                      <div className="flex w-full items-center justify-between gap-3">
                        <span className="font-semibold text-brand">Base price</span>
                        <span className="text-right font-semibold text-zinc-900">
                          {quote ? formatRand(quote.adjustedBaseAmount ?? quote.baseAmount ?? 0) : '-'}
                        </span>
                      </div>
                      <div className="flex w-full items-center justify-between gap-3">
                        <span className="font-semibold text-brand">Per minute</span>
                        <span className="text-right font-semibold text-zinc-900">
                          {quote ? formatRand(quote.adjustedRatePerMinute ?? quote.ratePerMinute ?? 0) : '-'}
                        </span>
                      </div>
                      {pricingPreview ? (
                        <div className="flex w-full items-center justify-between gap-3">
                          <span className="font-semibold text-brand">Due after {durationMinutes} min</span>
                          <span className="text-right font-semibold text-zinc-900">{formatRand(pricingPreview.finalPrice)}</span>
                        </div>
                      ) : null}
                      {pricingStatusLabel ? (
                        <p className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
                          {pricingStatusLabel}
                        </p>
                      ) : null}
                      <label className="flex w-full items-center justify-between gap-3">
                        <span className="inline-flex items-center gap-2 font-semibold text-brand">
                          <CreditCard className="h-4 w-4 text-brand" />
                          Payment
                        </span>
                        <select
                          value={cardId}
                          onChange={(event) => setCardId(event.target.value)}
                          className="max-w-[180px] bg-transparent text-right text-sm font-semibold text-zinc-900 outline-none"
                        >
                          <option value="">Select card</option>
                          {paymentMethods.map((card) => (
                            <option key={card.id} value={card.id}>
                              {formatCardLabel(card)}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                  </div>

                  {error ? <p className="mt-3 text-sm text-rose-300">{error}</p> : null}

                  <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                    <button
                      type="button"
                      onClick={confirmRequest}
                      disabled={!canConfirm}
                      className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-5 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-zinc-500 disabled:text-zinc-200"
                    >
                      <Send className="h-4 w-4" />
                      {isSubmitting ? 'Confirming...' : 'Confirm request'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setStage('input')}
                      className="inline-flex h-12 items-center justify-center rounded-2xl border border-zinc-200 bg-white px-5 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-100"
                    >
                      Back
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      {showSubjectFallback ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-white/75 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-[1.75rem] border border-zinc-200 bg-white p-5 shadow-[0_24px_70px_rgba(15,23,42,0.12)]">
            {unsupportedSubjectRequest?.subject ? (
              <>
                <p className="text-lg font-bold text-zinc-900">Subject not offered yet</p>
                <p className="mt-2 text-sm text-zinc-600">
                  Sorry, {unsupportedSubjectRequest.subject} is not offered yet.
                </p>
                <div className="mt-4 flex justify-end">
                  <button
                    type="button"
                    onClick={() => setShowSubjectFallback(false)}
                    className="rounded-2xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-zinc-950"
                  >
                    Close
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="text-lg font-bold text-zinc-900">Choose subject before review</p>
                <p className="mt-2 text-sm text-zinc-600">We couldn&apos;t confidently resolve a supported subject from the request details.</p>

                <select
                  value={selectedSubject}
                  onChange={(event) => {
                    const nextSubject = event.target.value;
                    isManualSubjectRef.current = Boolean(nextSubject);
                    setSelectedSubject(nextSubject);
                    setUnsupportedSubjectRequest(null);
                  }}
                  className="mt-4 w-full rounded-2xl border border-zinc-200 bg-zinc-50 px-3 py-3 text-sm text-zinc-900 outline-none"
                >
                  <option value="">Select subject</option>
                  {subjectOptions.map((subject) => (
                    <option key={subject.value} value={subject.value}>
                      {subject.label}
                    </option>
                  ))}
                </select>

                <div className="mt-4 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowSubjectFallback(false)}
                    className="rounded-2xl border border-zinc-200 px-4 py-2 text-sm font-semibold text-zinc-700"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={!selectedSubject}
                    onClick={() => {
                      setShowSubjectFallback(false);
                      maybeAdvanceToReview(advanceIntent || 'text');
                    }}
                    className="rounded-2xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-zinc-950 disabled:cursor-not-allowed disabled:bg-zinc-600 disabled:text-zinc-200"
                  >
                    Confirm subject
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}

      {shouldShowExtractionOverlay ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/80 px-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-[1.9rem] border border-zinc-200 bg-white p-5 shadow-[0_24px_70px_rgba(15,23,42,0.12)]">
            <div className="flex flex-col items-center text-center">
              <div className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-400">
                {extractionOverlayState === 'done' ? (
                  <CheckCircle2 className="h-7 w-7" />
                ) : (
                  <RefreshCw className="h-7 w-7 animate-spin" />
                )}
              </div>

              <h2 className="mt-4 text-xl font-black tracking-tight text-zinc-900">
                {extractionOverlayState === 'done'
                  ? 'Processing complete'
                  : isWaitingForClassification
                    ? 'Scanning the file'
                    : 'Scanning the file'}
              </h2>
              <p className="mt-2 text-sm text-zinc-600">
                {extractionOverlayState === 'done'
                  ? 'You are being redirected.'
                  : isWaitingForClassification
                    ? 'Please wait while we analyze your request and prepare the review.'
                    : 'Please wait while we scan and prepare your uploaded files.'}
              </p>
              {extractionOverlayState === 'done' ? (
                <button
                  type="button"
                  onClick={() => maybeAdvanceToReview(advanceIntent || 'attachment')}
                  className="mt-3 inline-flex items-center justify-center rounded-2xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400"
                >
                  Click Here
                </button>
              ) : null}
              {showSlowExtractionMessage ? (
                <p className="mt-3 rounded-2xl border border-amber-300/60 bg-amber-100 px-4 py-3 text-sm text-zinc-900">
                  Your file is big, scanning your file is taking long, please bear with us.
                </p>
              ) : null}

              {extractionErrors.length ? (
                <div className="mt-3 w-full rounded-2xl border border-rose-300 bg-rose-50 p-3 text-left">
                  <p className="text-xs font-semibold uppercase tracking-[0.15em] text-rose-700">Errors</p>
                  <div className="mt-2 max-h-24 overflow-y-auto space-y-1">
                    {extractionErrors.slice(-6).map((entry, idx) => (
                      <p key={`extract-err-${idx}`} className="text-xs text-rose-700">{entry}</p>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="mt-5 space-y-3">
              {attachments.map((file, index) => {
                const fileKey = getAttachmentKey(file);
                const extractionStatus = attachmentExtractionStatusByKey[fileKey];
                const statusIcon = renderExtractionStatusIcon(
                  extractionOverlayState === 'done' && !hasRunningExtraction
                    ? 'text extracted'
                    : extractionStatus,
                );

                return (
                  <div
                    key={`${file.name}-${file.size}-${file.lastModified}-${index}`}
                    className="flex items-center gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3"
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-zinc-200 bg-white text-zinc-700">
                      {file.type.startsWith('image/') ? <ImageIcon className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                    </div>
                    <div className="min-w-0 flex-1 text-left">
                      <p className="truncate text-sm font-semibold text-zinc-900" title={file.name}>
                        {truncateFileName(file.name)}
                      </p>
                      <p className="mt-1 text-xs text-zinc-500">
                        {extractionOverlayState === 'done' && !hasRunningExtraction
                          ? 'Done'
                          : getExtractionStatusLabel(extractionStatus)}
                      </p>
                    </div>
                    <div className="shrink-0">
                      {statusIcon || (
                        <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/5 text-zinc-400">
                          <FileText className="h-4 w-4" />
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
