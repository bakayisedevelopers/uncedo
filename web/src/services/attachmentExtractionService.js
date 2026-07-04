import { extractImageTextWithVision } from './visionOcrService';

const MIN_TEXT_LENGTH = 30;
const MIN_READABLE_WORDS = 4;
const READABLE_WORD_PATTERN = /[A-Za-z]{2,}/g;
const GARBAGE_CHAR_PATTERN = /[^\w\s.,;:!?()\[\]{}'"\-/%]/g;
const MIN_SHORT_TEXT_LENGTH = 12;
const MIN_SHORT_READABLE_WORDS = 2;
const MAX_GARBAGE_RATIO = 0.35;
const MAX_SHORT_TEXT_GARBAGE_RATIO = 0.2;

const SUPPORTED_IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.bmp', '.gif', '.tif', '.tiff'];
const PDFJS_CDN_URL = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs';
const PDFJS_WORKER_CDN_URL = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs';
let cachedPdfJs = null;

function getFileExtension(fileName = '') {
  const normalizedName = String(fileName || '').toLowerCase();
  const extensionIndex = normalizedName.lastIndexOf('.');
  return extensionIndex >= 0 ? normalizedName.slice(extensionIndex) : '';
}

async function loadPdfJs() {
  if (cachedPdfJs) return cachedPdfJs;
  cachedPdfJs = await import(/* @vite-ignore */ PDFJS_CDN_URL);
  cachedPdfJs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_CDN_URL;
  return cachedPdfJs;
}

function normalizeOcrText(rawText) {
  return String(rawText || '').replace(/\s+/g, ' ').trim();
}

function buildOcrResult(rawText) {
  const extractedText = normalizeOcrText(rawText);
  const textLength = extractedText.length;

  return {
    success: textLength > 0,
    extractedText,
    textLength,
    extractionMethod: 'ocr',
  };
}

export function detectAttachmentType(file) {
  const mimeType = String(file?.type || '').toLowerCase();
  const extension = getFileExtension(file?.name || '');

  if (mimeType === 'application/pdf' || extension === '.pdf') {
    return 'pdf';
  }

  if (mimeType.startsWith('image/') || SUPPORTED_IMAGE_EXTENSIONS.includes(extension)) {
    return 'image';
  }

  return null;
}

function emitStatus(onStatus, payload = {}) {
  if (typeof onStatus !== 'function') return;
  try {
    onStatus({
      phase: String(payload.phase || ''),
      label: String(payload.label || ''),
      fileName: String(payload.fileName || ''),
      fileType: String(payload.fileType || ''),
      level: String(payload.level || 'info'),
      details: payload.details || null,
      ts: Date.now(),
    });
  } catch (error) {
    console.debug('[attachmentExtraction] status callback failed', { error: error?.message });
  }
}

function waitMs(durationMs = 0) {
  return new Promise((resolve) => window.setTimeout(resolve, Math.max(0, Number(durationMs) || 0)));
}

function mapProviderReasonToStatus(reason = '') {
  const normalized = String(reason || '').toLowerCase();
  if (!normalized) return 'Provider route completed';
  if (normalized === 'vision_only') return 'Simple OCR route succeeded';
  if (normalized === 'legacy_vision') return 'Legacy OCR route engaged';
  return `Provider route: ${normalized.replace(/_/g, ' ')}`;
}

export function evaluateExtractionQuality(rawText) {
  const extractedText = String(rawText || '').replace(/\s+/g, ' ').trim();
  const textLength = extractedText.length;

  if (!textLength) {
    return {
      extractedText,
      textLength,
      extractionQuality: 'failed',
      isUsable: false,
    };
  }

  const readableWords = extractedText.match(READABLE_WORD_PATTERN) || [];
  const garbageChars = extractedText.match(GARBAGE_CHAR_PATTERN) || [];
  const garbageRatio = textLength ? garbageChars.length / textLength : 1;

  const passesLongFormQuality = textLength >= MIN_TEXT_LENGTH
    && readableWords.length >= MIN_READABLE_WORDS
    && garbageRatio <= MAX_GARBAGE_RATIO;

  const passesShortFormQuality = textLength >= MIN_SHORT_TEXT_LENGTH
    && readableWords.length >= MIN_SHORT_READABLE_WORDS
    && garbageRatio <= MAX_SHORT_TEXT_GARBAGE_RATIO;

  const passesQuality = passesLongFormQuality || passesShortFormQuality;

  return {
    extractedText,
    textLength,
    extractionQuality: passesQuality ? 'good' : 'poor',
    isUsable: passesQuality,
  };
}

async function extractFromImage(file, onStatus) {
  const fileType = detectAttachmentType(file) || '';
  emitStatus(onStatus, {
    phase: 'firebase_upload_payload',
    label: 'Picture going to Firebase function',
    fileName: file?.name || '',
    fileType,
  });

  emitStatus(onStatus, {
    phase: 'simple_ocr_start',
    label: 'Simple OCR started',
    fileName: file?.name || '',
    fileType,
  });

  try {
    const startedAt = Date.now();
    const result = await extractImageTextWithVision(file);
    const route = String(result?.providerRoute || '');
    const reason = String(result?.providerReason || '');
    const elapsedMs = Date.now() - startedAt;

    const trace = Array.isArray(result?.processingTrace) ? result.processingTrace : [];
    for (let index = 0; index < trace.length; index += 1) {
      const entry = trace[index] || {};
      emitStatus(onStatus, {
        phase: String(entry.phase || ''),
        label: String(entry.label || ''),
        fileName: file?.name || '',
        fileType,
        details: entry.details || null,
      });
      await waitMs(index === 0 ? 80 : 180);
    }

    emitStatus(onStatus, {
      phase: 'simple_ocr_processing',
      label: 'Simple OCR processing',
      fileName: file?.name || '',
      fileType,
      details: { route, reason, elapsedMs },
    });
    emitStatus(onStatus, {
      phase: 'simple_ocr_done',
      label: 'Simple OCR done',
      fileName: file?.name || '',
      fileType,
    });
    emitStatus(onStatus, {
      phase: 'provider_reason',
      label: mapProviderReasonToStatus(reason),
      fileName: file?.name || '',
      fileType,
    });

    return result;
  } catch (error) {
    console.debug('[attachmentExtraction][ocr] image OCR extraction via google-vision failed', {
      fileName: file?.name,
      error: error?.message,
    });
    emitStatus(onStatus, {
      phase: 'ocr_failed',
      label: 'OCR failed',
      fileName: file?.name || '',
      fileType,
      level: 'error',
      details: { message: error?.message || 'Unknown OCR failure' },
    });
    return buildOcrResult('');
  }
}

export function isUsablePageText(rawText) {
  return evaluateExtractionQuality(rawText);
}

async function renderPdfPageToCanvas(page, scale = 1.75) {
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Unable to create PDF page render context');
  }
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  await page.render({ canvasContext: context, viewport }).promise;
  return canvas;
}

