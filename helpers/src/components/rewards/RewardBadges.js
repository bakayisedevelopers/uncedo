import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../../theme/colors';
import { getMasteryDisplayMeta, getMembershipDisplayMeta } from '../../services/rewards/rewardPresentation';

const PALETTE = {
  neutral: {
    backgroundColor: '#f8fafc',
    borderColor: '#cbd5e1',
    textColor: '#475569',
    accentColor: '#94a3b8',
  },
  info: {
    backgroundColor: '#fdf2f8',
    borderColor: '#f9a8d4',
    textColor: colors.brandDark,
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
  danger: {
    backgroundColor: '#fff1f2',
    borderColor: '#fecdd3',
    textColor: '#be123c',
    accentColor: '#f43f5e',
  },
};

function BaseBadge({
  title,
  subtitle = '',
  tone = 'neutral',
  variant = 'compact',
  accessibilityLabel,
}) {
  const palette = PALETTE[tone] || PALETTE.neutral;

  return (
    <View
      accessibilityLabel={accessibilityLabel}
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
        <Text style={[styles.title, { color: palette.textColor }]}>{title}</Text>
        {variant === 'expanded' && subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
    </View>
  );
}

export function MembershipBadge({
  level,
  variant = 'compact',
  restricted = false,
  subtitle = 'Helper membership',
}) {
  const meta = getMembershipDisplayMeta(level);
  return (
    <BaseBadge
      accessibilityLabel={`${meta.label} membership${restricted ? ', standing review required' : ''}`}
      subtitle={restricted ? 'Standing review required' : subtitle}
      title={meta.label}
      tone={restricted ? 'danger' : meta.tone}
      variant={variant}
    />
  );
}

export function MasteryBadge({
  level,
  variant = 'compact',
  subtitle = 'Service mastery',
}) {
  const meta = getMasteryDisplayMeta(level);
  return (
    <BaseBadge
      accessibilityLabel={`${meta.label} service mastery`}
      subtitle={subtitle}
      title={meta.label}
      tone={meta.tone}
      variant={variant}
    />
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
  title: {
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
