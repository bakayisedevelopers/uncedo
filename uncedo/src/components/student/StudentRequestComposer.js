import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AttachmentPickerModal } from './AttachmentPickerModal';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { StatusBadge } from '../ui/StatusBadge';
import { useSubjectCatalog } from '../../hooks/useSubjectCatalog';
import { createClassRequest } from '../../services/classRequestService';
import { extractAttachments } from '../../services/attachmentExtractionService';
import { fetchPricingQuote } from '../../services/pricingService';
import { finalizeSessionClosure } from '../../services/sessionService';
import {
  buildSubjectClassificationInput,
  classifySubjectFromText,
} from '../../services/subjectClassificationService';
import { recordAcademicBrainFeedback } from '../../services/academicBrainFeedbackService';
import { estimateFreeMinutePricing } from '../../services/studentGrowthService';
import { uploadUserFile } from '../../services/storageService';
import { colors } from '../../theme/colors';
import { getStudentOnboardingStatus } from '../../utils/onboarding';
import {
  DEFAULT_LESSON_DURATION,
  formatRand,
  LESSON_DURATION_OPTIONS,
} from '../../utils/pricing';
import { ACTIVE_REQUEST_STATUSES, getRequestStatusMeta } from '../../utils/requestStatus';

const QUICK_REQUEST_SUGGESTIONS = [
  { label: 'I need help with homework', value: 'I need help with homework.' },
  { label: 'I need help preparing for an exam', value: 'I need help preparing for an exam.' },
  { label: 'I need help with an assignment', value: 'I need help with an assignment.' },
  { label: 'I need a normal lesson', value: 'I need a normal lesson.' },
];

