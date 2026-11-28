'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createVertexGeminiClient, generateVertexGeminiContent } = require('./whatsapp/vertexGemini');

const DEFAULT_IMAGE_MODEL = 'gemini-3.1-flash-lite-image';
const DEFAULT_OPTION_IMAGE_ASPECT_RATIO = '9:16';
const DEFAULT_SERVICE_IMAGE_ASPECT_RATIO = '1:1';
const HELPERS_WHITE_LOGO_ASSET_PATH = path.join(__dirname, 'assets', 'helpers-wordmark-white-ref.png');
const ALLOWED_REFERENCE_HOSTS = new Set([
  'firebasestorage.googleapis.com',
  'storage.googleapis.com',
]);
const MAX_REFERENCE_BYTES = 6 * 1024 * 1024;

let cachedHelpersLogoPart;

function getHelpersWordmarkLogoPart(assetPath = HELPERS_WHITE_LOGO_ASSET_PATH) {
  if (assetPath === HELPERS_WHITE_LOGO_ASSET_PATH && cachedHelpersLogoPart !== undefined) {
    return cachedHelpersLogoPart;
  }
  try {
    if (!fs.existsSync(assetPath)) {
      if (assetPath === HELPERS_WHITE_LOGO_ASSET_PATH) cachedHelpersLogoPart = null;
      return null;
    }
    const base64 = fs.readFileSync(assetPath).toString('base64');
    const part = base64
      ? {
          inlineData: {
            mimeType: 'image/png',
            data: base64,
          },
        }
      : null;
    if (assetPath === HELPERS_WHITE_LOGO_ASSET_PATH) cachedHelpersLogoPart = part;
    return part;
  } catch (_err) {
    if (assetPath === HELPERS_WHITE_LOGO_ASSET_PATH) cachedHelpersLogoPart = null;
    return null;
  }
}

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

async function resolveContextImageParts({
  contextImages = [],
  seenInlineData = new Set(),
  fetchImpl = globalThis.fetch,
  maxImages = 3,
} = {}) {
  const candidates = Array.isArray(contextImages) ? contextImages.slice(0, maxImages) : [];
  if (!candidates.length) return [];

  const resolvedParts = await Promise.all(
    candidates.map(async (item) => {
      if (!item || typeof item !== 'object') return null;
      const part = await resolveReferenceImagePart({
        referenceImageDataUrl: String(item.imageDataUrl || ''),
        referenceImageUrl: String(item.imageUrl || ''),
        fetchImpl,
      });
      if (!part?.inlineData?.data) return null;
      return {
        label: cleanText(item.label || 'Upstream option', 140),
        sourceType: cleanText(item.sourceType || 'context', 40),
        part,
      };
    }),
  );

  const unique = [];
  for (const entry of resolvedParts) {
    if (!entry) continue;
    const rawData = entry.part.inlineData.data;
    if (seenInlineData.has(rawData)) continue;
    seenInlineData.add(rawData);
    unique.push(entry);
    if (unique.length >= maxImages) break;
  }
  return unique;
}

const SERVICE_IMAGE_DIRECTIONS = [
  'Hero overview photograph showing the core service actively being delivered with natural lighting and an inviting real-world composition.',
  'Craftsmanship and detail close-up highlighting hands-on technique, quality tools, supplies, and careful execution.',
  'Pristine finished result photograph showcasing a clean, satisfying completed outcome in a realistic customer home or setting.',
  'Preparation and studio/workstation readiness photograph showing organized, hygienic tools and premium care setup.',
  'Balanced wide lifestyle composition illustrating the service fitting naturally into an everyday home, vehicle, or personal care routine.',
];

const SERVICE_GALLERY_FULL_BLEED_RULES = [
  'FULL-BLEED EDGE-TO-EDGE PHOTOGRAPH: The photo scene MUST fill 100% of the entire 1:1 canvas from edge to edge and corner to corner. Strictly NO white, cream, or colored borders, NO Polaroid or picture frames, NO UI card layouts, NO blank margin or footer strips at the bottom, NO text overlays, NO price tags, NO corner logos or watermarks, and NO split-screen collages.',
  'BOTTOM-RIGHT WHITE LOGO VISIBILITY & CONTRAST RULE: Because a pure white brand logo will be stamped onto the bottom-right corner afterward, compose the scene with rich, medium-to-dark, or deep contrasting colors, natural shadows, dark wood, dark stone, deep foliage, or shaded surfaces in the bottom-right corner. Strictly AVOID white, off-white, bright cream, bright beige, pale yellow, pale gray, or bright blown-out highlights in the bottom-right corner so the white logo never becomes invisible or suffers contrast issues.',
].join('\n');

