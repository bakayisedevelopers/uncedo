import { StyleSheet, Text, View } from 'react-native';
import { ActionButton, Card, Screen, SectionHeading, StatusBadge } from '../../components/app/HelperUi';
import { useHelpersApp } from '../../context/HelpersAppContext';
import { colors } from '../../theme/colors';

export function VerificationScreen({ navigate }) {
  const { profile, actions } = useHelpersApp();
  const isVerified = profile.verificationStatus === 'verified';

  return (
    <Screen
      eyebrow="Helper"
      title="Verification"
      description="Verification remains a dedicated trust checkpoint, just like the tutor flow, but tailored to helper onboarding."
    >
      <Card>
        <SectionHeading
          title="Verification status"
          subtitle="Helpers need agreement acceptance, work proof, and verified payout details before fully activating."
          action={<StatusBadge label={profile.verificationStatus} tone={isVerified ? 'success' : 'warning'} />}
        />

        <View style={styles.list}>
          <Text style={styles.item}>1. Agreement accepted for current helper version</Text>
          <Text style={styles.item}>2. Services include skill-linked work photos</Text>
          <Text style={styles.item}>3. Payout destination verified for weekly disbursement</Text>
        </View>

        <View style={styles.buttonRow}>
          <ActionButton
            label={isVerified ? 'Mark pending review' : 'Mark verified'}
            onPress={() => actions.setVerificationStatus(isVerified ? 'pending' : 'verified')}
          />
          <ActionButton label="Review agreement" tone="secondary" onPress={() => navigate('Agreement')} />
        </View>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
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
});
