import { MEMBERSHIP_LEVELS, MASTERY_LEVELS, REWARD_REASON_CODES, REWARD_TRANSACTION_DIRECTIONS, REWARD_TRANSACTION_STATUSES } from '../../shared/rewards.js';
import { WEB_APP_BASE_URL } from '../../constants/runtimeConfig';

const DEFAULT_POINTS_PER_RAND = 10;
const DEFAULT_HELPER_BENEFITS = {
  neighbour: [
    { label: 'Access to standard helper requests', availability: 'active' },
    { label: 'Earn Uncedo Points', availability: 'active' },
    { label: 'Participate in referrals', availability: 'active' },
    { label: 'Standard support', availability: 'active' },
  ],
  partner: [
    { label: 'All Neighbour benefits', availability: 'active' },
    { label: 'Selected reward campaigns', availability: 'planned' },
    { label: 'Recognition badge', availability: 'active' },
    { label: 'Early access to selected opportunities', availability: 'planned' },
  ],
  friend: [
    { label: 'All Partner benefits', availability: 'active' },
    { label: 'Priority support', availability: 'planned' },
    { label: 'Enhanced profile recognition', availability: 'planned' },
    { label: 'Eligibility for selected featured-helper campaigns', availability: 'planned' },
    { label: 'Expanded annual recognition eligibility', availability: 'planned' },
  ],
  family: [
    { label: 'All Friend benefits', availability: 'active' },
    { label: 'Highest platform-membership recognition', availability: 'active' },
    { label: 'Top-tier annual appreciation eligibility', availability: 'planned' },
    { label: 'Priority consideration for beta programs', availability: 'planned' },
    { label: 'Highest configured helper campaign access', availability: 'planned' },
    { label: 'Eligibility for premium recognition benefits', availability: 'planned' },
  ],
};

const DEFAULT_RECOGNITION_BENEFITS = [
  { label: 'Featured-helper campaigns', availability: 'planned' },
  { label: 'Branded merchandise', availability: 'planned' },
  { label: 'Airtime, data, and fuel vouchers', availability: 'planned' },
  { label: 'Annual appreciation eligibility', availability: 'planned' },
];

const MEMBERSHIP_META = {
  neighbour: { label: 'Neighbour', tone: 'neutral', rank: 1 },
  partner: { label: 'Partner', tone: 'info', rank: 2 },
  friend: { label: 'Friend', tone: 'indigo', rank: 3 },
  family: { label: 'Family', tone: 'gold', rank: 4 },
};

const MASTERY_META = {
  beginner: { label: 'Beginner', tone: 'neutral', rank: 1 },
  specialist: { label: 'Specialist', tone: 'info', rank: 2 },
  master: { label: 'Master', tone: 'indigo', rank: 3 },
  legend: { label: 'Legend', tone: 'gold', rank: 4 },
};

const REASON_META = {
  [REWARD_REASON_CODES.HELPER_COMPLETED_PAID_JOB]: {
    label: 'Completed and paid job',
    shortLabel: 'Completed job',
    icon: 'briefcase-outline',
    group: 'jobs',
  },
  [REWARD_REASON_CODES.RATING_RECEIVED_EFFECT]: {
    label: 'Customer rating effect',
    shortLabel: 'Rating effect',
    icon: 'star-half-outline',
    group: 'quality',
  },
  [REWARD_REASON_CODES.RATING_SUBMITTED]: {
    label: 'Customer rating submitted',
    shortLabel: 'Rating submitted',
    icon: 'star-outline',
    group: 'quality',
  },
  [REWARD_REASON_CODES.REFERRAL_STAGE_ONE]: {
    label: 'Referral Stage One',
    shortLabel: 'Referral Stage One',
    icon: 'gift-outline',
    group: 'referrals',
  },
  [REWARD_REASON_CODES.REFERRAL_STAGE_TWO]: {
    label: 'Referral Stage Two',
    shortLabel: 'Referral Stage Two',
    icon: 'rocket-outline',
    group: 'referrals',
  },
  [REWARD_REASON_CODES.POINTS_EXPIRED]: {
    label: 'Points expired',
    shortLabel: 'Expired',
    icon: 'time-outline',
    group: 'adjustments',
  },
  [REWARD_REASON_CODES.REVERSAL]: {
    label: 'Reward reversed',
    shortLabel: 'Reversal',
    icon: 'arrow-undo-outline',
    group: 'adjustments',
  },
};

