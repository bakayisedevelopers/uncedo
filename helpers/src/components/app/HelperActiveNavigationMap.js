import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, View } from 'react-native';
import {
  GoogleCameraPerspective,
  GoogleNavigationSessionStatus,
  GoogleNavigationUIEnabledPreference,
  GoogleNavigationView,
  GoogleRouteStatus,
  GoogleTravelMode,
  googleNavigationSdkAvailable,
  useGoogleNavigationSafe,
} from '../../services/googleNavigationSdk';
import { colors } from '../../theme/colors';
import { HelperMapPlaceholder } from './HelperMapPlaceholder';

const ANDROID_ONLY = Platform.OS === 'android' && googleNavigationSdkAvailable;

function isValidCoordinate(coordinate = null) {
  return Number.isFinite(Number(coordinate?.latitude)) && Number.isFinite(Number(coordinate?.longitude));
}

function buildDestinationKey(destination = null, title = '') {
  if (!isValidCoordinate(destination)) {
    return '';
  }

  return [
    Number(destination.latitude).toFixed(6),
    Number(destination.longitude).toFixed(6),
    String(title || '').trim(),
  ].join(':');
}

function getInitErrorMessage(status) {
  switch (status) {
    case GoogleNavigationSessionStatus.NOT_AUTHORIZED:
      return 'Google Navigation is not authorized for the current API key.';
    case GoogleNavigationSessionStatus.TERMS_NOT_ACCEPTED:
      return 'Google Navigation terms were not accepted.';
    case GoogleNavigationSessionStatus.LOCATION_PERMISSION_MISSING:
      return 'Location permission is required to start Google Navigation.';
    case GoogleNavigationSessionStatus.NETWORK_ERROR:
      return 'Google Navigation needs an internet connection to initialize.';
    default:
      return 'Google Navigation is unavailable right now.';
  }
}

function getRouteErrorMessage(status) {
  switch (status) {
    case GoogleRouteStatus.NO_ROUTE_FOUND:
      return 'Google Navigation could not find a route to the customer.';
    case GoogleRouteStatus.NETWORK_ERROR:
      return 'Google Navigation could not calculate the route because the network is unavailable.';
    case GoogleRouteStatus.QUOTA_CHECK_FAILED:
      return 'Google Navigation quota is unavailable for this route request.';
    case GoogleRouteStatus.LOCATION_DISABLED:
    case GoogleRouteStatus.LOCATION_UNKNOWN:
      return 'Waiting for a live location fix before starting Google Navigation.';
    case GoogleRouteStatus.WAYPOINT_ERROR:
    case GoogleRouteStatus.INVALID_PLACE_ID:
    case GoogleRouteStatus.DUPLICATE_WAYPOINTS_ERROR:
      return 'Google Navigation could not use the selected destination.';
    default:
      return 'Google Navigation could not start the route.';
  }
}

