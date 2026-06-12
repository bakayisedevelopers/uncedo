import { useEffect, useMemo, useRef, useState } from 'react';
import { Linking, Platform, Pressable, SafeAreaView, ScrollView, StatusBar, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LoadingState } from '../components/ui/States';
import { SessionRatingPrompt } from '../components/customer/SessionRatingPrompt';
import { useAuth } from '../context/AuthContext';
import { HomeScreen } from '../screens/auth/HomeScreen';
import { LoginScreen } from '../screens/auth/LoginScreen';
import { SignupScreen } from '../screens/auth/SignupScreen';
import { CustomerHomeScreen } from '../screens/customer/CustomerHomeScreen';
import { CustomerDetailsScreen } from '../screens/customer/CustomerDetailsScreen';
import { CustomerLegalScreen } from '../screens/customer/CustomerLegalScreen';
import { CustomerOnboardingScreen } from '../screens/customer/CustomerOnboardingScreen';
import { CustomerPaymentsScreen } from '../screens/customer/CustomerPaymentsScreen';
import { CustomerProfileScreen } from '../screens/customer/CustomerProfileScreen';
import { CustomerSecurityScreen } from '../screens/customer/CustomerSecurityScreen';
import { CustomerServiceCallScreen } from '../screens/customer/CustomerServiceCallScreen';
import { CustomerServiceRequestsScreen } from '../screens/customer/CustomerServiceRequestsScreen';
import { JobRequestThreadScreen } from '../screens/customer/JobRequestThreadScreen';
import { ServiceRequestTrackingScreen } from '../screens/customer/ServiceRequestTrackingScreen';
import { NotificationsScreen } from '../screens/student/NotificationsScreen';
import { RequestDetailsScreen } from '../screens/student/RequestDetailsScreen';
import { RequestsScreen } from '../screens/student/RequestsScreen';
import { RequestStatusScreen } from '../screens/student/RequestStatusScreen';
import { SessionRoomScreen } from '../screens/student/SessionRoomScreen';
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
  Requests: CustomerServiceRequestsScreen,
  Wallet: CustomerPaymentsScreen,
  Profile: CustomerProfileScreen,
  Onboarding: CustomerOnboardingScreen,
  CustomerDetails: CustomerDetailsScreen,
  CustomerSecurity: CustomerSecurityScreen,
  CustomerLegal: CustomerLegalScreen,
  Notifications: NotificationsScreen,
  CustomerServiceCall: CustomerServiceCallScreen,
  ServiceRequestTracking: ServiceRequestTrackingScreen,
  JobRequestThread: JobRequestThreadScreen,
  RequestStatus: RequestStatusScreen,
  RequestDetails: RequestDetailsScreen,
  StudentRequests: RequestsScreen,
  SessionRoom: SessionRoomScreen,
};

const bottomNavItems = [
  { key: 'CustomerHome', label: 'Home', icon: 'home-outline', activeIcon: 'home' },
  { key: 'Requests', label: 'Requests', icon: 'briefcase-outline', activeIcon: 'briefcase' },
  { key: 'Wallet', label: 'Wallet', icon: 'wallet-outline', activeIcon: 'wallet' },
  { key: 'Profile', label: 'Profile', icon: 'person-outline', activeIcon: 'person' },
];

const BOTTOM_NAV_HEIGHT = 84;

