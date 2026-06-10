import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/States';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { useAuth } from '../../context/AuthContext';
import { subscribeToStudentRequests } from '../../services/classRequestService';
import { subscribeToStudentSessions } from '../../services/sessionService';
import { colors } from '../../theme/colors';
import { getRequestStatusMeta } from '../../utils/requestStatus';

function statusLabel(status) {
  if (['pending', 'matching', 'offered'].includes(status)) return 'Looking for a helper';
  if (['accepted', 'waiting_student', 'in_progress', 'in_session'].includes(status)) return 'Helper assigned';
  if (status === 'no_tutor_available') return 'No helper available yet';
  if (status === 'completed') return 'Job completed';
  return 'Request update';
}

export function RequestsScreen({ navigate }) {
  const { user } = useAuth();
  const [requests, setRequests] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    return subscribeToStudentRequests(
      user?.uid,
      (items) => {
        setRequests(items);
        setLoading(false);
      },
      (nextError) => {
        setError(nextError.message);
        setLoading(false);
      },
    );
  }, [user?.uid]);

  useEffect(() => subscribeToStudentSessions(
    user?.uid,
    (items) => {
      setSessions(items);
      setLoadingSessions(false);
    },
    () => {
      setSessions([]);
      setLoadingSessions(false);
    },
  ), [user?.uid]);

  const sessionByRequestId = useMemo(
    () => new Map(sessions.map((session) => [session.requestId, session])),
    [sessions],
  );

  if (loading || loadingSessions) return <LoadingState label="Syncing your job requests..." />;
  if (error) return <ErrorState message={error} />;
  if (!requests.length) {
    return (
      <EmptyState
        title="No job requests yet"
        message="Your service requests will appear here once you start asking for help."
        action={<Button onPress={() => navigate('CustomerHome')}>Go Home</Button>}
      />
    );
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>My Job Requests</Text>
      <Text style={styles.subtitle}>Track requests, assigned helpers, and active jobs in one place.</Text>
      {requests.map((request) => (
        <View key={request.id} style={styles.itemWrap}>
          <Card style={styles.card}>
            <Pressable
              accessibilityRole="button"
              onPress={() => navigate({ key: 'RequestStatus', params: { requestId: request.id, parentTab: 'Requests' } })}
              style={styles.cardPressable}
            >
              <StatusBadge {...getRequestStatusMeta(request.status)} />
              <Text style={styles.cardTitle}>{request.topic || request.subject || 'Class request'}</Text>
              <Text style={styles.copy}>{request.description || 'No description added.'}</Text>
              <Text style={styles.meta}>Service category: {request.subject || 'General help'}</Text>
            </Pressable>
          </Card>

          <View style={styles.footerRow}>
            <Text style={styles.statusText}>{statusLabel(request.status)}</Text>
            <View style={styles.footerActions}>
              <View style={styles.durationWrap}>
                <Ionicons name="time-outline" size={14} color={colors.muted} />
                <Text style={styles.durationText}>
                  {request.duration || sessionByRequestId.get(request.id)?.duration || 'Per-minute'}
                </Text>
              </View>
              {sessionByRequestId.get(request.id)?.id ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => navigate({ key: 'SessionRoom', params: { sessionId: sessionByRequestId.get(request.id).id, parentTab: 'Requests' } })}
                >
                  <Text style={styles.joinText}>
                    Open job
                  </Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 12,
  },
  title: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '900',
  },
  subtitle: {
    color: colors.muted,
    fontSize: 14,
  },
  itemWrap: {
    gap: 8,
  },
  card: {
    gap: 10,
  },
  cardPressable: {
    gap: 10,
  },
  cardTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '900',
  },
  copy: {
    color: colors.muted,
    fontSize: 14,
  },
  meta: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
  },
  footerRow: {
    alignItems: 'center',
    backgroundColor: '#fafafa',
    borderColor: colors.border,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  statusText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '700',
  },
  footerActions: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  durationWrap: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 4,
  },
  durationText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
  },
  joinText: {
    color: '#047857',
    fontSize: 12,
    fontWeight: '800',
  },
});
