import { getFirebaseClients } from '../firebase/config';

export async function generateAdminServiceDraft({
  mode = 'create',
  instructions = '',
  currentDraft = {},
} = {}) {
  const clients = await getFirebaseClients();
  if (!clients?.functions || !clients?.httpsCallable) {
    throw new Error('Firebase Functions is not configured for the admin app.');
  }

  const call = clients.httpsCallable(clients.functions, 'generateAdminServiceDraft');
  const result = await call({
    mode: mode === 'edit' ? 'edit' : 'create',
    instructions: String(instructions || '').trim(),
    currentDraft: currentDraft && typeof currentDraft === 'object' ? currentDraft : {},
  });

  const payload = result?.data || {};
  if (!payload?.draft || typeof payload.draft !== 'object') {
    throw new Error('AI did not return a usable service draft.');
  }
  return payload;
}

export async function generateAdminOptionImage({
  targetType = 'question_option',
  consistencyMode = 'consistent',
  serviceContext = {},
  optionContext = {},
  questionContext = {},
  serviceImageContext = {},
  referenceImageDataUrl = '',
  referenceImageUrl = '',
} = {}) {
  const clients = await getFirebaseClients();
  if (!clients?.functions || !clients?.httpsCallable) {
    throw new Error('Firebase Functions is not configured for the admin app.');
  }

  const normalizedTarget = targetType === 'service_option'
    ? 'service_option'
    : (targetType === 'service_image' ? 'service_image' : 'question_option');

  const call = clients.httpsCallable(clients.functions, 'generateAdminOptionImage');
  const result = await call({
    targetType: normalizedTarget,
    consistencyMode: consistencyMode === 'unique' ? 'unique' : 'consistent',
    serviceContext: serviceContext && typeof serviceContext === 'object' ? serviceContext : {},
    optionContext: optionContext && typeof optionContext === 'object' ? optionContext : {},
    questionContext: questionContext && typeof questionContext === 'object' ? questionContext : {},
    serviceImageContext: serviceImageContext && typeof serviceImageContext === 'object' ? serviceImageContext : {},
    referenceImageDataUrl: String(referenceImageDataUrl || ''),
    referenceImageUrl: String(referenceImageUrl || ''),
  });

  const payload = result?.data || {};
  if (!payload?.imageDataUrl || typeof payload.imageDataUrl !== 'string') {
    throw new Error('AI did not return a usable image.');
  }
  return payload;
}