const OPTION_PORTRAIT_FULL_BLEED_RULES = [
  'FULL-BLEED 9:16 VERTICAL PORTRAIT PHOTOGRAPH: The photo scene MUST fill 100% of the entire vertical 9:16 canvas from edge to edge and corner to corner so it fits cleanly inside a full-screen mobile reel viewer. Strictly NO white, cream, or colored borders, NO Polaroid or picture frames, NO UI card layouts, NO blank margin or footer strips, NO text overlays, NO price tags, NO corner logos or watermarks, and NO split-screen collages.',
  'TOP-LEFT WHITE LOGO VISIBILITY & CONTRAST RULE: Because a pure white brand logo will be stamped onto the top-left corner afterward, compose the vertical scene with rich, medium-to-dark, or deep contrasting colors, natural shadows, dark walls, dark foliage, shaded timber, or deep background tones in the top-left corner. Keep the main subject framed slightly below the top-left edge so the top-left corner stays clean, uncluttered, and dark enough that the white logo remains sharp and readable—strictly AVOID white, off-white, bright sky, bright window glare, pale cream, or blown-out highlights in the top-left corner.',
].join('\n');

const REMOVE_REFERENCE_LOGO_RULE =
  'REMOVE ANY EXISTING CORNER LOGO/WATERMARK FROM THE REFERENCE IMAGE: If the reference photograph contains any corner logo, badge, watermark, or "uncedo" text (in the top-left, top-right, bottom-left, bottom-right, or floating anywhere outside clothing), completely erase and replace that corner area cleanly with natural surrounding scene texture and rich/darker shaded tones in the top-left corner. NEVER copy, keep, trace, or duplicate any corner logo or watermark from the reference image.';

function buildHelpersUniformLogoRules({
  hasReferenceImage = false,
  contextImageDescriptors = [],
  hasHelpersLogo = true,
} = {}) {
  const descriptors = Array.isArray(contextImageDescriptors) ? contextImageDescriptors : [];
  const roleLines = [];
  let imageIdx = 1;
  if (hasReferenceImage) {
    roleLines.push(
      `IMAGE ${imageIdx} is the SAME-QUESTION CONSISTENCY REFERENCE photograph (preserve the exact same person/subject, framing, lighting, and setting, modifying ONLY the target choice).`,
    );
    imageIdx += 1;
  }
  descriptors.forEach((desc) => {
    const label = cleanText(desc?.label || 'Upstream context option', 140);
    roleLines.push(
      `IMAGE ${imageIdx} is an UPSTREAM VISUAL CONTEXT REFERENCE (${label}). Use it to understand and keep authentic visual continuity with the selected service option and prior customer choices (hairstyle, garment, room, subject, or setting), while NEVER copying any corner logo or watermark from it.`,
    );
    imageIdx += 1;
  });
  if (hasHelpersLogo) {
    roleLines.push(
      `IMAGE ${imageIdx} is the official pure-white "uncedo helpers" logo reference ("uncedo" with the subtle swirl accent inside the "o" and "helpers" spaced underneath, shown on a dark teal swatch).`,
    );
  }

  const imageRoleExplanation = roleLines.length
    ? (roleLines.length === 1 && !hasReferenceImage && !descriptors.length && hasHelpersLogo
      ? 'ATTACHED BRAND LOGO REFERENCE: The attached image shows the exact pure-white "uncedo helpers" logo ("uncedo" with the subtle swirl accent inside the "o" and "helpers" spaced underneath) on a dark teal swatch.'
      : `IMAGE ROLES:\n${roleLines.join('\n')}`)
    : 'BRAND WORDMARK: Use the exact lowercase "uncedo" lettering with the subtle swirl accent on the "o" and "helpers" spaced underneath in pure white.';

  return [
    imageRoleExplanation,
    'SERVICE PROVIDER CLOTHING BRANDING (WHITE "UNCEDO HELPERS" LOGO ON UNIFORM ONLY): Whenever a service provider / helper is visible in the photo (showing their torso, chest, shoulders, polo shirt, t-shirt, apron, overalls, or work jacket), print the EXACT attached pure-white "uncedo helpers" logo naturally onto the chest/front (or visible upper sleeve) of their uniform/shirt, following natural fabric folds and lighting. Dress the service provider in a dark or deep-colored uniform or shirt (such as deep teal, charcoal, dark navy, or black) so the pure-white "uncedo helpers" logo stands out clearly against their shirt color. Copy the attached white "uncedo helpers" logo verbatim—DO NOT invent, redesign, alter, or substitute any other logo, symbol, or text, and NEVER print the rectangular swatch box behind the lettering. If no service provider clothing appears in the frame (e.g., only hands, feet, tools, or an empty room), do not place any logo on objects or surfaces.',
    'STRICT BAN ON CORNER OR SCENE LOGOS ANYWHERE IN THE IMAGE: NEVER generate, draw, stamp, or place ANY logo, icon, watermark, badge, or "uncedo" / "uncedo helpers" text in the bottom-right, bottom-left, top-right, top-left, margins, walls, vehicles, or anywhere else on the image. The ONLY place the "uncedo helpers" logo is ever permitted to appear inside the generated image is printed directly on the service providers\' clothes.',
  ].join('\n');
}

