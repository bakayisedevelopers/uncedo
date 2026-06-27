import { useEffect, useMemo, useRef, useState } from 'react';
import { Image, Platform, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';

let NativeMapView = null;
let NativeMarker = null;
let PROVIDER_GOOGLE = null;

if (Platform.OS !== 'web') {
  try {
    const maps = require('react-native-maps');
    NativeMapView = maps.default;
    NativeMarker = maps.Marker;
    PROVIDER_GOOGLE = maps.PROVIDER_GOOGLE;
  } catch (error) {
    NativeMapView = null;
    NativeMarker = null;
    PROVIDER_GOOGLE = null;
  }
}

const DEFAULT_REGION = {
  latitude: -26.2041,
  longitude: 28.0473,
  latitudeDelta: 0.12,
  longitudeDelta: 0.12,
};

function getInitials(name = '') {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (!parts.length) return 'U';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase() || 'U';
  return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase() || 'U';
}

function normalizeCoordinate(coordinate = null) {
  const latitude = Number(coordinate?.latitude);
  const longitude = Number(coordinate?.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  return { latitude, longitude };
}

function buildRegion(center = DEFAULT_REGION) {
  const latitude = Number(center?.latitude || DEFAULT_REGION.latitude);
  const longitude = Number(center?.longitude || DEFAULT_REGION.longitude);

  return {
    latitude,
    longitude,
    latitudeDelta: DEFAULT_REGION.latitudeDelta,
    longitudeDelta: DEFAULT_REGION.longitudeDelta,
  };
}

function AvatarMarker({ initials, photoUri }) {
  return (
    <View style={styles.markerRoot}>
      <View style={styles.markerPinShadow} />
      <View style={styles.markerPin}>
        <Ionicons color={colors.brandDark} name="location-sharp" size={42} style={styles.markerIcon} />
        <View style={styles.markerAvatar}>
          {photoUri ? (
            <Image source={{ uri: photoUri }} style={styles.markerImage} />
          ) : (
            <Text style={styles.markerInitials}>{getInitials(initials)}</Text>
          )}
        </View>
      </View>
    </View>
  );
}

export function CustomerHomeMap({
  currentUserMarker = null,
  isLoading = false,
  statusMessage = '',
}) {
  const currentCoordinate = useMemo(() => normalizeCoordinate(currentUserMarker), [currentUserMarker]);
  const mapRef = useRef(null);
  const [region, setRegion] = useState(() => buildRegion(currentCoordinate || DEFAULT_REGION));

  useEffect(() => {
    const next = buildRegion(currentCoordinate || DEFAULT_REGION);
    setRegion(next);
    mapRef.current?.animateToRegion?.(next, 350);
  }, [currentCoordinate?.latitude, currentCoordinate?.longitude]);

  const legendCopy = statusMessage
    || (isLoading
      ? 'Loading your live location...'
      : (currentCoordinate
        ? 'Showing your current location.'
        : 'Allow location access to show your current location.'));

  if (!NativeMapView || !NativeMarker) {
    return (
      <View style={styles.map}>
        <View style={styles.webFallback}>
          <Ionicons color={colors.brandDark} name="map-outline" size={28} />
          <Text style={styles.webFallbackTitle}>Live map is available in the mobile build.</Text>
          <Text style={styles.webFallbackCopy}>{legendCopy}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.map}>
      <NativeMapView
        ref={mapRef}
        initialRegion={region}
        onRegionChangeComplete={setRegion}
        provider={PROVIDER_GOOGLE || undefined}
        region={region}
        showsMyLocationButton={false}
        showsCompass={false}
        showsPointsOfInterest={false}
        showsBuildings
        toolbarEnabled={false}
        style={StyleSheet.absoluteFill}
      >
        {currentCoordinate ? (
          <NativeMarker coordinate={currentCoordinate} identifier="current-user">
            <AvatarMarker
              initials={currentUserMarker?.initials || 'You'}
              photoUri={currentUserMarker?.profilePhoto}
            />
          </NativeMarker>
        ) : null}
      </NativeMapView>

      <View pointerEvents="none" style={styles.statusCard}>
        <Ionicons color={colors.brandDark} name={isLoading ? 'cloud-download-outline' : 'location-outline'} size={18} />
        <Text style={styles.statusText}>{legendCopy}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  map: {
    backgroundColor: '#fdf2f8',
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
  markerRoot: {
    alignItems: 'center',
  },
  markerPinShadow: {
    backgroundColor: 'rgba(15,23,42,0.16)',
    borderRadius: 24,
    height: 8,
    marginBottom: -1,
    opacity: 0.5,
    width: 18,
  },
  markerPin: {
    alignItems: 'center',
    justifyContent: 'flex-start',
    width: 54,
    height: 54,
  },
  markerIcon: {
    position: 'absolute',
    top: 0,
  },
  markerAvatar: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderColor: colors.brandDark,
    borderRadius: 999,
    borderWidth: 2,
    height: 28,
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'absolute',
    top: 7,
    width: 28,
  },
  markerImage: {
    height: '100%',
    width: '100%',
  },
  markerInitials: {
    color: colors.brandDark,
    fontSize: 12,
    fontWeight: '900',
  },
  statusCard: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderColor: 'rgba(15,23,42,0.08)',
    borderRadius: 18,
    borderWidth: 1,
    bottom: 16,
    flexDirection: 'row',
    gap: 8,
    left: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    position: 'absolute',
    right: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  statusText: {
    color: colors.text,
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 18,
  },
});
