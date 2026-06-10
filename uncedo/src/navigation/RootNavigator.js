import { useEffect, useMemo, useRef, useState } from 'react';
import { Linking, Modal, Platform, Pressable, SafeAreaView, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LoadingState } from '../components/ui/States';
import { SessionRatingPrompt } from '../components/student/SessionRatingPrompt';
import { useAuth } from '../context/AuthContext';
import { HomeScreen } from '../screens/auth/HomeScreen';
import { LoginScreen } from '../screens/auth/LoginScreen';
import { SignupScreen } from '../screens/auth/SignupScreen';
import { SafetyLegalScreen } from '../screens/customer/SafetyLegalScreen';
import { CustomerHomeScreen } from '../screens/customer/CustomerHomeScreen';
import { JobRequestThreadScreen } from '../screens/customer/JobRequestThreadScreen';
import { NotificationsScreen } from '../screens/student/NotificationsScreen';
import { OnboardingScreen } from '../screens/student/OnboardingScreen';
import { ProfileScreen } from '../screens/student/ProfileScreen';
import { RequestDetailsScreen } from '../screens/student/RequestDetailsScreen';
import { RequestStatusScreen } from '../screens/student/RequestStatusScreen';
import { RequestsScreen } from '../screens/student/RequestsScreen';
import { SessionRoomScreen } from '../screens/student/SessionRoomScreen';
import { WalletScreen } from '../screens/student/WalletScreen';
import {
  markAllNotificationsRead,
  markNotificationRead,
  subscribeToNotifications,
} from '../services/notificationService';
import { subscribeToStudentSessions } from '../services/sessionService';
import { colors } from '../theme/colors';
import { RATABLE_SESSION_STATUSES } from '../utils/sessionStatus';

const authScreens = {
  Home: HomeScreen,
  Login: LoginScreen,
  Signup: SignupScreen,
};

const appScreens = {
  CustomerHome: CustomerHomeScreen,
  Requests: RequestsScreen,
  Wallet: WalletScreen,
  Profile: ProfileScreen,
  Onboarding: OnboardingScreen,
  SafetyLegal: SafetyLegalScreen,
  Notifications: NotificationsScreen,
  RequestStatus: RequestStatusScreen,
  RequestDetails: RequestDetailsScreen,
  JobRequestThread: JobRequestThreadScreen,
  SessionRoom: SessionRoomScreen,
};

const drawerItems = [
  { key: 'CustomerHome', label: 'Home', icon: 'home-outline' },
  { key: 'Requests', label: 'My Job Requests', icon: 'briefcase-outline' },
  { key: 'Wallet', label: 'Payments / Wallet', icon: 'card-outline' },
  { key: 'Profile', label: 'Profile', icon: 'person-outline' },
  { key: 'SafetyLegal', label: 'Safety / Legal', icon: 'shield-checkmark-outline' },
];

