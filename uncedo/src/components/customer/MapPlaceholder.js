import { useEffect, useRef, useState } from 'react';
import { Image, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';

let NativeMapView = null;
let NativeMarker = null;
let PROVIDER_GOOGLE = null;

if (Platform.OS !== 'web') {
  const maps = require('react-native-maps');
  NativeMapView = maps.default;
  NativeMarker = maps.Marker;
  PROVIDER_GOOGLE = maps.PROVIDER_GOOGLE;
}

const DEFAULT_REGION = {
  latitude: -26.2041,
  longitude: 28.0473,
  latitudeDelta: 0.22,
  longitudeDelta: 0.22,
};

function getInitials(name = '') {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (!parts.length) return 'U';
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase() || 'U';
  }

  return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase() || 'U';
}

function buildRegion(center = DEFAULT_REGION, radiusKm = 20) {
  const latitude = Number(center?.latitude || DEFAULT_REGION.latitude);
  const longitude = Number(center?.longitude || DEFAULT_REGION.longitude);
  const latitudeDelta = Math.max(0.015, (radiusKm / 111) * 2.4);
  const longitudeDelta = Math.max(
    0.015,
    latitudeDelta / Math.max(Math.cos((latitude * Math.PI) / 180), 0.35),
  );

  return {
    latitude,
    longitude,
    latitudeDelta,
    longitudeDelta,
  };
}

function AvatarMarker({ initials, photoUri, isCurrentUser = false }) {
  return (
    <View style={styles.markerRoot}>
      <View style={[styles.markerAvatar, isCurrentUser && styles.markerAvatarCurrent]}>
        {photoUri ? (
          <Image source={{ uri: photoUri }} style={styles.markerImage} />
        ) : (
          <Text style={styles.markerInitials}>{getInitials(initials)}</Text>
        )}
      </View>
      <View style={[styles.markerPin, isCurrentUser && styles.markerPinCurrent]} />
    </View>
  );
}

export function MapPlaceholder({
  currentUserMarker = null,
  helperMarkers = [],
  floatingBottomInset = 196,
  radiusKm = 20,
  isLoading = false,
  errorMessage = '',
}) {
  const [region, setRegion] = useState(() => buildRegion(currentUserMarker, radiusKm));
  const mapRef = useRef(null);

  useEffect(() => {
    if (!currentUserMarker) return;
    setRegion(buildRegion(currentUserMarker, radiusKm));
  }, [currentUserMarker, radiusKm]);

  const recenter = () => {
    if (!currentUserMarker) return;
    const next = buildRegion(currentUserMarker, radiusKm);
    setRegion(next);
    mapRef.current?.animateToRegion?.(next, 350);
  };

  const zoom = (factor) => {
    setRegion((current) => {
      const next = {
        ...current,
        latitudeDelta: Math.max(0.004, current.latitudeDelta * factor),
        longitudeDelta: Math.max(0.004, current.longitudeDelta * factor),
      };
      mapRef.current?.animateToRegion?.(next, 250);
      return next;
    });
  };

  const helperCount = helperMarkers.length;
  const legendTitle = isLoading ? 'Finding nearby helpers' : `${helperCount} nearby helper${helperCount === 1 ? '' : 's'}`;
  const legendCopy = errorMessage
    || (currentUserMarker
      ? `Showing helpers within ${radiusKm} km of your current location.`
      : 'Allow location access to see your position and nearby helpers.');

  if (!NativeMapView || !NativeMarker) {
    return (
      <View style={styles.map}>
        <View style={styles.webFallback}>
          <Ionicons color={colors.brandDark} name="map-outline" size={28} />
          <Text style={styles.webFallbackTitle}>Live map is available in the mobile build.</Text>
          <Text style={styles.webFallbackCopy}>{legendCopy}</Text>
        </View>
        <View style={[styles.legend, { bottom: floatingBottomInset }]}>
          <Text style={styles.legendTitle}>{legendTitle}</Text>
          <Text style={styles.legendCopy}>{legendCopy}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.map}>
      <NativeMapView
        ref={mapRef}
        customMapStyle={MAP_STYLE}
        initialRegion={region}
        onRegionChangeComplete={setRegion}
        provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
        region={region}
        showsBuildings
        showsCompass={false}
        showsIndoorLevelPicker={false}
        showsMyLocationButton={false}
        style={StyleSheet.absoluteFill}
        toolbarEnabled={false}
      >
        {currentUserMarker ? (
          <NativeMarker coordinate={currentUserMarker} identifier="current-user">
            <AvatarMarker
              initials={currentUserMarker.initials || 'You'}
              isCurrentUser
              photoUri={currentUserMarker.profilePhoto}
            />
          </NativeMarker>
        ) : null}

        {helperMarkers.map((helper) => (
          <NativeMarker
            coordinate={helper.coordinate}
            identifier={helper.id}
            key={helper.id}
          >
            <AvatarMarker initials={helper.initials || helper.fullName} photoUri={helper.profilePhoto} />
          </NativeMarker>
        ))}
      </NativeMapView>

      <View style={[styles.controls, { bottom: floatingBottomInset, top: 'auto' }]}>
        <Pressable accessibilityRole="button" onPress={() => zoom(0.75)} style={styles.controlButton}>
          <Ionicons color={colors.text} name="add" size={18} />
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => zoom(1.25)} style={styles.controlButton}>
          <Ionicons color={colors.text} name="remove" size={18} />
        </Pressable>
        <Pressable accessibilityRole="button" onPress={recenter} style={styles.controlButton}>
          <Ionicons color={colors.text} name="locate" size={18} />
        </Pressable>
      </View>

      <View style={[styles.legend, { bottom: floatingBottomInset }]}>
        <Text style={styles.legendTitle}>{legendTitle}</Text>
        <Text style={styles.legendCopy}>{legendCopy}</Text>
      </View>
    </View>
  );
}

const MAP_STYLE = [
  {
    featureType: 'poi.business',
    stylers: [{ visibility: 'off' }],
  },
  {
    featureType: 'transit',
    stylers: [{ visibility: 'off' }],
  },
];

const styles = StyleSheet.create({
  map: {
    backgroundColor: '#e7f1ec',
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
  markerAvatar: {
    alignItems: 'center',
    backgroundColor: colors.brand,
    borderColor: '#ffffff',
    borderRadius: 999,
    borderWidth: 3,
    height: 34,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 34,
  },
  markerAvatarCurrent: {
    backgroundColor: '#2563eb',
  },
  markerImage: {
    height: '100%',
    width: '100%',
  },
  markerInitials: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '900',
  },
  markerPin: {
    backgroundColor: colors.brand,
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
    borderTopLeftRadius: 2,
    borderTopRightRadius: 2,
    height: 14,
    marginTop: -2,
    transform: [{ rotate: '45deg' }],
    width: 14,
  },
  markerPinCurrent: {
    backgroundColor: '#2563eb',
  },
  controls: {
    gap: 8,
    position: 'absolute',
    right: 16,
  },
  controlButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderColor: 'rgba(15,23,42,0.08)',
    borderRadius: 16,
    borderWidth: 1,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  legend: {
    backgroundColor: 'rgba(255,255,255,0.94)',
    borderColor: 'rgba(15,23,42,0.08)',
    borderRadius: 20,
    borderWidth: 1,
    left: 16,
    maxWidth: 240,
    paddingHorizontal: 14,
    paddingVertical: 12,
    position: 'absolute',
  },
  legendTitle: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '900',
  },
  legendCopy: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 4,
  },
});
