import { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ActionButton, Card, EmptyState, MetricCard, SectionHeading, StatusBadge } from '../../components/app/HelperUi';
import { useHelpersApp } from '../../context/HelpersAppContext';
import { colors } from '../../theme/colors';
import {
  formatCurrency,
  formatDate,
  formatWeekRangeLabel,
  getPayoutTone,
} from '../../utils/payouts';

export function EarningsScreen({ navigate, goBack }) {
  const { paymentSummary, weeklyGroups, helperWalletSnapshot, helperWalletLoading, helperWalletError, refreshHelperWallet } = useHelpersApp();
  const [expandedWeekKey, setExpandedWeekKey] = useState('');
  const wallet = helperWalletSnapshot?.wallet || {};
  const moneyMinor = (minor) => `R${(Math.max(0, Number(minor || 0)) / 100).toFixed(2)}`;
  const transactionDetail = (entry) => {
    if (entry.entryType === 'cash_commission_assessed') {
      const deductedMinor = Math.max(0, -Number(entry.availableDeltaMinor || 0));
      const owingMinor = Math.max(0, Number(entry.outstandingCommissionDeltaMinor || 0));
      return `Deducted ${moneyMinor(deductedMinor)}${owingMinor ? ` · ${moneyMinor(owingMinor)} remains outstanding` : ''}`;
    }
    return entry.description || 'Wallet transaction';
  };

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
          subtitle="These server-recorded wallet funds are separate from the legacy weekly request earnings below."
          action={<ActionButton label={helperWalletLoading ? 'Refreshing…' : 'Refresh'} tone="secondary" disabled={helperWalletLoading} onPress={refreshHelperWallet} />}
        />
        <Text style={styles.walletAmount}>{moneyMinor(wallet.availableMinor)}</Text>
        <Text style={styles.walletLabel}>Available balance</Text>
        <View style={styles.metricGrid}>
          <MetricCard label="Reserved for payout" value={moneyMinor(wallet.reservedMinor)} helper="Held while Paystack confirms an active transfer." accent="muted" />
          <MetricCard label="Cash commissions outstanding" value={moneyMinor(wallet.outstandingCommissionMinor)} helper="Recovered from future eligible wallet credits." accent={Number(wallet.outstandingCommissionMinor || 0) > 0 ? 'warning' : 'muted'} />
          <MetricCard label="Next weekly payout estimate" value={moneyMinor(helperWalletSnapshot?.nextPayoutEstimateMinor)} helper="Available wallet funds; final payout is subject to payout eligibility and provider confirmation." accent="success" />
        </View>
        {wallet.reconciliationBlocked ? (
          <View style={styles.noteCard}><Text style={styles.noteText}>A payout needs financial reconciliation. New wallet payouts are paused while Uncedo reviews it.</Text></View>
        ) : null}
        {helperWalletError ? <Text style={styles.walletError}>{helperWalletError}</Text> : null}
        <View style={styles.transactionList}>
          <Text style={styles.transactionHeading}>Recent wallet transactions</Text>
          {helperWalletSnapshot?.transactions?.length ? helperWalletSnapshot.transactions.map((entry) => (
            <View key={entry.id} style={styles.transactionRow}>
              <View style={styles.transactionCopy}>
                <Text style={styles.transactionTitle}>{transactionDetail(entry)}</Text>
                <Text style={styles.transactionMeta}>{formatDate(entry.createdAtMs)} · {entry.entryType.replace(/_/g, ' ')}</Text>
                {entry.requestId ? <Text style={styles.transactionMeta}>Request {entry.requestId}</Text> : null}
              </View>
              <Text style={styles.transactionAmount}>{moneyMinor(entry.amountMinor)}</Text>
            </View>
          )) : (
            <Text style={styles.transactionEmpty}>Wallet credits and adjustments will appear here. Legacy unpaid payouts were not imported into this wallet.</Text>
          )}
        </View>
      </Card>

      <Card>
        <SectionHeading
          title="Reward Points"
          subtitle="Uncedo Points are separate from cash earnings, weekly payouts, and your wallet."
          action={<ActionButton label="Open rewards" tone="secondary" onPress={() => navigate({ key: 'HelperRewardsOverview', params: { parentTab: 'Profile' } })} />}
        />
      </Card>

      <Card>
        <SectionHeading
          title="Legacy weekly earnings history"
          subtitle="This request-based summary excludes new wallet-accounted earnings. Use the wallet above as the source for available, reserved, and outstanding funds."
        />
        <View style={styles.metricGrid}>
          <MetricCard label="Legacy helper earnings" value={formatCurrency(paymentSummary.lifetimeHelperEarnings)} />
          <MetricCard label="Legacy unpaid amount" value={formatCurrency(paymentSummary.unpaidAmount)} />
          <MetricCard label="Legacy paid amount" value={formatCurrency(paymentSummary.paidAmount)} accent="success" />
          <MetricCard label="Legacy current week" value={formatCurrency(paymentSummary.currentWeekAmount)} />
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
                          <Text style={styles.jobRowMeta}>{(job.requestedServiceOfferings || []).join(', ')}</Text>
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
  walletLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '800',
    marginTop: -8,
  },
  walletError: {
    color: '#b91c1c',
    fontSize: 12,
    fontWeight: '700',
  },
  transactionList: {
    gap: 10,
    marginTop: 4,
  },
  transactionHeading: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '900',
  },
  transactionRow: {
    alignItems: 'flex-start',
    borderTopColor: colors.border,
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
    paddingTop: 10,
  },
  transactionCopy: {
    flex: 1,
    gap: 3,
  },
  transactionTitle: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '800',
  },
  transactionMeta: {
    color: colors.muted,
    fontSize: 11,
  },
  transactionAmount: {
    color: colors.brandDark,
    fontSize: 13,
    fontWeight: '900',
  },
  transactionEmpty: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
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
