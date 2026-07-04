import { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, StatusBar, StyleSheet, useWindowDimensions, View } from 'react-native';
import { HelperHomeCallToActionSheet } from '../../components/app/HelperHomeCallToActionSheet';
import { HelperHomeMap } from '../../components/app/HelperHomeMap';
import { useAuth } from '../../context/AuthContext';
import { useHelpersApp } from '../../context/HelpersAppContext';
import {
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
  const { profile, onboardingStatus, actions, saveError, saving, activeJob, homeLocation, setHomeLocation } = useHelpersApp();
  const [composerHeight, setComposerHeight] = useState(0);
  const [mapError, setMapError] = useState('');
  const [mapLoading, setMapLoading] = useState(true);
  const locationSubscriptionRef = useRef(null);
  const ctaGap = 14;

  const isOnline = profile.onlineStatus === 'online';
  const needsProfileCompletion = !onboardingStatus.complete;
  const androidStatusBarInset = Platform.OS === 'android' ? (StatusBar.currentHeight || 0) : 0;
  const effectiveBottomInset = bottomNavVisible ? bottomInset : 0;
  const composerOffset = Math.max(0, effectiveBottomInset + ctaGap);

  const currentUserMarker = useMemo(() => (
    homeLocation
      ? {
          ...homeLocation,
          initials: String(profile?.fullName || user?.displayName || 'You').trim(),
          profilePhoto: String(profile?.profilePhoto || profile?.selfieUrl || '').trim(),
        }
      : null
  ), [homeLocation, profile?.fullName, profile?.profilePhoto, profile?.selfieUrl, user?.displayName]);

  useEffect(() => {
    if (!user?.uid) {
      return () => {};
    }

    let active = true;

    const handleLocation = async (location) => {
      if (!active) return;
      setHomeLocation(location);
      setMapError('');
      setMapLoading(false);
    };

    const start = async () => {
      try {
        const granted = await requestHelperMapLocationPermission();
        if (!active) return;

        if (!granted) {
          setMapLoading(false);
          setMapError('Location access is required to show your position and service radius.');
          return;
        }

        const initialLocation = await getCurrentHelperLocation();
        if (initialLocation) {
          await handleLocation(initialLocation);
        } else if (active) {
          setMapLoading(false);
        }

        locationSubscriptionRef.current = await watchHelperLocation(handleLocation);
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

  const handlePrimaryAction = async () => {
    if (!onboardingStatus.complete) {
      navigate('ProfileCompletion');
      return;
    }

    await actions.toggleOnlineStatus();
  };

  return (
    <View style={styles.screen}>
      <HelperHomeMap
        currentUserMarker={currentUserMarker}
        radiusKm={50}
        isLoading={mapLoading}
        statusMessage={mapError}
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
    elevation: 24,
    left: 0,
    position: 'absolute',
    right: 0,
    zIndex: 24,
  },
});
