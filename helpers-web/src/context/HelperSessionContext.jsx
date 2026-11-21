import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  getHelperAgreementBundle,
  getHelperWalletSnapshot,
  getMyPoliceClearanceReview,
  reportHelperAppVisibility,
  respondToServiceRequestOfferApi,
  subscribeToActiveServiceRequest,
  subscribeToHelperOfferings,
  subscribeToHelperServiceRequests,
  subscribeToPendingHelperOffers,
  subscribeToServiceCatalog,
  subscribeToUserProfile,
  syncMyHelperVerificationStatus,
  updateWebHelperLiveLocation,
} from '../services/helperDataService';
import {
  calculateDistanceMeters,
  formatLiveLocationDisplay,
  reverseGeocodeCoords,
} from '../services/locationGeocodeService';
import { evaluateHelperOnboarding } from '../utils/onboardingSteps';

const HelperSessionContext = createContext(null);

const ACTIVE_JOB_STATUSES = new Set([
  'accepted',
  'en_route',
  'driving',
  'buying_resources',
  'arrived',
  'work_started',
]);

function playOfferAlert(offer) {
  if (typeof window === 'undefined') return;
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate([180, 90, 180]);
    }
  } catch {
    // Ignore vibration errors on unsupported devices
  }

  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (AudioCtx) {
      const ctx = new AudioCtx();
      const nowTime = ctx.currentTime;
      const tones = [
        { freq: 587.33, start: nowTime, duration: 0.14 },
        { freq: 880, start: nowTime + 0.16, duration: 0.22 },
      ];
      tones.forEach(({ freq, start, duration }) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, start);
        gain.gain.setValueAtTime(0.001, start);
        gain.gain.exponentialRampToValueAtTime(0.14, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(start);
        osc.stop(start + duration + 0.02);
      });
      window.setTimeout(() => {
        ctx.close().catch(() => null);
      }, 650);
    }
  } catch {
    // AudioContext may require prior user gesture
  }

  try {
    if ('Notification' in window && Notification.permission === 'granted') {
      const amount = Number(offer?.payoutEstimate || 0);
      const priceLabel = amount > 0 ? `R${amount.toFixed(2)}` : 'New job';
      const areaLabel = String(offer?.area || '').trim();
      const title = `New Job Offer · ${priceLabel}`;
      const body = [offer?.title || offer?.serviceSummary || 'Service request', areaLabel]
        .filter(Boolean)
        .join(' — ');
      const notification = new Notification(title, {
        body,
        icon: '/helpers-logo-192.png',
        badge: '/helpers-logo-192.png',
        tag: `uncedo-offer-${offer?.id || 'live'}`,
        renotify: true,
        requireInteraction: true,
      });
      notification.onclick = () => {
        try {
          window.focus();
          notification.close();
        } catch {
          // Ignore focus errors
        }
      };
    }
  } catch {
    // Ignore Notification construction errors on strict browsers
  }
}

const EMPTY_WALLET_SNAPSHOT = {
  wallet: {
    availableMinor: 0,
    reservedMinor: 0,
    outstandingCommissionMinor: 0,
    reconciliationBlocked: false,
    currency: 'ZAR',
  },
  nextPayoutEstimateMinor: 0,
  transactions: [],
};

function readCurrentGeoPosition(options = { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }) {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new Error('Geolocation is not supported by this browser.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve(pos.coords),
      (err) => reject(new Error(err?.message || 'Location permission is required for live tracking.')),
      options,
    );
  });
}

async function resolveGeoWithRace(coords, timeoutMs = 2400) {
  try {
    return await Promise.race([
      reverseGeocodeCoords(coords),
      new Promise((resolve) => window.setTimeout(() => resolve(null), timeoutMs)),
    ]);
  } catch {
    return null;
  }
}

