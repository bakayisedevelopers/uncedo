'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  DEFAULT_IMAGE_MODEL,
  buildOptionImagePrompt,
  extractGeneratedImagePart,
  generateAdminOptionImage,
  isAllowedRemoteReferenceUrl,
  parseDataUrl,
} = require('./adminAiServiceImage');

test('parseDataUrl and isAllowedRemoteReferenceUrl validate reference images safely', () => {
  const valid = parseDataUrl('data:image/png;base64,iVBORw0KGgo=');
  assert.deepEqual(valid, {
    inlineData: {
      mimeType: 'image/png',
      data: 'iVBORw0KGgo=',
    },
  });

  assert.equal(parseDataUrl('data:text/plain;base64,aGVsbG8='), null);
  assert.equal(isAllowedRemoteReferenceUrl('https://firebasestorage.googleapis.com/v0/b/app/o/sample.jpg'), true);
  assert.equal(isAllowedRemoteReferenceUrl('https://storage.googleapis.com/bucket/sample.jpg'), true);
  assert.equal(isAllowedRemoteReferenceUrl('https://example.com/evil.jpg'), false);
  assert.equal(isAllowedRemoteReferenceUrl('http://firebasestorage.googleapis.com/insecure.jpg'), false);
});

test('buildOptionImagePrompt builds strict consistency edit prompts vs unique scene prompts', () => {
  const editPrompt = buildOptionImagePrompt({
    targetType: 'question_option',
    consistencyMode: 'consistent',
    serviceContext: { label: 'Manicure', categoryName: 'Beauty', description: 'Professional mobile manicure' },
    questionContext: {
      prompt: 'What color of manicure do you want?',
      optionLabel: 'Ruby Red',
      siblingOptionLabels: ['French Tip', 'Ruby Red', 'Gloss Black'],
    },
    hasReferenceImage: true,
  });

  assert.match(editPrompt, /STRICT CONSISTENCY IMAGE EDIT/i);
  assert.match(editPrompt, /EXACT SAME person/i);
  assert.match(editPrompt, /Ruby Red/);
  assert.match(editPrompt, /What color of manicure do you want\?/);

  const uniquePrompt = buildOptionImagePrompt({
    targetType: 'question_option',
    consistencyMode: 'unique',
    serviceContext: { label: 'Dishwashing', categoryName: 'Cleaning' },
    questionContext: {
      prompt: 'Is this dishwashing for a household or an event?',
      optionLabel: 'Event & Function',
      siblingOptionLabels: ['Household', 'Event & Function'],
    },
    hasReferenceImage: false,
  });

  assert.match(uniquePrompt, /Event & Function/);
  assert.doesNotMatch(uniquePrompt, /STRICT CONSISTENCY IMAGE EDIT/i);
});

test('extractGeneratedImagePart scans all parts and extracts inlineData image', () => {
  const extracted = extractGeneratedImagePart({
    candidates: [
      {
        content: {
          parts: [
            { text: 'Here is your generated image.' },
            { inlineData: { mimeType: 'image/png', data: 'abc123==' } },
          ],
        },
      },
    ],
  });

  assert.deepEqual(extracted, {
    mimeType: 'image/png',
    data: 'abc123==',
    imageDataUrl: 'data:image/png;base64,abc123==',
  });
});

