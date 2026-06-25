import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { doc, getDoc } from 'firebase/firestore';
import { getFirebaseClients } from '../../firebase/config';
import { AttachmentPickerModal } from '../../components/customer/AttachmentPickerModal';
import { CustomerAiCallBridge } from '../../components/customer/CustomerAiCallBridge';
import { ErrorState, LoadingState } from '../../components/ui/States';
import {
  buildCustomerIntakePromptCatalog,
  buildCustomerIntakeQuestionPlan,
  buildMissingRequiredFields,
  formatCustomerIntakeOptionLabel,
  getNextCustomerIntakeQuestion,
  getQuestionIdsForSelection,
  getCustomerIntakeQuickReplyOptions,
} from '../../constants/customerIntakeQuestions';
import { createServiceRequestDraft } from '../../constants/requestPayload';
import {
  CUSTOMER_SERVICE_CATEGORY_OPTIONS,
  getCustomerServiceById,
  getCustomerServiceCategoryById,
  getCustomerPackagesForCategory,
  getCustomerServicesForCategory,
} from '../../constants/serviceCatalog';
import { useAuth } from '../../context/AuthContext';
import {
  appendCustomerServiceTranscript,
  createCustomerServiceRequest,
  deriveTimingDetails,
  finalizeCustomerServiceRequest,
  saveCustomerServiceQuotePreview,
  subscribeToServiceRequestById,
  updateCustomerServiceRequest,
  updateCustomerServiceTranscript,
  uploadCustomerServiceReference,
} from '../../services/customerServiceRequestService';
import { streamCustomerAssistantTurn } from '../../services/customerDirectAiService';
import { extractSingleAttachment } from '../../services/attachmentExtractionService';
import { describeCustomerServiceMediaAttachment } from '../../services/customerServiceMediaService';
import { colors } from '../../theme/colors';

function formatCurrency(value) {
  const amount = Math.round(Number(value || 0));
  if (!Number.isFinite(amount)) return 'R0';
  return `R${amount}`;
}

