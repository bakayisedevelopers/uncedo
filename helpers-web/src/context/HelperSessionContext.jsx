import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  getHelperCashPaymentConfirmationsApi,
  getHelperWalletSnapshot,
  normalizeWalletDocumentData,
  reportHelperAppVisibility,
  resolveHelperPayoutAmount,
  respondToServiceRequestOfferApi,
  subscribeToActiveServiceRequest,
  subscribeToHelperAgreementBundle,
  subscribeToHelperOfferings,
  subscribeToHelperPoliceClearanceReview,
  subscribeToHelperServiceRequests,
  subscribeToHelperWallet,
  subscribeToHelperWalletTransactions,
  subscribeToHelperWeeklyPayouts,
  subscribeToPendingHelperOffers,
  subscribeToServiceCatalog,
  subscribeToServicePaymentOperationsMap,
  subscribeToUserProfile,
  syncMyHelperVerificationStatus,
  updateWebHelperLiveLocation,
} from '../services/helperDataService';
import {
  calculateDistanceMeters,
  formatLiveLocationDisplay,
  reverseGeocodeCoords,
} from '../services/locationGeocodeService';
import {
  subscribeToHelperOptionRatings,
  subscribeToHelperServiceMastery,
  subscribeToHelperServiceOptionMastery,
  subscribeToHelperServiceRatings,
  subscribeToMasteryConfig,
  subscribeToMembershipConfig,
  subscribeToRewardAccount,
} from '../services/helperMasteryService';
import { DEFAULT_MASTERY_CONFIG, DEFAULT_MEMBERSHIP_CONFIG } from '../utils/masteryModel';
import { evaluateHelperOnboarding } from '../utils/onboardingSteps';
import {
  closeOfferBrowserNotification,
  getBrowserNotificationPermission,
  parseOfferNotificationSearchParams,
  requestBrowserNotificationPermission,
  showOfferBrowserNotification,
} from '../utils/offerNotificationModel';
import { syncHelperWebPushToken } from '../utils/fcmPush';

const HelperSessionContext = createContext(null);

const ACTIVE_JOB_STATUSES = new Set([
  'accepted',
  'en_route',
  'driving',
  'buying_resources',
  'arrived',
  'work_started',
]);

function playOfferSoundAndVibrate() {
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
}

const EMPTY_LEGACY_SUMMARY = {
  unresolvedAmountMinor: 0,
  unresolvedAmount: 0,
  unresolvedJobsCount: 0,
  hasUnresolvedLegacyJobs: false,
};

const EMPTY_WALLET_SNAPSHOT = {
  wallet: {
    balanceMinor: 0,
    balance: 0,
    availableMinor: 0,
    reservedMinor: 0,
    outstandingCommissionMinor: 0,
    reconciliationBlocked: false,
    currency: 'ZAR',
  },
  nextPayoutEstimateMinor: 0,
  legacySummary: EMPTY_LEGACY_SUMMARY,
  transactions: [],
};

const ACCOUNTED_WALLET_ENTRY_TYPES = new Set([
  'job_earning_credit',
  'weekly_earning_credit',
  'cancellation_earning_credit',
  'cash_commission_assessed',
  'legacy_job_resolved',
  'split_direct_settlement',
  'split_debt_recovery',
  'split_settlement_reversal',
]);

const PENDING_EXPLICIT_PAYMENT_STATUSES = new Set([
  'unpaid',
  'cash_selected',
  'awaiting_cash_confirmation',
  'awaiting_customer_confirmation',
  'payment_processing',
  'payment_reconciliation_required',
]);

