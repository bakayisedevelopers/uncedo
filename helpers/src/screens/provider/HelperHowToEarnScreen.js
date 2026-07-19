import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ActionButton, Card, EmptyState, Screen, SectionHeading } from '../../components/app/HelperUi';
import { getRewardConfig } from '../../services/rewards/rewardClientService';
import { buildHowToEarnSections, formatPoints } from '../../services/rewards/rewardPresentation';
import { REWARD_CONFIG_DOCS } from '../../shared/rewards';
import { colors } from '../../theme/colors';

export function HelperHowToEarnScreen({ goBack }) {
  const [sections, setSections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const [globalConfig, helperConfig] = await Promise.all([
        getRewardConfig(REWARD_CONFIG_DOCS.GLOBAL, { force: true }),
        getRewardConfig(REWARD_CONFIG_DOCS.HELPER, { force: true }),
      ]);
      setSections(buildHowToEarnSections(helperConfig || {}, globalConfig || {}));
    } catch (nextError) {
      setError(nextError.message || 'Unable to load earning opportunities.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <Screen
      title="How to earn"
      description="This screen only advertises helper reward activities that are actively supported by trusted backend processing or clearly marked as planned."
      footerAction={<ActionButton label="Back to rewards" tone="secondary" onPress={() => goBack('HelperRewardsOverview')} />}
    >
      {error ? (
        <Card style={styles.warningCard}>
          <Text style={styles.warningText}>{error}</Text>
        </Card>
      ) : null}

      {loading ? (
        <Card>
          <EmptyState title="Loading opportunities" description="Reading helper reward configuration." />
        </Card>
      ) : sections.map((section) => (
        <Card key={section.title}>
          <SectionHeading title={section.title} />
          <View style={styles.itemList}>
            {section.items.map((item) => (
              <View key={item.id} style={styles.itemRow}>
                <Text style={styles.itemTitle}>{item.label}</Text>
                <Text style={styles.itemMeta}>{formatPoints(item.points || 0)} - {item.frequency}</Text>
                <Text style={styles.itemCopy}>{item.description}</Text>
                <Text style={styles.itemState}>{item.state}</Text>
              </View>
            ))}
          </View>
        </Card>
      ))}
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
  itemList: {
    gap: 12,
  },
  itemRow: {
    gap: 4,
  },
  itemTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '800',
  },
  itemMeta: {
    color: colors.brandDark,
    fontSize: 12,
    fontWeight: '800',
  },
  itemCopy: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
  },
  itemState: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
});
