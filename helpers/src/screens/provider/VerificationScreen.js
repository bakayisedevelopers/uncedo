import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ActionButton, Card, SectionHeading, StatusBadge } from '../../components/app/HelperUi';
import { useHelpersApp } from '../../context/HelpersAppContext';
import { colors } from '../../theme/colors';

export function VerificationScreen({ navigate, goBack }) {
  const { profile, actions, saveError, saving } = useHelpersApp();
  const isVerified = profile.verificationStatus === 'verified';

  return (
    <ScrollView contentContainerStyle={styles.wrap} showsVerticalScrollIndicator={false}>
      <Pressable accessibilityRole="button" onPress={() => goBack('Profile')} style={styles.backRow}>
        <Ionicons color={colors.brandDark} name="chevron-back" size={18} />
        <Text style={styles.backText}>Back to profile</Text>
      </Pressable>

      <View style={styles.header}>
        <Text style={styles.title}>Verification</Text>
        <Text style={styles.copy}>Verification remains a dedicated trust checkpoint for helpers before full activation.</Text>
      </View>

      <Card>
        <SectionHeading
          title="Verification status"
          subtitle="Helpers need agreement acceptance, work proof, and verified payout details before fully activating."
          action={<StatusBadge label={profile.verificationStatus} tone={isVerified ? 'success' : 'warning'} />}
        />

        <View style={styles.list}>
          <Text style={styles.item}>1. Agreement accepted for current helper version</Text>
          <Text style={styles.item}>2. Profile selfie captured for helper identity</Text>
          <Text style={styles.item}>3. Skills include uploaded work photos</Text>
          <Text style={styles.item}>4. Payout destination verified for weekly disbursement</Text>
        </View>

        {saveError ? <Text style={styles.error}>{saveError}</Text> : null}
        <View style={styles.buttonRow}>
          <ActionButton
            label={saving ? 'Saving...' : isVerified ? 'Mark pending review' : 'Mark verified'}
            onPress={() => actions.setVerificationStatus(isVerified ? 'pending' : 'verified')}
            disabled={saving}
          />
          <ActionButton label="Review agreement" tone="secondary" onPress={() => navigate({ key: 'Agreement', params: { parentTab: 'Profile' } })} />
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
  list: {
    gap: 6,
  },
  item: {
    color: colors.text,
    fontSize: 13,
    lineHeight: 20,
  },
  buttonRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  error: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: '700',
  },
});
