import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Card } from '../../components/ui/Card';
import { EmptyState, LoadingState } from '../../components/ui/States';
import { StickyScreenHeader } from '../../components/ui/StickyScreenHeader';
import { useAuth } from '../../context/AuthContext';
import { getServiceRatingSummaries } from '../../services/rewards/rewardClientService';
import { colors } from '../../theme/colors';
import { getCustomerServiceById } from '../../constants/serviceCatalog';

export function CustomerServiceRatingDetailsScreen({ navigate, route }) {
  const { user } = useAuth();
  const serviceId = route?.params?.serviceId || '';
  const [serviceRating, setServiceRating] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.uid || !serviceId) {
      setLoading(false);
      return;
    }

    getServiceRatingSummaries(user.uid, { serviceIds: [serviceId] }).then((items) => {
      setServiceRating(items[0] || null);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [serviceId, user?.uid]);

  if (loading) {
    return <LoadingState label="Loading service rating" />;
  }

  if (!serviceRating) {
    return <EmptyState title="Service rating unavailable" message="This service rating could not be found." />;
  }

  const serviceName = getCustomerServiceById(serviceId)?.label || serviceId;
  const distribution = serviceRating.distribution || {};

  return (
    <ScrollView contentContainerStyle={styles.wrap} showsVerticalScrollIndicator={false} stickyHeaderIndices={[0]}>
      <StickyScreenHeader
        backLabel="Back to ratings"
        onBack={() => navigate('CustomerRatingSummary')}
        title={serviceName}
        subtitle="Service-specific customer ratings help show trust and reliability in each service category."
      />

      <Card style={styles.sectionCard}>
        <Text style={styles.metricLabel}>Average service rating</Text>
        <Text style={styles.metricValue}>{Number(serviceRating.average || 0).toFixed(1)}</Text>
        <Text style={styles.metricHint}>{Math.round(Number(serviceRating.count || 0))} received ratings</Text>
      </Card>

      <Card style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Distribution</Text>
        {[5, 4, 3, 2, 1].map((score) => (
          <View key={score} style={styles.row}>
            <Text style={styles.rowLabel}>{score} star</Text>
            <Text style={styles.rowValue}>{Math.round(Number(distribution?.[score] || 0))}</Text>
          </View>
        ))}
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
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  rowLabel: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  rowValue: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '700',
  },
});

