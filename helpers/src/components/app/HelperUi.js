import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors } from '../../theme/colors';

export function Screen({ eyebrow = 'Helper', title, description, footerAction, children }) {
  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>{eyebrow}</Text>
        <Text style={styles.title}>{title}</Text>
        {description ? <Text style={styles.description}>{description}</Text> : null}
        {footerAction ? <View style={styles.heroAction}>{footerAction}</View> : null}
      </View>
      {children}
    </ScrollView>
  );
}

export function Card({ children, style }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function SectionHeading({ title, subtitle, action }) {
  return (
    <View style={styles.sectionHeading}>
      <View style={styles.sectionHeadingCopy}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}
      </View>
      {action || null}
    </View>
  );
}

export function StatusBadge({ label, tone = 'neutral' }) {
  return (
    <View style={[styles.badge, badgeTones[tone] || badgeTones.neutral]}>
      <Text style={[styles.badgeLabel, badgeLabelTones[tone] || badgeLabelTones.neutral]}>{label}</Text>
    </View>
  );
}

export function ActionButton({ label, onPress, tone = 'primary', disabled = false }) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.button,
        buttonTones[tone] || buttonTones.primary,
        disabled && styles.buttonDisabled,
      ]}
    >
      <Text style={[styles.buttonLabel, buttonLabelTones[tone] || buttonLabelTones.primary]}>{label}</Text>
    </Pressable>
  );
}

export function MetricCard({ label, value, helper, accent = 'default' }) {
  return (
    <View style={[styles.metricCard, accentStyles[accent] || accentStyles.default]}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
      {helper ? <Text style={styles.metricHelper}>{helper}</Text> : null}
    </View>
  );
}

export function EmptyState({ title, description }) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyDescription}>{description}</Text>
    </View>
  );
}

const badgeTones = StyleSheet.create({
  neutral: {
    backgroundColor: '#f1f5f9',
    borderColor: '#cbd5e1',
  },
  success: {
    backgroundColor: '#dcfce7',
    borderColor: '#86efac',
  },
  warning: {
    backgroundColor: '#fef3c7',
    borderColor: '#fcd34d',
  },
  info: {
    backgroundColor: '#fdf2f8',
    borderColor: '#f9a8d4',
  },
  danger: {
    backgroundColor: '#fee2e2',
    borderColor: '#fca5a5',
  },
});

const badgeLabelTones = StyleSheet.create({
  neutral: { color: '#475569' },
  success: { color: '#166534' },
  warning: { color: '#92400e' },
  info: { color: colors.brandDark },
  danger: { color: '#b91c1c' },
});

const buttonTones = StyleSheet.create({
  primary: {
    backgroundColor: colors.brand,
    borderColor: colors.brand,
  },
  secondary: {
    backgroundColor: '#ffffff',
    borderColor: colors.border,
  },
  danger: {
    backgroundColor: '#ffffff',
    borderColor: '#fca5a5',
  },
});

const buttonLabelTones = StyleSheet.create({
  primary: { color: '#ffffff' },
  secondary: { color: colors.text },
  danger: { color: '#b91c1c' },
});

const accentStyles = StyleSheet.create({
  default: { backgroundColor: '#ffffff' },
  success: { backgroundColor: '#f0fdf4', borderColor: '#86efac' },
  muted: { backgroundColor: '#f8fafc' },
});

const styles = StyleSheet.create({
  screen: {
    gap: 16,
    padding: 16,
    paddingBottom: 32,
  },
  hero: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 28,
    borderWidth: 1,
    gap: 10,
    padding: 20,
  },
  heroAction: {
    marginTop: 4,
  },
  eyebrow: {
    color: colors.brandDark,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  title: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '900',
  },
  description: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 21,
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 24,
    borderWidth: 1,
    gap: 14,
    padding: 16,
  },
  sectionHeading: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  sectionHeadingCopy: {
    flex: 1,
    gap: 4,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '900',
  },
  sectionSubtitle: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
  },
  badge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  badgeLabel: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  button: {
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  buttonDisabled: {
    opacity: 0.55,
  },
  buttonLabel: {
    fontSize: 13,
    fontWeight: '800',
  },
  metricCard: {
    borderColor: colors.border,
    borderRadius: 20,
    borderWidth: 1,
    gap: 6,
    padding: 16,
  },
  metricLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  metricValue: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '900',
  },
  metricHelper: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
  },
  empty: {
    backgroundColor: '#f8fafc',
    borderColor: colors.border,
    borderRadius: 20,
    borderWidth: 1,
    gap: 6,
    padding: 16,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '800',
  },
  emptyDescription: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
  },
});
