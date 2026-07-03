import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '../../components/ui/Card';
import { StickyScreenHeader } from '../../components/ui/StickyScreenHeader';
import { LEGAL_LINKS } from '../../constants/legal';
import { colors } from '../../theme/colors';

export function CustomerLegalScreen({ navigate }) {
  const openLink = (url) => Linking.openURL(url).catch(() => null);

  return (
    <ScrollView contentContainerStyle={styles.wrap} showsVerticalScrollIndicator={false} stickyHeaderIndices={[0]}>
      <StickyScreenHeader
        backLabel="Back to profile"
        onBack={() => navigate('Profile')}
        subtitle="Open the latest policy documents that apply to the Uncedo app."
        title="Legal"
      />

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
