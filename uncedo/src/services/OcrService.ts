export interface OcrTextBlock {
  text: string;
  confidence: number;
  boundingBox?: { left: number; top: number; width: number; height: number };
}

export interface OcrResult {
  text: string;
  blocks: OcrTextBlock[];
  method: 'browser-native' | 'react-native-native-ocr';
}

function normalizeText(raw: string): string {
  return String(raw || '').replace(/\s+/g, ' ').trim();
}

function sortByGeometry(blocks: OcrTextBlock[]): OcrTextBlock[] {
  return [...blocks].sort((a, b) => {
    const ay = a.boundingBox?.top ?? 0;
    const by = b.boundingBox?.top ?? 0;
    if (Math.abs(ay - by) > 8) return ay - by;
    const ax = a.boundingBox?.left ?? 0;
    const bx = b.boundingBox?.left ?? 0;
    return ax - bx;
  });
}

export async function extractTextWeb(file: File): Promise<OcrResult> {
  if (!file) throw new Error('No file provided for web OCR extraction.');

  const raw = await file.text();
  const cleaned = normalizeText(raw);

  if (!cleaned) {
    throw new Error('No readable text found in file. Upload a clearer image/document or add typed text.');
  }

  return {
    text: cleaned,
    blocks: [{ text: cleaned, confidence: 0.99 }],
    method: 'browser-native',
  };
}

export async function extractTextReactNative(imagePath: string): Promise<OcrResult> {
  if (!imagePath || typeof imagePath !== 'string') {
    throw new Error('No image path provided for mobile OCR extraction.');
  }

  let recognizer: { recognize: (path: string) => Promise<string[]> } | null = null;

  try {
    const moduleAny = await import('@dariyd/react-native-text-recognition');
    recognizer = {
      recognize: async (path: string) => {
        const lines = await moduleAny.default.recognize(path);
        return Array.isArray(lines) ? lines.map((line: unknown) => String(line || '')) : [];
      },
    };
  } catch (_error) {
    const moduleAny = await import('react-native-ml-kit/text-recognition');
    recognizer = {
      recognize: async (path: string) => {
        const payload = await moduleAny.default.recognize(path);
        const blocks = Array.isArray(payload?.blocks) ? payload.blocks : [];
        return blocks.map((block: { text?: string }) => String(block?.text || ''));
      },
    };
  }

  if (!recognizer) throw new Error('No local OCR bridge available on this React Native build.');

  const rawLines = await recognizer.recognize(imagePath);
  const blocks = rawLines
    .map((line) => normalizeText(line))
    .filter(Boolean)
    .map((text) => ({ text, confidence: 0.9 }));

  const ordered = sortByGeometry(blocks);
  const text = normalizeText(ordered.map((entry) => entry.text).join('\n'));

  if (!text) {
    throw new Error('No readable text detected by local OCR. Capture a clearer image and retry.');
  }

  return {
    text,
    blocks: ordered,
    method: 'react-native-native-ocr',
  };
}

