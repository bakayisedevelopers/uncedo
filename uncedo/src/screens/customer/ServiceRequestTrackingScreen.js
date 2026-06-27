import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Image,
  Linking,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { doc, onSnapshot } from 'firebase/firestore';
import { MapPlaceholder } from '../../components/customer/MapPlaceholder';
import { useAuth } from '../../context/AuthContext';
import { getCustomerServiceById } from '../../constants/serviceCatalog';
import { getFirebaseClients } from '../../firebase/config';
import {
  cancelServiceRequestByCustomer,
  submitServiceRequestRating,
  subscribeToServiceRequestById,
} from '../../services/customerServiceRequestService';
import {
  getCurrentCustomerLocation,
  requestCustomerLocationPermission,
  watchCustomerLocation,
} from '../../services/nearbyHelpersMapService';
import {
  subscribeToLiveTracking,
  updateLiveTracking,
} from '../../services/liveTrackingRealtimeService';
import {
  buildRouteSnapshot,
  decodePolyline,
  fetchRouteData,
  getRerouteReason,
} from '../../services/routingService';
import { logInfo } from '../../services/logger';
import { colors } from '../../theme/colors';

const FREE_WAIT_SECONDS = 120;
const TRACKING_STALE_MS = 60000;
const TRACKING_INACTIVE_MS = 300000;

function getDistanceInMeters(lat1, lon1, lat2, lon2) {
  if (
    !Number.isFinite(Number(lat1))
    || !Number.isFinite(Number(lon1))
    || !Number.isFinite(Number(lat2))
    || !Number.isFinite(Number(lon2))
  ) {
    return null;
  }

  const R = 6371e3;
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2)
    + Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

