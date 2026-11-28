'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  DEFAULT_IMAGE_MODEL,
  buildOptionImagePrompt,
  extractGeneratedImagePart,
  generateAdminOptionImage,
  getHelpersWordmarkLogoPart,
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
  assert.match(editPrompt, /REMOVE ANY EXISTING CORNER LOGO\/WATERMARK FROM THE REFERENCE IMAGE/i);
  assert.match(editPrompt, /EXACT SAME person/i);
  assert.match(editPrompt, /Ruby Red/);
  assert.match(editPrompt, /What color of manicure do you want\?/);
  assert.match(editPrompt, /pure-white "uncedo helpers" logo/i);
  assert.match(editPrompt, /STRICT BAN ON CORNER OR SCENE LOGOS ANYWHERE IN THE IMAGE/i);
  assert.match(editPrompt, /ONLY place the "uncedo helpers" logo is ever permitted/i);

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
  assert.match(uniquePrompt, /TOP-LEFT WHITE LOGO VISIBILITY/i);
  assert.match(uniquePrompt, /SERVICE PROVIDER CLOTHING BRANDING/i);
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

test('generateAdminOptionImage uses gemini-3.1-flash-lite-image, generates 9:16 portrait, forwards reference image in consistent mode, and omits responseMimeType', async () => {
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

  const bundledLogoPart = getHelpersWordmarkLogoPart();
  assert.equal(bundledLogoPart?.inlineData?.mimeType, 'image/png');
  assert.ok(String(bundledLogoPart?.inlineData?.data || '').length > 100);

  assert.equal(capturedRequest.model, DEFAULT_IMAGE_MODEL);
  assert.equal(capturedRequest.config.imageConfig.aspectRatio, '9:16');
  assert.equal(capturedRequest.config.responseMimeType, undefined);
  assert.equal(capturedRequest.config.responseSchema, undefined);
  assert.equal(capturedRequest.contents[0].parts.length, 3);
  assert.equal(capturedRequest.contents[0].parts[0].inlineData.data, 'UkVGX0JZVEVT');
  assert.equal(capturedRequest.contents[0].parts[1].inlineData.data, bundledLogoPart.inlineData.data);
  assert.equal(consistentResult.usedReferenceImage, true);
  assert.equal(consistentResult.attachedHelpersLogo, true);
  assert.equal(consistentResult.aspectRatio, '9:16');
  assert.equal(consistentResult.imageDataUrl, 'data:image/jpeg;base64,GENERATED_BYTES');

  const uniqueResult = await generateAdminOptionImage({
    targetType: 'service_option',
    consistencyMode: 'unique',
    serviceContext: { label: 'House Cleaning', categoryName: 'Cleaning', optionTitles: ['Standard Clean', 'Deep Clean'] },
    optionContext: { title: 'Deep Clean', description: 'Full interior deep clean including appliances.' },
    referenceImageDataUrl: 'data:image/png;base64,UkVGX0JZVEVT',
    client: fakeClient,
  });

  assert.equal(capturedRequest.contents[0].parts.length, 2);
  assert.equal(capturedRequest.contents[0].parts[0].inlineData.data, bundledLogoPart.inlineData.data);
  assert.equal(uniqueResult.usedReferenceImage, false);
  assert.equal(uniqueResult.attachedHelpersLogo, true);
  assert.match(capturedRequest.contents[0].parts[1].text, /Deep Clean/);
  assert.match(capturedRequest.contents[0].parts[1].text, /9:16 vertical portrait/i);
  assert.match(capturedRequest.contents[0].parts[1].text, /pure-white "uncedo helpers" logo/i);
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
  assert.equal(first.aspectRatio, '1:1');
  assert.equal(first.attachedHelpersLogo, true);
  assert.equal(capturedRequests[0].config.imageConfig.aspectRatio, '1:1');
  assert.equal(second.usedReferenceImage, false);
  assert.equal(capturedRequests[0].contents[0].parts.length, 2);
  assert.match(capturedRequests[0].contents[0].parts[1].text, /gallery photograph \(#1\)/i);
  assert.match(capturedRequests[1].contents[0].parts[1].text, /gallery photograph \(#2\)/i);
  assert.match(capturedRequests[0].contents[0].parts[1].text, /FULL-BLEED EDGE-TO-EDGE PHOTOGRAPH/i);
  assert.match(capturedRequests[0].contents[0].parts[1].text, /BOTTOM-RIGHT WHITE LOGO VISIBILITY/i);
  assert.match(capturedRequests[0].contents[0].parts[1].text, /STRICT BAN ON CORNER OR SCENE LOGOS ANYWHERE IN THE IMAGE/i);
  assert.match(capturedRequests[0].contents[0].parts[1].text, /NO blank margin or footer strips/i);
  assert.doesNotMatch(capturedRequests[0].contents[0].parts[1].text, /booking gallery card/i);
  assert.notEqual(capturedRequests[0].contents[0].parts[1].text, capturedRequests[1].contents[0].parts[1].text);

  await assert.rejects(
    () => generateAdminOptionImage({
      targetType: 'service_image',
      serviceContext: { label: '' },
      client: fakeClient,
    }),
    /service name/i,
  );
});

test('generateAdminOptionImage attaches full upstream Service Option & parent decision context and deduped context pictures', async () => {
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
                  { inlineData: { mimeType: 'image/jpeg', data: 'RklOQUw=' } },
                ],
              },
            },
          ],
        };
      },
    },
  };

  const result = await generateAdminOptionImage({
    targetType: 'question_option',
    consistencyMode: 'consistent',
    serviceContext: { label: 'Haircut & Color', categoryName: 'Grooming' },
    referenceImageDataUrl: 'data:image/jpeg;base64,U0lCTElORw==',
    questionContext: {
      prompt: 'Which blonde shade do you want?',
      optionLabel: 'Honey Blonde',
      siblingOptionLabels: ['Honey Blonde', 'Platinum Blonde'],
      serviceOption: {
        id: 'buzz_cut_dye',
        title: 'Buzz Cut & Dye',
        description: 'Fade buzz cut with custom hair color.',
      },
      contextChain: [
        { questionId: 'want_dye', questionPrompt: 'Do you want dye on your haircut?', selectedAnswers: ['Yes'] },
        { questionId: 'dye_color', questionPrompt: 'What color of dye do you want?', selectedAnswers: ['Blonde'] },
      ],
      contextImages: [
        { label: 'Parent choice "Blonde"', sourceType: 'parent_option', imageDataUrl: 'data:image/jpeg;base64,QkxPTkRF' },
        { label: 'Service Option "Buzz Cut & Dye"', sourceType: 'service_option', imageDataUrl: 'data:image/jpeg;base64,QlVaWg==' },
        { label: 'Duplicate sibling image', sourceType: 'parent_option', imageDataUrl: 'data:image/jpeg;base64,U0lCTElORw==' },
      ],
    },
    client: fakeClient,
  });

  assert.equal(result.usedReferenceImage, true);
  assert.equal(result.contextImagesCount, 2);
  assert.equal(result.attachedHelpersLogo, true);
  // parts: [siblingRef, parentBlonde, serviceOptBuzz, helpersLogo, promptText]
  assert.equal(capturedRequest.contents[0].parts.length, 5);
  assert.equal(capturedRequest.contents[0].parts[0].inlineData.data, 'U0lCTElORw==');
  assert.equal(capturedRequest.contents[0].parts[1].inlineData.data, 'QkxPTkRF');
  assert.equal(capturedRequest.contents[0].parts[2].inlineData.data, 'QlVaWg==');
  const promptText = capturedRequest.contents[0].parts[4].text;
  assert.match(promptText, /SELECTED TOP SERVICE OPTION: "Buzz Cut & Dye"/i);
  assert.match(promptText, /1\. Question: "Do you want dye on your haircut\?" -> Selected answer: "Yes"/i);
  assert.match(promptText, /2\. Question: "What color of dye do you want\?" -> Selected answer: "Blonde"/i);
  assert.match(promptText, /IMAGE 1 is the SAME-QUESTION CONSISTENCY REFERENCE/i);
  assert.match(promptText, /IMAGE 2 is an UPSTREAM VISUAL CONTEXT REFERENCE \(Parent choice "Blonde"\)/i);
  assert.match(promptText, /IMAGE 3 is an UPSTREAM VISUAL CONTEXT REFERENCE \(Service Option "Buzz Cut & Dye"\)/i);
  assert.match(promptText, /IMAGE 4 is the official pure-white "uncedo helpers" logo reference/i);
});


