const { GoogleGenAI } = require('@google/genai');

const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash';
const PRICING_REFERENCE = {
  billingModel: 'gemini-2.5-flash',
  pricingAsOf: '2026-06-16',
  pricingUrl: 'https://cloud.google.com/gemini-enterprise-agent-platform/generative-ai/pricing',
  usdToZarRate: 16.2489,
  inputTextUsdPerMillion: 0.3,
  outputTextUsdPerMillion: 2.5,
};

const CUSTOMER_SYSTEM_INSTRUCTION = [
  'You are the Uncedo customer service request voice assistant.',
  'This is a simple turn-based phone conversation.',
  'Be brief, natural, and clear.',
  'Ask only one follow-up question at a time.',
  'All your spoken questions and responses must sound natural, conversational, and friendly, using standard English grammar.',
  'You must use appropriate English sentence contractions (e.g. "I\'m", "we\'re", "you\'d", "what\'s", "let\'s", "isn\'t", "don\'t") to sound like a natural human voice assistant.',
  'First identify exactly one category and then at least one service inside that category.',
  'Use only the category ids, service ids, and question ids provided in the prompt context.',
  'Do not invent categories, services, or question ids.',
  'Collect required details before optional details.',
  'Do not calculate prices yourself.',
  'When the app sends a quote, explain it clearly and ask the customer to approve or decline.',
].join(' ');