function formatTimestamp(value) {
  const date = new Date(Number(value || Date.now()));
  return date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function isLikelyApprovalText(value = '') {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return false;
  return ['i approve', 'approve', 'proceed', 'go ahead', 'yes confirm', 'yes i confirm', 'that is fine', 'sharp', 'continue', 'confirm']
    .some((phrase) => normalized.includes(phrase));
}

function isLikelyDeclineText(value = '') {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return false;
  return ['too high', 'decline', 'cancel', 'do not continue', 'not happy', 'no thanks', 'no thank you', 'review details', 'change it']
    .some((phrase) => normalized.includes(phrase));
}

function normalizeTranscriptTurn(turn = {}, index = 0) {
  return {
    id: String(turn.id || `${turn.role || 'turn'}-${turn.createdAt || Date.now()}-${index}`),
    role: String(turn.role || 'assistant'),
    text: String(turn.text || '').trim(),
    questionId: String(turn.questionId || ''),
    createdAt: Number(turn.createdAt || Date.now()),
    isVoice: Boolean(turn.isVoice),
    source: String(turn.source || ''),
    attachment: turn.attachment || null,
    attachmentType: String(turn.attachmentType || ''),
    attachmentName: String(turn.attachmentName || ''),
  };
}

function isTerminalRequestStatus(status = '') {
  return ['completed', 'canceled', 'cancelled', 'expired'].includes(String(status || '').trim().toLowerCase());
}

function buildMediaTurnSummary({ uploaded = [], mediaSummaries = [], extractionResults = [] } = {}) {
  const count = uploaded.length;
  if (!count) return 'I uploaded a reference file for this request.';

  const details = [];
  mediaSummaries.forEach((entry) => {
    const summary = String(entry?.shortSummary || entry?.summary || '').trim();
    if (summary) details.push(summary);
  });
  extractionResults.forEach((entry) => {
    const text = String(entry?.extractedText || '').trim();
    if (text) {
      details.push(`Detected details: ${text.slice(0, 220)}`);
    }
  });

  if (!details.length) {
    return `I uploaded ${count} reference file${count === 1 ? '' : 's'} for this request.`;
  }

  return `I uploaded ${count} reference file${count === 1 ? '' : 's'} for this request. ${details.join(' ')}`;
}

function buildReferenceUploadFallback(file = {}, error) {
  return {
    downloadUrl: '',
    objectPath: '',
    fileName: file?.name || 'Reference file',
    fileType: file?.type || 'application/octet-stream',
    size: Number(file?.size || 0),
    uploadedAt: new Date().toISOString(),
    uploadError: String(error?.code || error?.message || 'upload_failed'),
  };
}

function getServiceSelectionLabel(serviceIds = []) {
  return (serviceIds || [])
    .map((serviceId) => getCustomerServiceById(serviceId)?.label || '')
    .filter(Boolean)
    .join(', ');
}

function getQuoteDisplayData(structuredRequest, quotePreview) {
  const categoryLabel = getCustomerServiceCategoryById(structuredRequest?.categoryId)?.label || 'Service';
  const serviceLabel = getServiceSelectionLabel(structuredRequest?.serviceIds) || 'Not selected';
  return {
    categoryLabel,
    serviceLabel,
    totalLabel: formatCurrency(quotePreview?.pricingSnapshot?.total || 0),
  };
}

function pruneStructuredAnswers({ currentAnswers = {}, nextCategoryId = '', nextServiceIds = [], nextSelectedPackageId = '' } = {}) {
  const allowedQuestionIds = new Set(getQuestionIdsForSelection({
    categoryId: nextCategoryId,
    serviceIds: nextServiceIds,
    selectedPackageId: nextSelectedPackageId,
  }));

  return Object.entries(currentAnswers || {}).reduce((acc, [key, value]) => {
    if (allowedQuestionIds.has(key)) {
      acc[key] = value;
    }
    return acc;
  }, {});
}

export function CustomerServiceCallScreen({ route, navigate, goBack, systemInsets = {} }) {
  const { user, homeLocation } = useAuth();
  const scrollViewRef = useRef(null);
  const voiceBridgeRef = useRef(null);
  const attachmentPickerRef = useRef(null);
  const initSentRef = useRef(false);
  const finalizingRef = useRef(false);
  const quotePresentedRef = useRef(false);
  const quoteDecisionPendingRef = useRef(false);
  const activeAiRequestRef = useRef(null);
  const requestIdRef = useRef('');
  const structuredRequestRef = useRef(null);
  const conversationRef = useRef([]);

  const [requestId, setRequestId] = useState('');
  const [requestRecord, setRequestRecord] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [conversation, setConversation] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteAwaitingApproval, setQuoteAwaitingApproval] = useState(false);
  const [quotePreview, setQuotePreview] = useState(null);
  const [uploadedReferences, setUploadedReferences] = useState([]);
  const [uploadedReferenceSummaries, setUploadedReferenceSummaries] = useState([]);
  const [aiUsageSnapshot, setAiUsageSnapshot] = useState(null);
  const [inputText, setInputText] = useState('');
  const [voiceState, setVoiceState] = useState({
    listening: false,
    processing: false,
    supported: true,
  });
  const [structuredRequest, setStructuredRequest] = useState(() => ({
    ...createServiceRequestDraft(),
    selectedPackageId: '',
    structuredAnswers: {},
    missingRequired: ['category', 'service'],
  }));
  const initialSelectedPackageId = String(route?.params?.selectedPackageId || '').trim();
  const initialRouteServiceIds = Array.isArray(route?.params?.serviceIds)
    ? route.params.serviceIds.map((item) => String(item || '').trim()).filter(Boolean)
    : [];
  const initialRouteCategoryId = String(route?.params?.categoryId || '').trim();
  const initialStructuredAnswers = useMemo(() => (
    route?.params?.initialStructuredAnswers && typeof route.params.initialStructuredAnswers === 'object'
      ? Object.entries(route.params.initialStructuredAnswers).reduce((acc, [key, value]) => {
        if (Array.isArray(value)) {
          if (value.length) acc[key] = value;
          return acc;
        }
        const normalized = String(value || '').trim();
        if (normalized) {
          acc[key] = normalized;
        }
        return acc;
      }, {})
      : {}
  ), [route?.params?.initialStructuredAnswers]);

  const topInset = Math.max(0, Number(systemInsets?.top || 0));
  const bottomInset = Math.max(0, Number(systemInsets?.bottom || 0));
  const headerTopInset = Platform.OS === 'ios' ? 48 : Math.max(topInset + 10, 34);
  const chatBottomInset = Math.max(bottomInset + 12, 24);

  const readOnlyHistory = Boolean(route?.params?.historyOnly) || isTerminalRequestStatus(requestRecord?.status);
  const currentQuestion = useMemo(
    () => getNextCustomerIntakeQuestion({
      categoryId: structuredRequest.categoryId,
      serviceIds: structuredRequest.serviceIds,
      selectedPackageId: structuredRequest.selectedPackageId,
      structuredAnswers: structuredRequest.structuredAnswers,
    }),
    [structuredRequest.categoryId, structuredRequest.selectedPackageId, structuredRequest.serviceIds, structuredRequest.structuredAnswers],
  );
  const selectedCategoryServices = useMemo(
    () => getCustomerServicesForCategory(structuredRequest.categoryId),
    [structuredRequest.categoryId],
  );
  const selectedCategoryPackages = useMemo(
    () => getCustomerPackagesForCategory(structuredRequest.categoryId),
    [structuredRequest.categoryId],
  );
  const quoteDisplay = useMemo(
    () => getQuoteDisplayData(structuredRequest, quotePreview),
    [structuredRequest, quotePreview],
  );
  const lastConversationTurn = conversation[conversation.length - 1] || null;
  const showQuickReplies = Boolean(lastConversationTurn?.role === 'assistant');

  const inlineOptions = useMemo(() => {
    if (quotePreview?.pricingSnapshot) return [];
    if (!showQuickReplies) return [];
    if (!structuredRequest.categoryId) {
      return CUSTOMER_SERVICE_CATEGORY_OPTIONS.map((item) => ({
        id: item.id,
        label: item.label,
        type: 'category',
        group: 'category',
      }));
    }
    if (!structuredRequest.serviceIds?.length) {
      return [
        ...selectedCategoryPackages.map((service) => ({
          id: service.id,
          label: service.label,
          subtitle: service.description || '',
          type: 'package',
          group: 'package',
        })),
        ...selectedCategoryServices.map((service) => ({
          id: service.id,
          label: service.label,
          subtitle: service.description || '',
          type: 'service',
          group: 'service',
        })),
      ];
    }
    const quickReplies = getCustomerIntakeQuickReplyOptions(currentQuestion, {
      categoryId: structuredRequest.categoryId,
      serviceIds: structuredRequest.serviceIds,
    });
    return quickReplies.map((option) => ({
      id: `${currentQuestion?.id || 'question'}-${option.value}`,
      value: option.value,
      label: formatCustomerIntakeOptionLabel(option.label || option.value),
      type: 'answer',
      group: 'answer',
    }));
  }, [currentQuestion, quotePreview?.pricingSnapshot, selectedCategoryPackages, selectedCategoryServices, showQuickReplies, structuredRequest.categoryId, structuredRequest.serviceIds]);

  const resetQuoteState = () => {
    quotePresentedRef.current = false;
    quoteDecisionPendingRef.current = false;
    setQuoteAwaitingApproval(false);
    setQuotePreview(null);
  };

  const persistStructuredState = async (nextStructuredState, overrides = {}) => {
    if (!requestIdRef.current) return;
    const nextTiming = deriveTimingDetails(nextStructuredState.structuredAnswers);
    const requestLocation = requestRecord?.requestPayload?.location
      || requestRecord?.location
      || homeLocation
      || route?.params?.location
      || null;
    await updateCustomerServiceRequest(requestIdRef.current, {
      categoryId: nextStructuredState.categoryId || '',
      serviceIds: nextStructuredState.serviceIds || [],
      selectedPackageId: nextStructuredState.selectedPackageId || '',
      structuredAnswers: nextStructuredState.structuredAnswers || {},
      referenceAttachmentSummaries: overrides.mediaSummariesInput || uploadedReferenceSummaries,
      requestPayload: {
        categoryId: nextStructuredState.categoryId || '',
        serviceIds: nextStructuredState.serviceIds || [],
        selectedPackageId: nextStructuredState.selectedPackageId || '',
        structuredAnswers: nextStructuredState.structuredAnswers || {},
        selectedPortfolioReferences: nextStructuredState.selectedPortfolioReferences || [],
        safetyFlags: nextStructuredState.safetyFlags || [],
        serviceAddress: nextStructuredState.serviceAddress || structuredRequestRef.current?.serviceAddress || '',
        timingPreference: nextTiming.timingPreference,
        scheduledForText: nextTiming.scheduledForText,
        location: requestLocation,
        attachments: overrides.attachmentsInput || uploadedReferences,
        mediaSummaries: overrides.mediaSummariesInput || uploadedReferenceSummaries,
      },
    });
  };

  const appendAssistantTurn = (text = '', metadata = {}) => {
    const nextEvent = {
      id: `assistant-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      role: 'assistant',
      text: String(text || '').trim(),
      questionId: metadata?.questionId || '',
      createdAt: Date.now(),
      source: String(metadata?.source || 'assistant'),
    };
    setConversation((current) => {
      const nextConversation = [...current, nextEvent];
      conversationRef.current = nextConversation;
      return nextConversation;
    });
    appendCustomerServiceTranscript(requestIdRef.current, nextEvent).catch(() => null);
    return nextEvent;
  };

  const mergeStructuredDraft = (current, nextDraft = {}) => {
    const requestedCategoryId = String(nextDraft.categoryId || '').trim();
    const requestedServiceIds = Array.isArray(nextDraft.serviceIds)
      ? [...new Set(nextDraft.serviceIds.filter(Boolean))]
      : [];
    const requestedPackageId = String(nextDraft.selectedPackageId || '').trim();
    const nextCategoryId = requestedCategoryId || current.categoryId;
    const nextServiceIds = requestedServiceIds.length ? requestedServiceIds : current.serviceIds;
    const nextSelectedPackageId = requestedPackageId || (requestedCategoryId || requestedServiceIds.length ? '' : (current.selectedPackageId || ''));
    const categoryChanged = Boolean(requestedCategoryId) && requestedCategoryId !== current.categoryId;
    const serviceChanged = requestedServiceIds.length > 0 && JSON.stringify(requestedServiceIds) !== JSON.stringify(current.serviceIds || []);
    const packageChanged = Boolean(requestedPackageId) && requestedPackageId !== current.selectedPackageId;

    const baseAnswers = categoryChanged || serviceChanged || packageChanged
      ? pruneStructuredAnswers({
        currentAnswers: current.structuredAnswers || {},
        nextCategoryId,
        nextServiceIds,
        nextSelectedPackageId,
      })
      : (current.structuredAnswers || {});

    const nextStructuredAnswers = {
      ...baseAnswers,
      ...(nextDraft.structuredAnswers || {}),
      ...(nextDraft.requiredAnswers || {}),
      ...(nextDraft.optionalAnswers || {}),
    };

    return {
      nextState: {
        ...current,
        categoryId: nextCategoryId,
        serviceIds: nextServiceIds,
        selectedPackageId: nextSelectedPackageId,
        structuredAnswers: nextStructuredAnswers,
        selectedPortfolioReferences: Array.isArray(nextDraft.selectedPortfolioReferences)
          ? nextDraft.selectedPortfolioReferences
          : (categoryChanged || serviceChanged || packageChanged ? [] : current.selectedPortfolioReferences),
        safetyFlags: Array.isArray(nextDraft.safetyFlags)
          ? nextDraft.safetyFlags
          : (categoryChanged || serviceChanged || packageChanged ? [] : current.safetyFlags),
        missingRequired: buildMissingRequiredFields({
          categoryId: nextCategoryId,
          serviceIds: nextServiceIds,
          selectedPackageId: nextSelectedPackageId,
          structuredAnswers: nextStructuredAnswers,
        }),
      },
      categoryChanged,
      serviceChanged,
      packageChanged,
    };
  };

  useEffect(() => {
    requestIdRef.current = requestId;
  }, [requestId]);

  useEffect(() => {
    structuredRequestRef.current = structuredRequest;
  }, [structuredRequest]);

  useEffect(() => {
    conversationRef.current = conversation;
  }, [conversation]);

  useEffect(() => {
    let active = true;

    async function bootstrap() {
      try {
        const existingRequestId = route?.params?.requestId;
        let nextRequestId = '';

        if (existingRequestId) {
          nextRequestId = existingRequestId;
          const { db } = getFirebaseClients();
          const docSnap = await getDoc(doc(db, 'serviceRequests', existingRequestId));
          if (docSnap.exists() && active) {
            const data = docSnap.data() || {};
            setRequestRecord({ id: existingRequestId, ...data });
            if (Array.isArray(data.transcript)) {
              const normalizedTranscript = data.transcript.map((turn, index) => normalizeTranscriptTurn(turn, index));
              setConversation(normalizedTranscript);
              conversationRef.current = normalizedTranscript;
            }
            setUploadedReferences(Array.isArray(data.referenceAttachments) ? data.referenceAttachments : []);
            setUploadedReferenceSummaries(Array.isArray(data.referenceAttachmentSummaries) ? data.referenceAttachmentSummaries : []);
            if (data.structuredAnswers || data.categoryId || data.serviceIds) {
              setStructuredRequest({
                ...createServiceRequestDraft(),
                categoryId: data.categoryId || '',
                serviceIds: data.serviceIds || [],
                selectedPackageId: data.selectedPackageId || data.requestPayload?.selectedPackageId || '',
                structuredAnswers: data.structuredAnswers || {},
                missingRequired: buildMissingRequiredFields({
                  categoryId: data.categoryId || '',
                  serviceIds: data.serviceIds || [],
                  selectedPackageId: data.selectedPackageId || data.requestPayload?.selectedPackageId || '',
                  structuredAnswers: data.structuredAnswers || {},
                }),
                serviceAddress: data.requestPayload?.serviceAddress || '',
                selectedPortfolioReferences: data.requestPayload?.selectedPortfolioReferences || [],
                safetyFlags: data.requestPayload?.safetyFlags || [],
              });
            }
          }
        } else {
          nextRequestId = await createCustomerServiceRequest({
            user,
            location: homeLocation || route?.params?.location || null,
            initialDraft: {
              categoryId: initialRouteCategoryId,
              serviceIds: initialRouteServiceIds,
              selectedPackageId: initialSelectedPackageId,
              structuredAnswers: initialStructuredAnswers,
              serviceAddress: String(user?.customerProfile?.serviceAddress || '').trim(),
              serviceAddressTarget: String(initialStructuredAnswers?.service_address_target || '').trim(),
            },
          });
        }

        if (!active) return;
        setRequestId(nextRequestId);
        if (!existingRequestId) {
          const selectedPackage = initialSelectedPackageId ? getCustomerServiceById(initialSelectedPackageId) : null;
          const nextServiceIds = initialRouteServiceIds.length
            ? initialRouteServiceIds
            : (Array.isArray(selectedPackage?.includedServiceIds) ? selectedPackage.includedServiceIds : []);
          setStructuredRequest((current) => ({
            ...current,
            categoryId: initialRouteCategoryId || selectedPackage?.categoryId || current.categoryId,
            serviceIds: nextServiceIds,
            selectedPackageId: initialSelectedPackageId,
            structuredAnswers: initialStructuredAnswers,
            serviceAddress: String(user?.customerProfile?.serviceAddress || '').trim(),
            missingRequired: buildMissingRequiredFields({
              categoryId: initialRouteCategoryId || selectedPackage?.categoryId || current.categoryId,
              serviceIds: nextServiceIds,
              selectedPackageId: initialSelectedPackageId,
              structuredAnswers: initialStructuredAnswers,
            }),
          }));
        }
        setLoading(false);
      } catch (nextError) {
        if (!active) return;
        setError(nextError.message || 'Unable to start the service request.');
        setLoading(false);
      }
    }

    bootstrap();
    return () => {
      active = false;
    };
  }, [
    initialRouteCategoryId,
    initialRouteServiceIds.join(','),
    JSON.stringify(initialStructuredAnswers),
    initialSelectedPackageId,
    route?.params?.location,
    route?.params?.requestId,
    user,
  ]);

  useEffect(() => {
    if (!requestId || readOnlyHistory || loading || initSentRef.current) {
      return;
    }
    initSentRef.current = true;

    const nextStructuredState = structuredRequestRef.current || structuredRequest;
    if (!nextStructuredState?.missingRequired?.length) {
      presentQuoteForApproval(nextStructuredState).catch((nextError) => {
        setError(nextError.message || 'Unable to prepare the final price.');
      });
      return;
    }

    const isResuming = conversationRef.current.length > 0;
    const turnParams = { initialStatus: 'dialing' };
    if (isResuming) {
      turnParams.appInstruction = 'The customer has reconnected to the chat. Welcome them back and continue collecting the missing request details.';
    }

    runAssistantTurn(turnParams).catch((nextError) => {
      setError(nextError.message || 'Unable to start the AI chat.');
    });
  }, [loading, readOnlyHistory, requestId, structuredRequest]);

  useEffect(() => {
    if (!requestId) return () => {};
    return subscribeToServiceRequestById(
      requestId,
      (request) => {
        if (!request) return;
        setRequestRecord(request);
        if (request.referenceAttachments) {
          setUploadedReferences(Array.isArray(request.referenceAttachments) ? request.referenceAttachments : []);
        }
        if (request.referenceAttachmentSummaries) {
          setUploadedReferenceSummaries(Array.isArray(request.referenceAttachmentSummaries) ? request.referenceAttachmentSummaries : []);
        }
        if (
          request.pricingSnapshot
          && request.status === 'collecting_details'
          && String(request.statusDetail || '').toLowerCase().includes('waiting for customer approval')
        ) {
          setQuotePreview({
            pricingSnapshot: request.pricingSnapshot,
            timingPreference: request.requestPayload?.timingPreference || 'now',
            scheduledForText: request.requestPayload?.scheduledForText || '',
          });
          setQuoteAwaitingApproval(true);
          quotePresentedRef.current = true;
        }
      },
      () => null,
    );
  }, [requestId]);

  useEffect(() => () => {
    try {
      activeAiRequestRef.current?.abort?.();
    } catch {}
  }, []);

  const runAssistantTurn = async ({
    customerText = '',
    customerTurnId = '',
    appInstruction = '',
    questionId = '',
    initialStatus = 'processing',
  } = {}) => {
    try {
      activeAiRequestRef.current?.abort?.();
    } catch {}

    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    activeAiRequestRef.current = controller;
    setError('');
    setIsTyping(true);

    try {
      const result = await streamCustomerAssistantTurn({
        customerName: String(user?.fullName || user?.displayName || 'there').trim().split(' ')[0] || 'there',
        requestState: {
          ...(structuredRequestRef.current || structuredRequest),
          referenceAttachments: uploadedReferences,
          mediaSummaries: uploadedReferenceSummaries,
        },
        serviceCatalog: buildCustomerIntakePromptCatalog(),
        questionPlan: buildCustomerIntakeQuestionPlan(),
        conversation: conversationRef.current,
        customerText,
        appInstruction,
        signal: controller?.signal,
        onUsage: (usageSummary) => setAiUsageSnapshot(usageSummary),
      });

      if (activeAiRequestRef.current !== controller) {
        return;
      }

      const finalText = String(result?.speak || '').trim();
      const correctedText = String(result?.correctedCustomerText || '').trim();
      let updatedConversation = conversationRef.current || conversation;

      if (correctedText && customerTurnId) {
        updatedConversation = updatedConversation.map((turn) => (
          turn.id === customerTurnId && turn.role === 'customer'
            ? { ...turn, text: correctedText }
            : turn
        ));
        setConversation(updatedConversation);
        conversationRef.current = updatedConversation;
        await updateCustomerServiceTranscript(requestIdRef.current, updatedConversation).catch(() => null);
      }

      if (finalText) {
        appendAssistantTurn(finalText, { questionId });
      }

      if (result?.usageSummary) {
        setAiUsageSnapshot(result.usageSummary);
      }

      const { nextState, categoryChanged, serviceChanged, packageChanged } = mergeStructuredDraft(
        structuredRequestRef.current || structuredRequest,
        result?.requestDraft || {},
      );
      if (categoryChanged || serviceChanged || packageChanged) {
        resetQuoteState();
      }
      setStructuredRequest(nextState);
      await persistStructuredState(nextState).catch(() => null);

      if (!nextState.missingRequired?.length) {
        presentQuoteForApproval(nextState);
      }
    } catch (nextError) {
      if (nextError?.name !== 'AbortError') {
        setError(nextError.message || 'Unable to process the AI message.');
      }
    } finally {
      if (activeAiRequestRef.current === controller) {
        activeAiRequestRef.current = null;
      }
      setIsTyping(false);
    }
  };

  const appendCustomerTurn = (text = '', metadata = {}) => {
    const nextEvent = {
      id: `customer-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      role: 'customer',
      text: String(text || '').trim(),
      questionId: metadata?.questionId || '',
      createdAt: Date.now(),
      isVoice: metadata?.source === 'voice_note',
      source: String(metadata?.source || ''),
      attachment: metadata?.attachment || null,
      attachmentType: String(metadata?.attachmentType || ''),
      attachmentName: String(metadata?.attachmentName || ''),
    };
    setConversation((current) => {
      const nextConversation = [...current, nextEvent];
      conversationRef.current = nextConversation;
      return nextConversation;
    });
    appendCustomerServiceTranscript(requestIdRef.current, nextEvent).catch(() => null);
    return nextEvent;
  };

  const submitCustomerTurn = async (text = '', metadata = {}) => {
    if (readOnlyHistory) return;
    const finalText = String(text || '').trim();
    if (!finalText) return;

    const nextEvent = appendCustomerTurn(finalText, metadata);

    if (quoteAwaitingApproval && !quoteDecisionPendingRef.current) {
      if (isLikelyApprovalText(finalText)) {
        await handleApproveQuote({ skipAppendCustomerTurn: true });
        return;
      }
      if (isLikelyDeclineText(finalText)) {
        handleDeclineQuote({ skipAppendCustomerTurn: true });
        return;
      }

      resetQuoteState();
      await updateCustomerServiceRequest(requestIdRef.current, {
        status: 'collecting_details',
        statusDetail: 'Continuing the chat to review service details.',
      }).catch(() => null);
    }

    setTimeout(() => {
      runAssistantTurn({
        customerText: finalText,
        customerTurnId: nextEvent.id,
        questionId: nextEvent.questionId || metadata?.questionId || '',
        initialStatus: 'processing',
      }).catch(() => null);
    }, 100);
  };

  const submitAppInstruction = async (text = '') => {
    const finalText = String(text || '').trim();
    if (!finalText || readOnlyHistory) return;
    await runAssistantTurn({
      appInstruction: finalText,
      initialStatus: 'processing',
    });
  };

  const presentQuoteForApproval = async (nextStructuredState) => {
    if (!requestIdRef.current || quotePresentedRef.current || readOnlyHistory) return;
    if (nextStructuredState.missingRequired?.length) return;
    if (!nextStructuredState.categoryId || !(nextStructuredState.serviceIds || []).length) return;

    setQuoteLoading(true);
    try {
      const nextQuotePreview = await saveCustomerServiceQuotePreview({
        requestId: requestIdRef.current,
        categoryId: nextStructuredState.categoryId,
        serviceIds: nextStructuredState.serviceIds,
        structuredAnswers: nextStructuredState.structuredAnswers,
        aiUsageSnapshot,
        selectedPortfolioReferences: nextStructuredState.selectedPortfolioReferences || [],
        referenceAttachments: uploadedReferences,
      });

      quotePresentedRef.current = true;
      setQuotePreview(nextQuotePreview || null);
      setQuoteAwaitingApproval(true);

      submitAppInstruction([
        'The app has finished collecting the request details.',
        'Do not say that you are searching for, sending, or assigning a helper.',
        'Do not say or repeat the price in your message.',
        'Tell the customer that their details are ready and ask them to review the final price shown in the app card below, then confirm or decline.',
      ].join(' ')).catch(() => null);
    } catch (nextError) {
      setError(nextError.message || 'Unable to prepare the final price.');
      quotePresentedRef.current = false;
    } finally {
      setQuoteLoading(false);
    }
  };

  const finalizeAndRoute = async (nextStructuredState) => {
    if (!requestIdRef.current || finalizingRef.current) return;
    if (!nextStructuredState.categoryId || !(nextStructuredState.serviceIds || []).length) return;
    finalizingRef.current = true;

    try {
      await finalizeCustomerServiceRequest({
        requestId: requestIdRef.current,
        callId: '',
        categoryId: nextStructuredState.categoryId,
        serviceIds: nextStructuredState.serviceIds,
        structuredAnswers: nextStructuredState.structuredAnswers,
        selectedPortfolioReferences: nextStructuredState.selectedPortfolioReferences || [],
        referenceAttachments: uploadedReferences,
        aiUsageSnapshot,
      });

      appendAssistantTurn('Your details are confirmed. Uncedo will continue with the next step from here.', {
        source: 'system_confirmation',
      });

      setTimeout(() => {
        navigate({
          key: 'ServiceRequestTracking',
          params: {
            requestId: requestIdRef.current,
            parentTab: route?.params?.parentTab || 'Requests',
          },
        });
      }, 1200);
    } catch (nextError) {
      setError(nextError.message || 'Unable to complete the service request.');
      finalizingRef.current = false;
    }
  };

  const handleApproveQuote = async (options = {}) => {
    if (quoteDecisionPendingRef.current || !quotePreview?.pricingSnapshot) return;
    quoteDecisionPendingRef.current = true;
    setQuoteAwaitingApproval(false);
    setQuoteLoading(true);
    try {
      if (!options.skipAppendCustomerTurn) {
        appendCustomerTurn('Yes, I confirm this price. Please continue.', {
          source: 'quote_approval',
        });
      }
      await finalizeAndRoute(structuredRequestRef.current || structuredRequest);
    } finally {
      quoteDecisionPendingRef.current = false;
      setQuoteLoading(false);
    }
  };

  const handleDeclineQuote = (options = {}) => {
    resetQuoteState();
    updateCustomerServiceRequest(requestIdRef.current, {
      status: 'collecting_details',
      statusDetail: 'Continuing the chat to review service details.',
    }).catch(() => null);

    const declineText = 'No, I do not want to continue with this. Please help me review or change the service details.';
    if (options.skipAppendCustomerTurn) {
      runAssistantTurn({
        customerText: declineText,
        initialStatus: 'processing',
      }).catch(() => null);
      return;
    }
    submitCustomerTurn(declineText, { source: 'quote_decline' }).catch(() => null);
  };

  const handleCategorySelection = async (categoryId) => {
    if (readOnlyHistory) return;
    const category = getCustomerServiceCategoryById(categoryId);
    if (!category) return;

    resetQuoteState();
    const nextStructuredState = {
      ...createServiceRequestDraft(),
      categoryId,
      serviceIds: [],
      selectedPackageId: '',
      structuredAnswers: {},
      serviceAddress: structuredRequestRef.current?.serviceAddress || String(user?.customerProfile?.serviceAddress || '').trim(),
      missingRequired: ['service'],
    };
    setStructuredRequest(nextStructuredState);
    await persistStructuredState(nextStructuredState).catch(() => null);
    submitCustomerTurn(`I need help with ${category.label}.`, {
      source: 'category_chip',
    }).catch(() => null);
  };

  const handlePackageSelection = async (packageId) => {
    if (readOnlyHistory) return;
    const selectedPackage = getCustomerServiceById(packageId);
    if (!selectedPackage) return;

    resetQuoteState();
    const nextServiceIds = Array.isArray(selectedPackage.includedServiceIds) ? selectedPackage.includedServiceIds : [];
    const nextStructuredState = {
      ...createServiceRequestDraft(),
      categoryId: selectedPackage.categoryId || '',
      serviceIds: nextServiceIds,
      selectedPackageId: packageId,
      structuredAnswers: {},
      serviceAddress: structuredRequestRef.current?.serviceAddress || String(user?.customerProfile?.serviceAddress || '').trim(),
      missingRequired: buildMissingRequiredFields({
        categoryId: selectedPackage.categoryId || '',
        serviceIds: nextServiceIds,
        selectedPackageId: packageId,
        structuredAnswers: {},
      }),
    };
    setStructuredRequest(nextStructuredState);
    await persistStructuredState(nextStructuredState).catch(() => null);
    submitCustomerTurn(`I want the ${selectedPackage.label}.`, {
      source: 'package_chip',
    }).catch(() => null);
  };

  const handleServiceSelection = async (serviceId) => {
    if (readOnlyHistory) return;
    const selectedService = getCustomerServiceById(serviceId);
    if (!selectedService) return;

    resetQuoteState();
    const nextStructuredAnswers = pruneStructuredAnswers({
      currentAnswers: structuredRequestRef.current?.structuredAnswers || {},
      nextCategoryId: selectedService.categoryId,
      nextServiceIds: [serviceId],
    });
    const nextStructuredState = {
      ...(structuredRequestRef.current || structuredRequest),
      categoryId: selectedService.categoryId,
      serviceIds: [serviceId],
      selectedPackageId: '',
      structuredAnswers: nextStructuredAnswers,
      selectedPortfolioReferences: [],
      safetyFlags: [],
      missingRequired: buildMissingRequiredFields({
        categoryId: selectedService.categoryId,
        serviceIds: [serviceId],
        selectedPackageId: '',
        structuredAnswers: nextStructuredAnswers,
      }),
    };
    setStructuredRequest(nextStructuredState);
    await persistStructuredState(nextStructuredState).catch(() => null);
    submitCustomerTurn(`I want ${selectedService.label} instead.`, {
      source: 'service_chip',
    }).catch(() => null);
  };

  const handleAnswerSelection = (optionValue) => {
    if (!currentQuestion || readOnlyHistory) return;
    submitCustomerTurn(formatCustomerIntakeOptionLabel(optionValue), {
      source: 'answer_chip',
      questionId: currentQuestion.id,
    }).catch(() => null);
  };

  const handleChoicePress = (option) => {
    if (option.type === 'category') {
      handleCategorySelection(option.id).catch(() => null);
      return;
    }
    if (option.type === 'package') {
      handlePackageSelection(option.id).catch(() => null);
      return;
    }
    if (option.type === 'service') {
      handleServiceSelection(option.id).catch(() => null);
      return;
    }
    if (option.type === 'answer') {
      handleAnswerSelection(option.value);
    }
  };

  const handleUploadReferences = async (files) => {
    if (!requestIdRef.current || !user?.uid || readOnlyHistory) return;
    setUploading(true);
    try {
      const uploaded = [];
      const mediaSummaries = [];
      const extractionResults = [];

      for (const file of files || []) {
        let uploadedFile = null;
        try {
          uploadedFile = await uploadCustomerServiceReference({
            userId: user.uid,
            requestId: requestIdRef.current,
            attachment: file,
          });
        } catch (uploadError) {
          const uploadMessage = String(uploadError?.message || '').toLowerCase();
          const isBlobError = uploadMessage.includes('arraybuffer')
            || uploadMessage.includes('arraybufferview')
            || uploadMessage.includes('blob');

          if (!isBlobError) {
            throw uploadError;
          }

          uploadedFile = buildReferenceUploadFallback(file, {
            ...uploadError,
            code: 'blob_not_supported',
          });
        }

        uploaded.push(uploadedFile);

        const mediaSummary = await describeCustomerServiceMediaAttachment(file);
        mediaSummaries.push({
          ...mediaSummary,
          downloadUrl: uploadedFile.downloadUrl,
          uploadedAt: uploadedFile.uploadedAt,
        });

        const lowerMimeType = String(file?.type || '').toLowerCase();
        if (lowerMimeType.startsWith('image/') || lowerMimeType === 'application/pdf') {
          const extraction = await extractSingleAttachment(file).catch(() => null);
          if (extraction) {
            extractionResults.push(extraction);
          }
        }
      }

      const nextUploadedReferences = [...uploadedReferences, ...uploaded];
      const nextUploadedSummaries = [...uploadedReferenceSummaries, ...mediaSummaries];
      setUploadedReferences(nextUploadedReferences);
      setUploadedReferenceSummaries(nextUploadedSummaries);
      await updateCustomerServiceRequest(requestIdRef.current, {
        referenceAttachmentSummaries: nextUploadedSummaries,
      }).catch(() => null);
      await persistStructuredState(structuredRequestRef.current || structuredRequest, {
        attachmentsInput: nextUploadedReferences,
        mediaSummariesInput: nextUploadedSummaries,
      }).catch(() => null);

      const lastFile = uploaded[uploaded.length - 1];
      submitCustomerTurn(
        buildMediaTurnSummary({ uploaded, mediaSummaries, extractionResults }),
        {
          source: 'reference_upload',
          attachment: lastFile?.downloadUrl || null,
          attachmentType: lastFile?.fileType || '',
          attachmentName: lastFile?.fileName || '',
        },
      ).catch(() => null);
    } catch (nextError) {
      setError(nextError.message || 'Unable to upload the selected file.');
    } finally {
      setUploading(false);
    }
  };

  const handleSendMessage = () => {
    if (readOnlyHistory) return;
    const text = inputText.trim();
    if (!text) return;
    setInputText('');
    submitCustomerTurn(text, {
      source: 'typed_message',
      questionId: currentQuestion?.id || '',
    }).catch(() => null);
  };

  const handleVoiceBridgeMessage = (event) => {
    let payload = {};
    try {
      payload = JSON.parse(event?.nativeEvent?.data || '{}');
    } catch {
      return;
    }

    if (payload.type === 'error') {
      setVoiceState((current) => ({
        ...current,
        listening: false,
        processing: false,
        supported: false,
      }));
      setError(payload.message || 'Voice transcription is unavailable on this device.');
      return;
    }

    if (payload.type === 'status') {
      const status = String(payload?.payload?.status || '').toLowerCase();
      setVoiceState((current) => ({
        ...current,
        listening: status === 'listening',
        processing: status === 'processing',
      }));
      return;
    }

    if (payload.type === 'customer_text_final') {
      const transcriptText = String(payload?.payload?.text || '').trim();
      setVoiceState((current) => ({
        ...current,
        listening: false,
        processing: false,
      }));
      if (transcriptText) {
        submitCustomerTurn(transcriptText, {
          source: 'voice_note',
          questionId: currentQuestion?.id || '',
        }).catch(() => null);
      }
    }
  };

  const toggleVoiceInput = () => {
    if (readOnlyHistory) return;
    if (voiceState.listening) {
      voiceBridgeRef.current?.pauseListening?.();
      setVoiceState((current) => ({ ...current, listening: false }));
      return;
    }
    setError('');
    voiceBridgeRef.current?.resumeListening?.();
    setVoiceState((current) => ({ ...current, listening: true, processing: false }));
  };

  const handleExit = async () => {
    if (readOnlyHistory) {
      goBack(route?.params?.parentTab || 'Requests');
      return;
    }
    try {
      activeAiRequestRef.current?.abort?.();
    } catch {}
    await updateCustomerServiceRequest(requestIdRef.current, {
      status: 'canceled',
      statusDetail: 'Customer cancelled the chat.',
    }).catch(() => null);
    goBack(route?.params?.parentTab || 'CustomerHome');
  };

  if (loading) {
    return <LoadingState label={readOnlyHistory ? 'Loading chat history' : 'Starting your service chat'} />;
  }

  if (error && !requestId) {
    return <ErrorState message={error} />;
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'android' ? topInset : 0}
      style={styles.screen}
    >
      {!readOnlyHistory ? (
        <CustomerAiCallBridge onBridgeMessage={handleVoiceBridgeMessage} ref={voiceBridgeRef} />
      ) : null}

      <View style={[styles.header, { paddingTop: headerTopInset }]}>
        <View style={styles.avatarContainer}>
          <View style={styles.avatar}>
            <Ionicons color="#ffffff" name="chatbubble-ellipses" size={20} />
          </View>
          {!readOnlyHistory ? <View style={styles.statusDot} /> : null}
        </View>
        <View style={styles.headerInfo}>
          <Text style={styles.headerTitle}>Uncedo</Text>
          <Text style={styles.headerSubtitle}>
            {readOnlyHistory ? 'Chat history' : isTyping ? 'typing...' : voiceState.listening ? 'Listening...' : 'Online'}
          </Text>
        </View>
        <Pressable accessibilityRole="button" onPress={handleExit} style={styles.headerActionBtn}>
          <Ionicons color="#ffffff" name={readOnlyHistory ? 'close-outline' : 'close-circle-outline'} size={22} />
        </Pressable>
      </View>

      <ScrollView
        ref={scrollViewRef}
        contentContainerStyle={[styles.chatScroll, { paddingBottom: chatBottomInset }]}
        onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.infoBanner}>
          <Text style={styles.infoBannerText}>Messages are encrypted and saved to your request history.</Text>
        </View>

        {conversation.map((item) => {
          const isCustomer = item.role === 'customer';
          return (
            <View
              key={item.id}
              style={[
                styles.messageRow,
                isCustomer ? styles.messageRowRight : styles.messageRowLeft,
              ]}
            >
              <View
                style={[
                  styles.messageBubble,
                  isCustomer ? styles.customerBubble : styles.assistantBubble,
                ]}
              >
                {item.attachment && (!item.attachmentType || item.attachmentType.startsWith('image/')) ? (
                  <Image source={{ uri: item.attachment }} style={styles.bubbleImage} />
                ) : null}
                {item.attachment && item.attachmentType && !item.attachmentType.startsWith('image/') ? (
                  <View style={styles.attachmentTag}>
                    <Ionicons color={colors.brandDark} name="attach" size={12} />
                    <Text style={styles.attachmentTagText}>{item.attachmentName || 'Reference file'}</Text>
                  </View>
                ) : null}
                {item.isVoice ? (
                  <View style={styles.voiceTag}>
                    <Ionicons color={colors.brandDark} name="mic" size={12} />
                    <Text style={styles.voiceTagText}>Voice note</Text>
                  </View>
                ) : null}
                <Text style={[styles.messageText, isCustomer ? styles.customerText : null]}>
                  {item.text}
                </Text>
                <Text style={[styles.messageTime, isCustomer ? styles.customerTime : null]}>
                  {formatTimestamp(item.createdAt)}
                </Text>
              </View>
            </View>
          );
        })}

        {inlineOptions.length ? (
          <View style={styles.choiceWrap}>
            {inlineOptions.some((option) => option.group === 'category') ? (
              <View style={styles.choiceSection}>
                <View style={styles.choiceList}>
                  {inlineOptions.filter((option) => option.group === 'category').map((option) => (
                    <Pressable
                      accessibilityRole="button"
                      key={option.id}
                      onPress={() => handleChoicePress(option)}
                      style={styles.choiceChip}
                    >
                      <Text style={styles.choiceChipText}>{option.label}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : null}

            {inlineOptions.some((option) => option.group === 'package') ? (
              <View style={styles.choiceSection}>
                <Text style={styles.choiceGroupTitle}>Packages</Text>
                <View style={styles.choiceList}>
                  {inlineOptions.filter((option) => option.group === 'package').map((option) => (
                    <Pressable
                      accessibilityRole="button"
                      key={option.id}
                      onPress={() => handleChoicePress(option)}
                      style={[styles.choiceChip, styles.packageChip]}
                    >
                      <Text style={styles.choiceChipText}>{option.label}</Text>
                      {option.subtitle ? (
                        <Text style={styles.choiceChipSubtext}>{option.subtitle}</Text>
                      ) : null}
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : null}

            {inlineOptions.some((option) => option.group === 'service') ? (
              <View style={styles.choiceSection}>
                <Text style={styles.choiceGroupTitle}>Individual services</Text>
                <View style={styles.choiceList}>
                  {inlineOptions.filter((option) => option.group === 'service').map((option) => (
                    <Pressable
                      accessibilityRole="button"
                      key={option.id}
                      onPress={() => handleChoicePress(option)}
                      style={styles.choiceChip}
                    >
                      <Text style={styles.choiceChipText}>{option.label}</Text>
                      {option.subtitle ? (
                        <Text style={styles.choiceChipSubtext}>{option.subtitle}</Text>
                      ) : null}
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : null}

            {inlineOptions.some((option) => option.group === 'answer') ? (
              <View style={styles.choiceList}>
                {inlineOptions.filter((option) => option.group === 'answer').map((option) => (
                  <Pressable
                    accessibilityRole="button"
                    key={option.id}
                    onPress={() => handleChoicePress(option)}
                    style={styles.choiceChip}
                  >
                    <Text style={styles.choiceChipText}>{option.label}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </View>
        ) : null}

        {quotePreview?.pricingSnapshot ? (
          <View style={styles.quoteCardContainer}>
            <View style={styles.quoteCard}>
              <View style={styles.quoteCardHeader}>
                <Ionicons color={colors.brand} name="pricetag" size={20} />
                <Text style={styles.quoteCardTitle}>Service Price</Text>
              </View>

              <View style={styles.quoteInfoRow}>
                <Text style={styles.quoteInfoLabel}>Category</Text>
                <Text style={styles.quoteInfoValue}>{quoteDisplay.categoryLabel}</Text>
              </View>
              <View style={styles.quoteInfoRow}>
                <Text style={styles.quoteInfoLabel}>Service</Text>
                <Text style={styles.quoteInfoValue}>{quoteDisplay.serviceLabel}</Text>
              </View>
              <View style={styles.quoteInfoRow}>
                <Text style={styles.quoteInfoLabel}>Price</Text>
                <Text style={styles.quotePriceValue}>{quoteDisplay.totalLabel}</Text>
              </View>

              {quoteAwaitingApproval ? (
                <View style={styles.quoteActions}>
                  <Pressable
                    accessibilityRole="button"
                    disabled={quoteLoading}
                    onPress={() => handleApproveQuote()}
                    style={[styles.quoteBtn, styles.quoteBtnApprove]}
                  >
                    {quoteLoading ? (
                      <ActivityIndicator color="#ffffff" size="small" />
                    ) : (
                      <Text style={styles.quoteBtnText}>Confirm</Text>
                    )}
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    disabled={quoteLoading}
                    onPress={() => handleDeclineQuote()}
                    style={[styles.quoteBtn, styles.quoteBtnDecline]}
                  >
                    <Text style={styles.quoteBtnTextDecline}>Decline</Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
          </View>
        ) : null}

        {error ? (
          <View style={styles.chatError}>
            <Text style={styles.chatErrorText}>{error}</Text>
          </View>
        ) : null}

        {isTyping ? (
          <View style={styles.typingBubble}>
            <ActivityIndicator color={colors.brand} size="small" style={styles.typingSpinner} />
            <Text style={styles.typingText}>Uncedo is writing...</Text>
          </View>
        ) : null}
      </ScrollView>

      {readOnlyHistory ? (
        <View style={styles.readOnlyComposer}>
          <Ionicons color={colors.brandDark} name="time-outline" size={16} />
          <Text style={styles.readOnlyComposerText}>This chat is read-only.</Text>
        </View>
      ) : (
        <View style={styles.inputBar}>
          <View style={styles.mainInputContainer}>
            <Pressable
              accessibilityRole="button"
              disabled={uploading}
              onPress={() => {
                setError('');
                attachmentPickerRef.current?.openPicker?.();
              }}
              style={styles.inputIconBtn}
            >
              {uploading ? (
                <ActivityIndicator color={colors.brand} size="small" />
              ) : (
                <Ionicons color={colors.muted} name="add" size={22} />
              )}
            </Pressable>
            <TextInput
              multiline
              onChangeText={setInputText}
              placeholder="Type a message..."
              placeholderTextColor={colors.muted}
              style={styles.textInput}
              value={inputText}
            />
            <Pressable
              accessibilityRole="button"
              onPress={toggleVoiceInput}
              style={[styles.inputIconBtn, voiceState.listening && styles.inputIconBtnActive]}
            >
              <Ionicons color={voiceState.listening ? colors.brandDark : colors.muted} name="mic" size={20} />
            </Pressable>
          </View>

          <Pressable
            accessibilityRole="button"
            disabled={!inputText.trim()}
            onPress={handleSendMessage}
            style={[
              styles.roundActionBtn,
              !inputText.trim() && styles.roundActionBtnDisabled,
            ]}
          >
            <Ionicons color="#ffffff" name="send" size={18} style={styles.sendIcon} />
          </Pressable>
        </View>
      )}

      <AttachmentPickerModal
        ref={attachmentPickerRef}
        accept="image/*,video/*,application/pdf"
        mode="library"
        onCancel={() => null}
        onError={(msg) => setError(msg)}
        onFilesSelected={handleUploadReferences}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: '#fdf2f8',
    flex: 1,
  },
  header: {
    alignItems: 'center',
    backgroundColor: colors.brand,
    flexDirection: 'row',
    paddingBottom: 12,
    paddingHorizontal: 12,
    shadowColor: '#831843',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 4,
    elevation: 4,
  },
  backButton: {
    padding: 4,
  },
  avatarContainer: {
    marginLeft: 8,
    position: 'relative',
  },
  avatar: {
    alignItems: 'center',
    backgroundColor: colors.brandDark,
    borderRadius: 20,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  statusDot: {
    backgroundColor: '#f9a8d4',
    borderColor: colors.brand,
    borderRadius: 6,
    borderWidth: 1.5,
    bottom: 0,
    height: 12,
    position: 'absolute',
    right: 0,
    width: 12,
  },
  headerInfo: {
    flex: 1,
    marginLeft: 10,
  },
  headerTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800',
  },
  headerSubtitle: {
    color: 'rgba(255,255,255,0.84)',
    fontSize: 12,
  },
  headerActionBtn: {
    padding: 4,
  },
  chatScroll: {
    paddingHorizontal: 12,
    paddingTop: 10,
  },
  infoBanner: {
    alignSelf: 'center',
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: 12,
    marginBottom: 16,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  infoBannerText: {
    color: '#6b7280',
    fontSize: 11,
    textAlign: 'center',
  },
  messageRow: {
    flexDirection: 'row',
    marginBottom: 10,
    width: '100%',
  },
  messageRowLeft: {
    justifyContent: 'flex-start',
  },
  messageRowRight: {
    justifyContent: 'flex-end',
  },
  messageBubble: {
    borderRadius: 14,
    maxWidth: '84%',
    paddingHorizontal: 12,
    paddingVertical: 8,
    shadowColor: '#701a75',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 1,
  },
  assistantBubble: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 4,
  },
  customerBubble: {
    backgroundColor: 'rgba(236,72,153,0.12)',
    borderColor: 'rgba(217,70,239,0.15)',
    borderTopRightRadius: 4,
    borderWidth: 1,
  },
  bubbleImage: {
    borderRadius: 10,
    height: 160,
    marginBottom: 8,
    width: 220,
  },
  voiceTag: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 4,
    marginBottom: 4,
  },
  attachmentTag: {
    alignItems: 'center',
    backgroundColor: 'rgba(217,70,239,0.08)',
    borderRadius: 999,
    flexDirection: 'row',
    gap: 4,
    marginBottom: 6,
    paddingHorizontal: 8,
    paddingVertical: 5,
    alignSelf: 'flex-start',
  },
  attachmentTagText: {
    color: colors.brandDark,
    fontSize: 10,
    fontWeight: '700',
  },
  voiceTagText: {
    color: colors.brandDark,
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  messageText: {
    color: '#0f172a',
    fontSize: 14.5,
    lineHeight: 20,
  },
  customerText: {
    color: '#0f172a',
  },
  messageTime: {
    color: '#6b7280',
    fontSize: 10,
    marginTop: 4,
    textAlign: 'right',
  },
  customerTime: {
    color: '#6b7280',
  },
  choiceWrap: {
    backgroundColor: 'rgba(255,255,255,0.88)',
    borderColor: 'rgba(217,70,239,0.18)',
    borderRadius: 18,
    borderWidth: 1,
    marginBottom: 14,
    padding: 12,
  },
  choiceSection: {
    marginBottom: 10,
  },
  choiceGroupTitle: {
    color: colors.brandDark,
    fontSize: 11,
    fontWeight: '900',
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  choiceList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  choiceChip: {
    backgroundColor: '#ffffff',
    borderColor: 'rgba(217,70,239,0.25)',
    borderRadius: 999,
    borderWidth: 1,
    gap: 2,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  packageChip: {
    minWidth: '46%',
  },
  choiceChipText: {
    color: colors.brandDark,
    fontSize: 12.5,
    fontWeight: '700',
  },
  choiceChipSubtext: {
    color: colors.muted,
    fontSize: 10.5,
    fontWeight: '600',
    maxWidth: 190,
  },
  quoteCardContainer: {
    marginBottom: 14,
  },
  quoteCard: {
    backgroundColor: '#ffffff',
    borderColor: 'rgba(217,70,239,0.18)',
    borderRadius: 22,
    borderWidth: 1.5,
    padding: 16,
  },
  quoteCardHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  quoteCardTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '900',
  },
  quoteInfoRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  quoteInfoLabel: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '700',
  },
  quoteInfoValue: {
    color: colors.text,
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    marginLeft: 10,
    textAlign: 'right',
  },
  quotePriceValue: {
    color: colors.brandDark,
    fontSize: 18,
    fontWeight: '900',
  },
  quoteActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  quoteBtn: {
    alignItems: 'center',
    borderRadius: 12,
    flex: 1,
    height: 44,
    justifyContent: 'center',
  },
  quoteBtnApprove: {
    backgroundColor: colors.brand,
  },
  quoteBtnDecline: {
    backgroundColor: '#ffffff',
    borderColor: '#fecdd3',
    borderWidth: 1,
  },
  quoteBtnText: {
    color: '#ffffff',
    fontSize: 13.5,
    fontWeight: '800',
  },
  quoteBtnTextDecline: {
    color: '#be123c',
    fontSize: 13.5,
    fontWeight: '800',
  },
  chatError: {
    alignSelf: 'center',
    backgroundColor: '#fee2e2',
    borderColor: '#fca5a5',
    borderRadius: 10,
    borderWidth: 1,
    marginVertical: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chatErrorText: {
    color: '#b91c1c',
    fontSize: 13.5,
    textAlign: 'center',
  },
  typingBubble: {
    alignItems: 'center',
    flexDirection: 'row',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  typingSpinner: {
    marginRight: 6,
  },
  typingText: {
    color: '#6b7280',
    fontSize: 12,
    fontStyle: 'italic',
  },
  readOnlyComposer: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderTopColor: '#f5d0fe',
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  readOnlyComposerText: {
    color: colors.brandDark,
    fontSize: 13,
    fontWeight: '700',
  },
  inputBar: {
    alignItems: 'center',
    backgroundColor: 'transparent',
    flexDirection: 'row',
    gap: 8,
    paddingBottom: Platform.OS === 'ios' ? 24 : 10,
    paddingHorizontal: 8,
    paddingTop: 6,
  },
  mainInputContainer: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 24,
    flex: 1,
    flexDirection: 'row',
    minHeight: 48,
    paddingHorizontal: 8,
    shadowColor: '#701a75',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  inputIconBtn: {
    padding: 6,
  },
  inputIconBtnActive: {
    backgroundColor: 'rgba(217,70,239,0.08)',
    borderRadius: 999,
  },
  textInput: {
    color: '#0f172a',
    flex: 1,
    fontSize: 15,
    maxHeight: 100,
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  roundActionBtn: {
    alignItems: 'center',
    backgroundColor: colors.brand,
    borderRadius: 24,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  roundActionBtnDisabled: {
    backgroundColor: '#cbd5e1',
  },
  sendIcon: {
    marginLeft: 2,
  },
});
