import * as ImagePicker from 'expo-image-picker';

function normalizeAsset(asset = null) {
  if (!asset?.uri) return null;

  return {
    uri: asset.uri,
    fileName: asset.fileName || `image_${Date.now()}.jpg`,
    mimeType: asset.mimeType || 'image/jpeg',
    width: Number(asset.width || 0),
    height: Number(asset.height || 0),
  };
}

async function ensurePermission(permissionPromise, deniedMessage) {
  const permission = await permissionPromise;
  if (permission?.status !== 'granted') {
    throw new Error(deniedMessage);
  }
}

export async function pickSkillImageFromLibrary() {
  await ensurePermission(
    ImagePicker.requestMediaLibraryPermissionsAsync(),
    'Photo library access is required to upload a skill picture.',
  );

  const result = await ImagePicker.launchImageLibraryAsync({
    quality: 0.8,
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
  });

  if (result.canceled) return null;
  return normalizeAsset(result.assets?.[0] || null);
}

export async function captureProfileSelfie() {
  await ensurePermission(
    ImagePicker.requestCameraPermissionsAsync(),
    'Camera access is required to capture a selfie.',
  );

  const result = await ImagePicker.launchCameraAsync({
    cameraType: ImagePicker.CameraType.front,
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    quality: 0.8,
  });

  if (result.canceled) return null;
  return normalizeAsset(result.assets?.[0] || null);
}
