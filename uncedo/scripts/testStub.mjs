/**
 * scripts/testStub.mjs
 *
 * Default export and named exports for modules that aren't available in a
 * bare Node environment when running reward unit tests. All values are
 * safe no-ops or empty objects.
 */

export default {};
export const AsyncStorage = {
  getItem: async () => null,
  setItem: async () => null,
  multiRemove: async () => null,
};
export const FIREBASE_PUBLIC_CONFIG = {};
export const WEB_APP_BASE_URL = 'https://uncedo.bakayise.com';
export const USE_FIREBASE_EMULATORS = false;
export const FIREBASE_EMULATOR_HOST = '';
export const GOOGLE_MAPS_API_KEY = '';
export const GOOGLE_WEB_CLIENT_ID = '';
export const GOOGLE_ANDROID_CLIENT_ID = '';
export const GOOGLE_IOS_CLIENT_ID = '';
