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

test('formatWhatsAppNextQuestion formats service_address_target with three location buttons', () => {
  const { formatWhatsAppNextQuestion } = require('./serviceBookingPresentation');
  const result = formatWhatsAppNextQuestion({
    service: { label: 'Barber' },
    question: { id: 'service_address_target', prompt: 'Where should the helper come?' },
    index: 0,
    total: 3,
    hasSavedHomeAddress: true,
  });
  assert.equal(result.interactive.type, 'button');
  const buttons = result.interactive.action.buttons;
  assert.equal(buttons.length, 3);
  assert.equal(buttons[0].reply.id, 'wa_opt_sat_current_location');
  assert.equal(buttons[0].reply.title, 'Current Location');
  assert.equal(buttons[1].reply.id, 'wa_opt_sat_saved_home_address');
  assert.equal(buttons[1].reply.title, 'Saved Address');
  assert.equal(buttons[2].reply.id, 'wa_opt_sat_another_address');
  assert.equal(buttons[2].reply.title, 'Another Address');
});

test('formatWhatsAppNextQuestion formats options <= 3 with quick reply buttons', () => {
  const { formatWhatsAppNextQuestion } = require('./serviceBookingPresentation');
  const result = formatWhatsAppNextQuestion({
    service: { label: 'Car Wash' },
    question: {
      id: 'vehicle_size',
      prompt: 'What size is the car?',
      options: [
        { value: 'small', label: 'Small Hatchback' },
        { value: 'sedan', label: 'Sedan' },
        { value: 'suv', label: 'SUV or 4x4' },
      ],
    },
    index: 1,
    total: 3,
  });
  assert.equal(result.interactive.type, 'button');
  const buttons = result.interactive.action.buttons;
  assert.equal(buttons.length, 3);
  assert.equal(buttons[0].reply.id, 'wa_ans_vehicle_size_small');
  assert.equal(buttons[0].reply.title, 'Small Hatchback');
  assert.equal(buttons[1].reply.id, 'wa_ans_vehicle_size_sedan');
  assert.equal(buttons[1].reply.title, 'Sedan');
  assert.equal(buttons[2].reply.id, 'wa_ans_vehicle_size_suv');
  assert.equal(buttons[2].reply.title, 'SUV or 4x4');
});

test('formatWhatsAppNextQuestion presents free questions without interactive buttons', () => {
  const { formatWhatsAppNextQuestion } = require('./serviceBookingPresentation');
  const result = formatWhatsAppNextQuestion({
    service: { label: 'Handyman' },
    question: { id: 'problem_description', prompt: 'Describe the issue' },
    index: 0,
    total: 1,
  });
  assert.equal(result.interactive, null);
  assert.match(result.text, /Describe the issue/);
  assert.match(result.text, /Please type your answer below/);
});

test('formatWhatsAppServiceOptionPrompt renders interactive buttons or list rows with wa_book_opt_ IDs', () => {
  const { formatWhatsAppServiceOptionPrompt } = require('./serviceBookingPresentation');
  const fewOptions = formatWhatsAppServiceOptionPrompt({
    service: { id: 'hairstyles', label: 'Hairstyles' },
    options: [
      { id: 'knotless_braids', title: 'Knotless Braids', price: 350 },
      { id: 'buzz_cut', title: 'Buzz Cut', price: 100 },
    ],
  });
  assert.equal(fewOptions.interactive.type, 'button');
  assert.equal(fewOptions.interactive.action.buttons[0].reply.id, 'wa_book_opt_knotless_braids');
  assert.match(fewOptions.text, /R350\.00/);

  const manyOptions = formatWhatsAppServiceOptionPrompt({
    service: { id: 'cleaning', label: 'Cleaning' },
    options: [
      { id: 'opt1', title: 'Option 1', price: 100 },
      { id: 'opt2', title: 'Option 2', price: 150 },
      { id: 'opt3', title: 'Option 3', price: 200 },
      { id: 'opt4', title: 'Option 4', price: 250 },
    ],
  });
  assert.equal(manyOptions.interactive.type, 'list');
  assert.equal(manyOptions.interactive.action.sections[0].rows[3].id, 'wa_book_opt_opt4');
});

test('booking confirmation displays selectedOption title when present', () => {
  const confirmation = formatWhatsAppBookingConfirmation({
    service: { label: 'Hairstyles' },
    selectedOption: { id: 'knotless_braids', title: 'Knotless Braids' },
    questions: [],
    answers: {},
    quote: { total: 350, currency: 'ZAR', selectedOptionTitle: 'Knotless Braids' },
  });
  assert.match(confirmation.text, /\*Option:\* Knotless Braids/);
  assert.match(confirmation.buttonBody, /Hairstyles — Knotless Braids/);
});

