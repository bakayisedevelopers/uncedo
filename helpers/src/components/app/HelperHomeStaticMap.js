import { useMemo, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GOOGLE_MAPS_API_KEY } from '../../constants/runtimeConfig';
import { colors } from '../../theme/colors';

const DEFAULT_CENTER = {
  latitude: -26.2041,
  longitude: 28.0473,
};
const STATIC_MAP_STYLE_VERSION = 'marker-magenta-v3';

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

function getRadiusZoomLevel(radiusKm) {
  const latitudeDelta = Math.max(0.015, ((radiusKm * 2 * 1.15) / 111));
  return Math.log2(360 / latitudeDelta);
}

function buildMarkerParam(coordinate) {
  return `color:0xd946ef|size:mid|${coordinate.latitude},${coordinate.longitude}`;
}

function buildCirclePath(center, radiusKm, pointCount = 40) {
  const points = [];
  const radiusLatitude = radiusKm / 111;
  const radiusLongitude = radiusKm / (111 * Math.max(Math.cos((center.latitude * Math.PI) / 180), 0.2));

  for (let index = 0; index <= pointCount; index += 1) {
    const angle = (index / pointCount) * Math.PI * 2;
    const latitude = center.latitude + (radiusLatitude * Math.sin(angle));
    const longitude = center.longitude + (radiusLongitude * Math.cos(angle));
    points.push(`${latitude},${longitude}`);
  }

  return `fillcolor:0xD946EF18|color:0xD946EF88|weight:2|${points.join('|')}`;
}

function buildStaticMapUrl(coordinate, radiusKm) {
  const center = coordinate || DEFAULT_CENTER;
  const params = new URLSearchParams({
    center: `${center.latitude},${center.longitude}`,
    zoom: String(clampZoom(getRadiusZoomLevel(radiusKm))),
    size: '640x640',
    scale: '2',
    maptype: 'roadmap',
    key: GOOGLE_MAPS_API_KEY,
    v: STATIC_MAP_STYLE_VERSION,
  });

  if (coordinate) {
    params.append('markers', buildMarkerParam(coordinate));
    params.append('path', buildCirclePath(coordinate, radiusKm));
  }

  return `https://maps.googleapis.com/maps/api/staticmap?${params.toString()}`;
}

export function HelperHomeStaticMap({
  currentUserMarker = null,
  radiusKm = 50,
}) {
  const coordinate = normalizeCoordinate(currentUserMarker);
  const hasKey = Boolean(GOOGLE_MAPS_API_KEY);
  const mapUri = useMemo(
    () => (hasKey ? buildStaticMapUrl(coordinate, radiusKm) : ''),
    [coordinate, hasKey, radiusKm],
  );
  const [imageLoadFailed, setImageLoadFailed] = useState(false);

  const resetImageFailure = () => {
    if (imageLoadFailed) {
      setImageLoadFailed(false);
    }
  };

  if (!hasKey || imageLoadFailed) {
    return (
      <View style={styles.map}>
        <View style={styles.placeholder}>
          <Ionicons color={colors.brandDark} name="map-outline" size={28} />
          <Text style={styles.placeholderTitle}>Map preview unavailable.</Text>
          <Text style={styles.placeholderCopy}>
            {hasKey
              ? 'The home map image could not load right now. Check the connection and try again.'
              : 'Google Maps API key is missing for the home map.'}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.map}>
      <Image
        onError={() => setImageLoadFailed(true)}
        onLoadStart={resetImageFailure}
        source={{ uri: mapUri }}
        style={styles.image}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  map: {
    backgroundColor: '#fde7f3',
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
