const { initializeApp, getApp, getApps } = require('firebase/app');
const { getAI, getGenerativeModel, GoogleAIBackend } = require('firebase/ai');

const SYSTEM_PROMPT = `You are an AI extraction engine for an education/tutoring app.

You receive images of homework, worksheets, exam papers, textbook exercises, or handwritten school work.

Your job is to extract clean structured educational content.

Tasks:

1. Identify the most likely school subject.
2. Identify topic(s) covered.
3. Extract only the actual questions that the student is expected to answer.
4. Preserve question numbering where visible.
5. If the question is multiple choice, extract the answer options separately.
6. Detect diagrams, tables, graphs, figures, formulas, equations, geometry drawings, or visual elements linked to each question.
7. For each detected visual element, return bounding box coordinates relative to the image/page.
8. Exclude standalone exam/worksheet instructions, section directions, page setup text, headers, footers, marks guidance, timing notes, source labels, watermarks, logos, and copyright text unless that text is directly required to answer a specific question.
9. Keep paragraphs, data, diagrams, tables, images, graphs, captions, or formulas only when they are referred to by, or necessary for, an actual question.
10. Fix obvious OCR/reading errors where context makes the correction clear.
11. Do not invent missing text.
12. If text is unreadable, mark it as unreadable instead of guessing.
13. Return valid JSON only. No markdown. No explanation.`;

const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash';

function getFirebaseAiConfig(overrides = {}) {
  const config = {
    apiKey: overrides.apiKey || overrides.FIREBASE_API_KEY || overrides.VITE_FIREBASE_API_KEY || process.env.FIREBASE_API_KEY || process.env.VITE_FIREBASE_API_KEY,
    authDomain: overrides.authDomain || overrides.FIREBASE_AUTH_DOMAIN || overrides.VITE_FIREBASE_AUTH_DOMAIN || process.env.FIREBASE_AUTH_DOMAIN || process.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: overrides.projectId || overrides.FIREBASE_PROJECT_ID || overrides.VITE_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: overrides.storageBucket || overrides.FIREBASE_STORAGE_BUCKET || overrides.VITE_FIREBASE_STORAGE_BUCKET || process.env.FIREBASE_STORAGE_BUCKET || process.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: overrides.messagingSenderId || overrides.FIREBASE_MESSAGING_SENDER_ID || overrides.VITE_FIREBASE_MESSAGING_SENDER_ID || process.env.FIREBASE_MESSAGING_SENDER_ID || process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: overrides.appId || overrides.FIREBASE_APP_ID || overrides.VITE_FIREBASE_APP_ID || process.env.FIREBASE_APP_ID || process.env.VITE_FIREBASE_APP_ID,
  };

  const missing = ['apiKey', 'projectId', 'appId'].filter((key) => !config[key]);
  if (missing.length) {
    throw new Error(`PARAKLEO_AI_KEYS is missing Firebase AI Logic config field(s): ${missing.join(', ')}`);
  }

  return config;
}

function getFirebaseAiModel(options = {}) {
  const firebaseConfig = getFirebaseAiConfig(options.firebaseConfig || {});
  const appName = `claxi-ai-${firebaseConfig.projectId}`;
  const app = getApps().some((candidate) => candidate.name === appName)
    ? getApp(appName)
    : initializeApp(firebaseConfig, appName);
  const ai = getAI(app, { backend: new GoogleAIBackend() });

  return getGenerativeModel(ai, {
    model: options.model || DEFAULT_GEMINI_MODEL,
    generationConfig: options.generationConfig,
  });
}

function parseAiJson(text = '') {
  const trimmed = String(text || '').trim();
  if (!trimmed) return null;

  const attempts = [
    () => JSON.parse(trimmed),
    () => {
      const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
      return fencedMatch?.[1] ? JSON.parse(fencedMatch[1].trim()) : null;
    },
    () => {
      const objectStart = trimmed.indexOf('{');
      const objectEnd = trimmed.lastIndexOf('}');
      return objectStart >= 0 && objectEnd > objectStart
        ? JSON.parse(trimmed.slice(objectStart, objectEnd + 1))
        : null;
    },
  ];

  for (const attempt of attempts) {
    try {
      const parsed = attempt();
      if (parsed) return parsed;
    } catch (error) {
      // Try the next recovery path.
    }
  }

  return null;
}

