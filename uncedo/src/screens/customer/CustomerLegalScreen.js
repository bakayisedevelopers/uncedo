import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '../../components/ui/Card';
import { LEGAL_LINKS } from '../../constants/legal';
import { colors } from '../../theme/colors';

export function CustomerLegalScreen({ navigate }) {
  const openLink = (url) => Linking.openURL(url).catch(() => null);

  return (
    <ScrollView contentContainerStyle={styles.wrap} showsVerticalScrollIndicator={false}>
      <Pressable accessibilityRole="button" onPress={() => navigate('Profile')} style={styles.backRow}>
        <Ionicons color={colors.brandDark} name="chevron-back" size={18} />
        <Text style={styles.backText}>Back to profile</Text>
      </Pressable>

      <View style={styles.header}>
        <Text style={styles.title}>Legal</Text>
        <Text style={styles.copy}>Open the latest policy documents that apply to the Uncedo app.</Text>
      </View>

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
    backgroundColor: '#f8fafc',
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
