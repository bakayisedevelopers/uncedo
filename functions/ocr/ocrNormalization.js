function normalizeText(rawText = '') {
  return String(rawText || '').replace(/\s+/g, ' ').trim();
}

function toNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function clamp01(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(1, numeric));
}

function evaluateExtractionQuality(text = '', confidence = 0) {
  const normalized = normalizeText(text);
  const textLength = normalized.length;
  const wordCount = normalized ? normalized.split(/\s+/).length : 0;

  if (!textLength) {
    return {
      extractionQuality: 'failed',
      isUsable: false,
      reason: 'empty_text',
      textLength,
      wordCount,
      confidence: clamp01(confidence),
    };
  }

  if (textLength < 20 || wordCount < 3) {
    return {
      extractionQuality: 'poor',
      isUsable: false,
      reason: 'text_too_short',
      textLength,
      wordCount,
      confidence: clamp01(confidence),
    };
  }

  if (clamp01(confidence) < 0.45) {
    return {
      extractionQuality: 'poor',
      isUsable: false,
      reason: 'low_confidence',
      textLength,
      wordCount,
      confidence: clamp01(confidence),
    };
  }

  return {
    extractionQuality: 'good',
    isUsable: true,
    reason: 'ok',
    textLength,
    wordCount,
    confidence: clamp01(confidence),
  };
}

function normalizeStructuredBlocks(payload = {}) {
  const pages = Array.isArray(payload.pages) ? payload.pages : [];
  const blocks = [];

  pages.forEach((page = {}, pageIndex) => {
    const pageNumber = Number(page?.pageNumber || pageIndex + 1);
    const visualRegions = Array.isArray(page?.visualRegions) ? page.visualRegions : [];

    visualRegions.forEach((region = {}, regionIndex) => {
      const text = normalizeText(region?.description || region?.text || '');
      if (!text) return;
      blocks.push({
        id: `p${pageNumber}_r${regionIndex + 1}`,
        pageNumber,
        type: String(region?.type || 'text').toLowerCase(),
        text,
        confidence: clamp01(region?.confidence || payload?.confidence || 0.5),
        bbox: {
          x: toNumber(region?.x),
          y: toNumber(region?.y),
          width: toNumber(region?.width),
          height: toNumber(region?.height),
        },
      });
    });
  });

  blocks.sort((a, b) => {
    if (a.pageNumber !== b.pageNumber) return a.pageNumber - b.pageNumber;
    if (a.bbox.y !== b.bbox.y) return a.bbox.y - b.bbox.y;
    return a.bbox.x - b.bbox.x;
  });

  const structuredText = blocks.map((block) => block.text).join('\n').trim();
  return {
    blocks,
    structuredText,
    blockCount: blocks.length,
  };
}

function normalizePaddleResult(payload = {}, context = {}) {
  const structured = normalizeStructuredBlocks(payload);
  const rawText = normalizeText(payload.extractedText || payload.text || '');
  const structuredText = normalizeText(structured.structuredText || '');
  // Prefer the richer text between OCR raw text and sparse structured-region text.
  const extractedText = rawText.length >= structuredText.length ? rawText : structuredText;
  const textLength = Number(payload.textLength || extractedText.length || 0);
  const pages = Array.isArray(payload.pages) ? payload.pages : [];
  const failedPageCount = pages.filter((page) => !page?.success).length;
  const scannedPdfDetected = Boolean(context.isPdfInput || pages.length > 1);
  const confidence = clamp01(payload.confidence);
  const quality = evaluateExtractionQuality(extractedText, confidence);

  return {
    success: Boolean(textLength > 0 && (payload.success !== false)),
    extractedText,
    text: normalizeText(payload.text || extractedText),
    textLength,
    extractionMethod: context.isPdfInput ? 'pdf_ocr' : 'ocr',
    provider: String(payload.provider || 'paddleocr_vl_1_5'),
    fileType: context.isPdfInput ? 'pdf' : 'image',
    extractionQuality: quality.extractionQuality,
    scannedPdfDetected,
    ocrStatus: context.isPdfInput
      ? (failedPageCount ? (textLength > 0 ? 'partial' : 'failed') : 'complete')
      : 'complete',
    pageCount: pages.length || (context.isPdfInput ? null : 1),
    selectedPages: pages.map((page) => Number(page?.pageNumber || 0)).filter((pageNumber) => Number.isFinite(pageNumber) && pageNumber > 0),
    pages,
    structuredData: {
      blockCount: structured.blockCount,
      blocks: structured.blocks,
      structuredTextPreview: structured.structuredText.slice(0, 4000),
      ppStructureVersion: String(payload.ppStructureVersionRuntime || payload.ppStructureVersion || ''),
      paddleOcrVlPipelineVersion: String(payload.paddleOcrVlPipelineVersion || payload.pipelineVersion || ''),
      ppStructureVersionRequested: String(payload.ppStructureVersionRequested || ''),
      structureConfig: payload.structureConfig || {},
    },
    failedPageCount,
    partialSuccess: Boolean(failedPageCount > 0 && textLength > 0),
    extractedImages: Array.isArray(payload.extractedImages) ? payload.extractedImages : [],
    source: context.isPdfInput ? 'pdf' : 'image',
    confidence,
    warnings: Array.isArray(payload.warnings) ? payload.warnings : [],
    elapsedMs: Number(payload.elapsedMs || 0),
    qualitySignal: quality,
  };
}

