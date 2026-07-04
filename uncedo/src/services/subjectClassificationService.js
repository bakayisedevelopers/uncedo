import { getFirebaseClients, getFunctionEndpoint } from '../firebase/config';

const CLASSIFY_SUBJECT_ENDPOINT = getFunctionEndpoint('classifySubject');
const MAX_CLASSIFICATION_INPUT_CHARS = 6000;
const CLASSIFICATION_TIMEOUT_MS = 12000;

function buildFallbackClassification() {
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
    const value = normalizeText(subject?.value || subject);
    const label = normalizeText(subject?.label || subject);
    if (!value) return acc;
    acc.set(value.toLowerCase(), value);
    if (label) acc.set(label.toLowerCase(), value);
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
    const label = normalizeText(subject?.label || subject);
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

function estimateMinutesFromPayload({ structuredPayload = {} } = {}) {
  const questionCount = Array.isArray(structuredPayload?.questionBlocks) ? structuredPayload.questionBlocks.length : 0;
  const attachmentCount = Number(structuredPayload?.totalAttachmentCount || 0);
  const textLength = Number(structuredPayload?.combinedTextPreview?.length || 0);

  const roughEstimate = 10
    + (questionCount * 4)
    + (attachmentCount * 6)
    + Math.round(textLength / 1200);

  return clampEstimatedMinutes(roughEstimate || 10);
}

function buildQuestionBlocksForClassification({ typedText = '', attachmentExtractions = [] } = {}) {
  const blocks = [];
  const normalizedTypedText = normalizeText(typedText);
  if (normalizedTypedText) {
    blocks.push({
      label: 'Typed request',
      text: truncateText(normalizedTypedText, 1200),
      textLength: normalizedTypedText.length,
    });
  }

  attachmentExtractions.forEach((entry, index) => {
    const extractedText = normalizeText(entry?.extractedText || entry?.text);
    if (!extractedText) return;
    blocks.push({
      label: entry?.fileName || `Attachment ${index + 1}`,
      text: truncateText(extractedText, 1200),
      textLength: extractedText.length,
    });
  });

  return blocks.slice(0, 6);
}

function fetchWithTimeout(url, options = {}, timeoutMs = CLASSIFICATION_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, {
    ...options,
    signal: controller.signal,
  }).finally(() => clearTimeout(timeoutId));
}

export function buildSubjectClassificationInput({ typedText = '', attachmentExtractions = [], supportedSubjects = [] } = {}) {
  const normalizedTypedText = normalizeText(typedText);
  const usableAttachmentTexts = attachmentExtractions
    .map((entry) => normalizeText(entry?.extractedText || entry?.text))
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
      `Question blocks:\n${questionBlocks.map((block) => `${block.label}:\n${block.text}`).join('\n\n---\n\n')}`,
    );
  }
  if (usableAttachmentTexts.length) {
    combinedSections.push(`Extracted attachment text:\n${usableAttachmentTexts.map((text) => truncateText(text, 1500)).join('\n\n---\n\n')}`);
  }

  const combinedText = truncateText(combinedSections.join('\n\n') || normalizedTypedText);
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
      fileName: normalizeText(entry?.fileName),
      fileType: normalizeText(entry?.fileType),
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
    return buildFallbackClassification();
  }

  const clients = getFirebaseClients();
  const idToken = await clients?.auth?.currentUser?.getIdToken?.();
  if (!idToken) {
    throw new Error('You must be signed in before classifying a request.');
  }

  try {
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
    if (!response.ok || payload?.success !== true || !payload?.classification) {
      throw new Error(payload?.message || 'Subject classification failed.');
    }

    const parsed = payload.classification;
    const fallbackClassification = buildFallbackClassification();
    const supportedSubject = normalizeSubjectToSupported(parsed?.subject, supportedSubjects) || fallbackClassification.subject;
    const confidence = ['high', 'low', 'unknown'].includes(parsed?.subjectConfidence)
      ? parsed.subjectConfidence
      : 'unknown';
    const topic = normalizeText(parsed?.topic);
    const estimatedMinutes = clampEstimatedMinutes(parsed?.estimatedMinutes);
    const needsManualSubjectSelection = Boolean(parsed?.needsManualSubjectSelection) || !supportedSubject;

    return {
      subject: supportedSubject,
      unsupportedSubject: normalizeText(parsed?.unsupportedSubject),
      topic,
      estimatedMinutes: estimatedMinutes || estimateMinutesFromPayload({ structuredPayload: inputPayload || {} }),
      subjectConfidence: confidence,
      needsManualSubjectSelection,
      unsupportedSubjectRequested: Boolean(parsed?.unsupportedSubjectRequested || parsed?.unsupportedSubject),
      unsupportedSubjectRecorded: Boolean(payload?.unsupportedSubjectRecorded),
      academicBrainOutput: parsed?.academicBrainOutput || null,
      isFallback: false,
    };
  } catch (error) {
    return buildFallbackClassification();
  }
}
