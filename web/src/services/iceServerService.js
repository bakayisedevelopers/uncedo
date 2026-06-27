import { getFirebaseClients } from '../firebase/config';
import { debugLog } from '../utils/devLogger';

const ICE_CONFIG_ENDPOINT = import.meta.env.VITE_ICE_CONFIG_ENDPOINT || '/ice-config';

export async function fetchIceServers() {
  const clients = await getFirebaseClients();
  const idToken = await clients?.auth?.currentUser?.getIdToken?.();

  if (!idToken) {
    throw new Error('You must be signed in before starting a session.');
  }

  const response = await fetch(ICE_CONFIG_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok || !payload.success || !Array.isArray(payload.iceServers)) {
    throw new Error(payload.message || 'Unable to load network relay configuration right now.');
  }

  const flattenUrls = payload.iceServers.flatMap((entry) => {
    if (!entry?.urls) return [];
    return Array.isArray(entry.urls) ? entry.urls : [entry.urls];
  });

  const stunUrls = flattenUrls.filter((url) => String(url).toLowerCase().startsWith('stun:'));
  const turnUrls = flattenUrls.filter(
    (url) =>
      String(url).toLowerCase().startsWith('turn:')
      || String(url).toLowerCase().startsWith('turns:'),
  );

  debugLog('iceServerService', 'Fetched ICE configuration.', {
    serverCount: payload.iceServers.length,
    hasStun: stunUrls.length > 0,
    hasTurn: turnUrls.length > 0,
    stunCount: stunUrls.length,
    turnCount: turnUrls.length,
    urls: flattenUrls,
    ttlSeconds: payload.ttlSeconds || null,
    servers: payload.iceServers.map((entry) => {
      const urls = Array.isArray(entry?.urls) ? entry.urls : [entry?.urls].filter(Boolean);
      const hasTurnUrl = urls.some(
        (url) =>
          String(url).toLowerCase().startsWith('turn:')
          || String(url).toLowerCase().startsWith('turns:'),
      );

      return {
        urls,
        hasTurnUrl,
        hasUsername: Boolean(entry?.username),
        hasCredential: Boolean(entry?.credential),
        credentialType: entry?.credentialType || null,
      };
    }),
  });

  return payload.iceServers;
}