import { WEB_APP_BASE_URL } from '../../constants/runtimeConfig';
import {
  MEMBERSHIP_LEVELS,
  REWARD_REASON_CODES,
  REWARD_TRANSACTION_DIRECTIONS,
  REWARD_TRANSACTION_STATUSES,
} from '../../shared/rewards';

const DEFAULT_POINTS_PER_RAND = 10;
const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_MEMBERSHIP_BENEFITS = {
  neighbour: [
    { label: 'Earn Uncedo Points', availability: 'active' },
    { label: 'Participate in referrals', availability: 'active' },
    { label: 'Standard support', availability: 'active' },
    { label: 'Access standard campaigns', availability: 'active' },
  ],
  partner: [
    { label: 'All Neighbour benefits', availability: 'active' },
    { label: 'Selected seasonal offers', availability: 'planned' },
    { label: 'Birthday reward eligibility', availability: 'planned' },
    { label: 'Member-only campaigns', availability: 'planned' },
  ],
  friend: [
    { label: 'All Partner benefits', availability: 'active' },
    { label: 'Priority support', availability: 'planned' },
    { label: 'Early access to selected services', availability: 'planned' },
    { label: 'Enhanced member offers', availability: 'planned' },
  ],
  family: [
    { label: 'All Friend benefits', availability: 'active' },
    { label: 'Highest customer membership recognition', availability: 'active' },
    { label: 'Family promotions', availability: 'planned' },
    { label: 'Beta-feature invitations', availability: 'planned' },
    { label: 'Annual appreciation eligibility', availability: 'planned' },
    { label: 'Highest configured referral campaign access', availability: 'planned' },
  ],
};

const REWARD_REASON_META = {
  [REWARD_REASON_CODES.PROFILE_COMPLETED]: {
    label: 'Profile completed',
    shortLabel: 'Profile',
    group: 'getting_started',
    icon: 'person-circle-outline',
  },
  [REWARD_REASON_CODES.PAYMENT_METHOD_VERIFIED]: {
    label: 'Payment method verified',
    shortLabel: 'Card verified',
    group: 'getting_started',
    icon: 'card-outline',
  },
  [REWARD_REASON_CODES.CUSTOMER_FIRST_COMPLETED_PAID_BOOKING]: {
    label: 'First completed and paid booking',
    shortLabel: 'First booking bonus',
    group: 'booking',
    icon: 'sparkles-outline',
  },
  [REWARD_REASON_CODES.CUSTOMER_COMPLETED_PAID_BOOKING]: {
    label: 'Completed and paid booking',
    shortLabel: 'Completed booking',
    group: 'booking',
    icon: 'briefcase-outline',
  },
  [REWARD_REASON_CODES.RATING_SUBMITTED]: {
    label: 'Post-job rating submitted',
    shortLabel: 'Rating submitted',
    group: 'ratings',
    icon: 'star-outline',
  },
  [REWARD_REASON_CODES.RATING_RECEIVED_EFFECT]: {
    label: 'Rating received effect',
    shortLabel: 'Rating effect',
    group: 'ratings',
    icon: 'star-half-outline',
  },
  [REWARD_REASON_CODES.REFERRAL_STAGE_ONE]: {
    label: 'Referral Stage One',
    shortLabel: 'Referral Stage One',
    group: 'referrals',
    icon: 'gift-outline',
  },
  [REWARD_REASON_CODES.REFERRAL_STAGE_TWO]: {
    label: 'Referral Stage Two',
    shortLabel: 'Referral Stage Two',
    group: 'referrals',
    icon: 'rocket-outline',
  },
  [REWARD_REASON_CODES.POINTS_EXPIRED]: {
    label: 'Points expired',
    shortLabel: 'Expired',
    group: 'expiry',
    icon: 'time-outline',
  },
  [REWARD_REASON_CODES.REVERSAL]: {
    label: 'Reward reversed',
    shortLabel: 'Reversal',
    group: 'adjustments',
    icon: 'arrow-undo-outline',
  },
};

