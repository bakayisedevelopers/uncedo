import { Image, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GOOGLE_MAPS_API_KEY } from '../../constants/runtimeConfig';
import { colors } from '../../theme/colors';

const DEFAULT_CENTER = {
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

function clampZoom(zoom) {
  return Math.max(3, Math.min(18, Math.round(zoom)));
}

function getNearbyZoomLevel() {
  return 12;
}

function buildMarkerParam(coordinate) {
  return `color:0x2563eb|size:mid|${coordinate.latitude},${coordinate.longitude}`;
}

function buildStaticMapUrl(coordinate) {
  const center = coordinate || DEFAULT_CENTER;
  const params = new URLSearchParams({
    center: `${center.latitude},${center.longitude}`,
    zoom: String(clampZoom(getNearbyZoomLevel())),
    size: '640x640',
    scale: '2',
    maptype: 'roadmap',
    key: GOOGLE_MAPS_API_KEY,
  });

  if (coordinate) {
    params.append('markers', buildMarkerParam(coordinate));
  }

  return `https://maps.googleapis.com/maps/api/staticmap?${params.toString()}`;
}

export function CustomerHomeStaticMap({
  currentUserMarker = null,
}) {
  const coordinate = normalizeCoordinate(currentUserMarker);
  const hasKey = Boolean(GOOGLE_MAPS_API_KEY);
  const mapUri = hasKey ? buildStaticMapUrl(coordinate) : '';

  if (!hasKey) {
    return (
      <View style={styles.map}>
        <View style={styles.placeholder}>
          <Ionicons color={colors.brandDark} name="map-outline" size={28} />
          <Text style={styles.placeholderTitle}>Map preview unavailable.</Text>
          <Text style={styles.placeholderCopy}>Google Maps API key is missing for the home map.</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.map}>
      <Image source={{ uri: mapUri }} style={styles.image} />
    </View>
  );
}

const styles = StyleSheet.create({
  map: {
    backgroundColor: '#fdf2f8',
    flex: 1,
    overflow: 'hidden',
  },
  image: {
    ...StyleSheet.absoluteFillObject,
  },
  placeholder: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  placeholderTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '800',
    marginTop: 12,
    textAlign: 'center',
  },
  placeholderCopy: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 20,
    marginTop: 8,
    textAlign: 'center',
  },
});
