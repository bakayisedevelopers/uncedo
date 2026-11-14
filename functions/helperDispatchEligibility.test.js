'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  getHelperPayoutVerificationStatus,
  hasVerifiedHelperPayout,
  buildHelperDispatchServiceIds,
  buildRequestedOptionQueryKeys,
  helperServiceOfferingMatchesRequest,
} = require('./helperDispatchEligibility');

test('dispatch payout check accepts the canonical nested and legacy root status fields consistently', () => {
  assert.equal(getHelperPayoutVerificationStatus({ payout: { verificationStatus: 'verified' } }), 'verified');
  assert.equal(getHelperPayoutVerificationStatus({ payoutVerificationStatus: ' VERIFIED ' }), 'verified');
  assert.equal(hasVerifiedHelperPayout({ payout: { verificationStatus: 'verified' } }), true);
  assert.equal(hasVerifiedHelperPayout({ payoutVerificationStatus: 'verified' }), true);
  assert.equal(hasVerifiedHelperPayout({ payoutVerificationStatus: 'pending' }), false);
  assert.equal(hasVerifiedHelperPayout({ payout: { verificationStatus: 'pending' }, payoutVerificationStatus: 'verified' }), false);
});

test('option-level matching isolates per_option approvals while supporting unified and legacy 0-option services', () => {
  const catalogIndex = {
    activeEntries: [
      {
        id: 'hairstyles',
        categoryId: 'grooming',
        label: 'Hairstyles',
        optionApplicationMode: 'per_option',
        options: [
          { id: 'knotless_braids', title: 'Knotless Braids' },
          { id: 'buzz_cut', title: 'Buzz Cut' },
        ],
      },
      {
        id: 'home_cleaning',
        categoryId: 'cleaning',
        label: 'Home Cleaning',
        optionApplicationMode: 'unified',
        options: [
          { id: 'dishes', title: 'Dishes' },
          { id: 'laundry', title: 'Laundry' },
        ],
      },
      {
        id: 'legacy_errand',
        categoryId: 'errands',
        label: 'Errand Run',
        optionApplicationMode: 'per_option',
        options: [],
      },
    ],
    activeCatalogIds: new Set(['hairstyles', 'home_cleaning', 'legacy_errand']),
    byId: new Map([
      ['hairstyles', {
        id: 'hairstyles',
        categoryId: 'grooming',
        label: 'Hairstyles',
        optionApplicationMode: 'per_option',
        options: [{ id: 'knotless_braids', title: 'Knotless Braids' }, { id: 'buzz_cut', title: 'Buzz Cut' }],
      }],
      ['home_cleaning', {
        id: 'home_cleaning',
        categoryId: 'cleaning',
        label: 'Home Cleaning',
        optionApplicationMode: 'unified',
        options: [{ id: 'dishes', title: 'Dishes' }, { id: 'laundry', title: 'Laundry' }],
      }],
      ['legacy_errand', {
        id: 'legacy_errand',
        categoryId: 'errands',
        label: 'Errand Run',
        optionApplicationMode: 'per_option',
        options: [],
      }],
    ]),
  };

  const braidHelperOfferings = [{
    serviceId: 'hairstyles',
    categoryId: 'grooming',
    optionId: 'knotless_braids',
    applicationMode: 'option',
    status: 'approved',
    active: true,
    approved: true,
    verified: true,
  }];
  assert.equal(helperServiceOfferingMatchesRequest(braidHelperOfferings[0], 'grooming', ['hairstyles'], catalogIndex, 'knotless_braids'), true);
  assert.equal(helperServiceOfferingMatchesRequest(braidHelperOfferings[0], 'grooming', ['hairstyles'], catalogIndex, 'buzz_cut'), false);

  const braidDispatch = buildHelperDispatchServiceIds(braidHelperOfferings, catalogIndex);
  assert.equal(braidDispatch.approvedOptionKeys.includes('hairstyles::knotless_braids'), true);
  assert.equal(braidDispatch.approvedOptionKeys.includes('hairstyles::buzz_cut'), false);

  const unifiedCleanerOfferings = [{
    serviceId: 'home_cleaning',
    categoryId: 'cleaning',
    optionId: '',
    applicationMode: 'unified',
    status: 'approved',
    active: true,
    approved: true,
    verified: true,
  }];
  assert.equal(helperServiceOfferingMatchesRequest(unifiedCleanerOfferings[0], 'cleaning', ['home_cleaning'], catalogIndex, 'dishes'), true);
  assert.equal(helperServiceOfferingMatchesRequest(unifiedCleanerOfferings[0], 'cleaning', ['home_cleaning'], catalogIndex, 'laundry'), true);
  const queryKeys = buildRequestedOptionQueryKeys(['home_cleaning'], catalogIndex, 'dishes');
  assert.equal(queryKeys.requiresOptionMatch, true);
  assert.equal(queryKeys.optionQueryKeys.includes('home_cleaning::dishes'), true);
  assert.equal(queryKeys.optionQueryKeys.includes('home_cleaning::__unified__'), true);

  const legacyOffering = {
    serviceId: 'legacy_errand',
    categoryId: 'errands',
    optionId: '',
    applicationMode: 'legacy',
    status: 'approved',
    active: true,
    approved: true,
    verified: true,
  };
  assert.equal(helperServiceOfferingMatchesRequest(legacyOffering, 'errands', ['legacy_errand'], catalogIndex, ''), true);
});

