import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../../../theme/colors';
import { getMembershipDisplayMeta } from '../../../services/rewards/rewardPresentation';

const PALETTE = {
  surface: {
    backgroundColor: '#f5f3ff',
    borderColor: '#ddd6fe',
    textColor: '#5b21b6',
    accentColor: '#8b5cf6',
  },
  brand: {
    backgroundColor: colors.brandSoft,
    borderColor: '#d9f99d',
    textColor: '#3f6212',
    accentColor: colors.brand,
  },
  indigo: {
    backgroundColor: '#eef2ff',
    borderColor: '#c7d2fe',
    textColor: '#4338ca',
    accentColor: '#6366f1',
  },
  gold: {
    backgroundColor: '#fff7ed',
    borderColor: '#fdba74',
    textColor: '#c2410c',
    accentColor: '#fb923c',
  },
};

export function MembershipBadge({
  level,
  variant = 'compact',
  subtitle = '',
  restricted = false,
  loading = false,
}) {
  const meta = getMembershipDisplayMeta(level);
  const palette = PALETTE[meta.tone] || PALETTE.surface;

  return (
    <View
      accessibilityLabel={`${meta.label} membership${restricted ? ', account standing review required' : ''}`}
      style={[
        styles.badge,
        variant === 'expanded' && styles.badgeExpanded,
        {
          backgroundColor: palette.backgroundColor,
          borderColor: palette.borderColor,
        },
      ]}
    >
      <View style={[styles.dot, { backgroundColor: palette.accentColor }]} />
      <View style={styles.copy}>
        <Text style={[styles.label, { color: palette.textColor }]}>
          {loading ? 'Loading membership' : meta.label}
        </Text>
        {variant === 'expanded' ? (
          <Text style={styles.subtitle}>
            {restricted ? 'Standing review required' : subtitle || 'Customer membership'}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    minHeight: 34,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  badgeExpanded: {
    borderRadius: 18,
    minHeight: 54,
    paddingRight: 16,
  },
  dot: {
    borderRadius: 999,
    height: 10,
    width: 10,
  },
  copy: {
    gap: 2,
  },
  label: {
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.2,
  },
  subtitle: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '600',
  },
});