function normalizeGeminiFallbackResult(payload = {}, context = {}) {
  const extractedText = normalizeText(payload.extractedText || payload.text || '');
  const textLength = Number(payload.textLength || extractedText.length || 0);
  const pages = Array.isArray(payload.pages) ? payload.pages : [];
  const failedPageCount = pages.filter((page) => !page?.success).length;
  const structured = normalizeStructuredBlocks(payload);

  return {
    success: Boolean(textLength > 0),
    extractedText,
    text: extractedText,
    textLength,
    extractionMethod: context.isPdfInput ? 'pdf_gemini_fallback' : 'gemini_fallback',
    provider: 'gemini-2.5-flash-fallback',
    fileType: context.isPdfInput ? 'pdf' : 'image',
    extractionQuality: textLength > 0 ? (failedPageCount ? 'poor' : 'good') : 'failed',
    scannedPdfDetected: Boolean(context.isPdfInput),
    ocrStatus: context.isPdfInput
      ? (failedPageCount ? (textLength > 0 ? 'partial' : 'failed') : 'complete')
      : (textLength > 0 ? 'complete' : 'failed'),
    pageCount: pages.length || (context.isPdfInput ? null : 1),
    selectedPages: pages.map((page) => Number(page?.pageNumber || 0)).filter((pageNumber) => Number.isFinite(pageNumber) && pageNumber > 0),
    pages,
    structuredData: {
      blockCount: structured.blockCount,
      blocks: structured.blocks,
      structuredTextPreview: structured.structuredText.slice(0, 4000),
      geminiSubject: normalizeText(payload?.geminiSubject || ''),
      geminiTopic: normalizeText(payload?.geminiTopic || ''),
      geminiTopics: Array.isArray(payload?.geminiTopics) ? payload.geminiTopics.map((value) => normalizeText(value)).filter(Boolean).slice(0, 10) : [],
      geminiEstimatedMinutes: Number(payload?.geminiEstimatedMinutes || 0) || 0,
      geminiVisualRegionCount: Number(payload?.geminiVisualRegionCount || 0) || structured.blockCount || 0,
    },
    failedPageCount,
    partialSuccess: Boolean(failedPageCount > 0 && textLength > 0),
    extractedImages: Array.isArray(payload.extractedImages) ? payload.extractedImages : [],
    source: context.isPdfInput ? 'pdf' : 'image',
    confidence: Number(payload.confidence || 0),
    warnings: Array.isArray(payload.warnings) ? payload.warnings : [],
    elapsedMs: Number(payload.elapsedMs || 0),
    qualitySignal: evaluateExtractionQuality(extractedText, Number(payload.confidence || 0.5)),
  };
}

module.exports = {
  normalizeText,
  clamp01,
  normalizeStructuredBlocks,
  evaluateExtractionQuality,
  normalizePaddleResult,
  normalizeGeminiFallbackResult,
};
