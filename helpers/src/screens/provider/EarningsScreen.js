import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Card, EmptyState, MetricCard, Screen, SectionHeading, StatusBadge } from '../../components/app/HelperUi';
import { useHelpersApp } from '../../context/HelpersAppContext';
import { colors } from '../../theme/colors';
import {
  formatCurrency,
  formatDate,
  formatWeekRangeLabel,
  getPayoutTone,
  HELPER_PAYOUT_RATE,
  PLATFORM_FEE_RATE,
} from '../../utils/payouts';

export function EarningsScreen() {
  const { paymentSummary, weeklyGroups } = useHelpersApp();
  const [expandedWeekKey, setExpandedWeekKey] = useState('');

  return (
    <Screen
      eyebrow="Helper"
      title="Payment"
      description="Track completed jobs by week, helper share, platform fee, and payout status using the same structure as tutor payments."
    >
      <Card>
        <SectionHeading
          title="Payment summary"
          subtitle="Weekly grouping, payout state, and helper share are kept parallel with the tutor payment experience."
        />
        <View style={styles.metricGrid}>
          <MetricCard label="Lifetime helper earnings" value={formatCurrency(paymentSummary.lifetimeHelperEarnings)} />
          <MetricCard label="Unpaid amount" value={formatCurrency(paymentSummary.unpaidAmount)} />
          <MetricCard label="Paid amount" value={formatCurrency(paymentSummary.paidAmount)} accent="success" />
          <MetricCard label="Current week amount" value={formatCurrency(paymentSummary.currentWeekAmount)} />
          <MetricCard label="Platform fee" value={`${Math.round(PLATFORM_FEE_RATE * 100)}%`} helper="Applied to completed helper jobs." />
          <MetricCard label="Helper share" value={`${Math.round(HELPER_PAYOUT_RATE * 100)}%`} helper="Paid to the verified helper account." />
        </View>
      </Card>

      <Card>
        <SectionHeading
          title="Weekly payout breakdown"
          subtitle="Grouped Monday to Sunday with manual payout tracking status."
        />

        {!weeklyGroups.length ? (
          <EmptyState
            title="No completed jobs yet"
            description="Completed helper jobs will appear here and automatically group into payout weeks."
          />
        ) : (
          weeklyGroups.map((group) => {
            const isExpanded = expandedWeekKey === group.weekKey;
            return (
              <View key={group.weekKey} style={styles.weekCard}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setExpandedWeekKey((current) => (current === group.weekKey ? '' : group.weekKey))}
                  style={styles.weekToggle}
                >
                  <View style={styles.weekCopy}>
                    <Text style={styles.weekTitle}>{formatWeekRangeLabel(group.weekStart, group.weekEnd)}</Text>
                    <Text style={styles.weekKey}>{group.weekKey}</Text>
                    <Text style={styles.weekAmount}>Total made: {formatCurrency(group.grossAmount)}</Text>
                  </View>
                  <StatusBadge label={group.status} tone={getPayoutTone(group.status)} />
                </Pressable>

                {isExpanded ? (
                  <View style={styles.weekExpanded}>
                    <View style={styles.metricGrid}>
                      <MetricCard label="Jobs" value={String(group.totalJobs)} accent="muted" />
                      <MetricCard label="Gross" value={formatCurrency(group.grossAmount)} accent="muted" />
                      <MetricCard label="Helper payout" value={formatCurrency(group.helperAmount)} accent="success" />
                      <MetricCard label="Platform amount" value={formatCurrency(group.platformAmount)} accent="muted" />
                    </View>

                    {group.notes ? (
                      <View style={styles.noteCard}>
                        <Text style={styles.noteText}>Admin note: {group.notes}</Text>
                      </View>
                    ) : null}

                    {group.jobs.map((job) => (
                      <View key={job.id} style={styles.jobRow}>
                        <View style={styles.jobRowCopy}>
                          <Text style={styles.jobRowTitle}>{job.title}</Text>
                          <Text style={styles.jobRowMeta}>{job.customerName} - {formatDate(job.completedAt)}</Text>
                          <Text style={styles.jobRowMeta}>{(job.requestedSkills || []).join(', ')}</Text>
                        </View>
                        <View style={styles.jobRowAmounts}>
                          <Text style={styles.jobRowTotal}>{formatCurrency(job.computedAmounts.totalAmount)}</Text>
                          <Text style={styles.jobRowHelper}>{formatCurrency(job.computedAmounts.helperAmount)}</Text>
                        </View>
                      </View>
                    ))}
                  </View>
                ) : null}
              </View>
            );
          })
        )}
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
  weekCard: {
    borderColor: colors.border,
    borderRadius: 20,
    borderWidth: 1,
    gap: 12,
    padding: 14,
  },
  weekToggle: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  weekCopy: {
    flex: 1,
    gap: 4,
  },
  weekTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '900',
  },
  weekKey: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
  },
  weekAmount: {
    color: colors.brandDark,
    fontSize: 12,
    fontWeight: '900',
  },
  weekExpanded: {
    gap: 12,
  },
  noteCard: {
    backgroundColor: '#f8fafc',
    borderColor: colors.border,
    borderRadius: 16,
    borderWidth: 1,
    padding: 12,
  },
  noteText: {
    color: colors.text,
    fontSize: 12,
    lineHeight: 18,
  },
  jobRow: {
    alignItems: 'flex-start',
    borderColor: colors.border,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    padding: 12,
  },
  jobRowCopy: {
    flex: 1,
    gap: 4,
  },
  jobRowTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '900',
  },
  jobRowMeta: {
    color: colors.muted,
    fontSize: 12,
  },
  jobRowAmounts: {
    alignItems: 'flex-end',
    gap: 4,
  },
  jobRowTotal: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '800',
  },
  jobRowHelper: {
    color: colors.brandDark,
    fontSize: 13,
    fontWeight: '900',
  },
});
