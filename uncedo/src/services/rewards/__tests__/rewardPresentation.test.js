import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildHowToEarnSections,
  buildMembershipProgressModel,
  buildReferralLink,
  buildTransactionDisplayModel,
  formatPointsToRand,
  getMembershipDisplayMeta,
  parseReferralCodeFromUrl,
  summarizeExpiringPoints,
  summarizeReferralList,
} from '../rewardPresentation.js';
import { REWARD_REASON_CODES } from '../../../shared/rewards.js';

test('formats points to rand using two decimals', () => {
  assert.equal(formatPointsToRand(125, 10), 'R12.50');
  assert.equal(formatPointsToRand(0, 10), 'R0.00');
});

test('maps membership display metadata', () => {
  assert.deepEqual(getMembershipDisplayMeta('friend'), {
    level: 'friend',
    label: 'Friend',
    tone: 'indigo',
    rank: 3,
  });
});

test('builds membership progress from trusted account and rating values', () => {
  const progress = buildMembershipProgressModel({
    rewardAccount: {
      eligibleCompletedPaidBookings: 12,
      membership: {
        currentLevel: 'neighbour',
        highestLevel: 'neighbour',
        qualificationSnapshot: {},
      },
    },
    ratingSummary: {
      overallAverage: 4.2,
      overallCount: 4,
    },
    membershipConfig: {
      customer: {
        partner: {
          minCompletedPaidBookings: 10,
          minAverageRating: 4,
          minRatingCount: 3,
        },
      },
    },
  });

  assert.equal(progress.nextLevel, 'partner');
  assert.equal(progress.requirements.every((item) => item.met), true);
  assert.equal(progress.overallProgress, 1);
});

test('falls back safely when config is missing', () => {
  const sections = buildHowToEarnSections({
    globalConfig: {},
    customerConfig: {},
  });

  assert.ok(sections.length > 0);
  assert.equal(sections.some((section) => section.items.some((item) => item.id === 'profileCompleted' && item.state === 'active')), true);
});

test('maps reward reason labels and credit direction for history display', () => {
  const display = buildTransactionDisplayModel({
    id: 'tx_1',
    direction: 'credit',
    points: 50,
    reasonCode: REWARD_REASON_CODES.CUSTOMER_COMPLETED_PAID_BOOKING,
    status: 'applied',
  });

  assert.equal(display.title, 'Completed and paid booking');
  assert.equal(display.signedAmount, '+50');
  assert.equal(display.statusLabel, 'Applied');
});

test('maps debit and expiry transaction states safely', () => {
  const display = buildTransactionDisplayModel({
    id: 'tx_2',
    direction: 'expiry',
    points: 10,
    reasonCode: REWARD_REASON_CODES.POINTS_EXPIRED,
    status: 'expired',
  });

  assert.equal(display.directionLabel, 'Expired');
  assert.equal(display.signedAmount, '-10');
  assert.equal(display.title, 'Points expired');
});

test('summarizes expiring points by remaining balance and nearest expiry', () => {
  const summary = summarizeExpiringPoints([
    {
      id: 'a',
      points: 20,
      remainingPoints: 10,
      expiresAt: new Date(Date.now() + (5 * 24 * 60 * 60 * 1000)),
    },
    {
      id: 'b',
      points: 30,
      remainingPoints: 15,
      expiresAt: new Date(Date.now() + (15 * 24 * 60 * 60 * 1000)),
    },
  ], 30);

  assert.equal(summary.amount, 25);
  assert.ok(summary.nextExpiryAt instanceof Date);
});

test('builds and parses referral links', () => {
  const link = buildReferralLink('UNC123');
  assert.equal(link, 'https://uncedo.bakayise.com/signup?ref=UNC123');
  assert.equal(parseReferralCodeFromUrl(link), 'UNC123');
  assert.equal(parseReferralCodeFromUrl('uncedo://signup?ref=ABC999'), 'ABC999');
});

test('disables referral activities when referral feature flag is off', () => {
  const sections = buildHowToEarnSections({
    globalConfig: {
      featureFlags: {
        rewardsEnabled: true,
        referralsEnabled: false,
        ratingsEnabled: true,
      },
    },
    customerConfig: {
      rewards: {
        referralStageOne: 100,
      },
    },
  });

  const referralStageOne = sections
    .flatMap((section) => section.items)
    .find((item) => item.id === 'referralStageOne');

  assert.equal(referralStageOne?.state, 'disabled');
});

test('summarizes referral milestone counts without exposing identities', () => {
  const summary = summarizeReferralList([
    { stageOneAwardedAt: new Date(), stageTwoAwardedAt: null },
    { stageOneAwardedAt: new Date(), stageTwoAwardedAt: new Date() },
  ]);

  assert.deepEqual(summary, {
    totalAttributed: 2,
    stageOneQualified: 2,
    stageTwoQualified: 1,
    pending: 1,
    completed: 1,
  });
});
