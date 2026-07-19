import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '../../components/ui/Button';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/States';
import { useAuth } from '../../context/AuthContext';
import { subscribeToCustomerServiceRequests } from '../../services/customerServiceRequestService';
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

export function CustomerServiceRequestsScreen({ navigate }) {
  const { user } = useAuth();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('previous');

  useEffect(
    () =>
      subscribeToCustomerServiceRequests(
        user?.uid,
        (items) => {
          setRequests(items);
          setLoading(false);
        },
        (nextError) => {
          setError(nextError.message || 'Unable to load your service requests right now.');
          setLoading(false);
        },
      ),
    [user?.uid],
  );

  const filteredRequests = useMemo(() => {
    const statusSet = activeTab === 'previous' ? PREVIOUS_STATUSES : SCHEDULED_STATUSES;
    return requests.filter((request) => statusSet.includes(String(request.status || '').toLowerCase()));
  }, [activeTab, requests]);
  const scheduledCount = useMemo(
    () => requests.filter((request) => SCHEDULED_STATUSES.includes(String(request.status || '').toLowerCase())).length,
    [requests],
  );

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
    <ScrollView contentContainerStyle={styles.wrap} showsVerticalScrollIndicator={false}>

      {/* ── Page header ── */}
      <View style={styles.header}>
        <Text style={styles.kicker}>My account</Text>
        <Text style={styles.title}>Service requests</Text>
        <Text style={styles.subtitle}>
          Track every customer service request from intake to helper arrival.
        </Text>
      </View>

      {/* ── Request list ── */}
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
        <View style={styles.emptyWrap}>
          <Ionicons color={colors.brandDark} name="time-outline" size={24} />
          <Text style={styles.emptyTitle}>
            {activeTab === 'previous' ? 'No previous requests yet' : 'No scheduled requests yet'}
          </Text>
          <Text style={styles.emptyCopy}>
            {activeTab === 'previous'
              ? 'Completed and canceled requests will appear here.'
              : 'Scheduled and active requests will appear here.'}
          </Text>
        </View>
      ) : filteredRequests.map((request) => {
        const statusMeta = getServiceRequestStatusMeta(request.status);
        const toneStyle = getServiceRequestToneStyle(request.status);
        const openHistory = () => {
          navigate({
            key: 'CustomerServiceCall',
            params: {
              requestId: request.id,
              parentTab: 'Requests',
              historyOnly: true,
              location: request.location || null,
            },
          });
        };

        return (
          <Pressable
            accessibilityRole="button"
            key={request.id}
            onPress={() => {
              const status = String(request.status || '').toLowerCase();
              if (status === 'collecting_details') {
                navigate({
                  key: 'CustomerServiceCall',
                  params: {
                    requestId: request.id,
                    parentTab: 'Requests',
                    location: request.location || null,
                  },
                });
              } else if (['completed', 'canceled', 'cancelled', 'scheduled_pending', 'expired'].includes(status)) {
                navigate({
                  key: 'ServiceRequestDetails',
                  params: {
                    requestId: request.id,
                    parentTab: 'Requests',
                  },
                });
              } else {
                navigate({
                  key: 'ServiceRequestTracking',
                  params: {
                    requestId: request.id,
                    parentTab: 'Requests',
                  },
                });
              }
            }}
            style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
          >
            {/* Left accent bar — tinted with status color */}
            <View
              style={[styles.cardAccentBar, { backgroundColor: toneStyle.backgroundColor }]}
            />

            {/* Icon */}
            <View style={styles.cardIcon}>
              <Ionicons color={colors.brandDark} name="briefcase-outline" size={20} />
            </View>

            {/* Body */}
            <View style={styles.cardBody}>
              <Text style={styles.cardTitle} numberOfLines={1}>
                {request.topic || request.subject || 'Service request'}
              </Text>
              <Text style={styles.cardDescription} numberOfLines={2}>
                {request.serviceSummary || request.description || 'Open to track this request.'}
              </Text>

              {/* Status + date row */}
              <View style={styles.cardMeta}>
                <View
                  style={[
                    styles.statusBadge,
                    { backgroundColor: toneStyle.backgroundColor },
                  ]}
                >
                  <Text style={[styles.statusText, { color: toneStyle.textColor }]}>
                    {statusMeta.label}
                  </Text>
                </View>
                <View style={styles.datePill}>
                  <Ionicons color={colors.muted} name="calendar-outline" size={11} />
                  <Text style={styles.dateText}>{formatDate(request.createdAt)}</Text>
                </View>
              </View>
            </View>

            <View style={styles.cardActions}>
              <Pressable
                accessibilityRole="button"
                hitSlop={8}
                onPress={(event) => {
                  event?.stopPropagation?.();
                  openHistory();
                }}
                style={styles.historyButton}
              >
                <Ionicons color={colors.brandDark} name="time-outline" size={18} />
              </Pressable>
              <Ionicons color={colors.muted} name="chevron-forward" size={18} />
            </View>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 12,
    paddingBottom: 36,
  },

  // ── Header ───────────────────────────────────────────────────────────────
  header: {
    gap: 6,
    paddingBottom: 4,
  },
  kicker: {
    color: colors.brandDark,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.6,
    textTransform: 'uppercase',
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

  // ── Request card ─────────────────────────────────────────────────────────
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
  emptyWrap: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderColor: colors.border,
    borderRadius: 22,
    borderWidth: 1,
    gap: 8,
    padding: 20,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '900',
    textAlign: 'center',
  },
  emptyCopy: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
  card: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 24,
    borderWidth: 1,
    elevation: 2,
    flexDirection: 'row',
    gap: 12,
    overflow: 'hidden',
    paddingRight: 14,
    paddingVertical: 14,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
  },
  cardPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.99 }],
  },
  cardAccentBar: {
    alignSelf: 'stretch',
    borderRadius: 4,
    marginLeft: 4,
    width: 4,
  },
  cardIcon: {
    alignItems: 'center',
    backgroundColor: 'rgba(217,70,239,0.08)',
    borderRadius: 16,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  cardBody: {
    flex: 1,
    gap: 4,
  },
  cardActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  cardTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '800',
  },
  cardDescription: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
  },
  cardMeta: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  statusBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  datePill: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 4,
  },
  dateText: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '700',
  },
  historyButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(217,70,239,0.08)',
    borderRadius: 999,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
});
