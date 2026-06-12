import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/States';
import { useAuth } from '../../context/AuthContext';
import { subscribeToCustomerServiceRequests } from '../../services/customerServiceRequestService';
import { colors } from '../../theme/colors';
import { getServiceRequestStatusMeta, getServiceRequestToneStyle } from '../../utils/serviceRequestStatus';

function formatDate(value) {
  if (!value) return 'Date pending';
  const date = typeof value?.toDate === 'function' ? value.toDate() : new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date pending';
  return new Intl.DateTimeFormat('en-ZA', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

export function CustomerServiceRequestsScreen({ navigate }) {
  const { user } = useAuth();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => subscribeToCustomerServiceRequests(
    user?.uid,
    (items) => {
      setRequests(items);
      setLoading(false);
    },
    (nextError) => {
      setError(nextError.message || 'Unable to load your service requests right now.');
      setLoading(false);
    },
  ), [user?.uid]);

  if (loading) return <LoadingState label="Loading service requests" />;
  if (error) return <ErrorState message={error} />;
  if (!requests.length) {
    return (
      <EmptyState
        title="No service requests yet"
        message="Start a live request call from Home and it will appear here."
        action={<Button onPress={() => navigate('CustomerHome')}>Go to Home</Button>}
      />
    );
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Service requests</Text>
      <Text style={styles.subtitle}>Track every customer service request from intake to helper arrival.</Text>

      {requests.map((request) => (
        <Card key={request.id}>
          <Pressable
            accessibilityRole="button"
            onPress={() => navigate({ key: 'ServiceRequestTracking', params: { requestId: request.id, parentTab: 'Requests' } })}
            style={styles.pressable}
          >
            <View style={styles.row}>
              <View style={styles.left}>
                <Text style={styles.cardTitle}>{request.topic || request.subject || 'Service request'}</Text>
                <Text style={styles.cardCopy}>{request.serviceSummary || request.description || 'Open to track this request.'}</Text>
              </View>
              <View style={styles.right}>
                <View
                  style={[
                    styles.statusBadge,
                    { backgroundColor: getServiceRequestToneStyle(request.status).backgroundColor },
                  ]}
                >
                  <Text
                    style={[
                      styles.status,
                      { color: getServiceRequestToneStyle(request.status).textColor },
                    ]}
                  >
                    {getServiceRequestStatusMeta(request.status).label}
                  </Text>
                </View>
                <Text style={styles.date}>{formatDate(request.createdAt)}</Text>
              </View>
            </View>
          </Pressable>
        </Card>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 14 },
  title: { color: colors.text, fontSize: 30, fontWeight: '900' },
  subtitle: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  pressable: { gap: 0 },
  row: { flexDirection: 'row', gap: 12, justifyContent: 'space-between' },
  left: { flex: 1, gap: 6 },
  right: { alignItems: 'flex-end', gap: 8 },
  cardTitle: { color: colors.text, fontSize: 18, fontWeight: '900' },
  cardCopy: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  statusBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  status: { fontSize: 11, fontWeight: '900', textTransform: 'uppercase' },
  date: { color: colors.muted, fontSize: 12, fontWeight: '700' },
});
