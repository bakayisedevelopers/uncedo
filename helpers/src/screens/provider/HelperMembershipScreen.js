import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ActionButton, Card, EmptyState, Screen, SectionHeading } from '../../components/app/HelperUi';
import { MembershipBadge } from '../../components/rewards/RewardBadges';
import { useAuth } from '../../context/AuthContext';
import { useHelpersApp } from '../../context/HelpersAppContext';
import { getMyRewardAccount, getMyRatingSummary, getRewardConfig } from '../../services/rewards/rewardClientService';
import { buildMembershipProgressModel, formatPercent, getHelperBenefits, getMembershipDisplayMeta } from '../../services/rewards/rewardPresentation';
import { REWARD_CONFIG_DOCS, MEMBERSHIP_LEVELS } from '../../shared/rewards';
import { colors } from '../../theme/colors';

export function HelperMembershipScreen({ goBack }) {
  const { user } = useAuth();
  const { profile } = useHelpersApp();
  const [rewardAccount, setRewardAccount] = useState(null);
  const [ratingSummary, setRatingSummary] = useState(null);
  const [membershipConfig, setMembershipConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!user?.uid) {
      return;
    }

    setError('');
    try {
      const [account, rating, config] = await Promise.all([
        getMyRewardAccount(),
        getMyRatingSummary(),
        getRewardConfig(REWARD_CONFIG_DOCS.MEMBERSHIP, { force: true }),
      ]);
      setRewardAccount(account);
      setRatingSummary(rating);
      setMembershipConfig(config);
    } catch (nextError) {
      setError(nextError.message || 'Unable to load helper membership.');
    } finally {
      setLoading(false);
    }
  }, [user?.uid]);

  useEffect(() => {
    load();
  }, [load]);

  const progress = buildMembershipProgressModel({
    rewardAccount,
    ratingSummary,
    membershipConfig,
    profileMetrics: profile?.metrics,
    verificationStatus: profile?.verificationStatus,
  });
  const currentLevel = rewardAccount?.membership?.currentLevel || 'neighbour';

  return (
    <Screen
      title="Membership"
      description="Helper membership measures your overall relationship with Uncedo across reliability, ratings, verification, and completed paid jobs."
      footerAction={<ActionButton label="Back to rewards" tone="secondary" onPress={() => goBack('HelperRewardsOverview')} />}
    >
      {error ? (
        <Card style={styles.warningCard}>
          <Text style={styles.warningText}>{error}</Text>
        </Card>
      ) : null}

      <Card>
        {loading ? (
          <EmptyState title="Loading membership" description="Reading your trusted membership snapshot." />
        ) : (
          <>
            <MembershipBadge level={currentLevel} restricted={Boolean(profile?.blocked || profile?.suspended)} subtitle="Current helper membership" variant="expanded" />
            <Text style={styles.copy}>
              Highest achieved level: {getMembershipDisplayMeta(rewardAccount?.membership?.highestLevel || currentLevel).label}
            </Text>
            <Text style={styles.copy}>
              Redeeming or expiring points does not lower membership. Membership stays based on trusted performance and account standing.
            </Text>
          </>
        )}
      </Card>

      <Card>
        <SectionHeading title="Current progress" subtitle="Display-only progress is built from trusted backend metrics and config." />
        <View style={styles.requirementList}>
          {(progress?.requirements || []).map((item) => (
            <View key={item.label} style={styles.requirementRow}>
              <View style={styles.requirementCopy}>
                <Text style={styles.requirementTitle}>{item.label}</Text>
                <Text style={styles.requirementMeta}>{item.current} / {item.target}</Text>
              </View>
              <Text style={[styles.requirementState, item.met && styles.requirementMet]}>{item.met ? 'Met' : 'In progress'}</Text>
            </View>
          ))}
        </View>
        <Text style={styles.copy}>Completion rate: {formatPercent(profile?.metrics?.completionRate || 0)} - Cancellation rate: {formatPercent(profile?.metrics?.cancellationRate || 0)}</Text>
      </Card>

      {MEMBERSHIP_LEVELS.map((level) => {
        const meta = getMembershipDisplayMeta(level);
        const rule = membershipConfig?.helper?.[level] || {};
        return (
          <Card key={level}>
            <MembershipBadge level={level} subtitle={`${meta.label} helper membership`} variant="expanded" />
            <Text style={styles.copy}>Completed paid jobs: {Number(rule.minCompletedPaidJobs || 0)}</Text>
            <Text style={styles.copy}>Overall rating: {Number(rule.minAverageRating || 0).toFixed(1)} - Ratings required: {Number(rule.minRatingCount || 0)}</Text>
            <Text style={styles.copy}>Completion rate: {formatPercent(rule.minCompletionRate || 0)} - Maximum cancellation rate: {formatPercent(rule.maxCancellationRate || 0)}</Text>
            <Text style={styles.copy}>Verified helper required: {rule.requireVerified ? 'Yes' : 'No'}</Text>
            <View style={styles.benefitList}>
              {getHelperBenefits(level).map((benefit) => (
                <Text key={`${level}-${benefit.label}`} style={styles.benefitItem}>
                  {benefit.label} {benefit.availability === 'planned' ? '(planned)' : ''}
                </Text>
              ))}
            </View>
          </Card>
        );
      })}
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
  copy: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
  },
  requirementList: {
    gap: 12,
  },
  requirementRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  requirementCopy: {
    flex: 1,
    gap: 2,
  },
  requirementTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '800',
  },
  requirementMeta: {
    color: colors.muted,
    fontSize: 12,
  },
  requirementState: {
    color: colors.brandDark,
    fontSize: 12,
    fontWeight: '800',
  },
  requirementMet: {
    color: '#166534',
  },
  benefitList: {
    gap: 6,
  },
  benefitItem: {
    color: colors.text,
    fontSize: 13,
    lineHeight: 19,
  },
});
