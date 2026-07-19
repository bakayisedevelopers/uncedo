import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '../../components/ui/Card';
import { EmptyState, LoadingState } from '../../components/ui/States';
import { StickyScreenHeader } from '../../components/ui/StickyScreenHeader';
import { useAuth } from '../../context/AuthContext';
import { getServiceRatingSummaries, subscribeToRatingSummary } from '../../services/rewards/rewardClientService';
import { colors } from '../../theme/colors';
import { getCustomerServiceById } from '../../constants/serviceCatalog';

function DistributionRow({ label, value, total }) {
  const percent = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <View style={styles.distributionRow}>
      <Text style={styles.distributionLabel}>{label}</Text>
      <View style={styles.distributionTrack}>
        <View style={[styles.distributionFill, { width: `${percent}%` }]} />
      </View>
      <Text style={styles.distributionValue}>{value}</Text>
    </View>
  );
}

export function CustomerRatingSummaryScreen({ navigate }) {
  const { user } = useAuth();
  const [ratingSummary, setRatingSummary] = useState(null);
  const [serviceRatings, setServiceRatings] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.uid) {
      setLoading(false);
      return () => {};
    }

    getServiceRatingSummaries(user.uid, { limitCount: 25 }).then((items) => {
      setServiceRatings(items);
      setLoading(false);
    }).catch(() => setLoading(false));

    return subscribeToRatingSummary(user.uid, (next) => setRatingSummary(next), () => setLoading(false));
  }, [user?.uid]);

  if (loading) {
    return <LoadingState label="Loading customer ratings" />;
  }

  if (!ratingSummary && !serviceRatings.length) {
    return <EmptyState title="No received ratings yet" message="Helper ratings of your customer conduct will appear here after completed jobs." />;
  }

  const overallCount = Math.round(Number(ratingSummary?.overallCount || 0));
  const distribution = ratingSummary?.distribution || {};

  return (
    <ScrollView contentContainerStyle={styles.wrap} showsVerticalScrollIndicator={false} stickyHeaderIndices={[0]}>
      <StickyScreenHeader
        backLabel="Back to rewards"
        onBack={() => navigate('CustomerRewardsOverview')}
        title="Rating summary"
        subtitle="Helpers can rate your customer conduct overall and per service type. These ratings contribute to membership eligibility."
      />

      <Card style={styles.sectionCard}>
        <Text style={styles.metricLabel}>Overall customer rating</Text>
        <Text style={styles.metricValue}>{Number(ratingSummary?.overallAverage || 0).toFixed(1)}</Text>
        <Text style={styles.metricHint}>{overallCount} received ratings</Text>
      </Card>

      <Card style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Rating distribution</Text>
        {[5, 4, 3, 2, 1].map((score) => (
          <DistributionRow
            key={score}
            label={`${score} star`}
            total={overallCount}
            value={Math.round(Number(distribution?.[score] || 0))}
          />
        ))}
      </Card>

      <Card style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Service-specific ratings</Text>
        {!serviceRatings.length ? (
          <EmptyState title="No service breakdown yet" message="Once helpers rate you across different services, they will appear here." />
        ) : serviceRatings.map((item) => {
          const serviceName = getCustomerServiceById(item.serviceId || item.id)?.label || item.serviceId || item.id;
          return (
            <Pressable
              accessibilityRole="button"
              key={item.id}
              onPress={() => navigate({
                key: 'CustomerServiceRatingDetails',
                params: {
                  serviceId: item.serviceId || item.id,
                  parentTab: 'CustomerRewardsOverview',
                },
              })}
              style={({ pressed }) => [styles.serviceRow, pressed && styles.serviceRowPressed]}
            >
              <View style={styles.serviceBody}>
                <Text style={styles.serviceTitle}>{serviceName}</Text>
                <Text style={styles.serviceCopy}>{Math.round(Number(item.count || 0))} ratings</Text>
              </View>
              <View style={styles.serviceMetric}>
                <Ionicons color="#eab308" name="star" size={16} />
                <Text style={styles.serviceValue}>{Number(item.average || 0).toFixed(1)}</Text>
              </View>
            </Pressable>
          );
        })}
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
  distributionRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  distributionLabel: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
    width: 54,
  },
  distributionTrack: {
    backgroundColor: '#f3e8ff',
    borderRadius: 999,
    flex: 1,
    height: 10,
    overflow: 'hidden',
  },
  distributionFill: {
    backgroundColor: colors.brand,
    height: '100%',
  },
  distributionValue: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
    width: 24,
  },
  serviceRow: {
    alignItems: 'center',
    backgroundColor: '#fafafa',
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    padding: 14,
  },
  serviceRowPressed: {
    opacity: 0.8,
  },
  serviceBody: {
    flex: 1,
    gap: 4,
  },
  serviceTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '800',
  },
  serviceCopy: {
    color: colors.muted,
    fontSize: 12,
  },
  serviceMetric: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 4,
  },
  serviceValue: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '900',
  },
});

