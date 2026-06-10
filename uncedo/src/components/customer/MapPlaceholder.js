import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function MapPlaceholder({
  markers = [],
  zoom = 1,
  offset = { x: 0, y: 0 },
  onZoomIn,
  onZoomOut,
  onPan,
}) {
  return (
    <View style={styles.map}>
      <View style={styles.grid} />
      <View style={styles.roadPrimary} />
      <View style={styles.roadSecondary} />
      <View style={styles.parkOne} />
      <View style={styles.parkTwo} />

      {markers.map((marker) => {
        const left = clamp(marker.x + (offset.x * 0.18 * zoom), 8, 86);
        const top = clamp(marker.y + (offset.y * 0.18 * zoom), 10, 84);
        return (
          <View
            key={marker.id}
            style={[
              styles.markerWrap,
              {
                left: `${left}%`,
                top: `${top}%`,
                transform: [{ scale: clamp(zoom, 0.88, 1.28) }],
              },
            ]}
          >
            <View style={styles.markerDot}>
              <Ionicons name="person" color="#ffffff" size={12} />
            </View>
            <View style={styles.markerLabel}>
              <Text numberOfLines={1} style={styles.markerName}>{marker.name}</Text>
              <Text numberOfLines={1} style={styles.markerMeta}>{marker.category}</Text>
            </View>
          </View>
        );
      })}

      <View style={styles.controls}>
        <View style={styles.zoomControls}>
          <Pressable accessibilityRole="button" onPress={onZoomIn} style={styles.controlButton}>
            <Ionicons color={colors.text} name="add" size={18} />
          </Pressable>
          <Pressable accessibilityRole="button" onPress={onZoomOut} style={styles.controlButton}>
            <Ionicons color={colors.text} name="remove" size={18} />
          </Pressable>
        </View>

        <View style={styles.panControls}>
          <Pressable accessibilityRole="button" onPress={() => onPan?.(0, -12)} style={styles.controlButton}>
            <Ionicons color={colors.text} name="chevron-up" size={18} />
          </Pressable>
          <View style={styles.panRow}>
            <Pressable accessibilityRole="button" onPress={() => onPan?.(-12, 0)} style={styles.controlButton}>
              <Ionicons color={colors.text} name="chevron-back" size={18} />
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => onPan?.(12, 0)} style={styles.controlButton}>
              <Ionicons color={colors.text} name="chevron-forward" size={18} />
            </Pressable>
          </View>
          <Pressable accessibilityRole="button" onPress={() => onPan?.(0, 12)} style={styles.controlButton}>
            <Ionicons color={colors.text} name="chevron-down" size={18} />
          </Pressable>
        </View>
      </View>

      <View style={styles.legend}>
        <Text style={styles.legendTitle}>Nearby helpers</Text>
        <Text style={styles.legendCopy}>Placeholder map markers until live provider locations are connected.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  map: {
    backgroundColor: '#e7f1ec',
    flex: 1,
    overflow: 'hidden',
  },
  grid: {
    ...StyleSheet.absoluteFillObject,
    borderColor: 'rgba(15,23,42,0.04)',
    borderWidth: 12,
  },
  roadPrimary: {
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius: 999,
    height: 18,
    left: '-12%',
    position: 'absolute',
    top: '40%',
    transform: [{ rotate: '-12deg' }],
    width: '132%',
  },
  roadSecondary: {
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius: 999,
    height: 18,
    position: 'absolute',
    right: '-24%',
    top: '58%',
    transform: [{ rotate: '72deg' }],
    width: '92%',
  },
  parkOne: {
    backgroundColor: '#ccefd6',
    borderRadius: 28,
    height: 140,
    left: '8%',
    position: 'absolute',
    top: '14%',
    width: 110,
  },
  parkTwo: {
    backgroundColor: '#d3f2de',
    borderRadius: 999,
    bottom: '14%',
    height: 180,
    position: 'absolute',
    right: '-4%',
    width: 180,
  },
  markerWrap: {
    position: 'absolute',
  },
  markerDot: {
    alignItems: 'center',
    backgroundColor: colors.brand,
    borderColor: '#ffffff',
    borderRadius: 999,
    borderWidth: 3,
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  markerLabel: {
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderColor: 'rgba(15,23,42,0.08)',
    borderRadius: 14,
    borderWidth: 1,
    gap: 2,
    marginTop: 6,
    maxWidth: 112,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  markerName: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '800',
  },
  markerMeta: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: '700',
  },
  controls: {
    gap: 12,
    position: 'absolute',
    right: 16,
    top: 110,
  },
  zoomControls: {
    gap: 8,
  },
  panControls: {
    alignItems: 'center',
    gap: 8,
  },
  panRow: {
    flexDirection: 'row',
    gap: 8,
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
    bottom: 186,
    left: 16,
    maxWidth: 220,
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
