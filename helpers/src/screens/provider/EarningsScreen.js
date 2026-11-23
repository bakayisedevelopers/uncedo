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
  const { paymentSummary, weeklyGroups, helperWalletSnapshot, helperWalletLoading, helperWalletError, refreshHelperWallet, profile, actions } = useHelpersApp();
  const [expandedWeekKey, setExpandedWeekKey] = useState('');
  const [resolvingLegacy, setResolvingLegacy] = useState(false);
  const [legacyResolveNotice, setLegacyResolveNotice] = useState('');
  const [legacyResolveError, setLegacyResolveError] = useState('');
  const serverLegacyMinor = helperWalletSnapshot?.legacySummary?.unresolvedAmountMinor;
  const unresolvedLegacyMinor = typeof serverLegacyMinor === 'number'
    ? Math.max(0, serverLegacyMinor)
    : Math.max(0, Math.round(Number(paymentSummary.unpaidAmount || 0) * 100));

  const handleResolveLegacy = async () => {
    setResolvingLegacy(true);
    setLegacyResolveNotice('');
    setLegacyResolveError('');
    try {
      const result = await actions.resolveLegacyWallet();
      const addedMinor = Number(result?.addedMinor || 0);
      const count = Number(result?.resolvedCount || 0);
      setLegacyResolveNotice(
        addedMinor > 0
          ? `Added ${moneyMinor(addedMinor)} from ${count} completed job${count === 1 ? '' : 's'} to your wallet balance.`
          : 'All eligible completed jobs are already resolved into your wallet.',
      );
    } catch (error) {
      setLegacyResolveError(error?.message || 'Unable to resolve legacy completed jobs right now.');
    } finally {
      setResolvingLegacy(false);
    }
  };
  const wallet = helperWalletSnapshot?.wallet || {};
  const rawBalanceMinor = wallet?.balanceMinor;
  const profileMinor = profile?.wallet?.balanceMinor;
  const signedBalanceMinor = Number.isSafeInteger(Number(rawBalanceMinor))
    ? Number(rawBalanceMinor)
    : Number.isSafeInteger(Number(profileMinor))
      ? Number(profileMinor)
      : (wallet?.availableMinor !== undefined || wallet?.outstandingCommissionMinor !== undefined)
        ? (Number(wallet?.availableMinor || 0) - Number(wallet?.outstandingCommissionMinor || 0))
        : Math.round(Number(profile?.wallet?.balance || 0) * 100);
  const nextMondayPayoutMinor = wallet.reconciliationBlocked ? 0 : Math.max(0, signedBalanceMinor);
  const moneyMinor = (minor) => {
    const num = Number(minor || 0);
    const absText = `R${(Math.abs(num) / 100).toFixed(2)}`;
    return num < 0 ? `-${absText}` : absText;
  };
  const signedDeltaMinorFor = (entry = {}) => (
    Number.isSafeInteger(Number(entry.deltaMinor))
      ? Number(entry.deltaMinor)
      : Number(entry.availableDeltaMinor || 0) - Number(entry.outstandingCommissionDeltaMinor || 0)
  );
  const transactionDetail = (entry) => entry.description || 'Wallet transaction';

  return (
    <ScrollView contentContainerStyle={styles.wrap} showsVerticalScrollIndicator={false}>
      <Pressable accessibilityRole="button" onPress={() => goBack('Profile')} style={styles.backRow}>
        <Ionicons color={colors.brandDark} name="chevron-back" size={18} />
        <Text style={styles.backText}>Back to profile</Text>
      </Pressable>

      <View style={styles.header}>
        <Text style={styles.title}>Payment</Text>
        <Text style={styles.copy}>Track your single wallet balance, weekly Monday Paystack payouts, and completed or cancelled job settlements.</Text>
      </View>

      <Card style={styles.walletCard}>
        <SectionHeading
          title="Wallet"
          subtitle="All helper job payouts and cash commission deductions flow into this single wallet balance."
          action={<ActionButton label={helperWalletLoading ? 'Refreshing…' : 'Refresh'} tone="secondary" disabled={helperWalletLoading} onPress={refreshHelperWallet} />}
        />
        <Text style={styles.walletAmount}>{moneyMinor(signedBalanceMinor)}</Text>
        <Text style={styles.walletLabel}>
          {signedBalanceMinor < 0
            ? 'Wallet balance (negative — platform share owed from cash jobs)'
            : 'Wallet balance'}
        </Text>
        <View style={styles.metricGrid}>
          <MetricCard
            label="Next Monday payout"
            value={moneyMinor(nextMondayPayoutMinor)}
            helper={nextMondayPayoutMinor > 0
              ? 'Paid out via Paystack on Monday and reset to R0.00 if successful; stays in your wallet if unsuccessful.'
              : 'Monday payouts only run when your wallet balance is greater than R0.00.'}
            accent={nextMondayPayoutMinor > 0 ? 'success' : 'muted'}
          />
        </View>
        {wallet.reconciliationBlocked ? (
          <View style={styles.noteCard}><Text style={styles.noteText}>A payout needs financial reconciliation. New wallet payouts are paused while Uncedo reviews it.</Text></View>
        ) : null}
        {helperWalletError ? <Text style={styles.walletError}>{helperWalletError}</Text> : null}
        <View style={styles.transactionList}>
          <Text style={styles.transactionHeading}>Recent wallet transactions</Text>
          {helperWalletSnapshot?.transactions?.length ? helperWalletSnapshot.transactions.map((entry) => {
            const deltaMinor = signedDeltaMinorFor(entry);
            return (
              <View key={entry.id} style={styles.transactionRow}>
                <View style={styles.transactionCopy}>
                  <Text style={styles.transactionTitle}>{transactionDetail(entry)}</Text>
                  <Text style={styles.transactionMeta}>{formatDate(entry.createdAtMs)} · {entry.entryType.replace(/_/g, ' ')}</Text>
                  {entry.requestId ? <Text style={styles.transactionMeta}>Request {entry.requestId}</Text> : null}
                </View>
                <Text style={styles.transactionAmount}>
                  {deltaMinor < 0 ? `-${moneyMinor(Math.abs(deltaMinor))}` : `+${moneyMinor(deltaMinor)}`}
                </Text>
              </View>
            );
          }) : (
            <Text style={styles.transactionEmpty}>Wallet credits, cash commission deductions, and Monday payouts will appear here.</Text>
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
          subtitle="Move any remaining legacy completed job total directly into your wallet balance."
          action={unresolvedLegacyMinor > 0 ? (
            <ActionButton
              label={resolvingLegacy ? 'Resolving…' : 'Resolve'}
              disabled={resolvingLegacy || helperWalletLoading}
              onPress={handleResolveLegacy}
            />
          ) : null}
        />
        <View style={styles.metricGrid}>
          <MetricCard label="Completed jobs total" value={moneyMinor(unresolvedLegacyMinor)} accent={unresolvedLegacyMinor > 0 ? 'brand' : 'muted'} />
          <MetricCard label="Legacy helper earnings" value={formatCurrency(paymentSummary.lifetimeHelperEarnings)} />
          <MetricCard label="Legacy paid amount" value={formatCurrency(paymentSummary.paidAmount)} accent="success" />
          <MetricCard label="Legacy current week" value={formatCurrency(paymentSummary.currentWeekAmount)} />
        </View>
        {legacyResolveNotice ? <View style={styles.noteCard}><Text style={styles.noteText}>{legacyResolveNotice}</Text></View> : null}
        {legacyResolveError ? <Text style={styles.walletError}>{legacyResolveError}</Text> : null}
        <View style={styles.ruleCard}>
          <Text style={styles.ruleText}>The platform gets 25% and you as a helper get 75%.</Text>
          <Text style={styles.ruleText}>The 75% applies to the labor amount only. You also receive the full travel fee for the service.</Text>
          <Text style={styles.ruleText}>The booking fee belongs to the platform. If a customer cancels while you are traveling, you receive R4 per km traveled; if they cancel after you arrive or start, you receive the full travel fee.</Text>
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
