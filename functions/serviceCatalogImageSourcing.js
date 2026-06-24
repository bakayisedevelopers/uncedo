const { GoogleGenAI } = require('@google/genai');
const sharp = require('sharp');
const { randomUUID } = require('crypto');

const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash';
const OPENVERSE_ENDPOINT = 'https://api.openverse.org/v1/images/';
const WIKIMEDIA_ENDPOINT = 'https://commons.wikimedia.org/w/api.php';
const DEFAULT_TARGET_DIMENSIONS = { width: 1200, height: 900 };

let vertexAiClient = null;
let vertexAiClientKey = '';

function clip(value = '', max = 600) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max)}...`;
}

function slugify(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function uniq(values = []) {
  return [...new Set((Array.isArray(values) ? values : []).map((value) => String(value || '').trim()).filter(Boolean))];
}

function parseJsonObject(text = '') {
  const raw = String(text || '').trim();
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch (_error) {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(raw.slice(start, end + 1));
      } catch (_nestedError) {
        return null;
      }
    }
  }

  return null;
}

function stripHtml(value = '') {
  return String(value || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function getVertexAiConfig(overrides = {}) {
  const config = {
    projectId: overrides.projectId
      || overrides.FIREBASE_PROJECT_ID
      || overrides.VITE_FIREBASE_PROJECT_ID
      || overrides.GOOGLE_CLOUD_PROJECT
      || process.env.GOOGLE_CLOUD_PROJECT
      || process.env.GCLOUD_PROJECT
      || process.env.FIREBASE_PROJECT_ID
      || process.env.VITE_FIREBASE_PROJECT_ID,
    location: overrides.location
      || overrides.GOOGLE_CLOUD_LOCATION
      || overrides.VERTEX_AI_LOCATION
      || overrides.FIREBASE_AI_LOCATION
      || process.env.GOOGLE_CLOUD_LOCATION
      || process.env.VERTEX_AI_LOCATION
      || process.env.FIREBASE_AI_LOCATION
      || 'us-central1',
  };

  if (!config.projectId) {
    throw new Error('UNCEDO_AI_KEYS is missing Vertex AI project configuration.');
  }

  return config;
}

function getVertexAiClient(options = {}) {
  const config = getVertexAiConfig(options.firebaseConfig || {});
  const clientKey = `${config.projectId}:${config.location}`;
  if (!vertexAiClient || vertexAiClientKey !== clientKey) {
    vertexAiClient = new GoogleGenAI({
      vertexai: true,
      project: config.projectId,
      location: config.location,
    });
    vertexAiClientKey = clientKey;
  }

  return vertexAiClient;
}

function buildManualQueries(service = {}) {
  const label = clip(service.label || '', 120);
  const categoryName = clip(service.categoryName || '', 80);
  const description = clip(service.description || '', 180);
  const includedLabels = (Array.isArray(service.includedServices) ? service.includedServices : [])
    .map((item) => clip(item?.label || item?.id || '', 80))
    .filter(Boolean);

  const queries = uniq([
    label,
    `${label} service`,
    categoryName ? `${categoryName} ${label}` : '',
    categoryName ? `${categoryName} service` : '',
    description ? `${label} ${description}` : '',
    ...includedLabels,
    ...includedLabels.map((value) => `${label} ${value}`),
  ]);

  return queries.slice(0, 8);
}

async function buildSearchQueriesWithAi({ firebaseConfig = {}, service = {} } = {}) {
  const manualQueries = buildManualQueries(service);
  const ai = getVertexAiClient({ firebaseConfig });
  const prompt = [
    'You prepare image-search phrases for an admin catalog of real-world home services.',
    'Return valid JSON only.',
    'Do not return explanations.',
    'The goal is to find existing real photos on open-license platforms.',
    'Avoid logos, posters, icon packs, product ads, screenshots, text-heavy graphics, and watermarked results.',
    'Favor direct service activity, tools, finished outcomes, and customer-ready scenes.',
    'If the service is a bundle, include searches covering the bundle and the included services.',
    'Return up to 8 short search phrases in English.',
    'JSON shape: {"queries":["..."]}',
    `Service name: ${clip(service.label || '', 140)}`,
    `Prompt label: ${clip(service.promptLabel || '', 140)}`,
    `Category: ${clip(service.categoryName || service.categoryId || '', 120)}`,
    `Kind: ${clip(service.kind || 'service', 40)}`,
    `Description: ${clip(service.description || '', 400)}`,
    `Included services: ${clip((service.includedServices || []).map((item) => item?.label || item?.id || '').filter(Boolean).join(', '), 300)}`,
  ].join('\n');

  const result = await ai.models.generateContent({
    model: firebaseConfig.GEMINI_MODEL || firebaseConfig.FIREBASE_AI_MODEL || DEFAULT_GEMINI_MODEL,
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    config: {
      temperature: 0.2,
      maxOutputTokens: 300,
      responseMimeType: 'application/json',
    },
  });

  const parsed = parseJsonObject(String(result?.text || '').trim());
  const aiQueries = uniq(Array.isArray(parsed?.queries) ? parsed.queries : []);
  return uniq([...aiQueries, ...manualQueries]).slice(0, 8);
}

async function searchOpenverse(query, limit = 8) {
  const params = new URLSearchParams({
    q: String(query || '').trim(),
    page_size: String(Math.max(1, Math.min(limit, 20))),
    mature: 'false',
  });

  const response = await fetch(`${OPENVERSE_ENDPOINT}?${params.toString()}`, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'UncedoServiceCatalog/1.0',
    },
  });

  if (!response.ok) {
    return [];
  }

  const payload = await response.json().catch(() => ({}));
  return (Array.isArray(payload?.results) ? payload.results : [])
    .map((item) => ({
      source: 'openverse',
      sourceId: String(item.id || '').trim(),
      title: clip(item.title || query, 140),
      imageUrl: String(item.url || item.thumbnail || '').trim(),
      pageUrl: String(item.foreign_landing_url || item.detail_url || '').trim(),
      width: Number(item.width || 0),
      height: Number(item.height || 0),
      mimeType: String(item.filetype || '').trim().toLowerCase(),
      attribution: clip(item.attribution || '', 300),
      creator: clip(item.creator || '', 140),
      license: clip(`${item.license || ''} ${item.license_version || ''}`, 80).trim(),
    }))
    .filter((item) => item.imageUrl);
}

async function searchWikimediaCommons(query, limit = 8) {
  const params = new URLSearchParams({
    action: 'query',
    generator: 'search',
    gsrsearch: String(query || '').trim(),
    gsrnamespace: '6',
    gsrlimit: String(Math.max(1, Math.min(limit, 20))),
    prop: 'imageinfo',
    iiprop: 'url|size|mime|extmetadata',
    iiurlwidth: '1600',
    format: 'json',
    origin: '*',
  });

  const response = await fetch(`${WIKIMEDIA_ENDPOINT}?${params.toString()}`, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'UncedoServiceCatalog/1.0',
    },
  });

  if (!response.ok) {
    return [];
  }

  const payload = await response.json().catch(() => ({}));
  const pages = Object.values(payload?.query?.pages || {});
  return pages
    .map((page) => {
      const info = Array.isArray(page?.imageinfo) ? page.imageinfo[0] : null;
      if (!info) return null;

      const license = stripHtml(info?.extmetadata?.LicenseShortName?.value || info?.extmetadata?.License?.value || '');
      return {
        source: 'wikimedia',
        sourceId: String(page?.title || '').trim(),
        title: clip(stripHtml(info?.extmetadata?.ObjectName?.value || page?.title || query), 140),
        imageUrl: String(info?.thumburl || info?.url || '').trim(),
        pageUrl: String(info?.descriptionurl || '').trim(),
        width: Number(info?.thumbwidth || info?.width || 0),
        height: Number(info?.thumbheight || info?.height || 0),
        mimeType: String(info?.mime || '').trim().toLowerCase(),
        attribution: clip(stripHtml(info?.extmetadata?.Artist?.value || ''), 220),
        creator: clip(stripHtml(info?.extmetadata?.Artist?.value || ''), 140),
        license,
      };
    })
    .filter(Boolean)
    .filter((item) => item.imageUrl);
}

async function collectImageCandidates({ firebaseConfig = {}, service = {}, limit = 20 } = {}) {
  const queries = await buildSearchQueriesWithAi({ firebaseConfig, service }).catch(() => buildManualQueries(service));
  const candidates = [];
  const seen = new Set();

  for (const query of queries) {
    const [openverseResults, wikimediaResults] = await Promise.all([
      searchOpenverse(query, 6).catch(() => []),
      searchWikimediaCommons(query, 4).catch(() => []),
    ]);

    [...openverseResults, ...wikimediaResults].forEach((candidate) => {
      const key = `${candidate.source}:${candidate.imageUrl}`;
      if (!candidate.imageUrl || seen.has(key)) return;
      seen.add(key);
      candidates.push({
        ...candidate,
        query,
      });
    });

    if (candidates.length >= limit) {
      break;
    }
  }

  return candidates.slice(0, limit);
}

function clamp(value, min, max) {
  return Math.min(Math.max(Number(value || 0), min), max);
}

function resolveTargetDimensions(metadata = null) {
  const width = Number(metadata?.width || 0);
  const height = Number(metadata?.height || 0);
  if (!width || !height) {
    return { ...DEFAULT_TARGET_DIMENSIONS };
  }

  const ratio = width / height;
  if (!Number.isFinite(ratio) || ratio < 0.45 || ratio > 2.4) {
    return { ...DEFAULT_TARGET_DIMENSIONS };
  }

  const normalizedWidth = clamp(width, 900, 1600);
  const scaledHeight = clamp(Math.round(normalizedWidth / ratio), 600, 1400);
  return {
    width: normalizedWidth,
    height: scaledHeight,
  };
}

function buildStorageDownloadUrl(bucketName = '', objectPath = '', token = '') {
  return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(objectPath)}?alt=media&token=${token}`;
}

