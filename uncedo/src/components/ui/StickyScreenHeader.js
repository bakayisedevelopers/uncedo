import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GlassSurface } from './GlassSurface';
import { colors } from '../../theme/colors';

export function StickyScreenHeader({
  title,
  subtitle = '',
  backLabel = 'Back',
  onBack,
  children,
  style,
}) {
  return (
    <GlassSurface style={[styles.container, style]}>
      {onBack ? (
        <Pressable accessibilityRole="button" onPress={onBack} style={({ pressed }) => [styles.backButton, pressed && styles.backButtonPressed]}>
          <Ionicons color={colors.brandDark} name="chevron-back" size={18} />
          <Text style={styles.backText}>{backLabel}</Text>
        </Pressable>
      ) : null}

      <View style={styles.headerCopy}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>

      {children ? <View style={styles.children}>{children}</View> : null}
    </GlassSurface>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 14,
    zIndex: 20,
  },
  backButton: {
    alignSelf: 'flex-start',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.42)',
    borderColor: 'rgba(255,255,255,0.72)',
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  backButtonPressed: {
    opacity: 0.7,
    transform: [{ scale: 0.98 }],
  },
  backText: {
    color: colors.brandDark,
    fontSize: 13,
    fontWeight: '800',
  },
  headerCopy: {
    gap: 4,
  },
  title: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '900',
  },
  subtitle: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
  },
  children: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
});
