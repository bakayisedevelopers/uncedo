import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/States';
import { StickyScreenHeader } from '../../components/ui/StickyScreenHeader';
import { MembershipBadge } from '../../components/customer/rewards/MembershipBadge';
import { RewardTransactionItem } from '../../components/customer/rewards/RewardTransactionItem';
import { useAuth } from '../../context/AuthContext';
import {
  getExpiringRewardTransactions,
  getMyReferralSummary,
  getRecentRewardTransactions,
  getRewardConfigs,
  subscribeToRatingSummary,
  subscribeToRewardAccount,
} from '../../services/rewards/rewardClientService';
import {
  buildHowToEarnSections,
  buildMembershipProgressModel,
  formatPoints,
  formatPointsToRand,
  formatShortDate,
  summarizeExpiringPoints,
} from '../../services/rewards/rewardPresentation';
import { recordRewardUiEvent } from '../../services/rewards/rewardAnalyticsService';
import { colors } from '../../theme/colors';

function ProgressBar({ progress }) {
  return (
    <View style={styles.progressTrack}>
      <View style={[styles.progressFill, { width: `${Math.max(0, Math.min(100, Math.round(progress * 100)))}%` }]} />
    </View>
  );
}

function StatPill({ label, value, hint = '' }) {
  return (
    <View style={styles.statPill}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
      {hint ? <Text style={styles.statHint}>{hint}</Text> : null}
    </View>
  );
}

