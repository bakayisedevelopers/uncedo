import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ActionButton, Card } from '../../components/app/HelperUi';
import { colors } from '../../theme/colors';

const LEGAL_LINKS = [
  { href: 'https://uncedo.com/terms', label: 'Terms and Conditions' },
  { href: 'https://uncedo.com/privacy', label: 'Privacy Policy' },
  { href: 'https://uncedo.com/payment-pricing-policy', label: 'Payment and Pricing Policy' },
  { href: 'https://uncedo.com/refund-policy', label: 'Refund Policy' },
  { href: 'https://uncedo.com/data-voice-policy', label: 'Data and Voice Policy' },
];

export function ProviderLegalScreen({ goBack, navigate }) {
  const openLink = (url) => Linking.openURL(url).catch(() => null);

  return (
    <ScrollView contentContainerStyle={styles.wrap} showsVerticalScrollIndicator={false}>
      <Pressable accessibilityRole="button" onPress={() => goBack('Profile')} style={styles.backRow}>
        <Ionicons color={colors.brandDark} name="chevron-back" size={18} />
        <Text style={styles.backText}>Back to profile</Text>
      </Pressable>

      <View style={styles.header}>
        <Text style={styles.title}>Agreement and legal</Text>
        <Text style={styles.copy}>Open the current helper agreement page and the latest platform policy documents.</Text>
      </View>

      <Card style={styles.card}>
        <Text style={styles.sectionTitle}>Helper agreement</Text>
        <Text style={styles.copy}>The agreement remains part of profile completion before you can go online.</Text>
        <ActionButton label="Open helper agreement" onPress={() => navigate({ key: 'Agreement', params: { parentTab: 'Profile' } })} />
      </Card>

      <Card style={styles.card}>
        <Text style={styles.sectionTitle}>Policies</Text>
        <View style={styles.linkList}>
          {LEGAL_LINKS.map((link) => (
            <Pressable key={link.href} accessibilityRole="button" onPress={() => openLink(link.href)} style={styles.linkRow}>
              <Text style={styles.linkText}>{link.label}</Text>
              <Ionicons color={colors.muted} name="open-outline" size={18} />
            </Pressable>
          ))}
        </View>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 16,
    paddingBottom: 32,
  },
  backRow: {
    alignSelf: 'flex-start',
    alignItems: 'center',
    flexDirection: 'row',
    gap: 4,
  },
  backText: {
    color: colors.brandDark,
    fontSize: 13,
    fontWeight: '800',
  },
  header: {
    gap: 6,
  },
  title: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '900',
  },
  copy: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
  },
  card: {
    gap: 12,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '900',
  },
  linkList: {
    gap: 10,
  },
  linkRow: {
    alignItems: 'center',
    backgroundColor: '#fff8fc',
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  linkText: {
    color: colors.brandDark,
    fontSize: 14,
    fontWeight: '800',
  },
});
