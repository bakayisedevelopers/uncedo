export const CUSTOMER_APP_GREEN = '#10b981';
export const CUSTOMER_APP_GREEN_DARK = '#059669';
export const BRAND_STAMP_CHAR = '\u00f4';

export function isDataUrlImage(value = '') {
  return /^data:image\//i.test(String(value || '').trim());
}

export function computeBrandStampGeometry(width = 1024, height = 1024) {
  const safeWidth = Math.max(1, Number(width) || 1024);
  const safeHeight = Math.max(1, Number(height) || 1024);
  const minDim = Math.min(safeWidth, safeHeight);
  const fontSize = Math.max(20, Math.round(minDim * 0.062));
  const padX = Math.max(12, Math.round(minDim * 0.032));
  const padY = Math.max(10, Math.round(minDim * 0.024));
  const strokeWidth = Math.max(1.5, Number((fontSize * 0.075).toFixed(2)));
  return {
    char: BRAND_STAMP_CHAR,
    color: CUSTOMER_APP_GREEN,
    outlineColor: 'rgba(255, 255, 255, 0.86)',
    shadowColor: 'rgba(5, 150, 105, 0.28)',
    fontSize,
    padX,
    padY,
    x: safeWidth - padX,
    y: safeHeight - padY,
    strokeWidth,
  };
}

export function stampUncedoBrandMarkOnCanvas(ctx, width, height) {
  if (!ctx || typeof ctx.fillText !== 'function') return;
  const geom = computeBrandStampGeometry(width, height);
  ctx.save();
  ctx.font = `800 ${geom.fontSize}px "Space Grotesk", "Inter", system-ui, -apple-system, sans-serif`;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';
  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;

  ctx.shadowColor = geom.shadowColor;
  ctx.shadowBlur = Math.max(2, Math.round(geom.fontSize * 0.12));
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 1;

  ctx.strokeStyle = geom.outlineColor;
  ctx.lineWidth = geom.strokeWidth;
  ctx.strokeText(geom.char, geom.x, geom.y);

  ctx.shadowBlur = 0;
  ctx.fillStyle = geom.color;
  ctx.fillText(geom.char, geom.x, geom.y);
  ctx.restore();
}

export async function finalizeAiGeneratedImage(dataUrl = '', maxDimension = 1024, quality = 0.88) {
  const cleanUrl = String(dataUrl || '').trim();
  if (!isDataUrlImage(cleanUrl) || typeof document === 'undefined' || typeof Image === 'undefined') {
    return cleanUrl;
  }
  try {
    const img = await new Promise((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error('Generated image decode failed'));
      element.src = cleanUrl;
    });
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
    stampUncedoBrandMarkOnCanvas(ctx, width, height);
    return canvas.toDataURL('image/jpeg', quality) || cleanUrl;
  } catch (_err) {
    return cleanUrl;
  }
}
