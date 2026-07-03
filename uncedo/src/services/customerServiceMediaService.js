import { getFirebaseClients, getFunctionEndpoint } from '../firebase/config';

const CUSTOMER_MEDIA_SUMMARY_ENDPOINT = getFunctionEndpoint('customerServiceMediaSummary');

function getBase64Payload(dataUrl = '') {
  const [, base64 = ''] = String(dataUrl || '').split(',', 2);
  return base64;
}

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
  const { auth } = getFirebaseClients();
  const token = await auth?.currentUser?.getIdToken?.(false);
  if (!token) {
    return buildFallbackSummary(attachment);
  }

  const payload = {
    fileName: attachment?.name || 'attachment',
    mimeType: attachment?.type || 'application/octet-stream',
    dataBase64: getBase64Payload(attachment?.dataUrl),
  };

  try {
    const response = await fetch(CUSTOMER_MEDIA_SUMMARY_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });

    const body = await response.json().catch(() => ({}));
    if (!response.ok || body?.success === false) {
      return buildFallbackSummary(attachment);
    }

    return {
      success: true,
      fileType: String(body?.fileType || ''),
      summary: String(body?.summary || '').trim(),
      shortSummary: String(body?.shortSummary || body?.summary || '').trim(),
      fileName: String(body?.fileName || attachment?.name || 'attachment'),
      mimeType: String(body?.mimeType || attachment?.type || 'application/octet-stream'),
    };
  } catch {
    return buildFallbackSummary(attachment);
  }
}
