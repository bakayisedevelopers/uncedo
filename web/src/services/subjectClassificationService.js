import { getFirebaseClients } from '../firebase/config';
import { appendUserAiLog } from './aiLogService';
import { cleanExtractedText, parseQuestionsFromExtraction } from './questionParsingService';

const CLASSIFY_SUBJECT_ENDPOINT = import.meta.env.VITE_CLASSIFY_SUBJECT_ENDPOINT
  || 'https://us-central1-parakleo.cloudfunctions.net/classifySubject';
const MAX_CLASSIFICATION_INPUT_CHARS = 6000;
const CLASSIFICATION_TIMEOUT_MS = 12000;

function buildFallbackClassification(supportedSubjects = []) {
  return {
    subject: '',
    unsupportedSubject: '',
    topic: '',
    estimatedMinutes: 10,
    subjectConfidence: 'unknown',
    needsManualSubjectSelection: true,
    unsupportedSubjectRequested: false,
    unsupportedSubjectRecorded: false,
    isFallback: true,
  };
}

function clampEstimatedMinutes(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return 10;
  return Math.min(90, Math.max(10, Math.round(numeric)));
}

function normalizeText(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function truncateText(value = '', maxChars = MAX_CLASSIFICATION_INPUT_CHARS) {
  if (value.length <= maxChars) return value;
  return `${value.slice(0, maxChars)}...`;
}

function getSupportedSubjectMap(supportedSubjects = []) {
  return supportedSubjects.reduce((acc, subject) => {
    const value = normalizeText(subject?.value);
    const label = normalizeText(subject?.label);
    if (!value) return acc;
    acc.set(value.toLowerCase(), value);
    if (label) {
      acc.set(label.toLowerCase(), value);
    }
    return acc;
  }, new Map());
}

function normalizeSubjectToSupported(rawSubject, supportedSubjects = []) {
  const normalized = normalizeText(rawSubject).toLowerCase();
  if (!normalized) return '';
  const supportedMap = getSupportedSubjectMap(supportedSubjects);
  return supportedMap.get(normalized) || '';
}

function buildSupportedSubjectHints({ text = '', supportedSubjects = [] } = {}) {
  const normalizedText = normalizeText(text).toLowerCase();
  if (!normalizedText || !Array.isArray(supportedSubjects) || !supportedSubjects.length) {
    return [];
  }

  const hints = [];
  supportedSubjects.forEach((subject) => {
    const value = normalizeText(subject?.value || subject);
    const label = normalizeText(subject?.label);
    const normalizedValue = value.toLowerCase();
    const normalizedLabel = label.toLowerCase();

    if (
      (normalizedValue && normalizedText.includes(normalizedValue))
      || (normalizedLabel && normalizedText.includes(normalizedLabel))
    ) {
      hints.push(value);
    }
  });

  return [...new Set(hints)].slice(0, 10);
}

function buildQuestionBlocksForClassification({ typedText = '', attachmentExtractions = [] } = {}) {
  const blocks = parseQuestionsFromExtraction({
    extractedText: typedText,
    attachmentExtractions,
  });

  return blocks
    .map((block, index) => {
      const label = block.questionNumber ? `Question ${block.questionNumber}` : `Question ${index + 1}`;
      const cleanedBlockText = cleanExtractedText(block.text).cleanedText;
      return {
        label,
        text: truncateText(cleanedBlockText, 1000),
        textLength: cleanedBlockText.length,
      };
    })
    .filter((block) => block.text.trim());
}

function fetchWithTimeout(url, options = {}, timeoutMs = CLASSIFICATION_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

  return fetch(url, {
    ...options,
    signal: controller.signal,
  }).finally(() => window.clearTimeout(timeoutId));
}

export function buildSubjectClassificationInput({ typedText = '', attachmentExtractions = [], supportedSubjects = [] } = {}) {
  const normalizedTypedText = cleanExtractedText(typedText).cleanedText;
  const usableAttachmentTexts = attachmentExtractions
    .map((entry) => normalizeText(entry?.extractedText))
    .filter(Boolean);
  const sourceLabels = [];
  if (normalizedTypedText) sourceLabels.push('typed_text');
  if (usableAttachmentTexts.length) sourceLabels.push('attachment_extracted_text');

  const questionBlocks = buildQuestionBlocksForClassification({
    typedText: normalizedTypedText,
    attachmentExtractions,
  });

  const combinedSections = [];
  if (normalizedTypedText) {
    combinedSections.push(`Typed request text:\n${truncateText(normalizedTypedText, 1800)}`);
  }
  if (questionBlocks.length) {
    combinedSections.push(
      `Question blocks:\n${questionBlocks
        .map((block) => `${block.label}:\n${block.text}`)
        .join('\n\n---\n\n')}`,
    );
  }
  if (usableAttachmentTexts.length) {
    combinedSections.push(`Extracted attachment text:\n${usableAttachmentTexts.map((text) => truncateText(text, 1500)).join('\n\n---\n\n')}`);
  }

  const combinedText = truncateText(
    combinedSections.join('\n\n') || normalizedTypedText,
  );

  const subjectHints = buildSupportedSubjectHints({
    text: [normalizedTypedText, ...usableAttachmentTexts].join(' '),
    supportedSubjects,
  });

  const attachmentSummaries = attachmentExtractions.slice(0, 6).map((entry, index) => {
    const extractedText = normalizeText(entry?.extractedText || entry?.text);
    const structuredBlocks = Array.isArray(entry?.structuredData?.blocks) ? entry.structuredData.blocks : [];
    const structuredTypes = [...new Set(structuredBlocks.map((block) => normalizeText(block?.type)).filter(Boolean))];
    return {
      index,
      fileName: normalizeText(entry?.fileName || entry?.uploadedAttachment?.fileName || entry?.uploadedAttachment?.name),
      fileType: normalizeText(entry?.fileType || entry?.uploadedAttachment?.fileType || entry?.source),
      extractionMethod: normalizeText(entry?.extractionMethod),
      extractionQuality: normalizeText(entry?.extractionQuality),
      scannedPdfDetected: Boolean(entry?.scannedPdfDetected),
      ocrStatus: normalizeText(entry?.ocrStatus),
      success: Boolean(entry?.success),
      partialSuccess: Boolean(entry?.partialSuccess),
      textPreview: truncateText(extractedText, 600),
      textLength: extractedText.length,
      selectedPages: Array.isArray(entry?.selectedPages) ? entry.selectedPages.slice(0, 10) : [],
      failedPageCount: Number(entry?.failedPageCount || 0),
      provider: normalizeText(entry?.provider),
      providerRoute: normalizeText(entry?.providerRoute),
      providerReason: normalizeText(entry?.providerReason),
      ppStructureVersion: normalizeText(entry?.ppStructureVersion),
      geminiSubject: normalizeText(entry?.geminiSubject || entry?.structuredData?.geminiSubject),
      geminiTopic: normalizeText(entry?.geminiTopic || entry?.structuredData?.geminiTopic),
      geminiTopics: Array.isArray(entry?.geminiTopics || entry?.structuredData?.geminiTopics)
        ? (entry.geminiTopics || entry.structuredData.geminiTopics).map((value) => normalizeText(value)).filter(Boolean).slice(0, 10)
        : [],
      geminiEstimatedMinutes: Number(entry?.geminiEstimatedMinutes || entry?.structuredData?.geminiEstimatedMinutes || 0) || 0,
      geminiVisualRegionCount: Number(entry?.geminiVisualRegionCount || entry?.structuredData?.geminiVisualRegionCount || 0) || 0,
      structuredBlockCount: structuredBlocks.length,
      structuredTypes,
      structuredPreview: truncateText(normalizeText(entry?.structuredData?.structuredTextPreview), 800),
    };
  });

  return {
    combinedText,
    sourceLabels,
    hasUsableText: Boolean(combinedText),
    structuredPayload: {
      version: 1,
      sourceLabels,
      hasTypedText: Boolean(normalizedTypedText),
      typedTextPreview: truncateText(normalizedTypedText, 2000),
      typedTextLength: normalizedTypedText.length,
      questionBlocks,
      attachmentSummaries,
      subjectHints,
      totalAttachmentCount: attachmentExtractions.length,
      combinedTextPreview: truncateText(combinedText, 2500),
    },
  };
}

export async function classifySubjectFromText({ inputText = '', inputPayload = null, supportedSubjects = [] } = {}) {
  const normalizedInput = normalizeText(inputText || inputPayload?.combinedText || inputPayload?.typedTextPreview || '');
  if (!normalizedInput) {
    console.debug('[studentRequestAI] frontend fallback before request', {
      reason: 'empty_input',
      supportedSubjectCount: supportedSubjects.length,
    });
    return buildFallbackClassification(supportedSubjects);
  }

  try {
    const startedAt = Date.now();
    const clients = await getFirebaseClients();
    const idToken = await clients?.auth?.currentUser?.getIdToken?.();

    if (!idToken) {
      throw new Error('You must be signed in before classifying a request.');
    }

    console.debug('[studentRequestAI] frontend classification request starting', {
      endpoint: CLASSIFY_SUBJECT_ENDPOINT,
      inputLength: normalizedInput.length,
      supportedSubjectCount: supportedSubjects.length,
      timeoutMs: CLASSIFICATION_TIMEOUT_MS,
      inputText: normalizedInput,
      inputPayload,
      supportedSubjects,
    });
    appendUserAiLog(clients?.auth?.currentUser?.uid, {
      source: 'student_subject_classification',
      step: 'classification_request_started',
      status: 'info',
      message: 'Frontend classification request started.',
      details: {
        endpoint: CLASSIFY_SUBJECT_ENDPOINT,
        inputLength: normalizedInput.length,
        supportedSubjectCount: supportedSubjects.length,
        inputText: normalizedInput,
        inputPayload,
      },
    }).catch(() => null);

    const response = await fetchWithTimeout(CLASSIFY_SUBJECT_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({
        inputText: normalizedInput,
        inputPayload,
        supportedSubjects,
      }),
    });

    const payload = await response.json().catch(() => ({}));
    console.debug('[studentRequestAI] frontend classification response received', {
      endpoint: CLASSIFY_SUBJECT_ENDPOINT,
      ok: response.ok,
      status: response.status,
      payload,
    });

    if (payload?.aiPrompt || payload?.aiRawOutput || payload?.aiError) {
      console.log('=== STUDENT SUBJECT CLASSIFICATION AI PROMPT ===');
      console.log(payload.aiPrompt);
      console.log('=== STUDENT SUBJECT CLASSIFICATION AI OUTPUT ===');
      console.log(payload.aiRawOutput);
      if (payload.aiError) {
        console.log('=== STUDENT SUBJECT CLASSIFICATION AI ERROR ===');
        console.log(payload.aiError);
      }
    }
    appendUserAiLog(clients?.auth?.currentUser?.uid, {
      source: 'student_subject_classification',
      step: 'classification_response_received',
      status: response.ok && payload?.success === true ? 'success' : 'failed',
      message: 'Frontend classification response received.',
      prompt: payload?.aiPrompt || '',
      rawOutput: payload?.aiRawOutput || '',
      error: payload?.aiError || '',
      details: {
        endpoint: CLASSIFY_SUBJECT_ENDPOINT,
        status: response.status,
        payload,
      },
    }).catch(() => null);

    if (!response.ok || payload?.success !== true || !payload?.classification) {
      throw new Error(payload?.message || 'Subject classification failed.');
    }

    console.debug('[studentRequestAI] frontend classification completed', {
      durationMs: Date.now() - startedAt,
      provider: payload.provider,
      classification: payload.classification,
    });

    const parsed = payload.classification;
    const fallbackClassification = buildFallbackClassification(supportedSubjects);
    const supportedSubject = normalizeSubjectToSupported(parsed?.subject, supportedSubjects) || fallbackClassification.subject;
    const confidence = ['high', 'low', 'unknown'].includes(parsed?.subjectConfidence)
      ? parsed.subjectConfidence
      : 'unknown';
    const topic = normalizeText(parsed?.topic);
    const estimatedMinutes = clampEstimatedMinutes(parsed?.estimatedMinutes);

    const needsManualSubjectSelection = Boolean(parsed?.needsManualSubjectSelection)
      || !supportedSubject
      || (!fallbackClassification.subject && confidence === 'unknown');

    return {
      subject: supportedSubject,
      unsupportedSubject: normalizeText(parsed?.unsupportedSubject),
      topic,
      estimatedMinutes,
      subjectConfidence: confidence,
      needsManualSubjectSelection,
      unsupportedSubjectRequested: Boolean(parsed?.unsupportedSubjectRequested || parsed?.unsupportedSubject),
      unsupportedSubjectRecorded: Boolean(payload?.unsupportedSubjectRecorded),
      academicBrainOutput: parsed?.academicBrainOutput || null,
      isFallback: false,
    };
  } catch (error) {
    console.debug('[studentRequestAI] frontend classification failed, using fallback', { error: error?.message });
    const clients = await getFirebaseClients().catch(() => null);
    appendUserAiLog(clients?.auth?.currentUser?.uid, {
      source: 'student_subject_classification',
      step: 'classification_failed',
      status: 'failed',
      message: 'Frontend classification failed.',
      error: error?.message || '',
    }).catch(() => null);
    return buildFallbackClassification(supportedSubjects);
  }
}