const HELPER_EARNING_ACTIVITIES = [
  {
    id: 'completedPaidJob',
    group: 'Completing Jobs',
    label: 'Complete and get paid for a job',
    description: 'Awarded after an eligible job is completed and paid through the trusted billing flow.',
    configPath: ['rewards', 'completedPaidJob'],
    state: 'active',
    frequency: 'Per eligible job',
  },
  {
    id: 'fiveStarRating',
    group: 'Quality and Ratings',
    label: 'Receive a five-star rating',
    description: 'Only awarded when the trusted rating endpoint applies a positive five-star effect.',
    configPath: ['ratingReceivedEffects', '5'],
    state: 'active',
    frequency: 'Per eligible rating',
  },
  {
    id: 'fourStarRating',
    group: 'Quality and Ratings',
    label: 'Receive a four-star rating',
    description: 'Only awarded when the trusted rating endpoint applies a positive four-star effect.',
    configPath: ['ratingReceivedEffects', '4'],
    state: 'active',
    frequency: 'Per eligible rating',
  },
  {
    id: 'lowCancellationRate',
    group: 'Reliability',
    label: 'Low cancellation-rate milestone',
    description: 'Shown when backend campaigns support reliability-based points.',
    configPath: ['rewards', 'lowCancellationRate'],
    state: 'planned',
    frequency: 'Campaign-based',
  },
  {
    id: 'highCompletionRate',
    group: 'Reliability',
    label: 'High completion-rate milestone',
    description: 'Shown when backend campaigns support completion-rate points.',
    configPath: ['rewards', 'highCompletionRate'],
    state: 'planned',
    frequency: 'Campaign-based',
  },
  {
    id: 'fastResponse',
    group: 'Reliability',
    label: 'Fast response milestone',
    description: 'Shown when backend campaigns support response-time points.',
    configPath: ['rewards', 'fastResponse'],
    state: 'planned',
    frequency: 'Campaign-based',
  },
  {
    id: 'beforeAfterProof',
    group: 'Verification and Proof',
    label: 'Before and after proof photos',
    description: 'Only available when proof-photo rewards are enabled in trusted backend logic.',
    configPath: ['rewards', 'beforeAfterProof'],
    state: 'planned',
    frequency: 'Per eligible job',
  },
  {
    id: 'verificationMaintenance',
    group: 'Verification and Proof',
    label: 'Maintain verification',
    description: 'Shown when backend verification-maintenance rewards are active.',
    configPath: ['rewards', 'verificationMaintenance'],
    state: 'planned',
    frequency: 'Campaign-based',
  },
  {
    id: 'helperReferral',
    group: 'Referrals',
    label: 'Refer a new helper',
    description: 'Only active when helper-referral milestones are configured in backend logic.',
    configPath: ['rewards', 'referralReward'],
    state: 'planned',
    frequency: 'Per qualified referral',
  },
  {
    id: 'customerReferral',
    group: 'Referrals',
    label: 'Refer a new customer',
    description: 'Only active when helper-to-customer referral milestones are configured in backend logic.',
    configPath: ['rewards', 'referralReward'],
    state: 'planned',
    frequency: 'Per qualified referral',
  },
];

function toNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
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

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatPoints(value) {
  return `${Math.round(toNumber(value)).toLocaleString('en-ZA')} pts`;
}

export function formatPointsToRand(points, pointsPerRand = DEFAULT_POINTS_PER_RAND) {
  const divisor = Math.max(1, toNumber(pointsPerRand, DEFAULT_POINTS_PER_RAND));
  return `R${(Math.max(0, toNumber(points)) / divisor).toFixed(2)}`;
}

