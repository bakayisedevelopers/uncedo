export const CUSTOMER_BRAND_WHITE = '#FFFFFF';
export const CUSTOMER_LOGO_COLOR = CUSTOMER_BRAND_WHITE;
export const CUSTOMER_LOGO_PATH = '/customer-logo-transparent.png';
export const CUSTOMER_LOGO_ASPECT_RATIO = 512 / 110;
const MAX_RAW_CACHE_ENTRIES = 60;

let cachedLogoPromise = null;
const rawReferenceByFinalUrl = new Map();

export function isDataUrlImage(value = '') {
  return /^data:image\//i.test(String(value || '').trim());
}

function trimRawReferenceCache() {
  while (rawReferenceByFinalUrl.size > MAX_RAW_CACHE_ENTRIES) {
    const oldestKey = rawReferenceByFinalUrl.keys().next().value;
    if (oldestKey === undefined) break;
    rawReferenceByFinalUrl.delete(oldestKey);
  }
}

export function rememberCleanReferenceImage(finalUrl = '', rawDataUrl = '') {
  const cleanFinal = String(finalUrl || '').trim();
  const cleanRaw = String(rawDataUrl || '').trim();
  if (!cleanFinal || !isDataUrlImage(cleanRaw)) return;
  rawReferenceByFinalUrl.set(cleanFinal, cleanRaw);
  trimRawReferenceCache();
}

export function aliasCleanReferenceImage(existingFinalUrl = '', aliasUrl = '') {
  const cleanExisting = String(existingFinalUrl || '').trim();
  const cleanAlias = String(aliasUrl || '').trim();
  if (!cleanExisting || !cleanAlias) return;
  const raw = rawReferenceByFinalUrl.get(cleanExisting);
  if (raw) {
    rawReferenceByFinalUrl.set(cleanAlias, raw);
    trimRawReferenceCache();
  }
}

export function resolveCleanReferenceImageUrl(url = '') {
  const cleanUrl = String(url || '').trim();
  if (!cleanUrl) return '';
  return rawReferenceByFinalUrl.get(cleanUrl) || cleanUrl;
}

export function clearCleanReferenceImageCache() {
  rawReferenceByFinalUrl.clear();
}

export function computeBrandStampGeometry(
  width = 1024,
  height = 1024,
  logoAspectRatio = CUSTOMER_LOGO_ASPECT_RATIO,
  position = 'top-left',
) {
  const safeWidth = Math.max(1, Number(width) || 1024);
  const safeHeight = Math.max(1, Number(height) || 1024);
  const safeRatio = Number.isFinite(Number(logoAspectRatio)) && Number(logoAspectRatio) > 0.5
    ? Number(logoAspectRatio)
    : CUSTOMER_LOGO_ASPECT_RATIO;
  const minDim = Math.min(safeWidth, safeHeight);
  const normalizedPosition = String(position || 'top-left').trim().toLowerCase() === 'bottom-right'
    ? 'bottom-right'
    : 'top-left';

  if (normalizedPosition === 'bottom-right') {
    const stampWidth = Math.max(64, Math.min(Math.round(minDim * 0.135), Math.round(safeWidth * 0.16)));
    const stampHeight = Math.max(14, Math.round(stampWidth / safeRatio));
    const padX = Math.max(12, Math.round(minDim * 0.028));
    const padY = Math.max(10, Math.round(minDim * 0.024));
    return {
      logoPath: CUSTOMER_LOGO_PATH,
      color: CUSTOMER_LOGO_COLOR,
      position: 'bottom-right',
      shadowColor: 'rgba(0, 0, 0, 0.45)',
      shadowBlur: Math.max(3, Math.round(stampHeight * 0.18)),
      shadowOffsetX: 0,
      shadowOffsetY: 1,
      padX,
      padY,
      width: stampWidth,
      height: stampHeight,
      x: Math.max(0, safeWidth - padX - stampWidth),
      y: Math.max(0, safeHeight - padY - stampHeight),
    };
  }

  const stampWidth = Math.max(72, Math.min(Math.round(minDim * 0.16), Math.round(safeWidth * 0.2)));
  const stampHeight = Math.max(16, Math.round(stampWidth / safeRatio));
  const padX = Math.max(16, Math.round(safeWidth * 0.045));
  const padY = Math.max(16, Math.round(safeHeight * 0.032));
  return {
    logoPath: CUSTOMER_LOGO_PATH,
    color: CUSTOMER_LOGO_COLOR,
    position: 'top-left',
    shadowColor: 'rgba(0, 0, 0, 0.5)',
    shadowBlur: Math.max(4, Math.round(stampHeight * 0.2)),
    shadowOffsetX: 0,
    shadowOffsetY: 1,
    padX,
    padY,
    width: stampWidth,
    height: stampHeight,
    x: padX,
    y: padY,
  };
}

