'use strict';

const { createVertexGeminiClient, generateVertexGeminiContent } = require('./whatsapp/vertexGemini');

const DEFAULT_IMAGE_MODEL = 'gemini-3.1-flash-lite-image';
const ALLOWED_REFERENCE_HOSTS = new Set([
  'firebasestorage.googleapis.com',
  'storage.googleapis.com',
]);
const MAX_REFERENCE_BYTES = 6 * 1024 * 1024;

function cleanText(value = '', maxLength = 500) {
  return String(value || '')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .trim()
    .slice(0, maxLength);
}

function parseDataUrl(dataUrl = '') {
  const match = String(dataUrl || '').trim().match(/^data:(image\/(?:png|jpeg|jpg|webp));base64,([A-Za-z0-9+/=\s]+)$/i);
  if (!match) return null;
  const mimeType = match[1].toLowerCase() === 'image/jpg' ? 'image/jpeg' : match[1].toLowerCase();
  const base64Data = match[2].replace(/\s+/g, '');
  if (!base64Data) return null;
  const approxBytes = Math.floor((base64Data.length * 3) / 4);
  if (approxBytes > MAX_REFERENCE_BYTES) {
    throw new Error('Reference image exceeds maximum size limit.');
  }
  return {
    inlineData: {
      mimeType,
      data: base64Data,
    },
  };
}

function isAllowedRemoteReferenceUrl(rawUrl = '') {
  try {
    const parsed = new URL(String(rawUrl || '').trim());
    return parsed.protocol === 'https:' && ALLOWED_REFERENCE_HOSTS.has(parsed.hostname.toLowerCase());
  } catch (_err) {
    return false;
  }
}

async function resolveReferenceImagePart({
  referenceImageDataUrl = '',
  referenceImageUrl = '',
  fetchImpl = globalThis.fetch,
} = {}) {
  const fromDataUrl = parseDataUrl(referenceImageDataUrl);
  if (fromDataUrl) return fromDataUrl;

  const remoteUrl = String(referenceImageUrl || '').trim();
  if (!remoteUrl || !isAllowedRemoteReferenceUrl(remoteUrl) || typeof fetchImpl !== 'function') {
    return null;
  }

  try {
    const response = await fetchImpl(remoteUrl);
    if (!response?.ok) return null;
    const rawContentType = String(response.headers?.get?.('content-type') || 'image/jpeg')
      .split(';')[0]
      .trim()
      .toLowerCase();
    if (!rawContentType.startsWith('image/')) return null;
    const mimeType = rawContentType === 'image/jpg' ? 'image/jpeg' : rawContentType;
    const arrayBuffer = await response.arrayBuffer();
    if (!arrayBuffer || arrayBuffer.byteLength === 0 || arrayBuffer.byteLength > MAX_REFERENCE_BYTES) {
      return null;
    }
    return {
      inlineData: {
        mimeType,
        data: Buffer.from(arrayBuffer).toString('base64'),
      },
    };
  } catch (_err) {
    return null;
  }
}

const SERVICE_IMAGE_DIRECTIONS = [
  'Hero overview photograph showing the core service actively being delivered with natural lighting and an inviting real-world composition.',
  'Craftsmanship and detail close-up highlighting hands-on technique, quality tools, supplies, and careful execution.',
  'Pristine finished result photograph showcasing a clean, satisfying completed outcome in a realistic customer home or setting.',
  'Preparation and studio/workstation readiness photograph showing organized, hygienic tools and premium care setup.',
  'Balanced wide lifestyle composition illustrating the service fitting naturally into an everyday home, vehicle, or personal care routine.',
];

const FULL_BLEED_IMAGE_RULES = [
  'FULL-BLEED EDGE-TO-EDGE PHOTOGRAPH: The photo scene MUST fill 100% of the entire 1:1 canvas from edge to edge and corner to corner. Strictly NO white, cream, or colored borders, NO Polaroid or picture frames, NO UI card layouts, NO blank margin or footer strips at the bottom, NO text overlays, NO price tags, NO corner logos or watermarks, and NO split-screen collages.',
  'BOTTOM-RIGHT WHITE LOGO VISIBILITY & CONTRAST RULE: Because a pure white brand logo will be stamped onto the bottom-right corner afterward, compose the scene with rich, medium-to-dark, or deep contrasting colors, natural shadows, dark wood, dark stone, deep foliage, or shaded surfaces in the bottom-right corner. Strictly AVOID white, off-white, bright cream, bright beige, pale yellow, pale gray, or bright blown-out highlights in the bottom-right corner so the white logo never becomes invisible or suffers contrast issues.',
].join('\n');

