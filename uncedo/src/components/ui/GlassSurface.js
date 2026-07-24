import { BlurView } from 'expo-blur';
import { Platform, StyleSheet, View } from 'react-native';

/**
 * A shared frosted surface for elevated app chrome and content containers.
 * The translucent fill and highlight remain visible on platforms where the
 * native blur implementation is unavailable.
 */
export function GlassSurface({ children, style, intensity = 42, tint = 'light' }) {
  return (
    <View style={[styles.surface, style]}>
      <BlurView
        intensity={Platform.OS === 'android' ? Math.min(intensity, 32) : intensity}
        pointerEvents="none"
        style={StyleSheet.absoluteFill}
        tint={tint}
      />
      <View pointerEvents="none" style={styles.highlight} />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  surface: {
    backgroundColor: 'rgba(255,255,255,0.56)',
    borderColor: 'rgba(255,255,255,0.76)',
    borderWidth: 1,
    overflow: 'hidden',
  },
  highlight: {
    backgroundColor: 'rgba(255,255,255,0.20)',
    height: 1,
    left: 1,
    position: 'absolute',
    right: 1,
    top: 0,
  },
});