function computeLiveLegacySummary({ requests = [], transactions = [], weeklyPayouts = [] } = {}) {
  const paidIds = new Set();
  for (const payout of Array.isArray(weeklyPayouts) ? weeklyPayouts : []) {
    if (String(payout?.status || '').trim().toLowerCase() === 'paid') {
      for (const reqId of Array.isArray(payout?.requestIds) ? payout.requestIds : []) {
        const clean = String(reqId || '').trim();
        if (clean) paidIds.add(clean);
      }
    }
  }
  const accountedIds = new Set();
  for (const tx of Array.isArray(transactions) ? transactions : []) {
    const entryType = String(tx?.entryType || '').trim().toLowerCase();
    const reqId = String(tx?.requestId || '').trim();
    if (reqId && ACCOUNTED_WALLET_ENTRY_TYPES.has(entryType)) {
      accountedIds.add(reqId);
    }
    if (Array.isArray(tx?.resolvedRequestIds)) {
      for (const resolvedId of tx.resolvedRequestIds) {
        const clean = String(resolvedId || '').trim();
        if (clean) accountedIds.add(clean);
      }
    }
  }

  let unresolvedAmountMinor = 0;
  let unresolvedJobsCount = 0;
  for (const job of Array.isArray(requests) ? requests : []) {
    const jobId = String(job?.id || '').trim();
    if (!jobId) continue;
    const st = String(job?.status || '').trim().toLowerCase();
    if (st !== 'completed' && st !== 'canceled' && st !== 'cancelled') continue;
    if (Number(job?.legacyWalletResolvedAtMs || 0) > 0) continue;
    if (paidIds.has(jobId) || accountedIds.has(jobId)) continue;
    if (Number(job?.helperWalletAccountingVersion || 0) === 1) continue;
    const paymentMethod = String(job?.paymentMethod || '').trim().toLowerCase();
    const paymentStatus = String(job?.paymentStatus || '').trim().toLowerCase();
    if (
      String(job?.cashPayment?.status || '').trim().toLowerCase() === 'helper_confirmed'
      || (paymentMethod === 'cash' && paymentStatus === 'paid')
    ) {
      continue;
    }
    if (
      String(job?.paymentFlowVersion || '').trim() === 'explicit_v1'
      && PENDING_EXPLICIT_PAYMENT_STATUSES.has(paymentStatus)
    ) {
      continue;
    }
    const helperAmountMajor = st === 'completed'
      ? resolveHelperPayoutAmount(job)
      : Number(job?.helperPayoutBreakdown?.helperAmount ?? resolveHelperPayoutAmount(job) ?? 0);
    const minor = Math.round((Number.isFinite(helperAmountMajor) ? helperAmountMajor : 0) * 100);
    if (minor <= 0) continue;
    unresolvedAmountMinor += minor;
    unresolvedJobsCount += 1;
  }

  return {
    unresolvedAmountMinor,
    unresolvedAmount: Number((unresolvedAmountMinor / 100).toFixed(2)),
    unresolvedJobsCount,
    hasUnresolvedLegacyJobs: unresolvedJobsCount > 0 && unresolvedAmountMinor > 0,
  };
}

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

