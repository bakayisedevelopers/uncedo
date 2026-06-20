import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ActionButton, Card, SectionHeading, StatusBadge } from '../../components/app/HelperUi';
import { useHelpersApp } from '../../context/HelpersAppContext';
import { formatDate } from '../../utils/payouts';
import { colors } from '../../theme/colors';

export function AgreementScreen({ goBack }) {
  const { profile, actions, saving, saveError } = useHelpersApp();
  const isCurrent = profile.agreement.acceptedVersion === profile.agreement.requiredVersion;

  return (
    <ScrollView contentContainerStyle={styles.wrap} showsVerticalScrollIndicator={false}>
      <Pressable accessibilityRole="button" onPress={() => goBack('Profile')} style={styles.backRow}>
        <Ionicons color={colors.brandDark} name="chevron-back" size={18} />
        <Text style={styles.backText}>Back to profile</Text>
      </Pressable>

      <View style={styles.header}>
        <Text style={styles.title}>Agreement</Text>
        <Text style={styles.copy}>The agreement step stays parallel to the customer setup flow, but it gates helper activation and payout readiness.</Text>
      </View>

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
        {saveError ? <Text style={styles.error}>{saveError}</Text> : null}
        <ActionButton
          label={isCurrent ? 'Agreement accepted' : saving ? 'Saving...' : 'Accept agreement'}
          onPress={actions.acceptAgreement}
          disabled={isCurrent || saving}
        />
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
  error: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: '700',
  },
});