test('formatWhatsAppNextQuestion builds schema-valid carousel cards when question options include images', () => {
  const { formatWhatsAppNextQuestion } = require('./serviceBookingPresentation');
  const result = formatWhatsAppNextQuestion({
    service: { label: 'Barber' },
    question: {
      id: 'cut_style',
      prompt: 'Choose a haircut',
      options: [
        { value: 'fade', label: 'Taper Fade', imageUrl: 'https://example.com/fade.jpg', priceAdder: 50 },
        { value: 'brush', label: 'Brush Cut', imageUrl: '' },
      ],
    },
    index: 0,
    total: 2,
  });
  assert.equal(result.interactive.type, 'carousel');
  assert.equal(result.interactive.action.cards.length, 2);
  assert.equal(result.interactive.action.cards[0].type, 'button');
  assert.equal(result.interactive.action.cards[1].type, 'button');
  assert.equal(result.interactive.action.cards[0].header.image.link, 'https://example.com/fade.jpg');
  assert.equal(result.interactive.action.cards[1].header.image.link, 'https://uncedo.bakayise.com/logo.png');
});

test('formatWhatsAppSubmittedRequestConfirmation shows lively summary details without a request reference', () => {
  const { formatWhatsAppSubmittedRequestConfirmation } = require('./serviceBookingPresentation');
  const message = formatWhatsAppSubmittedRequestConfirmation({
    service: { id: 'hairstyle', label: 'Hairstyle' },
    selectedOption: { id: 'braids', title: 'Box Braids' },
    questions: [
      { id: 'hair_length', prompt: 'Hair length', options: [{ value: 'long', label: 'Long' }] },
      { id: 'notes', prompt: 'Extra notes' },
    ],
    answers: { hair_length: 'long', notes: 'Please bring gel' },
    quote: { total: 350, currency: 'ZAR' },
    location: { address: '12 Main Road, Sandton' },
  });
  assert.match(message, /Awesome — your service request is confirmed/);
  assert.match(message, /🛠️ \*Service:\* Hairstyle/);
  assert.match(message, /✨ \*Option:\* Box Braids/);
  assert.match(message, /📍 \*Location:\* 12 Main Road, Sandton/);
  assert.match(message, /💰 \*Quote:\* R350\.00/);
  assert.match(message, /• \*Hair length:\* Long/);
  assert.match(message, /• \*Extra notes:\* Please bring gel/);
  assert.doesNotMatch(message, /reference|wa_req_/i);
});

test('formatWhatsAppRequestExpiredMessage is warm, cleans category prefix, and omits request reference', () => {
  const { formatWhatsAppRequestExpiredMessage } = require('./serviceBookingPresentation');
  const message = formatWhatsAppRequestExpiredMessage({
    request: { id: 'wa_req_123', serviceSummary: 'beauty: Hairstyle — Phondo', subject: 'Beauty' },
  });
  assert.match(message, /No helpers were available right now/);
  assert.match(message, /\*Hairstyle — Phondo\*/);
  assert.match(message, /5-minute matching window/);
  assert.match(message, /"Book"/);
  assert.doesNotMatch(message, /wa_req_123|reference|beauty:/i);
});

test('formatWhatsAppNextQuestion renders all >10 options cleanly as numbered text without truncating at 10', () => {
  const { formatWhatsAppNextQuestion } = require('./serviceBookingPresentation');
  const fourteenOptions = Array.from({ length: 14 }, (_, idx) => ({
    value: String(idx + 1),
    label: `${idx + 1} ${idx === 0 ? 'person' : 'people'}`,
  }));
  const result = formatWhatsAppNextQuestion({
    service: { label: 'Makeup' },
    question: {
      id: 'people_count',
      prompt: 'How many people do you want this makeup for?',
      options: fourteenOptions,
    },
    index: 0,
    total: 2,
  });
  assert.equal(result.interactive, null);
  assert.match(result.text, /1\. 1 person/);
  assert.match(result.text, /14\. 14 people/);
});

test('formatWhatsAppNextQuestion preserves normal interactive list menu when no question options have pictures', () => {
  const { formatWhatsAppNextQuestion } = require('./serviceBookingPresentation');
  const result = formatWhatsAppNextQuestion({
    service: { label: 'Nails' },
    question: {
      id: 'nail_length',
      prompt: 'Choose your nail length',
      options: [
        { value: 'short', label: 'Short', imageUrl: '' },
        { value: 'medium', label: 'Medium', imageUrl: '' },
        { value: 'long', label: 'Long', imageUrl: '' },
        { value: 'xl', label: 'Extra Long', imageUrl: '' },
      ],
    },
    index: 0,
    total: 1,
  });
  assert.equal(result.interactive.type, 'list');
  assert.equal(result.interactive.action.button, 'Choose option');
  assert.equal(result.interactive.action.sections[0].rows.length, 4);
});

