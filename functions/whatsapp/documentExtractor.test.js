'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { extractWhatsAppDocumentText, normalizeExtractedText, validateDocxArchive } = require('./documentExtractor');

function minimalDocx() {
  const name = Buffer.from('word/document.xml');
  const content = Buffer.from('<doc/>');
  const local = Buffer.alloc(30 + name.length + content.length);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt32LE(content.length, 18);
  local.writeUInt32LE(content.length, 22);
  local.writeUInt16LE(name.length, 26);
  name.copy(local, 30);
  content.copy(local, 30 + name.length);
  const central = Buffer.alloc(46 + name.length);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt32LE(content.length, 20);
  central.writeUInt32LE(content.length, 24);
  central.writeUInt16LE(name.length, 28);
  name.copy(central, 46);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length, 12);
  end.writeUInt32LE(local.length, 16);
  return Buffer.concat([local, central, end]);
}

test('plain text extraction bounds content and strips control characters', async () => {
  const result = await extractWhatsAppDocumentText({
    buffer: Buffer.from('Service details\u0000\nplease clean the lounge'),
    mimeType: 'text/plain',
  });
  assert.equal(result, 'Service details please clean the lounge');
  assert.equal(normalizeExtractedText('x'.repeat(9000)).length, 8000);
});

test('PDF and DOCX adapters extract only bounded text without requiring a live provider', async () => {
  const pdf = await extractWhatsAppDocumentText({
    buffer: Buffer.from('%PDF-test'), mimeType: 'application/pdf',
    pdfExtractor: async () => 'Quoted text from PDF',
  });
  const docx = await extractWhatsAppDocumentText({
    buffer: minimalDocx(), mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    docxExtractor: async () => 'Extracted DOCX text',
  });
  assert.equal(pdf, 'Quoted text from PDF');
  assert.equal(docx, 'Extracted DOCX text');
});

test('PDF parser extracts text from a locally generated fixture without external calls', async () => {
  const PDFDocument = require('pdfkit');
  const document = new PDFDocument();
  const chunks = [];
  const complete = new Promise((resolve, reject) => {
    document.on('data', (chunk) => chunks.push(chunk));
    document.on('end', () => resolve(Buffer.concat(chunks)));
    document.on('error', reject);
  });
  document.text('Uncedo local PDF extraction fixture');
  document.end();
  const extracted = await extractWhatsAppDocumentText({ buffer: await complete, mimeType: 'application/pdf' });
  assert.match(extracted, /Uncedo local PDF extraction fixture/);
});

test('unsupported formats, invalid UTF-8 and oversized documents fail closed', async () => {
  await assert.rejects(extractWhatsAppDocumentText({ buffer: Buffer.from('x'), mimeType: 'application/msword' }), /not supported/);
  await assert.rejects(extractWhatsAppDocumentText({ buffer: Buffer.from([0xff]), mimeType: 'text/plain' }), /encoding/);
  await assert.rejects(extractWhatsAppDocumentText({ buffer: Buffer.alloc(10 * 1024 * 1024 + 1), mimeType: 'text/plain' }), /exceeds/);
  assert.throws(() => validateDocxArchive(Buffer.from('PK\u0003\u0004not a docx')), /malformed/);
});
