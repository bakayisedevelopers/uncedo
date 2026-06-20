import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Image,
  KeyboardAvoidingView,
  Linking,
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
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { ErrorState, LoadingState } from '../../components/ui/States';
import {
  buildCustomerIntakePromptCatalog,
  buildCustomerIntakeQuestionPlan,
  buildMissingRequiredFields,
  getSelectedServiceMetadata,
} from '../../constants/customerIntakeQuestions';
import { createServiceRequestDraft } from '../../constants/requestPayload';
import { getCustomerServiceById, getCustomerServicesForCategory, getCustomerServiceCategoryById, CUSTOMER_SERVICE_CATEGORY_OPTIONS } from '../../constants/serviceCatalog';
import { useAuth } from '../../context/AuthContext';
import {
  appendCustomerServiceTranscript,
  buildServicePricingSnapshot,
  cancelCustomerServiceCall,
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
import { colors } from '../../theme/colors';

function formatElapsed(seconds) {
  const total = Math.max(0, Number(seconds || 0));
  const minutes = String(Math.floor(total / 60)).padStart(2, '0');
  const remainingSeconds = String(total % 60).padStart(2, '0');
  return `${minutes}:${remainingSeconds}`;
}

function formatCurrency(value) {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount)) return 'R0.00';
  return `R${amount.toFixed(2)}`;
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