function buildQuestionFlowContextBlock(questionContext = {}) {
  const serviceOption = questionContext?.serviceOption && typeof questionContext.serviceOption === 'object'
    ? questionContext.serviceOption
    : null;
  const serviceOptionTitle = cleanText(serviceOption?.title || '', 120);
  const serviceOptionDesc = cleanText(serviceOption?.description || '', 260);
  const steps = Array.isArray(questionContext?.contextChain) ? questionContext.contextChain : [];

  const lines = [];
  if (serviceOptionTitle) {
    lines.push(
      `SELECTED TOP SERVICE OPTION: "${serviceOptionTitle}"${serviceOptionDesc ? ` (${serviceOptionDesc})` : ''}.`,
    );
  }
  if (steps.length > 0) {
    lines.push('UPSTREAM CUSTOMER DECISION PATH (FROM TOP TO CURRENT QUESTION):');
    steps.forEach((step, idx) => {
      const qPrompt = cleanText(step?.questionPrompt || step?.questionId || '', 180);
      const selectedAnswers = (Array.isArray(step?.selectedAnswers) ? step.selectedAnswers : [])
        .map((ans) => cleanText(ans, 80))
        .filter(Boolean);
      if (qPrompt || selectedAnswers.length) {
        lines.push(
          `  ${idx + 1}. Question: "${qPrompt}" -> Selected answer: ${selectedAnswers.length ? selectedAnswers.map((a) => `"${a}"`).join(' / ') : '(chosen)'}`,
        );
      }
    });
  }
  if (!lines.length) return '';
  lines.push(
    'IMPORTANT VISUAL CONTINUITY: Ensure the generated photo accurately combines this selected service option and every upstream choice above with the target option being illustrated.',
  );
  return lines.join('\n');
}

