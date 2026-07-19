import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Card } from '../../components/ui/Card';
import { EmptyState, LoadingState } from '../../components/ui/States';
import { StickyScreenHeader } from '../../components/ui/StickyScreenHeader';
import { useAuth } from '../../context/AuthContext';
import { getRewardAccount, getRewardConfigs } from '../../services/rewards/rewardClientService';
import { recordRewardUiEvent } from '../../services/rewards/rewardAnalyticsService';
import { formatPoints, formatPointsToRand } from '../../services/rewards/rewardPresentation';
import { colors } from '../../theme/colors';

export function CustomerRedemptionPreviewScreen({ navigate }) {
  const { user } = useAuth();
  const [rewardAccount, setRewardAccount] = useState(null);
  const [configs, setConfigs] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    recordRewardUiEvent(user?.uid, 'redemption_preview_viewed');
  }, [user?.uid]);

  useEffect(() => {
    if (!user?.uid) {
      setLoading(false);
      return;
    }

    Promise.all([
      getRewardAccount(user.uid),
      getRewardConfigs(),
    ]).then(([account, rewardConfigs]) => {
      setRewardAccount(account);
      setConfigs(rewardConfigs);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [user?.uid]);

  if (loading) {
    return <LoadingState label="Loading redemption preview" />;
  }

  if (!configs?.globalConfig) {
    return <EmptyState title="Redemption preview unavailable" message="Reward configuration is missing for this environment." />;
  }

  const globalConfig = configs.globalConfig || {};
  const featureFlags = globalConfig.featureFlags || {};

  return (
    <ScrollView contentContainerStyle={styles.wrap} showsVerticalScrollIndicator={false} stickyHeaderIndices={[0]}>
      <StickyScreenHeader
        backLabel="Back to rewards"
        onBack={() => navigate('CustomerRewardsOverview')}
        title="Service-credit preview"
        subtitle="This preview does not deduct points and does not create a redemption. It only explains the current configured rules."
      />

      <Card style={styles.sectionCard}>
        <Text style={styles.metricLabel}>Available points</Text>
        <Text style={styles.metricValue}>{formatPoints(rewardAccount?.availablePoints || 0)}</Text>
        <Text style={styles.metricHint}>{formatPointsToRand(rewardAccount?.availablePoints || 0, globalConfig.pointsPerRand || 10)} estimated service credit</Text>
      </Card>

      <Card style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Configured rules</Text>
        <Text style={styles.copy}>Public conversion: {formatPoints(globalConfig.pointsPerRand || 10)} = R1.00 service credit</Text>
        <Text style={styles.copy}>Minimum redemption threshold: {formatPoints(globalConfig.minimumCustomerRedemptionPoints || 0)}</Text>
        <Text style={styles.copy}>Redemption increment: {formatPoints(globalConfig.redemptionIncrementPoints || 0)}</Text>
        <Text style={styles.copy}>Maximum booking percentage covered: {Math.round(Number(globalConfig.maximumServiceCreditPercentagePerBooking || 0))}%</Text>
      </Card>

      <Card style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>What this can and cannot do</Text>
        <Text style={styles.copy}>Only available points can be used. Pending points are not redeemable. Uncedo Points are not withdrawable cash and stay separate from your debt wallet.</Text>
        <Text style={styles.copy}>Actual redemption against payment is still deferred in this app unless a validated backend redemption flow is enabled later.</Text>
      </Card>

      <Card style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Current action state</Text>
        <Text style={styles.copy}>
          {featureFlags.redemptionEnabled
            ? 'Redemption is flagged on in configuration, but this customer phase only shows a safe preview until a validated redemption contract is integrated.'
            : 'Redemption is currently shown as coming soon.'}
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
  sectionCard: {
    gap: 12,
  },
  metricLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  metricValue: {
    color: colors.text,
    fontSize: 34,
    fontWeight: '900',
  },
  metricHint: {
    color: colors.muted,
    fontSize: 13,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '900',
  },
  copy: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
  },
});
