'use strict';

const {
  createVertexGeminiClient,
  generateVertexGeminiContent,
  geminiResponseText,
} = require('./whatsapp/vertexGemini');

const MAX_MESSAGE_CHARS = 1000;
const MAX_HISTORY_TURNS = 10;
const MAX_HISTORY_TEXT_CHARS = 600;

function cleanText(value, maxLen = 500) {
  return String(value || '')
    .replace(/\r\n/g, '\n')
    .replace(/\u0000/g, '')
    .trim()
    .slice(0, maxLen);
}

function sanitizeChatHistory(history) {
  if (!Array.isArray(history)) return [];
  return history
    .map((turn) => {
      if (!turn || typeof turn !== 'object') return null;
      const role = turn.role === 'assistant' ? 'assistant' : 'user';
      const text = cleanText(turn.text, MAX_HISTORY_TEXT_CHARS);
      if (!text) return null;
      return { role, text };
    })
    .filter(Boolean)
    .slice(-MAX_HISTORY_TURNS);
}

function formatZar(amount) {
  const num = Number(amount);
  if (!Number.isFinite(num) || num <= 0) return '';
  return `R${Math.round(num)}`;
}

function buildServiceCatalogContext({
  catalogEntry = null,
  serviceId = '',
  optionId = '',
  optionTitle = '',
  categoryName = '',
  priceLabel = '',
} = {}) {
  const entry = catalogEntry && typeof catalogEntry === 'object' ? catalogEntry : null;
  const serviceTitle = cleanText(entry?.label || entry?.serviceName || serviceId, 120);
  const category = cleanText(entry?.categoryName || categoryName || entry?.categoryId, 80);
  const serviceDesc = cleanText(entry?.description, 600);
  const options = Array.isArray(entry?.options) ? entry.options : [];

  const normOptId = cleanText(optionId, 120).toLowerCase();
  const normOptTitle = cleanText(optionTitle, 120).toLowerCase();

  const matchedOption = options.find((opt) => {
    const idMatch = normOptId && cleanText(opt?.id, 120).toLowerCase() === normOptId;
    const titleMatch = normOptTitle && cleanText(opt?.title || opt?.label, 120).toLowerCase() === normOptTitle;
    return idMatch || titleMatch;
  }) || null;

  const selectedTitle = cleanText(matchedOption?.title || matchedOption?.label || optionTitle || serviceTitle, 140);
  const selectedDesc = cleanText(matchedOption?.description || serviceDesc, 600);
  const selectedPriceNum = Number(matchedOption?.price ?? matchedOption?.priceAdder ?? entry?.pricing?.basePrice ?? 0);
  const selectedPrice = formatZar(selectedPriceNum) || cleanText(priceLabel, 60) || 'Quote in WhatsApp';

  const pricing = entry?.pricing && typeof entry.pricing === 'object' ? entry.pricing : {};
  const pricingDetails = [
    formatZar(pricing.basePrice) ? `Base price: ${formatZar(pricing.basePrice)}` : '',
    formatZar(pricing.travelFee) ? `Travel fee: ${formatZar(pricing.travelFee)}` : '',
    formatZar(pricing.minimumTotal) ? `Typical minimum: ${formatZar(pricing.minimumTotal)}` : '',
    formatZar(pricing.maximumTotal) ? `Typical maximum: ${formatZar(pricing.maximumTotal)}` : '',
    pricing.pricingMode ? `Pricing mode: ${cleanText(pricing.pricingMode, 40)}` : '',
  ].filter(Boolean);

  const otherOptions = options
    .filter((opt) => opt !== matchedOption)
    .slice(0, 8)
    .map((opt) => {
      const title = cleanText(opt?.title || opt?.label, 100);
      const price = formatZar(opt?.price ?? opt?.priceAdder);
      return title ? `${title}${price ? ` (${price})` : ''}` : '';
    })
    .filter(Boolean);

  const rawQuestions = Array.isArray(entry?.questionDefinitions)
    ? entry.questionDefinitions
    : Array.isArray(entry?.questions)
      ? entry.questions
      : [];
  const requiresNoOptionSpecific = Boolean(matchedOption?.requiresNoOptionSpecificQuestions);
  const selectedQuestionIds = new Set(
    Array.isArray(matchedOption?.selectedQuestionIds) ? matchedOption.selectedQuestionIds : [],
  );
  const bookingQuestions = rawQuestions
    .filter((q) => {
      if (!q || typeof q !== 'object') return false;
      if (requiresNoOptionSpecific) return q.type === 'standard';
      if (!selectedQuestionIds.size) return true;
      return q.type === 'standard' || selectedQuestionIds.has(q.id);
    })
    .slice(0, 6)
    .map((q) => {
      const prompt = cleanText(q.prompt || q.label, 140);
      if (!prompt) return '';
      const qOpts = Array.isArray(q.options)
        ? q.options
          .slice(0, 6)
          .map((opt) => {
            const optLabel = cleanText(opt?.label || opt?.value, 60);
            const adder = formatZar(opt?.priceAdder);
            return optLabel ? `${optLabel}${adder ? ` (+${adder})` : ''}` : '';
          })
          .filter(Boolean)
        : [];
      return qOpts.length ? `${prompt} [Choices: ${qOpts.join(', ')}]` : prompt;
    })
    .filter(Boolean);

  return {
    selectedTitle: selectedTitle || 'Uncedo Service',
    serviceTitle,
    category: category || 'Service',
    selectedPrice,
    selectedDesc,
    serviceDesc,
    pricingDetails,
    otherOptions,
    bookingQuestions,
  };
}