const REMOVE_REFERENCE_LOGO_RULE =
  'REMOVE ANY EXISTING LOGO/WATERMARK FROM THE REFERENCE IMAGE: If the reference photograph contains any corner logo, badge, watermark, or "uncedo" text (especially in the bottom-right corner), completely erase and replace that corner cleanly with natural surrounding scene texture and rich/darker shaded tones so the white logo applied afterward stays clearly visible. NEVER copy, keep, trace, or duplicate any logo or watermark from the reference image.';

function buildOptionImagePrompt({
  targetType = 'question_option',
  consistencyMode = 'consistent',
  serviceContext = {},
  optionContext = {},
  questionContext = {},
  serviceImageContext = {},
  hasReferenceImage = false,
} = {}) {
  const serviceLabel = cleanText(serviceContext?.label || serviceContext?.serviceId || 'Home & Personal Service', 120);
  const categoryName = cleanText(serviceContext?.categoryName || serviceContext?.categoryId || '', 80);
  const serviceDescription = cleanText(serviceContext?.description || '', 400);
  const siblingServiceOptions = (Array.isArray(serviceContext?.optionTitles) ? serviceContext.optionTitles : [])
    .map((item) => cleanText(item, 80))
    .filter(Boolean)
    .slice(0, 12);

  if (targetType === 'service_image') {
    const rawNumber = Number(serviceImageContext?.imageNumber || 1);
    const imageNumber = Number.isFinite(rawNumber) && rawNumber >= 1 ? Math.round(rawNumber) : 1;
    const direction = SERVICE_IMAGE_DIRECTIONS[(imageNumber - 1) % SERVICE_IMAGE_DIRECTIONS.length];
    return [
      `Generate a crisp, realistic, full-bleed commercial 1:1 gallery photograph (#${imageNumber}) for the service "${serviceLabel}"${categoryName ? ` (Category: ${categoryName})` : ''}.`,
      `Creative direction for image #${imageNumber}: ${direction}`,
      serviceDescription ? `Service overview: ${serviceDescription}.` : '',
      siblingServiceOptions.length ? `Available service options for realistic visual context: ${siblingServiceOptions.join(', ')}.` : '',
      'Deliver an authentic, well-lit, edge-to-edge photograph suitable for full-bleed gallery display.',
      FULL_BLEED_IMAGE_RULES,
    ].filter(Boolean).join('\n');
  }

  if (targetType === 'service_option') {
    const optionTitle = cleanText(optionContext?.title || 'Service option', 120);
    const optionDescription = cleanText(optionContext?.description || '', 320);

    if (hasReferenceImage && consistencyMode === 'consistent') {
      return [
        'Use the attached reference photograph as the visual and stylistic anchor.',
        REMOVE_REFERENCE_LOGO_RULE,
        'Preserve the same photographic aesthetic, natural lighting, framing, color grading, and surface/setting mood as the reference image.',
        `Now depict the specific service package/option: "${optionTitle}" for the "${serviceLabel}" service${categoryName ? ` (${categoryName})` : ''}.`,
        optionDescription ? `Option details: ${optionDescription}.` : '',
        serviceDescription ? `Service context: ${serviceDescription}.` : '',
        siblingServiceOptions.length ? `Other packages in this service for context (keep visually distinct yet cohesive): ${siblingServiceOptions.join(', ')}.` : '',
        FULL_BLEED_IMAGE_RULES,
      ].filter(Boolean).join('\n');
    }

    return [
      `Generate a crisp, realistic, full-bleed commercial 1:1 photograph representing the specific service option "${optionTitle}" under the "${serviceLabel}" service${categoryName ? ` (Category: ${categoryName})` : ''}.`,
      optionDescription ? `What this option covers: ${optionDescription}.` : '',
      serviceDescription ? `Overall service context: ${serviceDescription}.` : '',
      siblingServiceOptions.length ? `Keep this visually focused specifically on "${optionTitle}" (distinct from sibling options: ${siblingServiceOptions.join(', ')}).` : '',
      'Use clean natural lighting and balanced framing centered on the key visual subject.',
      FULL_BLEED_IMAGE_RULES,
    ].filter(Boolean).join('\n');
  }

  const questionPrompt = cleanText(questionContext?.prompt || '', 220);
  const optionLabel = cleanText(questionContext?.optionLabel || 'Option', 100);
  const siblingLabels = (Array.isArray(questionContext?.siblingOptionLabels) ? questionContext.siblingOptionLabels : [])
    .map((item) => cleanText(item, 80))
    .filter(Boolean)
    .slice(0, 15);

  if (consistencyMode === 'consistent') {
    if (hasReferenceImage) {
      return [
        'STRICT CONSISTENCY IMAGE EDIT:',
        'Use the attached reference photograph as the exact visual baseline.',
        REMOVE_REFERENCE_LOGO_RULE,
        'You MUST keep the EXACT SAME person, exact same hands/feet/body/subject, skin tone, finger/toe position, camera angle, lens distance, lighting, and overall background environment identical to the reference image (except erasing any corner logo/watermark as instructed above).',
        `Modify ONLY the specific detail representing the answer choice "${optionLabel}" for the question "${questionPrompt || 'Service preference'}" in the "${serviceLabel}" service${categoryName ? ` (${categoryName})` : ''}.`,
        'For example: if this is about nail color, length, or finish, keep the exact same hand/feet, pose, skin, and backdrop and ONLY change the nails to show "' + optionLabel + '". If about room/load/scale/equipment, keep the exact same camera framing and room/setting and adjust only the attribute for "' + optionLabel + '".',
        siblingLabels.length ? `Sibling choices in this exact series: ${siblingLabels.join(', ')}.` : '',
        'CRITICAL: Do NOT swap to a different person/model, do NOT change camera angle or background, and do NOT draw, keep, or duplicate any text, labels, logos, corner watermarks, borders, frames, bottom strips, or multi-panel collages. Keep the photograph full-bleed edge-to-edge with a darker/contrasting bottom-right corner so a pure white logo stamped afterward remains clearly visible.',
      ].filter(Boolean).join('\n');
    }

    return [
      'ANCHOR IMAGE FOR A CONSISTENT OPTION SERIES:',
      `Generate a crisp, realistic, full-bleed 1:1 studio-quality photograph illustrating the answer choice "${optionLabel}" for the question "${questionPrompt || 'Service preference'}".`,
      `Service: "${serviceLabel}"${categoryName ? ` (${categoryName})` : ''}.`,
      serviceDescription ? `Service context: ${serviceDescription}.` : '',
      siblingLabels.length ? `All choices in this same question: ${siblingLabels.join(', ')}.` : '',
      'IMPORTANT: Compose a clean, unmistakable, repeatable visual scene (for example: for manicure/nails show a close-up of manicured hands over a rich/darker contrasting surface or deep neutral drape; for pedicure show neatly posed feet on a rich/darker surface; for home/car/yard services show a clear medium close-up of the exact area/task). Keep framing, lighting, and background clean and dark/rich enough in the bottom-right corner so a pure white logo stays clearly visible across every option in this series.',
      FULL_BLEED_IMAGE_RULES,
    ].filter(Boolean).join('\n');
  }

  return [
    `Generate a realistic, distinct, high-clarity, full-bleed 1:1 photograph specifically depicting the choice "${optionLabel}" in response to the question "${questionPrompt || 'Service option'}".`,
    `Service: "${serviceLabel}"${categoryName ? ` (${categoryName})` : ''}.`,
    serviceDescription ? `Service context: ${serviceDescription}.` : '',
    siblingLabels.length ? `Sibling choices in this question: ${siblingLabels.join(', ')}. Make sure this image clearly illustrates "${optionLabel}" specifically.` : '',
    'Clean natural composition centered on the subject.',
    FULL_BLEED_IMAGE_RULES,
  ].filter(Boolean).join('\n');
}

