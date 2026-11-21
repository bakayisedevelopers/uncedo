import { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ActionButton, Card, EmptyState, Screen } from '../../components/app/HelperUi';
import { MasteryBadge } from '../../components/rewards/RewardBadges';
import { useAuth } from '../../context/AuthContext';
import { useHelpersApp } from '../../context/HelpersAppContext';
import {
  getHelperMasteryRecord,
  getHelperServiceOptionMasteryRecord,
  getRewardConfig,
  getServiceOptionRatingSummary,
  getServiceRatingSummary,
} from '../../services/rewards/rewardClientService';
import { buildMasteryProgressModel } from '../../services/rewards/rewardPresentation';
import {
  buildServiceOptionMasteryKey,
  MASTERY_LEVELS,
  normalizeRewardToken,
  REWARD_CONFIG_DOCS,
} from '../../shared/rewards';
import { colors } from '../../theme/colors';

export function HelperServiceMasteryDetailsScreen({ route, goBack }) {
  const { user } = useAuth();
  const { helperServiceOfferings, serviceCatalog } = useHelpersApp();
  const serviceId = String(route?.params?.serviceId || '').trim();
  const optionId = normalizeRewardToken(route?.params?.optionId || '');
  const paramOptionTitle = String(route?.params?.optionTitle || '').trim();
  const masteryKey = String(route?.params?.masteryKey || buildServiceOptionMasteryKey(serviceId, optionId) || serviceId).trim();
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
      const [optionMasteryDoc, optionRatingDoc, config] = await Promise.all([
        getHelperServiceOptionMasteryRecord(user.uid, masteryKey),
        getServiceOptionRatingSummary(user.uid, masteryKey),
        getRewardConfig(REWARD_CONFIG_DOCS.MASTERY, { force: true }),
      ]);
      const [fallbackMastery, fallbackRating] = !optionId && (!optionMasteryDoc || !optionRatingDoc)
        ? await Promise.all([
          optionMasteryDoc ? null : getHelperMasteryRecord(user.uid, serviceId),
          optionRatingDoc ? null : getServiceRatingSummary(user.uid, serviceId),
        ])
        : [null, null];

      setMastery(optionMasteryDoc || fallbackMastery || null);
      setRatingSummary(optionRatingDoc || fallbackRating || null);
      setMasteryConfig(config);
    } catch (nextError) {
      setError(nextError.message || 'Unable to load service mastery details.');
    } finally {
      setLoading(false);
    }
  }, [masteryKey, optionId, serviceId, user?.uid]);

  useEffect(() => {
    load();
  }, [load]);

  const serviceEntry = useMemo(() => (
    helperServiceOfferings.find((item) => (
      String(item.serviceId || '').trim() === serviceId
      && normalizeRewardToken(item.optionId || '') === optionId
    ))
    || helperServiceOfferings.find((item) => String(item.serviceId || '').trim() === serviceId)
    || serviceCatalog.find((item) => String(item.id || '').trim() === serviceId)
    || null
  ), [helperServiceOfferings, optionId, serviceCatalog, serviceId]);

  const optionTitle = paramOptionTitle || mastery?.optionTitle || serviceEntry?.optionTitle || '';
  const serviceTitle = serviceEntry?.serviceName || serviceEntry?.label || serviceId || 'Service mastery';
  const screenTitle = optionTitle ? `${serviceTitle} — ${optionTitle}` : serviceTitle;

  const progress = buildMasteryProgressModel({
    mastery,
    masteryConfig,
    ratingSummary,
  });

  return (
    <Screen
      title={screenTitle}
      description="This is your Uncedo service experience level for one service option. It is not a statutory or trade certification."
      footerAction={<ActionButton label="Back to mastery" tone="secondary" onPress={() => goBack('HelperServiceMasteryOverview')} />}
    >
      {error ? (
        <Card style={styles.warningCard}>
          <Text style={styles.warningText}>{error}</Text>
        </Card>
      ) : null}

      {loading ? (
        <Card>
          <EmptyState title="Loading mastery details" description="Reading per-option job, rating, and mastery records." />
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
            <Text style={styles.copy}>Average option rating: {Number(ratingSummary?.average || mastery?.averageRating || 0) > 0 ? Number(ratingSummary?.average || mastery?.averageRating || 0).toFixed(1) : 'No ratings yet'}</Text>
            <Text style={styles.copy}>Received option ratings: {Number(ratingSummary?.count || mastery?.ratingCount || 0)}</Text>
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
