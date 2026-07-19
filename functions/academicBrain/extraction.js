const pdfParse = require('pdf-parse');
const { normalizeExtractedText, detectScannedPage } = require('./text');

async function extractPdfNativePages(pdfBuffer) {
  const parsed = await pdfParse(pdfBuffer).catch(() => ({ text: '' }));
  const text = normalizeExtractedText(parsed?.text || '');
  const pages = text.split(/\f+/).map((entry) => normalizeExtractedText(entry)).filter(Boolean);
  return pages;
}

async function extractDocumentText({
  mimeType = '',
  fileName = '',
  imageBuffer,
  runVisionOcrOnBuffer,
  convertPdfToImages,
} = {}) {
  const isPdf = String(mimeType || '').toLowerCase() === 'application/pdf'
    || (Buffer.isBuffer(imageBuffer) && imageBuffer.slice(0, 5).toString('utf8') === '%PDF-');

  if (!isPdf) {
    const ocr = await runVisionOcrOnBuffer(imageBuffer);
    const normalizedText = normalizeExtractedText(ocr?.extractedText || '');
    return {
      success: Boolean(normalizedText),
      extractedText: normalizedText,
      text: normalizedText,
      textLength: normalizedText.length,
      extractionMethod: 'ocr',
      provider: 'google-vision',
      fileType: 'image',
      extractionQuality: normalizedText ? 'good' : 'failed',
      scannedPdfDetected: false,
      ocrStatus: 'not_needed',
      pageCount: 1,
      selectedPages: [1],
      pages: [{
        pageNumber: 1,
        extractionMethod: 'vision_ocr',
        text: normalizedText,
        extractedText: normalizedText,
        textLength: normalizedText.length,
        extractionQuality: normalizedText ? 'good' : 'failed',
        success: Boolean(normalizedText),
        status: normalizedText ? 'complete' : 'failed',
      }],
      failedPageCount: normalizedText ? 0 : 1,
      partialSuccess: false,
      extractedImages: [],
      source: 'image',
      structuredData: null,
      engine: { name: 'academic-brain', version: '1.0.0' },
    };
  }

  const nativePages = await extractPdfNativePages(imageBuffer);
  const imagePages = await convertPdfToImages(imageBuffer, {}).catch(() => []);
  const pages = [];
  const extractedImages = [];

  for (let index = 0; index < imagePages.length; index += 1) {
    const pageNumber = index + 1;
    const pageImageBuffer = imagePages[index];
    if (Buffer.isBuffer(pageImageBuffer)) {
      const dataUrl = `data:image/png;base64,${pageImageBuffer.toString('base64')}`;
      extractedImages.push({
        id: `${fileName || 'pdf'}-page-${pageNumber}`,
        fileName: `${fileName || 'document'} page ${pageNumber}`,
        src: dataUrl,
        url: dataUrl,
        mimeType: 'image/png',
        pageNumber,
      });
    }
    const nativeText = normalizeExtractedText(nativePages[index] || '');
    const nativeStats = detectScannedPage({ nativeText, nativeTextConfidence: nativeText ? 0.8 : 0 });

    if (!nativeStats.scanned && nativeText) {
      pages.push({
        pageNumber,
        extractionMethod: 'digital',
        text: nativeText,
        extractedText: nativeText,
        textLength: nativeText.length,
        extractionQuality: 'good',
        success: true,
        status: 'complete',
        isUsableDigitalText: true,
      });
      continue;
    }

    const ocr = await runVisionOcrOnBuffer(pageImageBuffer);
    const ocrText = normalizeExtractedText(ocr?.extractedText || '');
    pages.push({
      pageNumber,
      extractionMethod: 'vision_ocr',
      text: ocrText,
      extractedText: ocrText,
      textLength: ocrText.length,
      extractionQuality: ocrText ? 'poor' : 'failed',
      success: Boolean(ocrText),
      status: ocrText ? 'complete' : 'failed',
      isUsableDigitalText: false,
    });
  }

  const extractedText = pages.map((page) => page.extractedText).filter(Boolean).join('\n\n').trim();
  const failedPageCount = pages.filter((page) => !page.success).length;
  const scannedPageCount = pages.filter((page) => page.extractionMethod === 'vision_ocr').length;

  return {
    success: Boolean(extractedText),
    extractedText,
    text: extractedText,
    textLength: extractedText.length,
    extractionMethod: 'pdf_ocr',
    provider: 'google-vision',
    fileType: 'pdf',
    extractionQuality: extractedText ? (failedPageCount ? 'poor' : 'good') : 'failed',
    scannedPdfDetected: scannedPageCount > 0,
    ocrStatus: failedPageCount ? (extractedText ? 'partial' : 'failed') : 'complete',
    pageCount: pages.length,
    selectedPages: pages.map((page) => page.pageNumber),
    pages,
    failedPageCount,
    partialSuccess: failedPageCount > 0 && Boolean(extractedText),
    extractedImages,
    source: 'pdf',
    structuredData: null,
    engine: { name: 'academic-brain', version: '1.0.0' },
    meta: { fileName },
  };
}

module.exports = {
  extractDocumentText,
  extractPdfNativePages,
};
