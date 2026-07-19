import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ActionButton, EmptyState } from '../../components/app/HelperUi';
import { useHelpersApp } from '../../context/HelpersAppContext';
import { colors } from '../../theme/colors';
import { getServiceRequestStatusMeta, getServiceRequestToneStyle } from '../../utils/serviceRequestStatus';

const TAB_OPTIONS = [
  { id: 'scheduled', label: 'Scheduled' },
  { id: 'previous', label: 'Previous' },
];

const SCHEDULED_STATUSES = [
  'collecting_details',
  'scheduled_pending',
  'matching',
  'helper_found',
  'accepted',
  'en_route',
  'driving',
  'buying_resources',
  'arrived',
  'work_started',
  'no_helper_available',
];

const PREVIOUS_STATUSES = ['completed', 'canceled', 'cancelled', 'expired', 'rejected'];

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
  const [activeTab, setActiveTab] = useState('previous');

  useEffect(() => {
    setLoading(false);
  }, [serviceRequests]);

  const filteredRequests = useMemo(() => {
    const statusSet = activeTab === 'previous' ? PREVIOUS_STATUSES : SCHEDULED_STATUSES;
    return serviceRequests.filter((request) => statusSet.includes(String(request.status || '').toLowerCase()));
  }, [activeTab, serviceRequests]);
  const scheduledCount = useMemo(
    () => serviceRequests.filter((request) => SCHEDULED_STATUSES.includes(String(request.status || '').toLowerCase())).length,
    [serviceRequests],
  );

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

      <View style={styles.tabRow}>
        {TAB_OPTIONS.map((tab) => {
          const isActive = tab.id === activeTab;
          const isScheduledTab = tab.id === 'scheduled';
          return (
            <Pressable
              accessibilityRole="button"
              key={tab.id}
              onPress={() => setActiveTab(tab.id)}
              style={[styles.tabButton, isActive && styles.tabButtonActive]}
            >
              <Text style={[styles.tabText, isActive && styles.tabTextActive]}>{tab.label}</Text>
              {isScheduledTab && scheduledCount > 0 ? (
                <View style={styles.tabBadge}>
                  <Text style={styles.tabBadgeText}>{scheduledCount > 99 ? '99+' : String(scheduledCount)}</Text>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>

      {!filteredRequests.length ? (
        <View style={styles.emptyTabWrap}>
          <Ionicons color={colors.brandDark} name="time-outline" size={24} />
          <Text style={styles.emptyTabTitle}>
            {activeTab === 'previous' ? 'No previous services yet' : 'No scheduled services yet'}
          </Text>
          <Text style={styles.emptyTabCopy}>
            {activeTab === 'previous'
              ? 'Completed and canceled jobs will appear here.'
              : 'Scheduled and active jobs will appear here.'}
          </Text>
        </View>
      ) : filteredRequests.map((request) => (
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
  tabRow: {
    flexDirection: 'row',
    gap: 10,
  },
  tabButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderColor: colors.border,
    borderRadius: 999,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 14,
    position: 'relative',
  },
  tabButtonActive: {
    backgroundColor: colors.brandDark,
    borderColor: colors.brandDark,
  },
  tabText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '800',
  },
  tabTextActive: {
    color: '#ffffff',
  },
  tabBadge: {
    alignItems: 'center',
    backgroundColor: '#ef4444',
    borderRadius: 999,
    minHeight: 18,
    minWidth: 18,
    paddingHorizontal: 5,
    position: 'absolute',
    right: 10,
    top: -6,
  },
  tabBadgeText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '900',
  },
  emptyTabWrap: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderColor: colors.border,
    borderRadius: 22,
    borderWidth: 1,
    gap: 8,
    padding: 20,
  },
  emptyTabTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '900',
    textAlign: 'center',
  },
  emptyTabCopy: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
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