export function HelperActiveNavigationMap({
  currentUserMarker = null,
  customerMarkers = [],
  routeCoordinates = [],
  routeError = '',
  floatingBottomInset = 228,
  controlBottomInset = null,
  topInset = 0,
  routeView = 'overview',
  navigationEnabled = false,
  destinationTitle = 'Customer',
  onMetricsChange = null,
}) {
  const destination = customerMarkers[0]?.coordinate || null;
  const destinationKey = useMemo(
    () => buildDestinationKey(destination, destinationTitle),
    [destination, destinationTitle],
  );
  const [navigationViewController, setNavigationViewController] = useState(null);
  const [initState, setInitState] = useState(ANDROID_ONLY ? 'initializing' : 'fallback');
  const [sdkError, setSdkError] = useState('');
  const [hasSdkLocation, setHasSdkLocation] = useState(false);
  const configuredDestinationRef = useRef('');
  const isMountedRef = useRef(true);
  const {
    navigationController,
    removeAllListeners,
    setOnLocationChanged,
    setOnNavigationReady,
    setOnRemainingTimeOrDistanceChanged,
  } = useGoogleNavigationSafe();

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!ANDROID_ONLY) {
      setInitState('fallback');
      return () => {};
    }

    setOnLocationChanged((location) => {
      const hasLocation = Number.isFinite(Number(location?.lat)) && Number.isFinite(Number(location?.lng));
      if (hasLocation) {
        setHasSdkLocation(true);
      }
    });
    setOnNavigationReady(() => {
      if (!isMountedRef.current) return;
      setSdkError('');
      setInitState('ready');
    });
    setOnRemainingTimeOrDistanceChanged((timeAndDistance) => {
      onMetricsChange?.({
        distanceMeters: Number.isFinite(Number(timeAndDistance?.meters))
          ? Number(timeAndDistance.meters)
          : null,
        durationSeconds: Number.isFinite(Number(timeAndDistance?.seconds))
          ? Number(timeAndDistance.seconds)
          : null,
      });
    });

    return () => {
      removeAllListeners();
    };
  }, [
    onMetricsChange,
    removeAllListeners,
    setOnLocationChanged,
    setOnNavigationReady,
    setOnRemainingTimeOrDistanceChanged,
  ]);

  useEffect(() => {
    if (!ANDROID_ONLY) {
      return () => {};
    }

    let cancelled = false;

    const initializeNavigation = async () => {
      try {
        setInitState('initializing');
        const accepted = await navigationController.showTermsAndConditionsDialog();
        if (cancelled) return;

        if (!accepted) {
          setSdkError(getInitErrorMessage(GoogleNavigationSessionStatus.TERMS_NOT_ACCEPTED));
          setInitState('fallback');
          return;
        }

        const status = await navigationController.init();
        if (cancelled) return;

        if (status !== GoogleNavigationSessionStatus.OK) {
          setSdkError(getInitErrorMessage(status));
          setInitState('fallback');
          return;
        }

        navigationController.startUpdatingLocation();
        setSdkError('');
        setInitState('ready');
      } catch (error) {
        if (cancelled) return;
        setSdkError(error?.message || 'Google Navigation failed to initialize.');
        setInitState('fallback');
      }
    };

    initializeNavigation();

    return () => {
      cancelled = true;
      configuredDestinationRef.current = '';
      onMetricsChange?.({ distanceMeters: null, durationSeconds: null });
      navigationController.stopUpdatingLocation();
      navigationController.stopGuidance().catch(() => {});
      navigationController.clearDestinations().catch(() => {});
      navigationController.cleanup().catch(() => {});
    };
  }, [navigationController, onMetricsChange]);

  useEffect(() => {
    if (initState !== 'ready' || !navigationViewController) {
      return;
    }

    const perspective = navigationEnabled
      ? GoogleCameraPerspective.TILTED
      : routeView === 'navigation'
        ? GoogleCameraPerspective.TOP_DOWN_HEADING_UP
        : GoogleCameraPerspective.TOP_DOWN_NORTH_UP;

    navigationViewController.setFollowingPerspective(perspective).catch(() => {});
    navigationViewController.setNavigationUIEnabled(Boolean(navigationEnabled)).catch(() => {});
    if (!navigationEnabled) {
      navigationViewController.showRouteOverview();
    }
  }, [initState, navigationEnabled, navigationViewController, routeView]);

  useEffect(() => {
    if (initState !== 'ready') {
      return;
    }

    if (!destinationKey || !isValidCoordinate(destination) || !hasSdkLocation) {
      return;
    }

    const modeKey = `${destinationKey}:${navigationEnabled ? 'guidance' : 'overview'}`;
    if (configuredDestinationRef.current === modeKey) {
      return;
    }

    let cancelled = false;

    const syncDestination = async () => {
      try {
        const routeStatus = await navigationController.setDestination(
          {
            title: destinationTitle,
            position: {
              lat: Number(destination.latitude),
              lng: Number(destination.longitude),
            },
          },
          {
            routingOptions: {
              travelMode: GoogleTravelMode.DRIVING,
            },
            displayOptions: {
              showDestinationMarkers: true,
            },
          },
        );

        if (cancelled) {
          return;
        }

        if (routeStatus !== GoogleRouteStatus.OK) {
          setSdkError(getRouteErrorMessage(routeStatus));
          setInitState('fallback');
          return;
        }

        if (navigationEnabled) {
          await navigationController.startGuidance();
        } else {
          await navigationController.stopGuidance();
          navigationViewController?.showRouteOverview();
        }

        configuredDestinationRef.current = modeKey;
        setSdkError('');
      } catch (error) {
        if (cancelled) {
          return;
        }
        setSdkError(error?.message || 'Google Navigation could not start this route.');
        setInitState('fallback');
      }
    };

    syncDestination();

    return () => {
      cancelled = true;
    };
  }, [
    destination,
    destinationKey,
    destinationTitle,
    hasSdkLocation,
    initState,
    navigationController,
    navigationEnabled,
    navigationViewController,
  ]);

  if (!ANDROID_ONLY || initState === 'fallback') {
    return (
      <View style={styles.fallbackWrap}>
        <HelperMapPlaceholder
          mode="route"
          routeView={routeView}
          currentUserMarker={currentUserMarker}
          customerMarkers={customerMarkers}
          routeCoordinates={routeCoordinates}
          routeError={sdkError || routeError}
          floatingBottomInset={floatingBottomInset}
          controlBottomInset={controlBottomInset}
        />
        {sdkError ? (
          <View style={styles.banner}>
            <Text style={styles.bannerText}>{sdkError}</Text>
          </View>
        ) : null}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <GoogleNavigationView
        style={StyleSheet.absoluteFill}
        compassEnabled
        footerEnabled={navigationEnabled}
        headerEnabled={navigationEnabled}
        mapPadding={{
          top: Math.max(96, Math.round(topInset + 84)),
          right: 24,
          bottom: Math.max(120, Math.round(floatingBottomInset + 40)),
          left: 24,
        }}
        mapToolbarEnabled={false}
        myLocationButtonEnabled={false}
        myLocationEnabled
        navigationUIEnabledPreference={GoogleNavigationUIEnabledPreference.AUTOMATIC}
        onNavigationViewControllerCreated={setNavigationViewController}
        recenterButtonEnabled
        reportIncidentButtonEnabled={false}
        rotateGesturesEnabled
        scrollGesturesEnabled
        speedLimitIconEnabled={navigationEnabled}
        speedometerEnabled={navigationEnabled}
        tiltGesturesEnabled
        trafficIncidentCardsEnabled={navigationEnabled}
        trafficPromptsEnabled={navigationEnabled}
        tripProgressBarEnabled={navigationEnabled}
        zoomControlsEnabled={false}
        zoomGesturesEnabled
      />

      {initState === 'initializing' ? (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator color={colors.brand} size="small" />
          <Text style={styles.loadingText}>Starting Google Navigation...</Text>
        </View>
      ) : null}

      {!hasSdkLocation ? (
        <View style={styles.waitingOverlay}>
          <Text style={styles.waitingText}>Waiting for a location fix...</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#f3f4f6',
    flex: 1,
  },
  fallbackWrap: {
    flex: 1,
  },
  banner: {
    backgroundColor: 'rgba(17,24,39,0.84)',
    borderRadius: 14,
    left: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    position: 'absolute',
    right: 16,
    top: 16,
  },
  bannerText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  loadingOverlay: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius: 16,
    flexDirection: 'row',
    gap: 10,
    left: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    position: 'absolute',
    right: 16,
    top: 16,
  },
  loadingText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  waitingOverlay: {
    alignSelf: 'center',
    backgroundColor: 'rgba(17,24,39,0.78)',
    borderRadius: 999,
    bottom: 18,
    paddingHorizontal: 14,
    paddingVertical: 8,
    position: 'absolute',
  },
  waitingText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
});
