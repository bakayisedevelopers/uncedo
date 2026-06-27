import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Clipboard,
  Image,
  Linking,
  Modal,
  PanResponder,
  Platform,
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
import * as ImagePicker from 'expo-image-picker';
import { doc, onSnapshot } from 'firebase/firestore';
import { HelperMapPlaceholder } from '../../components/app/HelperMapPlaceholder';
import { useAuth } from '../../context/AuthContext';
import { useHelpersApp } from '../../context/HelpersAppContext';
import { getServiceById } from '../../constants/serviceCatalog';
import { getFirebaseClients } from '../../firebase/config';
import {
  isTrackableActiveJobStatus,
  processForegroundActiveTrackingLocation,
  startActiveJobTracking,
  stopActiveJobTracking,
  syncActiveTrackingSession,
} from '../../services/activeJobTrackingService';
import { watchHelperLocation } from '../../services/helperLocationService';
import { decodePolyline } from '../../services/routingService';
import { colors } from '../../theme/colors';
import { formatCurrency } from '../../utils/payouts';

const ARRIVAL_THRESHOLD_METERS = 50;
const FREE_WAIT_SECONDS = 120;

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
  if (!Number.isFinite(distance)) return 'Distance unavailable';
  if (distance < 1000) return `${Math.round(distance)} m away`;
  return `${(distance / 1000).toFixed(1)} km away`;
}

function formatEta(durationSeconds) {
  if (!Number.isFinite(durationSeconds)) return null;
  return Math.max(1, Math.round(durationSeconds / 60));
}

function getInitials(name = '') {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (!parts.length) return 'C';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase() || 'C';
  return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase() || 'C';
}

function getStatusMeta(status) {
  const normalized = String(status || '').toLowerCase();

  switch (normalized) {
    case 'accepted':
      return {
        label: 'Preparing to travel',
        detail: 'Accepted. Get ready, then start driving when you are leaving.',
        tone: 'info',
      };
    case 'driving':
    case 'en_route':
      return {
        label: 'Driving',
        detail: 'Travel to the customer destination and follow the route on the map.',
        tone: 'success',
      };
    case 'buying_resources':
      return {
        label: 'Buying resources',
        detail: 'The customer is being updated that you stopped to buy resources.',
        tone: 'warning',
      };
    case 'arrived':
      return {
        label: 'Arrived',
        detail: 'You are within the destination zone. Wait for the customer, then start the job.',
        tone: 'success',
      };
    case 'work_started':
      return {
        label: 'Job in progress',
        detail: 'The service has started. Complete the job when the work is done.',
        tone: 'info',
      };
    case 'completed':
      return {
        label: 'Completed',
        detail: 'This job has been completed.',
        tone: 'success',
      };
    default:
      return {
        label: 'Active job',
        detail: 'Live job updates will appear here.',
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
      cardBg: 'rgba(254,243,199,0.9)',
    };
  }

  return {
    badgeBg: '#e0f2fe',
    badgeText: '#075985',
    cardBg: 'rgba(224,242,254,0.92)',
  };
}

