function buildFallbackSummary(attachment = {}) {
  const mimeType = String(attachment?.type || '').toLowerCase();
  const fileType = mimeType.startsWith('video/')
    ? 'video'
    : mimeType.startsWith('image/')
      ? 'image'
      : mimeType === 'application/pdf'
        ? 'pdf'
        : 'file';

  const label = fileType === 'video'
    ? 'Reference video uploaded.'
    : fileType === 'image'
      ? 'Reference image uploaded.'
      : fileType === 'pdf'
        ? 'Reference document uploaded.'
        : 'Reference file uploaded.';

  return {
    success: false,
    fileType,
    summary: label,
    shortSummary: label,
    fileName: attachment?.name || 'attachment',
    mimeType: attachment?.type || 'application/octet-stream',
  };
}

export async function describeCustomerServiceMediaAttachment(attachment = {}) {
  return buildFallbackSummary(attachment);
}
