import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { HelperMapPlaceholder } from './HelperMapPlaceholder';
import {
  GoogleMapColorScheme,
  GoogleMapView,
} from '../../services/googleNavigationSdk';
import { colors } from '../../theme/colors';

let lastKnownHomeMarker = null;
const DEFAULT_LOCATION = { latitude: -26.2041, longitude: 28.0473 };
const MAP_STYLE = JSON.stringify([
  {
    featureType: 'poi.business',
    stylers: [{ visibility: 'off' }],
  },
  {
    featureType: 'transit',
    stylers: [{ visibility: 'off' }],
  },
]);

function normalizeMarker(marker = null) {
  const latitude = Number(marker?.latitude);
  const longitude = Number(marker?.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  return {
    ...marker,
    latitude,
    longitude,
  };
}

function toLatLng(marker) {
  if (!marker) return null;
  return { lat: marker.latitude, lng: marker.longitude };
}

function getRadiusZoom(radiusKm) {
  return Math.max(8, Math.min(15, 15.2 - Math.log2(Math.max(1, radiusKm))));
}

function NativeHomeMap({ marker, radiusKm }) {
  const [controller, setController] = useState(null);
  const [isReady, setIsReady] = useState(false);
  const mapCenter = toLatLng(marker || DEFAULT_LOCATION);
  const radiusZoom = getRadiusZoom(radiusKm);

  useEffect(() => {
    if (!controller || !isReady || !mapCenter) return;

    let cancelled = false;
    const updateMap = async () => {
      controller.clearMapView();
      await controller.addCircle({
        id: 'helper-service-radius',
        center: mapCenter,
        radius: Math.max(1000, Number(radiusKm || 50) * 1000),
        strokeWidth: 2,
        strokeColor: 'rgba(183, 70, 162, 0.5)',
        fillColor: 'rgba(183, 70, 162, 0.12)',
      });
      await controller.addMarker({
        id: 'current-helper',
        position: mapCenter,
        title: 'Your live location',
      });

      if (!cancelled) {
        controller.moveCamera({
          target: mapCenter,
          bearing: 0,
          tilt: 0,
          zoom: radiusZoom,
        });
      }
    };

    updateMap().catch((error) => {
      console.warn('Unable to update the helper home map.', error);
    });

    return () => {
      cancelled = true;
    };
  }, [controller, isReady, mapCenter.lat, mapCenter.lng, radiusKm, radiusZoom]);

  const changeZoom = async (delta) => {
    if (!controller || !isReady) return;
    const camera = await controller.getCameraPosition();
    controller.setZoomLevel(Math.max(3, Math.min(20, Number(camera?.zoom || radiusZoom) + delta)));
  };

  const recenter = () => {
    if (!controller || !isReady) return;
    controller.moveCamera({
      target: mapCenter,
      bearing: 0,
      tilt: 0,
      zoom: radiusZoom,
    });
  };

  return (
    <View style={StyleSheet.absoluteFill}>
      <GoogleMapView
        buildingsEnabled
        compassEnabled={false}
        initialCameraPosition={{ target: mapCenter, zoom: radiusZoom }}
        mapColorScheme={GoogleMapColorScheme.LIGHT}
        mapStyle={MAP_STYLE}
        mapToolbarEnabled={false}
        myLocationButtonEnabled={false}
        myLocationEnabled={false}
        onMapReady={() => setIsReady(true)}
        onMapViewControllerCreated={setController}
        style={StyleSheet.absoluteFill}
        zoomControlsEnabled={false}
      />
      <View style={styles.controls}>
        <Pressable accessibilityLabel="Zoom in" onPress={() => changeZoom(1)} style={styles.controlButton}>
          <Ionicons color={colors.text} name="add" size={18} />
        </Pressable>
        <Pressable accessibilityLabel="Zoom out" onPress={() => changeZoom(-1)} style={styles.controlButton}>
          <Ionicons color={colors.text} name="remove" size={18} />
        </Pressable>
        <Pressable accessibilityLabel="Recenter map" onPress={recenter} style={styles.controlButton}>
          <Ionicons color={colors.text} name="locate" size={17} />
        </Pressable>
      </View>
    </View>
  );
}

export function HelperHomeMap({
  currentUserMarker = null,
  radiusKm = 50,
  isLoading = false,
  statusMessage = '',
}) {
  const [displayMarker, setDisplayMarker] = useState(() => normalizeMarker(currentUserMarker) || lastKnownHomeMarker);
  const hasLocationError = Boolean(String(statusMessage || '').trim()) && !isLoading;

  useEffect(() => {
    const nextMarker = normalizeMarker(currentUserMarker);
    if (!nextMarker) {
      return;
    }

    lastKnownHomeMarker = nextMarker;
    setDisplayMarker(nextMarker);
  }, [currentUserMarker]);

  return (
    <View style={styles.map}>
      {Platform.OS !== 'web' && GoogleMapView ? (
        <NativeHomeMap marker={displayMarker} radiusKm={radiusKm} />
      ) : (
        <HelperMapPlaceholder
          currentUserMarker={displayMarker}
          floatingBottomInset={18}
          interactive
          radiusKm={radiusKm}
          showControls
          zoomPaddingMultiplier={1.55}
        />
      )}

      {hasLocationError ? (
        <View style={styles.statusBanner}>
          <Ionicons color="#ffffff" name="alert-circle-outline" size={16} />
          <Text style={styles.statusBannerText}>{statusMessage}</Text>
        </View>
      ) : null}

      {isLoading ? (
        <View pointerEvents="none" style={styles.loadingOverlay}>
          <ActivityIndicator color={colors.brand} size="small" />
          <Text style={styles.loadingText}>Loading your live location...</Text>
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
  statusBanner: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: 'rgba(17,24,39,0.88)',
    borderRadius: 18,
    flexDirection: 'row',
    gap: 8,
    left: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    position: 'absolute',
    right: 16,
    top: 16,
  },
  statusBannerText: {
    color: '#ffffff',
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
  },
  loadingOverlay: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: 'rgba(255,255,255,0.94)',
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
  controls: {
    bottom: 18,
    gap: 8,
    position: 'absolute',
    right: 16,
  },
  controlButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderColor: 'rgba(31,23,36,0.08)',
    borderRadius: 16,
    borderWidth: 1,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
});
