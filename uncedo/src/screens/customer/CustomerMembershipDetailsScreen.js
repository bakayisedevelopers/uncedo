import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Card } from '../../components/ui/Card';
import { EmptyState, LoadingState } from '../../components/ui/States';
import { StickyScreenHeader } from '../../components/ui/StickyScreenHeader';
import { MembershipBadge } from '../../components/customer/rewards/MembershipBadge';
import { useAuth } from '../../context/AuthContext';
import { getRewardConfigs, subscribeToRatingSummary, subscribeToRewardAccount } from '../../services/rewards/rewardClientService';
import { recordRewardUiEvent } from '../../services/rewards/rewardAnalyticsService';
import {
  buildMembershipProgressModel,
  getMembershipBenefits,
  getMembershipDisplayMeta,
} from '../../services/rewards/rewardPresentation';
import { colors } from '../../theme/colors';

const ORDERED_LEVELS = ['neighbour', 'partner', 'friend', 'family'];

export function CustomerMembershipDetailsScreen({ navigate }) {
  const { user } = useAuth();
  const [rewardAccount, setRewardAccount] = useState(null);
  const [ratingSummary, setRatingSummary] = useState(null);
  const [membershipConfig, setMembershipConfig] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    recordRewardUiEvent(user?.uid, 'membership_screen_viewed');
  }, [user?.uid]);

  useEffect(() => {
    if (!user?.uid) {
      setLoading(false);
      return () => {};
    }

    getRewardConfigs().then((configs) => {
      setMembershipConfig(configs?.membershipConfig || null);
      setLoading(false);
    }).catch(() => setLoading(false));

    const unsubReward = subscribeToRewardAccount(user.uid, setRewardAccount, () => setLoading(false));
    const unsubRating = subscribeToRatingSummary(user.uid, setRatingSummary, () => setLoading(false));

    return () => {
      unsubReward?.();
      unsubRating?.();
    };
  }, [user?.uid]);

  const progress = useMemo(
    () => buildMembershipProgressModel({
      rewardAccount,
      ratingSummary,
      membershipConfig: membershipConfig || {},
    }),
    [membershipConfig, ratingSummary, rewardAccount],
  );

  if (loading) {
    return <LoadingState label="Loading membership" />;
  }

  if (!membershipConfig) {
    return <EmptyState title="Membership details unavailable" message="Reward configuration is missing for this environment." />;
  }

  return (
    <ScrollView contentContainerStyle={styles.wrap} showsVerticalScrollIndicator={false} stickyHeaderIndices={[0]}>
      <StickyScreenHeader
        backLabel="Back to rewards"
        onBack={() => navigate('CustomerRewardsOverview')}
        title="Membership"
        subtitle="Membership reflects loyalty and respectful marketplace participation, not how many points you spend."
      >
        <MembershipBadge
          level={rewardAccount?.membership?.currentLevel}
          restricted={Boolean(rewardAccount?.membership?.qualificationSnapshot?.restrictedStatus)}
          variant="expanded"
        />
      </StickyScreenHeader>

      <Card style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Current standing</Text>
        <Text style={styles.copy}>
          Current level: {getMembershipDisplayMeta(rewardAccount?.membership?.currentLevel).label}. Highest achieved:{' '}
          {getMembershipDisplayMeta(rewardAccount?.membership?.highestLevel).label}.
        </Text>
        <Text style={styles.copy}>
          Redeeming or expiring points does not reduce membership. Poor ratings or serious restrictions can still affect current qualification.
        </Text>
      </Card>

      {progress.nextLevel ? (
        <Card style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Progress to {getMembershipDisplayMeta(progress.nextLevel).label}</Text>
          {progress.requirements.map((item) => (
            <View key={item.key} style={styles.requirementRow}>
              <View style={styles.requirementCopy}>
                <Text style={styles.requirementTitle}>{item.label}</Text>
                <Text style={styles.requirementBody}>
                  {item.key === 'average_rating'
                    ? `${Number(item.current || 0).toFixed(1)} / ${Number(item.target || 0).toFixed(1)}`
                    : `${Math.round(Number(item.current || 0))} / ${Math.round(Number(item.target || 0))}`}
                </Text>
              </View>
              <Text style={[styles.requirementStatus, item.met ? styles.metText : styles.pendingText]}>
                {item.met ? 'Met' : 'In progress'}
              </Text>
            </View>
          ))}
        </Card>
      ) : null}

      {ORDERED_LEVELS.map((level) => {
        const meta = getMembershipDisplayMeta(level);
        const benefits = getMembershipBenefits(level, membershipConfig);
        const rules = membershipConfig?.customer?.[level] || {};

        return (
          <Card key={level} style={styles.sectionCard}>
            <MembershipBadge level={level} variant="expanded" subtitle={`${meta.label} membership`} />
            <View style={styles.ruleList}>
              <Text style={styles.ruleLine}>Completed paid bookings: at least {Math.round(Number(rules.minCompletedPaidBookings || 0))}</Text>
              <Text style={styles.ruleLine}>Overall rating: at least {Number(rules.minAverageRating || 0).toFixed(1)}</Text>
              <Text style={styles.ruleLine}>Received ratings: at least {Math.round(Number(rules.minRatingCount || 0))}</Text>
              {rules.requireNoSevereConductRestriction ? (
                <Text style={styles.ruleLine}>Severe conduct restriction: none unresolved</Text>
              ) : null}
              {typeof rules.maxCancellationRate === 'number' ? (
                <Text style={styles.ruleLine}>Cancellation / no-show standing: within configured threshold</Text>
              ) : null}
            </View>
            <View style={styles.benefitList}>
              {benefits.map((benefit) => (
                <Text key={`${level}_${benefit.label}`} style={styles.benefitLine}>
                  • {benefit.label}{benefit.availability === 'planned' ? ' (planned)' : ''}
                </Text>
              ))}
            </View>
          </Card>
        );
      })}
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
  requirementRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  requirementCopy: {
    flex: 1,
    gap: 4,
  },
  requirementTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '800',
  },
  requirementBody: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
  },
  requirementStatus: {
    fontSize: 12,
    fontWeight: '900',
  },
  metText: {
    color: '#15803d',
  },
  pendingText: {
    color: colors.warning,
  },
  ruleList: {
    gap: 6,
  },
  ruleLine: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  benefitList: {
    gap: 6,
  },
  benefitLine: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
  },
});