export function formatPercent(value, digits = 0) {
  return `${(toNumber(value) * 100).toFixed(digits)}%`;
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

export function getMembershipDisplayMeta(level = 'neighbour') {
  return MEMBERSHIP_META[String(level || 'neighbour').trim().toLowerCase()] || MEMBERSHIP_META.neighbour;
}

export function getMasteryDisplayMeta(level = 'beginner') {
  return MASTERY_META[String(level || 'beginner').trim().toLowerCase()] || MASTERY_META.beginner;
}

export function getRewardReasonMeta(reasonCode = '') {
  return REASON_META[String(reasonCode || '').trim()] || {
    label: 'Reward activity',
    shortLabel: 'Reward',
    icon: 'sparkles-outline',
    group: 'other',
  };
}

export function buildTransactionDisplayModel(transaction = {}) {
  const meta = getRewardReasonMeta(transaction.reasonCode);
  const direction = String(transaction.direction || '').trim().toLowerCase();
  const points = Math.round(Math.abs(toNumber(transaction.points)));
  const signedAmount = direction === REWARD_TRANSACTION_DIRECTIONS.CREDIT ? `+${points}` : `-${points}`;
  const status = String(transaction.status || '').trim().toLowerCase();

  let statusLabel = 'Processed';
  if (status === REWARD_TRANSACTION_STATUSES.APPLIED) statusLabel = 'Applied';
  if (status === REWARD_TRANSACTION_STATUSES.REVERSED) statusLabel = 'Reversed';
  if (status === REWARD_TRANSACTION_STATUSES.EXPIRED) statusLabel = 'Expired';
  if (status === REWARD_TRANSACTION_STATUSES.VOID) statusLabel = 'Void';

  let directionLabel = 'Reward';
  if (direction === REWARD_TRANSACTION_DIRECTIONS.CREDIT) directionLabel = 'Credit';
  if (direction === REWARD_TRANSACTION_DIRECTIONS.DEBIT) directionLabel = 'Debit';
  if (direction === REWARD_TRANSACTION_DIRECTIONS.REVERSAL) directionLabel = 'Reversal';
  if (direction === REWARD_TRANSACTION_DIRECTIONS.EXPIRY) directionLabel = 'Expired';

  return {
    id: transaction.id || transaction.transactionId || '',
    title: meta.label,
    shortLabel: meta.shortLabel,
    icon: meta.icon,
    group: meta.group,
    points,
    signedAmount,
    statusLabel,
    directionLabel,
    createdAtLabel: formatDateTime(transaction.createdAt),
    expiresAtLabel: formatShortDate(transaction.expiresAt),
  };
}

function buildProgressRequirement(label, current, target, formatter = (value) => value) {
  const normalizedTarget = toNumber(target);
  const normalizedCurrent = toNumber(current);
  const progress = normalizedTarget <= 0 ? 1 : clamp(normalizedCurrent / normalizedTarget, 0, 1);

  return {
    label,
    current: formatter(normalizedCurrent),
    target: formatter(normalizedTarget),
    met: normalizedTarget <= 0 || normalizedCurrent >= normalizedTarget,
    progress,
  };
}

export function buildMembershipProgressModel({
  rewardAccount = {},
  ratingSummary = {},
  membershipConfig = {},
  profileMetrics = {},
  verificationStatus = '',
} = {}) {
  const currentLevel = String(rewardAccount?.membership?.currentLevel || 'neighbour').trim().toLowerCase();
  const nextLevel = MEMBERSHIP_LEVELS[MEMBERSHIP_LEVELS.indexOf(currentLevel) + 1] || null;
  if (!nextLevel) {
    return {
      currentLevel,
      nextLevel: null,
      overallProgress: 1,
      requirements: [],
    };
  }

  const rule = membershipConfig?.helper?.[nextLevel] || {};
  const jobs = toNumber(rewardAccount?.eligibleCompletedPaidJobs);
  const averageRating = toNumber(ratingSummary?.overallAverage);
  const ratingCount = toNumber(ratingSummary?.overallCount);
  const completionRate = toNumber(profileMetrics?.completionRate);
  const cancellationRate = toNumber(profileMetrics?.cancellationRate);
  const verified = String(verificationStatus || '').trim().toLowerCase() === 'verified';

  const requirements = [
    buildProgressRequirement('Completed paid jobs', jobs, rule.minCompletedPaidJobs),
    buildProgressRequirement('Overall rating', averageRating, rule.minAverageRating, (value) => value.toFixed(1)),
    buildProgressRequirement('Received ratings', ratingCount, rule.minRatingCount),
    buildProgressRequirement('Completion rate', completionRate, rule.minCompletionRate, (value) => formatPercent(value)),
  ];

  if (rule.maxCancellationRate != null) {
    const target = toNumber(rule.maxCancellationRate);
    const normalizedCurrent = toNumber(cancellationRate);
    requirements.push({
      label: 'Cancellation rate',
      current: formatPercent(normalizedCurrent),
      target: `<= ${formatPercent(target)}`,
      met: normalizedCurrent <= target,
      progress: target <= 0 ? (normalizedCurrent <= 0 ? 1 : 0) : clamp((target - normalizedCurrent) / target, 0, 1),
    });
  }

  if (rule.requireVerified) {
    requirements.push({
      label: 'Verified helper status',
      current: verified ? 'Verified' : 'Pending',
      target: 'Verified',
      met: verified,
      progress: verified ? 1 : 0,
    });
  }

  const overallProgress = requirements.length
    ? requirements.reduce((sum, item) => sum + item.progress, 0) / requirements.length
    : 1;

  return {
    currentLevel,
    nextLevel,
    overallProgress,
    requirements,
  };
}

export function buildMasteryProgressModel({
  mastery = {},
  masteryConfig = {},
  ratingSummary = {},
} = {}) {
  const currentLevel = String(mastery?.level || 'beginner').trim().toLowerCase();
  const nextLevel = MASTERY_LEVELS[MASTERY_LEVELS.indexOf(currentLevel) + 1] || null;
  if (!nextLevel) {
    return {
      currentLevel,
      nextLevel: null,
      overallProgress: 1,
      requirements: [],
    };
  }

  const rule = masteryConfig?.[nextLevel] || {};
  const jobCount = toNumber(mastery?.eligibleCompletedJobCount || mastery?.qualificationSnapshot?.eligibleCompletedJobCount);
  const averageRating = toNumber(ratingSummary?.average || mastery?.averageRating);
  const ratingCount = toNumber(ratingSummary?.count || mastery?.ratingCount);
  const requirements = [
    buildProgressRequirement('Completed paid jobs', jobCount, rule.minCompletedPaidJobs),
    buildProgressRequirement('Service rating', averageRating, rule.minAverageRating, (value) => value.toFixed(1)),
    buildProgressRequirement('Service ratings', ratingCount, rule.minRatingCount),
  ];

  return {
    currentLevel,
    nextLevel,
    overallProgress: requirements.reduce((sum, item) => sum + item.progress, 0) / requirements.length,
    requirements,
  };
}

export function buildReferralLink(code, role = 'customer') {
  const normalizedCode = String(code || '').trim();
  if (!normalizedCode) {
    return '';
  }

  const path = role === 'helper' ? '/signup?role=helper' : '/signup';
  return `${WEB_APP_BASE_URL}${path}${path.includes('?') ? '&' : '?'}ref=${encodeURIComponent(normalizedCode)}`;
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

export function maskReferralDisplay(item = {}, index = 0) {
  const referredType = String(item.referredAccountType || '').trim().toLowerCase();
  if (referredType === 'helper') {
    return `Referred helper ${index + 1}`;
  }
  return `Referred customer ${index + 1}`;
}

export function buildHowToEarnSections(helperConfig = {}, globalConfig = {}) {
  const featureFlags = globalConfig?.featureFlags || {};
  const grouped = new Map();

  HELPER_EARNING_ACTIVITIES.forEach((activity) => {
    const rawPoints = activity.configPath.reduce((value, key) => value?.[key], helperConfig);
    const points = toNumber(rawPoints);
    let state = activity.state;

    if (featureFlags.rewardsEnabled === false) {
      state = 'disabled';
    } else if (activity.group === 'Referrals' && featureFlags.referralsEnabled === false) {
      state = 'disabled';
    } else if (activity.group === 'Quality and Ratings' && featureFlags.ratingsEnabled === false) {
      state = 'disabled';
    } else if (points > 0 && activity.state !== 'planned') {
      state = 'active';
    } else if (points <= 0 && activity.state === 'active') {
      state = 'disabled';
    }

    const item = {
      ...activity,
      points,
      state,
    };

    if (!grouped.has(activity.group)) {
      grouped.set(activity.group, []);
    }
    grouped.get(activity.group).push(item);
  });

  return [...grouped.entries()].map(([title, items]) => ({ title, items }));
}

export function getHelperBenefits(level = 'neighbour') {
  return DEFAULT_HELPER_BENEFITS[String(level || 'neighbour').trim().toLowerCase()] || DEFAULT_HELPER_BENEFITS.neighbour;
}

export function getRecognitionBenefits() {
  return DEFAULT_RECOGNITION_BENEFITS;
}

export function buildAnnualRecognitionPreview(helperConfig = {}, rewardAccount = {}) {
  const tiers = Array.isArray(helperConfig?.annualPointTiers) ? helperConfig.annualPointTiers : [];
  const annual = rewardAccount?.annualRecognition || {};
  const annualPoints = toNumber(annual.points);

  if (!tiers.length) {
    return {
      active: false,
      annualPoints,
      tierLabel: 'Planned',
      nextTarget: null,
      resetDateLabel: '',
    };
  }

  const nextTier = tiers.find((item) => annualPoints < toNumber(item.minPoints));
  return {
    active: true,
    annualPoints,
    tierLabel: String(annual.tierLabel || annual.tier || 'Recognition').trim() || 'Recognition',
    nextTarget: nextTier ? toNumber(nextTier.minPoints) : null,
    resetDateLabel: formatShortDate(annual.resetAt),
  };
}
