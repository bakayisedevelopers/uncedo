import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AttachmentPickerModal } from '../../components/customer/AttachmentPickerModal';
import { CustomerAiCallBridge } from '../../components/customer/CustomerAiCallBridge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { ErrorState, LoadingState } from '../../components/ui/States';
import { AI_LIVE_PROXY_WS_URL } from '../../constants/runtimeConfig';
import {
  buildCustomerIntakePromptCatalog,
  buildCustomerIntakeQuestionPlan,
  getSelectedServiceMetadata,
} from '../../constants/customerIntakeQuestions';
import { createServiceRequestDraft } from '../../constants/requestPayload';
import { getCustomerServiceById, getCustomerServiceCategoryById, getCustomerServicesForCategory } from '../../constants/serviceCatalog';
import { useAuth } from '../../context/AuthContext';
import { getFirebaseClients } from '../../firebase/config';
import {
  appendCustomerServiceTranscript,
  buildServicePricingSnapshot,
  cancelCustomerServiceCall,
  createCustomerServiceCall,
  createCustomerServiceRequest,
  deriveTimingDetails,
  finalizeCustomerServiceRequest,
  saveCustomerServiceQuotePreview,
  subscribeToServiceRequestById,
  updateCustomerServiceRequest,
  uploadCustomerServiceReference,
} from '../../services/customerServiceRequestService';
import { colors } from '../../theme/colors';
import { formatMissingRequirementLabel, getCallStatusMeta } from '../../utils/serviceRequestStatus';

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

function isLikelyApprovalText(value = '') {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return false;
  return ['i approve', 'approve', 'proceed', 'go ahead', 'yes confirm', 'yes i confirm', 'that is fine', 'sharp', 'continue']
    .some((phrase) => normalized.includes(phrase));
}

function isLikelyDeclineText(value = '') {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return false;
  return ['too high', 'decline', 'cancel', 'do not continue', 'not happy', 'no thanks', 'no thank you', 'review details', 'change it']
    .some((phrase) => normalized.includes(phrase));
}

function buildCallIntroContext({ customerName = '', requestState = {} } = {}) {
  const serviceCatalog = buildCustomerIntakePromptCatalog();
  const questionPlan = buildCustomerIntakeQuestionPlan();
  return {
    agentType: 'customer_request',
    customerName,
    topic: 'Uncedo customer service request intake',
    description: 'Collect the category, service, timing, location, and any required follow-up details for a customer service request.',
    primer: `Greet ${customerName || 'the customer'} by name, ask what help they need, identify exactly one category, collect at least one service, and ask whether they need help now or later.`,
    serviceCatalog,
    questionPlan,
    requestState,
  };
}

function mergeStructuredDraft(current, nextDraft = {}) {
  return {
    ...current,
    categoryId: nextDraft.categoryId || current.categoryId,
    serviceIds: Array.isArray(nextDraft.serviceIds) && nextDraft.serviceIds.length
      ? nextDraft.serviceIds
      : current.serviceIds,
    structuredAnswers: {
      ...(current.structuredAnswers || {}),
      ...(nextDraft.structuredAnswers || {}),
      ...(nextDraft.requiredAnswers || {}),
      ...(nextDraft.optionalAnswers || {}),
    },
    selectedPortfolioReferences: Array.isArray(nextDraft.selectedPortfolioReferences)
      ? nextDraft.selectedPortfolioReferences
      : current.selectedPortfolioReferences,
    safetyFlags: Array.isArray(nextDraft.safetyFlags) ? nextDraft.safetyFlags : current.safetyFlags,
    missingRequired: Array.isArray(nextDraft.missingRequired) ? nextDraft.missingRequired : current.missingRequired,
  };
}