export function HelperSessionProvider({ user, children }) {
  const [profile, setProfile] = useState(user?.profile || {});
  const [offerings, setOfferings] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [offers, setOffers] = useState([]);
  const [jobHistory, setJobHistory] = useState([]);
  const [activeRequest, setActiveRequest] = useState(null);
  const [queuedRequest, setQueuedRequest] = useState(null);
  const [clearanceReview, setClearanceReview] = useState(null);
  const [activeAgreement, setActiveAgreement] = useState(null);
  const [walletSnapshot, setWalletSnapshot] = useState(EMPTY_WALLET_SNAPSHOT);
  const [walletLoading, setWalletLoading] = useState(false);
  const [walletError, setWalletError] = useState('');
  const [loadingInitial, setLoadingInitial] = useState(true);

  const [gpsStatus, setGpsStatus] = useState('idle');
  const [gpsError, setGpsError] = useState('');
  const [shiftBusy, setShiftBusy] = useState(false);
  const [offerBusyId, setOfferBusyId] = useState('');
  const [offerError, setOfferError] = useState('');
  const [offerNotice, setOfferNotice] = useState('');

  const [deviceLocation, setDeviceLocation] = useState(null);
  const [resolvedGeo, setResolvedGeo] = useState({ address: '', city: '', lat: null, lon: null });
  const [locationLoading, setLocationLoading] = useState(false);
  const [lastLocationSyncMs, setLastLocationSyncMs] = useState(0);

  const watchIdRef = useRef(null);
  const wakeLockRef = useRef(null);
  const lastPingTimeRef = useRef(0);
  const lastSyncedCoordsRef = useRef(null);
  const bestAccuracyRef = useRef({ accuracy: Infinity, updatedAt: 0 });
  const lastGeocodedCoordsRef = useRef(null);
  const shiftEpochRef = useRef(0);
  const isOnlineRef = useRef(false);
  const latestProfileRef = useRef(profile);
  const notifiedOfferKeysRef = useRef(new Set());

  const isOnline = String(profile?.onlineStatus || '').toLowerCase() === 'online';
  const activeRequestId = String(profile?.activeServiceRequestId || '').trim();
  const queuedRequestId = String(profile?.queuedServiceRequestId || '').trim();

  useEffect(() => {
    isOnlineRef.current = isOnline;
  }, [isOnline]);

  useEffect(() => {
    latestProfileRef.current = profile;
  }, [profile]);

  const activeCoords = useMemo(() => {
    if (
      Number.isFinite(Number(deviceLocation?.latitude))
      && Number.isFinite(Number(deviceLocation?.longitude))
    ) {
      return deviceLocation;
    }
    const pLat = Number(profile?.liveLocation?.latitude);
    const pLon = Number(profile?.liveLocation?.longitude);
    if (Number.isFinite(pLat) && Number.isFinite(pLon)) {
      return {
        latitude: pLat,
        longitude: pLon,
        accuracy: profile?.liveLocation?.accuracy ?? null,
        heading: profile?.liveLocation?.heading ?? null,
        speed: profile?.liveLocation?.speed ?? null,
        updatedAtMs: profile?.liveLocation?.updatedAtMs || 0,
      };
    }
    return null;
  }, [deviceLocation, profile?.liveLocation]);

  const stopWatchers = useCallback(() => {
    if (watchIdRef.current !== null && typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
  }, []);

  const refreshWallet = useCallback(async () => {
    if (!user?.uid) return null;
    setWalletLoading(true);
    setWalletError('');
    try {
      const snap = await getHelperWalletSnapshot();
      setWalletSnapshot(snap);
      return snap;
    } catch (err) {
      setWalletError(err?.message || 'Unable to load wallet balance right now.');
      return null;
    } finally {
      setWalletLoading(false);
    }
  }, [user?.uid]);

  useEffect(() => {
    if (!user?.uid) return undefined;
    const unsubProfile = subscribeToUserProfile(user.uid, (nextProfile) => {
      if (nextProfile) setProfile(nextProfile);
    });
    const unsubOfferings = subscribeToHelperOfferings(user.uid, setOfferings);
    const unsubCatalog = subscribeToServiceCatalog(setCatalog);
    const unsubOffers = subscribeToPendingHelperOffers(user.uid, setOffers);
    const unsubHistory = subscribeToHelperServiceRequests(user.uid, setJobHistory);

    let active = true;
    Promise.all([
      getMyPoliceClearanceReview().catch(() => null),
      getHelperAgreementBundle(user.uid).catch(() => null),
      getHelperWalletSnapshot().catch(() => null),
    ]).then(([reviewData, agreementData, walletData]) => {
      if (!active) return;
      if (reviewData) setClearanceReview(reviewData);
      if (agreementData?.activeVersion) setActiveAgreement(agreementData.activeVersion);
      if (walletData) setWalletSnapshot(walletData);
      setLoadingInitial(false);
    });

    return () => {
      active = false;
      unsubProfile?.();
      unsubOfferings?.();
      unsubCatalog?.();
      unsubOffers?.();
      unsubHistory?.();
    };
  }, [user?.uid]);

  useEffect(() => {
    if (!activeRequestId) {
      setActiveRequest(null);
      return undefined;
    }
    const unsubReq = subscribeToActiveServiceRequest(activeRequestId, (req) => {
      const st = String(req?.status || '').trim().toLowerCase();
      setActiveRequest(req && ACTIVE_JOB_STATUSES.has(st) ? req : null);
    });
    return () => unsubReq?.();
  }, [activeRequestId]);

  useEffect(() => {
    if (!queuedRequestId || queuedRequestId === activeRequestId) {
      setQueuedRequest(null);
      return undefined;
    }
    const unsubQueued = subscribeToActiveServiceRequest(queuedRequestId, (req) => {
      const st = String(req?.status || '').trim().toLowerCase();
      setQueuedRequest(req && ['busy_helper_confirmation', 'helper_queued'].includes(st) ? req : null);
    });
    return () => unsubQueued?.();
  }, [activeRequestId, queuedRequestId]);

  useEffect(() => {
    const nowMs = Date.now();
    const list = Array.isArray(offers) ? offers : [];
    list.forEach((offer) => {
      if (!offer?.id) return;
      if (offer.offerExpiresAt && Number(offer.offerExpiresAt) <= nowMs) return;
      const offerKey = `${offer.id}:${offer.offerRevision || 0}:${offer.offerToken || ''}`;
      if (notifiedOfferKeysRef.current.has(offerKey)) return;
      notifiedOfferKeysRef.current.add(offerKey);
      playOfferAlert(offer);
    });
  }, [offers]);

  // Reverse-geocode current live coordinates whenever the helper moves > 35m or address is missing
  useEffect(() => {
    if (!activeCoords) return undefined;
    const prev = lastGeocodedCoordsRef.current;
    const moved = prev ? calculateDistanceMeters(prev, activeCoords) : Infinity;
    const storedMatch =
      profile?.liveLocation?.address
      && Number.isFinite(Number(profile?.liveLocation?.latitude))
      && calculateDistanceMeters(profile.liveLocation, activeCoords) < 35;

    if (moved < 35 && resolvedGeo.address) {
      return undefined;
    }

    let cancelled = false;
    reverseGeocodeCoords(activeCoords).then((geo) => {
      if (cancelled || !geo) return;
      lastGeocodedCoordsRef.current = {
        latitude: activeCoords.latitude,
        longitude: activeCoords.longitude,
      };
      setResolvedGeo({
        address: geo.address || '',
        city: geo.city || '',
        lat: activeCoords.latitude,
        lon: activeCoords.longitude,
      });
    });

    if (storedMatch && !resolvedGeo.address) {
      setResolvedGeo((curr) => ({
        ...curr,
        address: String(profile?.liveLocation?.address || '').trim(),
        city: String(profile?.liveLocation?.city || '').trim(),
      }));
    }

    return () => {
      cancelled = true;
    };
  }, [activeCoords, profile?.liveLocation, resolvedGeo.address]);

  // Passive high-accuracy single GPS refresh on mount if browser geolocation permission is already granted
  // Uses preserveOnlineStatus: true so offline helpers NEVER get pushed back online
  useEffect(() => {
    if (!user?.uid || typeof navigator === 'undefined' || !navigator.permissions || !navigator.geolocation) {
      return undefined;
    }
    let cancelled = false;
    navigator.permissions
      .query({ name: 'geolocation' })
      .then((perm) => {
        if (cancelled || perm.state !== 'granted') return;
        readCurrentGeoPosition({ enableHighAccuracy: true, timeout: 10000, maximumAge: 15000 })
          .then(async (coords) => {
            if (cancelled) return;
            const loc = {
              latitude: coords.latitude,
              longitude: coords.longitude,
              accuracy: coords.accuracy || null,
              heading: coords.heading || null,
              speed: coords.speed || null,
              updatedAtMs: Date.now(),
            };
            setDeviceLocation(loc);
            const geo = await resolveGeoWithRace(loc, 2400);
            if (cancelled) return;
            if (geo) {
              lastGeocodedCoordsRef.current = { latitude: loc.latitude, longitude: loc.longitude };
              setResolvedGeo({
                address: geo.address || '',
                city: geo.city || '',
                lat: loc.latitude,
                lon: loc.longitude,
              });
            }
            const latestProfile = latestProfileRef.current || {};
            const latestOnline = String(latestProfile.onlineStatus || '').toLowerCase() === 'online';
            const lastSyncedAtMs = Number(latestProfile?.liveLocation?.updatedAtMs || 0);
            if (!latestOnline && lastSyncedAtMs > 0 && Date.now() - lastSyncedAtMs < 5 * 60 * 1000) {
              return;
            }
            await updateWebHelperLiveLocation({
              preserveOnlineStatus: true,
              latitude: loc.latitude,
              longitude: loc.longitude,
              accuracy: loc.accuracy,
              heading: loc.heading,
              speed: loc.speed,
              liveAddress: geo?.address || '',
              city: geo?.city || '',
            }).catch(() => null);
            if (!cancelled) setLastLocationSyncMs(Date.now());
          })
          .catch(() => null);
      })
      .catch(() => null);

    return () => {
      cancelled = true;
    };
  }, [user?.uid]);

  // Wake Lock while online
  useEffect(() => {
    async function requestWakeLock() {
      if (isOnline && typeof navigator !== 'undefined' && 'wakeLock' in navigator && !wakeLockRef.current) {
        try {
          wakeLockRef.current = await navigator.wakeLock.request('screen');
        } catch {
          // Ignore unsupported/blocked wake lock
        }
      }
    }
    if (isOnline) {
      requestWakeLock();
    } else if (wakeLockRef.current) {
      wakeLockRef.current.release().catch(() => null);
      wakeLockRef.current = null;
    }
    return () => {
      wakeLockRef.current?.release().catch(() => null);
      wakeLockRef.current = null;
    };
  }, [isOnline]);

  const sendGpsUpdate = useCallback(async (coords, epochAtCall, force = false) => {
    if (!isOnlineRef.current || epochAtCall !== shiftEpochRef.current) {
      return;
    }
    const accuracy = Number.isFinite(Number(coords?.accuracy)) ? Number(coords.accuracy) : null;
    const now = Date.now();

    // Reject sudden coarse cell/IP fallback regressions when a recent accurate GPS lock exists
    if (
      !force
      && accuracy !== null
      && accuracy > 2500
      && bestAccuracyRef.current.accuracy < 200
      && now - bestAccuracyRef.current.updatedAt < 60000
    ) {
      return;
    }

    if (accuracy !== null && (accuracy <= bestAccuracyRef.current.accuracy || now - bestAccuracyRef.current.updatedAt > 60000)) {
      bestAccuracyRef.current = { accuracy, updatedAt: now };
    }

    const nextLoc = {
      latitude: Number(coords.latitude),
      longitude: Number(coords.longitude),
      accuracy,
      heading: Number.isFinite(Number(coords.heading)) ? Number(coords.heading) : null,
      speed: Number.isFinite(Number(coords.speed)) ? Number(coords.speed) : null,
      updatedAtMs: now,
    };
    setDeviceLocation(nextLoc);

    const prevCoords = lastSyncedCoordsRef.current;
    const movedMeters = prevCoords ? calculateDistanceMeters(prevCoords, nextLoc) : Infinity;
    const elapsedMs = now - lastPingTimeRef.current;
    const accuracyImproved =
      accuracy !== null
      && Number.isFinite(prevCoords?.accuracy)
      && prevCoords.accuracy > 80
      && accuracy <= prevCoords.accuracy * 0.6;

    const shouldSync =
      force
      || (movedMeters >= 15 && elapsedMs >= 8000)
      || (accuracyImproved && elapsedMs >= 4000)
      || elapsedMs >= 25000;

    if (!shouldSync) {
      return;
    }

    lastPingTimeRef.current = now;
    lastSyncedCoordsRef.current = { ...nextLoc };

    try {
      const geo = await resolveGeoWithRace(nextLoc, 2200);
      if (!isOnlineRef.current || epochAtCall !== shiftEpochRef.current) {
        return;
      }
      if (geo) {
        lastGeocodedCoordsRef.current = { latitude: nextLoc.latitude, longitude: nextLoc.longitude };
        setResolvedGeo({
          address: geo.address || '',
          city: geo.city || '',
          lat: nextLoc.latitude,
          lon: nextLoc.longitude,
        });
      }
      await updateWebHelperLiveLocation({
        syncOnly: true,
        latitude: nextLoc.latitude,
        longitude: nextLoc.longitude,
        accuracy: nextLoc.accuracy,
        heading: nextLoc.heading,
        speed: nextLoc.speed,
        liveAddress: geo?.address || '',
        city: geo?.city || '',
      });
      if (isOnlineRef.current && epochAtCall === shiftEpochRef.current) {
        setGpsStatus('active');
        setGpsError('');
        setLastLocationSyncMs(Date.now());
      }
    } catch (err) {
      if (isOnlineRef.current && epochAtCall === shiftEpochRef.current) {
        setGpsStatus('error');
        setGpsError(err?.message || 'GPS sync failed.');
      }
    }
  }, []);

  // Watch position continuously while helper shift is online
  useEffect(() => {
    if (!isOnline) {
      stopWatchers();
      setGpsStatus('idle');
      return undefined;
    }

    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setGpsError('Geolocation is not supported by your browser.');
      setGpsStatus('error');
      return undefined;
    }

    let cancelled = false;
    const watchEpoch = shiftEpochRef.current;
    setGpsStatus((curr) => (curr === 'active' ? 'active' : 'acquiring'));

    watchIdRef.current = navigator.geolocation.watchPosition(
      (p) => {
        if (cancelled || !isOnlineRef.current || watchEpoch !== shiftEpochRef.current) return;
        setGpsStatus('active');
        sendGpsUpdate(p.coords, watchEpoch, false);
      },
      (err) => {
        if (cancelled || !isOnlineRef.current || watchEpoch !== shiftEpochRef.current) return;
        setGpsStatus('error');
        setGpsError(err?.message || 'Location permission denied or unavailable.');
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 3000 },
    );

    const heartbeatId = window.setInterval(() => {
      if (cancelled || !isOnlineRef.current || watchEpoch !== shiftEpochRef.current) return;
      if (!document.hidden && navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            if (cancelled || !isOnlineRef.current || watchEpoch !== shiftEpochRef.current) return;
            sendGpsUpdate(pos.coords, watchEpoch, false);
          },
          () => null,
          { enableHighAccuracy: true, timeout: 12000, maximumAge: 5000 },
        );
      }
    }, 25000);

    return () => {
      cancelled = true;
      window.clearInterval(heartbeatId);
      stopWatchers();
    };
  }, [isOnline, sendGpsUpdate, stopWatchers]);

  // Visibility guard while online
  useEffect(() => {
    if (!isOnline) return undefined;
    const visEpoch = shiftEpochRef.current;

    const handleVisibilityChange = () => {
      if (!isOnlineRef.current || visEpoch !== shiftEpochRef.current) return;
      if (document.hidden) {
        reportHelperAppVisibility({ appVisibilityState: 'hidden' }).catch(() => null);
        if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
          try {
            new Notification('Uncedo Helpers Shift Active', {
              body: 'You are online on Uncedo. Keep Uncedo Helpers open so your live GPS stays current for nearby job offers.',
              tag: 'uncedo-stay-online',
            });
          } catch {
            // Notification not permitted
          }
        }
      } else {
        reportHelperAppVisibility({ appVisibilityState: 'visible' }).catch(() => null);
        if (navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              if (isOnlineRef.current && visEpoch === shiftEpochRef.current) {
                sendGpsUpdate(pos.coords, visEpoch, true);
              }
            },
            () => null,
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 3000 },
          );
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', handleVisibilityChange);
    };
  }, [isOnline, sendGpsUpdate]);

  const toggleOnline = useCallback(async () => {
    const nextEpoch = ++shiftEpochRef.current;
    const currentlyOnline = isOnlineRef.current;
    setShiftBusy(true);
    setGpsError('');

    try {
      if (!currentlyOnline) {
        if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
          Notification.requestPermission().catch(() => null);
        }
        const coords = await readCurrentGeoPosition({
          enableHighAccuracy: true,
          timeout: 12000,
          maximumAge: 0,
        });
        if (nextEpoch !== shiftEpochRef.current) return;

        const nextLoc = {
          latitude: Number(coords.latitude),
          longitude: Number(coords.longitude),
          accuracy: Number.isFinite(Number(coords.accuracy)) ? Number(coords.accuracy) : null,
          heading: Number.isFinite(Number(coords.heading)) ? Number(coords.heading) : null,
          speed: Number.isFinite(Number(coords.speed)) ? Number(coords.speed) : null,
          updatedAtMs: Date.now(),
        };
        setDeviceLocation(nextLoc);
        bestAccuracyRef.current = {
          accuracy: nextLoc.accuracy ?? Infinity,
          updatedAt: Date.now(),
        };

        const geo = await resolveGeoWithRace(nextLoc, 2500);
        if (nextEpoch !== shiftEpochRef.current) return;

        if (geo) {
          lastGeocodedCoordsRef.current = { latitude: nextLoc.latitude, longitude: nextLoc.longitude };
          setResolvedGeo({
            address: geo.address || '',
            city: geo.city || '',
            lat: nextLoc.latitude,
            lon: nextLoc.longitude,
          });
        }

        lastPingTimeRef.current = Date.now();
        lastSyncedCoordsRef.current = { ...nextLoc };

        await updateWebHelperLiveLocation({
          onlineStatus: 'online',
          latitude: nextLoc.latitude,
          longitude: nextLoc.longitude,
          accuracy: nextLoc.accuracy,
          heading: nextLoc.heading,
          speed: nextLoc.speed,
          liveAddress: geo?.address || '',
          city: geo?.city || '',
        });

        if (nextEpoch !== shiftEpochRef.current) return;
        isOnlineRef.current = true;
        setGpsStatus('active');
        setLastLocationSyncMs(Date.now());
        setProfile((prev) => ({
          ...prev,
          onlineStatus: 'online',
          liveLocation: {
            ...nextLoc,
            address: geo?.address || prev?.liveLocation?.address || null,
            city: geo?.city || prev?.liveLocation?.city || null,
          },
          ...(geo?.city ? { city: geo.city } : {}),
        }));
      } else {
        // Immediately lock offline & cancel any active watchers BEFORE calling the backend
        isOnlineRef.current = false;
        stopWatchers();
        setGpsStatus('idle');
        setProfile((prev) => ({ ...prev, onlineStatus: 'offline', locationSharingEnabled: false }));
        await updateWebHelperLiveLocation({ onlineStatus: 'offline' });
      }
    } catch (err) {
      if (nextEpoch === shiftEpochRef.current) {
        setGpsError(err?.message || 'Unable to update availability right now.');
      }
    } finally {
      if (nextEpoch === shiftEpochRef.current) {
        setShiftBusy(false);
      }
    }
  }, [stopWatchers]);

  const refreshCurrentLocation = useCallback(async () => {
    setLocationLoading(true);
    setGpsError('');
    try {
      const coords = await readCurrentGeoPosition({
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 0,
      });
      const nextLoc = {
        latitude: Number(coords.latitude),
        longitude: Number(coords.longitude),
        accuracy: Number.isFinite(Number(coords.accuracy)) ? Number(coords.accuracy) : null,
        heading: Number.isFinite(Number(coords.heading)) ? Number(coords.heading) : null,
        speed: Number.isFinite(Number(coords.speed)) ? Number(coords.speed) : null,
        updatedAtMs: Date.now(),
      };
      setDeviceLocation(nextLoc);

      const geo = await resolveGeoWithRace(nextLoc, 3500);
      if (geo) {
        lastGeocodedCoordsRef.current = { latitude: nextLoc.latitude, longitude: nextLoc.longitude };
        setResolvedGeo({
          address: geo.address || '',
          city: geo.city || '',
          lat: nextLoc.latitude,
          lon: nextLoc.longitude,
        });
      }

      lastPingTimeRef.current = Date.now();
      lastSyncedCoordsRef.current = { ...nextLoc };

      await updateWebHelperLiveLocation({
        preserveOnlineStatus: true,
        latitude: nextLoc.latitude,
        longitude: nextLoc.longitude,
        accuracy: nextLoc.accuracy,
        heading: nextLoc.heading,
        speed: nextLoc.speed,
        liveAddress: geo?.address || '',
        city: geo?.city || '',
      });
      setLastLocationSyncMs(Date.now());
    } catch (err) {
      setGpsError(err?.message || 'Unable to refresh live location.');
    } finally {
      setLocationLoading(false);
    }
  }, []);

  const respondToOffer = useCallback(async (offer, action, onAcceptedNavigate) => {
    setOfferBusyId(offer.id);
    setOfferError('');
    setOfferNotice('');
    try {
      const result = await respondToServiceRequestOfferApi({
        requestId: offer.id,
        offerToken: offer.offerToken,
        offerRevision: offer.offerRevision,
        action,
      });
      if (action === 'accept') {
        if (result?.busyFallbackAccepted) {
          setOfferNotice('Queued offer accepted. We sent your estimated finish and arrival times to the customer for confirmation.');
        } else if (onAcceptedNavigate) {
          onAcceptedNavigate(`/requests/${offer.id}`);
        }
      }
    } catch (err) {
      setOfferError(err?.message || 'Unable to process offer response. Please try again.');
    } finally {
      setOfferBusyId('');
    }
  }, []);

  const refreshVerification = useCallback(async () => {
    return syncMyHelperVerificationStatus();
  }, []);

  const evaluation = useMemo(
    () =>
      evaluateHelperOnboarding({
        profile,
        offerings,
        catalog,
        clearanceReview,
        activeAgreement,
      }),
    [activeAgreement, catalog, clearanceReview, offerings, profile],
  );

  const liveCity = useMemo(() => {
    const resolved = String(resolvedGeo.city || '').trim();
    if (resolved) return resolved;
    const storedLiveCity = String(profile?.liveLocation?.city || '').trim();
    if (storedLiveCity) return storedLiveCity;
    if (activeCoords) return '';
    return String(profile?.city || '').trim();
  }, [activeCoords, profile?.city, profile?.liveLocation?.city, resolvedGeo.city]);

  const liveAddress = useMemo(() => {
    const resolved = String(resolvedGeo.address || '').trim();
    if (resolved) return resolved;
    return String(profile?.liveLocation?.address || '').trim();
  }, [profile?.liveLocation?.address, resolvedGeo.address]);

  const liveLocationText = useMemo(
    () =>
      formatLiveLocationDisplay({
        address: liveAddress,
        city: liveCity,
        latitude: activeCoords?.latitude,
        longitude: activeCoords?.longitude,
      }),
    [activeCoords?.latitude, activeCoords?.longitude, liveAddress, liveCity],
  );

  const locationAccuracyMeters = useMemo(() => {
    const acc = Number(activeCoords?.accuracy);
    return Number.isFinite(acc) && acc > 0 ? Math.round(acc) : null;
  }, [activeCoords?.accuracy]);

  const value = useMemo(
    () => ({
      user,
      profile,
      offerings,
      catalog,
      offers,
      jobHistory,
      activeRequest,
      queuedRequest,
      clearanceReview,
      activeAgreement,
      walletSnapshot,
      walletLoading,
      walletError,
      refreshWallet,
      loadingInitial,
      evaluation,
      isOnline,
      gpsStatus,
      gpsError,
      shiftBusy,
      offerBusyId,
      offerError,
      offerNotice,
      liveLocation: activeCoords,
      liveAddress,
      liveCity,
      liveLocationText,
      locationAccuracyMeters,
      locationLoading,
      lastLocationSyncMs,
      refreshCurrentLocation,
      setGpsError,
      setOfferError,
      setOfferNotice,
      setClearanceReview,
      setActiveAgreement,
      toggleOnline,
      respondToOffer,
      refreshVerification,
    }),
    [
      user,
      profile,
      offerings,
      catalog,
      offers,
      jobHistory,
      activeRequest,
      queuedRequest,
      clearanceReview,
      activeAgreement,
      walletSnapshot,
      walletLoading,
      walletError,
      refreshWallet,
      loadingInitial,
      evaluation,
      isOnline,
      gpsStatus,
      gpsError,
      shiftBusy,
      offerBusyId,
      offerError,
      offerNotice,
      activeCoords,
      liveAddress,
      liveCity,
      liveLocationText,
      locationAccuracyMeters,
      locationLoading,
      lastLocationSyncMs,
      refreshCurrentLocation,
      toggleOnline,
      respondToOffer,
      refreshVerification,
    ],
  );

  return <HelperSessionContext.Provider value={value}>{children}</HelperSessionContext.Provider>;
}

export function useHelperSession() {
  return useContext(HelperSessionContext);
}
