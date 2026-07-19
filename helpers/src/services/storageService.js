import { deleteObject, getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { getFirebaseClients } from '../firebase/config';

function sanitizeFileName(fileName = '') {
  return String(fileName || 'upload.jpg').replace(/[^a-zA-Z0-9._-]/g, '_');
}

async function readUriAsBlob(fileUri) {
  const response = await fetch(fileUri);
  if (!response.ok) {
    throw new Error('Unable to read the selected file.');
  }
  return response.blob();
}

export async function uploadLocalFile({
  userId,
  fileUri,
  fileName = 'upload.jpg',
  mimeType = 'application/octet-stream',
  pathPrefix = 'uploads',
  objectPath: requestedObjectPath = '',
}) {
  if (!userId || !fileUri) {
    throw new Error('A signed-in user and a selected file are required.');
  }

  const { storage } = getFirebaseClients();
  const safeName = sanitizeFileName(fileName);
  const objectPath = requestedObjectPath || `${pathPrefix}/${userId}/${Date.now()}-${safeName}`;
  const fileRef = ref(storage, objectPath);
  const blob = await readUriAsBlob(fileUri);

  await uploadBytes(fileRef, blob, {
    contentType: mimeType || 'application/octet-stream',
    cacheControl: 'public,max-age=3600',
  });

  const downloadUrl = await getDownloadURL(fileRef);
  return {
    downloadUrl,
    objectPath,
    fileName: safeName,
    mimeType: mimeType || 'application/octet-stream',
    uploadedAt: new Date().toISOString(),
  };
}

export async function deleteUploadedFile(objectPath = '') {
  const normalizedPath = String(objectPath || '').trim();
  if (!normalizedPath) return;

  const { storage } = getFirebaseClients();
  const fileRef = ref(storage, normalizedPath);

  try {
    await deleteObject(fileRef);
  } catch (error) {
    if (String(error?.code || '').toLowerCase() === 'storage/object-not-found') {
      return;
    }
    throw error;
  }
}
