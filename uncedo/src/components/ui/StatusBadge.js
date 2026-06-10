import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../../theme/colors';

const toneMap = {
  success: { backgroundColor: '#dcfce7', color: colors.success },
  warning: { backgroundColor: '#fef3c7', color: colors.warning },
  danger: { backgroundColor: '#fee2e2', color: colors.danger },
  info: { backgroundColor: '#e0f2fe', color: colors.cyan },
};

export function StatusBadge({ label, tone = 'info' }) {
  const palette = toneMap[tone] || toneMap.info;
  return (
    <View style={[styles.badge, { backgroundColor: palette.backgroundColor }]}>
      <Text style={[styles.text, { color: palette.color }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  text: {
    fontSize: 12,
    fontWeight: '800',
  },
});
