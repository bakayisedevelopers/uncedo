import { useEffect, useMemo, useRef, useState } from 'react';
import { Image, Platform, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';

let NativeMapView = null;
let NativeMarker = null;
let NativeCircle = null;
let PROVIDER_GOOGLE = null;

if (Platform.OS !== 'web') {
  try {
    const maps = require('react-native-maps');
    NativeMapView = maps.default;
    NativeMarker = maps.Marker;
    NativeCircle = maps.Circle;
    PROVIDER_GOOGLE = maps.PROVIDER_GOOGLE;
  } catch (error) {
    NativeMapView = null;
    NativeMarker = null;
    NativeCircle = null;
    PROVIDER_GOOGLE = null;
  }
}

const DEFAULT_REGION = {
  latitude: -26.2041,
  longitude: 28.0473,
  latitudeDelta: 0.42,
  longitudeDelta: 0.42,
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

function buildRegion(center = DEFAULT_REGION, radiusKm = 50) {
  const latitude = Number(center?.latitude || DEFAULT_REGION.latitude);
  const longitude = Number(center?.longitude || DEFAULT_REGION.longitude);
  const latitudeDelta = Math.max(0.08, (radiusKm / 111) * 2.4);
  const longitudeDelta = Math.max(
    0.08,
    latitudeDelta / Math.max(Math.cos((latitude * Math.PI) / 180), 0.35),
  );

  return {
    latitude,
    longitude,
    latitudeDelta,
    longitudeDelta,
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

export function HelperHomeMap({
  currentUserMarker = null,
  radiusKm = 50,
  isLoading = false,
  statusMessage = '',
}) {
  const currentCoordinate = useMemo(() => normalizeCoordinate(currentUserMarker), [currentUserMarker]);
  const mapRef = useRef(null);
  const [region, setRegion] = useState(() => buildRegion(currentCoordinate || DEFAULT_REGION, radiusKm));

  useEffect(() => {
    const next = buildRegion(currentCoordinate || DEFAULT_REGION, radiusKm);
    setRegion(next);
    mapRef.current?.animateToRegion?.(next, 350);
  }, [currentCoordinate?.latitude, currentCoordinate?.longitude, radiusKm]);

  const radiusMeters = Math.max(1000, Number(radiusKm || 50) * 1000);
  const legendCopy = statusMessage
    || (isLoading
      ? 'Loading your live location and service radius...'
      : (currentCoordinate
        ? `Showing your live location and ${radiusKm} km service radius.`
        : 'Allow location access to show your live location and service radius.'));

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
        // TODO: Keep iOS on the default provider until the helper app has checked-in iOS Google Maps native setup.
        provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
        region={region}
        showsMyLocationButton={false}
        showsCompass={false}
        showsPointsOfInterest={false}
        showsBuildings
        toolbarEnabled={false}
        style={StyleSheet.absoluteFill}
      >
        {currentCoordinate && NativeCircle ? (
          <NativeCircle
            center={currentCoordinate}
            fillColor="rgba(124,58,237,0.10)"
            strokeColor="rgba(124,58,237,0.28)"
            strokeWidth={1}
            radius={radiusMeters}
          />
        ) : null}

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