async function canvasToBlob(canvas, mimeType = 'image/png', quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
        return;
      }
      reject(new Error('Canvas conversion to Blob failed'));
    }, mimeType, quality);
  });
}

async function canvasToDataUrl(canvas, mimeType = 'image/png', quality = 0.92) {
  const blob = await canvasToBlob(canvas, mimeType, quality);
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Unable to serialize image as data URL.'));
    reader.readAsDataURL(blob);
  });
}

async function buildVisionOcrFileFromCanvas(canvas, fileName = 'pdf-page.png') {
  const blob = await canvasToBlob(canvas, 'image/png');
  return new File([blob], fileName, { type: 'image/png' });
}

function getReadablePdfPageText(textContent) {
  return (textContent?.items || [])
    .map((item) => ('str' in item ? item.str : ''))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getObjectFromPdfStore(store, objectId) {
  if (!store || !objectId) return Promise.resolve(null);

  return new Promise((resolve) => {
    let resolved = false;
    const timeoutId = window.setTimeout(() => {
      finish(null);
    }, 750);

    const finish = (value) => {
      if (resolved) return;
      resolved = true;
      window.clearTimeout(timeoutId);
      resolve(value || null);
    };

    try {
      const value = store.get(objectId, (data) => finish(data));
      if (typeof value !== 'undefined') {
        finish(value);
      }
    } catch (error) {
      finish(null);
    }
  });
}

function createCanvasFromRawImageData(imageDataLike) {
  if (!imageDataLike?.width || !imageDataLike?.height || !imageDataLike?.data) return null;

  const width = Number(imageDataLike.width || 0);
  const height = Number(imageDataLike.height || 0);
  const source = imageDataLike.data;
  const pixelCount = width * height;
  const channelCount = pixelCount ? Math.floor(source.length / pixelCount) : 0;

  if (!width || !height || !pixelCount || !channelCount) return null;

  const rgba = new Uint8ClampedArray(pixelCount * 4);

  for (let index = 0; index < pixelCount; index += 1) {
    const sourceOffset = index * channelCount;
    const targetOffset = index * 4;

    if (channelCount >= 4) {
      rgba[targetOffset] = source[sourceOffset];
      rgba[targetOffset + 1] = source[sourceOffset + 1];
      rgba[targetOffset + 2] = source[sourceOffset + 2];
      rgba[targetOffset + 3] = source[sourceOffset + 3];
      continue;
    }

    if (channelCount === 3) {
      rgba[targetOffset] = source[sourceOffset];
      rgba[targetOffset + 1] = source[sourceOffset + 1];
      rgba[targetOffset + 2] = source[sourceOffset + 2];
      rgba[targetOffset + 3] = 255;
      continue;
    }

    rgba[targetOffset] = source[sourceOffset];
    rgba[targetOffset + 1] = source[sourceOffset];
    rgba[targetOffset + 2] = source[sourceOffset];
    rgba[targetOffset + 3] = 255;
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) return null;
  context.putImageData(new ImageData(rgba, width, height), 0, 0);
  return canvas;
}

async function normalizePdfImageAsset(imageLike, { pageNumber, index }) {
  if (!imageLike) return null;

  let canvas = null;
  let width = 0;
  let height = 0;

  if (typeof HTMLCanvasElement !== 'undefined' && imageLike instanceof HTMLCanvasElement) {
    canvas = imageLike;
    width = canvas.width;
    height = canvas.height;
  } else if (typeof ImageBitmap !== 'undefined' && imageLike instanceof ImageBitmap) {
    width = imageLike.width;
    height = imageLike.height;
    canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) return null;
    context.drawImage(imageLike, 0, 0);
  } else if (typeof HTMLImageElement !== 'undefined' && imageLike instanceof HTMLImageElement) {
    width = imageLike.naturalWidth || imageLike.width;
    height = imageLike.naturalHeight || imageLike.height;
    canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) return null;
    context.drawImage(imageLike, 0, 0, width, height);
  } else if (imageLike?.bitmap) {
    return normalizePdfImageAsset(imageLike.bitmap, { pageNumber, index });
  } else if (imageLike?.data && imageLike?.width && imageLike?.height) {
    canvas = createCanvasFromRawImageData(imageLike);
    width = Number(imageLike.width || 0);
    height = Number(imageLike.height || 0);
  }

  if (!canvas || !width || !height) return null;

  return {
    id: `pdf-page-${pageNumber}-image-${index + 1}`,
    url: await canvasToDataUrl(canvas),
    mimeType: 'image/png',
    width,
    height,
  };
}

