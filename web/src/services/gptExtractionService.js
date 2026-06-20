import { getAuth } from 'firebase/auth';

const PDFJS_CDN_URL = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs';
const PDFJS_WORKER_CDN_URL = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs';
const EXTRACT_ATTACHMENT_ENDPOINT = import.meta.env.VITE_EXTRACT_ATTACHMENT_ENDPOINT || '/extract-attachment-ai';
const CLOUD_FUNCTIONS_BASE_URL = String(import.meta.env.VITE_CLOUD_FUNCTIONS_URL || '').trim();
const STREAM_BOARD_EXTRACTION_ENDPOINT = import.meta.env.VITE_STREAM_BOARD_EXTRACTION_ENDPOINT
  || (CLOUD_FUNCTIONS_BASE_URL ? `${CLOUD_FUNCTIONS_BASE_URL}/streamAttachmentAi` : '/stream-board-extraction');
export const LOCAL_VISUAL_CROP_FILE = Symbol('localVisualCropFile');
const VISUAL_CROP_TYPES = new Set(['diagram', 'table', 'graph', 'figure', 'image', 'formula', 'equation', 'math']);
let cachedPdfJs = null;

async function loadPdfJs() {
  if (cachedPdfJs) return cachedPdfJs;
  cachedPdfJs = await import(/* @vite-ignore */ PDFJS_CDN_URL);
  cachedPdfJs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_CDN_URL;
  return cachedPdfJs;
}

async function renderPdfPageToCanvas(page, scale = 1.75) {
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  await page.render({ canvasContext: context, viewport }).promise;
  return canvas;
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      const base64 = dataUrl.split(',')[1];
      resolve({ mimeType: file.type || 'image/jpeg', base64, dataUrl });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function getImageDimensions(dataUrl) {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth || image.width || 0, height: image.naturalHeight || image.height || 0 });
    image.onerror = () => resolve({ width: 0, height: 0 });
    image.src = dataUrl;
  });
}

function canvasToRenderedImage(canvas, source = {}) {
  const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
  const base64 = dataUrl.split(',')[1];
  return {
    mimeType: 'image/jpeg',
    base64,
    dataUrl,
    width: canvas.width,
    height: canvas.height,
    ...source,
  };
}

async function fileToRenderedImage(file, source = {}) {
  const imgData = await fileToBase64(file);
  const dimensions = await getImageDimensions(imgData.dataUrl);
  return {
    ...imgData,
    ...dimensions,
    ...source,
  };
}

function cloneExtraction(extraction) {
  return {
    ...extraction,
    pages: Array.isArray(extraction?.pages)
      ? extraction.pages.map((page) => ({
        ...page,
        questions: Array.isArray(page?.questions)
          ? page.questions.map((question) => ({
            ...question,
            sourceImageIndex: Number.isFinite(Number(question?.sourceImageIndex)) ? Number(question.sourceImageIndex) : null,
            options: Array.isArray(question?.options) ? question.options.map((option) => ({ ...option })) : [],
            visualRegions: Array.isArray(question?.visualRegions) ? question.visualRegions.map((region) => ({ ...region })) : [],
            warnings: Array.isArray(question?.warnings) ? [...question.warnings] : [],
            images: Array.isArray(question?.images) ? question.images.map((image) => ({ ...image })) : [],
          }))
          : [],
      }))
      : [],
    warnings: Array.isArray(extraction?.warnings) ? [...extraction.warnings] : [],
    topics: Array.isArray(extraction?.topics) ? [...extraction.topics] : [],
  };
}

function getCropRect(region = {}, sourceImage = {}) {
  const sourceWidth = Number(sourceImage.width || 0);
  const sourceHeight = Number(sourceImage.height || 0);
  if (!sourceWidth || !sourceHeight) return null;

  let x = Number(region.x || 0);
  let y = Number(region.y || 0);
  let width = Number(region.width || 0);
  let height = Number(region.height || 0);

  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(width) || !Number.isFinite(height)) {
    return null;
  }

  const maxCoordinate = Math.max(Math.abs(x), Math.abs(y), Math.abs(width), Math.abs(height));
  if (maxCoordinate <= 1) {
    x *= sourceWidth;
    width *= sourceWidth;
    y *= sourceHeight;
    height *= sourceHeight;
  } else if (maxCoordinate <= 100) {
    x = (x / 100) * sourceWidth;
    width = (width / 100) * sourceWidth;
    y = (y / 100) * sourceHeight;
    height = (height / 100) * sourceHeight;
  }

  const regionType = String(region?.type || 'other').toLowerCase();
  const padding = ({
    table: 24,
    graph: 24,
    diagram: 20,
    figure: 20,
    image: 16,
    formula: 28,
    equation: 28,
    math: 28,
  })[regionType] || 18;
  const cropX = Math.max(0, Math.floor(x - padding));
  const cropY = Math.max(0, Math.floor(y - padding));
  const cropWidth = Math.min(sourceWidth - cropX, Math.ceil(width + padding * 2));
  const cropHeight = Math.min(sourceHeight - cropY, Math.ceil(height + padding * 2));

  if (cropWidth < 20 || cropHeight < 20) return null;

  return {
    x: cropX,
    y: cropY,
    width: cropWidth,
    height: cropHeight,
  };
}

