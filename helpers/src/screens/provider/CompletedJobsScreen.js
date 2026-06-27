import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ActionButton, EmptyState } from '../../components/app/HelperUi';
import { useHelpersApp } from '../../context/HelpersAppContext';
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

export function CompletedJobsScreen({ navigate }) {
  const { serviceRequests } = useHelpersApp();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(false);
  }, [serviceRequests]);

  if (loading) {
    return (
      <View style={styles.stateWrap}>
        <Text style={styles.stateTitle}>Loading services</Text>
        <Text style={styles.stateCopy}>Connecting your accepted and completed requests.</Text>
      </View>
    );
  }
  if (!serviceRequests.length) {
    return (
      <View style={styles.emptyWrap}>
        <EmptyState
          title="No services completed yet"
          description="Go online so you can accept service requests and start working."
        />
        <ActionButton label="Go to Home" onPress={() => navigate('Home')} />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.wrap} showsVerticalScrollIndicator={false}>
      <Text style={styles.title}>Services</Text>
      <Text style={styles.subtitle}>Track every accepted, completed, canceled, or active customer service request.</Text>

      {serviceRequests.map((request) => (
        <Pressable
          accessibilityRole="button"
          key={request.id}
          onPress={() => navigate({ key: 'JobDetails', params: { requestId: request.id, parentTab: 'Services' } })}
          style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
        >
          <View style={styles.rowIcon}>
            <Ionicons color={colors.brandDark} name="briefcase-outline" size={18} />
          </View>
          <View style={styles.rowBody}>
            <Text style={styles.rowTitle}>{request.title || 'Service request'}</Text>
            <Text style={styles.rowDescription}>{request.description || 'Open to track this request.'}</Text>
            <View style={styles.metaRow}>
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
              <Text style={styles.date}>{formatDate(request.updatedAt || request.createdAt)}</Text>
            </View>
          </View>
          <Ionicons color={colors.muted} name="chevron-forward" size={18} />
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  stateWrap: {
    alignItems: 'center',
    gap: 8,
    justifyContent: 'center',
    paddingVertical: 64,
  },
  stateTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '900',
  },
  stateCopy: {
    color: colors.muted,
    fontSize: 14,
    textAlign: 'center',
  },
  emptyWrap: {
    gap: 12,
  },
  wrap: { gap: 14, paddingBottom: 32 },
  title: { color: colors.text, fontSize: 30, fontWeight: '900' },
  subtitle: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  row: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 22,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    padding: 14,
  },
  rowPressed: {
    transform: [{ scale: 0.99 }],
  },
  rowIcon: {
    alignItems: 'center',
    backgroundColor: '#fff8fc',
    borderRadius: 16,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  rowBody: {
    flex: 1,
    gap: 4,
  },
  rowTitle: { color: colors.text, fontSize: 15, fontWeight: '800' },
  rowDescription: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  metaRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 2,
  },
  statusBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  status: { fontSize: 11, fontWeight: '900', textTransform: 'uppercase' },
  date: { color: colors.muted, fontSize: 12, fontWeight: '700' },
});