async function extractPdfPageImages({ page, pageNumber, pdfjs }) {
  try {
    const operatorList = await page.getOperatorList();
    const imageOps = [];
    const imageFnCodes = new Set([
      pdfjs.OPS.paintImageXObject,
      pdfjs.OPS.paintInlineImageXObject,
      pdfjs.OPS.paintJpegXObject,
    ]);

    for (let index = 0; index < operatorList.fnArray.length; index += 1) {
      const fn = operatorList.fnArray[index];
      if (!imageFnCodes.has(fn)) continue;
      imageOps.push({
        fn,
        args: operatorList.argsArray[index] || [],
      });
    }

    const images = [];
    const seenUrls = new Set();

    for (let index = 0; index < imageOps.length; index += 1) {
      const operation = imageOps[index];
      let sourceImage = null;

      if (operation.fn === pdfjs.OPS.paintInlineImageXObject) {
        sourceImage = operation.args[0] || null;
      } else {
        const objectId = operation.args[0];
        sourceImage = await getObjectFromPdfStore(page.objs, objectId);
        if (!sourceImage) {
          sourceImage = await getObjectFromPdfStore(page.commonObjs, objectId);
        }
      }

      const normalizedAsset = await normalizePdfImageAsset(sourceImage, { pageNumber, index });
      if (!normalizedAsset || seenUrls.has(normalizedAsset.url)) continue;
      seenUrls.add(normalizedAsset.url);
      images.push(normalizedAsset);
    }

    return images;
  } catch (error) {
    console.debug('[attachmentExtraction][pdf] page image extraction failed', {
      pageNumber,
      error: error?.message,
    });
    return [];
  }
}