function buildExtractionSchema() {
  return {
    type: 'OBJECT',
    properties: {
      subject: { type: 'STRING' },
      subjectConfidence: { type: 'NUMBER' },
      topics: {
        type: 'ARRAY',
        items: { type: 'STRING' },
      },
      estimatedMinutes: { type: 'NUMBER' },
      pages: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: {
            pageNumber: { type: 'NUMBER' },
            sourceImageIndex: { type: 'NUMBER' },
            questions: {
              type: 'ARRAY',
              items: {
                type: 'OBJECT',
                properties: {
                  questionId: { type: 'STRING' },
                  questionNumber: { type: 'STRING' },
                  text: { type: 'STRING' },
                  type: { type: 'STRING', enum: ['open', 'multiple_choice', 'instruction', 'unknown'] },
                  options: {
                    type: 'ARRAY',
                    items: {
                      type: 'OBJECT',
                      properties: {
                        label: { type: 'STRING' },
                        text: { type: 'STRING' },
                      },
                      required: ['label', 'text'],
                    },
                  },
                  marks: { type: 'NUMBER' },
                  confidence: { type: 'NUMBER' },
                  hasVisuals: { type: 'BOOLEAN' },
                  visualRegions: {
                    type: 'ARRAY',
                    items: {
                      type: 'OBJECT',
                      properties: {
                        type: { type: 'STRING', enum: ['diagram', 'table', 'graph', 'figure', 'image', 'formula', 'equation', 'other'] },
                        x: { type: 'NUMBER' },
                        y: { type: 'NUMBER' },
                        width: { type: 'NUMBER' },
                        height: { type: 'NUMBER' },
                        description: { type: 'STRING' },
                      },
                      required: ['type', 'x', 'y', 'width', 'height', 'description'],
                    },
                  },
                  warnings: {
                    type: 'ARRAY',
                    items: { type: 'STRING' },
                  },
                },
                required: ['questionId', 'questionNumber', 'text', 'type', 'options', 'confidence', 'hasVisuals', 'visualRegions', 'warnings'],
              },
            },
          },
          required: ['pageNumber', 'sourceImageIndex', 'questions'],
        },
      },
      warnings: {
        type: 'ARRAY',
        items: { type: 'STRING' },
      },
    },
    required: ['subject', 'subjectConfidence', 'topics', 'estimatedMinutes', 'pages', 'warnings'],
  };
}

function normalizeExtractionResponse(parsedContent) {
  if (!parsedContent || typeof parsedContent !== 'object' || Array.isArray(parsedContent)) {
    return null;
  }

  const normalized = parsedContent;
  normalized.topics = Array.isArray(normalized.topics) ? normalized.topics : [];
  normalized.pages = Array.isArray(normalized.pages) ? normalized.pages : [];
  normalized.warnings = Array.isArray(normalized.warnings) ? normalized.warnings : [];
  if (!normalized.subject) normalized.subject = 'Unknown';

  if (!normalized.estimatedMinutes) {
    let questionCount = 0;
    normalized.pages.forEach((page) => {
      questionCount += Array.isArray(page?.questions) ? page.questions.length : 0;
    });
    normalized.estimatedMinutes = Math.max(10, Math.min(90, 10 + questionCount * 4));
  }

  if (normalized.subjectConfidence) {
    normalized.subjectConfidence = Math.max(0, Math.min(1, normalized.subjectConfidence));
  } else {
    normalized.subjectConfidence = 0;
  }

  normalized.pages.forEach((page) => {
    page.questions = Array.isArray(page.questions) ? page.questions : [];
    page.questions.forEach((question) => {
      question.options = Array.isArray(question.options) ? question.options : [];
      question.visualRegions = Array.isArray(question.visualRegions) ? question.visualRegions : [];
      question.warnings = Array.isArray(question.warnings) ? question.warnings : [];
      const marks = Number(question.marks);
      question.marks = Number.isFinite(marks) ? marks : null;
      question.confidence = Math.max(0, Math.min(1, question.confidence || 0));
    });
  });

  return normalized;
}

async function extractStudentAttachmentWithGemini25Flash({ images, firebaseConfig = {}, model = DEFAULT_GEMINI_MODEL } = {}) {
  if (!Array.isArray(images) || images.length === 0) {
    throw new Error('No images provided for extraction.');
  }

  const request = {
    contents: [{
      role: 'user',
      parts: [
        { text: `${SYSTEM_PROMPT}\n\nExtract the structured content from these pages. Return only actual answerable questions and any directly related paragraphs, data, diagrams, tables, images, graphs, captions, formulas, or equations needed to answer those questions. Do not return general document instructions as questions.` },
        ...images.map((img) => ({
          inlineData: {
            mimeType: img.mimeType || 'image/png',
            data: img.base64,
          },
        })),
      ],
    }],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 8192,
      responseMimeType: 'application/json',
      responseSchema: buildExtractionSchema(),
    },
  };

  const result = await getFirebaseAiModel({
    firebaseConfig,
    model,
    generationConfig: request.generationConfig,
  }).generateContent(request.contents[0].parts);

  const outputText = result.response.text();
  const parsedContent = normalizeExtractionResponse(parseAiJson(outputText));
  if (!parsedContent) {
    throw new Error('Gemini returned invalid extraction output.');
  }

  return {
    parsedContent,
    rawOutput: outputText,
    usage: result.response.usageMetadata || null,
  };
}

module.exports = { extractStudentAttachmentWithGemini25Flash };
