import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Card } from '../../components/ui/Card';
import { EmptyState, LoadingState } from '../../components/ui/States';
import { StickyScreenHeader } from '../../components/ui/StickyScreenHeader';
import { useAuth } from '../../context/AuthContext';
import { getRewardConfigs } from '../../services/rewards/rewardClientService';
import { recordRewardUiEvent } from '../../services/rewards/rewardAnalyticsService';
import { buildHowToEarnSections, formatPoints } from '../../services/rewards/rewardPresentation';
import { colors } from '../../theme/colors';

export function CustomerHowToEarnScreen({ navigate }) {
  const { user } = useAuth();
  const [rewardConfigs, setRewardConfigs] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    recordRewardUiEvent(user?.uid, 'earning_opportunity_viewed');
  }, [user?.uid]);

  useEffect(() => {
    if (!user?.uid) {
      setLoading(false);
      return;
    }

    getRewardConfigs().then((configs) => {
      setRewardConfigs(configs);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [user?.uid]);

  const sections = useMemo(
    () => buildHowToEarnSections({
      globalConfig: rewardConfigs?.globalConfig || {},
      customerConfig: rewardConfigs?.customerConfig || {},
    }),
    [rewardConfigs?.customerConfig, rewardConfigs?.globalConfig],
  );

  if (loading) {
    return <LoadingState label="Loading reward activities" />;
  }

  if (!sections.length) {
    return <EmptyState title="No earning opportunities available" message="Reward activities are not configured for this environment." />;
  }

  return (
    <ScrollView contentContainerStyle={styles.wrap} showsVerticalScrollIndicator={false} stickyHeaderIndices={[0]}>
      <StickyScreenHeader
        backLabel="Back to rewards"
        onBack={() => navigate('CustomerRewardsOverview')}
        title="How to earn"
        subtitle="Only trusted and enabled activities are shown as active. Upcoming items are listed without promising immediate availability."
      />

      {sections.map((section) => (
        <Card key={section.title} style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>{section.title}</Text>
          {section.items.map((item) => (
            <View key={item.id} style={styles.itemCard}>
              <View style={styles.itemHeading}>
                <Text style={styles.itemTitle}>{item.label}</Text>
                <Text style={[styles.statePill, item.state === 'active' ? styles.stateActive : styles.stateUpcoming]}>
                  {item.state === 'active' ? 'Active' : item.state === 'disabled' ? 'Disabled' : 'Upcoming'}
                </Text>
              </View>
              <Text style={styles.itemPoints}>{formatPoints(item.points)}</Text>
              <Text style={styles.itemCopy}>{item.description}</Text>
              <Text style={styles.itemMeta}>Frequency: {item.frequency}</Text>
            </View>
          ))}
        </Card>
      ))}
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
  sectionTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '900',
  },
  itemCard: {
    backgroundColor: '#fafafa',
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 1,
    gap: 6,
    padding: 14,
  },
  itemHeading: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
  },
  itemTitle: {
    color: colors.text,
    flex: 1,
    fontSize: 14,
    fontWeight: '900',
  },
  statePill: {
    borderRadius: 999,
    fontSize: 11,
    fontWeight: '900',
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  stateActive: {
    backgroundColor: '#dcfce7',
    color: '#166534',
  },
  stateUpcoming: {
    backgroundColor: '#fef3c7',
    color: '#92400e',
  },
  itemPoints: {
    color: colors.brandDark,
    fontSize: 15,
    fontWeight: '900',
  },
  itemCopy: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
  },
  itemMeta: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '700',
  },
});