async function extractPdfPageWithVisionFallback({ file, page, pageNumber, pdfjs }) {
  const textContent = await page.getTextContent();
  const digitalText = getReadablePdfPageText(textContent);
  const quality = isUsablePageText(digitalText);

  console.debug('[attachmentExtraction][pdf] page evaluated', {
    fileName: file?.name,
    pageNumber,
    digitalTextLength: quality.textLength,
    extractionQuality: quality.extractionQuality,
    isUsableDigitalText: quality.isUsable,
  });

  if (quality.isUsable) {
    const images = await extractPdfPageImages({ page, pageNumber, pdfjs });
    console.debug('[attachmentExtraction][pdf] page extracted', {
      fileName: file?.name,
      pageNumber,
      extractionMethod: 'digital',
      isUsableDigitalText: true,
      ocrFallbackUsed: false,
      imageCount: images.length,
    });

    return {
      pageNumber,
      extractionMethod: 'digital',
      text: quality.extractedText,
      extractedText: quality.extractedText,
      textLength: quality.textLength,
      extractionQuality: quality.extractionQuality,
      isUsableDigitalText: true,
      images,
      success: Boolean(quality.textLength || images.length),
      status: quality.textLength || images.length ? 'complete' : 'empty',
    };
  }

  try {
    const canvas = await renderPdfPageToCanvas(page);
    const visionFile = await buildVisionOcrFileFromCanvas(canvas, `${file?.name || 'pdf'}-page-${pageNumber}.png`);
    const ocrResult = await extractImageTextWithVision(visionFile);

    console.debug('[attachmentExtraction][pdf] page extracted', {
      fileName: file?.name,
      pageNumber,
      extractionMethod: 'vision_ocr',
      isUsableDigitalText: false,
      ocrFallbackUsed: true,
      imageCount: 0,
      ocrSuccess: ocrResult.success,
      ocrTextLength: ocrResult.textLength,
    });

    return {
      pageNumber,
      extractionMethod: 'vision_ocr',
      text: ocrResult.extractedText,
      extractedText: ocrResult.extractedText,
      textLength: ocrResult.textLength,
      extractionQuality: ocrResult.success ? 'poor' : 'failed',
      isUsableDigitalText: false,
      images: [],
      success: Boolean(ocrResult.success && ocrResult.textLength),
      status: ocrResult.success && ocrResult.textLength ? 'complete' : 'failed',
    };
  } catch (error) {
    console.debug('[attachmentExtraction][pdf] page OCR fallback failed', {
      fileName: file?.name,
      pageNumber,
      error: error?.message,
    });

    return {
      pageNumber,
      extractionMethod: 'vision_ocr',
      text: '',
      extractedText: '',
      textLength: 0,
      extractionQuality: 'failed',
      isUsableDigitalText: false,
      images: [],
      success: false,
      status: 'failed',
      error: error?.message || 'Vision OCR failed for page',
    };
  }
}