function buildAskSystemInstruction(context) {
  const lines = [
    'You are Uncedo’s friendly customer service specialist helping a visitor browsing a service on the Uncedo website.',
    'Answer their questions clearly, accurately, and concisely in warm everyday South African English (2-4 short sentences or brief bullets when listing details).',
    'Never mention AI, chatbots, prompts, language models, database paths, or internal identifiers.',
    'Stay strictly grounded in the service details and platform facts below. If an exact detail (like final distance travel cost or a specific customization) depends on their booking specifics, tell them clearly and invite them to tap "Book on WhatsApp" to confirm with a helper.',
    '',
    'Selected Service Option:',
    `- Option: ${context.selectedTitle}`,
    context.serviceTitle && context.serviceTitle.toLowerCase() !== context.selectedTitle.toLowerCase()
      ? `- Parent Service: ${context.serviceTitle}`
      : '',
    `- Category: ${context.category}`,
    `- Displayed Price: ${context.selectedPrice}`,
    context.selectedDesc ? `- Description: ${context.selectedDesc}` : '',
    context.serviceDesc && context.serviceDesc !== context.selectedDesc
      ? `- Service Overview: ${context.serviceDesc}`
      : '',
    context.pricingDetails.length ? `- Pricing Breakdown: ${context.pricingDetails.join('; ')}` : '',
    context.otherOptions.length ? `- Other Options in this Service: ${context.otherOptions.join(', ')}` : '',
    context.bookingQuestions.length
      ? `- Details Usually Asked When Booking: ${context.bookingQuestions.join(' | ')}`
      : '',
    '',
    'Uncedo Platform Facts:',
    '- Booking happens directly on WhatsApp (+27 60 523 9926) via the "Book on WhatsApp" button—no website account or sign-up is needed.',
    '- Customers can use a saved home address, current location, or provide another street address in chat.',
    '- Helpers are vetted (including verification and police clearance review) and customers receive a 6-digit Arrival PIN to confirm safe start of work.',
    '- First 2 minutes of helper waiting time after arrival are free; extra waiting time is R1/min.',
    '- Payment is via Cash or a secure hosted Paystack checkout link sent in WhatsApp (never share card numbers in chat).',
  ];

  return lines.filter((line) => line !== '').join('\n');
}

function buildConversationTranscriptPrompt(history, latestMessage) {
  const lines = [];
  if (history.length) {
    lines.push('Conversation so far:');
    history.forEach((turn) => {
      lines.push(`${turn.role === 'assistant' ? 'Uncedo' : 'Customer'}: ${turn.text}`);
    });
    lines.push('');
  }
  lines.push(`Customer: ${latestMessage}`);
  lines.push('Uncedo:');
  return lines.join('\n');
}

function buildGeminiContents(history, message) {
  const raw = [
    ...history.map((turn) => ({
      role: turn.role === 'assistant' ? 'model' : 'user',
      text: turn.text,
    })),
    { role: 'user', text: message },
  ];

  // Drop any leading model-only turns so conversation always starts with user
  while (raw.length > 1 && raw[0].role !== 'user') {
    raw.shift();
  }

  const contents = [];
  for (const turn of raw) {
    const prev = contents[contents.length - 1];
    if (prev && prev.role === turn.role) {
      prev.parts.push({ text: turn.text });
    } else {
      contents.push({ role: turn.role, parts: [{ text: turn.text }] });
    }
  }
  return contents;
}

