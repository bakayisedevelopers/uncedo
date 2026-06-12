import { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, StatusBar, StyleSheet, useWindowDimensions, View } from 'react-native';
import { CustomerCallToActionSheet } from '../../components/customer/CustomerCallToActionSheet';
import { MapPlaceholder } from '../../components/customer/MapPlaceholder';
import { MOCK_PROVIDER_MARKERS } from '../../constants/customer';
import { useAuth } from '../../context/AuthContext';
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
  const [mapZoom, setMapZoom] = useState(1);
  const [mapOffset, setMapOffset] = useState({ x: 0, y: 0 });
  const composerSheetRef = useRef(null);

  const firstName = String(user?.fullName || user?.displayName || 'there').trim().split(' ')[0] || 'there';
  const disabledMessage = onboardingStatus.complete
    ? ''
    : 'Profile not completed. Complete your profile and add a payment card before requesting help.';

  const providerMarkers = useMemo(() => MOCK_PROVIDER_MARKERS, []);
  const androidStatusBarInset = Platform.OS === 'android' ? (StatusBar.currentHeight || 0) : 0;
  const effectiveBottomInset = bottomNavVisible ? bottomInset : 0;
  const composerOffset = effectiveBottomInset;
  const mapUiBottomInset = composerOffset + composerHeight + 16;

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
        floatingBottomInset={mapUiBottomInset}
        markers={providerMarkers}
        offset={mapOffset}
        zoom={mapZoom}
        onPan={(dx, dy) => setMapOffset((prev) => ({ x: prev.x + dx, y: prev.y + dy }))}
        onZoomIn={() => setMapZoom((prev) => Math.min(1.35, prev + 0.08))}
        onZoomOut={() => setMapZoom((prev) => Math.max(0.9, prev - 0.08))}
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