function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = dataUrl;
  });
}

async function cropVisualRegionToFile({ sourceImage, region, fileName }) {
  if (!sourceImage?.dataUrl) return null;
  const rect = getCropRect(region, sourceImage);
  if (!rect) return null;

  const source = await loadImage(sourceImage.dataUrl);
  const canvas = document.createElement('canvas');
  canvas.width = rect.width;
  canvas.height = rect.height;
  const context = canvas.getContext('2d');
  if (!context) return null;

  context.drawImage(source, rect.x, rect.y, rect.width, rect.height, 0, 0, rect.width, rect.height);

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
  if (!blob) return null;

  const file = new File([blob], fileName, { type: 'image/jpeg' });
  return {
    file,
    width: rect.width,
    height: rect.height,
  };
}

function getSafeCropFileName({ pageNumber, questionIndex, regionIndex, regionType }) {
  const safeType = String(regionType || 'visual').replace(/[^a-z0-9_-]+/gi, '-').toLowerCase();
  return `question-${pageNumber || 1}-${questionIndex + 1}-${safeType}-${regionIndex + 1}.jpg`;
}

export async function attachVisualCropsToExtraction(extraction) {
  const sourceImages = Array.isArray(extraction?.sourceImages) ? extraction.sourceImages : [];
  if (!sourceImages.length || !Array.isArray(extraction?.pages)) return extraction;

  const nextExtraction = cloneExtraction(extraction);

  for (const page of nextExtraction.pages) {
    const pageSourceImageIndex = Number(page?.sourceImageIndex);
    const fallbackSourceImageIndex = Number(page?.pageNumber || 1) - 1;
    const sourceImageIndex = Number.isFinite(pageSourceImageIndex) && pageSourceImageIndex >= 0
      ? Math.floor(pageSourceImageIndex)
      : Math.max(0, fallbackSourceImageIndex);
    const sourceImage = sourceImages[sourceImageIndex];
    if (!sourceImage) continue;

    const questions = Array.isArray(page?.questions) ? page.questions : [];
    for (let questionIndex = 0; questionIndex < questions.length; questionIndex += 1) {
      const question = questions[questionIndex];
      const visualRegions = Array.isArray(question?.visualRegions) ? question.visualRegions : [];
      const visualImages = [];

      for (let regionIndex = 0; regionIndex < visualRegions.length; regionIndex += 1) {
        const region = visualRegions[regionIndex];
        const regionType = String(region?.type || 'other').toLowerCase();
        if (!VISUAL_CROP_TYPES.has(regionType)) continue;

        try {
          const fileName = getSafeCropFileName({
            pageNumber: page?.pageNumber,
            questionIndex,
            regionIndex,
            regionType,
          });
          const crop = await cropVisualRegionToFile({ sourceImage, region, fileName });
          if (!crop?.file) continue;

          const image = {
            type: 'image',
            fileName,
            mimeType: crop.file.type,
            width: crop.width,
            height: crop.height,
            sourceImageIndex,
            visualRegion: { ...region },
          };
          image[LOCAL_VISUAL_CROP_FILE] = crop.file;
          visualImages.push(image);
        } catch (error) {
          console.debug('[studentAttachmentExtraction] visual crop failed', {
            message: error?.message,
            sourceImageIndex,
            region,
          });
        }
      }

      if (visualImages.length) {
        question.images = [
          ...(Array.isArray(question.images) ? question.images : []),
          ...visualImages,
        ];
      }
    }
  }

  return nextExtraction;
}

