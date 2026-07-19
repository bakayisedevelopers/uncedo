import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshControl, StyleSheet, Text, View } from 'react-native';
import { ActionButton, Card, EmptyState, MetricCard, Screen, SectionHeading } from '../../components/app/HelperUi';
import { MembershipBadge } from '../../components/rewards/RewardBadges';
import { PointsBalanceCard, RecognitionCard, ReferralProgressCard, RewardTransactionRow } from '../../components/rewards/RewardWidgets';
import { useAuth } from '../../context/AuthContext';
import { useHelpersApp } from '../../context/HelpersAppContext';
import { refreshHelperRewardBundle } from '../../services/rewards/rewardClientService';
import { buildMembershipProgressModel, formatPercent, formatPoints, formatPointsToRand } from '../../services/rewards/rewardPresentation';
import { colors } from '../../theme/colors';

export function HelperRewardsOverviewScreen({ navigate, goBack }) {
  const { user } = useAuth();
  const { profile } = useHelpersApp();
  const [bundle, setBundle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const loadBundle = useCallback(async ({ forceConfig = false } = {}) => {
    if (!user?.uid) {
      return;
    }

    setError('');
    try {
      const nextBundle = await refreshHelperRewardBundle({ userId: user.uid, forceConfig });
      setBundle(nextBundle);
    } catch (nextError) {
      setError(nextError.message || 'Unable to load rewards right now.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.uid]);

  useEffect(() => {
    loadBundle({ forceConfig: true });
  }, [loadBundle]);

  const rewardAccount = bundle?.rewardAccount || {};
  const ratingSummary = bundle?.ratingSummary || {};
  const helperConfig = bundle?.helperConfig || {};
  const globalConfig = bundle?.globalConfig || {};
  const featureFlags = globalConfig?.featureFlags || {};
  const membershipProgress = buildMembershipProgressModel({
    rewardAccount,
    ratingSummary,
    membershipConfig: bundle?.membershipConfig,
    profileMetrics: profile?.metrics,
    verificationStatus: profile?.verificationStatus,
  });
  const sortedMastery = useMemo(
    () => [...(bundle?.mastery || [])].sort((left, right) => (
      Number(right?.qualificationSnapshot?.eligibleCompletedJobCount || right?.eligibleCompletedJobCount || 0)
      - Number(left?.qualificationSnapshot?.eligibleCompletedJobCount || left?.eligibleCompletedJobCount || 0)
    )),
    [bundle?.mastery],
  );

  return (
    <Screen
      title="Rewards"
      description="Track helper reward points, membership, referrals, mastery progress, and recognition without mixing them with earnings or payouts."
      footerAction={<ActionButton label="Back to profile" tone="secondary" onPress={() => goBack('Profile')} />}
      refreshControl={(
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            loadBundle({ forceConfig: false });
          }}
          tintColor={colors.brand}
        />
      )}
    >
      {error ? (
        <Card style={styles.warningCard}>
          <Text style={styles.warningText}>{error}</Text>
          <ActionButton label="Retry" onPress={() => loadBundle({ forceConfig: true })} />
        </Card>
      ) : null}

      {loading ? (
        <Card>
          <EmptyState
            title="Loading helper rewards"
            description="Connecting your reward account, membership, mastery, referral summary, and recent transactions."
          />
        </Card>
      ) : null}

      {!loading && featureFlags.rewardsEnabled === false ? (
        <Card>
          <EmptyState
            title="Rewards are currently unavailable"
            description="The helper rewards feature flag is off, so points and recognition are not active in this environment."
          />
        </Card>
      ) : null}

      {!loading && featureFlags.rewardsEnabled !== false ? (
        <>
          <PointsBalanceCard
            globalConfig={globalConfig}
            onPress={() => navigate('HelperRewardHistory')}
            ratingSummary={ratingSummary}
            rewardAccount={rewardAccount}
            subtitle="Keep points separate from helper earnings, payouts, and cash balances."
          />

          <Card>
            <SectionHeading
              title="Membership"
              subtitle="Overall platform standing based on trusted performance, ratings, and verification."
              action={<ActionButton label="Open membership" tone="secondary" onPress={() => navigate('HelperMembership')} />}
            />
            <MembershipBadge
              level={rewardAccount?.membership?.currentLevel}
              restricted={Boolean(profile?.blocked || profile?.suspended)}
              subtitle="Current helper membership"
              variant="expanded"
            />
            <View style={styles.metricGrid}>
              <MetricCard label="Completed paid jobs" value={String(rewardAccount?.eligibleCompletedPaidJobs || 0)} />
              <MetricCard label="Overall rating" value={Number(ratingSummary?.overallAverage || 0) > 0 ? Number(ratingSummary?.overallAverage || 0).toFixed(1) : 'New'} />
              <MetricCard label="Completion rate" value={formatPercent(profile?.metrics?.completionRate || 0)} />
              <MetricCard label="Cancellation rate" value={formatPercent(profile?.metrics?.cancellationRate || 0)} />
            </View>
            {membershipProgress?.nextLevel ? (
              <Text style={styles.copy}>
                Next level: {membershipProgress.nextLevel}. Overall progress {Math.round((membershipProgress.overallProgress || 0) * 100)}%.
              </Text>
            ) : (
              <Text style={styles.copy}>You are already at the highest configured helper membership level.</Text>
            )}
          </Card>

          <ReferralProgressCard summary={bundle?.referralSummary} />

          <Card>
            <SectionHeading
              title="Top service mastery"
              subtitle="Service-specific experience levels stay separate from overall membership."
              action={<ActionButton label="Open mastery" tone="secondary" onPress={() => navigate('HelperServiceMasteryOverview')} />}
            />
            {!sortedMastery.length ? (
              <EmptyState
                title="No mastery progress yet"
                description="Approved services will appear here once completed paid jobs and ratings build up per service."
              />
            ) : (
              sortedMastery.slice(0, 3).map((item) => (
                <ActionButton
                  key={item.id}
                  label={`${item.serviceId || item.id} - ${item.level || 'beginner'}`}
                  tone="secondary"
                  onPress={() => navigate({ key: 'HelperServiceMasteryDetails', params: { serviceId: item.id || item.serviceId } })}
                />
              ))
            )}
          </Card>

          <Card>
            <SectionHeading
              title="Recent points history"
              subtitle="Newest helper reward activity appears first."
              action={<ActionButton label="Full history" tone="secondary" onPress={() => navigate('HelperRewardHistory')} />}
            />
            {bundle?.recentTransactions?.length
              ? bundle.recentTransactions.map((item) => <RewardTransactionRow key={item.id} transaction={item} />)
              : (
                <EmptyState
                  title="No point activity yet"
                  description="Eligible job rewards, rating effects, referrals, reversals, and expiry events will appear here once processed by the backend."
                />
              )}
          </Card>

          <RecognitionCard helperConfig={helperConfig} rewardAccount={rewardAccount} topMastery={sortedMastery[0] || null} />

          <Card>
            <SectionHeading title="Quick links" subtitle="Open the main helper reward areas." />
            <View style={styles.linkGrid}>
              <ActionButton label="Points history" tone="secondary" onPress={() => navigate('HelperRewardHistory')} />
              <ActionButton label="Membership" tone="secondary" onPress={() => navigate('HelperMembership')} />
              <ActionButton label="Referrals" tone="secondary" onPress={() => navigate('HelperReferrals')} />
              <ActionButton label="Ratings" tone="secondary" onPress={() => navigate('HelperRatingSummary')} />
              <ActionButton label="Performance" tone="secondary" onPress={() => navigate('HelperPerformanceProgress')} />
              <ActionButton label="How to earn" tone="secondary" onPress={() => navigate('HelperHowToEarn')} />
              <ActionButton label="Recognition" tone="secondary" onPress={() => navigate('HelperRecognition')} />
            </View>
          </Card>

          <Card>
            <Text style={styles.copy}>
              Available points: {formatPoints(rewardAccount?.availablePoints || 0)} - Pending points: {formatPoints(rewardAccount?.pendingPoints || 0)} - Public conversion preview: {formatPoints(globalConfig?.pointsPerRand || 10)} = {formatPointsToRand(globalConfig?.pointsPerRand || 10, globalConfig?.pointsPerRand || 10)}
            </Text>
            <Text style={styles.copy}>
              Points are not helper earnings, payout balance, or withdrawable cash. They stay separate from your wallet, labor share, and scheduled payouts.
            </Text>
          </Card>
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  warningCard: {
    backgroundColor: '#fff7ed',
    borderColor: '#fdba74',
  },
  warningText: {
    color: '#9a3412',
    fontSize: 13,
    fontWeight: '700',
  },
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  copy: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
  },
  linkGrid: {
    gap: 10,
  },
});
