import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { Image, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GOOGLE_MAPS_API_KEY } from '../../constants/runtimeConfig';
import { colors } from '../../theme/colors';

let NativeMapView = null;
let NativeMarker = null;
let NativeCircle = null;
let NativePolyline = null;
let PROVIDER_GOOGLE = null;

if (Platform.OS !== 'web') {
  try {
    const maps = require('react-native-maps');
    NativeMapView = maps.default;
    NativeMarker = maps.Marker;
    NativeCircle = maps.Circle;
    NativePolyline = maps.Polyline;
    PROVIDER_GOOGLE = maps.PROVIDER_GOOGLE;
  } catch (error) {
    NativeMapView = null;
    NativeMarker = null;
    NativeCircle = null;
    NativePolyline = null;
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
  const latitudeDelta = Math.max(0.03, (radiusKm / 111) * 2.4);
  const longitudeDelta = Math.max(
    0.03,
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
      {isCurrentUser && typeof heading === 'number' ? (
        <View style={[styles.directionArrowContainer, { transform: [{ rotate: `${heading}deg` }] }]}>
          <Ionicons name="navigation" size={16} color={colors.brand} style={{ transform: [{ rotate: '45deg' }] }} />
        </View>
      ) : (
        <View style={[styles.markerPin, isCurrentUser && styles.markerPinCurrent]} />
      )}
    </View>
  );
}

export function HelperMapPlaceholder({
  currentUserMarker = null,
  customerMarkers = [],
  floatingBottomInset = 228,
  controlBottomInset = null,
  mapPadding = null,
  radiusKm = 50,
  isLoading = false,
  errorMessage = '',
  mode = 'nearby',
}) {
  const currentCoordinate = useMemo(() => normalizeCoordinate(currentUserMarker), [currentUserMarker]);
  const firstCustomer = customerMarkers[0] || null;
  const destinationCoordinate = useMemo(
    () => normalizeCoordinate(firstCustomer?.coordinate),
    [firstCustomer?.coordinate],
  );
  const mapCenter = currentCoordinate || destinationCoordinate || DEFAULT_REGION;
  const [region, setRegion] = useState(() => buildRegion(mapCenter, radiusKm));
  const [routeCoordinates, setRouteCoordinates] = useState([]);
  const [routeError, setRouteError] = useState('');
  const mapRef = useRef(null);
  const didInitialFitRef = useRef(false);
  const lastRouteKeyRef = useRef('');

  const routeKey = mode === 'route' ? buildRouteKey(currentCoordinate, destinationCoordinate) : '';
  const helperRadiusMeters = Math.max(1000, Number(radiusKm || 50) * 1000);

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

    fetchRouteCoordinates(currentCoordinate, destinationCoordinate)
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
  }, [currentCoordinate, destinationCoordinate, mode, routeKey]);

  useEffect(() => {
    if (!mapRef.current) return;

    if (!currentCoordinate && !destinationCoordinate) {
      didInitialFitRef.current = false;
      return;
    }

    if (mode === 'nearby') {
      const coords = [];
      if (currentCoordinate) coords.push(currentCoordinate);
      if (destinationCoordinate) coords.push(destinationCoordinate);

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
      : [currentCoordinate, destinationCoordinate].filter(Boolean);

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
  }, [currentCoordinate, destinationCoordinate, floatingBottomInset, mode, radiusKm, routeCoordinates]);

  const recenter = () => {
    const coords = mode === 'route' && routeCoordinates.length > 1
      ? routeCoordinates
      : [currentCoordinate, destinationCoordinate].filter(Boolean);

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
        latitudeDelta: Math.max(0.006, current.latitudeDelta * factor),
        longitudeDelta: Math.max(0.006, current.longitudeDelta * factor),
      };
      mapRef.current?.animateToRegion?.(next, 250);
      return next;
    });
  };

  const fallbackLine = currentCoordinate && destinationCoordinate
    ? [currentCoordinate, destinationCoordinate]
    : [];

  const legendCopy = errorMessage
    || routeError
    || (mode === 'route'
      ? (isLoading ? 'Preparing live route tracking.' : 'Showing the helper route to the customer destination.')
      : (currentUserMarker
        ? `Showing active customers within ${radiusKm} km of your current live location.`
        : 'Allow location access so nearby active customers can appear on the map.'));

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
        showsMyLocationButton={false}
        showsPointsOfInterest={false}
        showsBuildings
        showsCompass={false}
        showsIndoorLevelPicker={false}
        style={StyleSheet.absoluteFill}
        toolbarEnabled={false}
      >
        {mode === 'nearby' && currentCoordinate && NativeCircle ? (
          <NativeCircle
            center={currentCoordinate}
            fillColor="rgba(183, 70, 162, 0.12)"
            strokeColor="rgba(183, 70, 162, 0.28)"
            strokeWidth={1}
            radius={helperRadiusMeters}
          />
        ) : null}

        {currentCoordinate ? (
          <NativeMarker coordinate={currentCoordinate} identifier="current-helper">
            <AvatarMarker
              initials={currentUserMarker?.initials || 'You'}
              isCurrentUser
              photoUri={currentUserMarker?.profilePhoto}
              heading={currentUserMarker?.heading}
            />
          </NativeMarker>
        ) : null}

        {customerMarkers.map((customer) => {
          const customerCoordinate = normalizeCoordinate(customer.coordinate);
          if (!customerCoordinate) return null;

          return (
            <Fragment key={customer.id}>
              {mode === 'nearby' && NativePolyline && currentCoordinate ? (
                <NativePolyline
                  coordinates={[currentCoordinate, customerCoordinate]}
                  strokeColor={colors.brand}
                  strokeWidth={3}
                  lineDashPattern={[6, 3]}
                />
              ) : null}
              <NativeMarker coordinate={customerCoordinate} identifier={customer.id}>
                <AvatarMarker initials={customer.initials || customer.fullName} photoUri={customer.profilePhoto} />
              </NativeMarker>
            </Fragment>
          );
        })}

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
    backgroundColor: '#7c3aed',
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
    backgroundColor: '#7c3aed',
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
    borderColor: 'rgba(31,23,36,0.08)',
    borderRadius: 16,
    borderWidth: 1,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
});