function DropdownField({
  label,
  valueLabel,
  placeholder = 'Select',
  options = [],
  selectedValue = '',
  onSelect,
  compact = false,
}) {
  const [open, setOpen] = useState(false);
  const displayValue = valueLabel || placeholder;

  return (
    <View style={styles.dropdownWrap}>
      {compact ? (
        <View style={styles.inlineInfoRow}>
          <Text style={styles.inlineLabel}>{label}</Text>
          <Pressable accessibilityRole="button" onPress={() => setOpen(true)} style={styles.inlineDropdownTrigger}>
            <Text style={[styles.dropdownValue, styles.dropdownValueCompact, !valueLabel && styles.dropdownPlaceholder]} numberOfLines={1}>
              {displayValue}
            </Text>
            <Ionicons name="chevron-down" size={16} color={colors.muted} />
          </Pressable>
        </View>
      ) : (
        <>
          <Text style={styles.dropdownLabel}>{label}</Text>
          <Pressable accessibilityRole="button" onPress={() => setOpen(true)} style={styles.dropdownTrigger}>
            <Text style={[styles.dropdownValue, !valueLabel && styles.dropdownPlaceholder]} numberOfLines={1}>
              {displayValue}
            </Text>
            <Ionicons name="chevron-down" size={16} color={colors.muted} />
          </Pressable>
        </>
      )}

      <Modal animationType="fade" transparent visible={open} onRequestClose={() => setOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.dropdownModalCard}>
            <Text style={styles.dropdownModalTitle}>{label}</Text>
            <ScrollView style={styles.dropdownList}>
              {options.map((option) => {
                const isActive = String(option.value) === String(selectedValue);
                return (
                  <Pressable
                    accessibilityRole="button"
                    key={String(option.value)}
                    onPress={() => {
                      onSelect?.(option.value);
                      setOpen(false);
                    }}
                    style={[styles.dropdownOption, isActive && styles.dropdownOptionActive]}
                  >
                    <Text style={[styles.dropdownOptionText, isActive && styles.dropdownOptionTextActive]}>
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            <Pressable accessibilityRole="button" onPress={() => setOpen(false)} style={styles.dropdownCloseButton}>
              <Text style={styles.dropdownCloseText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function buildAttachmentKey(file) {
  return `${file.name}-${file.size}-${file.lastModified}`;
}

function getAttachmentStatusLabel(status) {
  if (status === 'text extracted') return 'Done';
  if (status === 'extraction weak') return 'Extraction weak';
  if (status === 'queued') return 'Queued';
  return 'Processing...';
}

function buildBoardPreparationSource({ attachments = [], uploadedAttachments = [], attachmentExtractionByKey = {} }) {
  const attachmentExtractions = attachments.map((file, index) => {
    const fileKey = buildAttachmentKey(file);
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

function normalizeEstimatedDuration(estimatedMinutes) {
  const numeric = Number(estimatedMinutes || 0);
  if (!Number.isFinite(numeric) || numeric <= 0) return DEFAULT_LESSON_DURATION;
  return Math.min(90, Math.max(10, Math.round(numeric)));
}

function getDurationOptions(estimatedMinutes) {
  const normalizedEstimate = normalizeEstimatedDuration(estimatedMinutes);
  return Array.from(new Set([...LESSON_DURATION_OPTIONS, normalizedEstimate])).sort((a, b) => a - b);
}

function getReviewTopic({ classifiedTopic, topic }) {
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
  if (card.nickname) return card.nickname;
  const brand = String(card.brand || 'Card');
  return `${brand} ending ${card.last4 || '----'}`;
}

function buildQuoteWithDiscount(quote, requestedDurationMinutes, freeMinutesRemaining) {
  const pricingPreview = estimateFreeMinutePricing({
    originalPrice: quote?.totalAmount || 0,
    requestedDurationMinutes,
    freeMinutesRemaining,
  });

  return {
    ...quote,
    ...pricingPreview,
    finalAmount: pricingPreview.finalPrice,
    finalPayablePrice: pricingPreview.finalPrice,
  };
}

function buildAttachmentUploadFallback(attachment, error) {
  return {
    downloadUrl: '',
    objectPath: '',
    fileName: attachment?.name || 'Attachment',
    fileType: attachment?.type || 'application/octet-stream',
    size: Number(attachment?.size || 0),
    uploadedAt: new Date().toISOString(),
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

export function StudentRequestComposer({
  navigate,
  requests = [],
  sessions = [],
  user,
  onStageChange,
}) {
  const { subjectOptions } = useSubjectCatalog();
  const paymentMethods = user?.paymentMethods || [];
  const freeMinutesRemaining = Number(user?.freeMinutesRemaining || 0);
  const onboardingStatus = getStudentOnboardingStatus(user);
  const activeOrOngoingRequest = requests.find((request) => ACTIVE_REQUEST_STATUSES.includes(request.status));
  const latestOpenSession = sessions.find((session) => ['waiting_student', 'in_progress', 'in_session'].includes(session.status));
  const flowState = getRequestFlowState({
    onboardingComplete: onboardingStatus.complete,
    latestOpenSession,
    activeOrOngoingRequest,
  });

  const [stage, setStage] = useState('input');
  const [topic, setTopic] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [attachmentExtractionByKey, setAttachmentExtractionByKey] = useState({});
  const [attachmentExtractionStatusByKey, setAttachmentExtractionStatusByKey] = useState({});
  const [selectedSubject, setSelectedSubject] = useState('');
  const [classifiedTopic, setClassifiedTopic] = useState('');
  const [latestClassification, setLatestClassification] = useState(null);
  const [estimatedMinutes, setEstimatedMinutes] = useState(DEFAULT_LESSON_DURATION);
  const [durationMinutes, setDurationMinutes] = useState(DEFAULT_LESSON_DURATION);
  const [hasManualDurationOverride, setHasManualDurationOverride] = useState(false);
  const [cardId, setCardId] = useState(
    paymentMethods.find((card) => card.isDefault)?.id || paymentMethods[0]?.id || '',
  );
  const [error, setError] = useState('');
  const [quote, setQuote] = useState(null);
  const [pickerMode, setPickerMode] = useState('');
  const [isTextEntryOpen, setIsTextEntryOpen] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isPreparingReview, setIsPreparingReview] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showProcessingComplete, setShowProcessingComplete] = useState(false);
  const [showAttachmentProcessingOverlay, setShowAttachmentProcessingOverlay] = useState(false);
  const [typedSubjectStatus, setTypedSubjectStatus] = useState('');
  const [typedTopicStatus, setTypedTopicStatus] = useState('');
  const [pendingStatusRequestId, setPendingStatusRequestId] = useState('');
  const [showSessionCancelModal, setShowSessionCancelModal] = useState(false);
  const [sessionCancelReason, setSessionCancelReason] = useState('');
  const [sessionCancelError, setSessionCancelError] = useState('');
  const [isCancelingSession, setIsCancelingSession] = useState(false);
  const lastAutoReviewSignatureRef = useRef('');
  const typingClassificationRunRef = useRef(0);
  const processingRedirectTimeoutRef = useRef(null);

  useEffect(() => {
    setCardId(paymentMethods.find((card) => card.isDefault)?.id || paymentMethods[0]?.id || '');
  }, [user?.uid, paymentMethods]);

  const durationOptions = useMemo(() => getDurationOptions(estimatedMinutes), [estimatedMinutes]);
  const reviewTopic = getReviewTopic({ classifiedTopic, topic });
  const pricingPreview = quote
    ? estimateFreeMinutePricing({
        originalPrice: quote.totalAmount,
        requestedDurationMinutes: durationMinutes,
        freeMinutesRemaining,
      })
    : null;
  const hasRequestContent = Boolean(topic.trim()) || attachments.length > 0;

  function openRequestStatus(requestId) {
    if (!requestId) return;
    navigate({ key: 'RequestStatus', params: { requestId, parentTab: 'Requests' } });
  }

  function openSessionCancellation() {
    setSessionCancelReason('');
    setSessionCancelError('');
    setShowSessionCancelModal(true);
  }

  function closeSessionCancellation(force = false) {
    if (isCancelingSession && !force) return;
    setShowSessionCancelModal(false);
    setSessionCancelReason('');
    setSessionCancelError('');
  }

  async function handleCancelActiveSession() {
    const trimmedReason = sessionCancelReason.trim();
    if (!latestOpenSession?.id) {
      setSessionCancelError('Session not found.');
      return;
    }
    if (!trimmedReason) {
      setSessionCancelError('Please enter a cancellation reason.');
      return;
    }

    setSessionCancelError('');
    setIsCancelingSession(true);
    try {
      await finalizeSessionClosure(latestOpenSession, {
        closureType: 'canceled_during',
        canceledBy: 'student',
        canceledReason: trimmedReason,
      });
      closeSessionCancellation(true);
    } catch (nextError) {
      setSessionCancelError(nextError.message || 'Unable to cancel this class right now.');
    } finally {
      setIsCancelingSession(false);
    }
  }

  function buildReviewSignature() {
    const attachmentSignature = attachments.map((file) => buildAttachmentKey(file)).join('|');
    return [
      topic.trim(),
      attachmentSignature,
      selectedSubject,
      durationMinutes,
      hasManualDurationOverride ? 'manual' : 'auto',
    ].join('::');
  }

  async function refreshQuote(minutes, subject) {
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
  }

  function proceedToReviewFromOverlay() {
    if (processingRedirectTimeoutRef.current) {
      clearTimeout(processingRedirectTimeoutRef.current);
      processingRedirectTimeoutRef.current = null;
    }
    setShowProcessingComplete(false);
    setShowAttachmentProcessingOverlay(false);
    setStage('review');
  }

  function resetProcessingFlowState() {
    if (processingRedirectTimeoutRef.current) {
      clearTimeout(processingRedirectTimeoutRef.current);
      processingRedirectTimeoutRef.current = null;
    }
    setShowProcessingComplete(false);
    setShowAttachmentProcessingOverlay(false);
    lastAutoReviewSignatureRef.current = '';
  }

  async function handlePickedFiles(files) {
    setPickerMode('');
    if (!Array.isArray(files) || !files.length) return;

    const existingKeys = new Set(attachments.map((file) => buildAttachmentKey(file)));
    const nextFiles = files.filter((file) => !existingKeys.has(buildAttachmentKey(file)));
    if (!nextFiles.length) return;

    setStage('input');
    resetProcessingFlowState();
    setError('');
    setShowAttachmentProcessingOverlay(true);
    setIsExtracting(true);
    let extractionCompleted = false;
    const extractedResultsByKey = {};

    const nextAttachments = [...attachments, ...nextFiles];
    setAttachments(nextAttachments);
    setAttachmentExtractionStatusByKey((prev) => {
      const next = { ...prev };
      nextFiles.forEach((file) => {
        next[buildAttachmentKey(file)] = 'extracting';
      });
      return next;
    });

    try {
      await extractAttachments(nextFiles, (result, index) => {
        const file = nextFiles[index];
        const fileKey = buildAttachmentKey(file);
        extractedResultsByKey[fileKey] = result;
        setAttachmentExtractionByKey((prev) => ({ ...prev, [fileKey]: result }));
        setAttachmentExtractionStatusByKey((prev) => ({
          ...prev,
          [fileKey]: result.success ? 'text extracted' : 'extraction weak',
        }));
      });
      extractionCompleted = true;
    } catch (nextError) {
      setError(nextError.message || 'Unable to process the selected files right now.');
      setShowAttachmentProcessingOverlay(false);
    } finally {
      if (extractionCompleted) {
        await prepareReview({
          skipExtractingGuard: true,
          attachmentsInput: nextAttachments,
          extractionByKeyInput: {
            ...attachmentExtractionByKey,
            ...extractedResultsByKey,
          },
        });
      }
      setIsExtracting(false);
    }
  }

  function removeAttachment(indexToRemove) {
    const removed = attachments[indexToRemove];
    const removedKey = removed ? buildAttachmentKey(removed) : '';
    const nextAttachments = attachments.filter((_, index) => index !== indexToRemove);
    setAttachments(nextAttachments);
    setStage('input');
    setQuote(null);
    resetProcessingFlowState();

    if (removedKey) {
      setAttachmentExtractionByKey((prev) => {
        const next = { ...prev };
        delete next[removedKey];
        return next;
      });
      setAttachmentExtractionStatusByKey((prev) => {
        const next = { ...prev };
        delete next[removedKey];
        return next;
      });
    }
  }

  async function prepareReview(options = {}) {
    const {
      skipExtractingGuard = false,
      attachmentsInput = attachments,
      extractionByKeyInput = attachmentExtractionByKey,
    } = options;
    const hasRequestContentInput = Boolean(topic.trim()) || attachmentsInput.length > 0;

    if (!hasRequestContentInput || ((!skipExtractingGuard && isExtracting) || isPreparingReview)) return;

    setError('');
    setIsPreparingReview(true);
    const reviewSignature = [
      topic.trim(),
      attachmentsInput.map((file) => buildAttachmentKey(file)).join('|'),
      selectedSubject,
      durationMinutes,
      hasManualDurationOverride ? 'manual' : 'auto',
    ].join('::');

    try {
      const attachmentExtractions = attachmentsInput
        .map((file) => extractionByKeyInput[buildAttachmentKey(file)])
        .filter(Boolean);
      const classificationInput = buildSubjectClassificationInput({
        typedText: topic,
        attachmentExtractions,
        supportedSubjects: subjectOptions,
      });
      const classification = await classifySubjectFromText({
        inputText: classificationInput.combinedText,
        inputPayload: classificationInput.structuredPayload,
        supportedSubjects: subjectOptions,
      });
      setLatestClassification(classification || null);
      const nextEstimatedMinutes = normalizeEstimatedDuration(classification.estimatedMinutes || estimatedMinutes);
      const nextSubject = classification.subject || selectedSubject;

      setClassifiedTopic(classification.topic || '');
      setEstimatedMinutes(nextEstimatedMinutes);
      if (!hasManualDurationOverride) {
        setDurationMinutes(nextEstimatedMinutes);
      }

      if (classification.topic && !topic.trim()) {
        setTopic(classification.topic);
      }

      if (classification.unsupportedSubjectRequested && classification.unsupportedSubject) {
        setTypedSubjectStatus(`Detected subject: ${classification.unsupportedSubject} (not offered yet).`);
      }

      setSelectedSubject(nextSubject);
      await refreshQuote(hasManualDurationOverride ? durationMinutes : nextEstimatedMinutes, nextSubject);
      if (attachmentsInput.length > 0) {
        setShowProcessingComplete(true);
        if (processingRedirectTimeoutRef.current) {
          clearTimeout(processingRedirectTimeoutRef.current);
        }
        processingRedirectTimeoutRef.current = setTimeout(() => {
          proceedToReviewFromOverlay();
        }, 900);
      } else {
        setShowAttachmentProcessingOverlay(false);
        setStage('review');
      }
      lastAutoReviewSignatureRef.current = reviewSignature;
    } catch (nextError) {
      setError(nextError.message || 'Unable to prepare the review right now.');
      lastAutoReviewSignatureRef.current = reviewSignature;
    } finally {
      setIsPreparingReview(false);
    }
  }

  useEffect(() => {
    if (flowState !== 'request_flow') {
      lastAutoReviewSignatureRef.current = '';
    }
  }, [flowState]);

  useEffect(() => {
    if (attachments.length > 0) {
      setTypedSubjectStatus('');
      setTypedTopicStatus('');
      return undefined;
    }

    const trimmedTopic = topic.trim();
    if (!trimmedTopic) {
      setTypedSubjectStatus('');
      setTypedTopicStatus('');
      return undefined;
    }

    const runId = typingClassificationRunRef.current + 1;
    typingClassificationRunRef.current = runId;
    setTypedSubjectStatus('Detecting subject from your text...');

    const timeoutId = setTimeout(async () => {
      try {
        const classificationInput = buildSubjectClassificationInput({
          typedText: trimmedTopic,
          attachmentExtractions: [],
          supportedSubjects: subjectOptions,
        });

        const classification = await classifySubjectFromText({
          inputText: classificationInput.combinedText,
          inputPayload: classificationInput.structuredPayload,
          supportedSubjects: subjectOptions,
        });
        setLatestClassification(classification || null);

        if (typingClassificationRunRef.current !== runId) {
          return;
        }

        if (classification.unsupportedSubjectRequested && classification.unsupportedSubject) {
          setTypedSubjectStatus(`Detected subject: ${classification.unsupportedSubject} (not offered yet).`);
          setTypedTopicStatus(classification.topic ? `Detected topic: ${classification.topic}` : '');
          return;
        }

        if (classification.subject) {
          setSelectedSubject(classification.subject);
          setTypedSubjectStatus(`Detected subject: ${classification.subject}.`);
          setTypedTopicStatus(classification.topic ? `Detected topic: ${classification.topic}` : 'Topic not detected yet.');
          return;
        }

        setTypedSubjectStatus('Subject not detected yet. Keep typing or upload a file.');
        setTypedTopicStatus(classification.topic ? `Detected topic: ${classification.topic}` : 'Topic not detected yet.');
      } catch (_error) {
        if (typingClassificationRunRef.current === runId) {
          setTypedSubjectStatus('Unable to detect subject right now.');
          setTypedTopicStatus('');
        }
      }
    }, 350);

    return () => clearTimeout(timeoutId);
  }, [attachments.length, topic]);

  async function confirmRequest() {
    if (!selectedSubject) {
      setError('Select a subject before confirming.');
      return;
    }

    if (!cardId) {
      setError('Select a saved card before confirming.');
      return;
    }

    setIsSubmitting(true);
    setError('');
    try {
      const activeQuote = quote || (await refreshQuote(durationMinutes, selectedSubject));
      const quoteWithDiscount = buildQuoteWithDiscount(activeQuote, durationMinutes, freeMinutesRemaining);
      const uploadedAttachments = [];
      for (const attachment of attachments) {
        try {
          const uploadResult = await withTimeout(
            uploadUserFile({
              userId: user.uid,
              attachment,
              pathPrefix: 'request-attachments',
            }),
            12000,
            'attachment_upload_timeout',
          );
          uploadedAttachments.push(uploadResult);
        } catch (uploadError) {
          const uploadMessage = String(uploadError?.message || '').toLowerCase();
          const isBlobError = uploadMessage.includes('arraybuffer') || uploadMessage.includes('arraybufferview') || uploadMessage.includes('blob');
          if (isBlobError) {
            uploadedAttachments.push({
              downloadUrl: '',
              objectPath: '',
              fileName: attachment.name,
              fileType: attachment.type || 'application/octet-stream',
              size: Number(attachment.size || 0),
              uploadedAt: new Date().toISOString(),
              uploadError: 'blob_not_supported',
            });
            continue;
          }
          uploadedAttachments.push(buildAttachmentUploadFallback(attachment, uploadError));
        }
      }
      const boardPreparationSource = buildBoardPreparationSource({
        attachments,
        uploadedAttachments,
        attachmentExtractionByKey,
      });

      const requestId = await createClassRequest({
        studentId: user.uid,
        studentName: user.fullName || user.displayName || 'Student',
        studentEmail: user.email || '',
        topic: reviewTopic || selectedSubject,
        description: topic.trim(),
        subject: selectedSubject,
        duration: `${durationMinutes} minutes`,
        durationMinutes,
        imageAttachment: uploadedAttachments[0]?.downloadUrl || '',
        attachment: uploadedAttachments[0] || null,
        attachments: uploadedAttachments,
        selectedCardId: cardId,
        pricingSnapshot: quoteWithDiscount,
        boardPreparationSource,
      });
      setPendingStatusRequestId(requestId);
      openRequestStatus(requestId);

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
    } catch (nextError) {
      setError(nextError.message || 'Unable to submit request right now.');
    } finally {
      setIsSubmitting(false);
    }
  }

  const activeRequestMeta = activeOrOngoingRequest ? getRequestStatusMeta(activeOrOngoingRequest.status) : null;

  useEffect(() => {
    onStageChange?.(stage);
  }, [onStageChange, stage]);

  useEffect(() => {
    if (!pendingStatusRequestId) return;
    const targetRequest = requests.find((request) => request.id === pendingStatusRequestId);
    if (!targetRequest) return;
    setPendingStatusRequestId('');
    openRequestStatus(pendingStatusRequestId);
  }, [navigate, pendingStatusRequestId, requests]);

  useEffect(() => () => {
    if (processingRedirectTimeoutRef.current) {
      clearTimeout(processingRedirectTimeoutRef.current);
    }
  }, []);

  return (
    <View style={styles.wrap}>
      {flowState === 'blocked_onboarding' ? (
        <Card style={styles.heroCard}>
          <StatusBadge label="Complete profile" tone="warning" />
          <Text style={styles.heroTitle}>Finish your student profile before requesting a class.</Text>
          <Text style={styles.heroCopy}>{onboardingStatus.message}</Text>
          <Button
            onPress={() => navigate('Onboarding')}
            icon={<Ionicons name="arrow-forward" size={18} color="#ffffff" />}
            iconPosition="right"
          >
            Complete profile
          </Button>
        </Card>
      ) : null}

      {flowState === 'blocked_active_request' ? (
        <Card style={styles.heroCard}>
          <StatusBadge label={activeRequestMeta?.label || 'Current request'} tone={activeRequestMeta?.tone || 'info'} />
          <Text style={styles.heroTitle}>You already have a request in progress.</Text>
          <Text style={styles.heroCopy}>
            Open the current request status instead of creating another request.
          </Text>
          <Text style={styles.currentTitle}>{activeOrOngoingRequest?.subject || 'Current request'}</Text>
          <Text style={styles.currentCopy}>{activeOrOngoingRequest?.topic || 'Live request'}</Text>
          <Button
            onPress={() => navigate({ key: 'RequestStatus', params: { requestId: activeOrOngoingRequest?.id, parentTab: 'Requests' } })}
            icon={<Ionicons name="chevron-forward" size={18} color="#ffffff" />}
            iconPosition="right"
          >
            View current request
          </Button>
        </Card>
      ) : null}

      {flowState === 'blocked_active_session' ? (
        <Card style={styles.heroCard}>
          <StatusBadge label="In progress" tone="info" />
          <Text style={styles.heroTitle}>Your class is already in progress.</Text>
          <Text style={styles.heroCopy}>
            Re-open the live session instead of starting a new request.
          </Text>
          <Text style={styles.currentTitle}>{latestOpenSession?.subject || 'Current class'}</Text>
          <Text style={styles.currentCopy}>{latestOpenSession?.topic || latestOpenSession?.requestTopic || 'Live class session'}</Text>
          <Button
            onPress={() => navigate({ key: 'SessionRoom', params: { sessionId: latestOpenSession?.id, parentTab: 'Sessions' } })}
            icon={<Ionicons name="chevron-forward" size={18} color="#ffffff" />}
            iconPosition="right"
          >
            Continue current class
          </Button>
          <View style={styles.activeSessionActions}>
            <Button
              style={styles.actionButton}
              variant="secondary"
              onPress={() => navigate({ key: 'Requests', params: {} })}
            >
              Open my classes
            </Button>
            <Button
              style={[styles.actionButton, styles.cancelSessionButton]}
              textStyle={styles.cancelSessionButtonText}
              disabled={isCancelingSession}
              onPress={openSessionCancellation}
            >
              {isCancelingSession ? 'Canceling...' : 'Cancel'}
            </Button>
          </View>
        </Card>
      ) : null}

      {flowState === 'request_flow' ? (
        <>
          {stage !== 'review' ? (
            <Card style={styles.heroCard}>
              <View style={styles.heroBackdrop}>
                <View style={styles.heroGlowPrimary} />
                <View style={styles.heroGlowSecondary} />
              </View>
              <View style={styles.heroContent}>
              <StatusBadge label="Student request" tone="success" />
              <Text style={styles.requestLeadCopy}>
                <Text style={styles.requestLeadPrimary}>Snap homework, upload a worksheet, </Text>
                <Text style={styles.requestLeadAccent}>or describe what you need help with.</Text>
              </Text>
              <Text style={styles.heroCopy}>
                We'll estimate the session length, detect the subject, and let you review before confirming.
              </Text>

              <View style={styles.actionRow}>
                <Button
                  style={styles.actionButton}
                  onPress={() => setPickerMode('camera')}
                  icon={<Ionicons name="camera-outline" size={18} color="#ffffff" />}
                >
                  Take Picture
                </Button>
                <Button
                  style={styles.actionButton}
                  onPress={() => setPickerMode('upload')}
                  variant="secondary"
                  icon={<Ionicons name="cloud-upload-outline" size={18} color={colors.brand} />}
                >
                  Upload
                </Button>
              </View>

              {attachments.length ? (
                <View style={styles.attachmentList}>
                  {attachments.map((file, index) => {
                    const fileKey = buildAttachmentKey(file);
                    const status = attachmentExtractionStatusByKey[fileKey] || 'queued';
                    return (
                      <View key={fileKey} style={styles.attachmentRow}>
                        <View style={styles.attachmentMeta}>
                          <Text style={styles.attachmentName} numberOfLines={1}>{file.name}</Text>
                          <Text style={styles.attachmentStatus}>{getAttachmentStatusLabel(status)}</Text>
                        </View>
                        <Pressable accessibilityRole="button" onPress={() => removeAttachment(index)} style={styles.removePill}>
                          <Text style={styles.removeText}>Remove</Text>
                        </Pressable>
                      </View>
                    );
                  })}
                </View>
              ) : null}

              <Pressable
                accessibilityRole="button"
                onPress={() => setIsTextEntryOpen((current) => !current)}
                style={styles.toggleRow}
              >
                <Text style={styles.toggleTitle}>Or describe what you need help with</Text>
                <Ionicons name={isTextEntryOpen ? 'chevron-down' : 'chevron-forward'} size={18} color={colors.muted} />
              </Pressable>

              {isTextEntryOpen ? (
                <View style={styles.textEntry}>
                  <TextInput
                    multiline
                    onChangeText={(value) => {
                      setTopic(value);
                      setStage('input');
                      setQuote(null);
                      setError('');
                    }}
                    placeholder="Type here..."
                    placeholderTextColor={colors.muted}
                    style={styles.textarea}
                    value={topic}
                  />
                  <View style={styles.suggestionWrap}>
                    {QUICK_REQUEST_SUGGESTIONS.map((option) => (
                      <Pressable
                        accessibilityRole="button"
                        key={option.label}
                        onPress={() => {
                          setIsTextEntryOpen(true);
                          setTopic(option.value);
                          setStage('input');
                          setQuote(null);
                          setError('');
                        }}
                        style={styles.suggestionChip}
                      >
                        <Text style={styles.suggestionText}>{option.label}</Text>
                      </Pressable>
                    ))}
                  </View>
                  {typedSubjectStatus ? <Text style={styles.subjectStatusText}>{typedSubjectStatus}</Text> : null}
                  {typedTopicStatus ? <Text style={styles.subjectStatusText}>{typedTopicStatus}</Text> : null}
                  <View style={styles.textContinueRow}>
                    <Pressable
                      accessibilityRole="button"
                      disabled={!topic.trim() || isPreparingReview}
                      onPress={prepareReview}
                      style={[
                        styles.textContinueButton,
                        topic.trim() && !isPreparingReview ? styles.textContinueButtonEnabled : styles.textContinueButtonDisabled,
                      ]}
                    >
                      <Ionicons name="arrow-forward" size={16} color={topic.trim() && !isPreparingReview ? '#ffffff' : '#0f172a'} />
                      <Text
                        style={[
                          styles.textContinueLabel,
                          topic.trim() && !isPreparingReview ? styles.textContinueLabelEnabled : null,
                        ]}
                      >
                        {isPreparingReview ? 'Preparing...' : 'Continue'}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              ) : null}

              <Text style={styles.autoAdvanceText}>
                {isPreparingReview ? 'Preparing review...' : 'Review will open automatically once your request is ready.'}
              </Text>
              </View>
            </Card>
          ) : null}

          {stage === 'review' ? (
            <Card style={styles.reviewCard}>
              <Text style={styles.reviewTitle}>Review and confirm</Text>
              <View style={styles.reviewRows}>
                <DropdownField
                  label="Time"
                  compact
                  selectedValue={durationMinutes}
                  valueLabel={
                    freeMinutesRemaining > 0
                      ? `${durationMinutes} min · ${freeMinutesRemaining.toFixed(2)} free`
                      : `${durationMinutes} min`
                  }
                  options={durationOptions.map((option) => ({ value: option, label: `${option} min` }))}
                  onSelect={async (value) => {
                    const nextDuration = Number(value || DEFAULT_LESSON_DURATION);
                    setHasManualDurationOverride(true);
                    setDurationMinutes(nextDuration);
                    try {
                      await refreshQuote(nextDuration, selectedSubject);
                    } catch (nextError) {
                      setError(nextError.message || 'Unable to refresh pricing quote right now.');
                    }
                  }}
                />
                <DropdownField
                  label="Subject"
                  compact
                  selectedValue={selectedSubject}
                  valueLabel={selectedSubject}
                  placeholder="Select subject"
                  options={subjectOptions}
                  onSelect={async (value) => {
                    const nextSubject = String(value || '');
                    setSelectedSubject(nextSubject);
                    try {
                      await refreshQuote(durationMinutes, nextSubject);
                    } catch (nextError) {
                      setError(nextError.message || 'Unable to refresh pricing quote right now.');
                    }
                  }}
                />
                <View style={styles.inlineInfoRow}>
                  <Text style={styles.inlineLabel}>Topic</Text>
                  <Text style={styles.inlineValue} numberOfLines={1}>{reviewTopic || 'Not set'}</Text>
                </View>
              </View>

              <View style={styles.pricingCard}>
                <View style={styles.pricingRow}>
                  <Text style={styles.sectionLabel}>Base price</Text>
                  <Text style={styles.reviewValue}>{formatRand(quote?.adjustedBaseAmount ?? quote?.baseAmount ?? 0)}</Text>
                </View>
                <View style={styles.pricingRow}>
                  <Text style={styles.sectionLabel}>Per minute</Text>
                  <Text style={styles.reviewValue}>{formatRand(quote?.adjustedRatePerMinute ?? quote?.ratePerMinute ?? 0)}</Text>
                </View>
                {pricingPreview ? (
                  <View style={styles.pricingRow}>
                    <Text style={styles.sectionLabel}>Due after {durationMinutes} min</Text>
                    <Text style={styles.reviewValue}>{formatRand(pricingPreview.finalPrice)}</Text>
                  </View>
                ) : null}
                <DropdownField
                  label="Payment"
                  compact
                  selectedValue={cardId}
                  valueLabel={paymentMethods.find((card) => card.id === cardId) ? formatCardLabel(paymentMethods.find((card) => card.id === cardId)) : ''}
                  placeholder="Select card"
                  options={paymentMethods.map((card) => ({ value: card.id, label: formatCardLabel(card) }))}
                  onSelect={(value) => setCardId(String(value || ''))}
                />
              </View>

              {error ? <Text style={styles.errorText}>{error}</Text> : null}

              <View style={styles.actionRow}>
                <Button
                  style={styles.actionButton}
                  disabled={isSubmitting}
                  onPress={confirmRequest}
                  icon={<Ionicons name="paper-plane-outline" size={18} color="#ffffff" />}
                >
                  {isSubmitting ? 'Confirming...' : 'Confirm request'}
                </Button>
                <Button
                  style={styles.actionButton}
                  onPress={() => {
                    resetProcessingFlowState();
                    setStage('input');
                  }}
                  variant="secondary"
                  icon={<Ionicons name="arrow-back" size={18} color={colors.brand} />}
                >
                  Back
                </Button>
              </View>
            </Card>
          ) : null}
        </>
      ) : null}

      <AttachmentPickerModal
        visible={Boolean(pickerMode)}
        mode={pickerMode}
        onCancel={() => setPickerMode('')}
        onError={(message) => {
          setPickerMode('');
          setError(message);
        }}
        onFilesSelected={handlePickedFiles}
      />

      <Modal animationType="fade" transparent visible={showSessionCancelModal} onRequestClose={closeSessionCancellation}>
        <View style={styles.modalOverlay}>
          <Card style={styles.modalCard}>
            <Text style={styles.modalTitle}>Cancel current class</Text>
            <Text style={styles.modalCopy}>
              Tell us why you want to cancel this class. This will mark it as canceled during class.
            </Text>
            <TextInput
              editable={!isCancelingSession}
              multiline
              onChangeText={setSessionCancelReason}
              placeholder="Type your cancellation reason"
              placeholderTextColor={colors.muted}
              style={styles.modalInput}
              textAlignVertical="top"
              value={sessionCancelReason}
            />
            {sessionCancelError ? <Text style={styles.modalError}>{sessionCancelError}</Text> : null}
            <View style={styles.modalActions}>
              <Button
                disabled={isCancelingSession}
                onPress={closeSessionCancellation}
                style={styles.modalButton}
                variant="secondary"
              >
                Keep class
              </Button>
              <Button
                disabled={isCancelingSession}
                onPress={handleCancelActiveSession}
                style={[styles.modalButton, styles.cancelSessionButton]}
                textStyle={styles.cancelSessionButtonText}
              >
                {isCancelingSession ? 'Canceling...' : 'Confirm cancel'}
              </Button>
            </View>
          </Card>
        </View>
      </Modal>

      <Modal
        animationType="fade"
        transparent
        visible={isSubmitting || showProcessingComplete || (showAttachmentProcessingOverlay && (isExtracting || isPreparingReview))}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.loadingCard}>
            <View style={styles.processingIconWrap}>
              {showProcessingComplete ? (
                <Ionicons name="checkmark-circle" size={30} color={colors.brand} />
              ) : (
                <ActivityIndicator color={colors.brand} size="small" />
              )}
            </View>
            <Text style={styles.modalTitle}>
              {showProcessingComplete
                ? 'Processing complete'
                : isSubmitting
                  ? 'Confirming request'
                  : isPreparingReview
                    ? 'Preparing review'
                    : 'Processing your file'}
            </Text>
            <Text style={styles.modalCopy}>
              {showProcessingComplete
                ? 'You are being redirected.'
                : isSubmitting
                  ? 'Please wait while we upload your files and post the live request.'
                  : isPreparingReview
                    ? 'Please wait while we classify the subject and fetch the pricing quote.'
                    : 'Please wait while we scan and prepare your uploaded files.'}
            </Text>
            {showProcessingComplete ? (
              <Pressable accessibilityRole="button" onPress={proceedToReviewFromOverlay} style={styles.overlayCta}>
                <Text style={styles.overlayCtaText}>Click Here</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 16,
  },
  heroCard: {
    gap: 14,
    overflow: 'hidden',
    position: 'relative',
  },
  heroBackdrop: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  heroGlowPrimary: {
    backgroundColor: 'rgba(16,185,129,0.18)',
    borderRadius: 220,
    height: 220,
    left: -72,
    position: 'absolute',
    top: -44,
    width: 220,
  },
  heroGlowSecondary: {
    backgroundColor: 'rgba(59,130,246,0.14)',
    borderRadius: 220,
    bottom: -84,
    height: 220,
    position: 'absolute',
    right: -88,
    width: 220,
  },
  heroContent: {
    gap: 14,
  },
  feedbackCard: {
    backgroundColor: '#ecfdf5',
  },
  successText: {
    color: colors.brandDark,
    fontSize: 14,
    fontWeight: '800',
  },
  heroTitle: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '900',
    lineHeight: 30,
  },
  heroCopy: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22,
  },
  requestLeadCopy: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 28,
  },
  requestLeadPrimary: {
    color: colors.brandDark,
  },
  requestLeadAccent: {
    color: colors.cyan,
  },
  currentTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '900',
  },
  currentCopy: {
    color: colors.muted,
    fontSize: 14,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  activeSessionActions: {
    flexDirection: 'row',
    gap: 10,
  },
  actionButton: {
    flex: 1,
  },
  cancelSessionButton: {
    backgroundColor: colors.danger,
    borderColor: colors.danger,
    borderWidth: 1,
  },
  cancelSessionButtonText: {
    color: '#ffffff',
  },
  attachmentList: {
    gap: 10,
  },
  attachmentRow: {
    alignItems: 'center',
    backgroundColor: '#fafafa',
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  attachmentMeta: {
    flex: 1,
    gap: 4,
  },
  attachmentName: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '800',
  },
  attachmentStatus: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
  },
  removePill: {
    borderColor: colors.border,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  removeText: {
    color: colors.danger,
    fontSize: 12,
    fontWeight: '800',
  },
  toggleRow: {
    alignItems: 'center',
    backgroundColor: '#fafafa',
    borderColor: colors.border,
    borderRadius: 20,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  toggleTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '800',
  },
  textEntry: {
    backgroundColor: '#fafafa',
    borderColor: colors.border,
    borderRadius: 22,
    borderWidth: 1,
    gap: 12,
    padding: 14,
  },
  textarea: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 1,
    color: colors.text,
    minHeight: 90,
    paddingHorizontal: 12,
    paddingVertical: 12,
    textAlignVertical: 'top',
  },
  suggestionWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  suggestionChip: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  suggestionText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '700',
  },
  subjectStatusText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 18,
  },
  textContinueRow: {
    alignItems: 'flex-end',
    marginTop: 6,
  },
  textContinueButton: {
    alignItems: 'center',
    borderColor: colors.border,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    minHeight: 40,
    paddingHorizontal: 12,
  },
  textContinueButtonEnabled: {
    backgroundColor: colors.brand,
    borderColor: colors.brand,
  },
  textContinueButtonDisabled: {
    backgroundColor: '#ffffff',
    opacity: 0.5,
  },
  textContinueLabel: {
    color: '#0f172a',
    fontSize: 13,
    fontWeight: '800',
  },
  textContinueLabelEnabled: {
    color: '#ffffff',
  },
  reviewCard: {
    gap: 14,
  },
  reviewRows: {
    gap: 10,
  },
  reviewTitle: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '900',
  },
  section: {
    gap: 8,
  },
  sectionLabel: {
    color: colors.brandDark,
    fontSize: 13,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  reviewValue: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '800',
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  dropdownWrap: {
    gap: 6,
  },
  inlineInfoRow: {
    alignItems: 'center',
    borderColor: 'rgba(16,185,129,0.18)',
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    minHeight: 50,
    paddingHorizontal: 12,
    backgroundColor: '#ecfdf5',
  },
  inlineLabel: {
    color: colors.brandDark,
    fontSize: 13,
    fontWeight: '900',
  },
  inlineValue: {
    color: colors.text,
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'right',
  },
  dropdownLabel: {
    color: colors.brandDark,
    fontSize: 13,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  dropdownTrigger: {
    alignItems: 'center',
    backgroundColor: '#ecfdf5',
    borderColor: 'rgba(16,185,129,0.18)',
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 50,
    paddingHorizontal: 12,
  },
  inlineDropdownTrigger: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    minHeight: 42,
  },
  dropdownValue: {
    color: colors.text,
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    marginRight: 8,
  },
  dropdownValueCompact: {
    textAlign: 'right',
  },
  dropdownPlaceholder: {
    color: colors.muted,
  },
  dropdownChevron: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: '900',
  },
  dropdownModalCard: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    maxHeight: '75%',
    padding: 16,
    width: '100%',
  },
  dropdownModalTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '900',
    marginBottom: 12,
    textAlign: 'center',
  },
  dropdownList: {
    maxHeight: 320,
  },
  dropdownOption: {
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    paddingVertical: 12,
  },
  dropdownOptionActive: {
    backgroundColor: '#ecfdf5',
  },
  dropdownOptionText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  dropdownOptionTextActive: {
    color: colors.brandDark,
  },
  dropdownCloseButton: {
    alignItems: 'center',
    borderColor: colors.border,
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 12,
    minHeight: 44,
    justifyContent: 'center',
  },
  dropdownCloseText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '800',
  },
  choiceChip: {
    borderColor: colors.border,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  choiceChipActive: {
    backgroundColor: '#ecfdf5',
    borderColor: colors.brand,
  },
  choiceText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
  },
  choiceTextActive: {
    color: colors.brandDark,
  },
  pricingCard: {
    backgroundColor: '#f0fdfa',
    borderColor: 'rgba(16,185,129,0.18)',
    borderRadius: 18,
    borderWidth: 1,
    gap: 12,
    padding: 14,
  },
  pricingRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  errorText: {
    color: colors.danger,
    fontSize: 14,
    fontWeight: '700',
  },
  autoAdvanceText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 18,
  },
  modalOverlay: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.8)',
    flex: 1,
    justifyContent: 'center',
    padding: 16,
  },
  modalCard: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    gap: 14,
    maxHeight: '80%',
    padding: 18,
    width: '100%',
  },
  loadingCard: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 30,
    borderWidth: 1,
    gap: 12,
    maxWidth: 420,
    paddingHorizontal: 20,
    paddingVertical: 24,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    width: '100%',
  },
  processingIconWrap: {
    alignItems: 'center',
    backgroundColor: 'rgba(16,185,129,0.1)',
    borderRadius: 999,
    height: 56,
    justifyContent: 'center',
    width: 56,
  },
  modalTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '900',
    textAlign: 'center',
  },
  modalCopy: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
  },
  overlayCta: {
    alignItems: 'center',
    backgroundColor: '#10b981',
    borderRadius: 16,
    marginTop: 2,
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 18,
    width: '100%',
  },
  overlayCtaText: {
    color: '#0f172a',
    fontSize: 14,
    fontWeight: '900',
  },
});
