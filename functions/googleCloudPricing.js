const admin = require('firebase-admin');

const CLOUD_BILLING_BASE_URL = 'https://cloudbilling.googleapis.com';
const PRICE_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

const GOOGLE_CLOUD_SKU_IDS = {
  cloudVisionDocumentTextDetection: 'E1ED-E05F-8690',
  geminiFlashTextInput: 'A121-4A0A-8C2E',
  geminiFlashImageInput: '541C-9259-417D',
  geminiFlashTextOutput: '5410-AB73-BCB9',
};

let billingAccountCache = {
  value: '',
  expiresAt: 0,
};

const priceCache = new Map();

function nowMs() {
  return Date.now();
}

function roundMoney(value) {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric)) return 0;
  return Number(numeric.toFixed(6));
}

function getProjectId() {
  return String(
    process.env.GCLOUD_PROJECT
    || process.env.GCP_PROJECT
    || admin.app().options.projectId
    || '',
  ).trim();
}

async function getAccessToken() {
  const credential = admin.app().options.credential;
  if (!credential || typeof credential.getAccessToken !== 'function') {
    throw new Error('Application default credentials are unavailable for Cloud Billing lookups.');
  }

  const token = await credential.getAccessToken();
  const accessToken = String(token?.access_token || token?.accessToken || '').trim();
  if (!accessToken) {
    throw new Error('Unable to obtain an access token for Cloud Billing lookups.');
  }

  return accessToken;
}