async function extractPdfPerPage(file) {
  const pdfjs = await loadPdfJs();
  const pdfData = await file.arrayBuffer();
  const pdfDocument = await pdfjs.getDocument({ data: pdfData }).promise;
  const pages = [];

  for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber += 1) {
    const page = await pdfDocument.getPage(pageNumber);
    const pageResult = await extractPdfPageWithVisionFallback({
      file,
      page,
      pageNumber,
      pdfjs,
    });
    pages.push(pageResult);
  }

  const combinedText = pages
    .map((page) => String(page?.text || '').trim())
    .filter(Boolean)
    .join('\n\n')
    .trim();

  const failedPages = pages.filter((page) => !page?.success);
  const ocrPages = pages.filter((page) => page?.extractionMethod === 'vision_ocr');
  const digitalPages = pages.filter((page) => page?.extractionMethod === 'digital');
  const extractedImages = digitalPages.flatMap((page) => page.images || []);
  const hasAnyText = Boolean(combinedText);
  const allPagesSuccessful = failedPages.length === 0;

  return {
    pageCount: pdfDocument.numPages,
    selectedPages: pages.map((page) => page.pageNumber),
    pages,
    extractedImages,
    extractedText: combinedText,
    text: combinedText,
    textLength: combinedText.length,
    success: hasAnyText || digitalPages.length > 0,
    partialSuccess: !allPagesSuccessful && (hasAnyText || digitalPages.length > 0),
    extractionQuality: allPagesSuccessful
      ? (hasAnyText ? 'good' : 'failed')
      : (hasAnyText ? 'poor' : 'failed'),
    scannedPdfDetected: ocrPages.length > 0,
    ocrStatus: ocrPages.length === 0
      ? 'not_needed'
      : (failedPages.length === 0 ? 'complete' : (hasAnyText ? 'partial' : 'failed')),
    failedPageCount: failedPages.length,
  };
}

function buildExtractionResult({
  file,
  fileType,
  extractionMethod,
  extractedText,
  textLength,
  extractionQuality,
  success,
  scannedPdfDetected = false,
  requiresPageSelection = false,
  selectedPages = [],
  ocrStatus = 'not_needed',
  pageCount = null,
  source = fileType,
  pages = [],
  extractedImages = [],
  partialSuccess = false,
  failedPageCount = 0,
  text = extractedText,
  provider = '',
  providerRoute = '',
  providerReason = '',
  confidence = 0,
  structuredData = null,
  ppStructureVersion = '',
  errorMessage = '',
  pricing = null,
  cloudVisionPriceUsd = 0,
  cloudVisionPriceZar = 0,
  fxRateZarPerUsd = 0,
}) {
  return {
    fileName: file?.name || 'unknown-file',
    source,
    fileType,
    extractionMethod,
    success,
    partialSuccess,
    extractedText,
    text,
    textLength,
    extractionQuality,
    scannedPdfDetected,
    requiresPageSelection,
    selectedPages,
    ocrStatus,
    pageCount,
    pages,
    extractedImages,
    failedPageCount,
    provider,
    providerRoute,
    providerReason,
    confidence: Number(confidence || 0),
    structuredData: structuredData && typeof structuredData === 'object' ? structuredData : null,
    ppStructureVersion: String(ppStructureVersion || structuredData?.ppStructureVersion || ''),
    errorMessage: String(errorMessage || ''),
    pricing: pricing && typeof pricing === 'object' ? pricing : null,
    cloudVisionPriceUsd: Number(cloudVisionPriceUsd || 0) || 0,
    cloudVisionPriceZar: Number(cloudVisionPriceZar || 0) || 0,
    fxRateZarPerUsd: Number(fxRateZarPerUsd || 0) || 0,
  };
}