export function loadCustomerLogoImage(logoSrc = CUSTOMER_LOGO_PATH) {
  if (typeof Image === 'undefined') {
    return Promise.resolve(null);
  }
  if (logoSrc === CUSTOMER_LOGO_PATH && cachedLogoPromise) {
    return cachedLogoPromise;
  }
  const promise = new Promise((resolve) => {
    const logoImg = new Image();
    logoImg.crossOrigin = 'anonymous';
    logoImg.onload = () => resolve(logoImg);
    logoImg.onerror = () => {
      if (logoSrc === CUSTOMER_LOGO_PATH) {
        cachedLogoPromise = null;
      }
      resolve(null);
    };
    logoImg.src = logoSrc;
  });
  if (logoSrc === CUSTOMER_LOGO_PATH) {
    cachedLogoPromise = promise;
  }
  return promise;
}

export function stampUncedoBrandMarkOnCanvas(ctx, width, height, logoImage = null, position = 'top-left') {
  if (!ctx) return;
  const naturalWidth = Number(logoImage?.naturalWidth || logoImage?.width || 0);
  const naturalHeight = Number(logoImage?.naturalHeight || logoImage?.height || 0);
  const aspectRatio = naturalWidth > 0 && naturalHeight > 0
    ? naturalWidth / naturalHeight
    : CUSTOMER_LOGO_ASPECT_RATIO;
  const geom = computeBrandStampGeometry(width, height, aspectRatio, position);

  if (logoImage && typeof ctx.drawImage === 'function') {
    ctx.save();
    ctx.shadowColor = geom.shadowColor;
    ctx.shadowBlur = geom.shadowBlur;
    ctx.shadowOffsetX = geom.shadowOffsetX;
    ctx.shadowOffsetY = geom.shadowOffsetY;
    ctx.drawImage(logoImage, geom.x, geom.y, geom.width, geom.height);
    ctx.restore();
  }
}

export async function finalizeAiGeneratedImage(
  dataUrl = '',
  maxDimension = 1440,
  quality = 0.88,
  { position = 'top-left' } = {},
) {
  const cleanUrl = String(dataUrl || '').trim();
  if (!isDataUrlImage(cleanUrl) || typeof document === 'undefined' || typeof Image === 'undefined') {
    return cleanUrl;
  }
  try {
    const [img, logoImage] = await Promise.all([
      new Promise((resolve, reject) => {
        const element = new Image();
        element.onload = () => resolve(element);
        element.onerror = () => reject(new Error('Generated image decode failed'));
        element.src = cleanUrl;
      }),
      loadCustomerLogoImage(CUSTOMER_LOGO_PATH),
    ]);
    const rawW = img.naturalWidth || img.width || maxDimension;
    const rawH = img.naturalHeight || img.height || maxDimension;
    const scale = Math.min(1, maxDimension / Math.max(rawW, rawH));
    const width = Math.max(1, Math.round(rawW * scale));
    const height = Math.max(1, Math.round(rawH * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return cleanUrl;
    ctx.drawImage(img, 0, 0, width, height);
    stampUncedoBrandMarkOnCanvas(ctx, width, height, logoImage, position);
    const stampedUrl = canvas.toDataURL('image/jpeg', quality) || cleanUrl;
    rememberCleanReferenceImage(stampedUrl, cleanUrl);
    return stampedUrl;
  } catch (_err) {
    return cleanUrl;
  }
}

export async function finalizeUploadedImageFile(
  file,
  maxDimension = 1440,
  quality = 0.9,
  { position = 'top-left' } = {},
) {
  if (!file || typeof document === 'undefined' || typeof Image === 'undefined' || typeof URL === 'undefined') {
    return file;
  }
  let objectUrl = '';
  try {
    objectUrl = URL.createObjectURL(file);
    const [img, logoImage] = await Promise.all([
      new Promise((resolve, reject) => {
        const element = new Image();
        element.onload = () => resolve(element);
        element.onerror = () => reject(new Error('Uploaded image decode failed'));
        element.src = objectUrl;
      }),
      loadCustomerLogoImage(CUSTOMER_LOGO_PATH),
    ]);
    const rawW = img.naturalWidth || img.width || maxDimension;
    const rawH = img.naturalHeight || img.height || maxDimension;
    const scale = Math.min(1, maxDimension / Math.max(rawW, rawH));
    const width = Math.max(1, Math.round(rawW * scale));
    const height = Math.max(1, Math.round(rawH * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(img, 0, 0, width, height);
    stampUncedoBrandMarkOnCanvas(ctx, width, height, logoImage, position);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (!blob) return file;
    const baseName = String(file.name || 'uploaded_image').replace(/\.[^.]+$/, '') || 'uploaded_image';
    return new File([blob], `${baseName}.jpg`, { type: 'image/jpeg' });
  } catch (_err) {
    return file;
  } finally {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
}
