import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { Card } from '../../components/ui/Card';
import { LEGAL_LINKS } from '../../constants/legal';
import { colors } from '../../theme/colors';

export function SafetyLegalScreen() {
  const openLink = (url) => Linking.openURL(url).catch(() => null);

  return (
    <View style={styles.wrap}>
      <Card style={styles.heroCard}>
        <Text style={styles.title}>Safety & Legal</Text>
        <Text style={styles.copy}>This is a placeholder safety space for the Uncedo customer app. Emergency guidance, trust tips, and service protections will expand here later.</Text>
      </Card>

      <Card style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Quick safety notes</Text>
        <View style={styles.noteList}>
          <Text style={styles.note}>Share clear job details before a helper arrives.</Text>
          <Text style={styles.note}>Use the app payment flow instead of arranging off-platform payments.</Text>
          <Text style={styles.note}>Future emergency, support, and trust actions will be added here.</Text>
        </View>
      </Card>

      <Card style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Policies</Text>
        <View style={styles.linkList}>
          {LEGAL_LINKS.map((link) => (
            <Pressable key={link.href} accessibilityRole="button" onPress={() => openLink(link.href)} style={styles.linkRow}>
              <Text style={styles.linkText}>{link.label}</Text>
            </Pressable>
          ))}
        </View>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 16,
  },
  heroCard: {
    backgroundColor: '#eff6ff',
    borderColor: '#bfdbfe',
    gap: 10,
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
  sectionCard: {
    gap: 12,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '900',
  },
  noteList: {
    gap: 10,
  },
  note: {
    color: colors.text,
    fontSize: 14,
    lineHeight: 21,
  },
  linkList: {
    gap: 10,
  },
  linkRow: {
    backgroundColor: '#f8fafc',
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  linkText: {
    color: colors.brandDark,
    fontSize: 14,
    fontWeight: '800',
  },
});