export function CustomerServiceCallScreen({ navigate, goBack }) {
  const { user } = useAuth();
  const bridgeRef = useRef(null);
  const initSentRef = useRef(false);
  const finalizingRef = useRef(false);
  const callClosedRef = useRef(false);
  const callCompletionStatusRef = useRef('active');
  const quotePresentedRef = useRef(false);
  const quoteDecisionPendingRef = useRef(false);

  const [requestId, setRequestId] = useState('');
  const [callId, setCallId] = useState('');
  const [idToken, setIdToken] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [callStatus, setCallStatus] = useState('dialing');
  const [bridgeInstanceKey, setBridgeInstanceKey] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [conversation, setConversation] = useState([]);
  const [selectionRequest, setSelectionRequest] = useState(null);
  const [uploadPickerVisible, setUploadPickerVisible] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteAwaitingApproval, setQuoteAwaitingApproval] = useState(false);
  const [quotePreview, setQuotePreview] = useState(null);
  const [uploadedReferences, setUploadedReferences] = useState([]);
  const [structuredRequest, setStructuredRequest] = useState(() => ({
    ...createServiceRequestDraft(),
    structuredAnswers: {},
    missingRequired: ['category', 'service'],
  }));

  const selectedServiceMetadata = useMemo(
    () => getSelectedServiceMetadata(structuredRequest.serviceIds),
    [structuredRequest.serviceIds],
  );
  const callStatusMeta = useMemo(() => getCallStatusMeta(callStatus), [callStatus]);
  const selectedCategoryServices = useMemo(
    () => getCustomerServicesForCategory(structuredRequest.categoryId),
    [structuredRequest.categoryId],
  );
  const canUploadReference = selectedServiceMetadata.some((service) => service.requiresPortfolioSelection);
  const canRetryCall = ['disconnected', 'ended'].includes(callStatus) && callCompletionStatusRef.current === 'active';
  const pricingLines = Array.isArray(quotePreview?.pricingSnapshot?.lines) ? quotePreview.pricingSnapshot.lines : [];
  const timingDetails = useMemo(
    () => deriveTimingDetails(structuredRequest.structuredAnswers),
    [structuredRequest.structuredAnswers],
  );
  const quoteModalVisible = quoteLoading || !!quotePreview?.pricingSnapshot;

  useEffect(() => {
    let active = true;

    async function bootstrap() {
      try {
        const clients = await getFirebaseClients();
        const token = await clients?.auth?.currentUser?.getIdToken?.();
        if (!token) {
          throw new Error('You must be signed in to start a call.');
        }

        const nextRequestId = await createCustomerServiceRequest({ user });
        const nextCallId = await createCustomerServiceCall({ requestId: nextRequestId, user });

        if (!active) return;
        setIdToken(token);
        setRequestId(nextRequestId);
        setCallId(nextCallId);
        setElapsedSeconds(0);
        setStructuredRequest((current) => ({
          ...current,
          serviceAddress: String(user?.customerProfile?.serviceAddress || '').trim(),
        }));
        setLoading(false);
      } catch (nextError) {
        if (!active) return;
        setError(nextError.message || 'Unable to start the service request call.');
        setLoading(false);
      }
    }

    bootstrap();
    return () => {
      active = false;
    };
  }, [user]);

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

  useEffect(() => {
    if (!['connected', 'listening', 'speaking'].includes(callStatus)) return () => {};
    const timer = setInterval(() => setElapsedSeconds((current) => current + 1), 1000);
    return () => clearInterval(timer);
  }, [callStatus]);

  useEffect(() => () => {
    bridgeRef.current?.close?.();
    if (callId && callCompletionStatusRef.current !== 'completed') {
      cancelCustomerServiceCall(callId).catch(() => null);
    }
  }, [callId]);

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
    if (!requestId || !callId || finalizingRef.current) return;
    if (!nextStructuredState.categoryId || !(nextStructuredState.serviceIds || []).length) return;
    finalizingRef.current = true;

    try {
      const pricingSnapshot = await finalizeCustomerServiceRequest({
        requestId,
        callId,
        categoryId: nextStructuredState.categoryId,
        serviceIds: nextStructuredState.serviceIds,
        structuredAnswers: nextStructuredState.structuredAnswers,
        selectedPortfolioReferences: nextStructuredState.selectedPortfolioReferences || [],
        referenceAttachments: uploadedReferences,
      });

      callCompletionStatusRef.current = 'completed';
      setCallStatus('searching');
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
    if (!nextStructuredState.categoryId || !(nextStructuredState.serviceIds || []).length) return;

    setQuoteLoading(true);
    try {
      const fallbackPricingSnapshot = buildServicePricingSnapshot({
        categoryId: nextStructuredState.categoryId,
        serviceIds: nextStructuredState.serviceIds,
      });
      const nextQuotePreview = await saveCustomerServiceQuotePreview({
        requestId,
        categoryId: nextStructuredState.categoryId,
        serviceIds: nextStructuredState.serviceIds,
        structuredAnswers: nextStructuredState.structuredAnswers,
        selectedPortfolioReferences: nextStructuredState.selectedPortfolioReferences || [],
        referenceAttachments: uploadedReferences,
      });

      quotePresentedRef.current = true;
      setQuotePreview(nextQuotePreview || { pricingSnapshot: fallbackPricingSnapshot, summary: '' });
      setQuoteAwaitingApproval(true);
      setCallStatus('connected');
      setConversation((current) => ([
        ...current,
        {
          id: `quote-${Date.now()}`,
          role: 'assistant',
          text: `I have your estimate ready. The current price is ${formatCurrency((nextQuotePreview || { pricingSnapshot: fallbackPricingSnapshot }).pricingSnapshot?.total)}. Please review the quote and tell me if you approve or want to revise the details.`,
        },
      ]));
      bridgeRef.current?.sendAppPrompt?.(
        [
          'The app pricing engine finished calculating the quote.',
          `Quote total: ${formatCurrency((nextQuotePreview || { pricingSnapshot: fallbackPricingSnapshot }).pricingSnapshot?.total)}.`,
          `Request summary: ${(nextQuotePreview || { summary: '' }).summary || 'Service request ready for review.'}`,
          `Timing: ${nextQuotePreview?.timingPreference === 'later' ? `Scheduled for ${nextQuotePreview?.scheduledForText || 'later'}` : 'As soon as possible'}.`,
          'Tell the customer this is the final quote from the app, summarize the request, and ask them to approve or decline.',
          'Do not calculate a new price.',
        ].join(' ')
      );
    } catch (nextError) {
      setError(nextError.message || 'Unable to prepare the service quote.');
      quotePresentedRef.current = false;
    } finally {
      setQuoteLoading(false);
    }
  };

  const handleApproveQuote = async () => {
    if (quoteDecisionPendingRef.current || !quotePreview?.pricingSnapshot) return;
    quoteDecisionPendingRef.current = true;
    setQuoteAwaitingApproval(false);
    setQuoteLoading(true);
    try {
      bridgeRef.current?.sendCustomerText?.('Yes, I approve this price. Please continue.', {
        source: 'quote_approval',
      });
      await finalizeAndRoute(structuredRequest);
    } finally {
      quoteDecisionPendingRef.current = false;
      setQuoteLoading(false);
    }
  };

  const handleDeclineQuote = () => {
    quoteDecisionPendingRef.current = false;
    quotePresentedRef.current = false;
    setQuoteAwaitingApproval(false);
    setQuotePreview(null);
    updateCustomerServiceRequest(requestId, {
      status: 'collecting_details',
      statusDetail: 'Continuing the call to review service details.',
    }).catch(() => null);
    bridgeRef.current?.sendCustomerText?.(
      'No, I do not want to proceed with this price. Please help me review or adjust the details.',
      { source: 'quote_decline' },
    );
  };

  const handleBridgeMessage = async (event) => {
    try {
      const payload = JSON.parse(event?.nativeEvent?.data || '{}');
      if (payload.type === 'bridge_ready') {
        return;
      }

      if (payload.type === 'status') {
        const nextStatus = payload?.payload?.status || 'connected';
        setCallStatus(nextStatus);
        if (nextStatus === 'connected' && !initSentRef.current) {
          initSentRef.current = true;
          bridgeRef.current?.sendInitContext?.(buildCallIntroContext({
            customerName: String(user?.fullName || user?.displayName || 'there').trim().split(' ')[0] || 'there',
            requestState: structuredRequest,
          }));
        }
        if (nextStatus === 'ended' || nextStatus === 'disconnected') {
          callClosedRef.current = true;
        }
        return;
      }

      if (payload.type === 'audio_state') {
        if (typeof payload?.payload?.isMuted === 'boolean') {
          setIsMuted(payload.payload.isMuted);
        }
        return;
      }

      if (payload.type === 'error') {
        setError(payload.message || 'AI call error.');
        return;
      }

      if (payload.type !== 'bridge_event') {
        return;
      }

      const message = payload.payload || {};
      if (message.type === 'status') {
        const nextStatus = message.status || 'connected';
        setCallStatus(nextStatus);
        if (nextStatus === 'connected' && !initSentRef.current) {
          initSentRef.current = true;
          bridgeRef.current?.sendInitContext?.(buildCallIntroContext({
            customerName: String(user?.fullName || user?.displayName || 'there').trim().split(' ')[0] || 'there',
            requestState: structuredRequest,
          }));
        }
        if (nextStatus === 'ended' || nextStatus === 'disconnected') {
          callClosedRef.current = true;
        }
        return;
      }

      if (message.type === 'conversation_event' && message.event) {
        const nextEvent = {
          id: `${message.event.role}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
          role: message.event.role,
          text: message.event.text || '',
          questionId: message.event.questionId || '',
        };
        setConversation((current) => [...current, nextEvent]);
        appendCustomerServiceTranscript(requestId, nextEvent).catch(() => null);
        if (quoteAwaitingApproval && nextEvent.role !== 'assistant' && !quoteDecisionPendingRef.current) {
          if (isLikelyApprovalText(nextEvent.text)) {
            handleApproveQuote();
          } else if (isLikelyDeclineText(nextEvent.text)) {
            handleDeclineQuote();
          }
        }
        return;
      }

      if (message.type === 'transcript_final') {
        const nextDraft = message.requestDraft || {};
        const nextSelectionRequest = message.selectionRequest || null;
        const nextStructuredState = mergeStructuredDraft(structuredRequest, nextDraft);
        setStructuredRequest(nextStructuredState);
        setSelectionRequest(nextSelectionRequest);
        persistStructuredState(nextStructuredState).catch(() => null);
        if ((message.agentStatus || nextDraft.status) === 'ready_to_search' && !nextStructuredState.missingRequired?.length) {
          presentQuoteForApproval(nextStructuredState);
        }
      }
    } catch (nextError) {
      setError(nextError.message || 'Unable to process AI call updates.');
    }
  };

  const handleRetryCall = () => {
    initSentRef.current = false;
    callClosedRef.current = false;
    quoteDecisionPendingRef.current = false;
    setError('');
    setCallStatus('dialing');
    setElapsedSeconds(0);
    setBridgeInstanceKey((current) => current + 1);
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
      missingRequired: [],
    };
    setStructuredRequest(nextStructuredState);
    setSelectionRequest(null);
    persistStructuredState(nextStructuredState).catch(() => null);
    bridgeRef.current?.sendCustomerText?.(`I choose the ${selectedService.label} service.`, {
      source: 'service_chip',
      serviceId,
      categoryId: selectedService.categoryId,
    });
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
      bridgeRef.current?.sendCustomerText?.(
        `I uploaded ${uploaded.length} reference image${uploaded.length === 1 ? '' : 's'} for this service.`,
        { source: 'reference_upload', count: uploaded.length },
      );
    } catch (nextError) {
      setError(nextError.message || 'Unable to upload reference images.');
    } finally {
      setUploading(false);
    }
  };

  const handleEndCall = async () => {
    callCompletionStatusRef.current = 'canceled';
    if (!callClosedRef.current) {
      bridgeRef.current?.close?.();
    }
    await cancelCustomerServiceCall(callId).catch(() => null);
    goBack('CustomerHome');
  };

  if (loading) {
    return <LoadingState label="Starting your service request call" />;
  }

  if (error && !requestId) {
    return <ErrorState message={error} />;
  }

  return (
    <View style={styles.screen}>
      <CustomerAiCallBridge
        key={`${callId}-${bridgeInstanceKey}`}
        ref={bridgeRef}
        callId={callId}
        idToken={idToken}
        onBridgeMessage={handleBridgeMessage}
        wsBaseUrl={AI_LIVE_PROXY_WS_URL}
      />

      <View style={styles.header}>
        <Text style={styles.headerEyebrow}>Live request call</Text>
        <Text style={styles.headerTitle}>Calling Uncedo AI</Text>
        <Text style={styles.headerStatus}>{callStatusMeta.label}</Text>
        <Text style={styles.headerTimer}>{formatElapsed(elapsedSeconds)}</Text>
        <Text style={styles.headerDetail}>
          {quoteAwaitingApproval
            ? 'Your quote is ready. Review it in the pop-up and say “I approve” to continue.'
            : callStatusMeta.detail}
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Card style={styles.statusCard}>
          <Text style={styles.sectionTitle}>What happens now</Text>
          <Text style={styles.selectionCopy}>
            {quoteAwaitingApproval
              ? 'The quote is waiting for your approval. Matching will only start after you confirm.'
              : callStatusMeta.detail}
          </Text>
          {canRetryCall ? (
            <Button onPress={handleRetryCall} variant="secondary">
              Retry live call
            </Button>
          ) : null}
        </Card>

        <Card style={styles.summaryCard}>
          <Text style={styles.sectionTitle}>Current request</Text>
          <Text style={styles.summaryLine}>
            Category: {structuredRequest.categoryId ? (getCustomerServiceCategoryById(structuredRequest.categoryId)?.label || structuredRequest.categoryId) : 'Not selected yet'}
          </Text>
          <Text style={styles.summaryLine}>
            Services: {selectedServiceMetadata.length ? selectedServiceMetadata.map((item) => item.label).join(', ') : 'Not selected yet'}
          </Text>
          <Text style={styles.summaryLine}>
            Timing: {timingDetails.timingPreference === 'later' ? (timingDetails.scheduledForText || 'Scheduled for later') : 'Now / as soon as possible'}
          </Text>
          <Text style={styles.summaryLine}>
            Saved address: {structuredRequest.serviceAddress || user?.customerProfile?.serviceAddress || 'Not available'}
          </Text>
          {structuredRequest.missingRequired?.length ? (
            <View style={styles.requirementList}>
              {structuredRequest.missingRequired.map((item) => (
                <View key={item} style={styles.requirementPill}>
                  <Text style={styles.requirementText}>{formatMissingRequirementLabel(item)}</Text>
                </View>
              ))}
            </View>
          ) : (
            <View style={styles.readyPill}>
              <Ionicons color="#166534" name="checkmark-circle" size={16} />
              <Text style={styles.readyPillText}>Required request details collected</Text>
            </View>
          )}
        </Card>

        {conversation.length ? (
          <Card style={styles.transcriptCard}>
            <Text style={styles.sectionTitle}>Conversation</Text>
            <View style={styles.transcriptList}>
              {conversation.map((item) => (
                <View key={item.id} style={[styles.transcriptBubble, item.role === 'assistant' ? styles.assistantBubble : styles.customerBubble]}>
                  <Text style={[styles.transcriptRole, item.role === 'assistant' ? styles.assistantRole : styles.customerRole]}>
                    {item.role === 'assistant' ? 'Uncedo AI' : 'You'}
                  </Text>
                  <Text style={[styles.transcriptText, item.role === 'assistant' ? null : styles.customerText]}>
                    {item.text}
                  </Text>
                </View>
              ))}
            </View>
          </Card>
        ) : null}

        {(selectionRequest || structuredRequest.categoryId) ? (
          <Card style={styles.selectionCard}>
            <Text style={styles.sectionTitle}>Selection</Text>
            <Text style={styles.selectionCopy}>
              {selectionRequest?.prompt || 'Choose the service that best matches what you need.'}
            </Text>

            {selectedCategoryServices.length ? (
              <View style={styles.chipWrap}>
                {selectedCategoryServices.map((service) => (
                  <Pressable
                    key={service.id}
                    accessibilityRole="button"
                    onPress={() => handleManualServiceSelection(service.id)}
                    style={[
                      styles.chip,
                      structuredRequest.serviceIds.includes(service.id) ? styles.chipActive : null,
                    ]}
                  >
                    <Text style={[styles.chipText, structuredRequest.serviceIds.includes(service.id) ? styles.chipTextActive : null]}>
                      {service.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : (
              <Text style={styles.selectionHint}>AI will suggest a category and service options here when needed.</Text>
            )}

            {canUploadReference ? (
              <Button
                disabled={uploading}
                icon={<Ionicons color="#ffffff" name="image" size={16} />}
                onPress={() => setUploadPickerVisible(true)}
                style={styles.uploadButton}
              >
                {uploading ? 'Uploading...' : 'Upload reference image'}
              </Button>
            ) : null}

            {uploadedReferences.length ? (
              <View style={styles.referenceList}>
                {uploadedReferences.map((reference) => (
                  <Text key={reference.objectPath} style={styles.referenceItem}>
                    Uploaded: {reference.fileName}
                  </Text>
                ))}
              </View>
            ) : null}
          </Card>
        ) : null}

        {error ? (
          <Card style={styles.errorCard}>
            <Text style={styles.errorText}>{error}</Text>
          </Card>
        ) : null}
      </ScrollView>

      <View style={styles.controls}>
        <Pressable accessibilityRole="button" onPress={() => bridgeRef.current?.toggleMute?.()} style={styles.iconButton}>
          <Ionicons color={colors.text} name={isMuted ? 'mic-off' : 'mic'} size={22} />
        </Pressable>
        <Pressable accessibilityRole="button" style={[styles.iconButton, styles.iconButtonInactive]}>
          <Ionicons color={colors.text} name="volume-high" size={22} />
        </Pressable>
        <Pressable accessibilityRole="button" onPress={handleEndCall} style={[styles.iconButton, styles.endButton]}>
          <Ionicons color="#ffffff" name="call" size={22} style={styles.endIcon} />
        </Pressable>
      </View>

      <AttachmentPickerModal
        mode="library"
        onCancel={() => setUploadPickerVisible(false)}
        onError={(message) => {
          setUploadPickerVisible(false);
          setError(message);
        }}
        onFilesSelected={handleUploadReferences}
        visible={uploadPickerVisible}
      />

      <Modal animationType="fade" transparent visible={quoteModalVisible}>
        <View style={styles.quoteModalBackdrop}>
          <View style={styles.quoteModalCard}>
            {quoteLoading && !quotePreview?.pricingSnapshot ? (
              <View style={styles.quoteLoadingState}>
                <ActivityIndicator color={colors.brandDark} size="large" />
                <Text style={styles.quoteModalTitle}>Calculating your price</Text>
                <Text style={styles.quoteModalCopy}>Please hold on while we prepare your service quote.</Text>
              </View>
            ) : quotePreview?.pricingSnapshot ? (
              <View style={styles.quoteModalContent}>
                <Text style={styles.quoteModalEyebrow}>Quote review</Text>
                <Text style={styles.quoteModalTitle}>{formatCurrency(quotePreview.pricingSnapshot.total)}</Text>
                <Text style={styles.quoteModalCopy}>
                  {quotePreview.summary || 'Please review this service quote before we continue.'}
                </Text>
                <View style={styles.quoteMetaList}>
                  <Text style={styles.quoteMetaLine}>
                    Services: {selectedServiceMetadata.length ? selectedServiceMetadata.map((item) => item.label).join(', ') : 'Not selected yet'}
                  </Text>
                  <Text style={styles.quoteMetaLine}>
                    Timing: {quotePreview.timingPreference === 'later' ? (quotePreview.scheduledForText || 'Scheduled for later') : 'Now / as soon as possible'}
                  </Text>
                </View>
                <View style={styles.quoteBreakdown}>
                  {pricingLines.map((line, index) => (
                    <View key={`${line.label}-${index}`} style={styles.quoteRow}>
                      <Text style={styles.quoteLabel}>{line.label || 'Charge'}</Text>
                      <Text style={styles.quoteValue}>{formatCurrency(line.amount)}</Text>
                    </View>
                  ))}
                </View>
                <View style={styles.quoteTotalRow}>
                  <Text style={styles.quoteTotalLabel}>Total</Text>
                  <Text style={styles.quoteTotalValue}>{formatCurrency(quotePreview.pricingSnapshot.total)}</Text>
                </View>
                <Text style={styles.quoteHint}>
                  Say “I approve” to continue, or say “decline” to review the details again. Buttons stay available as fallback.
                </Text>
                {quoteAwaitingApproval ? (
                  <View style={styles.quoteActions}>
                    <Button disabled={quoteLoading} onPress={handleApproveQuote}>
                      Confirm and continue
                    </Button>
                    <Button disabled={quoteLoading} onPress={handleDeclineQuote} variant="secondary">
                      Decline and review
                    </Button>
                  </View>
                ) : null}
              </View>
            ) : null}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: '#0f172a',
    flex: 1,
  },
  header: {
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 32,
    paddingBottom: 18,
  },
  headerEyebrow: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  headerTitle: {
    color: '#ffffff',
    fontSize: 30,
    fontWeight: '900',
    marginTop: 10,
  },
  headerStatus: {
    color: '#86efac',
    fontSize: 15,
    fontWeight: '700',
    marginTop: 8,
  },
  headerTimer: {
    color: '#ffffff',
    fontSize: 32,
    fontWeight: '900',
    marginTop: 6,
  },
  headerDetail: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 13,
    lineHeight: 19,
    marginTop: 8,
    textAlign: 'center',
  },
  quoteModalBackdrop: {
    alignItems: 'center',
    backgroundColor: 'rgba(2,6,23,0.72)',
    flex: 1,
    justifyContent: 'center',
    padding: 20,
  },
  quoteModalCard: {
    backgroundColor: '#ffffff',
    borderRadius: 28,
    maxWidth: 520,
    paddingHorizontal: 22,
    paddingVertical: 24,
    width: '100%',
  },
  quoteLoadingState: {
    alignItems: 'center',
    gap: 12,
  },
  quoteModalContent: {
    gap: 14,
  },
  quoteModalEyebrow: {
    color: colors.brandDark,
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  quoteModalTitle: {
    color: colors.text,
    fontSize: 34,
    fontWeight: '900',
  },
  quoteModalCopy: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 21,
  },
  quoteMetaList: {
    gap: 6,
  },
  quoteMetaLine: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 19,
  },
  content: {
    gap: 14,
    paddingHorizontal: 16,
    paddingBottom: 120,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '900',
  },
  summaryCard: {
    gap: 8,
  },
  statusCard: {
    gap: 10,
  },
  summaryLine: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
  },
  requirementList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  requirementPill: {
    backgroundColor: '#fff7ed',
    borderColor: '#fdba74',
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  requirementText: {
    color: '#9a3412',
    fontSize: 12,
    fontWeight: '800',
  },
  readyPill: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#dcfce7',
    borderRadius: 999,
    flexDirection: 'row',
    gap: 6,
    marginTop: 4,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  readyPillText: {
    color: '#166534',
    fontSize: 12,
    fontWeight: '800',
  },
  transcriptCard: {
    gap: 12,
  },
  transcriptList: {
    gap: 10,
  },
  transcriptBubble: {
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  assistantBubble: {
    backgroundColor: '#ffffff',
    borderColor: colors.border,
    borderWidth: 1,
  },
  customerBubble: {
    alignSelf: 'flex-end',
    backgroundColor: colors.brand,
    maxWidth: '88%',
  },
  transcriptRole: {
    fontSize: 11,
    fontWeight: '900',
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  assistantRole: {
    color: colors.brandDark,
  },
  customerRole: {
    color: 'rgba(255,255,255,0.8)',
  },
  transcriptText: {
    color: colors.text,
    fontSize: 14,
    lineHeight: 21,
  },
  customerText: {
    color: '#ffffff',
  },
  selectionCard: {
    gap: 12,
  },
  selectionCopy: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 21,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    backgroundColor: '#f4f4f5',
    borderColor: colors.border,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  chipActive: {
    backgroundColor: '#dcfce7',
    borderColor: '#86efac',
  },
  chipText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '800',
  },
  chipTextActive: {
    color: colors.brandDark,
  },
  selectionHint: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
  },
  uploadButton: {
    marginTop: 2,
  },
  referenceList: {
    gap: 6,
  },
  quoteBreakdown: {
    gap: 10,
  },
  quoteRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  quoteLabel: {
    color: colors.muted,
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    paddingRight: 12,
  },
  quoteValue: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '800',
  },
  quoteTotalRow: {
    alignItems: 'center',
    borderTopColor: colors.border,
    borderTopWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 12,
  },
  quoteTotalLabel: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '900',
  },
  quoteTotalValue: {
    color: colors.brandDark,
    fontSize: 17,
    fontWeight: '900',
  },
  quoteHint: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
  },
  quoteActions: {
    gap: 10,
    marginTop: 4,
  },
  referenceItem: {
    color: colors.muted,
    fontSize: 12,
  },
  errorCard: {
    backgroundColor: '#fff1f2',
    borderColor: '#fecdd3',
  },
  errorText: {
    color: '#be123c',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 19,
  },
  controls: {
    alignItems: 'center',
    backgroundColor: 'rgba(15,23,42,0.96)',
    bottom: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 20,
    left: 0,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 24,
    position: 'absolute',
    right: 0,
  },
  iconButton: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 999,
    height: 58,
    justifyContent: 'center',
    width: 58,
  },
  iconButtonInactive: {
    backgroundColor: '#e4e4e7',
  },
  endButton: {
    backgroundColor: '#ef4444',
  },
  endIcon: {
    transform: [{ rotate: '135deg' }],
  },
});
