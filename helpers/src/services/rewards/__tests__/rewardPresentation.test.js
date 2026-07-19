import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAnnualRecognitionPreview,
  buildHowToEarnSections,
  buildMasteryProgressModel,
  buildMembershipProgressModel,
  buildReferralLink,
  buildTransactionDisplayModel,
  formatPointsToRand,
  getMasteryDisplayMeta,
  getMembershipDisplayMeta,
  maskReferralDisplay,
  summarizeReferralList,
} from '../rewardPresentation.js';
import { REWARD_REASON_CODES } from '../../../shared/rewards.js';

test('formats helper points to rand safely', () => {
  assert.equal(formatPointsToRand(125, 10), 'R12.50');
});

test('maps helper membership display metadata', () => {
  assert.deepEqual(getMembershipDisplayMeta('friend'), {
    label: 'Friend',
    tone: 'indigo',
    rank: 3,
  });
});

test('maps mastery display metadata', () => {
  assert.deepEqual(getMasteryDisplayMeta('legend'), {
    label: 'Legend',
    tone: 'gold',
    rank: 4,
  });
});

test('builds helper membership progress from trusted metrics', () => {
  const progress = buildMembershipProgressModel({
    rewardAccount: {
      eligibleCompletedPaidJobs: 30,
      membership: { currentLevel: 'neighbour' },
    },
    ratingSummary: {
      overallAverage: 4.5,
      overallCount: 6,
    },
    membershipConfig: {
      helper: {
        partner: {
          minCompletedPaidJobs: 25,
          minAverageRating: 4.3,
          minRatingCount: 5,
          minCompletionRate: 0.8,
          maxCancellationRate: 0.2,
          requireVerified: true,
        },
      },
    },
    profileMetrics: {
      completionRate: 0.9,
      cancellationRate: 0.1,
    },
    verificationStatus: 'verified',
  });

  assert.equal(progress.nextLevel, 'partner');
  assert.equal(progress.requirements.every((item) => item.met), true);
});

test('builds mastery progress toward the next service level', () => {
  const progress = buildMasteryProgressModel({
    mastery: {
      level: 'beginner',
      eligibleCompletedJobCount: 40,
      averageRating: 4.7,
      ratingCount: 8,
    },
    masteryConfig: {
      specialist: {
        minCompletedPaidJobs: 50,
        minAverageRating: 4.6,
        minRatingCount: 10,
      },
    },
    ratingSummary: {
      average: 4.7,
      count: 8,
    },
  });

  assert.equal(progress.nextLevel, 'specialist');
  assert.equal(progress.requirements[0].met, false);
});

test('falls back safely when helper config is missing', () => {
  const sections = buildHowToEarnSections({}, {});
  assert.ok(sections.length > 0);
});

test('maps helper transaction labels for job rewards', () => {
  const display = buildTransactionDisplayModel({
    direction: 'credit',
    points: 50,
    reasonCode: REWARD_REASON_CODES.HELPER_COMPLETED_PAID_JOB,
    status: 'applied',
  });

  assert.equal(display.title, 'Completed and paid job');
  assert.equal(display.signedAmount, '+50');
});

test('builds helper and customer referral links safely', () => {
  assert.equal(buildReferralLink('HELP123', 'customer'), 'https://uncedo.bakayise.com/signup?ref=HELP123');
  assert.equal(buildReferralLink('HELP123', 'helper'), 'https://uncedo.bakayise.com/signup?role=helper&ref=HELP123');
});

test('summarizes referral counts and masks identities', () => {
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
  assert.equal(maskReferralDisplay({ referredAccountType: 'helper' }, 0), 'Referred helper 1');
});

test('builds planned annual recognition preview safely when tiers are absent', () => {
  const preview = buildAnnualRecognitionPreview({}, {});
  assert.equal(preview.active, false);
  assert.equal(preview.tierLabel, 'Planned');
});
