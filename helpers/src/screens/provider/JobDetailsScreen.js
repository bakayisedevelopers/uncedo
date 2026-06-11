import { useMemo } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { ActionButton, Card, EmptyState, Screen, SectionHeading, StatusBadge } from '../../components/app/HelperUi';
import { useHelpersApp } from '../../context/HelpersAppContext';
import { getServiceById } from '../../constants/serviceCatalog';
import { formatCurrency, formatDate } from '../../utils/payouts';
import { colors } from '../../theme/colors';

export function JobDetailsScreen({ route, onClose }) {
  const { completedJobs, activeJob } = useHelpersApp();
  const jobId = route?.params?.jobId || '';

  const job = useMemo(
    () => completedJobs.find((item) => item.id === jobId) || activeJob || null,
    [activeJob, completedJobs, jobId],
  );

  if (!job) {
    return (
      <Screen
        eyebrow="Helper"
        title="Job details"
        description="Full service information for a completed or active helper job."
        footerAction={<ActionButton label="Close" onPress={onClose} tone="secondary" />}
      >
        <Card>
          <EmptyState title="Job not found" description="We could not find the job you selected." />
        </Card>
      </Screen>
    );
  }

  const service = getServiceById(job.serviceId);
  const details = [
    { label: 'Service', value: service?.name || 'Service' },
    { label: 'Customer', value: job.customerName || 'Unknown customer' },
    { label: 'Status', value: String(job.status || 'completed').replace(/_/g, ' ') },
    { label: 'Skills', value: (job.requestedSkills || []).join(', ') || 'No skills listed' },
    { label: 'Completed', value: formatDate(job.completedAt || job.startedAt) },
    { label: 'Payout', value: formatCurrency(job.totalAmount || 0) },
    { label: 'Location', value: job.address || 'Not available' },
  ];

  return (
    <Screen
      eyebrow="Helper"
      title="Job details"
      description="Open the full delivery summary for this helper service."
      footerAction={<ActionButton label="Close" onPress={onClose} tone="secondary" />}
    >
      <Card>
        <SectionHeading
          title={job.title}
          subtitle={service?.description || 'Service delivery summary.'}
        />
        <StatusBadge label={String(job.status || 'completed').replace(/_/g, ' ')} tone={job.status === 'completed' ? 'success' : 'info'} />
      </Card>

      <Card>
        <SectionHeading
          title="At a glance"
          subtitle="A lightweight detail view with the pieces that matter most."
        />
        <View style={styles.detailList}>
          {details.map((item) => (
            <View key={item.label} style={styles.detailRow}>
              <Text style={styles.detailLabel}>{item.label}</Text>
              <Text style={styles.detailValue}>{item.value}</Text>
            </View>
          ))}
        </View>
      </Card>

      {job.description ? (
        <Card>
          <SectionHeading title="Notes" subtitle="Any extra context linked to this service." />
          <Text style={styles.bodyCopy}>{job.description}</Text>
        </Card>
      ) : null}

      {job.customerPhone ? (
        <Card>
          <SectionHeading title="Contact" subtitle="If contact details are stored for the job, they appear here." />
          <Text
            accessibilityRole="link"
            onPress={() => Linking.openURL(`tel:${job.customerPhone}`).catch(() => null)}
            style={styles.linkText}
          >
            {job.customerPhone}
          </Text>
        </Card>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  detailList: {
    gap: 10,
  },
  detailRow: {
    backgroundColor: '#f8fafc',
    borderColor: colors.border,
    borderRadius: 16,
    borderWidth: 1,
    gap: 4,
    padding: 12,
  },
  detailLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  detailValue: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 20,
    marginTop: 4,
  },
  bodyCopy: {
    color: colors.text,
    fontSize: 14,
    lineHeight: 22,
  },
  linkText: {
    color: colors.brandDark,
    fontSize: 14,
    fontWeight: '800',
  },
});
