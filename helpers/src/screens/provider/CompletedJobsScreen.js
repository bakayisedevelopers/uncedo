import { StyleSheet, Text, View } from 'react-native';
import { Card, EmptyState, Screen, SectionHeading, StatusBadge } from '../../components/app/HelperUi';
import { getServiceById } from '../../constants/serviceCatalog';
import { formatCurrency, formatDate } from '../../utils/payouts';
import { colors } from '../../theme/colors';
import { useHelpersApp } from '../../context/HelpersAppContext';

export function CompletedJobsScreen() {
  const { completedJobs } = useHelpersApp();

  return (
    <Screen
      eyebrow="Helper"
      title="Completed Jobs"
      description="This replaces the tutor classes queue with finished helper work, payout-ready history, and service-level delivery tracking."
    >
      <Card>
        <SectionHeading
          title="Job history"
          subtitle="Completed jobs use the same summary logic as tutor classes, but framed around finished helper work."
        />

        {!completedJobs.length ? (
          <EmptyState
            title="No completed jobs yet"
            description="Once you finish a helper job, it will appear here with customer, service, and payout details."
          />
        ) : (
          completedJobs.map((job) => {
            const service = getServiceById(job.serviceId);
            return (
              <View key={job.id} style={styles.jobCard}>
                <View style={styles.jobTop}>
                  <View style={styles.jobCopy}>
                    <Text style={styles.jobTitle}>{job.title}</Text>
                    <Text style={styles.jobSubtitle}>{service?.name || 'Service'} · {job.customerName}</Text>
                  </View>
                  <StatusBadge label="Completed" tone="success" />
                </View>

                <View style={styles.metaRow}>
                  <Text style={styles.metaLabel}>Skills</Text>
                  <Text style={styles.metaValue}>{(job.requestedSkills || []).join(', ')}</Text>
                </View>
                <View style={styles.metaRow}>
                  <Text style={styles.metaLabel}>Completed</Text>
                  <Text style={styles.metaValue}>{formatDate(job.completedAt)}</Text>
                </View>
                <View style={styles.metaRow}>
                  <Text style={styles.metaLabel}>Total made</Text>
                  <Text style={styles.amountValue}>{formatCurrency(job.totalAmount)}</Text>
                </View>
              </View>
            );
          })
        )}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  jobCard: {
    borderColor: colors.border,
    borderRadius: 20,
    borderWidth: 1,
    gap: 10,
    padding: 14,
  },
  jobTop: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  jobCopy: {
    flex: 1,
    gap: 4,
  },
  jobTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '900',
  },
  jobSubtitle: {
    color: colors.muted,
    fontSize: 13,
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
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    marginLeft: 12,
    textAlign: 'right',
  },
  amountValue: {
    color: colors.brandDark,
    fontSize: 14,
    fontWeight: '900',
  },
});
