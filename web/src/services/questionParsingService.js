import { debugLog } from '../utils/devLogger';

const QUESTION_BOUNDARY_REGEX = /(?:^|\n)\s*(Question\s*\d+|Q\s*\d+|[0-9]{1,3}(?:\.[0-9]{1,3})*\s*[.)]?|[A-Za-z]\s*[)])/gi;
const QUESTION_LINE_START_REGEX = /^\s*(Question\s*(\d+)|Q\s*(\d+)|([0-9]{1,3}(?:\.[0-9]{1,3})*)\s*[.)]?|([A-Za-z])\s*[)])\s*/i;

function normalizeLineBreaks(text = '') {
  return String(text || '').replace(/\r\n?/g, '\n').replace(/\u00a0/g, ' ');
}

function trimOcrNoise(line = '') {
  return String(line || '')
    .replace(/^[`~_|\\]+/, '')
    .replace(/[`~_|\\]+$/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export function cleanExtractedText(rawText = '') {
  const original = String(rawText || '');
  if (!original.trim()) {
    return {
      cleanedText: '',
      stats: {
        originalLength: original.length,
        cleanedLength: 0,
        lineCount: 0,
      },
    };
  }

  let cleaned = normalizeLineBreaks(original)
    .replace(/(\w)-\n(\w)/g, '$1$2')
    .replace(/\t/g, ' ')
    .replace(/[ \f\v]+/g, ' ')
    .replace(/([?!.,;:]){3,}/g, '$1')
    .replace(/[^\S\n]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  cleaned = cleaned
    .split('\n')
    .map((line) => trimOcrNoise(line))
    .filter((line, index, lines) => line || (index > 0 && lines[index - 1]))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  cleaned = cleaned
    .replace(/\s+(Question\s*\d+|Q\s*\d+|[0-9]{1,3}(?:\.[0-9]{1,3})*\s*[.)]|[A-Za-z]\s*[)])(?=\s+)/gi, '\n$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  const stats = {
    originalLength: original.length,
    cleanedLength: cleaned.length,
    lineCount: cleaned ? cleaned.split('\n').length : 0,
  };

  debugLog('questionParsing', '[textCleaning] applied.', stats);

  return {
    cleanedText: cleaned,
    stats,
  };
}

function normalizeImageAttachment(item) {
  if (!item) return null;

  if (typeof item === 'string') {
    return {
      src: item,
      type: 'image',
      fileName: '',
      mimeType: 'image/png',
    };
  }

  const contentType = String(item?.contentType || item?.mimeType || '').toLowerCase();
  const fileName = String(item?.fileName || '').toLowerCase();
  const src = item?.downloadUrl || item?.src || item?.url || '';
  const isImage = contentType.startsWith('image/')
    || /\.(png|jpg|jpeg|webp|bmp|gif|tiff?)$/.test(fileName)
    || /^data:image\//i.test(src);

  if (!src || !isImage) return null;

  let mimeType = contentType;
  if (!mimeType) {
    if (/\.(png)$/i.test(fileName) || /^data:image\/png/i.test(src)) mimeType = 'image/png';
    else if (/\.(jpe?g)$/i.test(fileName) || /^data:image\/jpeg/i.test(src)) mimeType = 'image/jpeg';
    else if (/\.(webp)$/i.test(fileName) || /^data:image\/webp/i.test(src)) mimeType = 'image/webp';
    else if (/\.(gif)$/i.test(fileName) || /^data:image\/gif/i.test(src)) mimeType = 'image/gif';
    else mimeType = 'image/png';
  }

  return {
    src,
    type: 'image',
    fileName: item?.fileName || '',
    mimeType,
    id: item?.id || '',
    fileId: item?.fileId || item?.id || '',
    dataURL: item?.dataURL || item?.dataUrl || '',
    storageUrl: item?.storageUrl || item?.downloadUrl || src,
    width: Number(item?.width || 0) || undefined,
    height: Number(item?.height || 0) || undefined,
  };
}

function normalizeFileAttachment(item) {
  if (!item || typeof item === 'string') return null;

  const url = item?.downloadUrl || item?.src || item?.url || '';
  const mimeType = String(item?.contentType || item?.mimeType || item?.type || '').toLowerCase();
  const fileName = String(item?.fileName || item?.name || '').toLowerCase();
  const isImageOrPdf = mimeType.startsWith('image/')
    || mimeType === 'application/pdf'
    || /\.(png|jpe?g|webp|bmp|gif|tiff?|pdf)$/.test(fileName);
  if (!url) return null;
  if (isImageOrPdf) return null;

  return {
    type: 'file',
    url,
    fileName: item?.fileName || item?.name || 'Uploaded file',
    mimeType,
    id: item?.id || item?.path || '',
    size: Number(item?.size || 0) || undefined,
  };
}

function dedupeImages(images = []) {
  const seen = new Set();
  return images.filter((image) => {
    const key = `${image?.src || ''}::${image?.fileName || ''}`;
    if (!image?.src || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function dedupeFiles(files = []) {
  const seen = new Set();
  return files.filter((file) => {
    const key = `${file?.url || ''}::${file?.fileName || ''}`;
    if (!file?.url || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function getQuestionNumber(boundary = '') {
  const match = String(boundary || '').match(QUESTION_LINE_START_REGEX);
  if (!match) return null;
  return match[2] || match[3] || match[4] || match[5] || null;
}

function splitQuestionsDeterministically(fullText = '') {
  const normalized = String(fullText || '').trim();
  if (!normalized) return [];

  const matches = Array.from(normalized.matchAll(QUESTION_BOUNDARY_REGEX));
  if (!matches.length) return [];

  const blocks = [];
  matches.forEach((match, index) => {
    const start = typeof match.index === 'number' ? match.index : 0;
    const boundaryStart = normalized.indexOf(match[1], start);
    const nextMatch = matches[index + 1];
    const nextStart = nextMatch && typeof nextMatch.index === 'number'
      ? normalized.indexOf(nextMatch[1], nextMatch.index)
      : normalized.length;

    const sliceStart = Math.max(0, boundaryStart);
    const sliceEnd = nextStart > sliceStart ? nextStart : normalized.length;
    const text = normalized.slice(sliceStart, sliceEnd).trim();

    if (!text) return;

    blocks.push({
      questionNumber: getQuestionNumber(match[1]),
      text,
      images: [],
    });
  });

  return blocks;
}

function buildFallbackQuestion(fullText, imageReferences = [], fileReferences = []) {
  const text = String(fullText || '').trim();
  if (!text && !imageReferences.length && !fileReferences.length) return [];

  return [
    {
      questionNumber: null,
      text,
      images: imageReferences,
      files: fileReferences,
    },
  ];
}

function attachImagesToBlocks(blocks = [], images = []) {
  if (!blocks.length || !images.length) return blocks;

  const nextBlocks = blocks.map((block) => ({ ...block, images: [...(block.images || [])] }));

  images.forEach((image, index) => {
    const targetIndex = blocks.length === 1
      ? 0
      : Math.min(blocks.length - 1, index);
    nextBlocks[targetIndex].images.push(image);
  });

  return nextBlocks;
}

function parseSourceIntoBlocks({ text = '', images = [], files = [] }) {
  const { cleanedText } = cleanExtractedText(text);
  const structuredBlocks = splitQuestionsDeterministically(cleanedText);

  if (!structuredBlocks.length) {
    return {
      blocks: buildFallbackQuestion(cleanedText, images, files).map((block, index) => ({
        ...block,
        files: index === 0 ? files : [],
      })),
      fallbackUsed: true,
    };
  }

  return {
    blocks: attachImagesToBlocks(structuredBlocks, images).map((block, index) => ({
      ...block,
      files: index === 0 ? files : [],
    })),
    fallbackUsed: false,
  };
}

function normalizeAttachmentExtractions(attachmentExtractions = []) {
  return (attachmentExtractions || [])
    .map((entry) => {
      const uploadedImage = normalizeImageAttachment(entry?.uploadedAttachment);
      const uploadedFile = normalizeFileAttachment(entry?.uploadedAttachment);
      const extractedImages = (entry?.extractedImages || [])
        .map((image) => normalizeImageAttachment(image))
        .filter(Boolean);
      const pageImages = (entry?.pages || [])
        .flatMap((page) => page?.images || [])
        .map((image) => normalizeImageAttachment(image))
        .filter(Boolean);

      return {
        text: String(entry?.extractedText || entry?.text || ''),
        images: dedupeImages([
          ...pageImages,
          ...extractedImages,
          ...(uploadedImage ? [uploadedImage] : []),
        ]),
        files: dedupeFiles(uploadedFile ? [uploadedFile] : []),
      };
    })
    .filter((entry) => String(entry.text || '').trim() || entry.images.length || entry.files.length);
}

export function parseQuestionsFromExtraction({
  extractedText = '',
  attachments = [],
  attachmentExtractions = [],
  ocrImageReferences = [],
} = {}) {
  const attachmentImages = dedupeImages((attachments || []).map((item) => normalizeImageAttachment(item)).filter(Boolean));
  const attachmentFiles = dedupeFiles((attachments || []).map((item) => normalizeFileAttachment(item)).filter(Boolean));
  const ocrImages = dedupeImages((ocrImageReferences || []).map((item) => normalizeImageAttachment(item)).filter(Boolean));
  const extractionSources = normalizeAttachmentExtractions(attachmentExtractions);

  debugLog('questionParsing', '[parse] started.', {
    extractedTextLength: String(extractedText || '').length,
    attachmentCount: Array.isArray(attachments) ? attachments.length : 0,
    attachmentExtractionCount: Array.isArray(attachmentExtractions) ? attachmentExtractions.length : 0,
    ocrImageReferenceCount: Array.isArray(ocrImageReferences) ? ocrImageReferences.length : 0,
  });

  const sourceBlocks = [];
  let fallbackUsed = false;
  let attachedImageCount = 0;
  let attachedFileCount = 0;

  if (extractionSources.length) {
    extractionSources.forEach((source) => {
      const parsed = parseSourceIntoBlocks(source);
      fallbackUsed = fallbackUsed || parsed.fallbackUsed;
      attachedImageCount += source.images.length;
      attachedFileCount += source.files.length;
      sourceBlocks.push(...parsed.blocks);
    });
  }

  if (!sourceBlocks.length) {
    const parsed = parseSourceIntoBlocks({
      text: extractedText,
      images: dedupeImages([...attachmentImages, ...ocrImages]),
      files: attachmentFiles,
    });
    fallbackUsed = parsed.fallbackUsed;
    attachedImageCount += attachmentImages.length + ocrImages.length;
    attachedFileCount += attachmentFiles.length;
    sourceBlocks.push(...parsed.blocks);
  } else {
    const extraImages = dedupeImages([
      ...ocrImages,
      ...attachmentImages.filter((image) => {
        return !sourceBlocks.some((block) => (block.images || []).some((blockImage) => blockImage.src === image.src));
      }),
    ]);

    if (extraImages.length && sourceBlocks.length) {
      sourceBlocks[sourceBlocks.length - 1].images = [
        ...(sourceBlocks[sourceBlocks.length - 1].images || []),
        ...extraImages,
      ];
      attachedImageCount += extraImages.length;
    }

    const extraFiles = dedupeFiles(attachmentFiles.filter((file) => {
      return !sourceBlocks.some((block) => (block.files || []).some((blockFile) => blockFile.url === file.url));
    }));

    if (extraFiles.length && sourceBlocks.length) {
      sourceBlocks[0].files = [
        ...(sourceBlocks[0].files || []),
        ...extraFiles,
      ];
      attachedFileCount += extraFiles.length;
    }
  }

  const finalBlocks = sourceBlocks.length
    ? sourceBlocks
    : buildFallbackQuestion(cleanExtractedText(extractedText).cleanedText, dedupeImages([...attachmentImages, ...ocrImages]))
      .map((block, index) => ({
        ...block,
        files: index === 0 ? attachmentFiles : [],
      }));

  debugLog('questionParsing', '[parse] finished.', {
    questionBlockCount: finalBlocks.length,
    fallbackUsed,
    attachedImageCount,
    attachedFileCount,
  });

  return finalBlocks;
}

export function parseQuestionsFromGptExtraction({
  gptExtraction = null,
  attachments = [],
} = {}) {
  const pages = Array.isArray(gptExtraction?.pages) ? gptExtraction.pages : [];
  const attachmentFiles = dedupeFiles((attachments || []).map((item) => normalizeFileAttachment(item)).filter(Boolean));
  const blocks = [];

  pages.forEach((page) => {
    const pageNumber = Number(page?.pageNumber || 0);
    const questions = Array.isArray(page?.questions) ? page.questions : [];

    questions.forEach((question, questionIndex) => {
      const questionText = String(question?.text || '').trim();
      const options = Array.isArray(question?.options) ? question.options : [];
      const visualRegions = Array.isArray(question?.visualRegions) ? question.visualRegions : [];
      const warnings = Array.isArray(question?.warnings) ? question.warnings : [];
      const questionImages = Array.isArray(question?.images)
        ? dedupeImages(question.images.map((image) => normalizeImageAttachment(image)).filter(Boolean))
        : [];

      const visualsText = visualRegions.length
        ? `\n\nVisual regions:\n${visualRegions
          .map((region, regionIndex) => {
            const type = String(region?.type || 'other');
            const description = String(region?.description || '').trim();
            const x = Number(region?.x || 0);
            const y = Number(region?.y || 0);
            const width = Number(region?.width || 0);
            const height = Number(region?.height || 0);
            return `${regionIndex + 1}. ${type} (${x}, ${y}, ${width}, ${height})${description ? `: ${description}` : ''}`;
          })
          .join('\n')}`
        : '';
      const warningsText = warnings.length ? `\n\nWarnings: ${warnings.join('; ')}` : '';
      const prefix = question?.questionNumber ? `Question ${question.questionNumber}` : `Question ${questionIndex + 1}`;

      blocks.push({
        questionNumber: String(question?.questionNumber || ''),
        text: `${prefix}${questionText ? `\n${questionText}` : ''}${visualsText}${warningsText}`.trim(),
        images: questionImages,
        files: [],
        pageNumber,
        sourceImageIndex: Number.isFinite(Number(question?.sourceImageIndex))
          ? Number(question.sourceImageIndex)
          : Math.max(0, pageNumber - 1),
        questionId: String(question?.questionId || ''),
        questionType: String(question?.questionType || 'other'),
        options: options.map((option = {}, optionIndex) => ({
          label: String(option?.label || String.fromCharCode(65 + optionIndex)),
          text: String(option?.text || '').trim(),
          isCorrect: typeof option?.isCorrect === 'boolean' ? option.isCorrect : null,
        })).filter((option) => option.text),
        type: String(question?.type || 'unknown'),
        hasVisuals: Boolean(question?.hasVisuals),
        visualRegions,
      });

      options.forEach((option = {}, optionIndex) => {
        const optionLabel = String(option?.label || String.fromCharCode(65 + optionIndex)).trim() || String.fromCharCode(65 + optionIndex);
        const optionText = String(option?.text || '').trim();
        if (!optionText) return;
        blocks.push({
          questionNumber: '',
          text: `Option ${optionLabel}: ${optionText}`,
          images: [],
          files: [],
          pageNumber,
          questionId: `${String(question?.questionId || `q_${questionIndex + 1}`)}_option_${optionLabel.toLowerCase()}`,
          questionType: 'option',
          optionForQuestionId: String(question?.questionId || ''),
          type: 'question_option',
          hasVisuals: false,
          visualRegions: [],
        });
      });
    });
  });

  if (!blocks.length) {
    return buildFallbackQuestion('', [], attachmentFiles);
  }

  blocks[0].files = attachmentFiles;
  return blocks;
}
