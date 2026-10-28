'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  extractQuestionnaireAnswers,
  getMissingRequiredQuestions,
  questionnaireNeedsExtractionPass,
} = require('./serviceBookingIntake');

const questions = [
  { id: 'vehicle_type', prompt: 'What type of vehicle is it?', required: true, answerType: 'enum', options: [{ value: 'sedan', label: 'Sedan' }, { value: 'suv', label: 'SUV' }] },
  { id: 'service_location', prompt: 'Where should we wash it?', required: true, answerType: 'text' },
  { id: 'wash_addon', prompt: 'Would you like tyre cleaning?', required: true, answerType: 'enum', options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }] },
];

test('questionnaire extraction always runs against the authoritative questionnaire on booking turns', () => {
  assert.equal(questionnaireNeedsExtractionPass({
    intent: 'service_booking', availableQuestions: [], questionnaire: questions,
  }), true);
  assert.equal(questionnaireNeedsExtractionPass({
    intent: 'service_booking', availableQuestions: questions, questionnaire: questions,
  }), true);
  assert.equal(questionnaireNeedsExtractionPass({
    intent: 'price_enquiry', availableQuestions: [], questionnaire: questions,
  }), false);
  assert.equal(questionnaireNeedsExtractionPass({
    intent: 'service_booking', availableQuestions: [], questionnaire: [],
  }), false);
});

test('extraction pass receives the original message and image, exact questionnaire, and no callable tools', async () => {
  const originalMessage = {
    type: 'text', text: 'Wash my SUV at my home in Sandton.',
    mediaBuffer: Buffer.from('mock-image'), mediaMimeType: 'image/jpeg',
  };
  let captured;
  const result = await extractQuestionnaireAnswers({
    model: { classify: async (input) => {
      captured = input;
      return {
        intent: 'service_booking', serviceId: 'wrong-service', toolName: 'requestHumanSupport',
        extractedAnswers: { vehicle_type: 'suv', service_location: 'Home in Sandton' },
      };
    } },
    message: originalMessage,
    service: { id: 'car_wash', categoryId: 'car_care', label: 'Car wash', description: 'Wash a vehicle', pricing: { secretInternalField: true } },
    questions,
    existingAnswers: { wash_addon: 'no' },
  });

  assert.equal(captured.message, originalMessage);
  assert.equal(captured.message.mediaBuffer.equals(originalMessage.mediaBuffer), true);
  assert.deepEqual(captured.questions, questions);
  assert.deepEqual(captured.services, [{ id: 'car_wash', categoryId: 'car_care', label: 'Car wash', description: 'Wash a vehicle' }]);
  assert.deepEqual(captured.availableTools, []);
  assert.equal(captured.answerExtractionOnly, true);
  assert.deepEqual(captured.recentHistory, []);
  assert.deepEqual(captured.conversationState.answers, { wash_addon: 'no' });
  assert.deepEqual(result.answers, { vehicle_type: 'suv', service_location: 'Home in Sandton' });
  assert.equal(result.attempted, true);
  assert.equal(result.fallback, false);
});

test('failed extraction safely falls back to the first classification without repeating a mutation', async () => {
  const fallbackAnswers = { vehicle_type: 'suv' };
  const result = await extractQuestionnaireAnswers({
    model: { classify: async () => { throw Object.assign(new Error('provider details are private'), { code: 'provider-timeout' }); } },
    message: { text: 'Wash my SUV' },
    service: { id: 'car_wash' },
    questions,
    fallbackAnswers,
  });

  assert.deepEqual(result.answers, fallbackAnswers);
  assert.equal(result.attempted, true);
  assert.equal(result.fallback, true);
  assert.equal(result.errorCode, 'provider-timeout');
});

test('the intake returns all unanswered required questions in questionnaire order', () => {
  assert.deepEqual(
    getMissingRequiredQuestions(questions, ['wash_addon', 'service_location']),
    [questions[1], questions[2]],
  );
  assert.deepEqual(getMissingRequiredQuestions(questions, []), []);
});