export function ActiveJobScreen({ goBack, systemInsets = {} }) {
  const { user } = useAuth();
  const { activeJob, actions, profile, saving, saveError } = useHelpersApp();
  const [currentLocation, setCurrentLocation] = useState(null);
  const [resolvedCustomerLocation, setResolvedCustomerLocation] = useState(null);
  const [routeCoordinates, setRouteCoordinates] = useState([]);
  const [routeDistanceMeters, setRouteDistanceMeters] = useState(null);
  const [routeDurationSeconds, setRouteDurationSeconds] = useState(null);
  const [routeError, setRouteError] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showSafetyModal, setShowSafetyModal] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [showArrivalConfirmModal, setShowArrivalConfirmModal] = useState(false);
  const [showPhotoModal, setShowPhotoModal] = useState(false);
  const [completionPhoto, setCompletionPhoto] = useState(null);
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [rating, setRating] = useState(5);
  const [ratingComment, setRatingComment] = useState('');
  const [ratingTarget, setRatingTarget] = useState(null);
  const [nowTime, setNowTime] = useState(Date.now());
  const locationSubscriptionRef = useRef(null);
  const activeTrackingRequestIdRef = useRef('');
  const latestTrackedStatusRef = useRef('');
  const keepLocationSharingEnabledRef = useRef(false);
  const scrollOffsetYRef = useRef(0);
  const activeJobCoordinate = useMemo(
    () => normalizeCoordinate(activeJob?.location),
    [activeJob?.location],
  );
  const activeJobDestination = activeJobCoordinate || resolvedCustomerLocation || null;
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  const topInset = Math.max(0, Number(systemInsets?.top || 0));
  const bottomInset = Math.max(0, Number(systemInsets?.bottom || 0));

  const collapsedHeight = useMemo(() => Math.min(Math.max(height * 0.34, 280), 340), [height]);
  const maxExpandedHeight = useMemo(() => Math.min(Math.max(height * 0.84, 520), height - 72), [height]);
  const [sheetContentHeight, setSheetContentHeight] = useState(collapsedHeight);
  const expandedHeight = useMemo(
    () => Math.min(Math.max(sheetContentHeight + 12, collapsedHeight), maxExpandedHeight),
    [collapsedHeight, maxExpandedHeight, sheetContentHeight],
  );
  const sheetHeight = useRef(new Animated.Value(collapsedHeight)).current;
  const canScrollExpandedSheet = isExpanded && sheetContentHeight > maxExpandedHeight;

  useEffect(() => {
    latestTrackedStatusRef.current = activeJob?.status || '';
  }, [activeJob?.status]);

  useEffect(() => {
    keepLocationSharingEnabledRef.current = profile?.onlineStatus === 'online';
  }, [profile?.onlineStatus]);

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
    let active = true;

    if (!activeJob?.requestId) {
      return () => {
        active = false;
      };
    }

    const startWatchingLocation = async () => {
      try {
        locationSubscriptionRef.current = await watchHelperLocation(async (location) => {
          if (active) {
            setCurrentLocation(location);
          }

          try {
            const trackingUpdate = await processForegroundActiveTrackingLocation(location);
            const nextRouteCoordinates = trackingUpdate?.routeSnapshot?.routeCoordinates || [];
            if (active && nextRouteCoordinates.length > 1) {
              setRouteCoordinates(nextRouteCoordinates);
              setRouteDistanceMeters(Number.isFinite(Number(trackingUpdate?.routeSnapshot?.distanceMeters)) ? Number(trackingUpdate.routeSnapshot.distanceMeters) : null);
              setRouteDurationSeconds(Number.isFinite(Number(trackingUpdate?.routeSnapshot?.durationSeconds)) ? Number(trackingUpdate.routeSnapshot.durationSeconds) : null);
              setRouteError('');
            } else if (active && activeJobDestination) {
              setRouteCoordinates([]);
              setRouteDistanceMeters(null);
              setRouteDurationSeconds(null);
              setRouteError('Route unavailable right now.');
            }
          } catch (error) {
            if (active && activeJobDestination) {
              setRouteCoordinates([]);
              setRouteDistanceMeters(null);
              setRouteDurationSeconds(null);
              setRouteError(error?.message || 'Route unavailable right now.');
            }
          }
        });
      } catch (error) {
        console.warn('[helpers:active-job-location]', error?.message || error);
      }
    };

    startWatchingLocation();

    return () => {
      active = false;
      locationSubscriptionRef.current?.remove?.();
      locationSubscriptionRef.current = null;
    };
  }, [activeJob?.requestId, activeJobDestination]);

  useEffect(() => {
    let cancelled = false;

    const syncActiveTracking = async () => {
      if (!user?.uid) {
        if (activeTrackingRequestIdRef.current) {
          activeTrackingRequestIdRef.current = '';
          await stopActiveJobTracking({
            finalStatus: 'signed_out',
            keepLocationSharingEnabled: keepLocationSharingEnabledRef.current,
          }).catch((error) => console.warn('[helpers:active-job-stop]', error?.message || error));
        }
        return;
      }

      if (
        !activeJob?.requestId
        || !activeJobDestination
        || !isTrackableActiveJobStatus(activeJob.status)
      ) {
        if (activeTrackingRequestIdRef.current) {
          activeTrackingRequestIdRef.current = '';
          await stopActiveJobTracking({
            finalStatus: activeJob?.status || 'inactive',
            keepLocationSharingEnabled: keepLocationSharingEnabledRef.current,
          }).catch((error) => console.warn('[helpers:active-job-stop]', error?.message || error));
        }
        return;
      }

      const destination = {
        latitude: activeJobDestination.latitude,
        longitude: activeJobDestination.longitude,
        address: activeJob.address || '',
      };

      if (activeTrackingRequestIdRef.current !== activeJob.requestId) {
        if (activeTrackingRequestIdRef.current) {
          await stopActiveJobTracking({
            finalStatus: latestTrackedStatusRef.current || 'switched_job',
            keepLocationSharingEnabled: keepLocationSharingEnabledRef.current,
          }).catch((error) => console.warn('[helpers:active-job-switch-stop]', error?.message || error));
        }

        await startActiveJobTracking({
          requestId: activeJob.requestId,
          helperId: user.uid,
          customerId: activeJob.customerId || '',
          destination,
          status: activeJob.status,
        }).catch((error) => {
          if (!cancelled) {
            console.warn('[helpers:active-job-start]', error?.message || error);
            setRouteError(error?.message || 'Unable to start active job tracking.');
          }
        });

        if (!cancelled) {
          activeTrackingRequestIdRef.current = activeJob.requestId;
        }
        return;
      }

      await syncActiveTrackingSession({
        requestId: activeJob.requestId,
        helperId: user.uid,
        customerId: activeJob.customerId || '',
        destination,
        status: activeJob.status,
      }).catch((error) => console.warn('[helpers:active-job-sync]', error?.message || error));
    };

    syncActiveTracking();

    return () => {
      cancelled = true;
    };
  }, [
    activeJob?.address,
    activeJob?.customerId,
    activeJob?.requestId,
    activeJob?.status,
    activeJobDestination,
    user?.uid,
  ]);

  useEffect(() => {
    let interval = null;
    if (activeJob?.status === 'arrived') {
      interval = setInterval(() => {
        setNowTime(Date.now());
      }, 1000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [activeJob?.status]);

  useEffect(() => {
    if (activeJob) {
      setRatingTarget({
        id: activeJob.id,
        customerName: activeJob.customerName,
      });
    }
  }, [activeJob]);

  useEffect(() => {
    let cancelled = false;

    if (activeJobCoordinate) {
      setResolvedCustomerLocation(null);
      return () => {
        cancelled = true;
      };
    }

    const addressText = String(activeJob?.address || activeJob?.raw?.requestPayload?.serviceAddress || '').trim();
    if (!addressText) {
      setResolvedCustomerLocation(null);
      return () => {
        cancelled = true;
      };
    }

    Location.geocodeAsync(addressText)
      .then((matches) => {
        if (cancelled) return;
        const [firstMatch] = Array.isArray(matches) ? matches : [];
        setResolvedCustomerLocation(normalizeCoordinate(firstMatch));
      })
      .catch(() => {
        if (cancelled) return;
        setResolvedCustomerLocation(null);
      });

    return () => {
      cancelled = true;
    };
  }, [activeJob?.address, activeJob?.raw?.requestPayload?.serviceAddress, activeJobCoordinate]);

  useEffect(() => {
    if (!activeJob?.id) {
      setRouteCoordinates([]);
      setRouteDistanceMeters(null);
      setRouteDurationSeconds(null);
      setRouteError('');
      return () => {};
    }

    setRouteCoordinates([]);
    setRouteDistanceMeters(null);
    setRouteDurationSeconds(null);
    setRouteError('');

    try {
      const { db } = getFirebaseClients();
      return onSnapshot(doc(db, 'serviceRequests', activeJob.id, 'tracking', 'live'), (snapshot) => {
        if (!snapshot.exists()) {
          return;
        }

        const data = snapshot.data() || {};
        const encodedPolyline = String(
          data.routePolylineEncoded
          || data.routePolylineOverviewEncoded
          || ''
        ).trim();
        const nextRouteCoordinates = encodedPolyline ? decodePolyline(encodedPolyline) : [];
        const nextDistance = Number.isFinite(Number(data.distanceMeters)) ? Number(data.distanceMeters) : null;
        const nextDuration = Number.isFinite(Number(data.durationSeconds)) ? Number(data.durationSeconds) : null;
        const nextHelperLocation = data.helperLocation || null;

        if (nextHelperLocation?.latitude && nextHelperLocation?.longitude) {
          setCurrentLocation(nextHelperLocation);
        }

        setRouteCoordinates(nextRouteCoordinates);
        setRouteDistanceMeters(nextDistance);
        setRouteDurationSeconds(nextDuration);
        if (!nextRouteCoordinates.length && nextHelperLocation?.latitude && nextHelperLocation?.longitude && activeJobDestination) {
          setRouteError('Route unavailable right now.');
        } else {
          setRouteError('');
        }
      });
    } catch (error) {
      console.warn('[helpers:active-job-tracking]', error?.message || error);
      return () => {};
    }
  }, [activeJob?.id, activeJobDestination]);

  const arrivalDistance = useMemo(() => {
    if (!currentLocation || !activeJobDestination) return null;
    return getDistanceInMeters(
      currentLocation.latitude,
      currentLocation.longitude,
      activeJobDestination.latitude,
      activeJobDestination.longitude,
    );
  }, [activeJobDestination, currentLocation]);

  useEffect(() => {
    if (
      activeJob
      && ['driving', 'en_route', 'buying_resources'].includes(String(activeJob.status || '').toLowerCase())
      && Number.isFinite(arrivalDistance)
      && arrivalDistance <= ARRIVAL_THRESHOLD_METERS
    ) {
      actions.updateActiveJobStatus('arrived');
    }
  }, [actions, activeJob, arrivalDistance]);

  const waitInfo = useMemo(() => {
    if (activeJob?.status !== 'arrived' || !activeJob?.raw?.arrivedAt) {
      return { elapsedSeconds: 0, waitMinutes: 0, waitFee: 0, isGrace: true };
    }

    let arrivedAtMs = 0;
    if (typeof activeJob.raw.arrivedAt.toMillis === 'function') {
      arrivedAtMs = activeJob.raw.arrivedAt.toMillis();
    } else if (activeJob.raw.arrivedAt.seconds) {
      arrivedAtMs = activeJob.raw.arrivedAt.seconds * 1000;
    } else {
      arrivedAtMs = Date.parse(activeJob.raw.arrivedAt);
    }

    if (Number.isNaN(arrivedAtMs)) {
      return { elapsedSeconds: 0, waitMinutes: 0, waitFee: 0, isGrace: true };
    }

    const elapsedSeconds = Math.max(0, Math.floor((nowTime - arrivedAtMs) / 1000));
    const isGrace = elapsedSeconds <= FREE_WAIT_SECONDS;
    const waitMinutes = Number((elapsedSeconds / 60).toFixed(2));
    const waitFee = waitMinutes > 2 ? Math.round(waitMinutes - 2) * 1.0 : 0;

    return {
      elapsedSeconds,
      waitMinutes,
      waitFee,
      isGrace,
    };
  }, [activeJob, nowTime]);

  const distance = useMemo(
    () => (Number.isFinite(routeDistanceMeters) ? routeDistanceMeters : null),
    [routeDistanceMeters],
  );
  const etaMinutes = useMemo(() => formatEta(routeDurationSeconds), [routeDurationSeconds]);
  const statusMeta = useMemo(() => getStatusMeta(activeJob?.status), [activeJob?.status]);
  const toneStyles = useMemo(() => getToneStyles(statusMeta.tone), [statusMeta.tone]);
  const canCancelJob = String(activeJob?.status || '').toLowerCase() !== 'completed';
  const serviceName = useMemo(
    () => getServiceById(activeJob?.serviceId)?.name || 'Service request',
    [activeJob?.serviceId],
  );
  const statusDetail = activeJob?.statusDetail || statusMeta.detail;

  const customerMarkers = activeJobDestination
    ? [{
        id: activeJob.id,
        coordinate: activeJobDestination,
        initials: activeJob.customerName || 'Customer',
        profilePhoto: activeJob.customerPhoto || null,
      }]
    : [];

  const handleCopyAddress = () => {
    if (!activeJob?.address) return;
    Clipboard.setString(activeJob.address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleOpenNavigation = () => {
    if (!activeJobDestination) return;
    const { latitude, longitude } = activeJobDestination;
    const label = encodeURIComponent(activeJob.customerName || 'Customer');
    const url = Platform.select({
      ios: `maps:0,0?q=${label}@${latitude},${longitude}`,
      android: `geo:0,0?q=${latitude},${longitude}(${label})`,
      default: `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`,
    });

    Linking.canOpenURL(url).then((supported) => {
      if (supported) {
        Linking.openURL(url);
      } else {
        Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`);
      }
    });
  };

  const handleCallCustomer = () => {
    if (!activeJob?.customerPhone) {
      Alert.alert('Phone unavailable', 'The customer phone number is not available for this job.');
      return;
    }

    Linking.openURL(`tel:${activeJob.customerPhone}`);
  };

  const handleStatusChange = async (nextStatus) => {
    const success = await actions.updateActiveJobStatus(nextStatus);
    if (!success) {
      Alert.alert('Update failed', 'Unable to update the job status right now.');
    }
  };

  const handleManualArrival = () => {
    if (Number.isFinite(distance) && distance > ARRIVAL_THRESHOLD_METERS) {
      setShowArrivalConfirmModal(true);
    } else {
      handleStatusChange('arrived');
    }
  };

  const handleCancelSubmit = async () => {
    if (!cancelReason.trim()) {
      Alert.alert('Reason required', 'Please explain why you need to cancel this job.');
      return;
    }

    const success = await actions.cancelActiveJob(cancelReason);
    if (success) {
      setShowCancelModal(false);
      goBack('Home');
      return;
    }

    Alert.alert('Cancel failed', 'Unable to cancel this job right now.');
  };

  const handlePickPhoto = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission denied', 'Storage permission is required to select photos.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    });

    if (!result.canceled && result.assets?.[0]?.uri) {
      setCompletionPhoto(result.assets[0].uri);
    }
  };

  const handleTakePhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission denied', 'Camera permission is required to take photos.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      quality: 0.8,
    });

    if (!result.canceled && result.assets?.[0]?.uri) {
      setCompletionPhoto(result.assets[0].uri);
    }
  };

  const handleFinalizeJob = async () => {
    if (!completionPhoto) {
      Alert.alert('Photo proof required', 'Please provide a completion photo of the work.');
      return;
    }

    try {
      const success = await actions.completeActiveJobWithBilling();
      if (!success) {
        Alert.alert('Billing failed', 'Unable to finalize this job right now.');
        return;
      }

      setShowPhotoModal(false);
      setShowRatingModal(true);
    } catch (error) {
      Alert.alert('Error', error.message || 'Billing failed.');
    }
  };

  if (!activeJob) {
    return (
      <View style={[styles.emptyContainer, { paddingBottom: bottomInset, paddingTop: topInset }]}>
        <Ionicons name="checkmark-circle-outline" size={64} color={colors.success} />
        <Text style={styles.emptyTitle}>Job completed</Text>
        <Text style={styles.emptyCopy}>This active job has already been closed.</Text>
        <Pressable style={styles.primaryAction} onPress={() => goBack('Home')}>
          <Text style={styles.primaryActionText}>Back to dashboard</Text>
        </Pressable>
      </View>
    );
  }

  const renderWaitCard = () => {
    const mins = Math.floor(waitInfo.elapsedSeconds / 60);
    const secs = waitInfo.elapsedSeconds % 60;

    if (waitInfo.isGrace) {
      const remainingSeconds = FREE_WAIT_SECONDS - waitInfo.elapsedSeconds;
      const remMins = Math.floor(Math.max(0, remainingSeconds) / 60);
      const remSecs = Math.max(0, remainingSeconds) % 60;

      return (
        <View style={[styles.infoBanner, styles.graceBanner]}>
          <Ionicons name="time-outline" size={18} color="#1e40af" />
          <View style={styles.infoBannerBody}>
            <Text style={styles.infoBannerTitle}>Free waiting time active</Text>
            <Text style={styles.infoBannerText}>{`${remMins}m ${remSecs}s remaining before wait fees begin`}</Text>
          </View>
        </View>
      );
    }

    return (
      <View style={[styles.infoBanner, styles.feeBanner]}>
        <Ionicons name="alert-circle-outline" size={18} color="#991b1b" />
        <View style={styles.infoBannerBody}>
          <Text style={styles.infoBannerTitleDanger}>Wait fee accruing</Text>
          <Text style={styles.infoBannerTextDanger}>
            {`${formatCurrency(waitInfo.waitFee)} after ${mins}m ${secs}s of waiting`}
          </Text>
        </View>
      </View>
    );
  };

  const renderActions = () => {
    if (activeJob.status === 'accepted') {
      return (
        <View style={styles.actionGroup}>
          <Pressable style={styles.primaryAction} onPress={() => handleStatusChange('driving')}>
            <Ionicons name="car-outline" size={18} color="#ffffff" />
            <Text style={styles.primaryActionText}>Start driving</Text>
          </Pressable>
          <Pressable style={styles.secondaryAction} onPress={() => handleStatusChange('buying_resources')}>
            <Ionicons name="cart-outline" size={18} color={colors.text} />
            <Text style={styles.secondaryActionText}>Buying resources</Text>
          </Pressable>
        </View>
      );
    }

    if (['driving', 'en_route'].includes(String(activeJob.status || '').toLowerCase())) {
      return (
        <View style={styles.actionGroup}>
          <Pressable style={styles.primaryAction} onPress={handleManualArrival}>
            <Ionicons name="pin-outline" size={18} color="#ffffff" />
            <Text style={styles.primaryActionText}>Mark arrived</Text>
          </Pressable>
          <Pressable style={styles.secondaryAction} onPress={() => handleStatusChange('buying_resources')}>
            <Ionicons name="cart-outline" size={18} color={colors.text} />
            <Text style={styles.secondaryActionText}>Buying resources</Text>
          </Pressable>
        </View>
      );
    }

    if (activeJob.status === 'buying_resources') {
      return (
        <View style={styles.actionGroup}>
          <Pressable style={styles.primaryAction} onPress={() => handleStatusChange('driving')}>
            <Ionicons name="car-outline" size={18} color="#ffffff" />
            <Text style={styles.primaryActionText}>Resume driving</Text>
          </Pressable>
          <Pressable style={styles.secondaryAction} onPress={handleManualArrival}>
            <Ionicons name="pin-outline" size={18} color={colors.text} />
            <Text style={styles.secondaryActionText}>Mark arrived</Text>
          </Pressable>
        </View>
      );
    }

    if (activeJob.status === 'arrived') {
      return (
        <View style={styles.actionGroup}>
          {renderWaitCard()}
          <Pressable style={styles.primaryAction} onPress={() => handleStatusChange('work_started')}>
            <Ionicons name="play-outline" size={18} color="#ffffff" />
            <Text style={styles.primaryActionText}>Job started</Text>
          </Pressable>
        </View>
      );
    }

    if (activeJob.status === 'work_started') {
      return (
        <View style={styles.actionGroup}>
          <View style={[styles.infoBanner, { backgroundColor: '#eff6ff', borderColor: '#bfdbfe' }]}>
            <Ionicons name="build-outline" size={18} color="#1d4ed8" />
            <View style={styles.infoBannerBody}>
              <Text style={styles.infoBannerTitle}>Job in progress</Text>
              <Text style={styles.infoBannerText}>Complete the work, then finalize the job with photo proof.</Text>
            </View>
          </View>
          <Pressable style={styles.primaryAction} onPress={() => setShowPhotoModal(true)}>
            <Ionicons name="camera-outline" size={18} color="#ffffff" />
            <Text style={styles.primaryActionText}>Complete job</Text>
          </Pressable>
        </View>
      );
    }

    return null;
  };

  const renderCancelAction = () => {
    if (!canCancelJob) return null;

    return (
      <View style={styles.inlineFooterActions}>
        <Pressable style={styles.textDangerAction} onPress={() => setShowCancelModal(true)}>
          <Text style={styles.textDangerActionLabel}>Cancel job</Text>
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
        <View style={[styles.metricPill, { backgroundColor: toneStyles.badgeBg, borderColor: toneStyles.badgeBg }]}>
          <Text style={[styles.metricLabel, { color: toneStyles.badgeText }]}>Distance</Text>
          <Text style={[styles.metricValue, { color: toneStyles.badgeText }]}>{formatDistance(distance)}</Text>
        </View>
        <View style={[styles.metricPill, { backgroundColor: toneStyles.badgeBg, borderColor: toneStyles.badgeBg }]}>
          <Text style={[styles.metricLabel, { color: toneStyles.badgeText }]}>ETA</Text>
          <Text style={[styles.metricValue, { color: toneStyles.badgeText }]}>{etaMinutes ? `${etaMinutes} min` : 'Waiting'}</Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: toneStyles.badgeBg }]}>
          <Text style={[styles.statusBadgeText, { color: toneStyles.badgeText }]}>
            {statusMeta.label}
          </Text>
        </View>
      </View>
      <Text style={styles.sheetSubtitle} numberOfLines={expanded ? 3 : 2}>{statusDetail}</Text>

      <View style={styles.personCard}>
        <View style={styles.avatarWrap}>
          {activeJob.customerPhoto ? (
            <Image source={{ uri: activeJob.customerPhoto }} style={styles.avatarImage} />
          ) : (
            <View style={styles.avatarFallback}>
              <Text style={styles.avatarInitials}>{getInitials(activeJob.customerName)}</Text>
            </View>
          )}
        </View>
        <View style={styles.personMeta}>
          <Text style={styles.personLabel}>Customer</Text>
          <Text style={styles.personName}>{activeJob.customerName}</Text>
        </View>
        <Pressable style={styles.iconAction} onPress={handleCallCustomer}>
          <Ionicons name="call-outline" size={18} color={colors.brandDark} />
        </Pressable>
      </View>

      {renderActions()}

      {expanded ? (
        <>
          <View style={styles.divider} />

          <Text style={styles.sectionTitle}>Destination</Text>
          <View style={styles.addressCard}>
            <View style={styles.addressBody}>
              <Ionicons name="location-outline" size={18} color={colors.brand} />
              <Text style={styles.addressText}>{activeJob.address || 'Location pending'}</Text>
            </View>
            <View style={styles.addressActions}>
              <Pressable style={styles.smallAction} onPress={handleCopyAddress}>
                <Text style={styles.smallActionText}>{copied ? 'Copied' : 'Copy'}</Text>
              </Pressable>
              <Pressable style={styles.smallAction} onPress={handleOpenNavigation}>
                <Text style={styles.smallActionText}>Open in maps</Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.metaGrid}>
            <View style={styles.metaCard}>
              <Text style={styles.metaLabel}>Requested skills</Text>
              <Text style={styles.metaValue}>
                {(activeJob.requestedSkills || []).join(', ') || 'Service details will appear here.'}
              </Text>
            </View>
            <View style={styles.metaCard}>
              <Text style={styles.metaLabel}>Price details</Text>
              <Text style={styles.metaValue}>
                {`${serviceName}\nQuoted total: ${formatCurrency(activeJob.totalAmount)}`}
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
        <HelperMapPlaceholder
          mode="route"
          routeView="navigation"
          currentUserMarker={currentLocation ? {
            latitude: currentLocation.latitude,
            longitude: currentLocation.longitude,
            heading: currentLocation.heading,
            initials: 'You',
          } : null}
          customerMarkers={customerMarkers}
          routeCoordinates={routeCoordinates}
          routeError={routeError}
          floatingBottomInset={isLandscape ? 24 : collapsedHeight + bottomInset}
          controlBottomInset={isLandscape ? 24 : collapsedHeight + bottomInset + 24}
        />

        <Pressable
          accessibilityRole="button"
          style={[styles.topBackButton, { top: topInset + 16 }]}
          onPress={() => goBack('Home')}
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
            <Text style={styles.modalText}>Keep your phone charged, verify the address, and report unsafe conditions immediately.</Text>
            <Text style={styles.modalText}>Use the route in-app or open the destination in your preferred maps app if needed.</Text>
            <Pressable style={styles.primaryAction} onPress={() => setShowSafetyModal(false)}>
              <Text style={styles.primaryActionText}>I understand</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal visible={showCancelModal} transparent animationType="fade">
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Cancel assignment</Text>
            <Text style={styles.modalText}>Please explain why you need to cancel this job.</Text>
            <TextInput
              style={styles.reasonInput}
              placeholder="Reason for canceling"
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
                <Text style={styles.secondaryActionText}>Keep job</Text>
              </Pressable>
              <Pressable style={[styles.primaryAction, styles.dangerAction]} onPress={handleCancelSubmit}>
                <Text style={styles.primaryActionText}>Confirm cancel</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={showArrivalConfirmModal} transparent animationType="fade">
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <Ionicons name="warning-outline" size={48} color={colors.warning} />
            <Text style={styles.modalTitle}>Confirm arrival</Text>
            <Text style={styles.modalText}>
              GPS shows you are still more than {ARRIVAL_THRESHOLD_METERS} meters away. Mark this job as arrived anyway?
            </Text>
            <View style={styles.modalButtonRow}>
              <Pressable style={styles.secondaryAction} onPress={() => setShowArrivalConfirmModal(false)}>
                <Text style={styles.secondaryActionText}>Go back</Text>
              </Pressable>
              <Pressable
                style={styles.primaryAction}
                onPress={() => {
                  setShowArrivalConfirmModal(false);
                  handleStatusChange('arrived');
                }}
              >
                <Text style={styles.primaryActionText}>Mark arrived</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={showPhotoModal} transparent animationType="slide">
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Job completed proof</Text>
            <Text style={styles.modalText}>Take a photo or choose one from your gallery before finalizing billing.</Text>

            {completionPhoto ? (
              <View style={styles.photoContainer}>
                <Image source={{ uri: completionPhoto }} style={styles.photoPreview} />
                <Pressable style={styles.photoReset} onPress={() => setCompletionPhoto(null)}>
                  <Ionicons name="close-circle" size={24} color={colors.danger} />
                </Pressable>
              </View>
            ) : (
              <View style={styles.photoActions}>
                <Pressable style={styles.photoPickerAction} onPress={handlePickPhoto}>
                  <Ionicons name="images-outline" size={22} color={colors.brand} />
                  <Text style={styles.photoPickerLabel}>Gallery</Text>
                </Pressable>
                <Pressable style={styles.photoPickerAction} onPress={handleTakePhoto}>
                  <Ionicons name="camera-outline" size={22} color={colors.brand} />
                  <Text style={styles.photoPickerLabel}>Camera</Text>
                </Pressable>
              </View>
            )}

            {saving ? (
              <ActivityIndicator color={colors.brand} size="large" style={{ marginVertical: 20 }} />
            ) : (
              <View style={styles.modalButtonRow}>
                <Pressable style={styles.secondaryAction} onPress={() => setShowPhotoModal(false)}>
                  <Text style={styles.secondaryActionText}>Close</Text>
                </Pressable>
                <Pressable
                  style={[styles.primaryAction, !completionPhoto && styles.disabledAction]}
                  disabled={!completionPhoto}
                  onPress={handleFinalizeJob}
                >
                  <Text style={styles.primaryActionText}>Finalize billing</Text>
                </Pressable>
              </View>
            )}

            {saveError ? <Text style={styles.errorText}>{saveError}</Text> : null}
          </View>
        </View>
      </Modal>

      <Modal visible={showRatingModal} transparent animationType="slide">
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Rate {ratingTarget?.customerName || 'customer'}</Text>
            <Text style={styles.modalText}>Leave quick feedback about this job experience.</Text>
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
            <Pressable
              style={styles.primaryAction}
              onPress={() => {
                setShowRatingModal(false);
                goBack('Home');
              }}
            >
              <Text style={styles.primaryActionText}>Submit rating</Text>
            </Pressable>
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
    alignItems: 'flex-start',
    gap: 12,
    flexWrap: 'wrap',
  },
  metricPill: {
    flex: 1,
    minWidth: 96,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  metricLabel: {
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  metricValue: {
    marginTop: 4,
    fontSize: 14,
    fontWeight: '800',
  },
  sheetSubtitle: {
    marginTop: 12,
    fontSize: 13,
    lineHeight: 19,
    color: colors.muted,
  },
  statusBadge: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
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
  actionGroup: {
    marginTop: 16,
    gap: 10,
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
  addressCard: {
    backgroundColor: '#f8fafc',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  addressBody: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  addressText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    color: colors.text,
    fontWeight: '600',
  },
  addressActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  smallAction: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: colors.brandSoft,
  },
  smallActionText: {
    color: colors.brandDark,
    fontSize: 12,
    fontWeight: '800',
  },
  metaGrid: {
    marginTop: 14,
    gap: 10,
  },
  metaCard: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
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
  footerActions: {
    marginTop: 18,
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
  dangerAction: {
    backgroundColor: colors.danger,
    flex: 1,
  },
  photoContainer: {
    position: 'relative',
    width: '100%',
    height: 190,
    borderRadius: 16,
    overflow: 'hidden',
  },
  photoPreview: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  photoReset: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: '#ffffff',
    borderRadius: 12,
  },
  photoActions: {
    flexDirection: 'row',
    gap: 16,
    justifyContent: 'center',
  },
  photoPickerAction: {
    width: 100,
    height: 94,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.brandSoft,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  photoPickerLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.brandDark,
  },
  disabledAction: {
    opacity: 0.5,
  },
  errorText: {
    fontSize: 12,
    color: colors.danger,
    textAlign: 'center',
  },
  starRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
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
