import { forwardRef, useImperativeHandle, useRef } from 'react';
import { File } from 'expo-file-system';

function inferMimeTypeFromName(name = '') {
  const extension = String(name || '').trim().split('.').pop()?.toLowerCase() || '';

  switch (extension) {
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'png':
      return 'image/png';
    case 'gif':
      return 'image/gif';
    case 'webp':
      return 'image/webp';
    case 'heic':
      return 'image/heic';
    case 'mp4':
      return 'video/mp4';
    case 'mov':
      return 'video/quicktime';
    case 'm4v':
      return 'video/x-m4v';
    case 'webm':
      return 'video/webm';
    case 'pdf':
      return 'application/pdf';
    default:
      return 'application/octet-stream';
  }
}

function resolvePickerMimeType(accept = '', mode = '') {
  if (mode === 'camera') {
    return 'image/*';
  }

  const firstType = String(accept || '')
    .split(',')
    .map((item) => item.trim())
    .find(Boolean);

  if (!firstType || firstType === '*/*') {
    return undefined;
  }

  return firstType;
}

async function assetToAttachment(asset = {}) {
  const uri = String(asset?.uri || '').trim();
  const nameFromUri = uri ? uri.split('/').pop() : '';
  const name = String(asset?.name || nameFromUri || 'attachment').trim();
  const mimeType = String(asset?.type || inferMimeTypeFromName(name));
  const file = uri ? new File(uri) : null;
  const info = file ? await file.info().catch(() => ({})) : {};
  let base64 = '';

  if (asset?.base64) {
    base64 = String(asset.base64 || '').trim();
  } else if (file) {
    base64 = await file.base64().catch(() => '');
  }

  return {
    name,
    type: mimeType,
    size: Number(asset?.size || info?.size || 0),
    lastModified: Number(asset?.lastModified || info?.modificationTime || Date.now()),
    dataUrl: base64 ? `data:${mimeType};base64,${base64}` : '',
  };
}

export const AttachmentPickerModal = forwardRef(function AttachmentPickerModal({
  mode,
  accept,
  onCancel,
  onError,
  onFilesSelected,
}, ref) {
  const isPickingRef = useRef(false);

  useImperativeHandle(ref, () => ({
    async openPicker() {
      if (isPickingRef.current) return;
      isPickingRef.current = true;
      try {
        const picked = await File.pickFileAsync(undefined, resolvePickerMimeType(accept, mode));

        if (!picked) {
          onCancel?.();
          return;
        }

        const assets = Array.isArray(picked) ? picked : [picked];
        if (!assets.length) {
          onCancel?.();
          return;
        }

        const files = [];
        for (const asset of assets) {
          const attachment = await assetToAttachment(asset);
          if (attachment.dataUrl) {
            files.push(attachment);
          }
        }

        if (!files.length) {
          onError?.('Unable to read the selected file.');
          return;
        }

        onFilesSelected?.(files);
      } catch (error) {
        onError?.(error?.message || 'Unable to read the selected file.');
      } finally {
        isPickingRef.current = false;
      }
    },
  }), [onCancel, onError, onFilesSelected]);

  return null;
});