async function buildPayloadImages(files) {
  let totalVisualCount = 0;
  const pdfDocs = [];
  const MAX_VISUALS = 5;

  for (const file of files) {
    if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
      const pdfjs = await loadPdfJs();
      const pdfData = await file.arrayBuffer();
      const pdfDocument = await pdfjs.getDocument({ data: pdfData }).promise;
      totalVisualCount += Math.min(pdfDocument.numPages, MAX_VISUALS);
      pdfDocs.push({ file, pdfDocument });
    } else {
      totalVisualCount += 1;
    }
  }

  if (totalVisualCount === 0) {
    throw new Error('No valid images or PDF pages found to process.');
  }

  if (totalVisualCount > MAX_VISUALS) {
    throw new Error('Please upload a maximum of 5 pages or images.');
  }

  const payloadImages = [];

  for (const file of files) {
    if (payloadImages.length >= MAX_VISUALS) break;

    if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
      const pdfInfo = pdfDocs.find((p) => p.file === file);
      const pdfDocument = pdfInfo.pdfDocument;
      const pagesToProcess = Math.min(pdfDocument.numPages, MAX_VISUALS - payloadImages.length, MAX_VISUALS);

      for (let pageNumber = 1; pageNumber <= pagesToProcess; pageNumber++) {
        const page = await pdfDocument.getPage(pageNumber);
        const canvas = await renderPdfPageToCanvas(page);
        payloadImages.push(canvasToRenderedImage(canvas, {
          sourceFileName: file.name,
          sourcePageNumber: pageNumber,
        }));
      }
    } else {
      const imgData = await fileToRenderedImage(file, {
        sourceFileName: file.name,
        sourcePageNumber: 1,
      });
      payloadImages.push(imgData);
    }
  }

  return payloadImages;
}