function normalizeCoordinate(coordinate = null) {
  const latitude = Number(coordinate?.latitude);
  const longitude = Number(coordinate?.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  return { latitude, longitude };
}

function formatDistance(distance) {
  if (!Number.isFinite(distance)) return 'Waiting';
  const kmValue = distance / 1000;
  const rounded = Math.round(kmValue * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded.toFixed(0)} km` : `${rounded} km`;
}

function formatEta(durationSeconds) {
  if (!Number.isFinite(durationSeconds)) return null;
  return Math.max(1, Math.round(durationSeconds / 60));
}

function formatCurrency(value) {
  const amount = Math.round(Number(value || 0));
  if (!Number.isFinite(amount) || amount <= 0) return 'R0';
  return `R${amount}`;
}

function getPricingTotal(pricingSnapshot = null) {
  return Number(
    pricingSnapshot?.total
    ?? pricingSnapshot?.totalAmount
    ?? pricingSnapshot?.finalPrice
    ?? pricingSnapshot?.finalAmount
    ?? pricingSnapshot?.finalPayablePrice
    ?? pricingSnapshot?.basePrice
    ?? 0
  ) || 0;
}

function getInitials(name = '') {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (!parts.length) return 'H';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase() || 'H';
  return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase() || 'H';
}

function getStatusMeta(status) {
  const normalized = String(status || '').toLowerCase();

  switch (normalized) {
    case 'matching':
      return {
        label: 'Searching for a helper',
        detail: 'We are searching for a helper who can take this request.',
        tone: 'info',
      };
    case 'helper_found':
      return {
        label: 'Waiting for helper to accept',
        detail: 'A helper has been found and is reviewing your request now.',
        tone: 'info',
      };
    case 'no_helper_available':
      return {
        label: 'No helpers available',
        detail: 'No helper is currently available for this request right now.',
        tone: 'warning',
      };
    case 'accepted':
      return {
        label: 'Helper accepted',
        detail: 'Your helper accepted the request and is preparing to travel.',
        tone: 'info',
      };
    case 'driving':
    case 'en_route':
      return {
        label: 'Helper is driving to you',
        detail: 'Track the helper route on the map as they travel to your location.',
        tone: 'success',
      };
    case 'buying_resources':
      return {
        label: 'Helper stopped to buy resources',
        detail: 'The helper updated the trip status while getting resources for your job.',
        tone: 'warning',
      };
    case 'arrived':
      return {
        label: 'Helper has arrived',
        detail: 'Please open for the helper. The free waiting time has started.',
        tone: 'success',
      };
    case 'work_started':
      return {
        label: 'Job in progress',
        detail: 'The helper has started the service.',
        tone: 'info',
      };
    case 'completed':
      return {
        label: 'Job completed',
        detail: 'The service is complete and billing has been finalized.',
        tone: 'success',
      };
    case 'canceled':
      return {
        label: 'Request canceled',
        detail: 'This service request has been canceled.',
        tone: 'warning',
      };
    default:
      return {
        label: 'Live job tracking',
        detail: 'We will keep updating your request here.',
        tone: 'info',
      };
  }
}

function getToneStyles(tone) {
  if (tone === 'success') {
    return {
      badgeBg: '#dcfce7',
      badgeText: '#166534',
      cardBg: 'rgba(220,252,231,0.9)',
    };
  }

  if (tone === 'warning') {
    return {
      badgeBg: '#fef3c7',
      badgeText: '#92400e',
      cardBg: 'rgba(254,243,199,0.92)',
    };
  }

  return {
    badgeBg: '#e0f2fe',
    badgeText: '#075985',
    cardBg: 'rgba(224,242,254,0.92)',
  };
}

export function ServiceRequestTrackingScreen({ route, goBack, systemInsets = {} }) {
  const { setHomeLocation } = useAuth();
  const requestId = route?.params?.requestId || '';
  const [request, setRequest] = useState(null);
  const [helperLocation, setHelperLocation] = useState(null);
  const [fallbackHelperLocation, setFallbackHelperLocation] = useState(null);
  const [routeCoordinates, setRouteCoordinates] = useState([]);
  const [routeDistanceMeters, setRouteDistanceMeters] = useState(null);
  const [routeDurationSeconds, setRouteDurationSeconds] = useState(null);
  const [routeError, setRouteError] = useState('');
  const [trackingDocument, setTrackingDocument] = useState(null);
  const [resolvedClientLocation, setResolvedClientLocation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);
  const [showSafetyModal, setShowSafetyModal] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [rating, setRating] = useState(5);
  const [ratingComment, setRatingComment] = useState('');
  const [ratingTarget, setRatingTarget] = useState(null);
  const [submittingRating, setSubmittingRating] = useState(false);
  const [nowTime, setNowTime] = useState(Date.now());
  const [trackingClockMs, setTrackingClockMs] = useState(Date.now());
  const scrollOffsetYRef = useRef(0);
  const previousStatusRef = useRef('');
  const lastPromptedRequestIdRef = useRef('');
  const customerLocationSubscriptionRef = useRef(null);
  const lastSyncedCustomerLocationRef = useRef(null);
  const localRouteSnapshotRef = useRef({
    routeCoordinates: [],
    encodedPolyline: '',
    overviewEncodedPolyline: '',
    distanceMeters: null,
    durationSeconds: null,
    routeProvider: '',
    lastRouteOrigin: null,
    lastDestination: null,
    lastSuccessfulRouteFetchAtMs: 0,
  });
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  const topInset = Math.max(0, Number(systemInsets?.top || 0));
  const bottomInset = Math.max(0, Number(systemInsets?.bottom || 0));

  const collapsedHeight = useMemo(() => Math.min(Math.max(height * 0.32, 260), 330), [height]);
  const maxExpandedHeight = useMemo(() => Math.min(Math.max(height * 0.82, 500), height - 72), [height]);
  const [sheetContentHeight, setSheetContentHeight] = useState(collapsedHeight);
  const expandedHeight = useMemo(
    () => Math.min(Math.max(sheetContentHeight + 12, collapsedHeight), maxExpandedHeight),
    [collapsedHeight, maxExpandedHeight, sheetContentHeight],
  );
  const sheetHeight = useRef(new Animated.Value(collapsedHeight)).current;
  const canScrollExpandedSheet = isExpanded && sheetContentHeight > maxExpandedHeight;

  useEffect(() => {
    Animated.spring(sheetHeight, {
      toValue: isExpanded ? expandedHeight : collapsedHeight,
      useNativeDriver: false,
      bounciness: 0,
      speed: 18,
    }).start();
  }, [collapsedHeight, expandedHeight, isExpanded, sheetHeight]);

  const panResponder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesture) => {
      const isVertical = Math.abs(gesture.dy) > Math.abs(gesture.dx) && Math.abs(gesture.dy) > 12;
      if (!isVertical || isLandscape) return false;
      if (!isExpanded || !canScrollExpandedSheet) return true;
      return gesture.dy > 0 && scrollOffsetYRef.current <= 0;
    },
    onMoveShouldSetPanResponderCapture: (_, gesture) => {
      const isVertical = Math.abs(gesture.dy) > Math.abs(gesture.dx) && Math.abs(gesture.dy) > 18;
      return isVertical && isExpanded && canScrollExpandedSheet && gesture.dy > 0 && scrollOffsetYRef.current <= 0;
    },
    onPanResponderRelease: (_, gesture) => {
      if (gesture.dy < -30) {
        setIsExpanded(true);
      } else if (gesture.dy > 30) {
        setIsExpanded(false);
      }
    },
  }), [canScrollExpandedSheet, isExpanded, isLandscape]);

  useEffect(() => {
    const interval = setInterval(() => {
      setTrackingClockMs(Date.now());
    }, 15000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!requestId) {
      setLoading(false);
      setError('Missing service request ID.');
      return () => {};
    }

    return subscribeToServiceRequestById(
      requestId,
      (item) => {
        setRequest(item);
        setLoading(false);
      },
      (nextError) => {
        setError(nextError.message || 'Unable to subscribe to this service request.');
        setLoading(false);
      },
    );
  }, [requestId]);

  useEffect(() => {
    const currentStatus = String(request?.status || '').toLowerCase();
    if (!currentStatus) return;

    const previousStatus = previousStatusRef.current;
    previousStatusRef.current = currentStatus;

    if (!previousStatus) {
      return;
    }

    if (
      !['completed', 'canceled'].includes(previousStatus)
      && currentStatus === 'completed'
      && request?.helperAssignment?.helperId
      && lastPromptedRequestIdRef.current !== String(request?.id || requestId || '')
    ) {
      lastPromptedRequestIdRef.current = String(request?.id || requestId || '');
      setRatingTarget({
        requestId: request.id || requestId,
        helperId: request.helperAssignment.helperId,
        helperName: request.helperAssignment.helperName || 'helper',
      });
      setShowRatingModal(true);
    }
  }, [request, requestId]);

  useEffect(() => {
    const currentStatus = String(request?.status || '').toLowerCase();
    if (currentStatus !== 'canceled') {
      return;
    }

    setShowCancelModal(false);
    setShowSafetyModal(false);
    setShowRatingModal(false);

    const timeout = setTimeout(() => {
      goBack('CustomerHome');
    }, 250);

    return () => clearTimeout(timeout);
  }, [goBack, request?.status]);

  useEffect(() => {
    lastPromptedRequestIdRef.current = '';
    lastSyncedCustomerLocationRef.current = null;
    customerLocationSubscriptionRef.current?.remove?.();
    customerLocationSubscriptionRef.current = null;
    setRatingTarget(null);
    setShowRatingModal(false);
    setRating(5);
    setRatingComment('');
  }, [requestId]);

  useEffect(() => {
    if (!requestId) {
      setTrackingDocument(null);
      return () => {};
    }

    let cancelled = false;
    let unsubscribe = null;

    subscribeToLiveTracking(requestId, (data) => {
      if (cancelled) return;
      setTrackingDocument(data || null);
      const nextCustomerLocation = normalizeCoordinate(data?.customerLocation || null);
      if (nextCustomerLocation) {
        setResolvedClientLocation(nextCustomerLocation);
      }
    }, (nextError) => {
      if (cancelled) return;
      console.warn('[uncedo:request-tracking]', nextError?.message || nextError);
    })
      .then((nextUnsubscribe) => {
        unsubscribe = nextUnsubscribe;
      })
      .catch((nextError) => {
        if (cancelled) return;
        console.warn('[uncedo:request-tracking]', nextError?.message || nextError);
      });

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [requestId]);

  useEffect(() => {
    const helperId = request?.helperAssignment?.helperId;
    if (!helperId || !requestId) {
      setFallbackHelperLocation(null);
      return () => {};
    }

    try {
      const { db } = getFirebaseClients();
      const unsubscribe = onSnapshot(doc(db, 'users', helperId), (snapshot) => {
        if (!snapshot.exists()) {
          setFallbackHelperLocation(null);
          return;
        }
        const data = snapshot.data() || {};
        if (
          data.liveLocation
          && data.locationSharingEnabled !== false
          && String(data.activeServiceRequestId || '').trim() === requestId
        ) {
          setFallbackHelperLocation(data.liveLocation);
          return;
        }

        setFallbackHelperLocation(null);
      });
      return unsubscribe;
    } catch (nextError) {
      console.warn('[uncedo:helper-location]', nextError?.message || nextError);
      return () => {};
    }
  }, [request?.helperAssignment?.helperId, requestId]);

  useEffect(() => {
    let cancelled = false;

    const target = String(
      request?.requestPayload?.structuredAnswers?.service_address_target
      || request?.structuredAnswers?.service_address_target
      || '',
    ).trim().toLowerCase();
    if (target !== 'current_location') {
      if (customerLocationSubscriptionRef.current?.remove) {
        customerLocationSubscriptionRef.current.remove();
        customerLocationSubscriptionRef.current = null;
      }
      return () => {
        cancelled = true;
      };
    }

    const syncCurrentLocation = async (nextLocation) => {
      const normalized = normalizeCoordinate(nextLocation);
      if (!normalized) return;
      const previous = lastSyncedCustomerLocationRef.current;
      if (
        previous
        && previous.latitude === normalized.latitude
        && previous.longitude === normalized.longitude
      ) {
        return;
      }

      lastSyncedCustomerLocationRef.current = normalized;
      setResolvedClientLocation(normalized);
      setHomeLocation(normalized);

      setRequest((current) => (
          current
            ? {
                ...current,
                location: normalized,
              requestPayload: {
                ...(current.requestPayload || {}),
                location: normalized,
              },
            }
            : current
      ));

      await updateLiveTracking(requestId, {
        requestId,
        customerLocation: normalized,
        updatedAtMs: Date.now(),
      }).catch((error) => {
        console.warn('[uncedo:current-location-sync]', error?.message || error);
      });
    };

    const startWatchingLocation = async () => {
      const explicitLocation = normalizeCoordinate(request?.location || request?.requestPayload?.location || null);
      if (explicitLocation) {
        lastSyncedCustomerLocationRef.current = explicitLocation;
        setResolvedClientLocation(explicitLocation);
        setHomeLocation(explicitLocation);
      }

      const permissionGranted = await requestCustomerLocationPermission().catch(() => false);
      if (!permissionGranted) {
        if (explicitLocation) {
          setResolvedClientLocation(explicitLocation);
        }
        return;
      }

      const initialLocation = explicitLocation
        || await getCurrentCustomerLocation().catch(() => null);
      if (!cancelled && initialLocation) {
        await syncCurrentLocation(initialLocation);
      }

      const subscription = await watchCustomerLocation((nextLocation) => {
        if (cancelled) return;
        syncCurrentLocation(nextLocation).catch(() => null);
      }).catch((error) => {
        console.warn('[uncedo:current-location-watch]', error?.message || error);
        return null;
      });

      if (subscription?.remove) {
        customerLocationSubscriptionRef.current = subscription;
      }
    };

    startWatchingLocation();

    return () => {
      cancelled = true;
      customerLocationSubscriptionRef.current?.remove?.();
      customerLocationSubscriptionRef.current = null;
    };
  }, [
    request?.requestPayload?.structuredAnswers?.service_address_target,
    request?.structuredAnswers?.service_address_target,
    requestId,
    setHomeLocation,
  ]);

  useEffect(() => {
    const target = String(
      request?.requestPayload?.structuredAnswers?.service_address_target
      || request?.structuredAnswers?.service_address_target
      || '',
    ).trim().toLowerCase();
    if (target === 'current_location') {
      return;
    }

    let cancelled = false;
    const explicitLocation = normalizeCoordinate(request?.location || request?.requestPayload?.location || null);
    if (explicitLocation) {
      setResolvedClientLocation(explicitLocation);
      return () => {
        cancelled = true;
      };
    }

    const addressText = String(
      request?.requestPayload?.serviceAddress
      || request?.serviceAddress
      || '',
    ).trim();

    if (!addressText) {
      setResolvedClientLocation(null);
      return () => {
        cancelled = true;
      };
    }

    Location.geocodeAsync(addressText)
      .then((matches) => {
        if (cancelled) return;
        setResolvedClientLocation(normalizeCoordinate(Array.isArray(matches) ? matches[0] : null));
      })
      .catch(() => {
        if (cancelled) return;
        setResolvedClientLocation(null);
      });

    return () => {
      cancelled = true;
    };
  }, [
    request?.location,
    request?.requestPayload?.location,
    request?.requestPayload?.serviceAddress,
    request?.requestPayload?.structuredAnswers?.service_address_target,
    request?.serviceAddress,
    request?.structuredAnswers?.service_address_target,
  ]);

  const trackingDocHasData = Boolean(
    trackingDocument
    && (
      (
        Number.isFinite(Number(trackingDocument?.helperLocation?.latitude))
        && Number.isFinite(Number(trackingDocument?.helperLocation?.longitude))
      )
      || trackingDocument.routePolylineEncoded
      || trackingDocument.routePolylineOverviewEncoded
      || Number.isFinite(Number(trackingDocument?.distanceMeters))
      || Number.isFinite(Number(trackingDocument?.durationSeconds))
    ),
  );
  const trackingUpdatedAtMs = Number(
    trackingDocument?.updatedAtMs
    || trackingDocument?.helperLocation?.updatedAtMs
    || 0,
  ) || 0;
  const isTrackingStale = trackingUpdatedAtMs > 0 && (trackingClockMs - trackingUpdatedAtMs) > TRACKING_STALE_MS;
  const isTrackingInactive = trackingUpdatedAtMs > 0 && (trackingClockMs - trackingUpdatedAtMs) > TRACKING_INACTIVE_MS;

  useEffect(() => {
    if (isTrackingStale) {
      logInfo('customer-tracking', 'Stale tracking data', {
        requestId,
        updatedAtMs: trackingUpdatedAtMs,
        ageMs: trackingClockMs - trackingUpdatedAtMs,
      });
    }
  }, [isTrackingStale, requestId, trackingClockMs, trackingUpdatedAtMs]);

  useEffect(() => {
    if (isTrackingInactive) {
      setHelperLocation(null);
      return;
    }

    if (
      trackingDocHasData
      && Number.isFinite(Number(trackingDocument?.helperLocation?.latitude))
      && Number.isFinite(Number(trackingDocument?.helperLocation?.longitude))
    ) {
      setHelperLocation(trackingDocument.helperLocation);
      return;
    }

    setHelperLocation(fallbackHelperLocation || null);
  }, [fallbackHelperLocation, isTrackingInactive, trackingDocHasData, trackingDocument]);

  useEffect(() => {
    let interval = null;
    if (request?.status === 'arrived') {
      interval = setInterval(() => {
        setNowTime(Date.now());
      }, 1000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [request?.status]);

  const clientLocation = resolvedClientLocation;
  const travelStatus = ['accepted', 'driving', 'en_route', 'buying_resources'].includes(String(request?.status || '').toLowerCase());

  useEffect(() => {
    const encodedPolyline = String(
      trackingDocument?.routePolylineEncoded
      || trackingDocument?.routePolylineOverviewEncoded
      || '',
    ).trim();
    const trackingDistance = Number.isFinite(Number(trackingDocument?.distanceMeters))
      ? Number(trackingDocument.distanceMeters)
      : null;
    const trackingDuration = Number.isFinite(Number(trackingDocument?.durationSeconds))
      ? Number(trackingDocument.durationSeconds)
      : null;

    const hasTrackingMetrics = Number.isFinite(trackingDistance) && Number.isFinite(trackingDuration);

    if (encodedPolyline) {
      const decodedCoordinates = decodePolyline(encodedPolyline);
      setRouteCoordinates(decodedCoordinates);
      setRouteDistanceMeters(trackingDistance);
      setRouteDurationSeconds(trackingDuration);
      setRouteError('');
      localRouteSnapshotRef.current = buildRouteSnapshot({
        routeCoordinates: decodedCoordinates,
        encodedPolyline,
        overviewEncodedPolyline: String(
          trackingDocument?.routePolylineOverviewEncoded
          || trackingDocument?.routePolylineEncoded
          || '',
        ).trim(),
        distanceMeters: trackingDistance,
        durationSeconds: trackingDuration,
        routeProvider: trackingDocument?.routeProvider || '',
      }, helperLocation, clientLocation);

      if (hasTrackingMetrics || !travelStatus || !helperLocation || !clientLocation || isTrackingInactive) {
        return;
      }
    }

    if (!travelStatus || !helperLocation || !clientLocation || isTrackingInactive) {
      setRouteCoordinates([]);
      setRouteDistanceMeters(null);
      setRouteDurationSeconds(null);
      setRouteError(isTrackingInactive ? 'Helper location is inactive.' : '');
      return;
    }

    let cancelled = false;
    const rerouteReason = getRerouteReason({
      currentLocation: helperLocation,
      destination: clientLocation,
      routeCoordinates: localRouteSnapshotRef.current.routeCoordinates,
      lastRouteOrigin: localRouteSnapshotRef.current.lastRouteOrigin,
      lastDestination: localRouteSnapshotRef.current.lastDestination,
      lastSuccessfulRouteFetchAtMs: localRouteSnapshotRef.current.lastSuccessfulRouteFetchAtMs,
    });

    if (!rerouteReason) {
      return;
    }

    logInfo('customer-tracking', 'Reroute triggered', {
      requestId,
      reason: rerouteReason,
    });

    fetchRouteData(helperLocation, clientLocation)
      .then((routeData) => {
        if (cancelled) return;
        if (routeData.routeCoordinates.length > 1) {
          setRouteCoordinates(routeData.routeCoordinates);
          setRouteDistanceMeters(routeData.distanceMeters);
          setRouteDurationSeconds(routeData.durationSeconds);
          setRouteError('');
          localRouteSnapshotRef.current = buildRouteSnapshot(routeData, helperLocation, clientLocation);
          logInfo('customer-tracking', 'Route updated locally', {
            requestId,
            routeProvider: routeData.routeProvider,
            distanceMeters: routeData.distanceMeters,
            durationSeconds: routeData.durationSeconds,
            coordinateCount: routeData.routeCoordinates.length,
          });
          return;
        }

        setRouteCoordinates([]);
        setRouteDistanceMeters(null);
        setRouteDurationSeconds(null);
        setRouteError(routeData.error || 'Route unavailable right now.');
        logInfo('customer-tracking', 'Route unavailable state', {
          requestId,
          error: routeData.error || 'Route unavailable right now.',
        });
      })
      .catch((nextError) => {
        if (cancelled) return;
        setRouteCoordinates([]);
        setRouteDistanceMeters(null);
        setRouteDurationSeconds(null);
        setRouteError(nextError?.message || 'Route unavailable right now.');
      });

    return () => {
      cancelled = true;
    };
  }, [clientLocation, helperLocation, isTrackingInactive, requestId, trackingDocument, travelStatus]);

  const distance = useMemo(
    () => (Number.isFinite(routeDistanceMeters) ? routeDistanceMeters : null),
    [routeDistanceMeters],
  );
  const etaMinutes = useMemo(() => formatEta(routeDurationSeconds), [routeDurationSeconds]);

  const waitInfo = useMemo(() => {
    const arrivedAt = request?.arrivedAt || request?.helperAssignment?.arrivedAt;
    const workStartedAt = request?.workStartedAt || request?.helperAssignment?.workStartedAt;

    if (!arrivedAt) {
      return { elapsedSeconds: 0, waitFee: 0, isGrace: true, active: false };
    }

    let arrivedAtMs = 0;
    if (typeof arrivedAt.toMillis === 'function') {
      arrivedAtMs = arrivedAt.toMillis();
    } else if (arrivedAt.seconds) {
      arrivedAtMs = arrivedAt.seconds * 1000;
    } else {
      arrivedAtMs = Date.parse(arrivedAt);
    }

    if (Number.isNaN(arrivedAtMs)) {
      return { elapsedSeconds: 0, waitFee: 0, isGrace: true, active: false };
    }

    let endMs = nowTime;
    let active = true;

    if (workStartedAt) {
      let workStartedAtMs = 0;
      if (typeof workStartedAt.toMillis === 'function') {
        workStartedAtMs = workStartedAt.toMillis();
      } else if (workStartedAt.seconds) {
        workStartedAtMs = workStartedAt.seconds * 1000;
      } else {
        workStartedAtMs = Date.parse(workStartedAt);
      }

      if (!Number.isNaN(workStartedAtMs)) {
        endMs = workStartedAtMs;
        active = false;
      }
    }

    const elapsedSeconds = Math.max(0, Math.floor((endMs - arrivedAtMs) / 1000));
    const waitMinutes = Number((elapsedSeconds / 60).toFixed(2));
    const waitFee = waitMinutes > 2 ? Math.round(waitMinutes - 2) * 1.0 : 0;

    return {
      elapsedSeconds,
      waitFee,
      isGrace: elapsedSeconds <= FREE_WAIT_SECONDS,
      active,
    };
  }, [nowTime, request]);
  const quotedTotal = useMemo(() => getPricingTotal(request?.pricingSnapshot), [request?.pricingSnapshot]);

  const statusMeta = useMemo(() => getStatusMeta(request?.status), [request?.status]);
  const toneStyles = useMemo(() => getToneStyles(statusMeta.tone), [statusMeta.tone]);
  const canCancelRequest = !['completed', 'canceled'].includes(String(request?.status || '').toLowerCase());
  const statusDetail = request?.statusDetail || statusMeta.detail;
  const serviceName = useMemo(() => {
    const serviceLabels = Array.isArray(request?.serviceIds)
      ? request.serviceIds
        .map((serviceId) => getCustomerServiceById(serviceId)?.label || '')
        .filter(Boolean)
      : [];

    if (serviceLabels.length) {
      return serviceLabels.join(', ');
    }

    return request?.subject || 'Standard service';
  }, [request?.serviceIds, request?.subject]);

  const helperMarkers = helperLocation ? [{
    id: request?.helperAssignment?.helperId || 'helper',
    coordinate: helperLocation,
    heading: helperLocation.heading,
    fullName: request?.helperAssignment?.helperName || 'Helper',
    profilePhoto: request?.helperAssignment?.helperPhoto || null,
  }] : [];

  const handleCallHelper = () => {
    const phone = request?.helperAssignment?.helperPhone;
    if (!phone) {
      Alert.alert('Phone unavailable', 'The helper has not shared a phone number for this request.');
      return;
    }

    Linking.openURL(`tel:${phone}`);
  };

  const dismissRatingModal = () => {
    setShowRatingModal(false);
    setRating(5);
    setRatingComment('');
    goBack('CustomerHome');
  };

  const handleSubmitRating = async () => {
    if (!ratingTarget?.requestId) {
      dismissRatingModal();
      return;
    }

    try {
      setSubmittingRating(true);
      await submitServiceRequestRating({
        requestId: ratingTarget.requestId,
        score: rating,
        comment: ratingComment,
      });
      dismissRatingModal();
    } catch (nextError) {
      Alert.alert('Rating failed', nextError.message || 'Unable to submit the rating right now.');
    } finally {
      setSubmittingRating(false);
    }
  };

  const handleCancelSubmit = async () => {
    if (!cancelReason.trim()) {
      Alert.alert('Reason required', 'Please provide a reason for cancellation.');
      return;
    }

    setShowCancelModal(false);

    try {
      const updatedRequest = await cancelServiceRequestByCustomer({
        requestId: request?.id || requestId,
        reason: cancelReason,
      });
      setCancelReason('');
      if (updatedRequest) {
        setRequest(updatedRequest);
      }
      goBack('CustomerHome');
    } catch (nextError) {
      Alert.alert('Error', nextError.message || 'Unable to cancel this request.');
    }
  };

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { paddingBottom: bottomInset, paddingTop: topInset }]}>
        <ActivityIndicator color={colors.brand} size="large" />
        <Text style={styles.loadingText}>Connecting to live tracking...</Text>
      </View>
    );
  }

  if (error || !request) {
    return (
      <View style={[styles.emptyContainer, { paddingBottom: bottomInset, paddingTop: topInset }]}>
        <Ionicons name="alert-circle-outline" size={64} color={colors.danger} />
        <Text style={styles.emptyTitle}>Unable to load tracking</Text>
        <Text style={styles.emptyCopy}>{error || 'The requested service could not be found.'}</Text>
        <Pressable style={styles.primaryAction} onPress={() => goBack('CustomerHome')}>
          <Text style={styles.primaryActionText}>Back to dashboard</Text>
        </Pressable>
      </View>
    );
  }

  const renderWaitCard = () => {
    if (!['arrived', 'work_started'].includes(String(request.status || '').toLowerCase())) return null;

    if (waitInfo.isGrace) {
      const remainingSeconds = Math.max(0, FREE_WAIT_SECONDS - waitInfo.elapsedSeconds);
      const remMins = Math.floor(remainingSeconds / 60);
      const remSecs = remainingSeconds % 60;

      return (
        <View style={[styles.infoBanner, styles.graceBanner]}>
          <Ionicons name="time-outline" size={18} color="#1e40af" />
          <View style={styles.infoBannerBody}>
            <Text style={styles.infoBannerTitle}>Helper arrived</Text>
            <Text style={styles.infoBannerText}>{`${remMins}m ${remSecs}s of free waiting time remaining`}</Text>
          </View>
        </View>
      );
    }

    return (
      <View style={[styles.infoBanner, styles.feeBanner]}>
        <Ionicons name="alert-circle-outline" size={18} color="#991b1b" />
        <View style={styles.infoBannerBody}>
          <Text style={styles.infoBannerTitleDanger}>Wait fee accruing</Text>
          <Text style={styles.infoBannerTextDanger}>{`Current wait fee: ${formatCurrency(waitInfo.waitFee)}`}</Text>
        </View>
      </View>
    );
  };

  const renderCancelAction = () => {
    if (!canCancelRequest) return null;

    return (
      <View style={styles.inlineFooterActions}>
        <Pressable style={styles.textDangerAction} onPress={() => setShowCancelModal(true)}>
          <Text style={styles.textDangerActionLabel}>Cancel request</Text>
        </Pressable>
      </View>
    );
  };

  const renderContent = ({ expanded = false }) => (
    <>
      <View style={styles.sheetHandleWrap} {...(!isLandscape ? panResponder.panHandlers : {})}>
        <Pressable style={styles.sheetHandleButton} onPress={() => setIsExpanded((current) => !current)}>
          <View style={styles.sheetHandle} />
        </Pressable>
      </View>

      <View style={styles.metricsRow}>
        <View style={[styles.metricChip, { backgroundColor: toneStyles.badgeBg, borderColor: toneStyles.badgeBg }]}>
          <Text style={[styles.metricValue, { color: toneStyles.badgeText }]}>{formatDistance(distance)}</Text>
        </View>
        <View style={[styles.metricChip, { backgroundColor: toneStyles.badgeBg, borderColor: toneStyles.badgeBg }]}>
          <Text style={[styles.metricValue, { color: toneStyles.badgeText }]}>
            {etaMinutes && ['accepted', 'driving', 'en_route', 'buying_resources'].includes(String(request.status || '').toLowerCase())
              ? `${etaMinutes} min`
              : 'Waiting'}
          </Text>
        </View>
        <View style={[styles.metricChip, { backgroundColor: toneStyles.badgeBg, borderColor: toneStyles.badgeBg }]}>
          <Text style={[styles.statusBadgeText, { color: toneStyles.badgeText }]}>{statusMeta.label}</Text>
        </View>
      </View>
      <Text style={styles.sheetSubtitle} numberOfLines={expanded ? 3 : 2}>
        {statusDetail}
      </Text>

      {request.helperAssignment ? (
        <View style={styles.personCard}>
          <View style={styles.avatarWrap}>
            {request.helperAssignment.helperPhoto ? (
              <Image source={{ uri: request.helperAssignment.helperPhoto }} style={styles.avatarImage} />
            ) : (
              <View style={styles.avatarFallback}>
                <Text style={styles.avatarInitials}>{getInitials(request.helperAssignment.helperName)}</Text>
              </View>
            )}
          </View>
          <View style={styles.personMeta}>
            <Text style={styles.personLabel}>Assigned helper</Text>
            <Text style={styles.personName}>{request.helperAssignment.helperName || 'Helper'}</Text>
          </View>
          <Pressable style={styles.iconAction} onPress={handleCallHelper}>
            <Ionicons name="call-outline" size={18} color={colors.brandDark} />
          </Pressable>
        </View>
      ) : (
        <View style={styles.waitingCard}>
          <ActivityIndicator color={colors.brand} />
          <Text style={styles.waitingCardText}>
            {String(request?.status || '').toLowerCase() === 'matching'
              ? 'Searching for a helper.'
              : String(request?.status || '').toLowerCase() === 'no_helper_available'
                ? 'No helper is currently available.'
                : 'Waiting for a helper to accept the request.'}
          </Text>
        </View>
      )}

      {renderWaitCard()}

      {expanded ? (
        <>
          <View style={styles.divider} />

          <Text style={styles.sectionTitle}>Job details</Text>
          <View style={styles.metaCard}>
            <Text style={styles.metaLabel}>Service type</Text>
            <Text style={styles.metaValue}>{serviceName}</Text>
          </View>

          <View style={styles.metaCard}>
            <Text style={styles.metaLabel}>Price summary</Text>
            <View style={styles.pricingRow}>
              <Text style={styles.pricingLabel}>Base quote</Text>
              <Text style={styles.pricingValue}>{formatCurrency(quotedTotal)}</Text>
            </View>
            {waitInfo.waitFee > 0 ? (
              <View style={styles.pricingRow}>
                <Text style={styles.pricingLabel}>Wait fee</Text>
                <Text style={styles.pricingValue}>{formatCurrency(waitInfo.waitFee)}</Text>
              </View>
            ) : null}
            <View style={[styles.pricingRow, styles.pricingTotalRow]}>
              <Text style={styles.pricingTotalLabel}>Estimated total</Text>
              <Text style={styles.pricingTotalValue}>
                {formatCurrency(quotedTotal + (waitInfo.waitFee || 0))}
              </Text>
            </View>
          </View>

        </>
      ) : null}

      {renderCancelAction()}
    </>
  );

  return (
    <View style={styles.container}>
      <View style={styles.mapLayer}>
        <MapPlaceholder
          mode="route"
          currentUserMarker={clientLocation ? {
            latitude: clientLocation.latitude,
            longitude: clientLocation.longitude,
            initials: 'You',
          } : null}
          helperMarkers={helperMarkers}
          routeCoordinates={routeCoordinates}
          routeError={routeError || (isTrackingStale ? 'Tracking data is delayed.' : '')}
          floatingBottomInset={isLandscape ? 24 : collapsedHeight + bottomInset}
          controlBottomInset={isLandscape ? 24 : collapsedHeight + bottomInset + 24}
        />

        <Pressable
          accessibilityRole="button"
          style={[styles.topBackButton, { top: topInset + 16 }]}
          onPress={() => goBack('CustomerHome')}
        >
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </Pressable>

        <Pressable
          accessibilityRole="button"
          style={[styles.topSafetyButton, { top: topInset + 16 }]}
          onPress={() => setShowSafetyModal(true)}
        >
          <Ionicons name="shield-checkmark" size={24} color={colors.brand} />
        </Pressable>
      </View>

      {isLandscape ? (
        <View style={[styles.sidePanel, { paddingBottom: bottomInset + 34, paddingTop: topInset + 40 }]}>
          <ScrollView showsVerticalScrollIndicator={false}>
            {renderContent({ expanded: true })}
          </ScrollView>
        </View>
      ) : (
        <Animated.View style={[styles.sheet, { bottom: bottomInset, height: sheetHeight }]} {...panResponder.panHandlers}>
          <ScrollView
            showsVerticalScrollIndicator={canScrollExpandedSheet}
            scrollEnabled={canScrollExpandedSheet}
            contentContainerStyle={[styles.sheetScrollContent, { paddingBottom: bottomInset + 34 }]}
            onScroll={({ nativeEvent }) => {
              scrollOffsetYRef.current = nativeEvent.contentOffset?.y || 0;
            }}
            scrollEventThrottle={16}
          >
            <View
              onLayout={({ nativeEvent }) => {
                const measuredHeight = Math.ceil(nativeEvent.layout.height);
                if (measuredHeight > 0 && measuredHeight !== sheetContentHeight) {
                  setSheetContentHeight(measuredHeight);
                }
              }}
            >
              {renderContent({ expanded: isExpanded })}
            </View>
          </ScrollView>
        </Animated.View>
      )}

      <Modal visible={showSafetyModal} transparent animationType="fade">
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Safety guidelines</Text>
            <Text style={styles.modalText}>Verify the helper identity before opening and report unusual behavior immediately.</Text>
            <Text style={styles.modalText}>This screen will keep updating the helper trip as they travel to your chosen location.</Text>
            <Pressable style={styles.primaryAction} onPress={() => setShowSafetyModal(false)}>
              <Text style={styles.primaryActionText}>Got it</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal visible={showCancelModal} transparent animationType="fade">
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Cancel service request</Text>
            <Text style={styles.modalText}>Please explain why you need to cancel this request.</Text>
            <TextInput
              style={styles.reasonInput}
              placeholder="Cancellation reason"
              placeholderTextColor={colors.muted}
              value={cancelReason}
              onChangeText={setCancelReason}
              multiline
            />
            <View style={styles.modalButtonRow}>
              <Pressable
                style={styles.secondaryAction}
                onPress={() => {
                  setShowCancelModal(false);
                  setCancelReason('');
                }}
              >
                <Text style={styles.secondaryActionText}>Keep request</Text>
              </Pressable>
              <Pressable style={[styles.primaryAction, styles.dangerAction]} onPress={handleCancelSubmit}>
                <Text style={styles.primaryActionText}>Confirm cancel</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={showRatingModal} animationType="fade">
        <View style={styles.ratingOverlay}>
          <Pressable accessibilityRole="button" onPress={dismissRatingModal} style={styles.ratingCloseButton}>
            <Ionicons color={colors.text} name="close" size={26} />
          </Pressable>
          <View style={styles.ratingCard}>
            <Text style={styles.ratingTitle}>Rate {ratingTarget?.helperName || 'helper'}</Text>
            <Text style={styles.ratingCopy}>Leave quick feedback about this service.</Text>
            <View style={styles.starRow}>
              {[1, 2, 3, 4, 5].map((star) => (
                <Pressable key={star} onPress={() => setRating(star)}>
                  <Ionicons name={star <= rating ? 'star' : 'star-outline'} size={34} color="#eab308" />
                </Pressable>
              ))}
            </View>
            <TextInput
              style={styles.reasonInput}
              placeholder="Feedback (optional)"
              placeholderTextColor={colors.muted}
              value={ratingComment}
              onChangeText={setRatingComment}
              multiline
            />
            <View style={styles.modalButtonRow}>
              <Pressable style={styles.secondaryAction} onPress={dismissRatingModal}>
                <Text style={styles.secondaryActionText}>Skip</Text>
              </Pressable>
              <Pressable style={styles.primaryAction} onPress={handleSubmitRating} disabled={submittingRating}>
                {submittingRating ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text style={styles.primaryActionText}>Done</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  mapLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  topBackButton: {
    position: 'absolute',
    top: 50,
    left: 16,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.18,
    shadowRadius: 6,
    elevation: 5,
    zIndex: 10,
  },
  topSafetyButton: {
    position: 'absolute',
    top: 50,
    right: 16,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.18,
    shadowRadius: 6,
    elevation: 5,
    zIndex: 10,
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255,255,255,0.98)',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 10,
  },
  sheetScrollContent: {
    paddingHorizontal: 20,
  },
  sidePanel: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: 380,
    backgroundColor: 'rgba(255,255,255,0.98)',
    borderLeftWidth: 1,
    borderLeftColor: colors.border,
    paddingHorizontal: 20,
  },
  sheetHandleWrap: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 12,
  },
  sheetHandleButton: {
    width: '100%',
    alignItems: 'center',
    paddingVertical: 4,
  },
  sheetHandle: {
    width: 42,
    height: 5,
    borderRadius: 999,
    backgroundColor: '#cbd5e1',
  },
  metricsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
  },
  metricChip: {
    alignSelf: 'flex-start',
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  metricValue: {
    fontSize: 11,
    fontWeight: '800',
    textAlign: 'center',
  },
  sheetSubtitle: {
    marginTop: 12,
    fontSize: 13,
    lineHeight: 19,
    color: colors.muted,
  },
  statusBadge: {
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '800',
  },
  summaryCard: {
    marginTop: 16,
    borderRadius: 20,
    padding: 16,
  },
  summaryTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  summaryMeta: {
    flex: 1,
  },
  serviceName: {
    fontSize: 17,
    fontWeight: '900',
    color: colors.text,
  },
  summaryCaption: {
    marginTop: 4,
    fontSize: 12,
    color: colors.muted,
  },
  priceText: {
    fontSize: 20,
    fontWeight: '900',
    color: colors.text,
  },
  summaryBottomRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
    marginTop: 12,
  },
  summaryPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.72)',
    color: colors.text,
    fontSize: 12,
    fontWeight: '700',
  },
  personCard: {
    marginTop: 16,
    backgroundColor: '#f8fafc',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatarWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarFallback: {
    flex: 1,
    backgroundColor: colors.brandSoft,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarInitials: {
    fontSize: 18,
    fontWeight: '900',
    color: colors.brandDark,
  },
  personMeta: {
    flex: 1,
  },
  personLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.muted,
    textTransform: 'uppercase',
  },
  personName: {
    marginTop: 4,
    fontSize: 16,
    fontWeight: '800',
    color: colors.text,
  },
  iconAction: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.brandSoft,
    justifyContent: 'center',
    alignItems: 'center',
  },
  waitingCard: {
    marginTop: 16,
    backgroundColor: '#f8fafc',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  waitingCardText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: 18,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: colors.text,
    marginBottom: 10,
  },
  metaCard: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 10,
  },
  metaLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.muted,
    textTransform: 'uppercase',
  },
  metaValue: {
    marginTop: 6,
    fontSize: 14,
    lineHeight: 20,
    color: colors.text,
    fontWeight: '600',
  },
  inlineFooterActions: {
    marginTop: 12,
    alignItems: 'flex-end',
  },
  pricingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    gap: 12,
  },
  pricingLabel: {
    fontSize: 13,
    color: colors.muted,
  },
  pricingValue: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
  },
  pricingTotalRow: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 8,
    marginTop: 12,
  },
  pricingTotalLabel: {
    fontSize: 14,
    fontWeight: '900',
    color: colors.text,
  },
  pricingTotalValue: {
    fontSize: 14,
    fontWeight: '900',
    color: colors.brandDark,
  },
  footerActions: {
    marginTop: 12,
    alignItems: 'flex-end',
  },
  textDangerAction: {
    paddingVertical: 8,
  },
  textDangerActionLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.danger,
  },
  infoBanner: {
    marginTop: 14,
    borderRadius: 16,
    borderWidth: 1,
    padding: 12,
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
  },
  infoBannerBody: {
    flex: 1,
  },
  infoBannerTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1e40af',
  },
  infoBannerText: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 18,
    color: '#2563eb',
  },
  infoBannerTitleDanger: {
    fontSize: 13,
    fontWeight: '800',
    color: '#991b1b',
  },
  infoBannerTextDanger: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 18,
    color: '#b91c1c',
  },
  graceBanner: {
    backgroundColor: '#eff6ff',
    borderColor: '#bfdbfe',
  },
  feeBanner: {
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca',
  },
  primaryAction: {
    minHeight: 50,
    borderRadius: 16,
    backgroundColor: colors.brand,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 16,
  },
  primaryActionText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800',
  },
  secondaryAction: {
    minHeight: 50,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#ffffff',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 16,
    flex: 1,
  },
  secondaryActionText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '800',
  },
  ratingOverlay: {
    flex: 1,
    backgroundColor: '#ffffff',
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 28,
  },
  ratingCloseButton: {
    alignSelf: 'flex-end',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderRadius: 999,
    height: 42,
    justifyContent: 'center',
    marginBottom: 16,
    width: 42,
  },
  ratingCard: {
    flex: 1,
    justifyContent: 'center',
    gap: 16,
  },
  ratingTitle: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '900',
    textAlign: 'center',
  },
  ratingCopy: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  modalBg: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalCard: {
    width: '100%',
    backgroundColor: '#ffffff',
    borderRadius: 22,
    padding: 24,
    gap: 14,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'center',
  },
  modalText: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.muted,
    textAlign: 'center',
  },
  reasonInput: {
    width: '100%',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 12,
    minHeight: 92,
    textAlignVertical: 'top',
    fontSize: 14,
    color: colors.text,
  },
  modalButtonRow: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  starRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
  },
  dangerAction: {
    backgroundColor: colors.danger,
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#ffffff',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: colors.muted,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#ffffff',
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: colors.text,
    marginTop: 16,
  },
  emptyCopy: {
    fontSize: 14,
    color: colors.muted,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 24,
  },
});
