import { StyleSheet, Text, View } from 'react-native';
import { ActionButton, Card, MetricCard, Screen, SectionHeading } from '../../components/app/HelperUi';
import { useHelpersApp } from '../../context/HelpersAppContext';
import { formatPercent } from '../../services/rewards/rewardPresentation';
import { colors } from '../../theme/colors';

function PerformanceRow({ label, value, explanation }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowTitle}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
      <Text style={styles.rowCopy}>{explanation}</Text>
    </View>
  );
}

export function HelperPerformanceProgressScreen({ goBack }) {
  const { profile, helperServiceOfferings } = useHelpersApp();
  const metrics = profile?.metrics || {};

  return (
    <Screen
      title="Performance"
      description="These are trusted helper metrics that can affect membership, rewards campaigns, or recognition when backend configuration uses them."
      footerAction={<ActionButton label="Back to rewards" tone="secondary" onPress={() => goBack('HelperRewardsOverview')} />}
    >
      <Card>
        <SectionHeading title="Performance snapshot" subtitle="Informational and reward-bearing metrics are shown together here." />
        <View style={styles.metricGrid}>
          <MetricCard label="Completion rate" value={formatPercent(metrics.completionRate || 0)} />
          <MetricCard label="Cancellation rate" value={formatPercent(metrics.cancellationRate || 0)} />
          <MetricCard label="Acceptance rate" value={formatPercent(metrics.acceptanceRate || 0)} />
          <MetricCard label="Avg response" value={`${Number(metrics.avgResponseMinutes || 0)} min`} />
          <MetricCard label="Overall rating" value={Number(metrics.overallRating || 0) > 0 ? Number(metrics.overallRating || 0).toFixed(1) : 'New'} />
          <MetricCard label="Active services" value={String(helperServiceOfferings.filter((item) => item.active).length)} />
        </View>
      </Card>

      <Card>
        <PerformanceRow label="Completion rate" value={formatPercent(metrics.completionRate || 0)} explanation="Trusted completion rate can affect membership thresholds and future reliability campaigns." />
        <PerformanceRow label="Cancellation rate" value={formatPercent(metrics.cancellationRate || 0)} explanation="A high cancellation rate can block higher membership levels and planned recognition programs." />
        <PerformanceRow label="Acceptance rate" value={formatPercent(metrics.acceptanceRate || 0)} explanation="Acceptance rate is shown for visibility even when it is not currently reward-bearing." />
        <PerformanceRow label="Average response time" value={`${Number(metrics.avgResponseMinutes || 0)} min`} explanation="Fast response can support future campaigns when backend configuration enables it." />
        <PerformanceRow label="Verification standing" value={String(profile?.verificationStatus || 'pending')} explanation="Verified helper status is required for higher membership levels in the current default configuration." />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  row: {
    gap: 4,
  },
  rowTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '800',
  },
  rowValue: {
    color: colors.brandDark,
    fontSize: 16,
    fontWeight: '900',
  },
  rowCopy: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
  },
});
