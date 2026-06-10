import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../../theme/colors';

export function ProviderLoginScreen({ onContinue }) {
  return (
    <View style={styles.wrap}>
      <View style={styles.card}>
        <Text style={styles.eyebrow}>Uncedo Helpers</Text>
        <Text style={styles.title}>Helper app preview</Text>
        <Text style={styles.copy}>
          This build now mirrors the tutor flow structure from the web app, but translated into helper logic: services, skills, work photos, completed jobs, and payment tracking.
        </Text>
        <Pressable accessibilityRole="button" onPress={onContinue} style={styles.button}>
          <Text style={styles.buttonText}>Enter helper app</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 28,
    borderWidth: 1,
    gap: 12,
    maxWidth: 420,
    padding: 22,
    width: '100%',
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
  copy: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 22,
  },
  button: {
    alignItems: 'center',
    backgroundColor: colors.brand,
    borderRadius: 18,
    paddingVertical: 14,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800',
  },
});