function resolveDeepLink(url) {
  if (!url) {
    return null;
  }

  const cleaned = String(url || '').replace(/^[a-z]+:\/\//i, '');
  const parts = cleaned.split('/').filter(Boolean);
  const host = String(parts[0] || '').toLowerCase();
  const firstPathSegment = parts[1] || '';

  if (host === 'service-request' && firstPathSegment) {
    return { key: 'ServiceRequestTracking', params: { requestId: firstPathSegment, parentTab: 'Requests' } };
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

  if (['ServiceRequestTracking', 'SessionRoom'].includes(routeKey)) {
    return 'Requests';
  }

  if (routeKey === 'JobRequestThread') {
    return 'CustomerHome';
  }

  if (routeKey === 'CustomerServiceCall') {
    return 'CustomerHome';
  }

  if (['RequestStatus', 'RequestDetails', 'StudentRequests'].includes(routeKey)) {
    return 'Requests';
  }

  return routeKey;
}

function resolveNotificationRoute(notification = {}) {
  const targetPath = String(notification?.targetPath || '').trim();
  const type = String(notification?.type || '').toLowerCase();
  const requestId = notification?.requestId || '';
  const sessionId = notification?.sessionId || '';
  const requestType = String(notification?.requestType || notification?.entityType || '').toLowerCase();

  if (targetPath.startsWith('/app/session/')) {
    const targetSessionId = targetPath.split('/app/session/')[1] || sessionId;
    return targetSessionId
      ? { key: 'SessionRoom', params: { sessionId: targetSessionId, parentTab: 'Requests' } }
      : { key: 'Requests', params: {} };
  }

  if (targetPath.startsWith('/service-request/')) {
    const targetRequestId = targetPath.split('/service-request/')[1] || requestId;
    return targetRequestId
      ? { key: 'ServiceRequestTracking', params: { requestId: targetRequestId, parentTab: 'Requests' } }
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
    return requestType === 'customer_service'
      ? { key: 'ServiceRequestTracking', params: { requestId, parentTab: 'Requests' } }
      : { key: 'RequestStatus', params: { requestId, parentTab: 'Requests' } };
  }

  return { key: 'CustomerHome', params: {} };
}

export function RootNavigator() {
  const { initializing, user } = useAuth();
  const [authRoute, setAuthRoute] = useState('Home');
  const [activeRoute, setActiveRoute] = useState({ key: 'CustomerHome', params: {} });
  const [bottomNavVisible, setBottomNavVisible] = useState(true);
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
      setBottomNavVisible(true);
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
    setBottomNavVisible(true);
    if (typeof target === 'string') {
      setActiveRoute({ key: target, params: {} });
    } else if (target?.key) {
      setActiveRoute({ key: target.key, params: target.params || {} });
    }
  };

  const goBack = (fallbackKey = 'CustomerHome') => {
    openRoute(activeRoute?.params?.parentTab || fallbackKey);
  };

  const activeTabKey = getParentTab(activeRoute.key, activeRoute.params);
  const ActiveScreen = appScreens[activeRoute.key] || appScreens.CustomerHome;
  const isFullscreenRoute = ['CustomerHome', 'CustomerServiceCall', 'ServiceRequestTracking', 'JobRequestThread', 'SessionRoom'].includes(activeRoute.key);
  const isScrollableRoute = !isFullscreenRoute;
  const screenProps = {
    navigate: openRoute,
    goBack,
    route: activeRoute,
    bottomNavVisible,
    notifications,
    isLoading: notificationsLoading,
    bottomInset: BOTTOM_NAV_HEIGHT,
    onBottomNavVisibilityChange: setBottomNavVisible,
    onMarkAllRead: () => markAllNotificationsRead(user?.uid).catch(() => null),
    onOpenNotification: async (notification) => {
      await markNotificationRead(notification?.id).catch(() => null);
      openRoute(resolveNotificationRoute(notification));
    },
  };

  const showBottomNav = bottomNavVisible && !['CustomerServiceCall', 'ServiceRequestTracking', 'JobRequestThread', 'SessionRoom'].includes(activeRoute.key);

  return (
    <View style={[styles.safe, isFullscreenRoute ? styles.safeFullscreen : null]}>
      <View style={styles.shell}>
        {isScrollableRoute ? (
          <SafeAreaView style={styles.contentSafe}>
            <ScrollView
              contentContainerStyle={[styles.content, showBottomNav && styles.contentWithBottomNav]}
              showsVerticalScrollIndicator={false}
            >
              <ActiveScreen {...screenProps} />
            </ScrollView>
          </SafeAreaView>
        ) : (
          <ActiveScreen {...screenProps} />
        )}

        {showBottomNav ? (
          <SafeAreaView pointerEvents="box-none" style={styles.bottomNavSafeArea}>
            <View style={styles.bottomNav}>
              {bottomNavItems.map((item) => {
                const isActive = activeTabKey === item.key;
                return (
                  <Pressable
                    accessibilityLabel={item.label}
                    accessibilityRole="button"
                    key={item.key}
                    onPress={() => openRoute(item.key)}
                    style={[styles.bottomNavItem, isActive && styles.bottomNavItemActive]}
                  >
                    <Ionicons
                      color={isActive ? '#ffffff' : colors.muted}
                      name={isActive ? item.activeIcon : item.icon}
                      size={22}
                    />
                  </Pressable>
                );
              })}
            </View>
          </SafeAreaView>
        ) : null}

        <SessionRatingPrompt
          session={ratingTarget}
          role="customer"
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
  contentWithBottomNav: {
    paddingBottom: BOTTOM_NAV_HEIGHT + 24,
  },
  bottomNavSafeArea: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
  },
  bottomNav: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.98)',
    borderTopColor: colors.border,
    borderTopWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-around',
    minHeight: BOTTOM_NAV_HEIGHT,
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 14,
  },
  bottomNavItem: {
    alignItems: 'center',
    borderRadius: 999,
    height: 48,
    justifyContent: 'center',
    position: 'relative',
    width: 56,
  },
  bottomNavItemActive: {
    backgroundColor: colors.brand,
  },
});
