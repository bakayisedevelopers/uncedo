'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildAskSystemInstruction,
  buildServiceCatalogContext,
  runServiceCatalogAskAi,
  sanitizeChatHistory,
} = require('./serviceCatalogAskAi');

test('buildServiceCatalogContext formats service option pricing, sibling options, and intake prompts', () => {
  const ctx = buildServiceCatalogContext({
    serviceId: 'hair_braids',
    optionId: 'knotless',
    catalogEntry: {
      label: 'Hair Braiding',
      categoryName: 'Beauty',
      description: 'Neatly parted protective styles done at your home.',
      pricing: {
        basePrice: 250,
        travelFee: 40,
        minimumTotal: 290,
        maximumTotal: 650,
        pricingMode: 'fixed',
      },
      options: [
        {
          id: 'knotless',
          title: 'Knotless Braids',
          description: 'Lightweight, tension-free medium knotless braids.',
          price: 350,
          selectedQuestionIds: ['hair_length'],
        },
        {
          id: 'box_braids',
          title: 'Box Braids',
          price: 300,
        },
      ],
      questionDefinitions: [
        {
          id: 'hair_length',
          type: 'option-specific',
          prompt: 'What braid length would you like?',
          options: [
            { value: 'shoulder', label: 'Shoulder length', priceAdder: 0 },
            { value: 'waist', label: 'Waist length', priceAdder: 120 },
          ],
        },
        { id: 'other_q', type: 'option-specific', prompt: 'Unrelated question' },
      ],
    },
  });

  assert.equal(ctx.selectedTitle, 'Knotless Braids');
  assert.equal(ctx.serviceTitle, 'Hair Braiding');
  assert.equal(ctx.selectedPrice, 'R350');
  assert.match(ctx.pricingDetails.join('; '), /Travel fee: R40/);
  assert.deepEqual(ctx.otherOptions, ['Box Braids (R300)']);
  assert.deepEqual(ctx.bookingQuestions, [
    'What braid length would you like? [Choices: Shoulder length, Waist length (+R120)]',
  ]);

  const prompt = buildAskSystemInstruction(ctx);
  assert.match(prompt, /Knotless Braids/);
  assert.match(prompt, /6-digit Arrival PIN/);
});

test('sanitizeChatHistory trims invalid entries and keeps last 10 turns', () => {
  const longHistory = Array.from({ length: 14 }, (_, idx) => ({
    role: idx % 2 === 0 ? 'user' : 'assistant',
    text: `Message ${idx + 1}`,
  }));
  const cleaned = sanitizeChatHistory([...longHistory, { role: 'user', text: '   ' }]);
  assert.equal(cleaned.length, 10);
  assert.equal(cleaned[0].text, 'Message 5');
  assert.equal(cleaned[9].text, 'Message 14');
});

test('runServiceCatalogAskAi uses OpenAI primary and falls back to Vertex Gemini seamlessly', async () => {
  let capturedGeminiContents = null;
  const geminiResult = await runServiceCatalogAskAi({
    serviceId: 'cleaning',
    optionTitle: 'Deep Kitchen Clean',
    priceLabel: 'From R280',
    message: 'Do helpers bring their own supplies?',
    history: [
      { role: 'assistant', text: 'Welcome!' },
      { role: 'user', text: 'Hi' },
      { role: 'user', text: 'Can I book today?' },
      { role: 'assistant', text: 'Yes, you can!' },
    ],
    openAiApiKey: 'test-key',
    geminiProjectId: 'bakayise-uncedo-latest',
    openAiFetchImpl: async () => ({
      ok: false,
      status: 503,
      json: async () => ({ error: { message: 'Temporary error' } }),
    }),
    geminiClient: {
      models: {
        generateContent: async ({ contents }) => {
          capturedGeminiContents = contents;
          return {
            text: 'Yes, you can specify whether cleaning supplies are needed when booking on WhatsApp.',
          };
        },
      },
    },
  });

  assert.equal(geminiResult.provider, 'gemini');
  assert.equal(geminiResult.fallbackReason, 'openai_http_503');
  assert.match(geminiResult.reply, /cleaning supplies/i);
  assert.equal(capturedGeminiContents[0].role, 'user');
  assert.equal(capturedGeminiContents[0].parts.length, 2);
});

test('runServiceCatalogAskAi validates non-empty messages', async () => {
  await assert.rejects(
    () => runServiceCatalogAskAi({ message: '   ', geminiProjectId: 'demo-proj' }),
    { code: 'missing_message' },
  );
});