export function CustomerServiceCallScreen({ route, navigate, goBack }) {
  const { user } = useAuth();
  const scrollViewRef = useRef(null);
  const initSentRef = useRef(false);
  const finalizingRef = useRef(false);
  const callClosedRef = useRef(false);
  const quotePresentedRef = useRef(false);
  const quoteDecisionPendingRef = useRef(false);
  const activeAiRequestRef = useRef(null);
  const requestIdRef = useRef('');
  const structuredRequestRef = useRef(null);
  const conversationRef = useRef([]);

  const [requestId, setRequestId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [conversation, setConversation] = useState([]);
  const [selectionRequest, setSelectionRequest] = useState(null);
  const [uploadPickerVisible, setUploadPickerVisible] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteAwaitingApproval, setQuoteAwaitingApproval] = useState(false);
  const [quotePreview, setQuotePreview] = useState(null);
  const [uploadedReferences, setUploadedReferences] = useState([]);
  const [aiUsageSnapshot, setAiUsageSnapshot] = useState(null);
  
  // Chat Input state
  const [inputText, setInputText] = useState('');

  const [structuredRequest, setStructuredRequest] = useState(() => ({
    ...createServiceRequestDraft(),
    structuredAnswers: {},
    missingRequired: ['category', 'service'],
  }));

  const selectedServiceMetadata = useMemo(
    () => getSelectedServiceMetadata(structuredRequest.serviceIds),
    [structuredRequest.serviceIds],
  );
  
  const selectedCategoryServices = useMemo(
    () => getCustomerServicesForCategory(structuredRequest.categoryId),
    [structuredRequest.categoryId],
  );
  
  const canUploadReference = selectedServiceMetadata.some((service) => service.requiresPortfolioSelection);
  const pricingLines = Array.isArray(quotePreview?.pricingSnapshot?.lines) ? quotePreview.pricingSnapshot.lines : [];

  const traceCall = (stage, detail = {}) => {
    const safeDetail = {};
    Object.entries(detail || {}).forEach(([key, value]) => {
      if (value === undefined) return;
      safeDetail[key] = value;
    });
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({
      event: 'customer_chat_trace',
      stage,
      requestId: requestIdRef.current || '',
      ...safeDetail,
    }));
  };

  useEffect(() => {
    requestIdRef.current = requestId;
  }, [requestId]);

  useEffect(() => {
    if (!requestId || loading || initSentRef.current) {
      return;
    }
    initSentRef.current = true;

    const isResuming = conversationRef.current.length > 0;
    const turnParams = {
      initialStatus: 'dialing',
    };
    if (isResuming) {
      turnParams.appInstruction = 'The customer has reconnected to the call. Acknowledge their return and ask how you can help them complete their request details.';
    }

    runAssistantTurn(turnParams).catch((nextError) => {
      setError(nextError.message || 'Unable to start the AI call.');
    });
  }, [loading, requestId]);

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
        let nextRequestId;

        if (existingRequestId) {
          nextRequestId = existingRequestId;
          const { db } = getFirebaseClients();
          const docSnap = await getDoc(doc(db, 'serviceRequests', existingRequestId));
          if (docSnap.exists() && active) {
            const data = docSnap.data();
            if (Array.isArray(data.transcript) && data.transcript.length > 0) {
              setConversation(data.transcript);
              conversationRef.current = data.transcript;
            }
            if (data.structuredAnswers || data.categoryId || data.serviceIds) {
              setStructuredRequest({
                ...createServiceRequestDraft(),
                categoryId: data.categoryId || '',
                serviceIds: data.serviceIds || [],
                structuredAnswers: data.structuredAnswers || {},
                missingRequired: data.requestPayload?.missingRequired || ['category', 'service'],
                serviceAddress: data.requestPayload?.serviceAddress || '',
                selectedPortfolioReferences: data.requestPayload?.selectedPortfolioReferences || [],
                safetyFlags: data.requestPayload?.safetyFlags || [],
              });
            }
          }
        } else {
          nextRequestId = await createCustomerServiceRequest({
            user,
            location: route?.params?.location || null,
          });
        }

        if (!active) return;
        setRequestId(nextRequestId);
        setElapsedSeconds(0);
        if (!existingRequestId) {
          setStructuredRequest((current) => ({
            ...current,
            serviceAddress: String(user?.customerProfile?.serviceAddress || '').trim(),
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
  }, [user, route?.params?.location, route?.params?.requestId]);

  useEffect(() => {
    if (!requestId) return () => {};
    return subscribeToServiceRequestById(
      requestId,
      (request) => {
        if (!request) return;
        if (request.referenceAttachments) {
          setUploadedReferences(Array.isArray(request.referenceAttachments) ? request.referenceAttachments : []);
        }
        if (
          request.pricingSnapshot
          && request.status === 'collecting_details'
          && String(request.statusDetail || '').toLowerCase().includes('waiting for customer approval')
        ) {
          setQuotePreview({
            pricingSnapshot: request.pricingSnapshot,
            summary: request.serviceSummary || '',
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

  // Handle call timer count
  useEffect(() => {
    const timer = setInterval(() => setElapsedSeconds((current) => current + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    return () => {
      try {
        activeAiRequestRef.current?.abort?.();
      } catch {}
    };
  }, []);

  const appendAssistantTurn = (text = '', metadata = {}) => {
    const nextEvent = {
      id: `assistant-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      role: 'assistant',
      text: String(text || '').trim(),
      questionId: metadata?.questionId || '',
      createdAt: Date.now(),
    };
    setConversation((current) => {
      const nextConversation = [...current, nextEvent];
      conversationRef.current = nextConversation;
      return nextConversation;
    });
    traceCall('assistant_turn_appended', {
      questionId: nextEvent.questionId || '',
      textLength: nextEvent.text.length,
    });
    appendCustomerServiceTranscript(requestIdRef.current, nextEvent).catch(() => null);

    return nextEvent;
  };

  const applyAssistantResult = async (result = {}, options = {}) => {
    const finalText = String(result?.speak || '').trim();
    traceCall('assistant_result_received', {
      questionId: options.questionId || '',
      hasText: Boolean(finalText),
      status: String(result?.status || ''),
    });

    const correctedText = String(result?.correctedCustomerText || '').trim();
    let updatedConversation = conversationRef.current || conversation;
    let transcriptUpdated = false;

    if (correctedText && options.customerTurnId) {
      updatedConversation = updatedConversation.map((turn) => {
        if (turn.id === options.customerTurnId && turn.role === 'customer') {
          transcriptUpdated = true;
          return { ...turn, text: correctedText };
        }
        return turn;
      });
      if (transcriptUpdated) {
        setConversation(updatedConversation);
        conversationRef.current = updatedConversation;
        await updateCustomerServiceTranscript(requestIdRef.current, updatedConversation).catch(() => null);
      }
    }

    if (finalText) {
      appendAssistantTurn(finalText, {
        questionId: options.questionId || '',
      });
    }

    if (result?.usageSummary) {
      setAiUsageSnapshot(result.usageSummary);
    }

    const nextDraft = result?.requestDraft || {};
    const nextSelectionRequest = result?.selectionRequest || null;
    const nextStructuredState = mergeStructuredDraft(structuredRequestRef.current || structuredRequest, nextDraft);
    setStructuredRequest(nextStructuredState);
    setSelectionRequest(nextSelectionRequest);
    persistStructuredState(nextStructuredState).catch(() => null);

    if (!nextStructuredState.missingRequired?.length) {
      presentQuoteForApproval(nextStructuredState);
    }
  };

  const mergeStructuredDraft = (current, nextDraft = {}) => {
    const nextCategoryId = nextDraft.categoryId || current.categoryId;
    const nextServiceIds = Array.isArray(nextDraft.serviceIds) && nextDraft.serviceIds.length
      ? nextDraft.serviceIds
      : current.serviceIds;
    const nextStructuredAnswers = {
      ...(current.structuredAnswers || {}),
      ...(nextDraft.structuredAnswers || {}),
      ...(nextDraft.requiredAnswers || {}),
      ...(nextDraft.optionalAnswers || {}),
    };

    return {
      ...current,
      categoryId: nextCategoryId,
      serviceIds: nextServiceIds,
      structuredAnswers: nextStructuredAnswers,
      selectedPortfolioReferences: Array.isArray(nextDraft.selectedPortfolioReferences)
        ? nextDraft.selectedPortfolioReferences
        : current.selectedPortfolioReferences,
      safetyFlags: Array.isArray(nextDraft.safetyFlags) ? nextDraft.safetyFlags : current.safetyFlags,
      missingRequired: buildMissingRequiredFields({
        categoryId: nextCategoryId,
        serviceIds: nextServiceIds,
        structuredAnswers: nextStructuredAnswers,
      }),
    };
  };

  const runAssistantTurn = async ({
    customerText = '',
    customerTurnId = '',
    appInstruction = '',
    questionId = '',
    initialStatus = 'processing',
  } = {}) => {
    traceCall('assistant_turn_start', {
      initialStatus,
      hasCustomerText: Boolean(String(customerText || '').trim()),
      hasAppInstruction: Boolean(String(appInstruction || '').trim()),
      questionId,
    });
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
        requestState: structuredRequestRef.current || structuredRequest,
        serviceCatalog: buildCustomerIntakePromptCatalog(),
        questionPlan: buildCustomerIntakeQuestionPlan(),
        conversation: conversationRef.current,
        customerText,
        appInstruction,
        signal: controller?.signal,
        onUsage: (usageSummary) => {
          setAiUsageSnapshot(usageSummary);
        },
      });

      if (activeAiRequestRef.current !== controller) {
        traceCall('assistant_turn_aborted_after_response', { questionId });
        return;
      }

      await applyAssistantResult(result, { questionId, customerTurnId });
      traceCall('assistant_turn_complete', {
        questionId,
        status: String(result?.status || ''),
      });
    } catch (nextError) {
      if (nextError?.name === 'AbortError') {
        traceCall('assistant_turn_abort_error', { questionId });
        return;
      }
      traceCall('assistant_turn_failed', {
        questionId,
        error: nextError?.message || 'Unknown assistant turn error',
      });
      setError(nextError.message || 'Unable to process the AI message.');
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
      attachment: metadata?.attachment || null,
    };
    setConversation((current) => {
      const nextConversation = [...current, nextEvent];
      conversationRef.current = nextConversation;
      return nextConversation;
    });
    traceCall('customer_turn_appended', {
      questionId: nextEvent.questionId || '',
      textLength: nextEvent.text.length,
    });
    appendCustomerServiceTranscript(requestIdRef.current, nextEvent).catch(() => null);
    return nextEvent;
  };

  const submitCustomerTurn = async (text = '', metadata = {}) => {
    const finalText = String(text || '').trim();
    if (!finalText) return;

    traceCall('customer_turn_submit', {
      questionId: metadata?.questionId || '',
      textLength: finalText.length,
      quoteAwaitingApproval,
    });

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
    if (!finalText) return;
    traceCall('app_instruction_submit', {
      textLength: finalText.length,
    });
    await runAssistantTurn({
      appInstruction: finalText,
      initialStatus: 'processing',
    });
  };

  const persistStructuredState = async (nextStructuredState) => {
    if (!requestId) return;
    const nextTiming = deriveTimingDetails(nextStructuredState.structuredAnswers);
    await updateCustomerServiceRequest(requestId, {
      categoryId: nextStructuredState.categoryId || '',
      serviceIds: nextStructuredState.serviceIds || [],
      structuredAnswers: nextStructuredState.structuredAnswers || {},
      requestPayload: {
        categoryId: nextStructuredState.categoryId || '',
        serviceIds: nextStructuredState.serviceIds || [],
        structuredAnswers: nextStructuredState.structuredAnswers || {},
        selectedPortfolioReferences: nextStructuredState.selectedPortfolioReferences || [],
        safetyFlags: nextStructuredState.safetyFlags || [],
        serviceAddress: nextStructuredState.serviceAddress || structuredRequest.serviceAddress || '',
        timingPreference: nextTiming.timingPreference,
        scheduledForText: nextTiming.scheduledForText,
      },
    });
  };

  const finalizeAndRoute = async (nextStructuredState) => {
    if (!requestId || finalizingRef.current) return;
    if (!nextStructuredState.categoryId || !(nextStructuredState.serviceIds || []).length) return;
    finalizingRef.current = true;

    try {
      const pricingSnapshot = await finalizeCustomerServiceRequest({
        requestId,
        callId: '',
        categoryId: nextStructuredState.categoryId,
        serviceIds: nextStructuredState.serviceIds,
        structuredAnswers: nextStructuredState.structuredAnswers,
        selectedPortfolioReferences: nextStructuredState.selectedPortfolioReferences || [],
        referenceAttachments: uploadedReferences,
        aiUsageSnapshot,
      });

      callClosedRef.current = true;
      setConversation((current) => ([
        ...current,
        {
          id: `system-${Date.now()}`,
          role: 'assistant',
          text: quotePreview?.timingPreference === 'later'
            ? `Your request is approved and scheduled. Current estimate: ${formatCurrency(pricingSnapshot?.total)}.`
            : `Your request is approved. I am now searching for a helper. Current estimate: ${formatCurrency(pricingSnapshot?.total)}.`,
        },
      ]));

      setTimeout(() => {
        navigate({
          key: 'ServiceRequestTracking',
          params: {
            requestId,
            parentTab: 'Requests',
          },
        });
      }, 1500);
    } catch (nextError) {
      setError(nextError.message || 'Unable to complete the service request.');
      finalizingRef.current = false;
    }
  };

  const presentQuoteForApproval = async (nextStructuredState) => {
    if (!requestId || quotePresentedRef.current) return;
    if (nextStructuredState.missingRequired?.length) return;
    if (!nextStructuredState.categoryId || !(nextStructuredState.serviceIds || []).length) return;

    setQuoteLoading(true);
    try {
      const fallbackPricingSnapshot = buildServicePricingSnapshot({
        categoryId: nextStructuredState.categoryId,
        serviceIds: nextStructuredState.serviceIds,
        structuredAnswers: nextStructuredState.structuredAnswers,
        aiUsageSnapshot,
      });
      const nextQuotePreview = await saveCustomerServiceQuotePreview({
        requestId,
        categoryId: nextStructuredState.categoryId,
        serviceIds: nextStructuredState.serviceIds,
        structuredAnswers: nextStructuredState.structuredAnswers,
        aiUsageSnapshot,
        selectedPortfolioReferences: nextStructuredState.selectedPortfolioReferences || [],
        referenceAttachments: uploadedReferences,
      });

      quotePresentedRef.current = true;
      setQuotePreview(nextQuotePreview || { pricingSnapshot: fallbackPricingSnapshot, summary: '' });
      setQuoteAwaitingApproval(true);
      
      const promptText = [
        'The app pricing engine finished calculating the quote.',
        `Quote total: ${formatCurrency((nextQuotePreview || { pricingSnapshot: fallbackPricingSnapshot }).pricingSnapshot?.total)}.`,
        `Request summary: ${(nextQuotePreview || { summary: '' }).summary || 'Service request ready for review.'}`,
        `Timing: ${nextQuotePreview?.timingPreference === 'later' ? `Scheduled for ${nextQuotePreview?.scheduledForText || 'later'}` : 'As soon as possible'}.`,
        'Tell the customer this is the final quote from the app, summarize the request, and ask them to approve or decline.',
        'Do not calculate a new price.',
      ].join(' ');

      submitAppInstruction(promptText).catch(() => null);
    } catch (nextError) {
      setError(nextError.message || 'Unable to prepare the service quote.');
      quotePresentedRef.current = false;
    } finally {
      setQuoteLoading(false);
    }
  };

  const handleApproveQuote = async (options = {}) => {
    if (quoteDecisionPendingRef.current || !quotePreview?.pricingSnapshot) return;
    quoteDecisionPendingRef.current = true;
    setQuoteAwaitingApproval(false);
    setQuoteLoading(true);
    try {
      if (!options.skipAppendCustomerTurn) {
        appendCustomerTurn('Yes, I approve this price. Please continue.', {
          source: 'quote_approval',
        });
      }
      await finalizeAndRoute(structuredRequest);
    } finally {
      quoteDecisionPendingRef.current = false;
      setQuoteLoading(false);
    }
  };

  const handleDeclineQuote = (options = {}) => {
    quoteDecisionPendingRef.current = false;
    quotePresentedRef.current = false;
    setQuoteAwaitingApproval(false);
    setQuotePreview(null);
    updateCustomerServiceRequest(requestId, {
      status: 'collecting_details',
      statusDetail: 'Continuing the call to review service details.',
    }).catch(() => null);
    const declineText = 'No, I do not want to proceed with this price. Please help me review or adjust the details.';
    if (options.skipAppendCustomerTurn) {
      runAssistantTurn({
        customerText: declineText,
        initialStatus: 'processing',
      }).catch(() => null);
      return;
    }
    submitCustomerTurn(declineText, { source: 'quote_decline' }).catch(() => null);
  };

  const handleManualServiceSelection = (serviceId) => {
    const selectedService = getCustomerServiceById(serviceId);
    if (!selectedService) return;

    const nextStructuredState = {
      ...structuredRequest,
      categoryId: selectedService.categoryId,
      serviceIds: structuredRequest.serviceIds.includes(serviceId)
        ? structuredRequest.serviceIds
        : [...structuredRequest.serviceIds, serviceId],
    };
    nextStructuredState.missingRequired = buildMissingRequiredFields({
      categoryId: nextStructuredState.categoryId,
      serviceIds: nextStructuredState.serviceIds,
      structuredAnswers: nextStructuredState.structuredAnswers,
    });
    setStructuredRequest(nextStructuredState);
    setSelectionRequest(null);
    persistStructuredState(nextStructuredState).catch(() => null);
    submitCustomerTurn(`I choose the ${selectedService.label} service.`, {
      source: 'service_chip',
      serviceId,
      categoryId: selectedService.categoryId,
    }).catch(() => null);
  };

  const handleManualCategorySelection = (categoryId) => {
    const category = getCustomerServiceCategoryById(categoryId);
    if (!category) return;

    const nextStructuredState = {
      ...structuredRequest,
      categoryId: categoryId,
    };
    nextStructuredState.missingRequired = buildMissingRequiredFields({
      categoryId: nextStructuredState.categoryId,
      serviceIds: nextStructuredState.serviceIds,
      structuredAnswers: nextStructuredState.structuredAnswers,
    });
    setStructuredRequest(nextStructuredState);
    persistStructuredState(nextStructuredState).catch(() => null);
    submitCustomerTurn(`I need help with ${category.label}.`, {
      source: 'category_chip',
      categoryId,
    }).catch(() => null);
  };

  const handleUploadReferences = async (files) => {
    if (!requestId || !user?.uid) return;
    setUploading(true);
    setUploadPickerVisible(false);
    try {
      const uploaded = [];
      for (const file of files || []) {
        const result = await uploadCustomerServiceReference({
          userId: user.uid,
          requestId,
          attachment: file,
        });
        uploaded.push(result);
      }
      setUploadedReferences((current) => [...current, ...uploaded]);
      
      const lastFile = uploaded[uploaded.length - 1];
      submitCustomerTurn(
        `I uploaded ${uploaded.length} reference image${uploaded.length === 1 ? '' : 's'} for this service.`,
        {
          source: 'reference_upload',
          count: uploaded.length,
          attachment: lastFile?.dataUrl || null,
        },
      ).catch(() => null);
    } catch (nextError) {
      setError(nextError.message || 'Unable to upload reference images.');
    } finally {
      setUploading(false);
    }
  };

  const handleSendMessage = () => {
    const text = inputText.trim();
    if (!text) return;
    setInputText('');
    submitCustomerTurn(text);
  };

  const handleEndCall = async () => {
    traceCall('chat_exit_requested', {});
    try {
      activeAiRequestRef.current?.abort?.();
    } catch {}
    activeAiRequestRef.current = null;
    if (requestId) {
      await updateCustomerServiceRequest(requestId, {
        status: 'canceled',
        statusDetail: 'Customer cancelled the chat.',
      }).catch(() => null);
    }
    goBack('CustomerHome');
  };

  if (loading) {
    return <LoadingState label="Starting your service chat" />;
  }

  if (error && !requestId) {
    return <ErrorState message={error} />;
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.screen}
    >
      {/* ── WhatsApp Style Header ── */}
      <View style={styles.header}>
        <Pressable accessibilityRole="button" onPress={() => navigate('CustomerHome')} style={styles.backButton}>
          <Ionicons color="#ffffff" name="arrow-back" size={24} />
        </Pressable>
        <View style={styles.avatarContainer}>
          <View style={styles.avatar}>
            <Ionicons color="#ffffff" name="chatbubble-ellipses" size={20} />
          </View>
          <View style={styles.statusDot} />
        </View>
        <View style={styles.headerInfo}>
          <Text style={styles.headerTitle}>Uncedo AI Assistant</Text>
          <Text style={styles.headerSubtitle}>
            {isTyping ? 'typing...' : 'Online'}
          </Text>
        </View>
        <View style={styles.headerActions}>
          <Pressable accessibilityRole="button" onPress={handleEndCall} style={[styles.headerActionBtn, styles.exitBtn]}>
            <Ionicons color="#ffffff" name="close-circle-outline" size={22} />
          </Pressable>
        </View>
      </View>

      {/* ── Messages List ScrollView ── */}
      <ScrollView
        ref={scrollViewRef}
        contentContainerStyle={styles.chatScroll}
        onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.infoBanner}>
          <Text style={styles.infoBannerText}>
            🔒 Messages are encrypted and saved to your request history.
          </Text>
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
                {/* Inline image reference */}
                {item.attachment && (
                  <Image source={{ uri: item.attachment }} style={styles.bubbleImage} />
                )}

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

        {/* ── In-Chat Quote Card ── */}
        {quotePreview?.pricingSnapshot && (
          <View style={styles.quoteCardContainer}>
            <View style={styles.quoteCard}>
              <View style={styles.quoteCardHeader}>
                <Ionicons name="receipt" size={20} color={colors.brand} />
                <Text style={styles.quoteCardTitle}>Service Estimate</Text>
              </View>
              
              <Text style={styles.quoteCardSummary}>
                {quotePreview.summary || 'Summary of selected services.'}
              </Text>

              <View style={styles.quoteCardMeta}>
                <Text style={styles.quoteCardMetaText}>
                  📅 Scheduled: {quotePreview.timingPreference === 'later' ? (quotePreview.scheduledForText || 'Later') : 'As soon as possible'}
                </Text>
              </View>

              <View style={styles.quoteCardDivider} />
              
              <View style={styles.quoteCardBreakdown}>
                {pricingLines.map((line, index) => (
                  <View key={`${line.label}-${index}`} style={styles.quoteCardRow}>
                    <Text style={styles.quoteCardLabel}>{line.label}</Text>
                    <Text style={styles.quoteCardVal}>{formatCurrency(line.amount)}</Text>
                  </View>
                ))}
              </View>

              <View style={styles.quoteCardDivider} />

              <View style={styles.quoteCardTotalRow}>
                <Text style={styles.quoteCardTotalLabel}>Total Estimate</Text>
                <Text style={styles.quoteCardTotalVal}>{formatCurrency(quotePreview.pricingSnapshot.total)}</Text>
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
                      <Text style={styles.quoteBtnText}>Confirm & Continue</Text>
                    )}
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    disabled={quoteLoading}
                    onPress={() => handleDeclineQuote()}
                    style={[styles.quoteBtn, styles.quoteBtnDecline]}
                  >
                    <Text style={styles.quoteBtnTextDecline}>Decline & Review</Text>
                  </Pressable>
                </View>
              ) : (
                <View style={styles.quoteStatusContainer}>
                  <Ionicons name="checkmark-circle" size={18} color="#059669" />
                  <Text style={styles.quoteStatusText}>Estimate Approved</Text>
                </View>
              )}
            </View>
          </View>
        )}

        {error ? (
          <View style={styles.chatError}>
            <Text style={styles.chatErrorText}>{error}</Text>
          </View>
        ) : null}

        {isTyping && (
          <View style={styles.typingBubble}>
            <ActivityIndicator color={colors.brand} size="small" style={{ marginRight: 6 }} />
            <Text style={styles.typingText}>Uncedo is writing...</Text>
          </View>
        )}
      </ScrollView>

      {/* ── Selection Chips & Presets ── */}
      {(selectedCategoryServices.length > 0 || !structuredRequest.categoryId) && !quotePreview?.pricingSnapshot && (
        <View style={styles.selectorContainer}>
          <Text style={styles.selectorTitle}>
            {!structuredRequest.categoryId ? 'Select Category:' : 'Select Services:'}
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.selectorScroll}
          >
            {!structuredRequest.categoryId ? (
              // Category chips
              CUSTOMER_SERVICE_CATEGORY_OPTIONS.map((cat) => (
                <Pressable
                  key={cat.id}
                  accessibilityRole="button"
                  onPress={() => handleManualCategorySelection(cat.id)}
                  style={styles.selectorChip}
                >
                  <Text style={styles.selectorChipText}>{cat.label}</Text>
                </Pressable>
              ))
            ) : (
              // Service chips
              selectedCategoryServices.map((service) => {
                const isActive = structuredRequest.serviceIds.includes(service.id);
                return (
                  <Pressable
                    key={service.id}
                    accessibilityRole="button"
                    onPress={() => handleManualServiceSelection(service.id)}
                    style={[styles.selectorChip, isActive && styles.selectorChipActive]}
                  >
                    <Text style={[styles.selectorChipText, isActive && styles.selectorChipTextActive]}>
                      {service.label}
                    </Text>
                  </Pressable>
                );
              })
            )}
          </ScrollView>
        </View>
      )}

      {/* ── WhatsApp Bottom Input Bar ── */}
      <View style={styles.inputBar}>
        <View style={styles.mainInputContainer}>
          <Pressable
            accessibilityRole="button"
            disabled={uploading}
            onPress={() => setUploadPickerVisible(true)}
            style={styles.inputIconBtn}
          >
            {uploading ? (
              <ActivityIndicator color={colors.brand} size="small" />
            ) : (
              <Ionicons color={colors.muted} name="add" size={24} />
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
        </View>

        {/* Send Circular Button */}
        <Pressable
          accessibilityRole="button"
          disabled={!inputText.trim()}
          onPress={handleSendMessage}
          style={[
            styles.roundActionBtn,
            !inputText.trim() && styles.roundActionBtnDisabled
          ]}
        >
          <Ionicons color="#ffffff" name="send" size={18} style={{ marginLeft: 2 }} />
        </Pressable>
      </View>

      <AttachmentPickerModal
        mode="library"
        onCancel={() => setUploadPickerVisible(false)}
        onError={(msg) => {
          setUploadPickerVisible(false);
          setError(msg);
        }}
        onFilesSelected={handleUploadReferences}
        visible={uploadPickerVisible}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: '#efeae2', // WhatsApp chat background color
    flex: 1,
  },
  
  // ── Header ────────────────────────────────────────────────────────────────
  header: {
    alignItems: 'center',
    backgroundColor: '#075e54', // WhatsApp classic green header
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingTop: Platform.OS === 'ios' ? 48 : 34,
    paddingBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
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
    backgroundColor: '#128c7e',
    borderRadius: 20,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  statusDot: {
    backgroundColor: '#4ade80',
    borderColor: '#075e54',
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
    color: 'rgba(255,255,255,0.8)',
    fontSize: 12,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerActionBtn: {
    padding: 4,
  },
  exitBtn: {
    marginLeft: 4,
  },

  // ── Chat List ──────────────────────────────────────────────────────────────
  chatScroll: {
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 24,
  },
  infoBanner: {
    alignSelf: 'center',
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderRadius: 8,
    marginBottom: 16,
    paddingHorizontal: 10,
    paddingVertical: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 1,
    elevation: 1,
  },
  infoBannerText: {
    color: '#475569',
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
    borderRadius: 12,
    maxWidth: '82%',
    paddingHorizontal: 10,
    paddingVertical: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 1.5,
    elevation: 1.5,
  },
  assistantBubble: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 2,
  },
  customerBubble: {
    backgroundColor: '#e7ffdb', // WhatsApp self message bubble color
    borderTopRightRadius: 2,
  },
  voiceNoteRow: {
    alignItems: 'center',
    flexDirection: 'row',
    marginBottom: 4,
  },
  voiceNoteLabel: {
    color: colors.brandDark,
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  bubbleImage: {
    borderRadius: 8,
    height: 160,
    marginBottom: 6,
    width: 220,
  },
  bubbleTextRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  messageText: {
    color: '#0f172a',
    flex: 1,
    fontSize: 14.5,
    lineHeight: 20,
    paddingRight: 8,
  },
  customerText: {
    color: '#0f172a',
  },
  playButton: {
    padding: 2,
  },
  messageTime: {
    color: '#64748b',
    fontSize: 10,
    marginTop: 3,
    textAlign: 'right',
  },
  customerTime: {
    color: '#64748b',
  },
  typingBubble: {
    alignItems: 'center',
    flexDirection: 'row',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  typingText: {
    color: '#64748b',
    fontSize: 12,
    fontStyle: 'italic',
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

  // ── Selector Presets ────────────────────────────────────────────────────────
  selectorContainer: {
    backgroundColor: '#f8fafc',
    borderTopColor: '#e2e8f0',
    borderTopWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  selectorTitle: {
    color: '#475569',
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  selectorScroll: {
    gap: 8,
    paddingRight: 12,
  },
  selectorChip: {
    backgroundColor: '#ffffff',
    borderColor: '#cbd5e1',
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  selectorChipActive: {
    backgroundColor: '#059669',
    borderColor: '#059669',
  },
  selectorChipText: {
    color: '#0f172a',
    fontSize: 12.5,
    fontWeight: '700',
  },
  selectorChipTextActive: {
    color: '#ffffff',
  },

  // ── WhatsApp Input Bar ──────────────────────────────────────────────────────
  inputBar: {
    alignItems: 'center',
    backgroundColor: 'transparent',
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    paddingBottom: Platform.OS === 'ios' ? 24 : 10,
  },
  mainInputContainer: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 24,
    flex: 1,
    flexDirection: 'row',
    minHeight: 48,
    paddingHorizontal: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 1.5,
    elevation: 2,
  },
  textInput: {
    color: '#0f172a',
    flex: 1,
    fontSize: 15,
    maxHeight: 100,
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  inputIconBtn: {
    padding: 6,
  },
  roundActionBtn: {
    alignItems: 'center',
    backgroundColor: '#075e54', // WhatsApp classic green button
    borderRadius: 24,
    height: 48,
    justifyContent: 'center',
    width: 48,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
    elevation: 3,
  },
  roundActionBtnDisabled: {
    backgroundColor: '#cbd5e1',
  },

  // ── Quote Card ─────────────────────────────────────────────────────────────
  quoteCardContainer: {
    marginVertical: 14,
    width: '100%',
  },
  quoteCard: {
    backgroundColor: '#ffffff',
    borderRadius: 22,
    borderColor: '#e2e8f0',
    borderWidth: 1.5,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 4,
  },
  quoteCardHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  quoteCardTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '900',
  },
  quoteCardSummary: {
    color: '#334155',
    fontSize: 14.5,
    lineHeight: 21,
    marginBottom: 8,
  },
  quoteCardMeta: {
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignSelf: 'flex-start',
    marginBottom: 12,
  },
  quoteCardMetaText: {
    color: colors.brandDark,
    fontSize: 12,
    fontWeight: '700',
  },
  quoteCardDivider: {
    backgroundColor: '#e2e8f0',
    height: 1,
    marginVertical: 10,
  },
  quoteCardBreakdown: {
    gap: 8,
  },
  quoteCardRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  quoteCardLabel: {
    color: '#64748b',
    fontSize: 14,
  },
  quoteCardVal: {
    color: '#0f172a',
    fontSize: 14,
    fontWeight: '700',
  },
  quoteCardTotalRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 4,
  },
  quoteCardTotalLabel: {
    color: '#0f172a',
    fontSize: 15.5,
    fontWeight: '900',
  },
  quoteCardTotalVal: {
    color: '#075e54',
    fontSize: 18,
    fontWeight: '900',
  },
  quoteActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  quoteBtn: {
    alignItems: 'center',
    borderRadius: 12,
    flex: 1,
    height: 44,
    justifyContent: 'center',
  },
  quoteBtnApprove: {
    backgroundColor: '#075e54',
  },
  quoteBtnDecline: {
    backgroundColor: '#ffffff',
    borderColor: '#cbd5e1',
    borderWidth: 1,
  },
  quoteBtnText: {
    color: '#ffffff',
    fontSize: 13.5,
    fontWeight: '800',
  },
  quoteBtnTextDecline: {
    color: '#b91c1c',
    fontSize: 13.5,
    fontWeight: '800',
  },
  quoteStatusContainer: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'center',
    marginTop: 14,
  },
  quoteStatusText: {
    color: '#059669',
    fontSize: 13.5,
    fontWeight: '800',
  },
});
