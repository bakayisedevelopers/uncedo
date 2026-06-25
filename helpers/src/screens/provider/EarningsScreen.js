import { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Card, EmptyState, MetricCard, SectionHeading, StatusBadge } from '../../components/app/HelperUi';
import { useHelpersApp } from '../../context/HelpersAppContext';
import { colors } from '../../theme/colors';
import {
  formatCurrency,
  formatDate,
  formatWeekRangeLabel,
  getPayoutTone,
} from '../../utils/payouts';

export function EarningsScreen({ goBack }) {
  const { paymentSummary, weeklyGroups } = useHelpersApp();
  const [expandedWeekKey, setExpandedWeekKey] = useState('');

  return (
    <ScrollView contentContainerStyle={styles.wrap} showsVerticalScrollIndicator={false}>
      <Pressable accessibilityRole="button" onPress={() => goBack('Profile')} style={styles.backRow}>
        <Ionicons color={colors.brandDark} name="chevron-back" size={18} />
        <Text style={styles.backText}>Back to profile</Text>
      </Pressable>

      <View style={styles.header}>
        <Text style={styles.title}>Payment</Text>
        <Text style={styles.copy}>Track weekly helper earnings, cancellation outcomes, unpaid wallet balance, and payout status from the same request records used for billing.</Text>
      </View>

      <Card style={styles.walletCard}>
        <SectionHeading
          title="Wallet"
          subtitle="This is the total amount currently owed to you and not yet marked as paid."
        />
        <Text style={styles.walletAmount}>{formatCurrency(paymentSummary.unpaidAmount)}</Text>
      </Card>

      <Card>
        <SectionHeading
          title="Payment summary"
          subtitle="Your totals are grouped by payout week and include both completed jobs and customer cancellations."
        />
        <View style={styles.metricGrid}>
          <MetricCard label="Lifetime helper earnings" value={formatCurrency(paymentSummary.lifetimeHelperEarnings)} />
          <MetricCard label="Unpaid amount" value={formatCurrency(paymentSummary.unpaidAmount)} />
          <MetricCard label="Paid amount" value={formatCurrency(paymentSummary.paidAmount)} accent="success" />
          <MetricCard label="Current week amount" value={formatCurrency(paymentSummary.currentWeekAmount)} />
        </View>
        <View style={styles.ruleCard}>
          <Text style={styles.ruleText}>The platform gets 30% and you as a helper get 70%.</Text>
          <Text style={styles.ruleText}>The 70% applies to the labor amount only. You also receive the full travel fee for the service.</Text>
          <Text style={styles.ruleText}>The booking fee belongs to the platform. If a customer cancels before you start traveling, you receive R0 and the booking fee still stays with the platform.</Text>
        </View>
      </Card>

      <Card>
        <SectionHeading
          title="Weekly payout breakdown"
          subtitle="Grouped Monday to Sunday. Each request shows what the customer paid and what belongs to you."
        />

        {!weeklyGroups.length ? (
          <EmptyState
            title="No settled jobs yet"
            description="Completed jobs and customer cancellations will appear here once they produce a billing outcome."
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
                    <Text style={styles.weekAmount}>Customer charges: {formatCurrency(group.grossAmount)}</Text>
                  </View>
                  <StatusBadge label={group.status} tone={getPayoutTone(group.status)} />
                </Pressable>

                {isExpanded ? (
                  <View style={styles.weekExpanded}>
                    <View style={styles.metricGrid}>
                      <MetricCard label="Jobs" value={String(group.totalJobs)} accent="muted" />
                      <MetricCard label="Customer charges" value={formatCurrency(group.grossAmount)} accent="muted" />
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
                          <Text style={styles.jobRowMeta}>{`${job.customerName} | ${formatDate(job.completedAt)}`}</Text>
                          <Text style={styles.jobRowMeta}>{job.computedAmounts.summaryLabel}</Text>
                          <Text style={styles.jobRowMeta}>{(job.requestedSkills || []).join(', ')}</Text>
                        </View>
                        <View style={styles.jobRowAmounts}>
                          <Text style={styles.jobRowTotal}>Charged {formatCurrency(job.computedAmounts.totalAmount)}</Text>
                          <Text style={styles.jobRowHelper}>You get {formatCurrency(job.computedAmounts.helperAmount)}</Text>
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
  walletCard: {
    backgroundColor: '#fff8fc',
  },
  walletAmount: {
    color: colors.brandDark,
    fontSize: 32,
    fontWeight: '900',
  },
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  ruleCard: {
    backgroundColor: '#fff8fc',
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 1,
    gap: 8,
    padding: 14,
  },
  ruleText: {
    color: colors.text,
    fontSize: 13,
    lineHeight: 19,
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
    backgroundColor: '#fff8fc',
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
