import { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { ActionButton, Card, EmptyState, Screen } from '../../components/app/HelperUi';
import { RatingDistributionCard } from '../../components/rewards/RewardWidgets';
import { useAuth } from '../../context/AuthContext';
import { useHelpersApp } from '../../context/HelpersAppContext';
import { getServiceRatingSummary } from '../../services/rewards/rewardClientService';
import { colors } from '../../theme/colors';

export function HelperServiceRatingDetailsScreen({ route, goBack }) {
  const { user } = useAuth();
  const { serviceCatalog } = useHelpersApp();
  const serviceId = String(route?.params?.serviceId || '').trim();
  const [ratingSummary, setRatingSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!user?.uid || !serviceId) {
      return;
    }

    setError('');
    try {
      setRatingSummary(await getServiceRatingSummary(user.uid, serviceId));
    } catch (nextError) {
      setError(nextError.message || 'Unable to load service rating details.');
    } finally {
      setLoading(false);
    }
  }, [serviceId, user?.uid]);

  useEffect(() => {
    load();
  }, [load]);

  const serviceEntry = useMemo(
    () => serviceCatalog.find((item) => String(item.id || '').trim() === serviceId) || null,
    [serviceCatalog, serviceId],
  );

  return (
    <Screen
      title={serviceEntry?.label || serviceEntry?.serviceName || serviceId || 'Service rating'}
      description="Service-specific rating quality feeds mastery recalculation for this service only."
      footerAction={<ActionButton label="Back to ratings" tone="secondary" onPress={() => goBack('HelperRatingSummary')} />}
    >
      {error ? (
        <Card style={styles.warningCard}>
          <Text style={styles.warningText}>{error}</Text>
        </Card>
      ) : null}

      {loading ? (
        <Card>
          <EmptyState title="Loading service rating" description="Reading your service-specific rating summary." />
        </Card>
      ) : (
        <>
          <Card>
            <Text style={styles.sectionTitle}>Summary</Text>
            <Text style={styles.copy}>Average rating: {Number(ratingSummary?.average || 0) > 0 ? Number(ratingSummary?.average || 0).toFixed(1) : 'No ratings yet'}</Text>
            <Text style={styles.copy}>Rating count: {Number(ratingSummary?.count || 0)}</Text>
            <Text style={styles.copy}>Written reviews and customer identities stay hidden here unless a future product policy explicitly exposes them.</Text>
          </Card>

          <RatingDistributionCard ratingSummary={{ distribution: ratingSummary?.distribution || {} }} />
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
});