async function billingApiGet(pathname, query = {}) {
  const url = new URL(`${CLOUD_BILLING_BASE_URL}${pathname}`);
  Object.entries(query).forEach(([key, value]) => {
    if (value == null || value === '') return;
    url.searchParams.set(key, String(value));
  });

  const accessToken = await getAccessToken();
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Cloud Billing API request failed (${response.status}): ${body || response.statusText}`);
  }

  return response.json();
}

async function getProjectBillingAccountName() {
  const projectId = getProjectId();
  if (!projectId) {
    throw new Error('Missing Google Cloud project id for Cloud Billing lookup.');
  }

  if (billingAccountCache.value && billingAccountCache.expiresAt > nowMs()) {
    return billingAccountCache.value;
  }

  const billingInfo = await billingApiGet(`/v1/projects/${encodeURIComponent(projectId)}/billingInfo`);
  const billingAccountName = String(billingInfo?.billingAccountName || '').trim();
  if (!billingAccountName) {
    throw new Error(`No billing account is linked to project ${projectId}.`);
  }

  billingAccountCache = {
    value: billingAccountName,
    expiresAt: nowMs() + PRICE_CACHE_TTL_MS,
  };

  return billingAccountName;
}

function getPriceCacheKey({ skuId, currencyCode }) {
  return `${skuId}:${String(currencyCode || 'ZAR').toUpperCase()}`;
}

async function getBillingAccountSkuPrice({ skuId, currencyCode = 'ZAR' }) {
  const normalizedSkuId = String(skuId || '').trim();
  if (!normalizedSkuId) {
    throw new Error('Missing SKU id for Cloud Billing price lookup.');
  }

  const normalizedCurrency = String(currencyCode || 'ZAR').trim().toUpperCase();
  const cacheKey = getPriceCacheKey({ skuId: normalizedSkuId, currencyCode: normalizedCurrency });
  const cached = priceCache.get(cacheKey);
  if (cached && cached.expiresAt > nowMs()) {
    return cached.value;
  }

  const billingAccountName = await getProjectBillingAccountName();
  const price = await billingApiGet(
    `/v1beta/${billingAccountName}/skus/${normalizedSkuId}/price`,
    { currencyCode: normalizedCurrency },
  );

  priceCache.set(cacheKey, {
    value: price,
    expiresAt: nowMs() + PRICE_CACHE_TTL_MS,
  });

  return price;
}

function moneyFromPriceObject(priceObject = {}) {
  const units = Number(priceObject?.units || 0);
  const nanos = Number(priceObject?.nanos || 0);
  return roundMoney(units + (nanos / 1_000_000_000));
}

function getPreferredTierPrice(tier = {}) {
  return tier?.contractPrice || tier?.listPrice || {};
}

function getUnitQuantity(price = {}) {
  const rawValue = price?.rate?.unitInfo?.unitQuantity?.value;
  const numeric = Number(rawValue || 1);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 1;
}

function getRateTiers(price = {}) {
  return Array.isArray(price?.rate?.tiers) ? price.rate.tiers : [];
}

function buildTierSegments(price = {}) {
  const tiers = getRateTiers(price);
  return tiers
    .map((tier, index) => {
      const startAmount = Number(tier?.startAmount?.value || 0);
      const nextTier = tiers[index + 1];
      const endAmountExclusive = nextTier ? Number(nextTier?.startAmount?.value || 0) : Number.POSITIVE_INFINITY;
      const tierPrice = moneyFromPriceObject(getPreferredTierPrice(tier));
      return {
        startAmount,
        endAmountExclusive,
        tierPrice,
      };
    })
    .sort((left, right) => left.startAmount - right.startAmount);
}

function computeTieredChargeFromPrice({
  price,
  priorUsageAmount = 0,
  usageAmount = 0,
}) {
  const normalizedUsageAmount = Math.max(0, Number(usageAmount || 0));
  const normalizedPriorUsageAmount = Math.max(0, Number(priorUsageAmount || 0));
  if (!normalizedUsageAmount) {
    return 0;
  }

  const unitQuantity = getUnitQuantity(price);
  const segments = buildTierSegments(price);
  const usageStart = normalizedPriorUsageAmount;
  const usageEnd = normalizedPriorUsageAmount + normalizedUsageAmount;
  let total = 0;

  segments.forEach((segment) => {
    const overlapStart = Math.max(usageStart, segment.startAmount);
    const overlapEnd = Math.min(usageEnd, segment.endAmountExclusive);
    if (overlapEnd <= overlapStart) return;

    const overlapAmount = overlapEnd - overlapStart;
    total += (overlapAmount / unitQuantity) * segment.tierPrice;
  });

  return roundMoney(total);
}

function computeLinearChargeFromPrice({
  price,
  usageAmount = 0,
}) {
  const normalizedUsageAmount = Math.max(0, Number(usageAmount || 0));
  if (!normalizedUsageAmount) {
    return 0;
  }

  const tiers = getRateTiers(price);
  const firstTier = tiers[0] || {};
  const unitQuantity = getUnitQuantity(price);
  const tierPrice = moneyFromPriceObject(getPreferredTierPrice(firstTier));
  return roundMoney((normalizedUsageAmount / unitQuantity) * tierPrice);
}

async function getCloudVisionDocumentTextPrice(currencyCode = 'ZAR') {
  return getBillingAccountSkuPrice({
    skuId: GOOGLE_CLOUD_SKU_IDS.cloudVisionDocumentTextDetection,
    currencyCode,
  });
}

async function getGeminiFlashTextInputPrice(currencyCode = 'ZAR') {
  return getBillingAccountSkuPrice({
    skuId: GOOGLE_CLOUD_SKU_IDS.geminiFlashTextInput,
    currencyCode,
  });
}

async function getGeminiFlashImageInputPrice(currencyCode = 'ZAR') {
  return getBillingAccountSkuPrice({
    skuId: GOOGLE_CLOUD_SKU_IDS.geminiFlashImageInput,
    currencyCode,
  });
}

async function getGeminiFlashTextOutputPrice(currencyCode = 'ZAR') {
  return getBillingAccountSkuPrice({
    skuId: GOOGLE_CLOUD_SKU_IDS.geminiFlashTextOutput,
    currencyCode,
  });
}

module.exports = {
  GOOGLE_CLOUD_SKU_IDS,
  computeLinearChargeFromPrice,
  computeTieredChargeFromPrice,
  getCloudVisionDocumentTextPrice,
  getGeminiFlashImageInputPrice,
  getGeminiFlashTextInputPrice,
  getGeminiFlashTextOutputPrice,
  getProjectBillingAccountName,
  moneyFromPriceObject,
};
