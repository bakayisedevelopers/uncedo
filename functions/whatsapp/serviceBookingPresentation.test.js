'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { formatWhatsAppBookingConfirmation, renderMissingWhatsAppQuestions } = require('./serviceBookingPresentation');

test('booking intake asks all missing questions together with numbered prompts and formatted options', () => {
  const message = renderMissingWhatsAppQuestions({
    serviceLabel: 'Car wash',
    questions: [
      { id: 'vehicle_type', prompt: 'What type of vehicle?', options: [{ value: 'suv', label: 'SUV' }, { value: 'sedan', label: 'Sedan' }] },
      { id: 'service_location', prompt: 'Where should we wash it?' },
      { id: 'timing', prompt: 'When do you need the service?', options: [{ value: 'now', label: 'Now' }, { value: 'later', label: 'Later' }] },
    ],
    missingQuestionIds: ['service_location', 'timing'],
  });
  assert.match(message, /\*To finish your Car wash request\*/);
  assert.match(message, /1\. \*Where should we wash it\?\*/);
  assert.match(message, /2\. \*When do you need the service\?\*/);
  assert.match(message, /• Now\n   • Later/);
  assert.doesNotMatch(message, /What type of vehicle/);
});

test('booking confirmation shows validated answers and emphasises the authoritative quote in WhatsApp format', () => {
  const result = formatWhatsAppBookingConfirmation({
    service: { label: 'Car wash' },
    questions: [
      { id: 'vehicle_type', prompt: 'Vehicle type', options: [{ value: 'suv', label: 'SUV' }] },
      { id: 'service_location', prompt: 'Service location' },
      { id: 'tyre_cleaning', prompt: 'Tyre cleaning?', options: [{ value: 'yes', label: 'Yes' }] },
    ],
    answers: { vehicle_type: 'suv', service_location: 'Home in Sandton', tyre_cleaning: 'yes' },
    quote: { total: 425.5, currency: 'ZAR' },
  });
  assert.match(result.text, /\*Please review your service request\*/);
  assert.match(result.text, /\*Vehicle type:\* SUV/);
  assert.match(result.text, /\*Service location:\* Home in Sandton/);
  assert.match(result.text, /\*Final quote: R425\.50\*/);
  assert.match(result.text, /\*Confirm\*/);
  assert.match(result.buttonBody, /\*Final quote: R425\.50\*/);
  assert.doesNotMatch(result.text, /\*\*/);
});

test('booking confirmation omits unanswered questions and formats non-ZAR quotes safely', () => {
  const result = formatWhatsAppBookingConfirmation({
    service: { label: 'Home cleaning' },
    questions: [{ id: 'rooms', prompt: 'Number of rooms?' }],
    answers: {},
    quote: { total: 120, currency: 'usd' },
  });
  assert.doesNotMatch(result.text, /Number of rooms/);
  assert.match(result.text, /\*Final quote: USD 120\.00\*/);
});