const ACTIVITY_DEFINITIONS = [
  {
    id: 'profileCompleted',
    reasonCode: REWARD_REASON_CODES.PROFILE_COMPLETED,
    label: 'Complete required profile',
    description: 'Awarded after your required customer profile details are saved and confirmed by the trusted backend.',
    group: 'Getting Started',
    frequency: 'Once',
    supportState: 'active',
  },
  {
    id: 'paymentMethodVerified',
    reasonCode: REWARD_REASON_CODES.PAYMENT_METHOD_VERIFIED,
    label: 'Verify payment method',
    description: 'Awarded after a card is verified successfully through the trusted payment flow.',
    group: 'Getting Started',
    frequency: 'Once',
    supportState: 'active',
  },
  {
    id: 'firstCompletedPaidBooking',
    reasonCode: REWARD_REASON_CODES.CUSTOMER_FIRST_COMPLETED_PAID_BOOKING,
    label: 'First completed and paid booking bonus',
    description: 'Awarded once after your first eligible booking is completed and paid.',
    group: 'Booking and Completion',
    frequency: 'Once',
    supportState: 'active',
  },
  {
    id: 'completedPaidBooking',
    reasonCode: REWARD_REASON_CODES.CUSTOMER_COMPLETED_PAID_BOOKING,
    label: 'Complete and pay for a service',
    description: 'Awarded after successful service completion and payment.',
    group: 'Booking and Completion',
    frequency: 'Every eligible booking',
    supportState: 'active',
  },
  {
    id: 'ratingSubmitted',
    reasonCode: REWARD_REASON_CODES.RATING_SUBMITTED,
    label: 'Submit an eligible post-job rating',
    description: 'Awarded after a qualifying post-service rating is accepted by the trusted rating endpoint.',
    group: 'Ratings and Marketplace Conduct',
    frequency: 'Per eligible booking',
    supportState: 'active',
  },
  {
    id: 'postServicePhoto',
    label: 'Share an eligible post-service photo',
    description: 'Planned for a future trusted contribution flow.',
    group: 'Booking and Completion',
    frequency: 'Campaign-based',
    supportState: 'upcoming',
  },
  {
    id: 'referralStageOne',
    reasonCode: REWARD_REASON_CODES.REFERRAL_STAGE_ONE,
    label: 'Referral Stage One',
    description: 'Awarded when a referred new customer completes the required profile and verifies a payment method.',
    group: 'Referrals',
    frequency: 'Per qualified referral',
    supportState: 'active',
  },
  {
    id: 'referralStageTwo',
    reasonCode: REWARD_REASON_CODES.REFERRAL_STAGE_TWO,
    label: 'Referral Stage Two',
    description: 'Awarded when that referred customer completes and pays for a first eligible booking.',
    group: 'Referrals',
    frequency: 'Per qualified referral',
    supportState: 'active',
  },
  {
    id: 'dailyQualifyingActivity',
    label: 'Daily qualifying activity',
    description: 'Planned for a future trusted activity program.',
    group: 'Engagement',
    frequency: 'Daily',
    supportState: 'upcoming',
  },
  {
    id: 'sevenDayStreakBonus',
    label: 'Seven-day streak',
    description: 'Planned for a future trusted engagement streak.',
    group: 'Engagement',
    frequency: 'Every seven qualifying days',
    supportState: 'upcoming',
  },
  {
    id: 'thirtyDayStreakBonus',
    label: 'Thirty-day streak',
    description: 'Planned for a future trusted engagement streak.',
    group: 'Engagement',
    frequency: 'Every thirty qualifying days',
    supportState: 'upcoming',
  },
  {
    id: 'favouriteAction',
    label: 'Favourite activity',
    description: 'Only available when favourite actions are securely supported.',
    group: 'Engagement',
    frequency: 'Capped daily',
    supportState: 'upcoming',
  },
  {
    id: 'shareAction',
    label: 'Share activity',
    description: 'Only available when secure sharing campaigns are enabled.',
    group: 'Promotions',
    frequency: 'Capped daily',
    supportState: 'upcoming',
  },
];

function toNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

