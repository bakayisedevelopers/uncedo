import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { HelperMapPlaceholder } from './HelperMapPlaceholder';
import { colors } from '../../theme/colors';

let lastKnownHomeMarker = null;

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
      <HelperMapPlaceholder
        currentUserMarker={displayMarker}
        floatingBottomInset={18}
        interactive
        radiusKm={radiusKm}
        showControls
        zoomPaddingMultiplier={1.55}
      />

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
});
