import { useCallback, useEffect, useState } from 'react';
import { RefreshControl, StyleSheet, Text, View } from 'react-native';
import { ActionButton, Card, EmptyState, Screen, SectionHeading } from '../../components/app/HelperUi';
import { RewardTransactionRow } from '../../components/rewards/RewardWidgets';
import { useAuth } from '../../context/AuthContext';
import { getRewardTransactionsPage } from '../../services/rewards/rewardClientService';
import { colors } from '../../theme/colors';

export function HelperRewardHistoryScreen({ goBack }) {
  const { user } = useAuth();
  const [transactions, setTransactions] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');

  const loadPage = useCallback(async ({ append = false, nextCursor = null } = {}) => {
    if (!user?.uid) {
      return;
    }

    setError('');
    try {
      const result = await getRewardTransactionsPage({
        userId: user.uid,
        pageSize: 20,
        cursor: nextCursor,
      });
      setTransactions((current) => (append ? [...current, ...result.items] : result.items));
      setCursor(result.cursor);
      setHasMore(result.hasMore);
    } catch (nextError) {
      setError(nextError.message || 'Unable to load points history.');
    } finally {
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
    }
  }, [user?.uid]);

  useEffect(() => {
    loadPage();
  }, [loadPage]);

  return (
    <Screen
      title="Points history"
      description="Read helper reward credits, deductions, reversals, expired points, and rating or referral effects without exposing internal backend metadata."
      footerAction={<ActionButton label="Back to rewards" tone="secondary" onPress={() => goBack('HelperRewardsOverview')} />}
      refreshControl={(
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            loadPage();
          }}
          tintColor={colors.brand}
        />
      )}
    >
      {error ? (
        <Card style={styles.warningCard}>
          <Text style={styles.warningText}>{error}</Text>
          <ActionButton label="Retry" onPress={() => loadPage()} />
        </Card>
      ) : null}

      <Card>
        <SectionHeading
          title="Latest transactions"
          subtitle="Newest first. Amounts reflect helper reward points only, not cash earnings."
        />
        {loading ? (
          <EmptyState title="Loading points history" description="Reading your helper reward ledger." />
        ) : !transactions.length ? (
          <EmptyState title="No reward transactions yet" description="Eligible points activity will appear here after trusted backend processing." />
        ) : (
          <View style={styles.list}>
            {transactions.map((item) => (
              <RewardTransactionRow key={item.id} transaction={item} />
            ))}
          </View>
        )}
        {hasMore ? (
          <ActionButton
            disabled={loadingMore}
            label={loadingMore ? 'Loading more...' : 'Load more'}
            tone="secondary"
            onPress={() => {
              setLoadingMore(true);
              loadPage({ append: true, nextCursor: cursor });
            }}
          />
        ) : null}
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
  list: {
    gap: 12,
  },
});