export function normalizeDateValue(value) {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value?.toDate === 'function') {
    const converted = value.toDate();
    return Number.isNaN(converted?.getTime?.()) ? null : converted;
  }

  if (typeof value?.seconds === 'number') {
    return new Date(value.seconds * 1000);
  }

  if (typeof value === 'number') {
    return new Date(value);
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatPoints(value) {
  return `${Math.round(toNumber(value)).toLocaleString('en-ZA')} pts`;
}

export function pointsToRandValue(points, pointsPerRand = DEFAULT_POINTS_PER_RAND) {
  const normalizedPoints = Math.max(0, toNumber(points));
  const divisor = Math.max(1, toNumber(pointsPerRand, DEFAULT_POINTS_PER_RAND));
  return normalizedPoints / divisor;
}

export function formatRand(value) {
  return `R${toNumber(value).toFixed(2)}`;
}

export function formatPointsToRand(points, pointsPerRand = DEFAULT_POINTS_PER_RAND) {
  return formatRand(pointsToRandValue(points, pointsPerRand));
}

export function formatShortDate(value) {
  const date = normalizeDateValue(value);
  if (!date) {
    return '';
  }

  return new Intl.DateTimeFormat('en-ZA', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

export function formatDateTime(value) {
  const date = normalizeDateValue(value);
  if (!date) {
    return '';
  }

  return new Intl.DateTimeFormat('en-ZA', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function getRewardReasonMeta(reasonCode = '') {
  return REWARD_REASON_META[String(reasonCode || '').trim()] || {
    label: 'Reward activity',
    shortLabel: 'Reward',
    group: 'other',
    icon: 'sparkles-outline',
  };
}

export function getTransactionStatusLabel(status = '') {
  const normalized = String(status || '').trim().toLowerCase();
  if (normalized === REWARD_TRANSACTION_STATUSES.APPLIED) return 'Applied';
  if (normalized === REWARD_TRANSACTION_STATUSES.REVERSED) return 'Reversed';
  if (normalized === REWARD_TRANSACTION_STATUSES.EXPIRED) return 'Expired';
  if (normalized === REWARD_TRANSACTION_STATUSES.VOID) return 'Void';
  return 'Processed';
}

export function getTransactionDirectionText(direction = '') {
  const normalized = String(direction || '').trim().toLowerCase();
  if (normalized === REWARD_TRANSACTION_DIRECTIONS.CREDIT) return 'Credit';
  if (normalized === REWARD_TRANSACTION_DIRECTIONS.DEBIT) return 'Debit';
  if (normalized === REWARD_TRANSACTION_DIRECTIONS.REVERSAL) return 'Reversal';
  if (normalized === REWARD_TRANSACTION_DIRECTIONS.EXPIRY) return 'Expired';
  return 'Reward';
}

export function buildTransactionDisplayModel(transaction = {}) {
  const reasonMeta = getRewardReasonMeta(transaction.reasonCode);
  const direction = String(transaction.direction || '').trim().toLowerCase();
  const points = Math.round(Math.abs(toNumber(transaction.points)));
  const signedAmount = direction === REWARD_TRANSACTION_DIRECTIONS.CREDIT
    ? `+${points}`
    : `-${points}`;

  return {
    id: String(transaction.id || transaction.transactionId || ''),
    title: reasonMeta.label,
    shortLabel: reasonMeta.shortLabel,
    group: reasonMeta.group,
    icon: reasonMeta.icon,
    points,
    signedAmount,
    directionLabel: getTransactionDirectionText(direction),
    statusLabel: getTransactionStatusLabel(transaction.status),
    createdAtLabel: formatDateTime(transaction.createdAt),
    expiresAtLabel: formatShortDate(transaction.expiresAt),
    requestId: transaction.requestId || '',
    referralId: transaction.referralId || '',
    primaryServiceId: transaction.primaryServiceId || '',
    reasonCode: transaction.reasonCode || '',
    status: transaction.status || '',
  };
}

export function buildReferralLink(code, baseUrl = WEB_APP_BASE_URL) {
  const normalizedCode = String(code || '').trim();
  if (!normalizedCode) {
    return '';
  }

  return `${String(baseUrl || WEB_APP_BASE_URL).replace(/\/+$/, '')}/signup?ref=${encodeURIComponent(normalizedCode)}`;
}

export function parseReferralCodeFromUrl(url) {
  if (!url) {
    return null;
  }

  try {
    const parsed = new URL(url);
    return (
      parsed.searchParams.get('ref')
      || parsed.searchParams.get('referral')
      || parsed.searchParams.get('referralCode')
      || parsed.searchParams.get('code')
      || null
    );
  } catch (error) {
    const match = String(url || '').match(/[?&](?:ref|referral|referralCode|code)=([^&#]+)/i);
    return match ? decodeURIComponent(match[1]) : null;
  }
}

export function getMembershipDisplayMeta(level = '') {
  const normalizedLevel = String(level || '').trim().toLowerCase();
  const index = Math.max(0, MEMBERSHIP_LEVELS.indexOf(normalizedLevel));
  const currentLevel = MEMBERSHIP_LEVELS[index] || MEMBERSHIP_LEVELS[0];

  const labelMap = {
    neighbour: 'Neighbour',
    partner: 'Partner',
    friend: 'Friend',
    family: 'Family',
  };
  const toneMap = {
    neighbour: 'surface',
    partner: 'brand',
    friend: 'indigo',
    family: 'gold',
  };

  return {
    level: currentLevel,
    label: labelMap[currentLevel] || 'Neighbour',
    tone: toneMap[currentLevel] || 'surface',
    rank: index + 1,
  };
}

export function getMembershipBenefits(level = '', membershipConfig = {}) {
  const normalizedLevel = String(level || '').trim().toLowerCase();
  const configured = membershipConfig?.customer?.[normalizedLevel]?.benefits;
  if (Array.isArray(configured) && configured.length) {
    return configured.map((item) => (
      typeof item === 'string'
        ? { label: item, availability: 'active' }
        : {
            label: String(item?.label || '').trim(),
            availability: String(item?.availability || 'active').trim().toLowerCase() || 'active',
          }
    )).filter((item) => item.label);
  }

  return DEFAULT_MEMBERSHIP_BENEFITS[normalizedLevel] || DEFAULT_MEMBERSHIP_BENEFITS.neighbour;
}

export function buildMembershipProgressModel({
  rewardAccount = {},
  ratingSummary = {},
  membershipConfig = {},
}) {
  const currentMembership = rewardAccount?.membership || {};
  const currentLevel = String(currentMembership.currentLevel || MEMBERSHIP_LEVELS[0]).trim().toLowerCase();
  const currentIndex = Math.max(0, MEMBERSHIP_LEVELS.indexOf(currentLevel));
  const nextLevel = MEMBERSHIP_LEVELS[currentIndex + 1] || null;
  const nextRule = nextLevel ? (membershipConfig?.customer?.[nextLevel] || {}) : null;
  const completedBookings = toNumber(rewardAccount?.eligibleCompletedPaidBookings);
  const ratingAverage = toNumber(
    currentMembership?.qualificationSnapshot?.overallAverage ?? ratingSummary?.overallAverage,
  );
  const ratingCount = toNumber(
    currentMembership?.qualificationSnapshot?.overallCount ?? ratingSummary?.overallCount,
  );
  const cancellationRate = toNumber(currentMembership?.qualificationSnapshot?.cancellationRate, 0);
  const completionRate = toNumber(currentMembership?.qualificationSnapshot?.completionRate, 1);
  const severeRestriction = ['restricted', 'blocked', 'suspended'].includes(
    String(rewardAccount?.membership?.qualificationSnapshot?.restrictedStatus || '').trim().toLowerCase(),
  );

  const requirements = nextRule ? [
    {
      key: 'completed_bookings',
      label: 'Completed paid bookings',
      current: completedBookings,
      target: toNumber(nextRule.minCompletedPaidBookings),
      met: completedBookings >= toNumber(nextRule.minCompletedPaidBookings),
      progress: nextRule.minCompletedPaidBookings ? Math.min(1, completedBookings / Math.max(1, toNumber(nextRule.minCompletedPaidBookings))) : 1,
    },
    {
      key: 'average_rating',
      label: 'Overall customer rating',
      current: ratingAverage,
      target: toNumber(nextRule.minAverageRating),
      met: ratingAverage >= toNumber(nextRule.minAverageRating),
      progress: nextRule.minAverageRating ? Math.min(1, ratingAverage / Math.max(1, toNumber(nextRule.minAverageRating))) : 1,
    },
    {
      key: 'rating_count',
      label: 'Received ratings',
      current: ratingCount,
      target: toNumber(nextRule.minRatingCount),
      met: ratingCount >= toNumber(nextRule.minRatingCount),
      progress: nextRule.minRatingCount ? Math.min(1, ratingCount / Math.max(1, toNumber(nextRule.minRatingCount))) : 1,
    },
    ...(typeof nextRule.maxCancellationRate === 'number'
      ? [{
          key: 'cancellation_rate',
          label: 'Cancellation standing',
          current: cancellationRate,
          target: nextRule.maxCancellationRate,
          met: cancellationRate <= toNumber(nextRule.maxCancellationRate),
          progress: cancellationRate <= toNumber(nextRule.maxCancellationRate)
            ? 1
            : Math.max(0, 1 - ((cancellationRate - toNumber(nextRule.maxCancellationRate)) / Math.max(0.01, toNumber(nextRule.maxCancellationRate)))),
        }]
      : []),
    ...(nextRule.requireNoSevereConductRestriction
      ? [{
          key: 'conduct',
          label: 'Conduct standing',
          current: severeRestriction ? 0 : 1,
          target: 1,
          met: !severeRestriction,
          progress: severeRestriction ? 0 : 1,
        }]
      : []),
  ] : [];

  const overallProgress = requirements.length
    ? requirements.reduce((total, item) => total + item.progress, 0) / requirements.length
    : 1;

  return {
    currentLevel,
    nextLevel,
    requirements,
    overallProgress,
    completedBookings,
    ratingAverage,
    ratingCount,
    completionRate,
    cancellationRate,
    highestLevel: String(currentMembership.highestLevel || currentLevel || MEMBERSHIP_LEVELS[0]).trim().toLowerCase(),
    achievedAtLabel: formatShortDate(currentMembership.achievedAt),
  };
}

export function summarizeExpiringPoints(transactions = [], days = 30) {
  const cutoffMs = Date.now() + (days * DAY_MS);
  const expiringEntries = (Array.isArray(transactions) ? transactions : []).filter((entry) => {
    const expiresAt = normalizeDateValue(entry.expiresAt);
    const remainingPoints = Math.max(0, toNumber(entry.remainingPoints, entry.points));
    return expiresAt && expiresAt.getTime() <= cutoffMs && remainingPoints > 0;
  });

  if (!expiringEntries.length) {
    return {
      amount: 0,
      nextExpiryAt: null,
      entries: [],
    };
  }

  const sortedEntries = [...expiringEntries].sort((left, right) => (
    normalizeDateValue(left.expiresAt)?.getTime?.() || 0
  ) - (
    normalizeDateValue(right.expiresAt)?.getTime?.() || 0
  ));

  return {
    amount: sortedEntries.reduce((total, entry) => total + Math.max(0, toNumber(entry.remainingPoints, entry.points)), 0),
    nextExpiryAt: normalizeDateValue(sortedEntries[0]?.expiresAt),
    entries: sortedEntries,
  };
}

export function buildHowToEarnSections({
  globalConfig = {},
  customerConfig = {},
}) {
  const rewardsEnabled = globalConfig?.featureFlags?.rewardsEnabled !== false;
  const referralsEnabled = globalConfig?.featureFlags?.referralsEnabled !== false;
  const ratingsEnabled = globalConfig?.featureFlags?.ratingsEnabled !== false;
  const activities = (customerConfig?.activityCatalog || ACTIVITY_DEFINITIONS).map((activity) => {
    const rewardKey = activity.id;
    const points = toNumber(customerConfig?.rewards?.[rewardKey]);
    let state = activity.supportState || 'upcoming';

    if (state === 'active' && !rewardsEnabled) {
      state = 'disabled';
    } else if (state === 'active' && activity.group === 'Referrals' && !referralsEnabled) {
      state = 'disabled';
    } else if (state === 'active' && activity.group === 'Ratings and Marketplace Conduct' && !ratingsEnabled) {
      state = 'disabled';
    }

    return {
      ...activity,
      points,
      state,
      isActive: state === 'active',
    };
  });

  return activities.reduce((groups, activity) => {
    const existingGroup = groups.find((entry) => entry.title === activity.group);
    if (existingGroup) {
      existingGroup.items.push(activity);
      return groups;
    }

    groups.push({
      title: activity.group,
      items: [activity],
    });
    return groups;
  }, []);
}

export function summarizeReferralList(referrals = []) {
  const items = Array.isArray(referrals) ? referrals : [];
  const stageOneQualified = items.filter((item) => item.stageOneQualifiedAt || item.stageOneAwardedAt).length;
  const stageTwoQualified = items.filter((item) => item.stageTwoQualifiedAt || item.stageTwoAwardedAt).length;
  const completed = items.filter((item) => item.stageTwoAwardedAt).length;

  return {
    totalAttributed: items.length,
    stageOneQualified,
    stageTwoQualified,
    pending: Math.max(0, items.length - completed),
    completed,
  };
}

