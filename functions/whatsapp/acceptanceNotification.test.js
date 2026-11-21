'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildAcceptanceSummaryFromDocs,
  buildCustomerRequestAcceptedWhatsAppText,
  pickPrimaryRequestedOption,
  resolveHelperAcceptanceSummary,
} = require('./acceptanceNotification');

test('pickPrimaryRequestedOption extracts option id, title, and masteryKey from pricing breakdown or request', () => {
  const fromBreakdown = pickPrimaryRequestedOption({
    serviceIds: ['plumbing'],
    pricingSnapshot: {
      serviceBreakdown: [
        {
          serviceId: 'plumbing',
          selectedOptionId: 'leak_repair',
          selectedOptionTitle: 'Burst Pipe & Leak Repair',
        },
      ],
    },
  });

  assert.equal(fromBreakdown.serviceId, 'plumbing');
  assert.equal(fromBreakdown.optionId, 'leak_repair');
  assert.equal(fromBreakdown.optionTitle, 'Burst Pipe & Leak Repair');
  assert.equal(fromBreakdown.masteryKey, 'plumbing__leak_repair');
});

test('buildCustomerRequestAcceptedWhatsAppText renders helper details, option rating, mastery badge, and completed option jobs', () => {
  const request = {
    publicRequestReference: 'UNC-1042',
    serviceSummary: 'Plumbing — Burst Pipe & Leak Repair',
    serviceIds: ['plumbing'],
    selectedOptionId: 'leak_repair',
    selectedOptionTitle: 'Burst Pipe & Leak Repair',
    helperAssignment: {
      helperId: 'helper-1',
      helperName: 'Thabo Mokoena',
      helperPhone: '+27821234567',
    },
  };

  const summary = buildAcceptanceSummaryFromDocs({
    request,
    helperId: 'helper-1',
    helperUser: {
      fullName: 'Thabo Mokoena',
      businessName: 'TM Plumbing Services',
      phoneNumber: '+27821234567',
      city: 'Johannesburg',
      verificationStatus: 'verified',
    },
    optionMastery: {
      level: 'master',
      eligibleCompletedJobCount: 214,
      averageRating: 4.86,
      ratingCount: 52,
    },
    optionRating: {
      average: 4.86,
      count: 52,
    },
  });

  const message = buildCustomerRequestAcceptedWhatsAppText({
    request,
    beforeStatus: 'matching',
    helperSummary: summary,
  });

  assert.match(message, /\[\*UNC-1042\*\]/);
  assert.match(message, /\*Thabo Mokoena\*/);
  assert.match(message, /Verified/);
  assert.match(message, /TM Plumbing Services/);
  assert.match(message, /\+27821234567/);
  assert.match(message, /Burst Pipe & Leak Repair Track Record/);
  assert.match(message, /Mastery badge: \*Master\*/);
  assert.match(message, /Option rating: \*4\.9 ★ \(52 ratings\)\*/);
  assert.match(message, /Experience: \*214 completed jobs\* for this option/);
});

test('buildAcceptanceSummaryFromDocs does not leak service rollup into another option when option stats do not exist yet', () => {
  const request = {
    serviceSummary: 'Cleaning — Deep Clean',
    serviceIds: ['cleaning'],
    selectedOptionId: 'deep_clean',
    selectedOptionTitle: 'Deep Clean',
    helperAssignment: { helperId: 'h2', helperName: 'Nomsa Dlamini' },
  };

  const summary = buildAcceptanceSummaryFromDocs({
    request,
    helperId: 'h2',
    helperUser: { fullName: 'Nomsa Dlamini' },
    optionMastery: null,
    optionRating: null,
    serviceMastery: { level: 'legend', eligibleCompletedJobCount: 540 },
    serviceRating: { average: 4.95, count: 140 },
  });

  const message = buildCustomerRequestAcceptedWhatsAppText({ request, helperSummary: summary });
  assert.equal(summary.masteryLevel, 'beginner');
  assert.equal(summary.completedJobsCount, 0);
  assert.equal(summary.optionRatingCount, 0);
  assert.match(message, /Mastery badge: \*Beginner\*/);
  assert.match(message, /Option rating: \*New \(no option ratings yet\)\*/);
  assert.match(message, /0 completed jobs/);
});

test('resolveHelperAcceptanceSummary reads serviceOptions mastery and rating collections cleanly from Firestore', async () => {
  const store = new Map([
    ['users/helper-9', { fullName: 'Sipho Ndlovu', phoneNumber: '+27710001111', verificationStatus: 'verified', city: 'Pretoria' }],
    ['helperMastery/helper-9/serviceOptions/electrical__fault_finding', { level: 'specialist', eligibleCompletedJobCount: 61 }],
    ['ratingAccounts/helper-9/serviceOptions/electrical__fault_finding', { average: 4.74, count: 19 }],
  ]);

  const makeSnap = (path) => ({
    exists: store.has(path),
    data: () => store.get(path),
  });

  const fakeDb = {
    collection: (c1) => ({
      doc: (d1) => ({
        get: async () => makeSnap(`${c1}/${d1}`),
        collection: (c2) => ({
          doc: (d2) => ({
            get: async () => makeSnap(`${c1}/${d1}/${c2}/${d2}`),
          }),
        }),
      }),
    }),
  };

  const summary = await resolveHelperAcceptanceSummary({
    db: fakeDb,
    helperId: 'helper-9',
    request: {
      serviceIds: ['electrical'],
      selectedOptionId: 'fault_finding',
      selectedOptionTitle: 'Fault Finding',
      helperAssignment: { helperId: 'helper-9' },
    },
  });

  assert.equal(summary.helperName, 'Sipho Ndlovu');
  assert.equal(summary.masteryLabel, 'Specialist');
  assert.equal(summary.completedJobsCount, 61);
  assert.equal(summary.optionRatingAverage, 4.7);
  assert.equal(summary.optionRatingCount, 19);
});