function clip(value, max = 6000) {
  const text = String(value || '').trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max)}...`;
}

function roundMoney(value) {
  return Math.round(Number(value || 0) * 10000) / 10000;
}

function roundCurrency(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function computeUsageSummary(usageMetadata = null) {
  if (!usageMetadata || typeof usageMetadata !== 'object') return null;
  const promptTokenCount = Number(usageMetadata.promptTokenCount || 0);
  const responseTokenCount = Number(
    usageMetadata.candidatesTokenCount
    ?? usageMetadata.responseTokenCount
    ?? 0,
  );
  const totalTokenCount = Number(usageMetadata.totalTokenCount || (promptTokenCount + responseTokenCount));
  const inputCostUsd = roundMoney((promptTokenCount / 1000000) * PRICING_REFERENCE.inputTextUsdPerMillion);
  const outputCostUsd = roundMoney((responseTokenCount / 1000000) * PRICING_REFERENCE.outputTextUsdPerMillion);
  const totalCostUsd = roundMoney(inputCostUsd + outputCostUsd);
  return {
    liveModel: DEFAULT_GEMINI_MODEL,
    pricingReferenceModel: PRICING_REFERENCE.billingModel,
    pricingUrl: PRICING_REFERENCE.pricingUrl,
    pricingAsOf: PRICING_REFERENCE.pricingAsOf,
    usdToZarRate: PRICING_REFERENCE.usdToZarRate,
    currency: 'ZAR',
    promptTokenCount,
    responseTokenCount,
    totalTokenCount,
    inputCostUsd,
    outputCostUsd,
    totalCostUsd,
    totalCostZar: roundCurrency(totalCostUsd * PRICING_REFERENCE.usdToZarRate),
    updatedAtMs: Date.now(),
  };
}

function buildConversationSummary(conversation = []) {
  return (Array.isArray(conversation) ? conversation : [])
    .slice(-12)
    .map((turn, index) => `${index + 1}. ${String(turn?.role || 'unknown')}: ${clip(turn?.text || '', 220)}`)
    .join('\n');
}

function buildGreetingPrompt({ customerName = '' } = {}) {
  return [
    'Start the call now.',
    `Greet ${clip(customerName || 'the customer', 120)} by first name.`,
    'Introduce yourself as Uncedo.',
    'Ask what help they need today.',
    'Keep it short.',
    'Return plain text only.',
  ].join(' ');
}

function buildJsonTurnPrompt({
  customerName = '',
  requestState = {},
  serviceCatalog = [],
  questionPlan = {},
  conversation = [],
  customerText = '',
  appInstruction = '',
} = {}) {
  const heading = customerText ? 'CUSTOMER TURN' : 'APP INSTRUCTION TURN';
  const latestInstruction = customerText
    ? `Customer said: ${clip(customerText, 1800)}`
    : `App instruction: ${clip(appInstruction, 1800)}`;

  return [
    heading,
    `Customer name: ${clip(customerName || 'Customer', 120)}`,
    `Current request state: ${clip(JSON.stringify(requestState || {}), 3200)}`,
    `Service catalog: ${clip(JSON.stringify(serviceCatalog || []), 7000)}`,
    `Question plan: ${clip(JSON.stringify(questionPlan || {}), 7000)}`,
    `Recent conversation:\n${buildConversationSummary(conversation) || '(none)'}`,
    latestInstruction,
    'Return compact JSON only in this exact shape:',
    '{"speak":"...","status":"collecting|ready_to_search","correctedCustomerText":"...","requestDraft":{"categoryId":"","serviceIds":[],"requiredAnswers":{},"optionalAnswers":{},"missingRequired":[],"selectedPortfolioReferences":[],"safetyFlags":[]},"selectionRequest":{"type":"service_selection|reference_upload|none","prompt":"..."}}',
    'The speak field must be natural spoken text for the customer.',
    'The correctedCustomerText field must contain a grammatically correct, punctuated version of the raw customerText (from CUSTOMER TURN) using natural sentence contractions (e.g. "I\'m", "don\'t", "can\'t", "what\'s") while keeping the meaning exactly identical. If it is an app instruction turn, leave this field as an empty string.',
  ].join('\n\n');
}

function parseAiPayload(text = '') {
  const raw = String(text || '').trim();
  if (!raw) {
    return {
      speak: '',
      status: '',
      correctedCustomerText: '',
      requestDraft: null,
      selectionRequest: null,
    };
  }

  const parse = (candidate) => {
    const parsed = JSON.parse(candidate);
    return {
      speak: String(parsed?.speak || ''),
      status: String(parsed?.status || '').trim().toLowerCase(),
      correctedCustomerText: String(parsed?.correctedCustomerText || ''),
      requestDraft: parsed?.requestDraft && typeof parsed.requestDraft === 'object' ? parsed.requestDraft : null,
      selectionRequest: parsed?.selectionRequest && typeof parsed.selectionRequest === 'object' ? parsed.selectionRequest : null,
    };
  };

  try {
    return parse(raw);
  } catch {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return parse(raw.slice(start, end + 1));
      } catch {}
    }
  }

  return {
    speak: raw,
    status: '',
    correctedCustomerText: '',
    requestDraft: null,
    selectionRequest: null,
  };
}

let vertexAiClient = null;
let vertexAiClientKey = '';

function getVertexAiConfig(overrides = {}) {
  const config = {
    projectId: overrides.projectId
      || overrides.FIREBASE_PROJECT_ID
      || overrides.VITE_FIREBASE_PROJECT_ID
      || overrides.GOOGLE_CLOUD_PROJECT
      || process.env.GOOGLE_CLOUD_PROJECT
      || process.env.GCLOUD_PROJECT
      || process.env.FIREBASE_PROJECT_ID
      || process.env.VITE_FIREBASE_PROJECT_ID,
    location: overrides.location
      || overrides.GOOGLE_CLOUD_LOCATION
      || overrides.VERTEX_AI_LOCATION
      || overrides.FIREBASE_AI_LOCATION
      || process.env.GOOGLE_CLOUD_LOCATION
      || process.env.VERTEX_AI_LOCATION
      || process.env.FIREBASE_AI_LOCATION
      || 'us-central1',
  };

  const missing = ['projectId'].filter((key) => !config[key]);
  if (missing.length) {
    throw new Error(`UNCEDO_AI_KEYS is missing Vertex AI config field(s): ${missing.join(', ')}`);
  }

  return config;
}

function getVertexAiClient(options = {}) {
  const config = getVertexAiConfig(options.firebaseConfig || {});
  const clientKey = `${config.projectId}:${config.location}`;
  if (!vertexAiClient || vertexAiClientKey !== clientKey) {
    vertexAiClient = new GoogleGenAI({
      vertexai: true,
      project: config.projectId,
      location: config.location,
    });
    vertexAiClientKey = clientKey;
  }

  return vertexAiClient;
}

async function generateCustomerServiceAiTurn({
  firebaseConfig = {},
  customerName = '',
  requestState = {},
  serviceCatalog = [],
  questionPlan = {},
  conversation = [],
  customerText = '',
  appInstruction = '',
} = {}) {
  const isGreeting = !customerText && !appInstruction;
  const promptText = isGreeting
    ? buildGreetingPrompt({ customerName })
    : buildJsonTurnPrompt({
      customerName,
      requestState,
      serviceCatalog,
      questionPlan,
      conversation,
      customerText,
      appInstruction,
    });
  const responseMimeType = isGreeting ? '' : 'application/json';
  const generationConfig = {
    temperature: isGreeting ? 0.4 : 0.2,
    maxOutputTokens: isGreeting ? 512 : 1400,
    ...(responseMimeType ? { responseMimeType } : {}),
  };

  const ai = getVertexAiClient({ firebaseConfig });
  const result = await ai.models.generateContent({
    model: firebaseConfig.GEMINI_MODEL || firebaseConfig.FIREBASE_AI_MODEL || DEFAULT_GEMINI_MODEL,
    contents: [{ role: 'user', parts: [{ text: promptText }] }],
    config: {
      systemInstruction: CUSTOMER_SYSTEM_INSTRUCTION,
      temperature: generationConfig.temperature,
      maxOutputTokens: generationConfig.maxOutputTokens,
      ...(responseMimeType ? { responseMimeType } : {}),
    },
  });

  const rawOutput = String(result?.text || '').trim();
  const usageSummary = computeUsageSummary(result?.usageMetadata || null);

  if (isGreeting) {
    return {
      speak: rawOutput,
      status: 'collecting',
      requestDraft: null,
      selectionRequest: null,
      usageSummary,
      rawOutput,
    };
  }

  const parsed = parseAiPayload(rawOutput);
  return {
    ...parsed,
    speak: String(parsed.speak || rawOutput).trim(),
    correctedCustomerText: String(parsed.correctedCustomerText || '').trim(),
    usageSummary,
    rawOutput,
  };
}

module.exports = {
  generateCustomerServiceAiTurn,
  parseAiPayload,
  buildGreetingPrompt,
  buildJsonTurnPrompt,
};
