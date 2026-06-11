import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Card, EmptyState, Screen, SectionHeading, StatusBadge } from '../../components/app/HelperUi';
import { useHelpersApp } from '../../context/HelpersAppContext';
import { getServiceById } from '../../constants/serviceCatalog';
import { formatCurrency, formatDate } from '../../utils/payouts';
import { colors } from '../../theme/colors';

function buildStatusLabel(job) {
  const normalized = String(job?.status || '').toLowerCase();
  if (normalized === 'completed') return 'Completed';
  if (normalized === 'canceled') return 'Canceled';
  if (normalized === 'in_progress') return 'In progress';
  return 'Job update';
}

export function CompletedJobsScreen({ navigate }) {
  const { completedJobs } = useHelpersApp();

  return (
    <Screen
      eyebrow="Helper"
      title="Services delivered"
      description="A compact history of the work you completed for customers."
    >
      <Card>
        <SectionHeading
          title="Completed services"
          subtitle="Each card stays minimal here: service, customer, status, and date. Open one for the full delivery summary."
        />

        {!completedJobs.length ? (
          <EmptyState
            title="No completed jobs yet"
            description="Once you finish a helper job, it will appear here with customer, service, and payout details."
          />
        ) : (
          <View style={styles.list}>
            {completedJobs.map((job) => {
              const service = getServiceById(job.serviceId);
              const statusLabel = buildStatusLabel(job);

              return (
                <Pressable
                  key={job.id}
                  accessibilityRole="button"
                  onPress={() => navigate({ key: 'JobDetails', params: { jobId: job.id, parentTab: 'CompletedJobs' } })}
                  style={styles.jobCard}
                >
                  <View style={styles.jobLeft}>
                    <Text style={styles.jobTitle} numberOfLines={1}>{job.title}</Text>
                    <Text style={styles.jobSubtitle} numberOfLines={1}>
                      {service?.name || 'Service'} • {job.customerName}
                    </Text>
                    <Text style={styles.jobMeta} numberOfLines={1}>
                      {job.requestedSkills?.length ? job.requestedSkills.join(', ') : 'No skills listed'}
                    </Text>
                  </View>
                  <View style={styles.jobRight}>
                    <StatusBadge label={statusLabel} tone={job.status === 'completed' ? 'success' : 'info'} />
                    <Text style={styles.jobDate}>{formatDate(job.completedAt || job.startedAt)}</Text>
                    <Text style={styles.jobAmount}>{formatCurrency(job.totalAmount)}</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: 10,
  },
  jobCard: {
    alignItems: 'flex-start',
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    padding: 14,
  },
  jobLeft: {
    flex: 1,
    gap: 6,
  },
  jobRight: {
    alignItems: 'flex-end',
    gap: 6,
  },
  jobTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '900',
  },
  jobSubtitle: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '700',
  },
  jobMeta: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
  },
  jobDate: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
  },
  jobAmount: {
    color: colors.brandDark,
    fontSize: 13,
    fontWeight: '900',
  },
});
