import { StyleSheet } from 'react-native';
import { GlassSurface } from './GlassSurface';
import { shadows } from '../../theme/shadows';

export function Card({ children, style }) {
  return <GlassSurface style={[styles.card, style]}>{children}</GlassSurface>;
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 28,
    padding: 16,
    ...shadows.panel,
  },
});