export function HelperSessionProvider({ user, onNavigate, children }) {
  const [profile, setProfile] = useState(user?.profile || {});
  const [offerings, setOfferings] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [offers, setOffers] = useState([]);
  const [jobHistory, setJobHistory] = useState([]);
  const [activeRequest, setActiveRequest] = useState(null);
  const [queuedRequest, setQueuedRequest] = useState(null);
  const [clearanceReview, setClearanceReview] = useState(null);
  const [agreementBundle, setAgreementBundle] = useState(null);
  const [activeAgreement, setActiveAgreement] = useState(null);
  const [liveWalletState, setLiveWalletState] = useState(null);
  const [liveWalletTransactions, setLiveWalletTransactions] = useState(null);
  const [weeklyPayouts, setWeeklyPayouts] = useState([]);
  const [paymentOperationsMap, setPaymentOperationsMap] = useState({});
  const [cashConfirmations, setCashConfirmations] = useState([]);
  const [serverWalletSnapshot, setServerWalletSnapshot] = useState(EMPTY_WALLET_SNAPSHOT);
  const [walletLoading, setWalletLoading] = useState(false);
  const [walletError, setWalletError] = useState('');
  const [serviceOptionMastery, setServiceOptionMastery] = useState([]);
  const [serviceMastery, setServiceMastery] = useState([]);
  const [serviceOptionRatings, setServiceOptionRatings] = useState([]);
  const [serviceRatings, setServiceRatings] = useState([]);
  const [rewardAccount, setRewardAccount] = useState(null);
  const [masteryConfig, setMasteryConfig] = useState(DEFAULT_MASTERY_CONFIG);
  const [membershipConfig, setMembershipConfig] = useState(DEFAULT_MEMBERSHIP_CONFIG);
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
  const [notificationPermission, setNotificationPermission] = useState(() =>
    getBrowserNotificationPermission(),
  );

  const watchIdRef = useRef(null);
  const wakeLockRef = useRef(null);
  const lastPingTimeRef = useRef(0);
  const lastSyncedCoordsRef = useRef(null);
  const bestAccuracyRef = useRef({ accuracy: Infinity, updatedAt: 0 });
  const lastGeocodedCoordsRef = useRef(null);
  const shiftEpochRef = useRef(0);
  const isOnlineRef = useRef(false);
  const latestProfileRef = useRef(profile);
  const latestOffersRef = useRef(offers);
  const latestActiveRequestRef = useRef(activeRequest);
  const latestEvaluationRef = useRef(null);
  const onNavigateRef = useRef(onNavigate);
  const notifiedOfferKeysRef = useRef(new Set());
  const activeNotifiedOfferIdsRef = useRef(new Set());
  const processedOfferActionKeysRef = useRef(new Set());

  const isOnline = String(profile?.onlineStatus || '').toLowerCase() === 'online';
  const activeRequestId = String(profile?.activeServiceRequestId || '').trim();
  const queuedRequestId = String(profile?.queuedServiceRequestId || '').trim();

  useEffect(() => {
    isOnlineRef.current = isOnline;
  }, [isOnline]);

  useEffect(() => {
    latestProfileRef.current = profile;
  }, [profile]);

  useEffect(() => {
    latestOffersRef.current = offers;
  }, [offers]);

  useEffect(() => {
    latestActiveRequestRef.current = activeRequest;
  }, [activeRequest]);

  useEffect(() => {
    onNavigateRef.current = onNavigate;
  }, [onNavigate]);

  const requestNotificationPermission = useCallback(async () => {
    const next = await requestBrowserNotificationPermission();
    setNotificationPermission(next);
    if (next === 'granted' && user?.uid) {
      await syncHelperWebPushToken(user.uid).catch(() => null);
    }
    return next;
  }, [user?.uid]);

  useEffect(() => {
    if (!user?.uid || notificationPermission !== 'granted') return undefined;
    let cancelled = false;
    syncHelperWebPushToken(user.uid).catch(() => null);
    const onVisibility = () => {
      if (!cancelled && document.visibilityState === 'visible') {
        syncHelperWebPushToken(user.uid).catch(() => null);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [notificationPermission, user?.uid]);

  useEffect(() => {
    setNotificationPermission(getBrowserNotificationPermission());
    if (typeof navigator === 'undefined' || !navigator.permissions?.query) {
      return undefined;
    }
    let permStatus = null;
    let active = true;
    navigator.permissions
      .query({ name: 'notifications' })
      .then((status) => {
        if (!active) return;
        permStatus = status;
        setNotificationPermission(status.state === 'prompt' ? 'default' : status.state);
        status.onchange = () => {
          setNotificationPermission(getBrowserNotificationPermission());
        };
      })
      .catch(() => null);
    return () => {
      active = false;
      if (permStatus) {
        permStatus.onchange = null;
      }
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search || '');
    if (params.get('acceptedQueued') === '1') {
      setOfferNotice('Queued offer accepted. We sent your estimated finish and arrival times to the customer for confirmation.');
      params.delete('acceptedQueued');
      const nextSearch = params.toString();
      const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}${window.location.hash || ''}`;
      window.history.replaceState(null, '', nextUrl);
    }
  }, []);

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

  const refreshWallet = useCallback(async ({ silent = false } = {}) => {
    if (!user?.uid) return null;
    if (!silent) {
      setWalletLoading(true);
      setWalletError('');
    }
    try {
      const snap = await getHelperWalletSnapshot();
      setServerWalletSnapshot(snap);
      return snap;
    } catch (err) {
      if (!silent) {
        setWalletError(err?.message || 'Unable to load wallet balance right now.');
      }
      return null;
    } finally {
      if (!silent) {
        setWalletLoading(false);
      }
    }
  }, [user?.uid]);

  const refreshCashConfirmations = useCallback(async () => {
    if (!user?.uid) return [];
    try {
      const list = await getHelperCashPaymentConfirmationsApi();
      setCashConfirmations(Array.isArray(list) ? list : []);
      return list;
    } catch {
      return [];
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
    const unsubWallet = subscribeToHelperWallet(user.uid, setLiveWalletState);
    const unsubWalletTx = subscribeToHelperWalletTransactions(user.uid, setLiveWalletTransactions);
    const unsubWeeklyPayouts = subscribeToHelperWeeklyPayouts(user.uid, setWeeklyPayouts);
    const unsubClearance = subscribeToHelperPoliceClearanceReview(user.uid, (nextReview) => {
      if (nextReview) setClearanceReview(nextReview);
    });
    const unsubAgreement = subscribeToHelperAgreementBundle(user.uid, (nextBundle) => {
      if (nextBundle) {
        setAgreementBundle(nextBundle);
        if (nextBundle.activeVersion) setActiveAgreement(nextBundle.activeVersion);
      }
    });
    const unsubMasteryConfig = subscribeToMasteryConfig(setMasteryConfig);
    const unsubMembershipConfig = subscribeToMembershipConfig(setMembershipConfig);
    const unsubOptionMastery = subscribeToHelperServiceOptionMastery(user.uid, setServiceOptionMastery, () => setServiceOptionMastery([]));
    const unsubServiceMastery = subscribeToHelperServiceMastery(user.uid, setServiceMastery, () => setServiceMastery([]));
    const unsubOptionRatings = subscribeToHelperOptionRatings(user.uid, setServiceOptionRatings, () => setServiceOptionRatings([]));
    const unsubServiceRatings = subscribeToHelperServiceRatings(user.uid, setServiceRatings, () => setServiceRatings([]));
    const unsubRewardAccount = subscribeToRewardAccount(user.uid, setRewardAccount, () => setRewardAccount(null));

    let active = true;
    Promise.all([
      getHelperWalletSnapshot().catch(() => null),
      getHelperCashPaymentConfirmationsApi().catch(() => []),
    ]).then(([walletData, cashList]) => {
      if (!active) return;
      if (walletData) setServerWalletSnapshot(walletData);
      if (Array.isArray(cashList)) setCashConfirmations(cashList);
      setLoadingInitial(false);
    });

    return () => {
      active = false;
      unsubProfile?.();
      unsubOfferings?.();
      unsubCatalog?.();
      unsubOffers?.();
      unsubHistory?.();
      unsubWallet?.();
      unsubWalletTx?.();
      unsubWeeklyPayouts?.();
      unsubClearance?.();
      unsubAgreement?.();
      unsubMasteryConfig?.();
      unsubMembershipConfig?.();
      unsubOptionMastery?.();
      unsubServiceMastery?.();
      unsubOptionRatings?.();
      unsubServiceRatings?.();
      unsubRewardAccount?.();
    };
  }, [user?.uid]);

  // Watch servicePaymentOperations for recent completed unpaid jobs so cash confirmations update in real time
  const completedUnpaidRequestIds = useMemo(
    () =>
      (Array.isArray(jobHistory) ? jobHistory : [])
        .filter((job) => {
          const st = String(job?.status || '').trim().toLowerCase();
          const paySt = String(job?.paymentStatus || '').trim().toLowerCase();
          return st === 'completed' && paySt !== 'paid';
        })
        .slice(0, 25)
        .map((job) => String(job.id || '').trim())
        .filter(Boolean),
    [jobHistory],
  );
  const completedUnpaidIdsKey = completedUnpaidRequestIds.join(',');

  useEffect(() => {
    if (!completedUnpaidIdsKey) {
      setPaymentOperationsMap({});
      return undefined;
    }
    const ids = completedUnpaidIdsKey.split(',').filter(Boolean);
    const unsubOps = subscribeToServicePaymentOperationsMap(ids, setPaymentOperationsMap);
    return () => unsubOps?.();
  }, [completedUnpaidIdsKey]);

  const cashSyncTriggerKey = useMemo(() => {
    const jobPart = (Array.isArray(jobHistory) ? jobHistory : [])
      .filter((job) => String(job?.status || '').trim().toLowerCase() === 'completed')
      .slice(0, 25)
      .map((job) => `${job.id}:${String(job.paymentStatus || '').toLowerCase()}`)
      .join('|');
    const opsPart = Object.values(paymentOperationsMap || {})
      .map((op) => `${op.id}:${String(op.status || '').toLowerCase()}:${String(op.activeAttemptId || '')}`)
      .sort()
      .join('|');
    return `${jobPart}__${opsPart}`;
  }, [jobHistory, paymentOperationsMap]);

  useEffect(() => {
    if (!user?.uid) return undefined;
    const timer = window.setTimeout(() => {
      refreshCashConfirmations();
    }, 180);
    return () => window.clearTimeout(timer);
  }, [cashSyncTriggerKey, refreshCashConfirmations, user?.uid]);

  // Keep serverWalletSnapshot legacySummary reconciled silently whenever wallet/tx/jobs change
  const walletSyncKey = useMemo(() => {
    const terminalSignature = (Array.isArray(jobHistory) ? jobHistory : [])
      .filter((job) => {
        const st = String(job?.status || '').trim().toLowerCase();
        return st === 'completed' || st === 'canceled' || st === 'cancelled';
      })
      .slice(0, 30)
      .map((j) => `${j.id}:${j.status}:${j.paymentStatus || ''}:${j.legacyWalletResolvedAtMs || 0}`)
      .join('|');
    const txLen = Array.isArray(liveWalletTransactions) ? liveWalletTransactions.length : 0;
    const latestTxId = Array.isArray(liveWalletTransactions) && liveWalletTransactions[0]?.id ? liveWalletTransactions[0].id : '';
    const payoutSig = (Array.isArray(weeklyPayouts) ? weeklyPayouts : [])
      .slice(0, 10)
      .map((p) => `${p.id}:${p.status || ''}`)
      .join('|');
    return `${liveWalletState?.wallet?.updatedAtMs || 0}:${txLen}:${latestTxId}:${payoutSig}:${terminalSignature}`;
  }, [jobHistory, liveWalletState?.wallet?.updatedAtMs, liveWalletTransactions, weeklyPayouts]);

  useEffect(() => {
    if (!user?.uid || loadingInitial) return undefined;
    const timer = window.setTimeout(() => {
      refreshWallet({ silent: true });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [loadingInitial, refreshWallet, user?.uid, walletSyncKey]);

  const walletSnapshot = useMemo(() => {
    const hasProfileWallet =
      profile?.wallet && typeof profile.wallet === 'object'
      && (
        Number.isSafeInteger(Number(profile.wallet.balanceMinor))
        || Number.isFinite(Number(profile.wallet.balance))
      );
    const profileFallbackMinor = Number.isSafeInteger(Number(profile?.wallet?.balanceMinor))
      ? Number(profile.wallet.balanceMinor)
      : Math.round(Number(profile?.wallet?.balance || 0) * 100);

    const activeWallet = liveWalletState?.exists && liveWalletState.wallet
      ? liveWalletState.wallet
      : hasProfileWallet
        ? normalizeWalletDocumentData(profile.wallet, profileFallbackMinor)
        : (serverWalletSnapshot?.wallet || EMPTY_WALLET_SNAPSHOT.wallet);

    const activeTransactions = Array.isArray(liveWalletTransactions)
      ? liveWalletTransactions
      : (Array.isArray(serverWalletSnapshot?.transactions) ? serverWalletSnapshot.transactions : []);

    const liveLegacy = computeLiveLegacySummary({
      requests: jobHistory,
      transactions: activeTransactions,
      weeklyPayouts,
    });

    const serverLegacy = serverWalletSnapshot?.legacySummary;
    const txAccountedIds = new Set();
    for (const tx of activeTransactions) {
      if (tx?.requestId && ACCOUNTED_WALLET_ENTRY_TYPES.has(String(tx.entryType || '').toLowerCase())) {
        txAccountedIds.add(String(tx.requestId));
      }
      if (Array.isArray(tx?.resolvedRequestIds)) {
        tx.resolvedRequestIds.forEach((id) => {
          if (id) txAccountedIds.add(String(id));
        });
      }
    }

    const legacySummary = (serverLegacy && liveLegacy.unresolvedAmountMinor === 0 && Number(serverLegacy.unresolvedAmountMinor || 0) > 0)
      ? (() => {
          const allJobsInWindowAccounted = jobHistory.some((j) => txAccountedIds.has(String(j.id)) || Number(j?.legacyWalletResolvedAtMs || 0) > 0);
          const hasLegacyResolutionTx = activeTransactions.some((t) => String(t?.entryType || '').toLowerCase() === 'legacy_job_resolved');
          if (hasLegacyResolutionTx && !liveLegacy.hasUnresolvedLegacyJobs && allJobsInWindowAccounted) {
            return EMPTY_LEGACY_SUMMARY;
          }
          return serverLegacy;
        })()
      : liveLegacy;

    const signedMinor = Number(activeWallet?.balanceMinor || 0);
    return {
      wallet: activeWallet,
      nextPayoutEstimateMinor: activeWallet?.reconciliationBlocked === true ? 0 : Math.max(0, signedMinor),
      legacySummary,
      transactions: activeTransactions,
    };
  }, [
    jobHistory,
    liveWalletState,
    liveWalletTransactions,
    profile?.wallet,
    serverWalletSnapshot,
    weeklyPayouts,
  ]);

  const effectiveCashConfirmations = useMemo(() => {
    const serverList = Array.isArray(cashConfirmations) ? cashConfirmations : [];
    const byRequestId = new Map(serverList.map((item) => [String(item.requestId), item]));

    // Immediately reflect any live awaiting_cash_confirmation seen in servicePaymentOperations or serviceRequests
    for (const job of Array.isArray(jobHistory) ? jobHistory : []) {
      const reqId = String(job?.id || '').trim();
      if (!reqId) continue;
      const op = paymentOperationsMap?.[reqId];
      const st = String(job?.status || '').trim().toLowerCase();
      const opStatus = String(op?.status || '').trim().toLowerCase();
      const jobPayStatus = String(job?.paymentStatus || '').trim().toLowerCase();

      if (st !== 'completed' || opStatus === 'paid' || jobPayStatus === 'paid') {
        byRequestId.delete(reqId);
        continue;
      }
      if (op && opStatus !== 'awaiting_cash_confirmation' && jobPayStatus !== 'awaiting_cash_confirmation') {
        byRequestId.delete(reqId);
        continue;
      }
      if (opStatus === 'awaiting_cash_confirmation' || jobPayStatus === 'awaiting_cash_confirmation') {
        if (!byRequestId.has(reqId)) {
          byRequestId.set(reqId, {
            requestId: reqId,
            requestReference: String(job.publicRequestReference || job.requestReference || reqId),
            service: String(job.subject || job.serviceSummary || job.serviceName || 'Uncedo service'),
            amount: Number(op?.amount ?? job?.totalAmount ?? job?.pricingSnapshot?.finalAmount ?? 0),
            currency: 'ZAR',
            attemptId: String(op?.activeAttemptId || ''),
            customerReportedAtMs: Number(op?.updatedAtMs || 0),
          });
        } else if (op?.activeAttemptId && !byRequestId.get(reqId)?.attemptId) {
          byRequestId.set(reqId, {
            ...byRequestId.get(reqId),
            attemptId: String(op.activeAttemptId),
          });
        }
      }
    }
    return Array.from(byRequestId.values());
  }, [cashConfirmations, jobHistory, paymentOperationsMap]);

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
    const list = (Array.isArray(offers) ? offers : []).filter(
      (offer) => offer?.id && (!offer.offerExpiresAt || Number(offer.offerExpiresAt) > nowMs),
    );
    const activeIds = new Set(list.map((offer) => String(offer.id).trim()).filter(Boolean));

    for (const prevId of Array.from(activeNotifiedOfferIdsRef.current)) {
      if (!activeIds.has(prevId)) {
        activeNotifiedOfferIdsRef.current.delete(prevId);
        closeOfferBrowserNotification(prevId);
      }
    }

    list.forEach((offer) => {
      const offerKey = `${offer.id}:${offer.offerRevision || 0}:${offer.offerToken || ''}`;
      if (notifiedOfferKeysRef.current.has(offerKey)) return;
      notifiedOfferKeysRef.current.add(offerKey);
      activeNotifiedOfferIdsRef.current.add(String(offer.id).trim());

      playOfferSoundAndVibrate();

      const currentProfile = latestProfileRef.current || {};
      const serverVerified = String(currentProfile?.verificationStatus || '').trim().toLowerCase() === 'verified';
      const isBusyFallback = String(offer.offerType || '').trim().toLowerCase() === 'busy_helper_fallback';
      const canRespond = Boolean(
        user?.uid
        && (latestEvaluationRef.current?.fullyVerified || serverVerified)
        && (!latestActiveRequestRef.current || isBusyFallback),
      );

      (async () => {
        await showOfferBrowserNotification(offer, {
          canRespond,
          payoutAmountOverride: offer?.payoutEstimate ?? resolveHelperPayoutAmount(offer),
          onFallbackFocus: () => {
            const path = typeof window !== 'undefined' ? window.location.pathname : '/home';
            if (!['/home', '/workspace', '/jobs', '/services', '/payments', '/profile'].includes(path)) {
              onNavigateRef.current?.('/home');
            }
          },
        });
      })();
    });
  }, [offers, user?.uid]);

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
        if (String(profile?.accountStatus || '').trim().toLowerCase() === 'pending_deletion') {
          setGpsError('Your helper account is scheduled for deletion. Reactivate your account before going online.');
          return;
        }
        if (getBrowserNotificationPermission() === 'default') {
          requestNotificationPermission().catch(() => null);
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
    closeOfferBrowserNotification(offer?.id);
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
      } else if (action === 'decline') {
        setOfferNotice('Job offer declined.');
      }
      return result;
    } catch (err) {
      setOfferError(err?.message || 'Unable to process offer response. Please try again.');
      return null;
    } finally {
      setOfferBusyId('');
    }
  }, []);

  const executePendingNotificationAction = useCallback(
    async ({ requestId, action, offerToken = '', offerRevision = 0 }) => {
      if (!user?.uid || !requestId) return;
      const cleanAction = String(action || 'view').trim().toLowerCase();
      const actionKey = `${requestId}:${cleanAction}:${offerRevision}:${offerToken}`;
      if (processedOfferActionKeysRef.current.has(actionKey)) return;
      processedOfferActionKeysRef.current.add(actionKey);

      if (cleanAction === 'accept' || cleanAction === 'decline') {
        const matched = (latestOffersRef.current || []).find((item) => item.id === requestId) || {
          id: requestId,
          offerToken,
          offerRevision,
        };
        const resolvedOffer = {
          ...matched,
          id: matched.id || requestId,
          offerToken: matched.offerToken || offerToken,
          offerRevision: matched.offerRevision || offerRevision,
        };
        if (!resolvedOffer.offerToken || !resolvedOffer.offerRevision) {
          setOfferError('This helper offer is no longer current.');
          return;
        }
        await respondToOffer(
          resolvedOffer,
          cleanAction,
          cleanAction === 'accept' ? onNavigateRef.current : undefined,
        );
        return;
      }

      const path = typeof window !== 'undefined' ? window.location.pathname : '/home';
      if (!['/home', '/workspace', '/jobs', '/services', '/payments', '/profile'].includes(path)) {
        onNavigateRef.current?.('/home');
      }
    },
    [respondToOffer, user?.uid],
  );

  useEffect(() => {
    if (!user?.uid || typeof window === 'undefined') return undefined;

    const consumeSearchOfferAction = () => {
      const parsed = parseOfferNotificationSearchParams(window.location.search || '');
      if (!parsed?.requestId) return;

      const params = new URLSearchParams(window.location.search || '');
      params.delete('offerId');
      params.delete('offerAction');
      params.delete('offerToken');
      params.delete('offerRevision');
      const nextSearch = params.toString();
      const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}${window.location.hash || ''}`;
      window.history.replaceState(null, '', nextUrl);

      executePendingNotificationAction(parsed);
    };

    consumeSearchOfferAction();
    window.addEventListener('popstate', consumeSearchOfferAction);
    return () => window.removeEventListener('popstate', consumeSearchOfferAction);
  }, [executePendingNotificationAction, user?.uid]);

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
      return undefined;
    }

    const handleSwMessage = (event) => {
      const msg = event?.data || {};
      if (!msg || typeof msg !== 'object') return;

      if (msg.type === 'OFFER_NOTIFICATION_ACTION' && msg.requestId) {
        executePendingNotificationAction({
          requestId: String(msg.requestId || '').trim(),
          action: String(msg.action || 'view').trim().toLowerCase(),
          offerToken: String(msg.offerToken || '').trim(),
          offerRevision: Number(msg.offerRevision || 0),
        });
        return;
      }

      if (msg.type === 'OFFER_NOTIFICATION_ACCEPTED') {
        closeOfferBrowserNotification(msg.requestId);
        if (msg.busyFallbackAccepted) {
          setOfferNotice('Queued offer accepted. We sent your estimated finish and arrival times to the customer for confirmation.');
        }
        if (msg.targetPath && onNavigateRef.current) {
          onNavigateRef.current(msg.targetPath);
        }
        return;
      }

      if (msg.type === 'OFFER_NOTIFICATION_DECLINED') {
        closeOfferBrowserNotification(msg.requestId);
        return;
      }

      if (msg.type === 'OFFER_NOTIFICATION_FOCUS') {
        const path = typeof window !== 'undefined' ? window.location.pathname : '/home';
        if (!['/home', '/workspace', '/jobs', '/services', '/payments', '/profile'].includes(path)) {
          onNavigateRef.current?.('/home');
        }
        return;
      }

      if (msg.type === 'OFFER_NOTIFICATION_ERROR') {
        if (msg.errorMessage) {
          setOfferError(msg.errorMessage);
        }
      }
    };

    navigator.serviceWorker.addEventListener('message', handleSwMessage);
    return () => navigator.serviceWorker.removeEventListener('message', handleSwMessage);
  }, [executePendingNotificationAction]);

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
  latestEvaluationRef.current = evaluation;

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

  const serviceOptionMasteryMap = useMemo(
    () => new Map(
      (Array.isArray(serviceOptionMastery) ? serviceOptionMastery : []).map((item) => [
        String(item?.id || item?.masteryKey || '').trim(),
        item,
      ]),
    ),
    [serviceOptionMastery],
  );

  const serviceMasteryMap = useMemo(
    () => new Map(
      (Array.isArray(serviceMastery) ? serviceMastery : []).map((item) => [
        String(item?.id || item?.serviceId || '').trim(),
        item,
      ]),
    ),
    [serviceMastery],
  );

  const serviceOptionRatingMap = useMemo(
    () => new Map(
      (Array.isArray(serviceOptionRatings) ? serviceOptionRatings : []).map((item) => [
        String(item?.id || item?.masteryKey || '').trim(),
        item,
      ]),
    ),
    [serviceOptionRatings],
  );

  const serviceRatingMap = useMemo(
    () => new Map(
      (Array.isArray(serviceRatings) ? serviceRatings : []).map((item) => [
        String(item?.id || item?.serviceId || '').trim(),
        item,
      ]),
    ),
    [serviceRatings],
  );

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
      agreementBundle,
      activeAgreement,
      walletSnapshot,
      weeklyPayouts,
      cashConfirmations: effectiveCashConfirmations,
      refreshCashConfirmations,
      walletLoading,
      walletError,
      refreshWallet,
      serviceOptionMastery,
      serviceMastery,
      serviceOptionMasteryMap,
      serviceMasteryMap,
      serviceOptionRatingMap,
      serviceRatingMap,
      rewardAccount,
      masteryConfig,
      membershipConfig,
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
      notificationPermission,
      requestNotificationPermission,
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
      agreementBundle,
      activeAgreement,
      walletSnapshot,
      weeklyPayouts,
      effectiveCashConfirmations,
      refreshCashConfirmations,
      walletLoading,
      walletError,
      refreshWallet,
      serviceOptionMastery,
      serviceMastery,
      serviceOptionMasteryMap,
      serviceMasteryMap,
      serviceOptionRatingMap,
      serviceRatingMap,
      rewardAccount,
      masteryConfig,
      membershipConfig,
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
      notificationPermission,
      requestNotificationPermission,
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
