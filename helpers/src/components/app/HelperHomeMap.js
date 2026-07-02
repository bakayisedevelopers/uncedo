import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  GoogleNavigationUIEnabledPreference,
  GoogleNavigationView,
  googleNavigationSdkAvailable,
} from '../../services/googleNavigationSdk';
import { colors } from '../../theme/colors';

const DEFAULT_COORDINATE = {
  latitude: -26.2041,
  longitude: 28.0473,
};

function normalizeCoordinate(coordinate = null) {
  const latitude = Number(coordinate?.latitude);
  const longitude = Number(coordinate?.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  return { latitude, longitude };
}

function getZoomForRadius(radiusKm = 50) {
  const distance = Math.max(1, Number(radiusKm || 50));

  if (distance <= 2) return 14.8;
  if (distance <= 5) return 13.9;
  if (distance <= 10) return 13.1;
  if (distance <= 20) return 12.2;
  if (distance <= 35) return 11.4;
  if (distance <= 50) return 10.8;
  return 10.1;
}

export function HelperHomeMap({
  currentUserMarker = null,
  radiusKm = 50,
  isLoading = false,
  statusMessage = '',
}) {
  const currentCoordinate = useMemo(() => normalizeCoordinate(currentUserMarker), [currentUserMarker]);
  const [mapController, setMapController] = useState(null);
  const [isMapReady, setIsMapReady] = useState(false);
  const googleMapAvailable = Platform.OS === 'android' && googleNavigationSdkAvailable && Boolean(GoogleNavigationView);
  const legendCopy = statusMessage
    || (isLoading
      ? 'Loading your live location and service radius...'
      : (currentCoordinate
        ? `Showing your live location and ${radiusKm} km service radius.`
        : 'Allow location access to show your live location and service radius.'));

  useEffect(() => {
    if (!googleMapAvailable || !mapController || !isMapReady) {
      return;
    }

    let cancelled = false;

    const syncMap = async () => {
      try {
        await mapController.clearMapView();
      } catch (error) {
        if (__DEV__) {
          console.warn('Unable to clear helper home map before redraw.', error);
        }
      }

      if (cancelled) {
        return;
      }

      const target = currentCoordinate || DEFAULT_COORDINATE;
      mapController.moveCamera({
        target: {
          lat: target.latitude,
          lng: target.longitude,
        },
        zoom: getZoomForRadius(radiusKm),
      });

      if (!currentCoordinate || cancelled) {
        return;
      }

      await mapController.addCircle({
        id: 'service-radius',
        center: {
          lat: currentCoordinate.latitude,
          lng: currentCoordinate.longitude,
        },
        radius: Math.max(1000, Number(radiusKm || 50) * 1000),
        fillColor: 'rgba(236,72,153,0.10)',
        strokeColor: 'rgba(190,24,93,0.26)',
        strokeWidth: 2,
      }).catch(() => {});

      await mapController.addMarker({
        id: 'current-user',
        position: {
          lat: currentCoordinate.latitude,
          lng: currentCoordinate.longitude,
        },
        title: String(currentUserMarker?.initials || 'You').trim() || 'You',
        snippet: 'Your live location',
      }).catch(() => {});
    };

    syncMap();

    return () => {
      cancelled = true;
    };
  }, [currentCoordinate, currentUserMarker?.initials, googleMapAvailable, isMapReady, mapController, radiusKm]);

  if (!googleMapAvailable) {
    return (
      <View style={styles.map}>
        <View style={styles.webFallback}>
          <Ionicons color={colors.brandDark} name="map-outline" size={28} />
          <Text style={styles.webFallbackTitle}>Live map is available in the native helper build.</Text>
          <Text style={styles.webFallbackCopy}>{legendCopy}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.map}>
      <GoogleNavigationView
        compassEnabled={false}
        footerEnabled={false}
        headerEnabled={false}
        initialCameraPosition={{
          target: {
            lat: currentCoordinate?.latitude || DEFAULT_COORDINATE.latitude,
            lng: currentCoordinate?.longitude || DEFAULT_COORDINATE.longitude,
          },
          zoom: getZoomForRadius(radiusKm),
        }}
        mapToolbarEnabled={false}
        myLocationButtonEnabled={false}
        myLocationEnabled
        navigationUIEnabledPreference={GoogleNavigationUIEnabledPreference.DISABLED}
        onMapReady={() => setIsMapReady(true)}
        onMapViewControllerCreated={setMapController}
        reportIncidentButtonEnabled={false}
        style={StyleSheet.absoluteFill}
        zoomControlsEnabled={false}
      />
      {(isLoading || !isMapReady) ? (
        <View pointerEvents="none" style={styles.loadingOverlay}>
          <ActivityIndicator color={colors.brand} size="small" />
          <Text style={styles.loadingText}>
            {isLoading ? 'Loading your live location...' : 'Loading map...'}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  map: {
    backgroundColor: '#fde7f3',
    flex: 1,
    overflow: 'hidden',
  },
  webFallback: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  webFallbackTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '800',
    marginTop: 12,
    textAlign: 'center',
  },
  webFallbackCopy: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 20,
    marginTop: 8,
    textAlign: 'center',
  },
  loadingOverlay: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: 999,
    bottom: 18,
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    position: 'absolute',
  },
  loadingText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '700',
  },
});
