import { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { ActionButton, Card, EmptyState, MetricCard, Screen, SectionHeading } from '../../components/app/HelperUi';
import { RatingDistributionCard, ServiceMasteryRow } from '../../components/rewards/RewardWidgets';
import { useAuth } from '../../context/AuthContext';
import { useHelpersApp } from '../../context/HelpersAppContext';
import { getMyRatingSummary, getServiceRatingSummaries } from '../../services/rewards/rewardClientService';
import { colors } from '../../theme/colors';

export function HelperRatingSummaryScreen({ navigate, goBack }) {
  const { user } = useAuth();
  const { serviceCatalog } = useHelpersApp();
  const [ratingSummary, setRatingSummary] = useState(null);
  const [serviceRatings, setServiceRatings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!user?.uid) {
      return;
    }

    setError('');
    try {
      const [overall, services] = await Promise.all([
        getMyRatingSummary(),
        getServiceRatingSummaries(user.uid),
      ]);
      setRatingSummary(overall);
      setServiceRatings(services);
    } catch (nextError) {
      setError(nextError.message || 'Unable to load helper ratings.');
    } finally {
      setLoading(false);
    }
  }, [user?.uid]);

  useEffect(() => {
    load();
  }, [load]);

  const catalogMap = useMemo(() => new Map((serviceCatalog || []).map((item) => [String(item.id || '').trim(), item])), [serviceCatalog]);

  return (
    <Screen
      title="Ratings"
      description="Review overall helper ratings, service-specific ratings, and how rating quality affects membership and service mastery."
      footerAction={<ActionButton label="Back to rewards" tone="secondary" onPress={() => goBack('HelperRewardsOverview')} />}
    >
      {error ? (
        <Card style={styles.warningCard}>
          <Text style={styles.warningText}>{error}</Text>
        </Card>
      ) : null}

      <Card>
        <SectionHeading title="Overall helper rating" subtitle="Only trusted normalized ratings affect this summary." />
        {loading ? (
          <EmptyState title="Loading ratings" description="Reading your helper rating summary." />
        ) : (
          <>
            <MetricCard label="Average rating" value={Number(ratingSummary?.overallAverage || 0) > 0 ? Number(ratingSummary?.overallAverage || 0).toFixed(1) : 'New'} />
            <MetricCard label="Total ratings" value={String(ratingSummary?.overallCount || 0)} accent="muted" />
            <Text style={styles.copy}>Customer identity details stay private here. Rating changes can affect membership and service mastery but are still computed authoritatively on the backend.</Text>
          </>
        )}
      </Card>

      <RatingDistributionCard ratingSummary={ratingSummary} />

      <Card>
        <SectionHeading title="Service-specific ratings" subtitle="Each service can have a different trust profile and mastery outcome." />
        {!serviceRatings.length ? (
          <EmptyState title="No service ratings yet" description="Service-specific ratings will appear after customers rate completed jobs." />
        ) : (
          serviceRatings.map((item) => (
            <ServiceMasteryRow
              key={item.id}
              categoryName={catalogMap.get(item.id)?.categoryName || ''}
              mastery={{ serviceId: item.id, level: 'beginner' }}
              onPress={() => navigate({ key: 'HelperServiceRatingDetails', params: { serviceId: item.id } })}
              ratingSummary={item}
              serviceName={catalogMap.get(item.id)?.label || catalogMap.get(item.id)?.serviceName || item.id}
            />
          ))
        )}
      </Card>
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
});
