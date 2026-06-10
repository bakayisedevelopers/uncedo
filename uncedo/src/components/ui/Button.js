import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../../theme/colors';

export function Button({
  children,
  onPress,
  disabled = false,
  variant = 'primary',
  style,
  icon = null,
  iconPosition = 'left',
  textStyle,
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        variant === 'secondary' ? styles.secondary : styles.primary,
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
        style,
      ]}
    >
      <View style={[styles.content, iconPosition === 'right' && styles.contentReverse]}>
        {icon ? <View style={styles.iconWrap}>{icon}</View> : null}
        <Text style={[styles.text, variant === 'secondary' && styles.secondaryText, textStyle]}>
          {children}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    paddingHorizontal: 16,
  },
  primary: {
    backgroundColor: colors.brand,
  },
  secondary: {
    backgroundColor: 'rgba(16,185,129,0.1)',
    borderColor: 'rgba(16,185,129,0.3)',
    borderWidth: 1,
  },
  disabled: {
    opacity: 0.55,
  },
  pressed: {
    transform: [{ scale: 0.99 }],
  },
  content: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
  },
  contentReverse: {
    flexDirection: 'row-reverse',
  },
  iconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  secondaryText: {
    color: colors.brand,
  },
});