export async function extractSingleAttachment(file, options = {}) {
  const { onStatus } = options;
  const fileType = detectAttachmentType(file);
  emitStatus(onStatus, {
    phase: 'file_detected',
    label: 'Attachment detected',
    fileName: file?.name || '',
    fileType: fileType || 'unknown',
  });
  console.debug('[attachmentExtraction] file type detected', {
    fileName: file?.name,
    mimeType: file?.type,
    fileType,
  });

  if (!fileType) {
    return buildExtractionResult({
      file,
      fileType: 'image',
      extractionMethod: 'fallback',
      extractedText: '',
      textLength: 0,
      extractionQuality: 'failed',
      success: false,
    });
  }

  if (fileType === 'image' || fileType === 'pdf') {
    console.debug('[attachmentExtraction] extraction path chosen', { fileName: file.name, path: `${fileType}->backend-ocr-router` });
    try {
      const imageResult = await extractFromImage(file, onStatus);
      return buildExtractionResult({
        file,
        fileType,
        extractionMethod: imageResult.extractionMethod || (fileType === 'pdf' ? 'pdf_ocr' : 'ocr'),
        extractedText: imageResult.extractedText,
        text: imageResult.text || imageResult.extractedText,
        textLength: imageResult.textLength,
        extractionQuality: imageResult.extractionQuality || (imageResult.success ? 'good' : 'failed'),
        success: imageResult.success,
        partialSuccess: Boolean(imageResult.partialSuccess),
        scannedPdfDetected: Boolean(imageResult.scannedPdfDetected),
        selectedPages: Array.isArray(imageResult.selectedPages) ? imageResult.selectedPages : [],
        ocrStatus: imageResult.ocrStatus || (fileType === 'pdf' ? (imageResult.success ? 'complete' : 'failed') : 'not_needed'),
        pageCount: Number(imageResult.pageCount || 0) || null,
        pages: Array.isArray(imageResult.pages) ? imageResult.pages : [],
        extractedImages: Array.isArray(imageResult.extractedImages) ? imageResult.extractedImages : [],
        failedPageCount: Number(imageResult.failedPageCount || 0),
        provider: imageResult.provider || '',
        providerRoute: imageResult.providerRoute || '',
        providerReason: imageResult.providerReason || '',
        confidence: Number(imageResult.confidence || 0),
        structuredData: imageResult.structuredData || null,
        ppStructureVersion: imageResult.ppStructureVersion || '',
        errorMessage: imageResult.errorMessage || '',
        pricing: imageResult.pricing || null,
        cloudVisionPriceUsd: Number(imageResult.cloudVisionPriceUsd || 0) || 0,
        cloudVisionPriceZar: Number(imageResult.cloudVisionPriceZar || 0) || 0,
        fxRateZarPerUsd: Number(imageResult.fxRateZarPerUsd || 0) || 0,
      });
    } catch (error) {
      console.debug('[attachmentExtraction] image OCR failed', { fileName: file.name, error: error?.message });
      emitStatus(onStatus, {
        phase: 'extraction_failed',
        label: 'Extraction failed',
        fileName: file?.name || '',
        fileType,
        level: 'error',
        details: { message: error?.message || 'Unknown extraction failure' },
      });
      return buildExtractionResult({
        file,
        fileType,
        extractionMethod: 'fallback',
        extractedText: '',
        textLength: 0,
        extractionQuality: 'failed',
        success: false,
        errorMessage: error?.message || 'OCR extraction failed',
      });
    }
  }

  return buildExtractionResult({
    file,
    fileType,
    extractionMethod: 'fallback',
    extractedText: '',
    textLength: 0,
    extractionQuality: 'failed',
    success: false,
  });
}

export async function extractAttachments(files = [], onProgress, onStatus) {
  const results = [];

  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    emitStatus(onStatus, {
      phase: 'file_started',
      label: `Starting extraction ${index + 1}/${files.length}`,
      fileName: file?.name || '',
      fileType: detectAttachmentType(file) || '',
    });
    console.debug('[attachmentExtraction] extraction started', {
      fileName: file?.name,
      index,
      total: files.length,
    });

    let result;

    try {
      result = await extractSingleAttachment(file, { onStatus });
    } catch (error) {
      console.debug('[attachmentExtraction] extraction crashed; returning fallback', {
        fileName: file?.name,
        error: error?.message,
      });
      result = buildExtractionResult({
        file,
        fileType: detectAttachmentType(file) || 'image',
        extractionMethod: 'fallback',
        extractedText: '',
        textLength: 0,
        extractionQuality: 'failed',
        success: false,
      });
    }

    emitStatus(onStatus, {
      phase: 'file_completed',
      label: result.success ? 'Extraction complete' : 'Extraction completed with weak/empty text',
      fileName: result.fileName || file?.name || '',
      fileType: result.fileType || '',
      level: result.success ? 'info' : 'warn',
      details: {
        success: Boolean(result.success),
        provider: String(result.provider || ''),
        providerRoute: String(result.providerRoute || ''),
        textLength: Number(result.textLength || 0),
      },
    });

    console.debug('[attachmentExtraction] extraction completed', {
      fileName: result.fileName,
      extractionMethod: result.extractionMethod,
      success: result.success,
      textLength: result.textLength,
    });

    results.push(result);
    if (typeof onProgress === 'function') {
      try {
        onProgress(result, index, files.length);
      } catch (progressError) {
        console.debug('[attachmentExtraction] progress callback failed', {
          fileName: result.fileName,
          error: progressError?.message,
        });
      }
    }
  }

  return results;
}