export function CustomerRewardsOverviewScreen({ navigate }) {
  const { user } = useAuth();
  const [rewardAccount, setRewardAccount] = useState(null);
  const [ratingSummary, setRatingSummary] = useState(null);
  const [recentTransactions, setRecentTransactions] = useState([]);
  const [rewardConfigs, setRewardConfigs] = useState(null);
  const [referralSummary, setReferralSummary] = useState(null);
  const [expiringTransactions, setExpiringTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const loadOverview = useCallback(async ({ silent = false, forceRefresh = false } = {}) => {
    if (!user?.uid) {
      return;
    }

    if (!silent) {
      setLoading(true);
    }
    setError('');

    try {
      const [configs, transactions, referrals, expiring] = await Promise.all([
        getRewardConfigs({ forceRefresh }),
        getRecentRewardTransactions(user.uid, 5),
        getMyReferralSummary().catch(() => null),
        getExpiringRewardTransactions(user.uid, { limitCount: 20 }).catch(() => []),
      ]);

      setRewardConfigs(configs);
      setRecentTransactions(transactions);
      setReferralSummary(referrals);
      setExpiringTransactions(expiring);
    } catch (nextError) {
      setError(nextError.message || 'Unable to load your rewards right now.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.uid]);

  useEffect(() => {
    recordRewardUiEvent(user?.uid, 'rewards_screen_viewed');
  }, [user?.uid]);

  useEffect(() => {
    if (!user?.uid) {
      setRewardAccount(null);
      setRatingSummary(null);
      setLoading(false);
      return () => {};
    }

    const unsubReward = subscribeToRewardAccount(
      user.uid,
      (next) => setRewardAccount(next),
      (nextError) => setError(nextError.message || 'Unable to read your reward account.'),
    );
    const unsubRating = subscribeToRatingSummary(
      user.uid,
      (next) => setRatingSummary(next),
      (nextError) => setError(nextError.message || 'Unable to read your rating summary.'),
    );

    loadOverview();

    return () => {
      unsubReward?.();
      unsubRating?.();
    };
  }, [loadOverview, user?.uid]);

  const expiringSummary = useMemo(
    () => summarizeExpiringPoints(expiringTransactions, 30),
    [expiringTransactions],
  );
  const membershipProgress = useMemo(
    () => buildMembershipProgressModel({
      rewardAccount,
      ratingSummary,
      membershipConfig: rewardConfigs?.membershipConfig || {},
    }),
    [ratingSummary, rewardAccount, rewardConfigs?.membershipConfig],
  );
  const pointsPerRand = Number(rewardConfigs?.globalConfig?.pointsPerRand || 10) || 10;
  const rewardFlags = rewardConfigs?.globalConfig?.featureFlags || {};
  const howToEarnSections = useMemo(
    () => buildHowToEarnSections({
      globalConfig: rewardConfigs?.globalConfig || {},
      customerConfig: rewardConfigs?.customerConfig || {},
    }),
    [rewardConfigs?.customerConfig, rewardConfigs?.globalConfig],
  );
  const activeOpportunities = howToEarnSections.flatMap((section) => section.items).filter((item) => item.state === 'active').slice(0, 3);

  if (loading) {
    return <LoadingState label="Loading Uncedo Points" />;
  }

  if (error && !rewardConfigs && !rewardAccount) {
    return (
      <View style={styles.stateWrap}>
        <ErrorState title="Unable to load rewards" message={error} />
        <Button onPress={() => loadOverview({ forceRefresh: true })}>Retry</Button>
      </View>
    );
  }

  if (rewardFlags.rewardsEnabled === false) {
    return (
      <EmptyState
        title="Rewards are currently unavailable"
        message="The Uncedo Points system is turned off for this environment right now."
      />
    );
  }

  return (
    <ScrollView
      contentContainerStyle={styles.wrap}
      refreshControl={(
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            loadOverview({ silent: true, forceRefresh: true });
          }}
          tintColor={colors.brand}
        />
      )}
      showsVerticalScrollIndicator={false}
      stickyHeaderIndices={[0]}
    >
      <StickyScreenHeader
        title="Uncedo Points"
        subtitle="Track points, membership, referrals, ratings, and upcoming service-credit value."
      >
        <MembershipBadge
          level={rewardAccount?.membership?.currentLevel}
          restricted={Boolean(rewardAccount?.membership?.qualificationSnapshot?.restrictedStatus)}
          variant="expanded"
        />
      </StickyScreenHeader>

      {error ? (
        <Card style={styles.inlineMessageCard}>
          <Text style={styles.inlineMessageText}>{error}</Text>
        </Card>
      ) : null}

      <Card style={styles.heroCard}>
        <View style={styles.heroRow}>
          <View style={styles.heroBlock}>
            <Text style={styles.heroLabel}>Available points</Text>
            <Text style={styles.heroValue}>{formatPoints(rewardAccount?.availablePoints || 0)}</Text>
            <Text style={styles.heroSubValue}>{formatPointsToRand(rewardAccount?.availablePoints || 0, pointsPerRand)} service credit</Text>
          </View>
          <View style={styles.heroDivider} />
          <View style={styles.heroBlock}>
            <Text style={styles.heroLabel}>Pending points</Text>
            <Text style={styles.heroValue}>{formatPoints(rewardAccount?.pendingPoints || 0)}</Text>
            <Text style={styles.heroSubValue}>Pending points are not redeemable yet.</Text>
          </View>
        </View>

        <View style={styles.heroMetaGrid}>
          <StatPill
            label="Expiring soon"
            value={formatPoints(expiringSummary.amount)}
            hint={expiringSummary.nextExpiryAt ? `Next: ${formatShortDate(expiringSummary.nextExpiryAt)}` : 'No points expiring soon'}
          />
          <StatPill
            label="Completed paid bookings"
            value={String(Math.round(Number(rewardAccount?.eligibleCompletedPaidBookings || 0)))}
            hint="Membership uses eligible completed paid bookings."
          />
          <StatPill
            label="Overall customer rating"
            value={Number(ratingSummary?.overallAverage || 0) > 0 ? Number(ratingSummary?.overallAverage || 0).toFixed(1) : '0.0'}
            hint={`${Math.round(Number(ratingSummary?.overallCount || 0))} received ratings`}
          />
        </View>

        <View style={styles.linkRow}>
          <Pressable accessibilityRole="button" onPress={() => navigate('CustomerRewardHistory')} style={styles.linkButton}>
            <Ionicons color={colors.brandDark} name="receipt-outline" size={16} />
            <Text style={styles.linkButtonText}>View points history</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => navigate('CustomerReferrals')} style={styles.linkButton}>
            <Ionicons color={colors.brandDark} name="share-social-outline" size={16} />
            <Text style={styles.linkButtonText}>Open referrals</Text>
          </Pressable>
        </View>
      </Card>

      <Card style={styles.sectionCard}>
        <View style={styles.sectionHeading}>
          <Text style={styles.sectionTitle}>Membership progress</Text>
          <Pressable accessibilityRole="button" onPress={() => navigate('CustomerMembershipDetails')}>
            <Text style={styles.sectionAction}>Details</Text>
          </Pressable>
        </View>
        <Text style={styles.copy}>
          Current level: {rewardAccount?.membership?.currentLevel ? rewardAccount.membership.currentLevel[0].toUpperCase() + rewardAccount.membership.currentLevel.slice(1) : 'Neighbour'}.
          Redeeming or expiring points does not reduce membership.
        </Text>
        {membershipProgress.nextLevel ? (
          <>
            <Text style={styles.progressTitle}>Progress to {membershipProgress.nextLevel[0].toUpperCase() + membershipProgress.nextLevel.slice(1)}</Text>
            <ProgressBar progress={membershipProgress.overallProgress} />
            {membershipProgress.requirements.map((item) => (
              <View key={item.key} style={styles.requirementRow}>
                <Text style={styles.requirementLabel}>{item.label}</Text>
                <Text style={styles.requirementValue}>
                  {item.key === 'average_rating'
                    ? `${Number(item.current || 0).toFixed(1)} / ${Number(item.target || 0).toFixed(1)}`
                    : `${Math.round(Number(item.current || 0))} / ${Math.round(Number(item.target || 0))}`}
                </Text>
              </View>
            ))}
          </>
        ) : (
          <Text style={styles.copy}>You are already at the highest configured customer membership level.</Text>
        )}
      </Card>

      <Card style={styles.sectionCard}>
        <View style={styles.sectionHeading}>
          <Text style={styles.sectionTitle}>Referrals</Text>
          <Pressable accessibilityRole="button" onPress={() => navigate('CustomerReferrals')}>
            <Text style={styles.sectionAction}>Manage</Text>
          </Pressable>
        </View>
        <Text style={styles.copy}>
          {referralSummary?.code ? `Your referral code is ${referralSummary.code}.` : 'Your referral code will appear here once available.'}
        </Text>
        <View style={styles.heroMetaGrid}>
          <StatPill label="Attributed" value={String(referralSummary?.totals?.totalAttributed || 0)} />
          <StatPill label="Stage One" value={String(referralSummary?.totals?.stageOneQualified || 0)} />
          <StatPill label="Stage Two" value={String(referralSummary?.totals?.stageTwoQualified || 0)} />
        </View>
      </Card>

      <Card style={styles.sectionCard}>
        <View style={styles.sectionHeading}>
          <Text style={styles.sectionTitle}>Recent activity</Text>
          <Pressable accessibilityRole="button" onPress={() => navigate('CustomerRewardHistory')}>
            <Text style={styles.sectionAction}>Full history</Text>
          </Pressable>
        </View>
        {!recentTransactions.length ? (
          <EmptyState title="No point activity yet" message="Your reward history will appear here once trusted rewards are processed." />
        ) : recentTransactions.map((item) => (
          <RewardTransactionItem key={item.id} transaction={item} />
        ))}
      </Card>

      <Card style={styles.sectionCard}>
        <View style={styles.sectionHeading}>
          <Text style={styles.sectionTitle}>How to earn</Text>
          <Pressable accessibilityRole="button" onPress={() => navigate('CustomerHowToEarn')}>
            <Text style={styles.sectionAction}>See all</Text>
          </Pressable>
        </View>
        {activeOpportunities.map((item) => (
          <View key={item.id} style={styles.opportunityRow}>
            <View style={styles.opportunityIcon}>
              <Ionicons color={colors.brandDark} name="sparkles-outline" size={16} />
            </View>
            <View style={styles.opportunityBody}>
              <Text style={styles.opportunityTitle}>{item.label}</Text>
              <Text style={styles.opportunityCopy}>{item.description}</Text>
            </View>
            <Text style={styles.opportunityPoints}>{formatPoints(item.points)}</Text>
          </View>
        ))}
      </Card>

      <Card style={styles.sectionCard}>
        <View style={styles.sectionHeading}>
          <Text style={styles.sectionTitle}>Rating summary</Text>
          <Pressable accessibilityRole="button" onPress={() => navigate('CustomerRatingSummary')}>
            <Text style={styles.sectionAction}>Open</Text>
          </Pressable>
        </View>
        <Text style={styles.copy}>
          Helpers rate your marketplace conduct per completed job. These ratings affect trust and membership eligibility.
        </Text>
      </Card>

      <Card style={styles.sectionCard}>
        <View style={styles.sectionHeading}>
          <Text style={styles.sectionTitle}>Service-credit preview</Text>
          <Pressable accessibilityRole="button" onPress={() => navigate('CustomerRedemptionPreview')}>
            <Text style={styles.sectionAction}>Preview</Text>
          </Pressable>
        </View>
        <Text style={styles.copy}>
          Uncedo Points are not cash. Only available points can become service credit, and booking limits still apply.
        </Text>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 14,
    paddingBottom: 32,
  },
  stateWrap: {
    gap: 12,
    padding: 24,
  },
  inlineMessageCard: {
    backgroundColor: '#fff7ed',
    borderColor: '#fdba74',
    gap: 4,
  },
  inlineMessageText: {
    color: '#9a3412',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
  },
  heroCard: {
    gap: 14,
  },
  heroRow: {
    alignItems: 'stretch',
    flexDirection: 'row',
    gap: 12,
  },
  heroBlock: {
    flex: 1,
    gap: 6,
  },
  heroDivider: {
    backgroundColor: colors.border,
    width: 1,
  },
  heroLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  heroValue: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '900',
  },
  heroSubValue: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
  },
  heroMetaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  statPill: {
    backgroundColor: '#faf5ff',
    borderColor: '#f5d0fe',
    borderRadius: 18,
    borderWidth: 1,
    flexGrow: 1,
    gap: 4,
    minWidth: '30%',
    padding: 12,
  },
  statLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  statValue: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '900',
  },
  statHint: {
    color: colors.muted,
    fontSize: 11,
    lineHeight: 16,
  },
  linkRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  linkButton: {
    alignItems: 'center',
    backgroundColor: '#fafafa',
    borderColor: colors.border,
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  linkButtonText: {
    color: colors.brandDark,
    fontSize: 13,
    fontWeight: '800',
  },
  sectionCard: {
    gap: 12,
  },
  sectionHeading: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '900',
  },
  sectionAction: {
    color: colors.brandDark,
    fontSize: 13,
    fontWeight: '800',
  },
  copy: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
  },
  progressTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '800',
  },
  progressTrack: {
    backgroundColor: '#f3e8ff',
    borderRadius: 999,
    height: 10,
    overflow: 'hidden',
  },
  progressFill: {
    backgroundColor: colors.brand,
    borderRadius: 999,
    height: '100%',
  },
  requirementRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  requirementLabel: {
    color: colors.text,
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
  },
  requirementValue: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
  },
  opportunityRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  opportunityIcon: {
    alignItems: 'center',
    backgroundColor: 'rgba(217,70,239,0.10)',
    borderRadius: 14,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  opportunityBody: {
    flex: 1,
    gap: 2,
  },
  opportunityTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '800',
  },
  opportunityCopy: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
  },
  opportunityPoints: {
    color: colors.brandDark,
    fontSize: 12,
    fontWeight: '900',
  },
});