test('formatWhatsAppNextQuestion uses carousel with Uncedo logo fallback for options missing pictures and accepts Firebase Storage URLs', () => {
  const { formatWhatsAppNextQuestion } = require('./serviceBookingPresentation');
  const firebaseStorageUrl = 'https://firebasestorage.googleapis.com/v0/b/bakayise-uncedo-latest.appspot.com/o/service-catalog%2Fnails%2Fred.jpg?alt=media&token=abc123';
  const result = formatWhatsAppNextQuestion({
    service: { label: 'Nails' },
    question: {
      id: 'nail_color',
      prompt: 'Choose a color',
      options: [
        { value: 'red', label: 'Ruby Red', imageUrl: firebaseStorageUrl, pricingType: 'adder', priceAdder: 30 },
        { value: 'nude', label: 'Soft Nude', imageUrl: '' },
        { value: 'french', label: 'French Tips', pricingType: 'multiplier', factor: 2 },
        { value: 'chrome', label: 'Silver Chrome', imageUrl: 'https://example.com/chrome.webp' },
      ],
    },
    index: 0,
    total: 1,
  });
  assert.equal(result.interactive.type, 'carousel');
  assert.equal(result.interactive.action.cards.length, 4);
  assert.equal(result.interactive.action.cards[0].header.image.link, firebaseStorageUrl);
  assert.match(result.interactive.action.cards[0].body.text, /\*Ruby Red\* \(\+R30\)/);
  assert.equal(result.interactive.action.cards[1].header.image.link, 'https://uncedo.bakayise.com/logo.png');
  assert.equal(result.interactive.action.cards[2].header.image.link, 'https://uncedo.bakayise.com/logo.png');
  assert.match(result.interactive.action.cards[2].body.text, /\*French Tips\* \(×2\)/);
  assert.equal(result.interactive.action.cards[3].header.image.link, 'https://uncedo.bakayise.com/logo.png');
  assert.match(result.text, /1\. Ruby Red/);
  assert.match(result.text, /4\. Silver Chrome/);
});

test('formatVerifiedWhatsAppNextQuestion replaces broken 404 option images and falls back to buttons when none are reachable', async () => {
  const { formatVerifiedWhatsAppNextQuestion } = require('./serviceBookingPresentation');
  const fetchMixed = async (url) => {
    if (url === 'https://example.com/good.jpg' || url === 'https://uncedo.bakayise.com/logo.png') {
      return { ok: true, status: 200, headers: new Headers({ 'content-type': 'image/jpeg', 'content-length': '20000' }) };
    }
    return { ok: false, status: 404, headers: new Headers({ 'content-type': 'application/json' }) };
  };

  const mixedResult = await formatVerifiedWhatsAppNextQuestion({
    service: { label: 'Nails' },
    question: {
      id: 'nail_color',
      prompt: 'Choose a color',
      options: [
        { value: 'red', label: 'Ruby Red', imageUrl: 'https://example.com/good.jpg' },
        { value: 'blue', label: 'Ocean Blue', imageUrl: 'https://example.com/broken-404.jpg' },
      ],
    },
    fetchImpl: fetchMixed,
  });
  assert.equal(mixedResult.interactive.type, 'carousel');
  assert.equal(mixedResult.interactive.action.cards[0].header.image.link, 'https://example.com/good.jpg');
  assert.equal(mixedResult.interactive.action.cards[1].header.image.link, 'https://uncedo.bakayise.com/logo.png');

  const allBrokenResult = await formatVerifiedWhatsAppNextQuestion({
    service: { label: 'Nails' },
    question: {
      id: 'nail_color',
      prompt: 'Choose a color',
      options: [
        { value: 'red', label: 'Ruby Red', imageUrl: 'https://example.com/broken-1.jpg' },
        { value: 'blue', label: 'Ocean Blue', imageUrl: 'https://example.com/broken-2.jpg' },
      ],
    },
    fetchImpl: fetchMixed,
  });
  assert.equal(allBrokenResult.interactive.type, 'button');
});

