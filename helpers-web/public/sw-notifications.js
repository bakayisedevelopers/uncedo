/* eslint-disable no-restricted-globals */

const CLIENT_META_CACHE = 'uncedo-sw-client-meta-v1';
const INSTALLED_FLAG_KEY = '/__sw_meta__/pwa_installed';

function buildOfferActionUrl({
  requestId = '',
  action = 'view',
  offerToken = '',
  offerRevision = 0,
  origin = self.location.origin,
} = {}) {
  const params = new URLSearchParams();
  if (requestId) params.set('offerId', String(requestId));
  if (action) params.set('offerAction', String(action));
  if (offerToken) params.set('offerToken', String(offerToken));
  if (offerRevision > 0) params.set('offerRevision', String(offerRevision));
  const query = params.toString();
  return new URL(`/home${query ? `?${query}` : ''}`, origin || self.location.origin).href;
}

async function saveClientDisplayMode(clientId, { isStandalone = false, pwaInstalled = false } = {}) {
  if (typeof caches === 'undefined') return;
  try {
    const cache = await caches.open(CLIENT_META_CACHE);
    if (clientId) {
      await cache.put(
        `/__sw_meta__/client/${encodeURIComponent(clientId)}`,
        new Response(JSON.stringify({ isStandalone: Boolean(isStandalone), updatedAt: Date.now() }), {
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    }
    if (pwaInstalled || isStandalone) {
      await cache.put(
        INSTALLED_FLAG_KEY,
        new Response(JSON.stringify({ installed: true, updatedAt: Date.now() }), {
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    }
  } catch {
    // Ignore cache storage errors
  }
}

async function readClientModeMetadata(windowClients) {
  const modesByClientId = new Map();
  let pwaInstalled = false;
  if (typeof caches === 'undefined') {
    return { modesByClientId, pwaInstalled };
  }
  try {
    const cache = await caches.open(CLIENT_META_CACHE);
    const installedResp = await cache.match(INSTALLED_FLAG_KEY);
    if (installedResp) {
      const parsed = await installedResp.json().catch(() => null);
      pwaInstalled = Boolean(parsed?.installed);
    }
    await Promise.all(
      (windowClients || []).map(async (client) => {
        if (!client?.id) return;
        const resp = await cache.match(`/__sw_meta__/client/${encodeURIComponent(client.id)}`);
        if (!resp) return;
        const parsed = await resp.json().catch(() => null);
        if (parsed && typeof parsed.isStandalone === 'boolean') {
          modesByClientId.set(client.id, parsed.isStandalone);
        }
      }),
    );
  } catch {
    // Ignore cache lookup errors
  }
  return { modesByClientId, pwaInstalled };
}

self.addEventListener('message', (event) => {
  const msg = event?.data;
  if (!msg || typeof msg !== 'object') return;
  if (msg.type === 'REGISTER_CLIENT_MODE') {
    const clientId = event?.source?.id || '';
    event.waitUntil(
      saveClientDisplayMode(clientId, {
        isStandalone: Boolean(msg.isStandalone),
        pwaInstalled: Boolean(msg.pwaInstalled),
      }),
    );
  }
});

self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload = null;
  try {
    payload = event.data.json();
  } catch {
    payload = null;
  }

  const data = (payload && payload.data) || payload || {};
  if (data.type !== 'uncedo-job-offer') {
    return;
  }

  const requestId = String(data.requestId || '').trim();
  const offerToken = String(data.offerToken || '').trim();
  const offerRevision = Math.max(0, Number(data.offerRevision || 0) || 0);
  const tag = String(data.tag || (requestId ? `uncedo-offer-${requestId}` : 'uncedo-offer-live')).trim();
  const title = String(data.title || 'New Job Offer').trim();
  const body = String(data.body || 'Open Uncedo Helpers to view this job offer.').trim();
  const canRespond = String(data.canRespond ?? 'true').toLowerCase() !== 'false';

  const actions = canRespond
    ? [
        { action: 'accept', title: 'Accept' },
        { action: 'decline', title: 'Decline' },
      ]
    : [{ action: 'decline', title: 'Decline' }];

  const notificationOptions = {
    body,
    icon: '/helpers-logo-192.png',
    badge: '/helpers-logo-192.png',
    tag,
    renotify: true,
    requireInteraction: true,
    vibrate: [200, 100, 200],
    timestamp: Number(data.lastOfferAt || Date.now()) || Date.now(),
    actions,
    data: {
      type: 'uncedo-job-offer',
      requestId,
      offerToken,
      offerRevision,
      offerExpiresAt: Number(data.offerExpiresAt || 0) || 0,
      isBusyFallback: String(data.isBusyFallback || '').toLowerCase() === 'true',
      canRespond,
      offerTitle: String(data.offerTitle || ''),
      appOrigin: self.location.origin,
      focusPath: String(data.focusPath || ''),
      acceptPath: String(data.acceptPath || ''),
      declinePath: String(data.declinePath || ''),
    },
  };

  event.waitUntil((async () => {
    if (typeof self.registration?.getNotifications === 'function') {
      try {
        const existing = await self.registration.getNotifications({ tag });
        const alreadyDisplayed = existing.some(
          (item) =>
            String(item?.data?.offerToken || '') === offerToken
            && Number(item?.data?.offerRevision || 0) === offerRevision,
        );
        if (alreadyDisplayed) return;
      } catch {
        // Proceed to show notification
      }
    }

    try {
      await self.registration.showNotification(title, notificationOptions);
    } catch {
      const { actions: _actions, ...fallbackOptions } = notificationOptions;
      await self.registration.showNotification(title, fallbackOptions).catch(() => null);
    }
  })());
});

self.addEventListener('notificationclick', (event) => {
  const notification = event.notification;
  const data = (notification && notification.data) || {};
  if (data.type !== 'uncedo-job-offer' && data.type !== 'uncedo-job-offer-notice') {
    return;
  }

  notification.close();

  const rawAction = String(event.action || '').trim().toLowerCase();
  const action = rawAction === 'accept' ? 'accept' : rawAction === 'decline' ? 'decline' : 'view';
  const requestId = String(data.requestId || '').trim();
  const offerToken = String(data.offerToken || '').trim();
  const offerRevision = Math.max(0, Number(data.offerRevision || 0) || 0);
  const appOrigin = String(data.appOrigin || self.location.origin).trim();

  const presetPath = action === 'accept'
    ? String(data.acceptPath || '').trim()
    : action === 'decline'
      ? String(data.declinePath || '').trim()
      : String(data.focusPath || '').trim();

  const targetUrl = presetPath
    ? new URL(presetPath, appOrigin || self.location.origin).href
    : buildOfferActionUrl({
        requestId,
        action,
        offerToken,
        offerRevision,
        origin: appOrigin || self.location.origin,
      });

  event.waitUntil((async () => {
    const windowClients = await self.clients.matchAll({
      type: 'window',
      includeUncontrolled: true,
    });

    const { modesByClientId, pwaInstalled } = await readClientModeMetadata(windowClients);
    const standaloneClients = windowClients.filter((client) => modesByClientId.get(client.id) === true);

    const pickBestClient = (list) =>
      list.find((client) => client.focused)
      || list.find((client) => client.visibilityState === 'visible')
      || list[0]
      || null;

    // 1. Always prioritize an open installed PWA standalone window over any browser tab
    const preferredStandalone = pickBestClient(standaloneClients);
    if (preferredStandalone) {
      try {
        preferredStandalone.postMessage({
          type: 'OFFER_NOTIFICATION_ACTION',
          action,
          requestId,
          offerToken,
          offerRevision,
          targetPath: presetPath || `/home?offerId=${encodeURIComponent(requestId)}&offerAction=${action}`,
        });
        await preferredStandalone.focus();
        return;
      } catch {
        // Fall through if focusing standalone client fails
      }
    }

    // 2. If a PWA is known to be installed on this device and no standalone window is open yet,
    //    try openWindow first so the OS / browser PWA launch_handler launches the installed PWA
    //    rather than focusing a background browser tab.
    if (pwaInstalled && typeof self.clients.openWindow === 'function') {
      const opened = await self.clients.openWindow(targetUrl).catch(() => null);
      if (opened) {
        return;
      }
    }

    // 3. Otherwise focus any open browser window and pass the action message
    const preferredBrowserClient = pickBestClient(windowClients);
    if (preferredBrowserClient) {
      try {
        preferredBrowserClient.postMessage({
          type: 'OFFER_NOTIFICATION_ACTION',
          action,
          requestId,
          offerToken,
          offerRevision,
          targetPath: presetPath || `/home?offerId=${encodeURIComponent(requestId)}&offerAction=${action}`,
        });
        await preferredBrowserClient.focus();
        return;
      } catch {
        // Fall through to openWindow
      }
    }

    if (typeof self.clients.openWindow === 'function') {
      await self.clients.openWindow(targetUrl);
    }
  })());
});
