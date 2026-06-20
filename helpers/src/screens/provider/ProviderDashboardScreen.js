import { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, StatusBar, StyleSheet, useWindowDimensions, View } from 'react-native';
import { HelperHomeCallToActionSheet } from '../../components/app/HelperHomeCallToActionSheet';
import { HelperMapPlaceholder } from '../../components/app/HelperMapPlaceholder';
import { useAuth } from '../../context/AuthContext';
import { useHelpersApp } from '../../context/HelpersAppContext';
import {
  fetchNearbyActiveCustomersMapData,
  getCurrentHelperLocation,
  requestHelperMapLocationPermission,
  watchHelperLocation,
} from '../../services/nearbyCustomersMapService';

export function ProviderDashboardScreen({
  navigate,
  bottomInset = 0,
  bottomNavVisible = true,
  onBottomNavVisibilityChange,
}) {
  const { user } = useAuth();
  const { height: windowHeight } = useWindowDimensions();
  const { profile, onboardingStatus, actions, saveError, saving, activeJob } = useHelpersApp();
  const [composerHeight, setComposerHeight] = useState(0);
  const [customerMarkers, setCustomerMarkers] = useState([]);
  const [currentLocation, setCurrentLocation] = useState(null);
  const [mapError, setMapError] = useState('');
  const [mapLoading, setMapLoading] = useState(true);
  const locationSubscriptionRef = useRef(null);
  const latestLocationRef = useRef(null);
  const refreshInFlightRef = useRef(false);
  const ctaGap = 14;

  const isOnline = profile.onlineStatus === 'online';
  const needsProfileCompletion = !onboardingStatus.complete;
  const androidStatusBarInset = Platform.OS === 'android' ? (StatusBar.currentHeight || 0) : 0;
  const effectiveBottomInset = bottomNavVisible ? bottomInset : 0;
  const composerOffset = Math.max(0, effectiveBottomInset + ctaGap);
  const mapUiBottomInset = composerOffset + composerHeight;
  const controlBottomInset = mapUiBottomInset + ctaGap;
  const mapPadding = {
    top: 88,
    right: 24,
    bottom: controlBottomInset + 28,
    left: 24,
  };

  const currentUserMarker = useMemo(() => (
    currentLocation
      ? {
          ...currentLocation,
          initials: String(profile?.fullName || user?.displayName || 'You').trim(),
          profilePhoto: String(profile?.profilePhoto || profile?.selfieUrl || '').trim(),
        }
      : null
  ), [currentLocation, profile?.fullName, profile?.profilePhoto, profile?.selfieUrl, user?.displayName]);

  useEffect(() => {
    if (!user?.uid) {
      return () => {};
    }

    let active = true;
    let refreshTimer = null;

    const refreshNearbyCustomers = async (location) => {
      if (!location || !isOnline || refreshInFlightRef.current) {
        if (active && !isOnline) {
          setCustomerMarkers([]);
          setMapLoading(false);
          setMapError('');
        }
        return;
      }

      refreshInFlightRef.current = true;

      try {
        const payload = await fetchNearbyActiveCustomersMapData({
          latitude: location.latitude,
          longitude: location.longitude,
          radiusKm: 50,
          limit: 30,
        });

        if (!active) return;

        setCustomerMarkers(
          (payload.customers || [])
            .map((customer) => ({
              ...customer,
              coordinate: {
                latitude: customer.lastKnownLocation?.latitude,
                longitude: customer.lastKnownLocation?.longitude,
              },
            }))
            .filter((customer) => (
              Number.isFinite(Number(customer.coordinate?.latitude))
              && Number.isFinite(Number(customer.coordinate?.longitude))
            )),
        );
        setMapError('');
      } catch (error) {
        if (active) {
          setMapError(error.message || 'Unable to load nearby customers right now.');
        }
      } finally {
        if (active) {
          setMapLoading(false);
        }
        refreshInFlightRef.current = false;
      }
    };

    const handleLocation = async (location) => {
      latestLocationRef.current = location;
      if (!active) return;
      setCurrentLocation(location);
      await refreshNearbyCustomers(location);
    };

    const start = async () => {
      try {
        const granted = await requestHelperMapLocationPermission();
        if (!active) return;

        if (!granted) {
          setMapLoading(false);
          setMapError('Location access is required to show your position and nearby customers.');
          return;
        }

        const initialLocation = await getCurrentHelperLocation();
        if (initialLocation) {
          await handleLocation(initialLocation);
        } else if (active) {
          setMapLoading(false);
        }

        locationSubscriptionRef.current = await watchHelperLocation(handleLocation);
        refreshTimer = setInterval(() => {
          if (latestLocationRef.current) {
            refreshNearbyCustomers(latestLocationRef.current);
          }
        }, 60000);
      } catch (error) {
        if (active) {
          setMapLoading(false);
          setMapError(error.message || 'Unable to start live location right now.');
        }
      }
    };

    start();

    return () => {
      active = false;
      refreshTimer && clearInterval(refreshTimer);
      locationSubscriptionRef.current?.remove?.();
      locationSubscriptionRef.current = null;
    };
  }, [isOnline, user?.uid]);

  useEffect(() => {
    if (!onBottomNavVisibilityChange || !windowHeight || !composerHeight) {
      return;
    }

    const availableHeight = windowHeight - androidStatusBarInset;
    const shouldHideBottomNav = composerHeight >= availableHeight - 40;
    const shouldShowBottomNav = composerHeight <= availableHeight - bottomInset - 120;

    if (shouldHideBottomNav && bottomNavVisible) {
      onBottomNavVisibilityChange(false);
    } else if (shouldShowBottomNav && !bottomNavVisible) {
      onBottomNavVisibilityChange(true);
    }
  }, [
    androidStatusBarInset,
    bottomInset,
    bottomNavVisible,
    composerHeight,
    onBottomNavVisibilityChange,
    windowHeight,
  ]);

  const handlePrimaryAction = async () => {
    if (!onboardingStatus.complete) {
      navigate('ProfileCompletion');
      return;
    }

    await actions.toggleOnlineStatus();
  };

  return (
    <View style={styles.screen}>
      <HelperMapPlaceholder
        currentUserMarker={currentUserMarker}
        customerMarkers={customerMarkers}
        floatingBottomInset={mapUiBottomInset}
        controlBottomInset={controlBottomInset}
        mapPadding={mapPadding}
        isLoading={mapLoading}
        errorMessage={mapError || saveError}
        radiusKm={50}
      />

      <View
        onLayout={(event) => setComposerHeight(event.nativeEvent.layout.height)}
        style={[styles.bottomSheetWrap, { bottom: composerOffset }]}
      >
        <HelperHomeCallToActionSheet
          disabled={saving}
          needsProfileCompletion={needsProfileCompletion}
          isOnline={isOnline}
          hasActiveJob={!!activeJob}
          onPress={handlePrimaryAction}
          onGoToActiveJob={() => navigate('ActiveJob')}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: '#fde7f3',
    flex: 1,
  },
  bottomSheetWrap: {
    left: 0,
    position: 'absolute',
    right: 0,
  },
});
