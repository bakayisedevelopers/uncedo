import { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { ActionButton, Card, EmptyState, Screen, SectionHeading } from '../../components/app/HelperUi';
import { MembershipBadge, MasteryBadge } from '../../components/rewards/RewardBadges';
import { useAuth } from '../../context/AuthContext';
import { refreshHelperRewardBundle } from '../../services/rewards/rewardClientService';
import { buildAnnualRecognitionPreview, formatPoints, getRecognitionBenefits } from '../../services/rewards/rewardPresentation';
import { colors } from '../../theme/colors';

export function HelperRecognitionScreen({ goBack }) {
  const { user } = useAuth();
  const [bundle, setBundle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!user?.uid) {
      return;
    }

    setError('');
    try {
      setBundle(await refreshHelperRewardBundle({ userId: user.uid, forceConfig: true }));
    } catch (nextError) {
      setError(nextError.message || 'Unable to load recognition data.');
    } finally {
      setLoading(false);
    }
  }, [user?.uid]);

  useEffect(() => {
    load();
  }, [load]);

  const topMastery = useMemo(
    () => [...(bundle?.mastery || [])].sort((left, right) => (
      Number(right?.qualificationSnapshot?.eligibleCompletedJobCount || 0) - Number(left?.qualificationSnapshot?.eligibleCompletedJobCount || 0)
    ))[0] || null,
    [bundle?.mastery],
  );
  const annualRecognition = buildAnnualRecognitionPreview(bundle?.helperConfig || {}, bundle?.rewardAccount || {});

  return (
    <Screen
      title="Recognition"
      description="Recognition combines helper membership, service mastery, and future annual appreciation programs without converting points into cash earnings."
      footerAction={<ActionButton label="Back to rewards" tone="secondary" onPress={() => goBack('HelperRewardsOverview')} />}
    >
      {error ? (
        <Card style={styles.warningCard}>
          <Text style={styles.warningText}>{error}</Text>
        </Card>
      ) : null}

      {loading ? (
        <Card>
          <EmptyState title="Loading recognition" description="Reading your membership, top mastery, and annual recognition preview." />
        </Card>
      ) : (
        <>
          <Card>
            <SectionHeading title="Current badges" />
            <MembershipBadge level={bundle?.rewardAccount?.membership?.currentLevel} subtitle="Current helper membership" variant="expanded" />
            {topMastery ? <MasteryBadge level={topMastery.level} subtitle={`Top mastery - ${topMastery.serviceId}`} variant="expanded" /> : null}
          </Card>

          <Card>
            <SectionHeading title="Annual recognition" subtitle="Only shown as active when backend annual tiers exist." />
            <Text style={styles.copy}>Annual points: {formatPoints(annualRecognition.annualPoints || 0)}</Text>
            <Text style={styles.copy}>Status: {annualRecognition.active ? annualRecognition.tierLabel : 'Planned'}</Text>
            {annualRecognition.nextTarget ? <Text style={styles.copy}>Next target: {formatPoints(annualRecognition.nextTarget)}</Text> : null}
            {annualRecognition.resetDateLabel ? <Text style={styles.copy}>Reset date: {annualRecognition.resetDateLabel}</Text> : null}
          </Card>

          <Card>
            <SectionHeading title="Recognition benefits" subtitle="Only future-safe statements are shown here." />
            {getRecognitionBenefits().map((item) => (
              <Text key={item.label} style={styles.benefitItem}>{item.label} {item.availability === 'planned' ? '(planned)' : ''}</Text>
            ))}
          </Card>
        </>
      )}
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
  benefitItem: {
    color: colors.text,
    fontSize: 13,
    lineHeight: 19,
  },
});
