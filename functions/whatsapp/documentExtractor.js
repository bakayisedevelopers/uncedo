'use strict';

const MAX_EXTRACTED_CHARACTERS = 8000;

function normalizeExtractedText(value, maxCharacters = MAX_EXTRACTED_CHARACTERS) {
  return String(value || '')
    .replace(/\u0000/g, '')
    .replace(/[\u0001-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, Math.max(1, Math.min(MAX_EXTRACTED_CHARACTERS, Number(maxCharacters) || MAX_EXTRACTED_CHARACTERS)));
}

function validateDocxArchive(buffer) {
  const minimum = Math.max(0, buffer.length - 65_557);
  let endOffset = -1;
  for (let offset = buffer.length - 22; offset >= minimum; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) { endOffset = offset; break; }
  }
  if (endOffset < 0) throw new Error('The DOCX archive is malformed.');
  const entryCount = buffer.readUInt16LE(endOffset + 10);
  const diskNumber = buffer.readUInt16LE(endOffset + 4);
  const centralDiskNumber = buffer.readUInt16LE(endOffset + 6);
  const entriesOnDisk = buffer.readUInt16LE(endOffset + 8);
  const centralSize = buffer.readUInt32LE(endOffset + 12);
  const centralOffset = buffer.readUInt32LE(endOffset + 16);
  if (diskNumber !== 0 || centralDiskNumber !== 0 || entriesOnDisk !== entryCount
    || entryCount < 1 || entryCount > 200 || centralSize > 2 * 1024 * 1024
    || centralOffset + centralSize > endOffset) throw new Error('The DOCX archive exceeds safe extraction limits.');

  let cursor = centralOffset;
  let totalUncompressed = 0;
  let hasDocumentXml = false;
  for (let index = 0; index < entryCount; index += 1) {
    if (cursor + 46 > buffer.length || buffer.readUInt32LE(cursor) !== 0x02014b50) {
      throw new Error('The DOCX archive is malformed.');
    }
    const flags = buffer.readUInt16LE(cursor + 8);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const uncompressedSize = buffer.readUInt32LE(cursor + 24);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const recordEnd = cursor + 46 + nameLength + extraLength + commentLength;
    if (flags & 0x0001 || recordEnd > centralOffset + centralSize || compressedSize === 0xffffffff || uncompressedSize === 0xffffffff) {
      throw new Error('The DOCX archive uses unsupported or unsafe ZIP features.');
    }
    const name = buffer.toString('utf8', cursor + 46, cursor + 46 + nameLength).replace(/\\/g, '/');
    if (name.startsWith('/') || name.split('/').includes('..')) throw new Error('The DOCX archive contains an unsafe path.');
    if (name === 'word/document.xml') hasDocumentXml = true;
    totalUncompressed += uncompressedSize;
    if (totalUncompressed > 20 * 1024 * 1024
      || (uncompressedSize > 1024 * 1024 && uncompressedSize / Math.max(1, compressedSize) > 100)) {
      throw new Error('The DOCX archive expands beyond safe extraction limits.');
    }
    cursor = recordEnd;
  }
  if (cursor !== centralOffset + centralSize || !hasDocumentXml) throw new Error('The DOCX archive does not contain a valid Word document.');
  return true;
}

async function extractWhatsAppDocumentText({ buffer, mimeType, maxCharacters = MAX_EXTRACTED_CHARACTERS, pdfExtractor = null, docxExtractor = null } = {}) {
  if (!Buffer.isBuffer(buffer) || !buffer.length || buffer.length > 10 * 1024 * 1024) {
    throw new Error('Document is empty or exceeds the supported extraction size.');
  }
  const mime = String(mimeType || '').split(';')[0].trim().toLowerCase();
  if (mime === 'text/plain') {
    const content = buffer.toString('utf8');
    if (content.includes('\ufffd')) throw new Error('Document text encoding is not supported.');
    return normalizeExtractedText(content, maxCharacters);
  }
  if (mime === 'application/pdf') {
    const extract = pdfExtractor || defaultPdfExtractor;
    return normalizeExtractedText(await extract(buffer), maxCharacters);
  }
  if (mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    validateDocxArchive(buffer);
    const extract = docxExtractor || defaultDocxExtractor;
    return normalizeExtractedText(await extract(buffer), maxCharacters);
  }
  throw new Error('Text extraction is not supported for this document type.');
}

async function defaultPdfExtractor(buffer) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    disableFontFace: true,
    isEvalSupported: false,
    stopAtErrors: true,
    useSystemFonts: false,
  });
  let timeout;
  let document;
  try {
    document = await Promise.race([
      task.promise,
      new Promise((_, reject) => {
        timeout = setTimeout(() => reject(new Error('PDF extraction exceeded its processing limit.')), 12_000);
      }),
    ]);
  } catch (error) {
    await task.destroy().catch(() => null);
    throw error;
  } finally {
    clearTimeout(timeout);
  }
  try {
    const pageCount = Math.min(Number(document.numPages || 0), 15);
    const pages = [];
    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      pages.push((content.items || []).map((item) => String(item.str || '')).join(' '));
      page.cleanup?.();
    }
    return pages.join(' ').slice(0, MAX_EXTRACTED_CHARACTERS);
  } finally {
    await document.destroy().catch(() => null);
  }
}

async function defaultDocxExtractor(buffer) {
  const mammoth = require('mammoth');
  const result = await mammoth.extractRawText({ buffer });
  return String(result.value || '').slice(0, MAX_EXTRACTED_CHARACTERS);
}

module.exports = { extractWhatsAppDocumentText, normalizeExtractedText, validateDocxArchive };
