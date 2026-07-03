function getAttachmentFileType(attachment) {
  const mimeType = String(attachment?.type || '').toLowerCase();
  if (mimeType === 'application/pdf') return 'pdf';
  if (mimeType.startsWith('image/')) return 'image';
  return 'image';
}

function getBase64Payload(dataUrl = '') {
  const [, base64 = ''] = String(dataUrl || '').split(',', 2);
  return base64;
}

function buildExtractionResult(attachment, payload = {}, overrides = {}) {
  const extractedText = String(payload?.extractedText || '').trim();
  const textLength = Number(payload?.textLength || extractedText.length || 0);
  const fileType = overrides.fileType || payload?.fileType || getAttachmentFileType(attachment);
  return {
    fileName: attachment?.name || payload?.fileName || 'attachment',
    source: payload?.source || fileType,
    fileType,
    extractionMethod: payload?.extractionMethod || overrides.extractionMethod || 'ocr',
    success: Boolean(payload?.success && textLength > 0),
    partialSuccess: Boolean(payload?.partialSuccess),
    extractedText,
    text: String(payload?.text || extractedText),
    textLength,
    extractionQuality: payload?.extractionQuality || (textLength > 0 ? 'good' : 'failed'),
    scannedPdfDetected: Boolean(payload?.scannedPdfDetected),
    requiresPageSelection: false,
    selectedPages: Array.isArray(payload?.selectedPages) ? payload.selectedPages : [],
    ocrStatus: payload?.ocrStatus || (fileType === 'pdf' ? (textLength > 0 ? 'complete' : 'failed') : 'not_needed'),
    pageCount: Number(payload?.pageCount || 0) || null,
    pages: Array.isArray(payload?.pages) ? payload.pages : [],
    extractedImages: Array.isArray(payload?.extractedImages) ? payload.extractedImages : [],
    structuredData: payload?.structuredData && typeof payload.structuredData === 'object' ? payload.structuredData : null,
    failedPageCount: Number(payload?.failedPageCount || 0),
    provider: String(payload?.provider || ''),
    providerRoute: String(payload?.providerRoute || ''),
    providerReason: String(payload?.providerReason || ''),
    confidence: Number(payload?.confidence || 0),
    ppStructureVersion: String(payload?.ppStructureVersion || payload?.structuredData?.ppStructureVersion || ''),
    pricing: payload?.pricing && typeof payload.pricing === 'object' ? payload.pricing : null,
    cloudVisionPriceUsd: Number(payload?.cloudVisionPriceUsd || 0) || 0,
    cloudVisionPriceZar: Number(payload?.cloudVisionPriceZar || 0) || 0,
    fxRateZarPerUsd: Number(payload?.fxRateZarPerUsd || 0) || 0,
  };
}

export async function extractSingleAttachment(attachment) {
  return buildExtractionResult(attachment, {
    success: false,
    partialSuccess: false,
    extractedText: '',
    text: '',
    textLength: 0,
  }, {
    fileType: getAttachmentFileType(attachment),
    extractionMethod: 'client_placeholder',
  });
}

export async function extractAttachments(attachments = [], onProgress) {
  const results = [];

  for (let index = 0; index < attachments.length; index += 1) {
    const attachment = attachments[index];
    let result;

    try {
      result = await extractSingleAttachment(attachment);
    } catch (error) {
      result = buildExtractionResult(attachment, {}, {
        fileType: getAttachmentFileType(attachment),
        extractionMethod: 'fallback',
      });
    }

    results.push(result);
    if (typeof onProgress === 'function') {
      onProgress(result, index, attachments.length);
    }
  }

  return results;
}
