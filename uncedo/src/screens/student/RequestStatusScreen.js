import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { FormField } from '../../components/ui/FormField';
import { ErrorState, LoadingState } from '../../components/ui/States';
import { useAuth } from '../../context/AuthContext';
import { cancelClassRequest, subscribeToRequestById } from '../../services/classRequestService';
import { subscribeToStudentSessions } from '../../services/sessionService';
import { getUserProfile } from '../../services/userService';
import { colors } from '../../theme/colors';
import { TERMINAL_REQUEST_STATUSES } from '../../utils/requestStatus';

function getStatusCopy(status) {
  const normalized = String(status || '').toLowerCase();
  if (['pending', 'matching'].includes(normalized)) return 'Looking for a helper';
  if (normalized === 'offered') return 'Waiting for helper to accept';
  if (normalized === 'accepted') return 'Helper assigned';
  if (['waiting_student', 'in_progress', 'in_session'].includes(normalized)) return 'Job ready';
  if (normalized === 'no_tutor_available') return 'No helper available';
  if (normalized === 'completed') return 'Job completed';
  if (['canceled', 'canceled_during', 'expired'].includes(normalized)) return 'Request closed';
  return 'Request made';
}

function getStatusMeta(status) {
  const normalized = String(status || '').toLowerCase();

  if (['pending', 'matching'].includes(normalized)) {
    return {
      label: 'Looking for a helper',
      tone: 'emerald',
      icon: 'search',
      badge: 'Request made - looking for a helper',
    };
  }

  if (normalized === 'offered') {
    return {
      label: 'Waiting for helper to accept',
      tone: 'violet',
      icon: 'checkmark-circle',
      badge: 'Helper found - waiting for acceptance',
    };
  }

  if (normalized === 'accepted') {
    return {
      label: 'Helper assigned',
      tone: 'violet',
      icon: 'checkmark-circle',
      badge: 'A helper accepted your request',
    };
  }

  if (['waiting_student', 'in_progress', 'in_session'].includes(normalized)) {
    return {
      label: 'Job ready',
      tone: 'violet',
      icon: 'checkmark-circle',
      badge: 'Helper accepted - your job is ready',
    };
  }

  if (normalized === 'no_tutor_available') {
    return {
      label: 'No helper available',
      tone: 'amber',
      icon: 'search',
      badge: 'No helper available right now',
    };
  }

  if (normalized === 'completed') {
    return {
      label: 'Completed',
      tone: 'emerald',
      icon: 'checkmark-circle',
      badge: 'Job completed successfully',
    };
  }

  if (['canceled', 'canceled_during', 'expired'].includes(normalized)) {
    return {
      label: 'Closed',
      tone: 'rose',
      icon: 'close-circle',
      badge: 'This request is no longer active',
    };
  }

  return {
    label: 'Request made',
    tone: 'zinc',
    icon: 'search',
    badge: 'Preparing your job request',
  };
}

function getToneStyles(tone) {
  if (tone === 'emerald') {
    return {
      heroBg: '#10b981',
      iconWrapBg: '#d1fae5',
      iconColor: '#047857',
    };
  }

  if (tone === 'violet') {
    return {
      heroBg: '#8b5cf6',
      iconWrapBg: '#ede9fe',
      iconColor: '#6d28d9',
    };
  }

  if (tone === 'amber') {
    return {
      heroBg: '#f59e0b',
      iconWrapBg: '#fef3c7',
      iconColor: '#b45309',
    };
  }

  if (tone === 'rose') {
    return {
      heroBg: '#f43f5e',
      iconWrapBg: '#ffe4e6',
      iconColor: '#be123c',
    };
  }

  return {
    heroBg: '#71717a',
    iconWrapBg: '#f4f4f5',
    iconColor: '#3f3f46',
  };
}