async function downloadAndNormalizeImage(candidate = {}, targetDimensions = null) {
  const response = await fetch(String(candidate.imageUrl || '').trim(), {
    headers: {
      Accept: 'image/*',
      'User-Agent': 'UncedoServiceCatalog/1.0',
    },
  });

  if (!response.ok) {
    throw new Error(`Image download failed with status ${response.status}.`);
  }

  const contentType = String(response.headers.get('content-type') || candidate.mimeType || '').trim().toLowerCase();
  if (!contentType.startsWith('image/')) {
    throw new Error('Downloaded asset is not an image.');
  }

  const arrayBuffer = await response.arrayBuffer();
  const originalBuffer = Buffer.from(arrayBuffer);
  const metadata = await sharp(originalBuffer).rotate().metadata();
  const finalTarget = targetDimensions || resolveTargetDimensions(metadata);
  const outputBuffer = await sharp(originalBuffer)
    .rotate()
    .resize(finalTarget.width, finalTarget.height, {
      fit: 'cover',
      position: 'attention',
    })
    .jpeg({
      quality: 84,
      chromaSubsampling: '4:4:4',
    })
    .toBuffer();

  return {
    buffer: outputBuffer,
    targetDimensions: finalTarget,
    metadata,
    contentType: 'image/jpeg',
  };
}

