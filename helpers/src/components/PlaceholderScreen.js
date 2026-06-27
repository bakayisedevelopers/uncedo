import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';

export function PlaceholderScreen({ actions = [], description, eyebrow, title }) {
  return (
    <ScrollView contentContainerStyle={styles.wrap}>
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>{eyebrow}</Text>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.description}>{description}</Text>
      </View>

      <View style={styles.actions}>
        {actions.map((action) => (
          <Pressable key={action.label} accessibilityRole="button" onPress={action.onPress} style={styles.action}>
            <Text style={styles.actionLabel}>{action.label}</Text>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 16,
    padding: 20,
  },
  hero: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 24,
    borderWidth: 1,
    gap: 10,
    padding: 20,
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
    lineHeight: 22,
  },
  actions: {
    gap: 10,
  },
  action: {
    backgroundColor: '#e6fffb',
    borderColor: '#99f6e4',
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  actionLabel: {
    color: colors.brandDark,
    fontSize: 14,
    fontWeight: '800',
  },
});
