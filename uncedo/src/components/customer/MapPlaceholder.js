import { useEffect, useMemo, useRef, useState } from 'react';
import { Image, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GOOGLE_MAPS_API_KEY } from '../../constants/runtimeConfig';
import { colors } from '../../theme/colors';

let NativeMapView = null;
let NativeMarker = null;
let NativePolyline = null;
let PROVIDER_GOOGLE = null;

if (Platform.OS !== 'web') {
  try {
    const maps = require('react-native-maps');
    NativeMapView = maps.default;
    NativeMarker = maps.Marker;
    NativePolyline = maps.Polyline;
    PROVIDER_GOOGLE = maps.PROVIDER_GOOGLE;
  } catch (error) {
    NativeMapView = null;
    NativeMarker = null;
    NativePolyline = null;
    PROVIDER_GOOGLE = null;
  }
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

function normalizeCoordinate(coordinate = null) {
  const latitude = Number(coordinate?.latitude);
  const longitude = Number(coordinate?.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  return { latitude, longitude };
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

function buildRouteKey(origin, destination) {
  if (!origin || !destination) return '';
  return [
    origin.latitude.toFixed(5),
    origin.longitude.toFixed(5),
    destination.latitude.toFixed(5),
    destination.longitude.toFixed(5),
  ].join(':');
}

function decodePolyline(encoded = '') {
  const points = [];
  let index = 0;
  let latitude = 0;
  let longitude = 0;

  while (index < encoded.length) {
    let result = 0;
    let shift = 0;
    let byte = null;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    const deltaLat = (result & 1) ? ~(result >> 1) : (result >> 1);
    latitude += deltaLat;

    result = 0;
    shift = 0;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    const deltaLng = (result & 1) ? ~(result >> 1) : (result >> 1);
    longitude += deltaLng;

    points.push({
      latitude: latitude / 1e5,
      longitude: longitude / 1e5,
    });
  }

  return points;
}

function appendCoordinateIfNeeded(target, coordinate) {
  const last = target[target.length - 1];
  if (
    last
    && Math.abs(last.latitude - coordinate.latitude) < 0.00001
    && Math.abs(last.longitude - coordinate.longitude) < 0.00001
  ) {
    return;
  }

  target.push(coordinate);
}

function extractRouteCoordinates(route = null) {
  const detailedCoordinates = [];
  const steps = route?.legs?.flatMap((leg) => leg?.steps || []) || [];

  steps.forEach((step) => {
    const encodedStepPolyline = step?.polyline?.points || '';
    const decodedPoints = decodePolyline(encodedStepPolyline);
    decodedPoints.forEach((coordinate) => appendCoordinateIfNeeded(detailedCoordinates, coordinate));
  });

  if (detailedCoordinates.length > 1) {
    return detailedCoordinates;
  }

  const overviewPolyline = route?.overview_polyline?.points || '';
  return decodePolyline(overviewPolyline);
}

async function fetchRouteCoordinates(origin, destination) {
  if (!GOOGLE_MAPS_API_KEY || !origin || !destination) {
    return [];
  }

  const params = new URLSearchParams({
    origin: `${origin.latitude},${origin.longitude}`,
    destination: `${destination.latitude},${destination.longitude}`,
    key: GOOGLE_MAPS_API_KEY,
  });

  const response = await fetch(`https://maps.googleapis.com/maps/api/directions/json?${params.toString()}`);
  const payload = await response.json().catch(() => ({}));

  if (!response.ok || payload?.status !== 'OK') {
    throw new Error(payload?.error_message || 'Unable to load route directions.');
  }

  return extractRouteCoordinates(payload?.routes?.[0] || null);
}

function AvatarMarker({ initials, photoUri, isCurrentUser = false, heading = null }) {
  return (
    <View style={styles.markerRoot}>
      <View style={[styles.markerAvatar, isCurrentUser && styles.markerAvatarCurrent]}>
        {photoUri ? (
          <Image source={{ uri: photoUri }} style={styles.markerImage} />
        ) : (
          <Text style={styles.markerInitials}>{getInitials(initials)}</Text>
        )}
      </View>
      {!isCurrentUser && typeof heading === 'number' ? (
        <View style={[styles.directionArrowContainer, { transform: [{ rotate: `${heading}deg` }] }]}>
          <Ionicons name="navigation" size={16} color={colors.brand} style={{ transform: [{ rotate: '45deg' }] }} />
        </View>
      ) : (
        <View style={[styles.markerPin, isCurrentUser && styles.markerPinCurrent]} />
      )}
    </View>
  );
}

export function MapPlaceholder({
  currentUserMarker = null,
  helperMarkers = [],
  floatingBottomInset = 196,
  controlBottomInset = null,
  mapPadding = null,
  radiusKm = 20,
  errorMessage = '',
  mode = 'nearby',
}) {
  const customerCoordinate = useMemo(() => normalizeCoordinate(currentUserMarker), [currentUserMarker]);
  const firstHelper = helperMarkers[0] || null;
  const helperCoordinate = useMemo(
    () => normalizeCoordinate(firstHelper?.coordinate),
    [firstHelper?.coordinate],
  );
  const mapCenter = customerCoordinate || helperCoordinate || DEFAULT_REGION;
  const [region, setRegion] = useState(() => buildRegion(mapCenter, radiusKm));
  const [routeCoordinates, setRouteCoordinates] = useState([]);
  const [routeError, setRouteError] = useState('');
  const mapRef = useRef(null);
  const didInitialFitRef = useRef(false);
  const lastRouteKeyRef = useRef('');

  const routeKey = mode === 'route' ? buildRouteKey(helperCoordinate, customerCoordinate) : '';

  useEffect(() => {
    let active = true;

    if (mode !== 'route') {
      setRouteCoordinates([]);
      setRouteError('');
      lastRouteKeyRef.current = '';
      return () => {
        active = false;
      };
    }

    if (!routeKey) {
      setRouteCoordinates([]);
      setRouteError('');
      lastRouteKeyRef.current = '';
      return () => {
        active = false;
      };
    }

    if (routeKey === lastRouteKeyRef.current) {
      return () => {
        active = false;
      };
    }

    lastRouteKeyRef.current = routeKey;

    fetchRouteCoordinates(helperCoordinate, customerCoordinate)
      .then((coordinates) => {
        if (!active) return;
        setRouteCoordinates(coordinates);
        setRouteError('');
      })
      .catch((error) => {
        if (!active) return;
        setRouteCoordinates([]);
        setRouteError(error.message || 'Unable to load route directions.');
      });

    return () => {
      active = false;
    };
  }, [customerCoordinate, helperCoordinate, mode, routeKey]);

  useEffect(() => {
    if (!mapRef.current) return;

    if (!customerCoordinate && !helperCoordinate) {
      didInitialFitRef.current = false;
      return;
    }

    if (mode === 'nearby') {
      const coords = [customerCoordinate, helperCoordinate].filter(Boolean);
      if (coords.length === 1) {
        const next = buildRegion(coords[0], radiusKm);
        setRegion(next);
        mapRef.current.animateToRegion?.(next, 350);
      } else if (coords.length > 1) {
        const timer = setTimeout(() => {
          mapRef.current?.fitToCoordinates?.(coords, {
            edgePadding: { top: 100, right: 80, bottom: floatingBottomInset + 100, left: 80 },
            animated: true,
          });
        }, 500);
        return () => clearTimeout(timer);
      }
      return;
    }

    if (didInitialFitRef.current) return;

    const coords = routeCoordinates.length > 1
      ? routeCoordinates
      : [helperCoordinate, customerCoordinate].filter(Boolean);

    if (!coords.length) return;

    didInitialFitRef.current = true;
    if (coords.length === 1) {
      const next = buildRegion(coords[0], 5);
      setRegion(next);
      mapRef.current.animateToRegion?.(next, 350);
      return;
    }

    const timer = setTimeout(() => {
      mapRef.current?.fitToCoordinates?.(coords, {
        edgePadding: { top: 120, right: 80, bottom: floatingBottomInset + 120, left: 80 },
        animated: true,
      });
    }, 250);

    return () => clearTimeout(timer);
  }, [customerCoordinate, floatingBottomInset, helperCoordinate, mode, radiusKm, routeCoordinates]);

  const recenter = () => {
    const coords = mode === 'route' && routeCoordinates.length > 1
      ? routeCoordinates
      : [helperCoordinate, customerCoordinate].filter(Boolean);

    if (!coords.length) {
      const next = buildRegion(mapCenter, radiusKm);
      setRegion(next);
      mapRef.current?.animateToRegion?.(next, 350);
      return;
    }

    if (coords.length === 1) {
      const next = buildRegion(coords[0], mode === 'route' ? 5 : radiusKm);
      setRegion(next);
      mapRef.current?.animateToRegion?.(next, 350);
      return;
    }

    mapRef.current?.fitToCoordinates?.(coords, {
      edgePadding: { top: 120, right: 80, bottom: floatingBottomInset + 120, left: 80 },
      animated: true,
    });
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

  const fallbackLine = helperCoordinate && customerCoordinate
    ? [helperCoordinate, customerCoordinate]
    : [];

  const legendCopy = errorMessage
    || routeError
    || (mode === 'route'
      ? 'Showing the helper route to your destination.'
      : (currentUserMarker
        ? `Showing helpers within ${radiusKm} km of your current location.`
        : 'Allow location access to see your position and nearby helpers.'));

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
        customMapStyle={MAP_STYLE}
        initialRegion={region}
        onRegionChangeComplete={setRegion}
        provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
        region={region}
        mapPadding={mapPadding || { top: 80, right: 24, bottom: floatingBottomInset + 56, left: 24 }}
        showsBuildings
        showsCompass={false}
        showsIndoorLevelPicker={false}
        showsMyLocationButton={false}
        style={StyleSheet.absoluteFill}
        toolbarEnabled={false}
      >
        {customerCoordinate ? (
          <NativeMarker coordinate={customerCoordinate} identifier="current-user">
            <AvatarMarker
              initials={currentUserMarker?.initials || 'You'}
              isCurrentUser
              photoUri={currentUserMarker?.profilePhoto}
            />
          </NativeMarker>
        ) : null}

        {helperMarkers.map((helper) => {
          const normalized = normalizeCoordinate(helper.coordinate);
          if (!normalized) return null;

          return (
            <NativeMarker
              coordinate={normalized}
              identifier={helper.id}
              key={helper.id}
            >
              <AvatarMarker
                initials={helper.initials || helper.fullName}
                photoUri={helper.profilePhoto}
                heading={helper.heading}
              />
            </NativeMarker>
          );
        })}

        {mode === 'nearby' && customerCoordinate && helperMarkers.length > 0 && NativePolyline && helperCoordinate ? (
          <NativePolyline
            coordinates={[customerCoordinate, helperCoordinate]}
            strokeColor={colors.brand}
            strokeWidth={3}
            lineDashPattern={[6, 3]}
          />
        ) : null}

        {mode === 'route' && NativePolyline && routeCoordinates.length > 1 ? (
          <NativePolyline
            coordinates={routeCoordinates}
            strokeColor={colors.brand}
            strokeWidth={5}
            lineCap="round"
            lineJoin="round"
          />
        ) : null}

        {mode === 'route' && NativePolyline && routeCoordinates.length <= 1 && fallbackLine.length === 2 ? (
          <NativePolyline
            coordinates={fallbackLine}
            strokeColor={colors.brand}
            strokeWidth={4}
          />
        ) : null}
      </NativeMapView>

      <View style={[styles.controls, { bottom: controlBottomInset ?? floatingBottomInset, top: 'auto' }]}>
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
  directionArrowContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    width: 24,
    height: 24,
    borderWidth: 2,
    borderColor: colors.brand,
    marginTop: -2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 3,
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
});