test('formatWhatsAppPreBookingPaymentPrompt adapts buttons based on whether saved cards exist', () => {
  const { formatWhatsAppPreBookingPaymentPrompt } = require('./serviceBookingPresentation');
  const noCards = formatWhatsAppPreBookingPaymentPrompt({
    service: { label: 'Car Wash' },
    quote: { total: 190, currency: 'ZAR' },
    cards: [],
  });
  assert.equal(noCards.interactive.type, 'button');
  assert.deepEqual(
    noCards.interactive.action.buttons.map((b) => [b.reply.id, b.reply.title]),
    [['wa_book_pay_card', 'Add new card'], ['wa_book_pay_cash', 'Pay cash']],
  );

  const withCards = formatWhatsAppPreBookingPaymentPrompt({
    service: { label: 'Car Wash' },
    quote: { total: 190, currency: 'ZAR' },
    cards: [{ id: 'card-1', brand: 'visa', last4: '4242', isDefault: true }],
  });
  assert.deepEqual(
    withCards.interactive.action.buttons.map((b) => [b.reply.id, b.reply.title]),
    [['wa_book_pay_saved', 'Saved card'], ['wa_book_pay_card', 'New card'], ['wa_book_pay_cash', 'Pay cash']],
  );
});

test('formatWhatsAppPreBookingSavedCardMenu lists saved cards plus an Add new card row', () => {
  const { formatWhatsAppPreBookingSavedCardMenu } = require('./serviceBookingPresentation');
  const menu = formatWhatsAppPreBookingSavedCardMenu({
    service: { label: 'Cleaning' },
    quote: { total: 240, currency: 'ZAR' },
    cards: [
      { id: 'c1', brand: 'Visa', last4: '1111', isDefault: true },
      { id: 'c2', brand: 'Mastercard', last4: '2222', isDefault: false },
    ],
  });
  assert.equal(menu.interactive.type, 'list');
  const rows = menu.interactive.action.sections[0].rows;
  assert.equal(rows.length, 3);
  assert.equal(rows[0].id, 'wa_book_saved_card_c1');
  assert.equal(rows[1].id, 'wa_book_saved_card_c2');
  assert.equal(rows[2].id, 'wa_book_add_new_card');
  assert.equal(rows[2].title, 'Add new card');
});

test('formatWhatsAppBookingConfirmation displays selected payment summary for cash and temporary card', () => {
  const cashConfirm = formatWhatsAppBookingConfirmation({
    service: { label: 'Car wash' },
    quote: { total: 200, currency: 'ZAR' },
    paymentSelection: { type: 'cash' },
  });
  assert.match(cashConfirm.text, /\*Payment method:\* Cash \(pay helper on completion\)/);
  assert.match(cashConfirm.buttonBody, /\*Payment:\* Cash/);

  const tempCardConfirm = formatWhatsAppBookingConfirmation({
    service: { label: 'Car wash' },
    quote: { total: 200, currency: 'ZAR' },
    paymentSelection: { type: 'card', cardSummary: { brand: 'Visa', last4: '4242', temporary: true } },
  });
  assert.match(tempCardConfirm.text, /\*Payment method:\* Visa •••• 4242 \(this booking only\)/);
  assert.match(tempCardConfirm.buttonBody, /Visa •••• 4242 \(this booking only\)/);
});

test('formatWhatsAppCompletionCardFailureRecovery offers Use another card only when untried saved cards remain', () => {
  const {
    formatWhatsAppCompletionCardFailureRecovery,
    formatWhatsAppRecoverySavedCardMenu,
  } = require('./serviceBookingPresentation');

  const withOtherCards = formatWhatsAppCompletionCardFailureRecovery({
    serviceName: 'Car Wash',
    wholeTotalDisplay: '190',
    failedCardSummary: { brand: 'Visa', last4: '1111' },
    untriedCards: [{ id: 'c2', brand: 'Mastercard', last4: '2222' }],
  });
  assert.deepEqual(
    withOtherCards.interactive.action.buttons.map((b) => b.reply.id),
    ['wa_recover_saved', 'wa_payment_card', 'wa_payment_cash'],
  );
  assert.match(withOtherCards.text, /Visa •••• 1111/);

  const exhausted = formatWhatsAppCompletionCardFailureRecovery({
    serviceName: 'Car Wash',
    wholeTotalDisplay: '190',
    failedCardSummary: { brand: 'Visa', last4: '1111' },
    untriedCards: [],
  });
  assert.deepEqual(
    exhausted.interactive.action.buttons.map((b) => b.reply.id),
    ['wa_payment_card', 'wa_payment_cash'],
  );
  assert.match(exhausted.text, /no other saved cards are available/i);

  const recoveryMenu = formatWhatsAppRecoverySavedCardMenu({
    serviceName: 'Car Wash',
    wholeTotalDisplay: '190',
    untriedCards: [{ id: 'c2', brand: 'Mastercard', last4: '2222', isDefault: true }],
  });
  const rows = recoveryMenu.interactive.action.sections[0].rows;
  assert.equal(rows.length, 2);
  assert.equal(rows[0].id, 'wa_saved_card_c2');
  assert.equal(rows[1].id, 'wa_recover_add_card');
});



