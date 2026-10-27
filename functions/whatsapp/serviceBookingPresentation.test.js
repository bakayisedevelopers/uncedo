'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { formatWhatsAppBookingConfirmation, renderWhatsAppQuestion } = require('./serviceBookingPresentation');

test('booking asks one formatted questionnaire question and lists its options cleanly', () => {
  assert.equal(renderWhatsAppQuestion({
    prompt: 'What type of vehicle do you have?',
    options: [{ value: 'sedan', label: 'Sedan' }, { value: 'suv', label: 'SUV' }],
  }), '*What type of vehicle do you have?*\n\n• Sedan\n• SUV');
  assert.equal(renderWhatsAppQuestion({ prompt: 'Where should we meet?' }), '*Where should we meet?*');
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