async function callOpenAiChat({
  apiKey,
  model = 'gpt-6-luna',
  systemInstruction,
  history,
  message,
  fetchImpl = fetch,
}) {
  const input = [
    { role: 'system', content: [{ type: 'input_text', text: systemInstruction }] },
    ...history.map((turn) => ({
      role: turn.role,
      content: [{ type: turn.role === 'assistant' ? 'output_text' : 'input_text', text: turn.text }],
    })),
    { role: 'user', content: [{ type: 'input_text', text: message }] },
  ];

  const response = await fetchImpl('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      input,
      max_output_tokens: 450,
    }),
    signal: AbortSignal.timeout(15_000),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const err = new Error(payload?.error?.message || `OpenAI request failed (${response.status}).`);
    err.code = `openai_http_${response.status}`;
    throw err;
  }

  const text = cleanText(
    payload?.output_text
      || (Array.isArray(payload?.output) ? payload.output : [])
        .flatMap((item) => (Array.isArray(item?.content) ? item.content : []))
        .filter((item) => item?.type === 'output_text')
        .map((item) => String(item.text || ''))
        .join(''),
    1600,
  );
  if (!text) {
    const err = new Error('OpenAI returned an empty reply.');
    err.code = 'openai_empty_response';
    throw err;
  }

  return { reply: text, provider: 'openai', model };
}

async function callVertexGeminiChat({
  projectId,
  location = 'global',
  model = 'gemini-3.5-flash-lite',
  systemInstruction,
  history,
  message,
  clientFactory = createVertexGeminiClient,
  client,
}) {
  const geminiClient = client || clientFactory({ projectId, location, timeoutMs: 15_000 });
  const contents = buildGeminiContents(history, message);

  const response = await generateVertexGeminiContent({
    client: geminiClient,
    model,
    contents,
    config: {
      systemInstruction,
      maxOutputTokens: 500,
    },
  });

  const text = cleanText(geminiResponseText(response), 1600);
  if (!text) {
    const err = new Error('Gemini returned an empty reply.');
    err.code = 'gemini_empty_response';
    throw err;
  }

  return { reply: text, provider: 'gemini', model };
}

async function runServiceCatalogAskAi({
  catalogEntry = null,
  serviceId = '',
  optionId = '',
  optionTitle = '',
  categoryName = '',
  priceLabel = '',
  message = '',
  history = [],
  openAiApiKey = '',
  openAiModel = 'gpt-6-luna',
  geminiProjectId = '',
  geminiLocation = 'global',
  geminiModel = 'gemini-3.5-flash-lite',
  openAiFetchImpl = fetch,
  geminiClientFactory = createVertexGeminiClient,
  geminiClient,
} = {}) {
  const cleanMessage = cleanText(message, MAX_MESSAGE_CHARS);
  if (!cleanMessage) {
    const error = new Error('Please enter a question before sending.');
    error.code = 'missing_message';
    throw error;
  }

  const sanitizedHistory = sanitizeChatHistory(history);
  const context = buildServiceCatalogContext({
    catalogEntry,
    serviceId,
    optionId,
    optionTitle,
    categoryName,
    priceLabel,
  });
  const systemInstruction = buildAskSystemInstruction(context);

  const hasOpenAi = Boolean(cleanText(openAiApiKey, 300));
  const hasGemini = Boolean(cleanText(geminiProjectId, 120) || geminiClient);

  if (!hasOpenAi && !hasGemini) {
    const error = new Error('AI assistant configuration is not available right now.');
    error.code = 'ai_not_configured';
    throw error;
  }

  let primaryError = null;
  if (hasOpenAi) {
    try {
      const result = await callOpenAiChat({
        apiKey: cleanText(openAiApiKey, 300),
        model: cleanText(openAiModel, 100) || 'gpt-6-luna',
        systemInstruction,
        history: sanitizedHistory,
        message: cleanMessage,
        fetchImpl: openAiFetchImpl,
      });
      return {
        ...result,
        serviceTitle: context.selectedTitle,
      };
    } catch (err) {
      primaryError = err;
      if (!hasGemini) throw err;
    }
  }

  try {
    const result = await callVertexGeminiChat({
      projectId: cleanText(geminiProjectId, 120),
      location: cleanText(geminiLocation, 80) || 'global',
      model: cleanText(geminiModel, 100) || 'gemini-3.5-flash-lite',
      systemInstruction,
      history: sanitizedHistory,
      message: cleanMessage,
      clientFactory: geminiClientFactory,
      client: geminiClient,
    });
    return {
      ...result,
      serviceTitle: context.selectedTitle,
      fallbackReason: primaryError ? String(primaryError.code || 'primary_failed') : undefined,
    };
  } catch (fallbackError) {
    if (primaryError) {
      const combined = new Error('Service assistant is temporarily unavailable. Please try again shortly.');
      combined.code = `ai_providers_failed:${String(primaryError.code || 'openai')}:${String(fallbackError.code || 'gemini')}`;
      throw combined;
    }
    throw fallbackError;
  }
}

module.exports = {
  buildAskSystemInstruction,
  buildConversationTranscriptPrompt,
  buildServiceCatalogContext,
  runServiceCatalogAskAi,
  sanitizeChatHistory,
};
