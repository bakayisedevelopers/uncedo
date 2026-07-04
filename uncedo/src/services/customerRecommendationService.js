import { addDoc, collection, doc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { getFirebaseClients } from '../firebase/config';

function normalizeText(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase();
}

function normalizeNumber(value = 0) {
  const next = Number(value);
  return Number.isFinite(next) ? next : 0;
}

function normalizeScoreMap(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.entries(value).reduce((acc, [key, entry]) => {
    const score = typeof entry === 'number' ? entry : Number(entry?.score ?? entry?.value ?? 0);
    if (Number.isFinite(score)) {
      acc[String(key || '').trim().toLowerCase()] = score;
    }
    return acc;
  }, {});
}

function normalizeCountMap(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.entries(value).reduce((acc, [key, entry]) => {
    const count = typeof entry === 'number' ? entry : Number(entry?.count ?? entry?.value ?? 0);
    if (Number.isFinite(count)) {
      acc[String(key || '').trim().toLowerCase()] = count;
    }
    return acc;
  }, {});
}

function hashString(value = '') {
  let hash = 0;
  const input = String(value || '');
  for (let index = 0; index < input.length; index += 1) {
    hash = ((hash << 5) - hash) + input.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
}

function seededNoise(seed = '') {
  return (hashString(seed) % 1000) / 1000;
}

function dayBucket(value = Date.now()) {
  const date = new Date(Number(value) || Date.now());
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

export function normalizeRecommendationProfile(profile = {}) {
  return {
    id: String(profile.id || profile.customerId || '').trim(),
    customerId: String(profile.customerId || profile.id || '').trim(),
    eventCounts: normalizeCountMap(profile.eventCounts || {}),
    serviceScores: normalizeScoreMap(profile.serviceScores || {}),
    categoryScores: normalizeScoreMap(profile.categoryScores || {}),
    serviceCounts: normalizeCountMap(profile.serviceCounts || {}),
    categoryCounts: normalizeCountMap(profile.categoryCounts || {}),
    serviceExposureCounts: normalizeCountMap(profile.serviceExposureCounts || {}),
    categoryExposureCounts: normalizeCountMap(profile.categoryExposureCounts || {}),
    serviceLastEventAt: profile.serviceLastEventAt || {},
    categoryLastEventAt: profile.categoryLastEventAt || {},
    recentServiceIds: Array.isArray(profile.recentServiceIds) ? profile.recentServiceIds : [],
    recentCategoryIds: Array.isArray(profile.recentCategoryIds) ? profile.recentCategoryIds : [],
    topServiceIds: Array.isArray(profile.topServiceIds) ? profile.topServiceIds : [],
    topCategoryIds: Array.isArray(profile.topCategoryIds) ? profile.topCategoryIds : [],
    lastEventAt: profile.lastEventAt || null,
    lastEventType: profile.lastEventType || '',
    lastEventId: profile.lastEventId || '',
    updatedAt: profile.updatedAt || null,
    createdAt: profile.createdAt || null,
  };
}

export function subscribeToCustomerRecommendationProfile(customerId, callback, onError) {
  if (!customerId) {
    callback(normalizeRecommendationProfile({}));
    return () => {};
  }

  const { db } = getFirebaseClients();
  return onSnapshot(
    doc(db, 'customerRecommendationProfiles', customerId),
    (snapshot) => callback(snapshot.exists() ? normalizeRecommendationProfile({ id: snapshot.id, ...snapshot.data() }) : normalizeRecommendationProfile({ customerId })),
    onError,
  );
}

export async function recordCustomerServiceEvent({
  customerId,
  eventType,
  serviceId = '',
  categoryId = '',
  serviceIds = [],
  source = '',
  metadata = {},
  sessionId = '',
  requestId = '',
} = {}) {
  if (!customerId || !eventType) return null;

  const { db } = getFirebaseClients();
  const normalizedServiceIds = Array.from(new Set(
    (Array.isArray(serviceIds) ? serviceIds : [serviceId])
      .map((value) => String(value || '').trim().toLowerCase())
      .filter(Boolean),
  ));

  const docRef = await addDoc(collection(db, 'customerServiceEvents'), {
    customerId: String(customerId).trim(),
    eventType: String(eventType).trim().toLowerCase(),
    serviceId: String(serviceId || normalizedServiceIds[0] || '').trim().toLowerCase(),
    categoryId: String(categoryId || '').trim().toLowerCase(),
    serviceIds: normalizedServiceIds,
    source: String(source || '').trim().toLowerCase(),
    metadata: metadata && typeof metadata === 'object' ? metadata : {},
    sessionId: String(sessionId || '').trim(),
    requestId: String(requestId || metadata?.requestId || '').trim(),
    createdAt: serverTimestamp(),
    createdAtMs: Date.now(),
    dayBucket: dayBucket(),
  });

  return docRef.id;
}

function getPreferredCategoryBoost(itemCategoryId, preferredCategoryIds = []) {
  const normalizedCategoryId = normalizeText(itemCategoryId);
  if (!normalizedCategoryId) return 0;
  return preferredCategoryIds.includes(normalizedCategoryId) ? 0.55 : 0;
}

function scoreCustomerServiceItem(item = {}, profile = {}, context = {}, categoryUsage = {}) {
  const serviceId = normalizeText(item.entityId || item.id || '');
  const categoryId = normalizeText(item.categoryId || '');
  const helperCount = normalizeNumber(item.helperCount);
  const serviceScore = normalizeNumber(profile.serviceScores?.[serviceId]);
  const categoryScore = normalizeNumber(profile.categoryScores?.[categoryId]);
  const serviceCount = normalizeNumber(profile.serviceCounts?.[serviceId]);
  const categoryCount = normalizeNumber(profile.categoryCounts?.[categoryId]);
  const lastServiceEventAt = normalizeNumber(profile.serviceLastEventAt?.[serviceId]);
  const lastCategoryEventAt = normalizeNumber(profile.categoryLastEventAt?.[categoryId]);
  const preferredCategoryIds = Array.isArray(context.preferredCategoryIds)
    ? context.preferredCategoryIds.map((value) => normalizeText(value)).filter(Boolean)
    : [];
  const preferredBoost = getPreferredCategoryBoost(categoryId, preferredCategoryIds);
  const helperBoost = Math.min(helperCount, 8) * 0.12;
  const serviceAffinityBoost = serviceScore * 1.8;
  const categoryAffinityBoost = categoryScore * 1.1;
  const noveltyBoost = serviceCount === 0 ? 0.65 : 0;
  const categoryNoveltyBoost = categoryCount === 0 ? 0.22 : 0;
  const recentServiceBoost = lastServiceEventAt ? Math.max(0, 1 - ((Date.now() - lastServiceEventAt) / (1000 * 60 * 60 * 24 * 30))) * 0.55 : 0;
  const recentCategoryBoost = lastCategoryEventAt ? Math.max(0, 1 - ((Date.now() - lastCategoryEventAt) / (1000 * 60 * 60 * 24 * 21))) * 0.25 : 0;
  const categoryCrowdingPenalty = (categoryUsage[categoryId] || 0) * 0.35;
  const explorationBoost = seededNoise(`${context.customerId || ''}|${serviceId}|${dayBucket()}`) * (serviceCount < 3 ? 0.25 : 0.08);

  return Number((
    serviceAffinityBoost
    + categoryAffinityBoost
    + preferredBoost
    + helperBoost
    + noveltyBoost
    + categoryNoveltyBoost
    + recentServiceBoost
    + recentCategoryBoost
    + explorationBoost
    - categoryCrowdingPenalty
  ).toFixed(6));
}

export function rankCustomerServiceItems(items = [], { customerId = '', recommendationProfile = {}, preferredCategoryIds = [] } = {}) {
  const normalizedProfile = normalizeRecommendationProfile(recommendationProfile);
  const remaining = (Array.isArray(items) ? items : [])
    .map((item) => ({
      item,
      baseScore: scoreCustomerServiceItem(item, normalizedProfile, { customerId, preferredCategoryIds }, {}),
    }))
    .filter((entry) => entry.item)
    .sort((left, right) => right.baseScore - left.baseScore || String(left.item.title || '').localeCompare(String(right.item.title || '')));

  const ordered = [];
  const categoryUsage = {};

  while (remaining.length) {
    let bestIndex = 0;
    let bestScore = Number.NEGATIVE_INFINITY;

    remaining.forEach((entry, index) => {
      const categoryId = normalizeText(entry.item.categoryId || '');
      const adjustedScore = entry.baseScore - (categoryUsage[categoryId] || 0) * 0.35;
      const tieBreak = seededNoise(`${customerId}|${entry.item.entityId || entry.item.id || ''}|${ordered.length}`);
      const finalScore = adjustedScore + (tieBreak * 0.02);
      if (finalScore > bestScore) {
        bestScore = finalScore;
        bestIndex = index;
      }
    });

    const [picked] = remaining.splice(bestIndex, 1);
    const pickedCategoryId = normalizeText(picked.item.categoryId || '');
    categoryUsage[pickedCategoryId] = (categoryUsage[pickedCategoryId] || 0) + 1;
    ordered.push({
      ...picked.item,
      rankScore: picked.baseScore,
    });
  }

  return ordered;
}
