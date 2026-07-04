import { StyleSheet, View } from 'react-native';
import { colors } from '../../theme/colors';
import { shadows } from '../../theme/shadows';

export function Card({ children, style }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 28,
    borderWidth: 1,
    padding: 16,
    ...shadows.panel,
  },
});
