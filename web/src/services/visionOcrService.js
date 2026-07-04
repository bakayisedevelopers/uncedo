import { getFirebaseClients } from '../firebase/config';

const IMAGE_OCR_ENDPOINT = import.meta.env.VITE_IMAGE_OCR_ENDPOINT || '/image-ocr';

function toBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const [, base64 = ''] = result.split(',', 2);
      resolve(base64);
    };
    reader.onerror = () => reject(new Error('Unable to read image for OCR.'));
    reader.readAsDataURL(file);
  });
}

export async function extractImageTextWithVision(file) {
  const clients = await getFirebaseClients();
  const idToken = await clients?.auth?.currentUser?.getIdToken?.();

  if (!idToken) {
    throw new Error('You must be signed in before extracting image text.');
  }

  const imageBase64 = await toBase64(file);

  console.debug('[attachmentExtraction][ocr] google-vision OCR invocation', {
    fileName: file?.name,
    mimeType: file?.type,
    source: 'image-base64',
  });

  const requestBody = {
    imageBase64,
    mimeType: file?.type || 'application/octet-stream',
    fileName: file?.name || 'unknown-image',
  };

  let response = null;
  let payload = {};
  let lastError = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      response = await fetch(IMAGE_OCR_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify(requestBody),
      });
      payload = await response.json().catch(() => ({}));
      const isRetriableHttp = !response.ok && response.status >= 500;
      if (!isRetriableHttp) break;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 350));
  }

  if (!response || !response.ok || !payload) {
    console.error('[attachmentExtraction][ocr] image-ocr backend returned failure', {
      endpoint: IMAGE_OCR_ENDPOINT,
      httpStatus: response?.status || null,
      ok: Boolean(response?.ok),
      payload,
      fileName: file?.name || '',
      mimeType: file?.type || '',
    });
    const fallbackMessage = lastError?.message || 'Unable to extract text from image right now.';
    throw new Error(payload?.message || fallbackMessage);
  }

  if (payload.success !== true) {
    console.warn('[attachmentExtraction][ocr] image-ocr returned success:false', {
      endpoint: IMAGE_OCR_ENDPOINT,
      httpStatus: response.status,
      payload,
      fileName: file?.name || '',
      mimeType: file?.type || '',
    });
  }

  return {
    success: Boolean(payload.success),
    extractedText: String(payload.extractedText || ''),
    text: String(payload.text || payload.extractedText || ''),
    textLength: Number(payload.textLength || 0),
    extractionMethod: String(payload.extractionMethod || (String(file?.type || '').toLowerCase() === 'application/pdf' ? 'pdf_ocr' : 'ocr')),
    extractionQuality: String(payload.extractionQuality || (payload.success ? 'good' : 'failed')),
    partialSuccess: Boolean(payload.partialSuccess),
    scannedPdfDetected: Boolean(payload.scannedPdfDetected),
    ocrStatus: String(payload.ocrStatus || ''),
    pageCount: Number(payload.pageCount || 0) || null,
    selectedPages: Array.isArray(payload.selectedPages) ? payload.selectedPages : [],
    pages: Array.isArray(payload.pages) ? payload.pages : [],
    extractedImages: Array.isArray(payload.extractedImages) ? payload.extractedImages : [],
    failedPageCount: Number(payload.failedPageCount || 0),
    provider: String(payload.provider || 'google-vision'),
    providerRoute: String(payload.providerRoute || ''),
    providerReason: String(payload.providerReason || ''),
    confidence: Number(payload.confidence || 0),
    structuredData: payload?.structuredData && typeof payload.structuredData === 'object' ? payload.structuredData : null,
    ppStructureVersion: String(payload?.ppStructureVersion || payload?.structuredData?.ppStructureVersion || ''),
    processingTrace: Array.isArray(payload?.processingTrace) ? payload.processingTrace : [],
    geminiSubject: String(payload?.structuredData?.geminiSubject || ''),
    geminiTopic: String(payload?.structuredData?.geminiTopic || ''),
    geminiTopics: Array.isArray(payload?.structuredData?.geminiTopics) ? payload.structuredData.geminiTopics : [],
    geminiEstimatedMinutes: Number(payload?.structuredData?.geminiEstimatedMinutes || 0) || 0,
    geminiVisualRegionCount: Number(payload?.structuredData?.geminiVisualRegionCount || 0) || 0,
    errorMessage: String(payload?.message || ''),
    pricing: payload?.pricing && typeof payload.pricing === 'object' ? payload.pricing : null,
    cloudVisionPriceUsd: Number(payload?.cloudVisionPriceUsd || 0) || 0,
    cloudVisionPriceZar: Number(payload?.cloudVisionPriceZar || 0) || 0,
    fxRateZarPerUsd: Number(payload?.fxRateZarPerUsd || 0) || 0,
  };
}
