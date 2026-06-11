import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/States';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { useAuth } from '../../context/AuthContext';
import { subscribeToStudentRequests } from '../../services/classRequestService';
import { colors } from '../../theme/colors';
import { getRequestStatusMeta } from '../../utils/requestStatus';

function formatDate(value) {
  if (!value) return 'Date pending';

  const date = typeof value?.toDate === 'function'
    ? value.toDate()
    : typeof value === 'number'
      ? new Date(value)
      : new Date(value);

  if (Number.isNaN(date.getTime())) return 'Date pending';

  return new Intl.DateTimeFormat('en-ZA', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

export function RequestsScreen({ navigate }) {
  const { user } = useAuth();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    setError('');

    return subscribeToStudentRequests(
      user?.uid,
      (items) => {
        setRequests(items);
        setLoading(false);
      },
      (nextError) => {
        setError(nextError.message || 'Unable to load your services right now.');
        setLoading(false);
      },
    );
  }, [user?.uid]);

  if (loading) return <LoadingState label="Syncing your services..." />;
  if (error) return <ErrorState message={error} />;
  if (!requests.length) {
    return (
      <EmptyState
        title="Your services list is empty"
        message="Request your first service from Home and it will appear here."
        action={<Button onPress={() => navigate('CustomerHome')}>Request your first service</Button>}
      />
    );
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Services received</Text>
      <Text style={styles.subtitle}>A simple list of every service you requested and its current status.</Text>

      {requests.map((request) => {
        const statusMeta = getRequestStatusMeta(request.status);

        return (
          <View key={request.id} style={styles.itemWrap}>
            <Card style={styles.card}>
              <Pressable
                accessibilityRole="button"
                onPress={() => navigate({ key: 'RequestDetails', params: { requestId: request.id, parentTab: 'Requests' } })}
                style={styles.cardPressable}
              >
                <View style={styles.cardTopRow}>
                  <View style={styles.cardLeft}>
                    <Text style={styles.cardTitle} numberOfLines={1}>
                      {request.subject || request.topic || 'Service request'}
                    </Text>
                    <Text style={styles.copy} numberOfLines={1}>
                      Requested by {request.studentName || user?.displayName || 'you'}
                    </Text>
                    <Text style={styles.meta} numberOfLines={1}>
                      {request.description || 'Tap to open the full service details.'}
                    </Text>
                  </View>
                  <View style={styles.cardRight}>
                    <StatusBadge {...statusMeta} />
                    <Text style={styles.dateText}>{formatDate(request.createdAt)}</Text>
                  </View>
                </View>
              </Pressable>
            </Card>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 14,
  },
  title: {
    color: colors.text,
    fontSize: 30,
    fontWeight: '900',
  },
  subtitle: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
  },
  itemWrap: {
    gap: 10,
  },
  card: {
    gap: 0,
  },
  cardPressable: {
    gap: 0,
  },
  cardTopRow: {
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  cardLeft: {
    flex: 1,
    gap: 6,
  },
  cardRight: {
    alignItems: 'flex-end',
    gap: 8,
    justifyContent: 'space-between',
  },
  cardTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '900',
  },
  copy: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '700',
  },
  meta: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
  },
  dateText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
  },
});