function truncateForLog(value = '', maxChars = 320) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}...`;
}

function normalizeStreamJsonLine(line = '') {
  let normalized = String(line || '').replace(/\r/g, '').trim();
  if (!normalized) return '';

  if (/^data:\s*/i.test(normalized)) {
    normalized = normalized.replace(/^data:\s*/i, '').trim();
  }

  if (/^```(?:json)?$/i.test(normalized) || normalized === '```') {
    return '';
  }

  if (normalized.startsWith('```')) {
    normalized = normalized.replace(/^```(?:json)?/i, '').trim();
  }

  if (normalized.endsWith('```')) {
    normalized = normalized.replace(/```+$/i, '').trim();
  }

  return normalized.trim();
}

function parseJsonLine(line = '') {
  const normalizedLine = normalizeStreamJsonLine(line);
  if (!normalizedLine) {
    return { parsed: null, normalizedLine: '', skipped: true };
  }

  try {
    return { parsed: JSON.parse(normalizedLine), normalizedLine, skipped: false };
  } catch (error) {
    return { parsed: null, normalizedLine, skipped: false, error };
  }
}

function buildExtractionFromStreamState(streamState = {}, streamMeta = {}) {
  const pagesByNumber = streamState.pagesByNumber || new Map();
  const pages = Array.from(pagesByNumber.keys())
    .sort((a, b) => a - b)
    .map((pageNumber) => {
      const questions = pagesByNumber.get(pageNumber) || [];
      const explicitSourceImage = questions.find((question) => Number.isFinite(Number(question?.sourceImageIndex)) && Number(question.sourceImageIndex) >= 0);
      return {
        pageNumber,
        sourceImageIndex: explicitSourceImage
          ? Math.floor(Number(explicitSourceImage.sourceImageIndex))
          : Math.max(0, pageNumber - 1),
        questions,
      };
    });

  const questionsCount = pages.reduce((sum, page) => sum + (Array.isArray(page.questions) ? page.questions.length : 0), 0);

  return {
    subject: streamState.subject || '',
    topics: Array.isArray(streamState.topics) ? streamState.topics : [],
    estimatedMinutes: Number.isFinite(Number(streamState.estimatedMinutes))
      ? Number(streamState.estimatedMinutes)
      : 10,
    pages,
    warnings: [],
    extractionStatus: streamState.complete ? 'SUCCESS' : 'PARTIAL',
    sourceImages: streamState.sourceImages || [],
    summary: {
      questionsCount,
      pageCount: pages.length,
    },
    streamMeta: {
      rawChunkCount: Number(streamMeta.rawChunkCount || 0),
      parsedEventCount: Number(streamMeta.parsedEventCount || 0),
      classificationCount: Number(streamMeta.classificationCount || 0),
      questionCount: Number(streamMeta.questionCount || 0),
      completeCount: Number(streamMeta.completeCount || 0),
      parseFailureCount: Number(streamMeta.parseFailureCount || 0),
      errorCount: Number(streamMeta.errorCount || 0),
      sawClassification: Boolean(streamMeta.sawClassification),
      sawComplete: Boolean(streamMeta.sawComplete),
      hadError: Boolean(streamMeta.hadError),
      lastError: String(streamMeta.lastError || ''),
    },
  };
}

export async function streamAttachmentsWithGPT(files, {
  requestId = '',
  topicHint = '',
  onEvent,
} = {}) {
  console.debug('[studentAttachmentExtraction] stream start', {
    requestId,
    topicHint: truncateForLog(topicHint, 200),
    fileCount: Array.isArray(files) ? files.length : 0,
  });

  const payloadImages = await buildPayloadImages(files);

  const auth = getAuth();
  const user = auth.currentUser;
  if (!user) {
    throw new Error('User not authenticated.');
  }

  const token = await user.getIdToken();

  const response = await fetch(STREAM_BOARD_EXTRACTION_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      requestId,
      topic: topicHint,
      images: payloadImages,
    }),
  });

  if (!response.ok || !response.body) {
    const fallbackPayload = await response.json().catch(() => ({}));
    throw new Error(fallbackPayload?.message || 'Streaming extraction failed. Please try again.');
  }

  const streamState = {
    subject: '',
    topics: [],
    estimatedMinutes: 10,
    pagesByNumber: new Map(),
    complete: false,
    sourceImages: payloadImages.map((image, index) => ({
      index,
      mimeType: image.mimeType,
      base64: image.base64,
      dataUrl: image.dataUrl,
      width: image.width,
      height: image.height,
      sourceFileName: image.sourceFileName || '',
      sourcePageNumber: image.sourcePageNumber || null,
    })),
  };
  const streamMeta = {
    rawChunkCount: 0,
    parsedEventCount: 0,
    classificationCount: 0,
    questionCount: 0,
    completeCount: 0,
    parseFailureCount: 0,
    errorCount: 0,
    hadError: false,
    lastError: '',
  };

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let questionCounter = 0;

  const pushQuestion = (event) => {
    questionCounter += 1;
    const pageNumber = Number.isFinite(Number(event?.pageNumber)) && Number(event.pageNumber) > 0
      ? Number(event.pageNumber)
      : 1;
    const visualRegions = Array.isArray(event?.visualRegions)
      ? event.visualRegions.map((region = {}) => ({
        type: String(region?.type || 'other').toLowerCase() || 'other',
        x: Number.isFinite(Number(region?.x)) ? Number(region.x) : 0,
        y: Number.isFinite(Number(region?.y)) ? Number(region.y) : 0,
        width: Number.isFinite(Number(region?.width)) ? Number(region.width) : 0,
        height: Number.isFinite(Number(region?.height)) ? Number(region.height) : 0,
        description: String(region?.description || '').trim(),
      })).filter((region) => region.width > 0 && region.height > 0)
      : [];
    const questions = streamState.pagesByNumber.get(pageNumber) || [];
    questions.push({
      questionId: String(event?.questionId || `q_${String(questionCounter).padStart(3, '0')}`),
      questionNumber: String(event?.questionNumber || ''),
      text: String(event?.text || '').trim(),
      type: 'question',
      marks: Number.isFinite(Number(event?.marks)) ? Number(event.marks) : null,
      sourceImageIndex: Number.isFinite(Number(event?.sourceImageIndex)) && Number(event.sourceImageIndex) >= 0
        ? Math.floor(Number(event.sourceImageIndex))
        : null,
      visualRegions,
      options: [],
      warnings: [],
      hasVisuals: Boolean(visualRegions.length || event?.diagramImageRef),
      images: event?.diagramImageRef
        ? [{ type: 'image', url: String(event.diagramImageRef), mimeType: 'image/png' }]
        : [],
    });
    streamState.pagesByNumber.set(pageNumber, questions);
  };

  const handleParsedEvent = (event) => {
    if (!event || typeof event !== 'object') return;
    const type = String(event?.type || '').toLowerCase();
    streamMeta.parsedEventCount += 1;
    console.debug('[studentAttachmentExtraction] parsed event received', {
      type,
      rawEventPreview: truncateForLog(JSON.stringify(event), 240),
    });

    if (type === 'classification') {
      streamMeta.classificationCount += 1;
      streamState.subject = String(event?.subject || '').trim();
      const eventTopics = Array.isArray(event?.topics)
        ? event.topics.map((item) => String(item || '').trim()).filter(Boolean)
        : [];
      const eventTopic = String(event?.topic || '').trim();
      streamState.topics = eventTopics.length ? eventTopics : (eventTopic ? [eventTopic] : []);
      streamState.estimatedMinutes = Number.isFinite(Number(event?.estimatedMinutes))
        ? Number(event.estimatedMinutes)
        : streamState.estimatedMinutes;
      return;
    }

    if (type === 'question') {
      streamMeta.questionCount += 1;
      pushQuestion(event);
      return;
    }

    if (type === 'complete') {
      streamMeta.completeCount += 1;
      streamState.complete = true;
      return;
    }

    if (type === 'error') {
      streamMeta.errorCount += 1;
      streamMeta.hadError = true;
      streamMeta.lastError = String(event?.message || event?.error || 'Streaming extraction failed.');
      console.warn('[studentAttachmentExtraction] stream error event received', {
        message: streamMeta.lastError,
        rawEventPreview: truncateForLog(JSON.stringify(event), 240),
      });
      throw new Error(streamMeta.lastError);
    }
  };

  while (true) {
    // eslint-disable-next-line no-await-in-loop
    const { value, done } = await reader.read();
    if (done) break;
    const decodedChunk = decoder.decode(value, { stream: true });
    streamMeta.rawChunkCount += 1;
    console.debug('[studentAttachmentExtraction] raw stream chunk received', {
      chunkIndex: streamMeta.rawChunkCount,
      chunkLength: decodedChunk.length,
      chunkPreview: truncateForLog(decodedChunk),
    });
    buffer += decodedChunk;
    const lines = buffer.replace(/\r\n?/g, '\n').split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const parsed = parseJsonLine(line);
      if (parsed?.skipped) continue;
      if (!parsed?.parsed || typeof parsed.parsed !== 'object') {
        streamMeta.parseFailureCount += 1;
        console.warn('[studentAttachmentExtraction] failed to parse stream line', {
          linePreview: truncateForLog(line),
          normalizedPreview: truncateForLog(parsed?.normalizedLine || ''),
          parseFailureCount: streamMeta.parseFailureCount,
        });
        continue;
      }

      handleParsedEvent(parsed.parsed);
      if (typeof onEvent === 'function') {
        onEvent(parsed.parsed, buildExtractionFromStreamState(streamState, streamMeta));
      }
    }
  }

  if (buffer.trim()) {
    const parsed = parseJsonLine(buffer.trim());
    if (parsed?.skipped) {
      // nothing to do
    } else if (!parsed?.parsed || typeof parsed.parsed !== 'object') {
      streamMeta.parseFailureCount += 1;
      console.warn('[studentAttachmentExtraction] failed to parse trailing stream line', {
        linePreview: truncateForLog(buffer.trim()),
        normalizedPreview: truncateForLog(parsed?.normalizedLine || ''),
        parseFailureCount: streamMeta.parseFailureCount,
      });
    } else {
      handleParsedEvent(parsed.parsed);
      if (typeof onEvent === 'function') {
        onEvent(parsed.parsed, buildExtractionFromStreamState(streamState, streamMeta));
      }
    }
  }

  return buildExtractionFromStreamState(streamState, streamMeta);
}

export async function extractAttachmentsWithGPT(files) {
  const payloadImages = await buildPayloadImages(files);

  const auth = getAuth();
  const user = auth.currentUser;
  if (!user) {
    throw new Error('User not authenticated.');
  }

  const token = await user.getIdToken();

  const response = await fetch(EXTRACT_ATTACHMENT_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ images: payloadImages }),
  });

  const data = await response.json();
  if (!response.ok || data.error) {
    throw new Error(data.message || 'Extraction failed. Please try again or upload a clearer image.');
  }

  return {
    ...data.extraction,
    sourceImages: payloadImages.map((image, index) => ({
      index,
      mimeType: image.mimeType,
      base64: image.base64,
      dataUrl: image.dataUrl,
      width: image.width,
      height: image.height,
      sourceFileName: image.sourceFileName || '',
      sourcePageNumber: image.sourcePageNumber || null,
    })),
  };
}
