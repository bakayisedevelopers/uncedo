import { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ActionButton, Card, EmptyState, Screen } from '../../components/app/HelperUi';
import { MasteryBadge } from '../../components/rewards/RewardBadges';
import { useAuth } from '../../context/AuthContext';
import { useHelpersApp } from '../../context/HelpersAppContext';
import { getHelperMasteryRecord, getRewardConfig, getServiceRatingSummary } from '../../services/rewards/rewardClientService';
import { buildMasteryProgressModel } from '../../services/rewards/rewardPresentation';
import { REWARD_CONFIG_DOCS, MASTERY_LEVELS } from '../../shared/rewards';
import { colors } from '../../theme/colors';

export function HelperServiceMasteryDetailsScreen({ route, goBack }) {
  const { user } = useAuth();
  const { helperServiceOfferings, serviceCatalog } = useHelpersApp();
  const serviceId = String(route?.params?.serviceId || '').trim();
  const [mastery, setMastery] = useState(null);
  const [ratingSummary, setRatingSummary] = useState(null);
  const [masteryConfig, setMasteryConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!user?.uid || !serviceId) {
      return;
    }

    setError('');
    try {
      const [nextMastery, nextRating, config] = await Promise.all([
        getHelperMasteryRecord(user.uid, serviceId),
        getServiceRatingSummary(user.uid, serviceId),
        getRewardConfig(REWARD_CONFIG_DOCS.MASTERY, { force: true }),
      ]);
      setMastery(nextMastery);
      setRatingSummary(nextRating);
      setMasteryConfig(config);
    } catch (nextError) {
      setError(nextError.message || 'Unable to load service mastery details.');
    } finally {
      setLoading(false);
    }
  }, [serviceId, user?.uid]);

  useEffect(() => {
    load();
  }, [load]);

  const serviceEntry = useMemo(() => (
    helperServiceOfferings.find((item) => String(item.serviceId || '').trim() === serviceId)
    || serviceCatalog.find((item) => String(item.id || '').trim() === serviceId)
    || null
  ), [helperServiceOfferings, serviceCatalog, serviceId]);

  const progress = buildMasteryProgressModel({
    mastery,
    masteryConfig,
    ratingSummary,
  });

  return (
    <Screen
      title={serviceEntry?.serviceName || serviceEntry?.label || serviceId || 'Service mastery'}
      description="This is your Uncedo service experience level for one service. It is not a statutory or trade certification."
      footerAction={<ActionButton label="Back to mastery" tone="secondary" onPress={() => goBack('HelperServiceMasteryOverview')} />}
    >
      {error ? (
        <Card style={styles.warningCard}>
          <Text style={styles.warningText}>{error}</Text>
        </Card>
      ) : null}

      {loading ? (
        <Card>
          <EmptyState title="Loading mastery details" description="Reading per-service job, rating, and mastery records." />
        </Card>
      ) : (
        <>
          <Card>
            <MasteryBadge
              level={mastery?.level || 'beginner'}
              subtitle={`Highest achieved: ${String(mastery?.highestLevel || mastery?.level || 'beginner')}`}
              variant="expanded"
            />
            <Text style={styles.copy}>Eligible completed jobs: {Number(mastery?.eligibleCompletedJobCount || mastery?.qualificationSnapshot?.eligibleCompletedJobCount || 0)}</Text>
            <Text style={styles.copy}>Average service rating: {Number(ratingSummary?.average || mastery?.averageRating || 0) > 0 ? Number(ratingSummary?.average || mastery?.averageRating || 0).toFixed(1) : 'No ratings yet'}</Text>
            <Text style={styles.copy}>Received service ratings: {Number(ratingSummary?.count || mastery?.ratingCount || 0)}</Text>
          </Card>

          <Card>
            <Text style={styles.sectionTitle}>Progress to next level</Text>
            {!progress?.nextLevel ? (
              <Text style={styles.copy}>You are already at the highest configured mastery level for this service.</Text>
            ) : (
              <View style={styles.requirementList}>
                {progress.requirements.map((item) => (
                  <View key={item.label} style={styles.requirementRow}>
                    <View style={styles.requirementCopy}>
                      <Text style={styles.requirementTitle}>{item.label}</Text>
                      <Text style={styles.requirementMeta}>{item.current} / {item.target}</Text>
                    </View>
                    <Text style={[styles.requirementState, item.met && styles.requirementMet]}>{item.met ? 'Met' : 'In progress'}</Text>
                  </View>
                ))}
              </View>
            )}
          </Card>

          {MASTERY_LEVELS.map((level) => {
            const rule = masteryConfig?.[level] || {};
            return (
              <Card key={level}>
                <MasteryBadge level={level} subtitle={`${level} service mastery`} variant="expanded" />
                <Text style={styles.copy}>Completed paid jobs: {Number(rule.minCompletedPaidJobs || 0)}</Text>
                <Text style={styles.copy}>Average service rating: {Number(rule.minAverageRating || 0).toFixed(1)}</Text>
                <Text style={styles.copy}>Service rating count: {Number(rule.minRatingCount || 0)}</Text>
              </Card>
            );
          })}
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
  sectionTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '900',
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
});