function resolveDeepLink(url) {
  if (!url) {
    return null;
  }

  const cleaned = String(url || '').replace(/^[a-z]+:\/\//i, '');
  const parts = cleaned.split('/').filter(Boolean);
  const host = String(parts[0] || '').toLowerCase();
  const firstPathSegment = parts[1] || '';

  if (host === 'request' && firstPathSegment) {
    return { key: 'RequestStatus', params: { requestId: firstPathSegment, parentTab: 'Requests' } };
  }

  if (host === 'request-details' && firstPathSegment) {
    return { key: 'RequestDetails', params: { requestId: firstPathSegment, parentTab: 'Requests' } };
  }

  if (host === 'session' && firstPathSegment) {
    return { key: 'SessionRoom', params: { sessionId: firstPathSegment, parentTab: 'Requests' } };
  }

  return null;
}

function getParentTab(routeKey, params) {
  if (params?.parentTab) {
    return params.parentTab;
  }

  if (['RequestStatus', 'RequestDetails', 'SessionRoom'].includes(routeKey)) {
    return 'Requests';
  }

  if (routeKey === 'JobRequestThread') {
    return 'CustomerHome';
  }

  return routeKey;
}

function resolveNotificationRoute(notification = {}) {
  const targetPath = String(notification?.targetPath || '').trim();
  const type = String(notification?.type || '').toLowerCase();
  const requestId = notification?.requestId || '';
  const sessionId = notification?.sessionId || '';

  if (targetPath.startsWith('/app/session/')) {
    const targetSessionId = targetPath.split('/app/session/')[1] || sessionId;
    return targetSessionId
      ? { key: 'SessionRoom', params: { sessionId: targetSessionId, parentTab: 'Requests' } }
      : { key: 'Requests', params: {} };
  }

  if (targetPath.includes('/student/payment') || type.includes('payment')) {
    return { key: 'Wallet', params: {} };
  }

  if (targetPath.includes('/student/requests') || type === 'lesson_completed' || type === 'session_completed') {
    return requestId
      ? { key: 'RequestStatus', params: { requestId, parentTab: 'Requests' } }
      : { key: 'Requests', params: {} };
  }

  if (sessionId) {
    return { key: 'SessionRoom', params: { sessionId, parentTab: 'Requests' } };
  }

  if (requestId) {
    return { key: 'RequestStatus', params: { requestId, parentTab: 'Requests' } };
  }

  return { key: 'CustomerHome', params: {} };
}

export function RootNavigator() {
  const { initializing, logout, user } = useAuth();
  const [authRoute, setAuthRoute] = useState('Home');
  const [activeRoute, setActiveRoute] = useState({ key: 'CustomerHome', params: {} });
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [notificationsLoading, setNotificationsLoading] = useState(true);
  const [sessions, setSessions] = useState([]);
  const [ratingQueue, setRatingQueue] = useState([]);
  const [handledRatingSessionIds, setHandledRatingSessionIds] = useState([]);
  const previousSessionStatusesRef = useRef(new Map());
  const ratingTarget = useMemo(() => {
    if (!ratingQueue.length) return null;
    const [nextSessionId] = ratingQueue;
    return sessions.find((session) => session.id === nextSessionId) || null;
  }, [ratingQueue, sessions]);

  useEffect(() => {
    let mounted = true;

    Linking.getInitialURL().then((url) => {
      if (!mounted) {
        return;
      }

      const route = resolveDeepLink(url);
      if (route) {
        setActiveRoute(route);
      }
    });

    const subscription = Linking.addEventListener('url', ({ url }) => {
      const route = resolveDeepLink(url);
      if (route) {
        setActiveRoute(route);
      }
    });

    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    if (!user?.uid) {
      setAuthRoute('Home');
      setActiveRoute({ key: 'CustomerHome', params: {} });
      setIsDrawerOpen(false);
      setNotifications([]);
      setSessions([]);
      setRatingQueue([]);
      setHandledRatingSessionIds([]);
      previousSessionStatusesRef.current = new Map();
      setNotificationsLoading(false);
      return () => {};
    }

    return subscribeToNotifications(
      user.uid,
      (items) => {
        setNotifications(items);
        setNotificationsLoading(false);
      },
      () => {
        setNotifications([]);
        setNotificationsLoading(false);
      },
    );
  }, [user?.uid]);

  useEffect(() => {
    if (!user?.uid) {
      setSessions([]);
      setRatingQueue([]);
      setHandledRatingSessionIds([]);
      previousSessionStatusesRef.current = new Map();
      return () => {};
    }

    return subscribeToStudentSessions(
      user.uid,
      (items) => setSessions(items),
      () => setSessions([]),
    );
  }, [user?.uid]);

  useEffect(() => {
    if (!user?.uid) return;

    const previousStatuses = previousSessionStatusesRef.current;
    const currentStatuses = new Map();
    const transitionedSessionIds = [];

    sessions.forEach((session) => {
      const sessionId = String(session?.id || '').trim();
      if (!sessionId) return;

      const currentStatus = String(session?.status || '').toLowerCase();
      const previousStatus = previousStatuses.get(sessionId);
      currentStatuses.set(sessionId, currentStatus);

      if (!previousStatus) return;
      if (previousStatus === currentStatus) return;
      if (RATABLE_SESSION_STATUSES.includes(previousStatus)) return;
      if (!RATABLE_SESSION_STATUSES.includes(currentStatus)) return;
      if (handledRatingSessionIds.includes(sessionId)) return;

      transitionedSessionIds.push(sessionId);
    });

    previousSessionStatusesRef.current = currentStatuses;

    if (!transitionedSessionIds.length) return;
    setRatingQueue((prev) => {
      const seen = new Set(prev);
      const next = [...prev];
      transitionedSessionIds.forEach((sessionId) => {
        if (!seen.has(sessionId)) {
          next.push(sessionId);
          seen.add(sessionId);
        }
      });
      return next;
    });
  }, [handledRatingSessionIds, sessions, user?.uid]);

  useEffect(() => {
    if (!ratingQueue.length) return;
    const activeSessionIds = new Set(sessions.map((session) => session.id));
    setRatingQueue((prev) => prev.filter((sessionId) => activeSessionIds.has(sessionId)));
  }, [ratingQueue.length, sessions]);

  if (initializing) {
    return (
      <View style={styles.safe}>
        <LoadingState label="Restoring session" />
      </View>
    );
  }

  if (!user) {
    const AuthScreen = authScreens[authRoute];
    return (
      <View style={styles.safe}>
        <AuthScreen navigate={setAuthRoute} />
      </View>
    );
  }

  const openRoute = (target) => {
    if (typeof target === 'string') {
      setActiveRoute({ key: target, params: {} });
    } else if (target?.key) {
      setActiveRoute({ key: target.key, params: target.params || {} });
    }

    setIsDrawerOpen(false);
  };

  const goBack = (fallbackKey = 'CustomerHome') => {
    openRoute(activeRoute?.params?.parentTab || fallbackKey);
  };

  const activeTabKey = getParentTab(activeRoute.key, activeRoute.params);
  const ActiveScreen = appScreens[activeRoute.key] || appScreens.CustomerHome;
  const isFullscreenRoute = ['CustomerHome', 'JobRequestThread', 'SessionRoom'].includes(activeRoute.key);
  const isScrollableRoute = !isFullscreenRoute;
  const unreadCount = notifications.filter((item) => !item?.read).length;

  const handleLogout = async () => {
    setAuthRoute('Home');
    setIsDrawerOpen(false);
    setActiveRoute({ key: 'CustomerHome', params: {} });
    setSessions([]);
    setRatingQueue([]);
    setHandledRatingSessionIds([]);
    previousSessionStatusesRef.current = new Map();
    await logout();
  };

  const screenProps = {
    navigate: openRoute,
    goBack,
    openDrawer: () => setIsDrawerOpen(true),
    route: activeRoute,
    notifications,
    isLoading: notificationsLoading,
    unreadCount,
    onMarkAllRead: () => markAllNotificationsRead(user?.uid).catch(() => null),
    onOpenNotification: async (notification) => {
      await markNotificationRead(notification?.id).catch(() => null);
      openRoute(resolveNotificationRoute(notification));
    },
  };

  return (
    <View style={[styles.safe, isFullscreenRoute ? styles.safeFullscreen : null]}>
      <View style={styles.shell}>
        {isScrollableRoute ? (
          <SafeAreaView style={styles.contentSafe}>
            <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
              <ActiveScreen {...screenProps} />
            </ScrollView>
          </SafeAreaView>
        ) : (
          <ActiveScreen {...screenProps} />
        )}

        <Modal animationType="fade" transparent visible={isDrawerOpen} onRequestClose={() => setIsDrawerOpen(false)}>
          <View style={styles.overlay}>
            <Pressable accessibilityRole="button" onPress={() => setIsDrawerOpen(false)} style={styles.scrim} />
            <View style={styles.drawer}>
              <View style={styles.drawerHeader}>
                <View style={styles.logo}>
                  <Text style={styles.logoText}>U</Text>
                </View>
                <View style={styles.drawerHeaderCopy}>
                  <Text style={styles.drawerTitle}>Uncedo</Text>
                  <Text style={styles.drawerSubtitle}>Customer app</Text>
                </View>
              </View>

              <View style={styles.drawerList}>
                {drawerItems.map((item) => {
                  const isActive = activeTabKey === item.key;
                  return (
                    <Pressable
                      accessibilityRole="button"
                      key={item.key}
                      onPress={() => openRoute(item.key)}
                      style={[styles.drawerItem, isActive && styles.drawerItemActive]}
                    >
                      <Ionicons color={isActive ? '#ffffff' : colors.text} name={item.icon} size={18} />
                      <Text style={[styles.drawerItemText, isActive && styles.drawerItemTextActive]}>{item.label}</Text>
                    </Pressable>
                  );
                })}
              </View>

              <Pressable accessibilityRole="button" onPress={handleLogout} style={styles.logoutButton}>
                <Ionicons color={colors.text} name="log-out-outline" size={18} />
                <Text style={styles.logoutText}>Logout</Text>
              </Pressable>
            </View>
          </View>
        </Modal>

        <SessionRatingPrompt
          session={ratingTarget}
          role="student"
          onHandled={(sessionId) => {
            if (!sessionId) {
              return;
            }
            setHandledRatingSessionIds((prev) => (prev.includes(sessionId) ? prev : [...prev, sessionId]));
            setRatingQueue((prev) => prev.filter((id) => id !== sessionId));
          }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 0) : 0,
  },
  safeFullscreen: {
    paddingTop: 0,
  },
  shell: {
    flex: 1,
  },
  contentSafe: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 32,
    paddingTop: 18,
  },
  overlay: {
    flex: 1,
  },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15,23,42,0.24)',
  },
  drawer: {
    backgroundColor: 'rgba(255,255,255,0.98)',
    borderColor: colors.border,
    borderRadius: 32,
    borderWidth: 1,
    bottom: 14,
    left: 14,
    padding: 18,
    position: 'absolute',
    top: 14,
    width: '84%',
  },
  drawerHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  logo: {
    alignItems: 'center',
    backgroundColor: colors.brand,
    borderRadius: 16,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  logoText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '900',
  },
  drawerHeaderCopy: {
    flex: 1,
  },
  drawerTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '900',
  },
  drawerSubtitle: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  drawerList: {
    gap: 8,
  },
  drawerItem: {
    alignItems: 'center',
    borderRadius: 18,
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  drawerItemActive: {
    backgroundColor: colors.brand,
  },
  drawerItemText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '800',
  },
  drawerItemTextActive: {
    color: '#ffffff',
  },
  logoutButton: {
    alignItems: 'center',
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    marginTop: 'auto',
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  logoutText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '800',
  },
});
