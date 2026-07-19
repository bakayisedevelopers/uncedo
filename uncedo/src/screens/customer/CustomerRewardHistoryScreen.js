import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/States';
import { StickyScreenHeader } from '../../components/ui/StickyScreenHeader';
import { RewardTransactionItem } from '../../components/customer/rewards/RewardTransactionItem';
import { useAuth } from '../../context/AuthContext';
import { getRewardTransactionsPage } from '../../services/rewards/rewardClientService';
import { buildTransactionDisplayModel } from '../../services/rewards/rewardPresentation';
import { colors } from '../../theme/colors';

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'credit', label: 'Credits' },
  { id: 'debit', label: 'Debits' },
  { id: 'expired', label: 'Expired' },
];

export function CustomerRewardHistoryScreen({ navigate }) {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [activeFilter, setActiveFilter] = useState('all');

  const loadPage = useCallback(async ({ reset = false } = {}) => {
    if (!user?.uid) {
      return;
    }

    if (reset) {
      setRefreshing(true);
    } else if (!cursor && !items.length) {
      setLoading(true);
    } else {
      setLoadingMore(true);
    }
    setError('');

    try {
      const result = await getRewardTransactionsPage(user.uid, {
        pageSize: 20,
        cursor: reset ? null : cursor,
      });

      setItems((previous) => (reset ? result.items : [...previous, ...result.items]));
      setCursor(result.cursor);
      setHasMore(result.hasMore);
    } catch (nextError) {
      setError(nextError.message || 'Unable to load reward history.');
    } finally {
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
    }
  }, [cursor, items.length, user?.uid]);

  useEffect(() => {
    setItems([]);
    setCursor(null);
    setHasMore(false);
    setLoading(true);
    loadPage({ reset: true });
  }, [loadPage, user?.uid]);

  const filteredItems = useMemo(() => {
    if (activeFilter === 'all') {
      return items;
    }

    return items.filter((item) => {
      const model = buildTransactionDisplayModel(item);
      if (activeFilter === 'credit') {
        return model.directionLabel === 'Credit';
      }
      if (activeFilter === 'debit') {
        return model.directionLabel === 'Debit' || model.directionLabel === 'Reversal';
      }
      if (activeFilter === 'expired') {
        return model.directionLabel === 'Expired';
      }
      return true;
    });
  }, [activeFilter, items]);

  if (loading) {
    return <LoadingState label="Loading points history" />;
  }

  if (error && !items.length) {
    return (
      <View style={styles.stateWrap}>
        <ErrorState title="Unable to load history" message={error} />
        <Button onPress={() => loadPage({ reset: true })}>Retry</Button>
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={styles.wrap}
      refreshControl={(
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setCursor(null);
            loadPage({ reset: true });
          }}
          tintColor={colors.brand}
        />
      )}
      showsVerticalScrollIndicator={false}
      stickyHeaderIndices={[0]}
    >
      <StickyScreenHeader
        backLabel="Back to rewards"
        onBack={() => navigate('CustomerRewardsOverview')}
        title="Points history"
        subtitle="Newest first. Internal reward-processing details stay hidden from the customer view."
      />

      <Card style={styles.filterCard}>
        <View style={styles.filterRow}>
          {FILTERS.map((filter) => {
            const isActive = filter.id === activeFilter;
            return (
              <Pressable
                accessibilityRole="button"
                key={filter.id}
                onPress={() => setActiveFilter(filter.id)}
                style={[styles.filterChip, isActive && styles.filterChipActive]}
              >
                <Text style={[styles.filterText, isActive && styles.filterTextActive]}>{filter.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </Card>

      {error ? (
        <Card style={styles.inlineMessageCard}>
          <Text style={styles.inlineMessageText}>{error}</Text>
        </Card>
      ) : null}

      {!filteredItems.length ? (
        <EmptyState title="No matching transactions" message="Try a different filter or check back after your next trusted reward activity." />
      ) : filteredItems.map((item) => (
        <RewardTransactionItem key={item.id} transaction={item} />
      ))}

      {hasMore ? (
        <Button disabled={loadingMore} onPress={() => loadPage()}>
          {loadingMore ? 'Loading more...' : 'Load more history'}
        </Button>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 12,
    paddingBottom: 32,
  },
  stateWrap: {
    gap: 12,
    padding: 24,
  },
  filterCard: {
    gap: 10,
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  filterChip: {
    backgroundColor: '#fafafa',
    borderColor: colors.border,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  filterChipActive: {
    backgroundColor: colors.brand,
    borderColor: colors.brand,
  },
  filterText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '800',
  },
  filterTextActive: {
    color: '#ffffff',
  },
  inlineMessageCard: {
    backgroundColor: '#fff7ed',
    borderColor: '#fdba74',
    gap: 4,
  },
  inlineMessageText: {
    color: '#9a3412',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
  },
});

