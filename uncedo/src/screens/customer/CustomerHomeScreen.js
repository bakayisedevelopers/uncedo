import { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, StatusBar, StyleSheet, useWindowDimensions, View } from 'react-native';
import { CustomerCallToActionSheet } from '../../components/customer/CustomerCallToActionSheet';
import { MapPlaceholder } from '../../components/customer/MapPlaceholder';
import { useAuth } from '../../context/AuthContext';
import {
  fetchNearbyHelpersMapData,
  getCurrentCustomerLocation,
  requestCustomerLocationPermission,
  watchCustomerLocation,
} from '../../services/nearbyHelpersMapService';
import { getCustomerOnboardingStatus } from '../../utils/onboarding';

export function CustomerHomeScreen({
  navigate,
  route,
  bottomInset = 0,
  bottomNavVisible = true,
  onBottomNavVisibilityChange,
}) {
  const { user } = useAuth();
  const { height: windowHeight } = useWindowDimensions();
  const onboardingStatus = getCustomerOnboardingStatus(user);
  const [composerHeight, setComposerHeight] = useState(0);
  const [helperMarkers, setHelperMarkers] = useState([]);
  const [currentLocation, setCurrentLocation] = useState(null);
  const [mapError, setMapError] = useState('');
  const [mapLoading, setMapLoading] = useState(true);
  const composerSheetRef = useRef(null);
  const locationSubscriptionRef = useRef(null);
  const latestLocationRef = useRef(null);
  const refreshInFlightRef = useRef(false);

  const firstName = String(user?.fullName || user?.displayName || 'there').trim().split(' ')[0] || 'there';
  const disabledMessage = onboardingStatus.complete
    ? ''
    : 'Profile not completed. Complete your profile and add a payment card before requesting help.';
  const androidStatusBarInset = Platform.OS === 'android' ? (StatusBar.currentHeight || 0) : 0;
  const effectiveBottomInset = bottomNavVisible ? bottomInset : 0;
  const composerOffset = effectiveBottomInset;
  const mapUiBottomInset = composerOffset + composerHeight + 16;

  const currentUserMarker = useMemo(() => (
    currentLocation
      ? {
          ...currentLocation,
          initials: String(user?.fullName || user?.displayName || 'You').trim(),
          profilePhoto: String(user?.profilePhoto || user?.selfieUrl || '').trim(),
        }
      : null
  ), [currentLocation, user?.displayName, user?.fullName, user?.profilePhoto, user?.selfieUrl]);

  useEffect(() => {
    if (!user?.uid) {
      return () => {};
    }

    let active = true;
    let refreshTimer = null;

    const refreshNearbyHelpers = async (location) => {
      if (!location || refreshInFlightRef.current) {
        return;
      }

      refreshInFlightRef.current = true;

      try {
        const payload = await fetchNearbyHelpersMapData({
          latitude: location.latitude,
          longitude: location.longitude,
          radiusKm: 20,
          limit: 24,
        });

        if (!active) return;

        setHelperMarkers(
          (payload.helpers || [])
            .map((helper) => ({
              ...helper,
              coordinate: {
                latitude: helper.liveLocation?.latitude,
                longitude: helper.liveLocation?.longitude,
              },
            }))
            .filter((helper) => (
              Number.isFinite(Number(helper.coordinate?.latitude))
              && Number.isFinite(Number(helper.coordinate?.longitude))
            )),
        );
        setMapError('');
      } catch (error) {
        if (active) {
          setMapError(error.message || 'Unable to load nearby helpers right now.');
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
      await refreshNearbyHelpers(location);
    };

    const start = async () => {
      try {
        const granted = await requestCustomerLocationPermission();
        if (!active) return;

        if (!granted) {
          setMapLoading(false);
          setMapError('Location access is required to show your position and nearby helpers.');
          return;
        }

        const initialLocation = await getCurrentCustomerLocation();
        if (initialLocation) {
          await handleLocation(initialLocation);
        }

        locationSubscriptionRef.current = await watchCustomerLocation(handleLocation);
        refreshTimer = setInterval(() => {
          if (latestLocationRef.current) {
            refreshNearbyHelpers(latestLocationRef.current);
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
  }, [user?.uid]);

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

  return (
    <View style={styles.screen}>
      <MapPlaceholder
        currentUserMarker={currentUserMarker}
        floatingBottomInset={mapUiBottomInset}
        helperMarkers={helperMarkers}
        isLoading={mapLoading}
        errorMessage={mapError}
        radiusKm={20}
      />

      <View
        onLayout={(event) => setComposerHeight(event.nativeEvent.layout.height)}
        ref={composerSheetRef}
        style={[styles.bottomSheetWrap, { bottom: composerOffset }]}
      >
        <CustomerCallToActionSheet
          disabled={!onboardingStatus.complete}
          disabledMessage={disabledMessage}
          firstName={firstName}
          onPress={() => navigate({ key: 'CustomerServiceCall', params: { parentTab: 'CustomerHome' } })}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: '#e7f1ec',
    flex: 1,
  },
  bottomSheetWrap: {
    left: 0,
    position: 'absolute',
    right: 0,
  },
});
