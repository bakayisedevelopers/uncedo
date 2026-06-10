import { StyleSheet, Text, View } from 'react-native';
import { ActionButton, Card, Screen, SectionHeading, StatusBadge } from '../../components/app/HelperUi';
import { useHelpersApp } from '../../context/HelpersAppContext';
import { formatDate } from '../../utils/payouts';
import { colors } from '../../theme/colors';

export function AgreementScreen() {
  const { profile, actions } = useHelpersApp();
  const isCurrent = profile.agreement.acceptedVersion === profile.agreement.requiredVersion;

  return (
    <Screen
      eyebrow="Helper"
      title="Agreement"
      description="The agreement step stays parallel to the tutor flow, but it now gates helper service activation and payout readiness."
    >
      <Card>
        <SectionHeading
          title="Helper Agreement"
          subtitle="Review and accept the latest helper agreement version before taking live jobs."
          action={<StatusBadge label={isCurrent ? 'Current' : 'Pending'} tone={isCurrent ? 'success' : 'warning'} />}
        />
        <View style={styles.metaRow}>
          <Text style={styles.metaLabel}>Required version</Text>
          <Text style={styles.metaValue}>{profile.agreement.requiredVersion}</Text>
        </View>
        <View style={styles.metaRow}>
          <Text style={styles.metaLabel}>Accepted version</Text>
          <Text style={styles.metaValue}>{profile.agreement.acceptedVersion || 'Not accepted yet'}</Text>
        </View>
        <View style={styles.metaRow}>
          <Text style={styles.metaLabel}>Accepted at</Text>
          <Text style={styles.metaValue}>{formatDate(profile.agreement.acceptedAt)}</Text>
        </View>
        <ActionButton label={isCurrent ? 'Agreement accepted' : 'Accept agreement'} onPress={actions.acceptAgreement} disabled={isCurrent} />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  metaRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  metaLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
  },
  metaValue: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '900',
  },
});