async function uploadImageToStorage({ bucket, serviceId, index, buffer, source = {} }) {
  const timestamp = Date.now();
  const objectPath = `service-catalog/${serviceId}/ai/${timestamp}-${index + 1}-${slugify(source.title || 'service') || 'service'}.jpg`;
  const token = randomUUID();
  const file = bucket.file(objectPath);

  await file.save(buffer, {
    resumable: false,
    metadata: {
      contentType: 'image/jpeg',
      cacheControl: 'public,max-age=86400',
      metadata: {
        firebaseStorageDownloadTokens: token,
        source: String(source.source || '').trim(),
        sourceId: String(source.sourceId || '').trim(),
        sourcePageUrl: String(source.pageUrl || '').trim(),
        sourceLicense: String(source.license || '').trim(),
        sourceCreator: String(source.creator || '').trim(),
      },
    },
  });

  return {
    id: `img_${randomUUID().replace(/-/g, '').slice(0, 12)}`,
    uri: buildStorageDownloadUrl(bucket.name, objectPath, token),
    objectPath,
    uploadedAt: new Date().toISOString(),
    source: String(source.source || '').trim(),
    sourcePageUrl: String(source.pageUrl || '').trim(),
    attribution: String(source.attribution || '').trim(),
    license: String(source.license || '').trim(),
  };
}

async function sourceServiceCatalogImages({
  firebaseConfig = {},
  bucket,
  service = {},
  targetCount = 10,
} = {}) {
  if (!bucket || typeof bucket.file !== 'function') {
    throw new Error('Firebase Storage bucket is required for service image sourcing.');
  }

  const serviceId = slugify(service.serviceId || service.id || service.label || '');
  if (!serviceId) {
    throw new Error('Service id is required before sourcing images.');
  }

  const requestedCount = clamp(targetCount || 10, 1, 10);
  const candidates = await collectImageCandidates({
    firebaseConfig,
    service,
    limit: Math.max(requestedCount * 4, 12),
  });

  if (!candidates.length) {
    throw new Error('No reusable images were found for this service.');
  }

  const uploads = [];
  let targetDimensions = null;

  for (const candidate of candidates) {
    if (uploads.length >= requestedCount) break;

    try {
      const normalized = await downloadAndNormalizeImage(candidate, targetDimensions);
      targetDimensions = normalized.targetDimensions;
      const uploaded = await uploadImageToStorage({
        bucket,
        serviceId,
        index: uploads.length,
        buffer: normalized.buffer,
        source: candidate,
      });
      uploads.push(uploaded);
    } catch (_error) {
      // Skip unusable images and keep sourcing until the quota is filled or candidates run out.
    }
  }

  if (!uploads.length) {
    throw new Error('Image sourcing ran, but none of the candidate images could be normalized and uploaded.');
  }

  return {
    images: uploads,
    targetDimensions: targetDimensions || { ...DEFAULT_TARGET_DIMENSIONS },
    attemptedCandidates: candidates.length,
  };
}

module.exports = {
  sourceServiceCatalogImages,
};