export function RequestStatusScreen({ route, navigate, goBack }) {
  const { user } = useAuth();
  const requestId = route?.params?.requestId || '';
  const [request, setRequest] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [cancelReason, setCancelReason] = useState('');
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [isCanceling, setIsCanceling] = useState(false);
  const [offeredTutorProfile, setOfferedTutorProfile] = useState(null);

  useEffect(() => {
    if (!requestId) {
      goBack('CustomerHome');
    }
  }, [goBack, requestId]);

  useEffect(() => {
    if (!requestId) {
      setLoading(false);
      setRequest(null);
      return () => {};
    }

    return subscribeToRequestById(
      requestId,
      (item) => {
        setRequest(item);
        setLoading(false);
      },
      (nextError) => {
        setError(nextError.message || 'Unable to load this request right now.');
        setLoading(false);
      },
    );
  }, [requestId]);

  useEffect(() => subscribeToStudentSessions(
    user?.uid,
    (items) => setSessions(items),
    () => setSessions([]),
  ), [user?.uid]);

  useEffect(() => {
    const offeredTutorId = request?.status === 'offered'
      ? (request?.currentOfferTutorId || request?.tutorId || '')
      : '';

    if (!offeredTutorId) {
      setOfferedTutorProfile(null);
      return undefined;
    }

    let isMounted = true;
    getUserProfile(offeredTutorId)
      .then((profile) => {
        if (isMounted) {
          setOfferedTutorProfile(profile || null);
        }
      })
      .catch(() => {
        if (isMounted) {
          setOfferedTutorProfile(null);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [request?.currentOfferTutorId, request?.status, request?.tutorId]);

  const relatedSession = useMemo(
    () => sessions.find((item) => item.requestId === requestId) || null,
    [requestId, sessions],
  );

  const relatedSessionStatus = String(relatedSession?.status || '').toLowerCase();
  const relatedSessionIsActive = ['waiting_student', 'in_progress', 'in_session'].includes(relatedSessionStatus);
  const joinSessionId = relatedSession?.id || request?.sessionId || '';
  const normalizedStatus = String(request?.status || '').toLowerCase();
  const hasActiveSession = Boolean(joinSessionId) && (relatedSession ? relatedSessionIsActive : true);
  const canJoin = hasActiveSession && !TERMINAL_REQUEST_STATUSES.includes(normalizedStatus);
  const shouldAutoOpenSession = canJoin && Boolean(joinSessionId);

  useEffect(() => {
    if (!shouldAutoOpenSession || !joinSessionId) return;
    navigate({ key: 'SessionRoom', params: { sessionId: joinSessionId, parentTab: 'Requests' } });
  }, [joinSessionId, navigate, shouldAutoOpenSession]);

  if (loading) {
    return <LoadingState label="Loading job request status" />;
  }

  if (error) {
    return <ErrorState message={error} />;
  }

  if (!request) {
    return <ErrorState title="Request not found" message="We could not find this job request." />;
  }

  if (!requestId) {
    return null;
  }

  const effectiveStatus = hasActiveSession && ['pending', 'matching', 'offered', 'no_tutor_available'].includes(normalizedStatus)
    ? (relatedSessionStatus === 'in_progress' ? 'in_progress' : 'waiting_student')
    : request.status;
  const statusText = getStatusCopy(effectiveStatus);
  const statusMeta = getStatusMeta(effectiveStatus);
  const tone = getToneStyles(statusMeta.tone);
  const isWaitingTutorAcceptance = String(request?.status || '').toLowerCase() === 'offered';
  const tutorDisplayName = offeredTutorProfile?.fullName || offeredTutorProfile?.displayName || request?.tutorName || 'Helper';
  const tutorAvatarLetter = tutorDisplayName.charAt(0).toUpperCase();
  const canCancel = !TERMINAL_REQUEST_STATUSES.includes(String(request.status || '').toLowerCase());
  const tutorRating = Number(
    offeredTutorProfile?.tutorProfile?.overallRating
    ?? offeredTutorProfile?.ratings?.asTutor?.average
    ?? 0,
  );

  const handleCancel = async () => {
    if (!cancelReason.trim()) {
      return;
    }

    setIsCanceling(true);
    try {
      await cancelClassRequest({
        requestId,
        canceledBy: 'student',
        reason: cancelReason,
      });
      setShowCancelModal(false);
      setCancelReason('');
      navigate({ key: 'Requests', params: {} });
    } finally {
      setIsCanceling(false);
    }
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.pageHeader}>
        <Text style={styles.pageTitle}>Job Request Status</Text>
        <Text style={styles.pageDescription}>Simple live status for your job request.</Text>
      </View>

      <View style={styles.heroShell}>
        <View style={[styles.heroCard, { backgroundColor: tone.heroBg }]}>
          <Text style={styles.kicker}>Live request update</Text>
          <Text style={styles.heroTitle}>{statusText}</Text>
          <Text style={styles.heroCopy}>
            Request, helper matching, and completion updates appear here.
          </Text>

          <View style={styles.currentStateCard}>
            <View style={styles.currentStateHeader}>
              <View style={[styles.currentStateIconWrap, { backgroundColor: tone.iconWrapBg }]}>
                <Ionicons name={statusMeta.icon} size={20} color={tone.iconColor} />
              </View>
              <View style={styles.currentStateTextWrap}>
                <Text style={styles.currentStateLabel}>Current state</Text>
                <Text style={styles.currentStateValue}>{statusMeta.label}</Text>
              </View>
            </View>
            <Text style={styles.currentStateBadge}>{statusMeta.badge}</Text>
            {canJoin && joinSessionId ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => navigate({ key: 'SessionRoom', params: { sessionId: joinSessionId, parentTab: 'Requests' } })}
                style={styles.topJoinButton}
              >
                <Text style={styles.topJoinButtonText}>Open job</Text>
                <Ionicons name="arrow-forward" size={14} color="#ffffff" />
              </Pressable>
            ) : null}

            {isWaitingTutorAcceptance ? (
              <View style={styles.tutorCard}>
                <View style={styles.tutorAvatar}>
                  <Text style={styles.tutorAvatarText}>{tutorAvatarLetter}</Text>
                </View>
                <View style={styles.tutorMeta}>
                  <Text style={styles.tutorLabel}>Helper</Text>
                  <Text style={styles.tutorName}>{tutorDisplayName}</Text>
                  <Text style={styles.tutorRating}>Rating: {tutorRating > 0 ? `${tutorRating.toFixed(2)}` : 'Not rated yet'}</Text>
                </View>
              </View>
            ) : null}
          </View>
        </View>
      </View>

      <Card style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Request overview</Text>
        <Text style={styles.sectionSubtitle}>Essential details only. Open full details when needed.</Text>

        <View style={styles.overviewGrid}>
          <View style={styles.metric}>
            <Text style={styles.metricLabel}>Service type</Text>
            <Text style={styles.metricValue}>{request.topic || 'Your request'}</Text>
          </View>
          <View style={styles.metric}>
            <Text style={styles.metricLabel}>Duration</Text>
            <Text style={styles.metricValue}>{request.duration || 'Per-minute billing'}</Text>
          </View>
          <View style={styles.metric}>
            <Text style={styles.metricLabel}>Payment method</Text>
            <Text style={styles.metricValue}>{request.selectedCardId || 'Selected card on file'}</Text>
          </View>
        </View>

        {canJoin ? (
          <View style={styles.readyCard}>
            <Text style={styles.readyText}>Your job is ready. Open it from the button below.</Text>
          </View>
        ) : null}

        {isWaitingTutorAcceptance ? (
          <View style={styles.offerCard}>
            <Text style={styles.offerTitle}>Waiting for helper to accept</Text>
          </View>
        ) : null}

        {request?.statusDetail ? (
          <View style={styles.detailBanner}>
            <Text style={styles.detailBannerText}>{request.statusDetail}</Text>
          </View>
        ) : null}
      </Card>

      <Card style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Actions</Text>
        <Text style={styles.sectionSubtitle}>Quick things you may need right now.</Text>

        <View style={styles.actions}>
          {canJoin ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => navigate({ key: 'SessionRoom', params: { sessionId: joinSessionId, parentTab: 'Requests' } })}
              style={styles.joinButton}
            >
              <Text style={styles.joinButtonText}>Open job</Text>
              <Ionicons name="arrow-forward" size={16} color="#ffffff" />
            </Pressable>
          ) : null}

          <Pressable
            accessibilityRole="button"
            onPress={() => navigate({ key: 'RequestDetails', params: { requestId, parentTab: 'Requests' } })}
            style={styles.secondaryAction}
          >
            <Text style={styles.secondaryActionText}>View full request details</Text>
          </Pressable>

          {canCancel ? (
            <Pressable accessibilityRole="button" onPress={() => setShowCancelModal(true)} style={styles.cancelAction}>
              <Text style={styles.cancelActionText}>Cancel Request</Text>
            </Pressable>
          ) : null}
        </View>
      </Card>

      <Modal animationType="fade" transparent visible={showCancelModal} onRequestClose={() => setShowCancelModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Cancel request</Text>
            <Text style={styles.modalCopy}>
              Please provide a reason. This helps us improve matching quality.
            </Text>
            <FormField
              label="Reason"
              multiline
              numberOfLines={4}
              placeholder="Type your cancellation reason"
              value={cancelReason}
              onChangeText={setCancelReason}
              inputStyle={styles.reasonInput}
            />
            <View style={styles.modalActions}>
              <Button variant="secondary" onPress={() => setShowCancelModal(false)}>Close</Button>
              <Button disabled={!cancelReason.trim() || isCanceling} onPress={handleCancel}>
                {isCanceling ? 'Canceling...' : 'Confirm cancel'}
              </Button>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 16,
  },
  pageHeader: {
    gap: 4,
  },
  pageTitle: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '900',
  },
  pageDescription: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
  },
  heroShell: {
    backgroundColor: '#ffffff',
    borderColor: colors.border,
    borderRadius: 32,
    borderWidth: 1,
    overflow: 'hidden',
  },
  heroCard: {
    gap: 10,
    paddingHorizontal: 18,
    paddingVertical: 20,
  },
  kicker: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderColor: 'rgba(255,255,255,0.25)',
    borderRadius: 999,
    borderWidth: 1,
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '900',
    paddingHorizontal: 10,
    paddingVertical: 4,
    textTransform: 'uppercase',
  },
  heroTitle: {
    color: '#ffffff',
    fontSize: 34,
    fontWeight: '900',
  },
  heroCopy: {
    color: 'rgba(255,255,255,0.92)',
    fontSize: 15,
    lineHeight: 22,
  },
  currentStateCard: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderColor: 'rgba(255,255,255,0.25)',
    borderRadius: 24,
    borderWidth: 1,
    gap: 8,
    marginTop: 6,
    padding: 14,
  },
  currentStateHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  currentStateIconWrap: {
    alignItems: 'center',
    borderRadius: 16,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  currentStateTextWrap: {
    flex: 1,
  },
  currentStateLabel: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  currentStateValue: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '800',
  },
  currentStateBadge: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 13,
  },
  topJoinButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderColor: 'rgba(255,255,255,0.3)',
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  topJoinButtonText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  tutorCard: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderColor: 'rgba(255,255,255,0.2)',
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
    padding: 10,
  },
  tutorAvatar: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderRadius: 16,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  tutorAvatarText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '900',
  },
  tutorMeta: {
    flex: 1,
    gap: 2,
  },
  tutorLabel: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  tutorName: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800',
  },
  tutorRating: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 12,
  },
  sectionCard: {
    gap: 14,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '900',
  },
  sectionSubtitle: {
    color: colors.muted,
    fontSize: 13,
    marginTop: -8,
  },
  overviewGrid: {
    gap: 10,
  },
  metric: {
    backgroundColor: '#fafafa',
    borderColor: colors.border,
    borderRadius: 20,
    borderWidth: 1,
    padding: 14,
  },
  metricLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  metricValue: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '800',
    marginTop: 6,
  },
  readyCard: {
    backgroundColor: '#ecfdf5',
    borderColor: '#a7f3d0',
    borderRadius: 20,
    borderWidth: 1,
    padding: 14,
  },
  readyText: {
    color: '#065f46',
    fontSize: 14,
    fontWeight: '700',
  },
  offerCard: {
    backgroundColor: '#eef2ff',
    borderColor: '#c7d2fe',
    borderRadius: 20,
    borderWidth: 1,
    padding: 14,
  },
  offerTitle: {
    color: colors.indigo,
    fontSize: 14,
    fontWeight: '800',
  },
  detailBanner: {
    backgroundColor: '#f4f4f5',
    borderRadius: 18,
    padding: 14,
  },
  detailBannerText: {
    color: colors.text,
    fontSize: 14,
    lineHeight: 20,
  },
  actions: {
    gap: 10,
  },
  joinButton: {
    alignItems: 'center',
    backgroundColor: colors.brand,
    borderRadius: 16,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: 16,
  },
  joinButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800',
  },
  secondaryAction: {
    alignItems: 'center',
    backgroundColor: '#fafafa',
    borderColor: colors.border,
    borderRadius: 16,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: 16,
  },
  secondaryActionText: {
    color: '#27272a',
    fontSize: 14,
    fontWeight: '800',
  },
  cancelAction: {
    alignItems: 'center',
    backgroundColor: '#fff1f2',
    borderColor: '#fecdd3',
    borderRadius: 16,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: 16,
  },
  cancelActionText: {
    color: '#be123c',
    fontSize: 14,
    fontWeight: '800',
  },
  modalOverlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    backgroundColor: 'rgba(15,23,42,0.28)',
  },
  modalCard: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    padding: 18,
    width: '100%',
    maxWidth: 440,
    gap: 14,
  },
  modalTitle: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '900',
  },
  modalCopy: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
  },
  reasonInput: {
    minHeight: 110,
    paddingTop: 12,
    textAlignVertical: 'top',
  },
  modalActions: {
    gap: 10,
  },
});