function extractGeneratedImagePart(response = {}) {
  const candidates = Array.isArray(response?.candidates) ? response.candidates : [];
  for (const candidate of candidates) {
    const parts = Array.isArray(candidate?.content?.parts) ? candidate.content.parts : [];
    for (const part of parts) {
      const data = String(part?.inlineData?.data || '').replace(/\s+/g, '');
      if (data) {
        const rawMime = String(part?.inlineData?.mimeType || 'image/png').trim().toLowerCase();
        const mimeType = rawMime === 'image/jpg' ? 'image/jpeg' : rawMime;
        return {
          mimeType,
          data,
          imageDataUrl: `data:${mimeType};base64,${data}`,
        };
      }
    }
  }
  return null;
}

async function generateAdminOptionImage({
  targetType = 'question_option',
  consistencyMode = 'consistent',
  serviceContext = {},
  optionContext = {},
  questionContext = {},
  serviceImageContext = {},
  referenceImageDataUrl = '',
  referenceImageUrl = '',
  geminiProjectId = '',
  geminiLocation = 'global',
  geminiImageModel = DEFAULT_IMAGE_MODEL,
  timeoutMs = 55_000,
  clientFactory = createVertexGeminiClient,
  client = null,
  fetchImpl = globalThis.fetch,
} = {}) {
  const normalizedTarget = targetType === 'service_option'
    ? 'service_option'
    : (targetType === 'service_image' ? 'service_image' : 'question_option');
  const normalizedConsistency = normalizedTarget === 'service_image'
    ? 'unique'
    : (consistencyMode === 'unique' ? 'unique' : 'consistent');
  const modelId = String(geminiImageModel || DEFAULT_IMAGE_MODEL).trim();
  if (!/^[a-zA-Z0-9._-]{1,100}$/.test(modelId)) {
    throw new Error('Gemini image model configuration is invalid.');
  }

  const labelToDescribe = normalizedTarget === 'service_image'
    ? cleanText(serviceContext?.label || serviceContext?.serviceId || '', 120)
    : (normalizedTarget === 'service_option'
      ? cleanText(optionContext?.title || '', 120)
      : cleanText(questionContext?.optionLabel || '', 120));
  if (!labelToDescribe) {
    throw new Error(
      normalizedTarget === 'service_image'
        ? 'Please enter a service name before generating a service image.'
        : (normalizedTarget === 'service_option'
          ? 'Please enter an option title before generating an image.'
          : 'Please enter an option label before generating an image.'),
    );
  }

  const referencePart = normalizedConsistency === 'consistent'
    ? await resolveReferenceImagePart({ referenceImageDataUrl, referenceImageUrl, fetchImpl })
    : null;

  const prompt = buildOptionImagePrompt({
    targetType: normalizedTarget,
    consistencyMode: normalizedConsistency,
    serviceContext,
    optionContext,
    questionContext,
    serviceImageContext,
    hasReferenceImage: Boolean(referencePart),
  });

  const parts = referencePart
    ? [referencePart, { text: prompt }]
    : [{ text: prompt }];

  const geminiClient = client || clientFactory({
    projectId: geminiProjectId,
    location: geminiLocation,
    timeoutMs,
  });

  const response = await generateVertexGeminiContent({
    client: geminiClient,
    model: modelId,
    contents: [{ role: 'user', parts }],
    config: {
      imageConfig: {
        aspectRatio: '1:1',
      },
    },
  });

  const extracted = extractGeneratedImagePart(response);
  if (!extracted) {
    throw new Error('AI image generation did not return a usable image.');
  }

  return {
    imageDataUrl: extracted.imageDataUrl,
    mimeType: extracted.mimeType,
    model: modelId,
    usedReferenceImage: Boolean(referencePart),
  };
}

module.exports = {
  DEFAULT_IMAGE_MODEL,
  buildOptionImagePrompt,
  extractGeneratedImagePart,
  generateAdminOptionImage,
  isAllowedRemoteReferenceUrl,
  parseDataUrl,
  resolveReferenceImagePart,
};