test('generateAdminOptionImage uses gemini-3.1-flash-lite-image, forwards reference image in consistent mode, and omits responseMimeType', async () => {
  let capturedRequest = null;
  const fakeClient = {
    models: {
      generateContent: async (request) => {
        capturedRequest = request;
        return {
          candidates: [
            {
              content: {
                parts: [
                  { inlineData: { mimeType: 'image/jpeg', data: 'GENERATED_BYTES' } },
                ],
              },
            },
          ],
        };
      },
    },
  };

  const consistentResult = await generateAdminOptionImage({
    targetType: 'question_option',
    consistencyMode: 'consistent',
    serviceContext: { label: 'Manicure', categoryName: 'Beauty' },
    questionContext: {
      prompt: 'What nail color?',
      optionLabel: 'Gloss Black',
      siblingOptionLabels: ['French Tip', 'Gloss Black'],
    },
    referenceImageDataUrl: 'data:image/png;base64,UkVGX0JZVEVT',
    client: fakeClient,
  });

  assert.equal(capturedRequest.model, DEFAULT_IMAGE_MODEL);
  assert.equal(capturedRequest.config.imageConfig.aspectRatio, '1:1');
  assert.equal(capturedRequest.config.responseMimeType, undefined);
  assert.equal(capturedRequest.config.responseSchema, undefined);
  assert.equal(capturedRequest.contents[0].parts.length, 2);
  assert.equal(capturedRequest.contents[0].parts[0].inlineData.data, 'UkVGX0JZVEVT');
  assert.equal(consistentResult.usedReferenceImage, true);
  assert.equal(consistentResult.imageDataUrl, 'data:image/jpeg;base64,GENERATED_BYTES');

  const uniqueResult = await generateAdminOptionImage({
    targetType: 'service_option',
    consistencyMode: 'unique',
    serviceContext: { label: 'House Cleaning', categoryName: 'Cleaning', optionTitles: ['Standard Clean', 'Deep Clean'] },
    optionContext: { title: 'Deep Clean', description: 'Full interior deep clean including appliances.' },
    referenceImageDataUrl: 'data:image/png;base64,UkVGX0JZVEVT',
    client: fakeClient,
  });

  assert.equal(capturedRequest.contents[0].parts.length, 1);
  assert.equal(uniqueResult.usedReferenceImage, false);
  assert.match(capturedRequest.contents[0].parts[0].text, /Deep Clean/);
});

test('generateAdminOptionImage supports single service_image gallery generation with varied directions', async () => {
  const capturedRequests = [];
  const fakeClient = {
    models: {
      generateContent: async (request) => {
        capturedRequests.push(request);
        return {
          candidates: [
            {
              content: {
                parts: [
                  { inlineData: { mimeType: 'image/png', data: 'U0VSVklDRQ==' } },
                ],
              },
            },
          ],
        };
      },
    },
  };

  const first = await generateAdminOptionImage({
    targetType: 'service_image',
    serviceContext: {
      label: 'Mobile Car Wash',
      categoryName: 'Auto Care',
      description: 'Doorstep exterior wash and interior vacuum',
      optionTitles: ['Hatchback/Sedan', 'SUV/Bakkie'],
    },
    serviceImageContext: { imageNumber: 1 },
    client: fakeClient,
  });

  const second = await generateAdminOptionImage({
    targetType: 'service_image',
    serviceContext: {
      label: 'Mobile Car Wash',
      categoryName: 'Auto Care',
      description: 'Doorstep exterior wash and interior vacuum',
      optionTitles: ['Hatchback/Sedan', 'SUV/Bakkie'],
    },
    serviceImageContext: { imageNumber: 2 },
    client: fakeClient,
  });

  assert.equal(first.imageDataUrl, 'data:image/png;base64,U0VSVklDRQ==');
  assert.equal(second.usedReferenceImage, false);
  assert.equal(capturedRequests[0].contents[0].parts.length, 1);
  assert.match(capturedRequests[0].contents[0].parts[0].text, /gallery photograph \(#1\)/i);
  assert.match(capturedRequests[1].contents[0].parts[0].text, /gallery photograph \(#2\)/i);
  assert.notEqual(capturedRequests[0].contents[0].parts[0].text, capturedRequests[1].contents[0].parts[0].text);

  await assert.rejects(
    () => generateAdminOptionImage({
      targetType: 'service_image',
      serviceContext: { label: '' },
      client: fakeClient,
    }),
    /service name/i,
  );
});

