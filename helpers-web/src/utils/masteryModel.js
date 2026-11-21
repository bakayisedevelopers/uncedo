export const MASTERY_LEVELS = Object.freeze(['beginner', 'specialist', 'master', 'legend']);
export const MEMBERSHIP_LEVELS = Object.freeze(['neighbour', 'partner', 'friend', 'family']);

export const DEFAULT_MASTERY_CONFIG = Object.freeze({
  beginner: { minCompletedPaidJobs: 0, minAverageRating: 0, minRatingCount: 0 },
  specialist: { minCompletedPaidJobs: 50, minAverageRating: 4.6, minRatingCount: 10 },
  master: { minCompletedPaidJobs: 200, minAverageRating: 4.8, minRatingCount: 40 },
  legend: { minCompletedPaidJobs: 500, minAverageRating: 4.9, minRatingCount: 100 },
});

export const MASTERY_META = Object.freeze({
  beginner: {
    level: 'beginner',
    label: 'Beginner',
    rank: 1,
    tone: 'neutral',
    description: 'Starting Uncedo experience tier for this service option.',
  },
  specialist: {
    level: 'specialist',
    label: 'Specialist',
    rank: 2,
    tone: 'teal',
    description: 'Established delivery record and strong customer ratings on this option.',
  },
  master: {
    level: 'master',
    label: 'Master',
    rank: 3,
    tone: 'indigo',
    description: 'High volume of paid completions with consistently top ratings.',
  },
  legend: {
    level: 'legend',
    label: 'Legend',
    rank: 4,
    tone: 'amber',
    description: 'Highest platform experience recognition for this service option.',
  },
});

export const MEMBERSHIP_META = Object.freeze({
  neighbour: {
    level: 'neighbour',
    label: 'Neighbour',
    rank: 1,
    tone: 'neutral',
    description: 'Entry helper platform membership.',
  },
  partner: {
    level: 'partner',
    label: 'Partner',
    rank: 2,
    tone: 'teal',
    description: 'Reliable helper with verified profile and steady completions.',
  },
  friend: {
    level: 'friend',
    label: 'Friend',
    rank: 3,
    tone: 'indigo',
    description: 'Trusted, highly rated helper across Uncedo bookings.',
  },
  family: {
    level: 'family',
    label: 'Family',
    rank: 4,
    tone: 'amber',
    description: 'Highest overall helper platform membership tier.',
  },
});

function toNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function normalizeMasteryToken(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function normalizeStrictToken(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function buildServiceOptionMasteryKey(serviceId = '', optionId = '') {
  const cleanServiceId = String(serviceId || '').trim();
  if (!cleanServiceId) return '';
  const cleanOptionId = normalizeMasteryToken(optionId);
  return cleanOptionId ? `${cleanServiceId}__${cleanOptionId}` : cleanServiceId;
}

export function getMasteryMeta(level = 'beginner') {
  const normalized = String(level || 'beginner').trim().toLowerCase();
  return MASTERY_META[normalized] || MASTERY_META.beginner;
}

export function getMembershipMeta(level = 'neighbour') {
  const normalized = String(level || 'neighbour').trim().toLowerCase();
  return MEMBERSHIP_META[normalized] || MEMBERSHIP_META.neighbour;
}

export function mergeMasteryConfig(rawConfig = null) {
  const source = rawConfig && typeof rawConfig === 'object' ? rawConfig : {};
  const merged = {};
  for (const level of MASTERY_LEVELS) {
    const fallbackRule = DEFAULT_MASTERY_CONFIG[level];
    const override = source[level] && typeof source[level] === 'object' ? source[level] : {};
    merged[level] = {
      minCompletedPaidJobs: toNumber(override.minCompletedPaidJobs, fallbackRule.minCompletedPaidJobs),
      minAverageRating: toNumber(override.minAverageRating, fallbackRule.minAverageRating),
      minRatingCount: toNumber(override.minRatingCount, fallbackRule.minRatingCount),
    };
  }
  return merged;
}

function findMapRecord(map, candidateKeys = []) {
  if (!(map instanceof Map) || map.size === 0) return null;
  for (const key of candidateKeys) {
    if (key && map.has(key)) {
      return map.get(key);
    }
  }
  return null;
}

export function resolveOfferingMastery({
  offering = {},
  serviceOptionMasteryMap = null,
  serviceMasteryMap = null,
  optionRatingMap = null,
  serviceRatingMap = null,
} = {}) {
  const rawServiceId = String(offering?.serviceId || '').trim();
  const normalizedServiceId = normalizeStrictToken(rawServiceId || offering?.serviceName || '');
  const rawOptionId = String(offering?.optionId || '').trim();
  const normalizedOptionId = normalizeMasteryToken(rawOptionId);
  const strictOptionId = normalizeStrictToken(rawOptionId || offering?.optionTitle || '');
  const hasOption = Boolean(normalizedOptionId || strictOptionId);

  const primaryMasteryKey = buildServiceOptionMasteryKey(rawServiceId || normalizedServiceId, normalizedOptionId);
  const candidateKeys = [
    primaryMasteryKey,
    buildServiceOptionMasteryKey(normalizedServiceId, normalizedOptionId),
    buildServiceOptionMasteryKey(normalizedServiceId, strictOptionId),
  ].filter(Boolean);

  let masteryRecord = findMapRecord(serviceOptionMasteryMap, candidateKeys);
  let ratingRecord = findMapRecord(optionRatingMap, candidateKeys);
  let source = masteryRecord ? 'service_option' : 'default';

  // Fall back to service-level roll-up ONLY for service-wide offerings (without an optionId).
  if (!masteryRecord && !hasOption) {
    const serviceKeys = [rawServiceId, normalizedServiceId].filter(Boolean);
    masteryRecord = findMapRecord(serviceMasteryMap, serviceKeys);
    if (!ratingRecord) {
      ratingRecord = findMapRecord(serviceRatingMap, serviceKeys);
    }
    if (masteryRecord) {
      source = 'service_rollup';
    }
  }

  const levelRaw = String(masteryRecord?.level || 'beginner').trim().toLowerCase();
  const level = MASTERY_LEVELS.includes(levelRaw) ? levelRaw : 'beginner';
  const highestRaw = String(masteryRecord?.highestLevel || level).trim().toLowerCase();
  const highestLevel = MASTERY_LEVELS.includes(highestRaw) ? highestRaw : level;

  const eligibleCompletedJobCount = toNumber(
    masteryRecord?.eligibleCompletedJobCount
      ?? masteryRecord?.qualificationSnapshot?.eligibleCompletedJobCount,
    0,
  );
  const averageRating = toNumber(
    ratingRecord?.average
      ?? masteryRecord?.averageRating
      ?? masteryRecord?.qualificationSnapshot?.averageRating,
    0,
  );
  const ratingCount = toNumber(
    ratingRecord?.count
      ?? masteryRecord?.ratingCount
      ?? masteryRecord?.qualificationSnapshot?.ratingCount,
    0,
  );

  return {
    masteryKey: primaryMasteryKey || normalizedServiceId,
    serviceId: normalizedServiceId || rawServiceId,
    optionId: normalizedOptionId || strictOptionId || '',
    level,
    highestLevel,
    meta: getMasteryMeta(level),
    highestMeta: getMasteryMeta(highestLevel),
    eligibleCompletedJobCount,
    averageRating,
    ratingCount,
    hasOption,
    source,
    record: masteryRecord || null,
  };
}

function buildRequirement(label, current, target, formatter = (value) => String(Math.round(value))) {
  const numericTarget = toNumber(target, 0);
  const numericCurrent = toNumber(current, 0);
  const progress = numericTarget <= 0 ? 1 : clamp(numericCurrent / numericTarget, 0, 1);
  return {
    label,
    currentValue: numericCurrent,
    targetValue: numericTarget,
    current: formatter(numericCurrent),
    target: formatter(numericTarget),
    met: numericTarget <= 0 || numericCurrent >= numericTarget,
    progress,
  };
}

export function buildMasteryProgressModel({ mastery = {}, masteryConfig = DEFAULT_MASTERY_CONFIG } = {}) {
  const mergedConfig = mergeMasteryConfig(masteryConfig);
  const rawLevel = String(mastery?.level || 'beginner').trim().toLowerCase();
  const currentLevel = MASTERY_LEVELS.includes(rawLevel) ? rawLevel : 'beginner';
  const currentIndex = MASTERY_LEVELS.indexOf(currentLevel);
  const nextLevel = MASTERY_LEVELS[currentIndex + 1] || null;

  if (!nextLevel) {
    return {
      currentLevel,
      nextLevel: null,
      overallProgress: 1,
      requirements: [],
    };
  }

  const nextRule = mergedConfig[nextLevel] || {};
  const completedJobs = toNumber(
    mastery?.eligibleCompletedJobCount ?? mastery?.qualificationSnapshot?.eligibleCompletedJobCount,
    0,
  );
  const averageRating = toNumber(mastery?.averageRating, 0);
  const ratingCount = toNumber(mastery?.ratingCount, 0);

  const requirements = [
    buildRequirement('Completed paid jobs', completedJobs, nextRule.minCompletedPaidJobs),
    buildRequirement('Average rating', averageRating, nextRule.minAverageRating, (value) => value.toFixed(1)),
    buildRequirement('Customer ratings', ratingCount, nextRule.minRatingCount),
  ];

  const overallProgress = requirements.length
    ? requirements.reduce((sum, req) => sum + req.progress, 0) / requirements.length
    : 1;

  return {
    currentLevel,
    nextLevel,
    nextMeta: getMasteryMeta(nextLevel),
    overallProgress,
    requirements,
  };
}

export function buildHelperApprovedMasteryList({
  offerings = [],
  serviceOptionMasteryMap = null,
  serviceMasteryMap = null,
  optionRatingMap = null,
  serviceRatingMap = null,
} = {}) {
  const items = [];
  for (const offering of Array.isArray(offerings) ? offerings : []) {
    if (!offering) continue;
    const isApproved = offering.status === 'approved' && offering.approved === true;
    if (!isApproved) continue;

    const resolved = resolveOfferingMastery({
      offering,
      serviceOptionMasteryMap,
      serviceMasteryMap,
      optionRatingMap,
      serviceRatingMap,
    });

    items.push({
      offering,
      offeringId: String(offering.id || offering.offeringId || resolved.masteryKey).trim(),
      serviceName: String(offering.serviceName || offering.serviceId || 'Service').trim(),
      optionTitle: String(offering.optionTitle || '').trim(),
      displayName: offering.optionTitle
        ? `${String(offering.serviceName || offering.serviceId || '').trim()} — ${String(offering.optionTitle).trim()}`
        : String(offering.serviceName || offering.serviceId || 'Service').trim(),
      mastery: resolved,
    });
  }

  return items.sort((a, b) => {
    const rankDiff = b.mastery.meta.rank - a.mastery.meta.rank;
    if (rankDiff !== 0) return rankDiff;
    const jobDiff = b.mastery.eligibleCompletedJobCount - a.mastery.eligibleCompletedJobCount;
    if (jobDiff !== 0) return jobDiff;
    return a.displayName.localeCompare(b.displayName);
  });
}
