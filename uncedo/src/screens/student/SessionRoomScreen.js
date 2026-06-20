import { useCallback, useEffect, useRef, useState } from 'react';
import {
  PermissionsAndroid,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { StudentRtcSessionView } from '../../components/student/StudentRtcSessionView';
import { StudentAiSessionView } from '../../components/student/StudentAiSessionView';
import { Card } from '../../components/ui/Card';
import { ErrorState, LoadingState } from '../../components/ui/States';
import { useAuth } from '../../context/AuthContext';
import { FIREBASE_PUBLIC_CONFIG } from '../../constants/runtimeConfig';
import { getFirebaseClients } from '../../firebase/config';
import {
  endSession,
  joinSessionAsStudent,
  subscribeToSessionById,
  updateSession,
} from '../../services/sessionService';

function useBillableSeconds(session, isBillableActive) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const accumulatedSeconds = Math.max(0, Number(session?.billedSeconds || 0));
  const activeStartedAt = Number(session?.billingStartedAt || 0);
  if (!isBillableActive || !activeStartedAt) return accumulatedSeconds;

  return accumulatedSeconds + Math.max(0, Math.floor((now - activeStartedAt) / 1000));
}

export function SessionRoomScreen({ route, navigate, goBack, systemInsets = {} }) {
  const { user } = useAuth();
  const { height, width } = useWindowDimensions();
  const isPortraitMobile = height > width;
  const topInset = Math.max(0, Number(systemInsets?.top || 0));
  const bottomInset = Math.max(0, Number(systemInsets?.bottom || 0));

  const bridgeRef = useRef(null);
  const joinAttemptedRef = useRef(false);
  const extensionPromptShownRef = useRef(false);
  const autoEndingRef = useRef(false);
  const terminalRedirectedRef = useRef(false);

  const sessionId = route?.params?.sessionId || '';
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [hasMicPermission, setHasMicPermission] = useState(Platform.OS === 'android' ? null : true);
  const [idToken, setIdToken] = useState('');
  const [authHandoff, setAuthHandoff] = useState(null);
  const [hasAcceptedExtension, setHasAcceptedExtension] = useState(false);
  const [graceEndsAtMs, setGraceEndsAtMs] = useState(null);
  const [rtcState, setRtcState] = useState({
    connectionMessage: 'Connecting...',
    networkError: '',
    isMuted: false,
    isPeerConnected: false,
    isRemoteScreenSharing: false,
    hasLiveRemoteScreenTrack: false,
  });

  const selectedDurationMinutes = Number(session?.durationMinutes || session?.pricingSnapshot?.durationMinutes || 0);
  const selectedDurationSeconds = Math.max(0, Math.round(selectedDurationMinutes * 60));
  const isAiSession = String(session?.sessionType || '').toLowerCase() === 'ai';
  const isWebRtcConnected = String(session?.webrtc?.status || '').toLowerCase() === 'connected';
  const isTutorScreenSharingActive = session?.webrtc?.screenShare?.active === true;
  const isStudentBillableActive = session?.status === 'in_progress' && (
    isAiSession
      ? ['connected', 'listening', 'speaking'].includes(String(session?.aiLive?.status || '').toLowerCase())
      : (isWebRtcConnected && isTutorScreenSharingActive)
  );
  const billedSeconds = useBillableSeconds(session, isStudentBillableActive);
  useEffect(() => subscribeToSessionById(
    sessionId,
    (item) => {
      setSession(item);
      setLoading(false);
    },
    (nextError) => {
      setError(nextError.message || 'Unable to load this session right now.');
      setLoading(false);
    },
  ), [sessionId]);

  useEffect(() => {
    joinAttemptedRef.current = false;
    setHasAcceptedExtension(false);
    setGraceEndsAtMs(null);
    extensionPromptShownRef.current = false;
    autoEndingRef.current = false;
  }, [session?.id]);

  useEffect(() => {
    if (isAiSession) {
      setHasMicPermission(true);
      return () => {};
    }
    let active = true;
    const ensureMicPermission = async () => {
      if (Platform.OS !== 'android') {
        if (active) setHasMicPermission(true);
        return;
      }

      try {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
          {
            title: 'Microphone permission required',
            message: 'Uncedo needs microphone access so WebView job calls can connect to live audio.',
            buttonPositive: 'Allow',
            buttonNegative: 'Not now',
          },
        );
        if (active) {
          setHasMicPermission(granted === PermissionsAndroid.RESULTS.GRANTED);
        }
      } catch {
        if (active) setHasMicPermission(false);
      }
    };

    ensureMicPermission();
    return () => {
      active = false;
    };
  }, [isAiSession]);

  useEffect(() => {
    let active = true;
    const resolveAuthHandoff = async () => {
      try {
        const clients = await getFirebaseClients();
        const firebaseUser = clients?.auth?.currentUser;
        const apiKey = String(FIREBASE_PUBLIC_CONFIG.apiKey || '').trim();
        if (!firebaseUser || !apiKey) {
          if (active) setAuthHandoff(null);
          return;
        }
        const serialized = typeof firebaseUser.toJSON === 'function' ? firebaseUser.toJSON() : null;
        if (!serialized) {
          if (active) setAuthHandoff(null);
          return;
        }
        if (active) setAuthHandoff({ apiKey, user: serialized });
      } catch {
        if (active) setAuthHandoff(null);
      }
    };
    resolveAuthHandoff();
    return () => {
      active = false;
    };
  }, [user?.uid]);

  useEffect(() => {
    let active = true;
    const resolveIdToken = async () => {
      try {
        const clients = await getFirebaseClients();
        const token = await clients?.auth?.currentUser?.getIdToken?.();
        if (active) setIdToken(token || '');
      } catch {
        if (active) setIdToken('');
      }
    };
    resolveIdToken();
    return () => {
      active = false;
    };
  }, [user?.uid]);

  useEffect(() => {
    if (!session?.id) return;
    if (session.status !== 'waiting_student') return;
    if (joinAttemptedRef.current) return;

    joinAttemptedRef.current = true;
    const defaultMethod = (user?.paymentMethods || []).find((method) => method?.isDefault)
      || user?.paymentMethods?.[0]
      || null;

    joinSessionAsStudent(session, defaultMethod?.id || '', defaultMethod?.last4 || '')
      .catch((joinError) => {
        setError(joinError.message || 'Unable to join this session.');
        joinAttemptedRef.current = false;
      });
  }, [session, user?.paymentMethods]);

  useEffect(() => {
    if (!session?.id) return;
    if (!['waiting_student', 'in_progress'].includes(session.status)) return;

    const syncBillableClock = async () => {
      const accumulatedSeconds = Math.max(0, Number(session.billedSeconds || 0));
      const activeStartedAt = Number(session.billingStartedAt || 0);
      if (isStudentBillableActive) {
        if (activeStartedAt) return;
        await updateSession(session.id, {
          billingStartedAt: Date.now(),
          billedSeconds: accumulatedSeconds,
        });
        return;
      }
      if (!activeStartedAt) return;

      const nextBilledSeconds = accumulatedSeconds + Math.max(0, Math.floor((Date.now() - activeStartedAt) / 1000));
      await updateSession(session.id, {
        billingStartedAt: null,
        billedSeconds: nextBilledSeconds,
      });
    };

    syncBillableClock().catch((billingError) => {
      setError(billingError.message || 'Unable to update billable time.');
    });
  }, [
    isStudentBillableActive,
    session?.billingStartedAt,
    session?.billedSeconds,
    session?.id,
    session?.status,
  ]);

  useEffect(() => {
    if (!session) return;
    if (session.status !== 'in_progress') return;
    if (!selectedDurationSeconds || !session.billingStartedAt) return;

    const warningThreshold = Math.max(0, selectedDurationSeconds - 60);
    if (!extensionPromptShownRef.current && billedSeconds >= warningThreshold) {
      extensionPromptShownRef.current = true;
      setHasAcceptedExtension(true);
      setGraceEndsAtMs(Date.now() + (Math.max(0, selectedDurationSeconds + 120 - billedSeconds) * 1000));
    }

    if (!hasAcceptedExtension && billedSeconds >= selectedDurationSeconds && !autoEndingRef.current) {
      autoEndingRef.current = true;
      endSession(session).catch((nextError) => {
        autoEndingRef.current = false;
        setError(nextError.message || 'Unable to end session at selected time.');
      });
    }
  }, [billedSeconds, hasAcceptedExtension, selectedDurationSeconds, session]);

  useEffect(() => () => {
    if (bridgeRef.current) {
      if (typeof bridgeRef.current.close === 'function') {
        bridgeRef.current.close();
      } else {
        bridgeRef.current.injectJavaScript?.('((window.UncedoSessionBridge||window.ParakleoSessionBridge)&&((window.UncedoSessionBridge||window.ParakleoSessionBridge).close)&&((window.UncedoSessionBridge||window.ParakleoSessionBridge).close())); true;');
      }
    }
  }, []);

  const handleBridgeMessage = (event) => {
    try {
      const payload = JSON.parse(event.nativeEvent.data || '{}');
      if (payload.type === 'rtc_state') {
        setRtcState((prev) => ({
          ...prev,
          ...(payload.payload || {}),
        }));
        return;
      }

      if (payload.type === 'log') {
        const message = payload?.payload?.message || 'RTC bridge log';
        const details = [];
        if (payload?.payload?.detail !== undefined) {
          try {
            details.push(typeof payload.payload.detail === 'string'
              ? payload.payload.detail
              : JSON.stringify(payload.payload.detail));
          } catch {
            details.push(String(payload.payload.detail));
          }
        }
        if (payload?.payload?.error) {
          details.push(String(payload.payload.error));
        }
        const detail = details.length ? ` (${details.join(' | ')})` : '';
        // Surface WebView RTC diagnostics in Metro/device logs for debugging.
        // eslint-disable-next-line no-console
        console.log(`[StudentRtcBridge] ${message}${detail}`);
      }
    } catch {
      // Ignore malformed bridge messages from the WebView.
    }
  };

  const closeRtcBridge = () => {
    if (typeof bridgeRef.current?.close === 'function') {
      bridgeRef.current.close();
      return;
    }
    bridgeRef.current?.injectJavaScript?.('((window.UncedoSessionBridge||window.ParakleoSessionBridge)&&((window.UncedoSessionBridge||window.ParakleoSessionBridge).close)&&((window.UncedoSessionBridge||window.ParakleoSessionBridge).close())); true;');
  };

  const navigateToRequestStatus = useCallback((requestId) => {
    if (requestId) {
      navigate({ key: 'RequestStatus', params: { requestId, parentTab: 'Requests' } });
      return;
    }
    goBack('Requests');
  }, [goBack, navigate]);

  useEffect(() => {
    if (!session?.id) return;
    const normalizedStatus = String(session.status || '').toLowerCase();
    if (!['completed', 'canceled', 'canceled_during'].includes(normalizedStatus)) return;
    if (terminalRedirectedRef.current) return;

    terminalRedirectedRef.current = true;
    closeRtcBridge();
    navigateToRequestStatus(session?.requestId || '');
  }, [session?.id, session?.requestId, session?.status, navigateToRequestStatus]);

  if (loading) return <LoadingState label="Loading job room" />;
  if (error && !session) return <ErrorState message={error} />;
  if (!session) return <ErrorState title="Job not found" message="Job not found or no access." />;

  return (
    <View style={[styles.safe, { paddingBottom: bottomInset, paddingTop: topInset }]}>
      <View style={styles.root}>
        {isPortraitMobile ? (
          <View style={styles.rotateOverlay}>
            <Card style={styles.rotateCard}>
              <Text style={styles.rotateTitle}>Rotate your device</Text>
              <Text style={styles.rotateCopy}>
                This live job room is best viewed in landscape so the shared content can fill the page clearly.
              </Text>
            </Card>
          </View>
        ) : null}

        <Pressable style={styles.stage}>
          {['waiting_student', 'in_progress'].includes(String(session.status || '')) ? (
            isAiSession ? (
              <StudentAiSessionView
                authHandoff={authHandoff}
                onBridgeMessage={handleBridgeMessage}
                sessionId={session.id}
              />
            ) : hasMicPermission ? (
              <StudentRtcSessionView
                authHandoff={authHandoff}
                bridgeRef={bridgeRef}
                idToken={idToken}
                onBridgeMessage={handleBridgeMessage}
                sessionId={session.id}
              />
            ) : (
              <View style={styles.stageFallback}>
                <Card style={styles.fallbackCard}>
                  <Text style={styles.fallbackTitle}>Microphone access is required</Text>
                  <Text style={styles.fallbackCopy}>
                    Please allow microphone permission in app settings, then reopen the job room.
                  </Text>
                </Card>
              </View>
            )
          ) : (
            <View style={styles.stageFallback}>
              <Card style={styles.fallbackCard}>
                <Text style={styles.fallbackTitle}>No live content has started yet.</Text>
                <Text style={styles.fallbackCopy}>
                  Your helper&apos;s shared content will appear here once the live view starts.
                </Text>
              </Card>
            </View>
          )}

          {/* Mobile controls intentionally removed so only WebView session controls are shown. */}
        </Pressable>

        {error ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  root: {
    backgroundColor: '#ffffff',
    flex: 1,
  },
  stage: {
    backgroundColor: '#000000',
    flex: 1,
    overflow: 'hidden',
    position: 'relative',
  },
  stageFallback: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  fallbackCard: {
    alignItems: 'center',
    maxWidth: 420,
    width: '100%',
  },
  fallbackTitle: {
    color: '#18181b',
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
  },
  fallbackCopy: {
    color: '#52525b',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 8,
    textAlign: 'center',
  },
  topOverlay: {
    left: 72,
    position: 'absolute',
    right: 12,
    top: 12,
    zIndex: 20,
  },
  hiddenOverlay: {
    opacity: 0,
  },
  badgeWrap: {
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderColor: 'rgba(228,228,231,1)',
    borderRadius: 22,
    borderWidth: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    padding: 10,
  },
  badge: {
    backgroundColor: '#ffffff',
    borderColor: '#e4e4e7',
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  badgeInner: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  badgeSuccess: {
    backgroundColor: '#fdf4ff',
    borderColor: '#f5d0fe',
  },
  badgeWarning: {
    backgroundColor: '#fffbeb',
    borderColor: '#fde68a',
  },
  badgeDanger: {
    backgroundColor: '#fff1f2',
    borderColor: '#fecdd3',
  },
  badgeInfo: {
    backgroundColor: '#f0f9ff',
    borderColor: '#bae6fd',
  },
  badgeText: {
    color: '#27272a',
    fontSize: 12,
    fontWeight: '700',
  },
  badgeTextSuccess: {
    color: '#a21caf',
  },
  badgeTextWarning: {
    color: '#b45309',
  },
  badgeTextDanger: {
    color: '#be123c',
  },
  badgeTextInfo: {
    color: '#0369a1',
  },
  controlsRailWrap: {
    bottom: 16,
    left: 16,
    position: 'absolute',
    zIndex: 30,
  },
  controlsRail: {
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderColor: '#e4e4e7',
    borderRadius: 24,
    borderWidth: 1,
    gap: 8,
    padding: 8,
  },
  railIconButton: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderColor: '#e4e4e7',
    borderRadius: 22,
    borderWidth: 1,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  railIconButtonActive: {
    backgroundColor: '#fdf4ff',
    borderColor: '#f0abfc',
  },
  railIconButtonDanger: {
    backgroundColor: '#f43f5e',
    borderColor: '#f43f5e',
  },
  joinNowWrap: {
    bottom: 16,
    position: 'absolute',
    right: 16,
    zIndex: 30,
  },
  joinNowButton: {
    borderRadius: 16,
    minHeight: 46,
    paddingHorizontal: 18,
  },
  errorBanner: {
    backgroundColor: '#fff1f2',
    borderColor: '#fecdd3',
    borderTopWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  errorText: {
    color: '#be123c',
    fontSize: 12,
    fontWeight: '600',
  },
  rotateOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.85)',
    justifyContent: 'center',
    padding: 24,
    zIndex: 70,
  },
  rotateCard: {
    maxWidth: 360,
    width: '100%',
  },
  rotateTitle: {
    color: '#18181b',
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
  },
  rotateCopy: {
    color: '#52525b',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 8,
    textAlign: 'center',
  },
  modalOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    padding: 16,
    zIndex: 120,
  },
  modalCard: {
    gap: 12,
    maxWidth: 460,
    width: '100%',
  },
  modalTitle: {
    color: '#18181b',
    fontSize: 24,
    fontWeight: '900',
  },
  modalCopy: {
    color: '#52525b',
    fontSize: 14,
    lineHeight: 20,
  },
  modalInput: {
    borderColor: '#d4d4d8',
    borderRadius: 12,
    borderWidth: 1,
    color: '#18181b',
    minHeight: 110,
    paddingHorizontal: 12,
    paddingTop: 10,
  },
  modalError: {
    color: '#be123c',
    fontSize: 12,
    fontWeight: '600',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 8,
  },
  modalButton: {
    flex: 1,
  },
});