function buildOptionImagePrompt({
  targetType = 'question_option',
  consistencyMode = 'consistent',
  serviceContext = {},
  optionContext = {},
  questionContext = {},
  serviceImageContext = {},
  hasReferenceImage = false,
  contextImageDescriptors = [],
  hasHelpersLogo = true,
} = {}) {
  const serviceLabel = cleanText(serviceContext?.label || serviceContext?.serviceId || 'Home & Personal Service', 120);
  const categoryName = cleanText(serviceContext?.categoryName || serviceContext?.categoryId || '', 80);
  const serviceDescription = cleanText(serviceContext?.description || '', 400);
  const siblingServiceOptions = (Array.isArray(serviceContext?.optionTitles) ? serviceContext.optionTitles : [])
    .map((item) => cleanText(item, 80))
    .filter(Boolean)
    .slice(0, 12);
  const helpersUniformLogoRules = buildHelpersUniformLogoRules({
    hasReferenceImage,
    contextImageDescriptors,
    hasHelpersLogo,
  });

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
      helpersUniformLogoRules,
      SERVICE_GALLERY_FULL_BLEED_RULES,
    ].filter(Boolean).join('\n');
  }

  if (targetType === 'service_option') {
    const optionTitle = cleanText(optionContext?.title || 'Service option', 120);
    const optionDescription = cleanText(optionContext?.description || '', 320);

    if (hasReferenceImage && consistencyMode === 'consistent') {
      return [
        'Use the attached scene reference photograph as the visual and stylistic anchor.',
        REMOVE_REFERENCE_LOGO_RULE,
        'Preserve the same photographic aesthetic, natural lighting, vertical 9:16 portrait framing, color grading, and surface/setting mood as the reference image.',
        `Now depict the specific service package/option: "${optionTitle}" for the "${serviceLabel}" service${categoryName ? ` (${categoryName})` : ''}.`,
        optionDescription ? `Option details: ${optionDescription}.` : '',
        serviceDescription ? `Service context: ${serviceDescription}.` : '',
        siblingServiceOptions.length ? `Other packages in this service for context (keep visually distinct yet cohesive): ${siblingServiceOptions.join(', ')}.` : '',
        helpersUniformLogoRules,
        OPTION_PORTRAIT_FULL_BLEED_RULES,
      ].filter(Boolean).join('\n');
    }

    return [
      `Generate a crisp, realistic, full-bleed commercial 9:16 vertical portrait photograph representing the specific service option "${optionTitle}" under the "${serviceLabel}" service${categoryName ? ` (${categoryName})` : ''}.`,
      optionDescription ? `What this option covers: ${optionDescription}.` : '',
      serviceDescription ? `Overall service context: ${serviceDescription}.` : '',
      siblingServiceOptions.length ? `Keep this visually focused specifically on "${optionTitle}" (distinct from sibling options: ${siblingServiceOptions.join(', ')}).` : '',
      'Use clean natural lighting and balanced vertical framing centered on the key visual subject so it looks great in a full-screen mobile reel.',
      helpersUniformLogoRules,
      OPTION_PORTRAIT_FULL_BLEED_RULES,
    ].filter(Boolean).join('\n');
  }

  const questionPrompt = cleanText(questionContext?.prompt || '', 220);
  const optionLabel = cleanText(questionContext?.optionLabel || 'Option', 100);
  const siblingLabels = (Array.isArray(questionContext?.siblingOptionLabels) ? questionContext.siblingOptionLabels : [])
    .map((item) => cleanText(item, 80))
    .filter(Boolean)
    .slice(0, 15);
  const flowContextBlock = buildQuestionFlowContextBlock(questionContext);
  const hasUpstreamPictures = contextImageDescriptors.length > 0;

  if (consistencyMode === 'consistent') {
    if (hasReferenceImage) {
      return [
        'STRICT CONSISTENCY IMAGE EDIT:',
        'Use IMAGE 1 (the same-question consistency reference photograph) as the exact visual baseline.',
        REMOVE_REFERENCE_LOGO_RULE,
        'You MUST keep the EXACT SAME person, exact same hands/feet/body/subject, skin tone, finger/toe position, vertical 9:16 portrait camera angle, lens distance, lighting, and overall background environment identical to the reference image (except erasing any corner logo/watermark as instructed above).',
        `Modify ONLY the specific detail representing the answer choice "${optionLabel}" for the question "${questionPrompt || 'Service preference'}" in the "${serviceLabel}" service${categoryName ? ` (${categoryName})` : ''}.`,
        'For example: if this is about nail color, length, or finish, keep the exact same hand/feet, pose, skin, and backdrop and ONLY change the nails to show "' + optionLabel + '". If about room/load/scale/equipment, keep the exact same camera framing and room/setting and adjust only the attribute for "' + optionLabel + '".',
        flowContextBlock,
        siblingLabels.length ? `Sibling choices in this exact series: ${siblingLabels.join(', ')}.` : '',
        helpersUniformLogoRules,
        'CRITICAL: Do NOT swap to a different person/model, do NOT change camera angle or background, and do NOT draw, keep, or duplicate any text, labels, corner logos, corner watermarks, floating badges, borders, frames, bottom strips, or multi-panel collages. Never place any logo in the bottom-right, bottom-left, top-left, top-right, or anywhere outside a visible service provider\'s uniform. Keep the photograph full-bleed 9:16 portrait edge-to-edge with a darker/contrasting top-left corner.',
      ].filter(Boolean).join('\n');
    }

    return [
      'ANCHOR IMAGE FOR A CONSISTENT OPTION SERIES:',
      `Generate a crisp, realistic, full-bleed 9:16 vertical portrait studio-quality photograph illustrating the answer choice "${optionLabel}" for the question "${questionPrompt || 'Service preference'}".`,
      `Service: "${serviceLabel}"${categoryName ? ` (${categoryName})` : ''}.`,
      serviceDescription ? `Service context: ${serviceDescription}.` : '',
      flowContextBlock,
      hasUpstreamPictures ? REMOVE_REFERENCE_LOGO_RULE : '',
      siblingLabels.length ? `All choices in this same question: ${siblingLabels.join(', ')}.` : '',
      'IMPORTANT: Compose a clean, unmistakable, repeatable vertical portrait scene (for example: for manicure/nails show a close-up of manicured hands over a rich/darker contrasting surface or deep neutral drape; for pedicure show neatly posed feet on a rich/darker surface; for home/car/yard services show a clear medium close-up of the exact area/task). Keep framing, lighting, and background clean and dark/rich enough in the top-left corner across every option in this series.',
      helpersUniformLogoRules,
      OPTION_PORTRAIT_FULL_BLEED_RULES,
    ].filter(Boolean).join('\n');
  }

  return [
    `Generate a realistic, distinct, high-clarity, full-bleed 9:16 vertical portrait photograph specifically depicting the choice "${optionLabel}" in response to the question "${questionPrompt || 'Service option'}".`,
    `Service: "${serviceLabel}"${categoryName ? ` (${categoryName})` : ''}.`,
    serviceDescription ? `Service context: ${serviceDescription}.` : '',
    flowContextBlock,
    hasUpstreamPictures ? REMOVE_REFERENCE_LOGO_RULE : '',
    siblingLabels.length ? `Sibling choices in this question: ${siblingLabels.join(', ')}. Make sure this image clearly illustrates "${optionLabel}" specifically.` : '',
    'Clean natural vertical portrait composition centered on the subject.',
    helpersUniformLogoRules,
    OPTION_PORTRAIT_FULL_BLEED_RULES,
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
  helpersLogoPart = undefined,
} = {}) {
  const normalizedTarget = targetType === 'service_option'
    ? 'service_option'
    : (targetType === 'service_image' ? 'service_image' : 'question_option');
  const normalizedConsistency = normalizedTarget === 'service_image'
    ? 'unique'
    : (consistencyMode === 'unique' ? 'unique' : 'consistent');
  const aspectRatio = normalizedTarget === 'service_image'
    ? DEFAULT_SERVICE_IMAGE_ASPECT_RATIO
    : DEFAULT_OPTION_IMAGE_ASPECT_RATIO;
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
  const seenInlineData = new Set();
  if (referencePart?.inlineData?.data) {
    seenInlineData.add(referencePart.inlineData.data);
  }
  const resolvedContextImages = normalizedTarget === 'question_option'
    ? await resolveContextImageParts({
        contextImages: questionContext?.contextImages,
        seenInlineData,
        fetchImpl,
      })
    : [];
  const resolvedHelpersLogoPart = helpersLogoPart === undefined
    ? getHelpersWordmarkLogoPart()
    : helpersLogoPart;

  const prompt = buildOptionImagePrompt({
    targetType: normalizedTarget,
    consistencyMode: normalizedConsistency,
    serviceContext,
    optionContext,
    questionContext,
    serviceImageContext,
    hasReferenceImage: Boolean(referencePart),
    contextImageDescriptors: resolvedContextImages.map(({ label, sourceType }) => ({ label, sourceType })),
    hasHelpersLogo: Boolean(resolvedHelpersLogoPart),
  });

  const parts = [];
  if (referencePart) parts.push(referencePart);
  resolvedContextImages.forEach(({ part }) => parts.push(part));
  if (resolvedHelpersLogoPart) parts.push(resolvedHelpersLogoPart);
  parts.push({ text: prompt });

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
        aspectRatio,
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
    aspectRatio,
    usedReferenceImage: Boolean(referencePart),
    contextImagesCount: resolvedContextImages.length,
    attachedHelpersLogo: Boolean(resolvedHelpersLogoPart),
  };
}

module.exports = {
  DEFAULT_IMAGE_MODEL,
  DEFAULT_OPTION_IMAGE_ASPECT_RATIO,
  DEFAULT_SERVICE_IMAGE_ASPECT_RATIO,
  HELPERS_WHITE_LOGO_ASSET_PATH,
  buildHelpersUniformLogoRules,
  buildOptionImagePrompt,
  buildQuestionFlowContextBlock,
  extractGeneratedImagePart,
  generateAdminOptionImage,
  getHelpersWordmarkLogoPart,
  isAllowedRemoteReferenceUrl,
  parseDataUrl,
  resolveContextImageParts,
  resolveReferenceImagePart,
};
