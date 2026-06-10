import { StyleSheet, Text, View } from 'react-native';
import { ActionButton, Card, EmptyState, Screen, SectionHeading, StatusBadge } from '../../components/app/HelperUi';
import { useHelpersApp } from '../../context/HelpersAppContext';
import { getServiceById } from '../../constants/serviceCatalog';
import { formatCurrency } from '../../utils/payouts';
import { colors } from '../../theme/colors';

export function ActiveJobScreen() {
  const { activeJob, actions } = useHelpersApp();

  return (
    <Screen
      eyebrow="Helper"
      title="Active Job"
      description="This screen keeps the same in-progress operational focus as the tutor live flow, but framed around helper delivery milestones."
    >
      <Card>
        <SectionHeading
          title="Current assignment"
          subtitle="Accepted helper work, location context, requested skills, and payout readiness."
        />

        {!activeJob ? (
          <EmptyState title="No active job" description="Accept a helper offer to manage the live job from this screen." />
        ) : (
          <>
            <StatusBadge label={activeJob.status} tone="success" />
            <Text style={styles.title}>{activeJob.title}</Text>
            <Text style={styles.subtitle}>{getServiceById(activeJob.serviceId)?.name || 'Service'} · {activeJob.customerName}</Text>
            <Text style={styles.meta}>Requested skills: {(activeJob.requestedSkills || []).join(', ')}</Text>
            <Text style={styles.meta}>Address: {activeJob.address}</Text>
            <Text style={styles.amount}>{formatCurrency(activeJob.totalAmount)}</Text>

            <View style={styles.buttonRow}>
              <ActionButton label="Mark in progress" onPress={() => actions.updateActiveJobStatus('in_progress')} />
              <ActionButton label="Mark arrived" tone="secondary" onPress={() => actions.updateActiveJobStatus('arrived')} />
              <ActionButton label="Complete job" tone="secondary" onPress={actions.completeActiveJob} />
            </View>
          </>
        )}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '900',
  },
  subtitle: {
    color: colors.muted,
    fontSize: 14,
  },
  meta: {
    color: colors.text,
    fontSize: 13,
    lineHeight: 20,
  },
  amount: {
    color: colors.brandDark,
    fontSize: 18,
    fontWeight: '900',
  },
  buttonRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
});
