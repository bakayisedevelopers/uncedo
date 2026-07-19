import { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { ActionButton, Card, EmptyState, Screen, SectionHeading } from '../../components/app/HelperUi';
import { ServiceMasteryRow } from '../../components/rewards/RewardWidgets';
import { useAuth } from '../../context/AuthContext';
import { useHelpersApp } from '../../context/HelpersAppContext';
import { getMyHelperMasterySummary, getServiceRatingSummaries } from '../../services/rewards/rewardClientService';
import { colors } from '../../theme/colors';

export function HelperServiceMasteryOverviewScreen({ navigate, goBack }) {
  const { user } = useAuth();
  const { helperServiceOfferings, serviceCatalog } = useHelpersApp();
  const [mastery, setMastery] = useState([]);
  const [serviceRatings, setServiceRatings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!user?.uid) {
      return;
    }

    setError('');
    try {
      const [nextMastery, nextRatings] = await Promise.all([
        getMyHelperMasterySummary(),
        getServiceRatingSummaries(user.uid),
      ]);
      setMastery(nextMastery);
      setServiceRatings(nextRatings);
    } catch (nextError) {
      setError(nextError.message || 'Unable to load service mastery.');
    } finally {
      setLoading(false);
    }
  }, [user?.uid]);

  useEffect(() => {
    load();
  }, [load]);

  const serviceItems = useMemo(() => {
    const map = new Map();
    helperServiceOfferings.forEach((offering) => {
      map.set(String(offering.serviceId || '').trim(), {
        serviceId: String(offering.serviceId || '').trim(),
        serviceName: offering.serviceName || offering.serviceId || 'Service',
        categoryId: offering.categoryId || '',
      });
    });
    mastery.forEach((item) => {
      const existing = map.get(String(item.serviceId || item.id || '').trim()) || {
        serviceId: String(item.serviceId || item.id || '').trim(),
        serviceName: item.serviceId || item.id || 'Service',
        categoryId: item.categoryId || '',
      };
      map.set(existing.serviceId, existing);
    });
    return [...map.values()].sort((left, right) => left.serviceName.localeCompare(right.serviceName));
  }, [helperServiceOfferings, mastery]);

  const ratingMap = useMemo(() => new Map(serviceRatings.map((item) => [String(item.id || '').trim(), item])), [serviceRatings]);
  const masteryMap = useMemo(() => new Map(mastery.map((item) => [String(item.id || item.serviceId || '').trim(), item])), [mastery]);
  const catalogMap = useMemo(() => new Map((serviceCatalog || []).map((item) => [String(item.id || '').trim(), item])), [serviceCatalog]);

  return (
    <Screen
      title="Service mastery"
      description="Mastery is earned independently per service and stays separate from your overall helper membership."
      footerAction={<ActionButton label="Back to rewards" tone="secondary" onPress={() => goBack('HelperRewardsOverview')} />}
    >
      {error ? (
        <Card style={styles.warningCard}>
          <Text style={styles.warningText}>{error}</Text>
        </Card>
      ) : null}

      <Card>
        <SectionHeading
          title="Your offered services"
          subtitle="Each service can have its own Beginner, Specialist, Master, or Legend level."
        />
        {loading ? (
          <EmptyState title="Loading mastery" description="Reading trusted service mastery and service rating records." />
        ) : !serviceItems.length ? (
          <EmptyState title="No services yet" description="Add approved services first and mastery will appear per service as jobs and ratings come in." />
        ) : (
          serviceItems.map((item) => (
            <ServiceMasteryRow
              key={item.serviceId}
              categoryName={catalogMap.get(item.serviceId)?.categoryName || item.categoryId || ''}
              mastery={masteryMap.get(item.serviceId) || { serviceId: item.serviceId, level: 'beginner' }}
              onPress={() => navigate({ key: 'HelperServiceMasteryDetails', params: { serviceId: item.serviceId } })}
              ratingSummary={ratingMap.get(item.serviceId) || {}}
              serviceName={catalogMap.get(item.serviceId)?.label || item.serviceName}
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
});
