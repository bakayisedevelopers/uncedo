import { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { ActionButton, Card, EmptyState, Screen, SectionHeading } from '../../components/app/HelperUi';
import { ServiceMasteryRow } from '../../components/rewards/RewardWidgets';
import { useAuth } from '../../context/AuthContext';
import { useHelpersApp } from '../../context/HelpersAppContext';
import {
  getMyHelperMasterySummary,
  getMyHelperServiceOptionMasterySummary,
  getServiceOptionRatingSummaries,
  getServiceRatingSummaries,
} from '../../services/rewards/rewardClientService';
import { resolveOfferingMasteryRecord } from '../../services/rewards/rewardPresentation';
import { buildServiceOptionMasteryKey, normalizeRewardToken } from '../../shared/rewards';
import { colors } from '../../theme/colors';

export function HelperServiceMasteryOverviewScreen({ navigate, goBack }) {
  const { user } = useAuth();
  const { helperServiceOfferings, serviceCatalog } = useHelpersApp();
  const [mastery, setMastery] = useState([]);
  const [optionMastery, setOptionMastery] = useState([]);
  const [serviceRatings, setServiceRatings] = useState([]);
  const [optionRatings, setOptionRatings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!user?.uid) {
      return;
    }

    setError('');
    try {
      const [nextMastery, nextOptionMastery, nextRatings, nextOptionRatings] = await Promise.all([
        getMyHelperMasterySummary(),
        getMyHelperServiceOptionMasterySummary(),
        getServiceRatingSummaries(user.uid),
        getServiceOptionRatingSummaries(user.uid),
      ]);
      setMastery(nextMastery);
      setOptionMastery(nextOptionMastery);
      setServiceRatings(nextRatings);
      setOptionRatings(nextOptionRatings);
    } catch (nextError) {
      setError(nextError.message || 'Unable to load service mastery.');
    } finally {
      setLoading(false);
    }
  }, [user?.uid]);

  useEffect(() => {
    load();
  }, [load]);

  const catalogMap = useMemo(() => new Map((serviceCatalog || []).map((item) => [String(item.id || '').trim(), item])), [serviceCatalog]);
  const ratingMap = useMemo(() => new Map(serviceRatings.map((item) => [String(item.id || '').trim(), item])), [serviceRatings]);
  const optionRatingMap = useMemo(() => new Map(optionRatings.map((item) => [String(item.id || item.masteryKey || '').trim(), item])), [optionRatings]);
  const masteryMap = useMemo(() => new Map(mastery.map((item) => [String(item.id || item.serviceId || '').trim(), item])), [mastery]);
  const optionMasteryMap = useMemo(() => new Map(optionMastery.map((item) => [String(item.id || item.masteryKey || '').trim(), item])), [optionMastery]);

  const optionItems = useMemo(() => {
    const map = new Map();
    helperServiceOfferings.forEach((offering) => {
      const serviceId = String(offering.serviceId || '').trim();
      if (!serviceId) return;
      const optionId = normalizeRewardToken(offering.optionId || '');
      const masteryKey = buildServiceOptionMasteryKey(serviceId, optionId);
      const serviceLabel = catalogMap.get(serviceId)?.label || offering.serviceName || serviceId;
      const optionTitle = String(offering.optionTitle || '').trim();
      map.set(masteryKey, {
        masteryKey,
        serviceId,
        optionId,
        optionTitle,
        serviceName: serviceLabel,
        displayName: optionTitle ? `${serviceLabel} — ${optionTitle}` : serviceLabel,
        categoryId: offering.categoryId || '',
      });
    });
    optionMastery.forEach((item) => {
      const serviceId = String(item.serviceId || '').trim();
      const optionId = normalizeRewardToken(item.optionId || '');
      const masteryKey = String(item.masteryKey || item.id || buildServiceOptionMasteryKey(serviceId, optionId)).trim();
      if (!masteryKey || map.has(masteryKey)) return;
      const serviceLabel = catalogMap.get(serviceId)?.label || serviceId || 'Service';
      const optionTitle = String(item.optionTitle || '').trim();
      map.set(masteryKey, {
        masteryKey,
        serviceId: serviceId || masteryKey,
        optionId,
        optionTitle,
        serviceName: serviceLabel,
        displayName: optionTitle ? `${serviceLabel} — ${optionTitle}` : serviceLabel,
        categoryId: item.categoryId || '',
      });
    });
    if (!map.size) {
      mastery.forEach((item) => {
        const serviceId = String(item.serviceId || item.id || '').trim();
        if (!serviceId || map.has(serviceId)) return;
        const serviceLabel = catalogMap.get(serviceId)?.label || serviceId;
        map.set(serviceId, {
          masteryKey: serviceId,
          serviceId,
          optionId: '',
          optionTitle: '',
          serviceName: serviceLabel,
          displayName: serviceLabel,
          categoryId: item.categoryId || '',
        });
      });
    }
    return [...map.values()].sort((left, right) => left.displayName.localeCompare(right.displayName));
  }, [catalogMap, helperServiceOfferings, mastery, optionMastery]);

  return (
    <Screen
      title="Service mastery"
      description="Mastery is earned independently per service option and stays separate from your overall helper membership."
      footerAction={<ActionButton label="Back to rewards" tone="secondary" onPress={() => goBack('HelperRewardsOverview')} />}
    >
      {error ? (
        <Card style={styles.warningCard}>
          <Text style={styles.warningText}>{error}</Text>
        </Card>
      ) : null}

      <Card>
        <SectionHeading
          title="Your service options"
          subtitle="Each service option can have its own Beginner, Specialist, Master, or Legend level."
        />
        {loading ? (
          <EmptyState title="Loading mastery" description="Reading trusted service option mastery and rating records." />
        ) : !optionItems.length ? (
          <EmptyState title="No services yet" description="Add approved services first and mastery will appear per option as jobs and ratings come in." />
        ) : (
          optionItems.map((item) => {
            const resolved = resolveOfferingMasteryRecord({
              offering: item,
              optionMasteryMap,
              serviceMasteryMap: masteryMap,
              optionRatingMap,
              serviceRatingMap: ratingMap,
            });
            return (
              <ServiceMasteryRow
                key={item.masteryKey}
                categoryName={item.optionTitle ? item.serviceName : (catalogMap.get(item.serviceId)?.categoryName || item.categoryId || '')}
                mastery={resolved.mastery}
                onPress={() => navigate({
                  key: 'HelperServiceMasteryDetails',
                  params: {
                    serviceId: item.serviceId,
                    optionId: item.optionId,
                    optionTitle: item.optionTitle,
                    masteryKey: item.masteryKey,
                  },
                })}
                ratingSummary={resolved.ratingSummary}
                serviceName={item.optionTitle || item.serviceName}
              />
            );
          })
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
