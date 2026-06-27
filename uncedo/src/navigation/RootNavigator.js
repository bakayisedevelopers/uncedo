import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BackHandler,
  Dimensions,
  Linking,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LoadingState } from '../components/ui/States';
import { SessionRatingPrompt } from '../components/customer/SessionRatingPrompt';
import { useAuth } from '../context/AuthContext';
import {
  markAllNotificationsRead,
  markNotificationRead,
  subscribeToNotifications,
} from '../services/notificationService';
import { subscribeToStudentSessions } from '../services/sessionService';
import { subscribeToCustomerServiceRequests } from '../services/customerServiceRequestService';
import { subscribeToServiceCatalog } from '../services/serviceCatalogService';
import { colors } from '../theme/colors';
import { RATABLE_SESSION_STATUSES } from '../utils/sessionStatus';

const authScreenLoaders = {
  Home: () => require('../screens/auth/HomeScreen').HomeScreen,
};

const appScreenLoaders = {
  CustomerHome: () => require('../screens/customer/CustomerHomeScreen').CustomerHomeScreen,
  Requests: () => require('../screens/customer/CustomerServiceRequestsScreen').CustomerServiceRequestsScreen,
  Wallet: () => require('../screens/customer/CustomerPaymentsScreen').CustomerPaymentsScreen,
  Profile: () => require('../screens/customer/CustomerProfileScreen').CustomerProfileScreen,
  Onboarding: () => require('../screens/customer/CustomerOnboardingScreen').CustomerOnboardingScreen,
  CustomerDetails: () => require('../screens/customer/CustomerDetailsScreen').CustomerDetailsScreen,
  CustomerServiceSelection: () => require('../screens/customer/CustomerServiceSelectionScreen').CustomerServiceSelectionScreen,
  CustomerSecurity: () => require('../screens/customer/CustomerSecurityScreen').CustomerSecurityScreen,
  CustomerLegal: () => require('../screens/customer/CustomerLegalScreen').CustomerLegalScreen,
  Notifications: () => require('../screens/student/NotificationsScreen').NotificationsScreen,
  CustomerServiceCall: () => require('../screens/customer/CustomerServiceCallScreen').CustomerServiceCallScreen,
  ServiceRequestTracking: () => require('../screens/customer/ServiceRequestTrackingScreen').ServiceRequestTrackingScreen,
  JobRequestThread: () => require('../screens/customer/JobRequestThreadScreen').JobRequestThreadScreen,
  RequestStatus: () => require('../screens/student/RequestStatusScreen').RequestStatusScreen,
  RequestDetails: () => require('../screens/student/RequestDetailsScreen').RequestDetailsScreen,
  StudentRequests: () => require('../screens/student/RequestsScreen').RequestsScreen,
  SessionRoom: () => require('../screens/student/SessionRoomScreen').SessionRoomScreen,
  ServiceRequestDetails: () => require('../screens/customer/ServiceRequestDetailsScreen').ServiceRequestDetailsScreen,
};

const bottomNavItems = [
  { key: 'Requests', label: 'Services', icon: 'briefcase-outline', activeIcon: 'briefcase' },
  { key: 'CustomerHome', label: 'Home', icon: 'home-outline', activeIcon: 'home' },
  { key: 'Profile', label: 'Profile', icon: 'person-outline', activeIcon: 'person' },
];

const BOTTOM_NAV_HEIGHT = 84;
const DEFAULT_ROUTE = { key: 'CustomerHome', params: {} };

function normalizeRoute(target) {
  if (typeof target === 'string') {
    return { key: target, params: {} };
  }

  if (target?.key) {
    return { key: target.key, params: target.params || {} };
  }

  return DEFAULT_ROUTE;
}

function areRouteParamsEqual(left = {}, right = {}) {
  const leftKeys = Object.keys(left || {});
  const rightKeys = Object.keys(right || {});

  if (leftKeys.length !== rightKeys.length) {
    return false;
  }

  return leftKeys.every((key) => left[key] === right[key]);
}

function areRoutesEqual(left, right) {
  return left?.key === right?.key && areRouteParamsEqual(left?.params, right?.params);
}

function resolveBottomSystemInset(windowWidth, windowHeight) {
  if (Platform.OS !== 'android') {
    return 0;
  }

  const screen = Dimensions.get('screen');
  const isPortrait = windowHeight >= windowWidth;
  if (!screen || !isPortrait) {
    return 0;
  }

  const rawVerticalInset = Math.max(0, Number(screen.height || 0) - Number(windowHeight || 0));
  const statusInset = StatusBar.currentHeight || 0;

  if (rawVerticalInset > statusInset + 24) {
    return Math.max(0, rawVerticalInset - statusInset);
  }

  return rawVerticalInset;
}

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
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();
  const androidTopInset = Platform.OS === 'android' ? (StatusBar.currentHeight || 0) : 0;
  const bottomSystemInset = resolveBottomSystemInset(windowWidth, windowHeight);
  const bottomNavInset = BOTTOM_NAV_HEIGHT + bottomSystemInset;
  const systemInsets = useMemo(
    () => ({ top: androidTopInset, bottom: bottomSystemInset }),
    [androidTopInset, bottomSystemInset],
  );

  const [activeRoute, setActiveRoute] = useState(DEFAULT_ROUTE);
  const [routeHistory, setRouteHistory] = useState([]);
  const [bottomNavVisible, setBottomNavVisible] = useState(true);
  const [notifications, setNotifications] = useState([]);
  const [notificationsLoading, setNotificationsLoading] = useState(true);
  const [sessions, setSessions] = useState([]);
  const [ratingQueue, setRatingQueue] = useState([]);
  const [activeRequest, setActiveRequest] = useState(null);
  const [lastActiveRequestId, setLastActiveRequestId] = useState(null);
  const [handledRatingSessionIds, setHandledRatingSessionIds] = useState([]);
  const activeRouteRef = useRef(DEFAULT_ROUTE);
  const routeHistoryRef = useRef([]);
  const previousSessionStatusesRef = useRef(new Map());
  const ratingTarget = useMemo(() => {
    if (!ratingQueue.length) return null;
    const [nextSessionId] = ratingQueue;
    return sessions.find((session) => session.id === nextSessionId) || null;
  }, [ratingQueue, sessions]);

  useEffect(() => {
    activeRouteRef.current = activeRoute;
  }, [activeRoute]);

  useEffect(() => {
    routeHistoryRef.current = routeHistory;
  }, [routeHistory]);

  const openRoute = useCallback((target, options = {}) => {
    const nextRoute = normalizeRoute(target);
    const currentRoute = activeRouteRef.current;

    if (areRoutesEqual(currentRoute, nextRoute)) {
      return false;
    }

    const nextHistory = options.resetHistory
      ? []
      : options.replace
        ? routeHistoryRef.current
        : [...routeHistoryRef.current, currentRoute];

    routeHistoryRef.current = nextHistory;
    activeRouteRef.current = nextRoute;
    setRouteHistory(nextHistory);
    setActiveRoute(nextRoute);
    setBottomNavVisible(true);
    return true;
  }, []);

  const goBack = useCallback((fallbackKey = 'CustomerHome') => {
    const history = routeHistoryRef.current;

    if (history.length) {
      const previousRoute = history[history.length - 1];
      const nextHistory = history.slice(0, -1);
      routeHistoryRef.current = nextHistory;
      activeRouteRef.current = previousRoute;
      setRouteHistory(nextHistory);
      setActiveRoute(previousRoute);
      setBottomNavVisible(true);
      return true;
    }

    const fallbackRoute = normalizeRoute(activeRouteRef.current?.params?.parentTab || fallbackKey);
    if (!areRoutesEqual(activeRouteRef.current, fallbackRoute)) {
      routeHistoryRef.current = [];
      activeRouteRef.current = fallbackRoute;
      setRouteHistory([]);
      setActiveRoute(fallbackRoute);
      setBottomNavVisible(true);
      return true;
    }

    return false;
  }, []);

  useEffect(() => {
    let mounted = true;

    Linking.getInitialURL().then((url) => {
      if (!mounted) {
        return;
      }

      const route = resolveDeepLink(url);
      if (route) {
        openRoute(route, { replace: true, resetHistory: true });
      }
    });

    const subscription = Linking.addEventListener('url', ({ url }) => {
      const route = resolveDeepLink(url);
      if (route) {
        openRoute(route);
      }
    });

    return () => {
      mounted = false;
      subscription.remove();
    };
  }, [openRoute]);

  useEffect(() => {
    if (Platform.OS !== 'android' || !user) {
      return () => {};
    }

    const subscription = BackHandler.addEventListener('hardwareBackPress', () => goBack('CustomerHome'));
    return () => subscription.remove();
  }, [goBack, user]);

  useEffect(() => {
    if (!user?.uid) {
      routeHistoryRef.current = [];
      activeRouteRef.current = DEFAULT_ROUTE;
      setRouteHistory([]);
      setActiveRoute(DEFAULT_ROUTE);
      setBottomNavVisible(true);
      setNotifications([]);
      setSessions([]);
      setRatingQueue([]);
      setHandledRatingSessionIds([]);
      setLastActiveRequestId(null);
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
    const unsubscribe = subscribeToServiceCatalog(
      () => null,
      (error) => {
        console.warn('subscribeToServiceCatalog error:', error);
      },
    );

    return () => {
      unsubscribe?.();
    };
  }, []);

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
    if (!user?.uid) {
      setActiveRequest(null);
      return () => {};
    }

    const activeStatuses = [
      'collecting_details',
      'scheduled_pending',
      'matching',
      'helper_found',
      'no_helper_available',
      'accepted',
      'en_route',
      'driving',
      'buying_resources',
      'arrived',
      'work_started',
    ];

    return subscribeToCustomerServiceRequests(
      user.uid,
      (items) => {
        const activeItem = items.find((item) => activeStatuses.includes(String(item.status || '').toLowerCase()));
        setActiveRequest(activeItem || null);
      },
      (error) => {
        console.warn('subscribeToCustomerServiceRequests error:', error);
      }
    );
  }, [user?.uid]);

  useEffect(() => {
    if (activeRequest) {
      setLastActiveRequestId(activeRequest.id);
      const targetKey = 'ServiceRequestTracking';
      if (activeRoute.key !== targetKey || activeRoute.params?.requestId !== activeRequest.id) {
        openRoute({
          key: targetKey,
          params: { requestId: activeRequest.id, parentTab: 'CustomerHome' }
        }, { replace: true });
      }
    } else {
      if (lastActiveRequestId) {
        setLastActiveRequestId(null);
        if (
          (activeRoute.key === 'ServiceRequestTracking' || activeRoute.key === 'CustomerServiceCall') &&
          activeRoute.params?.requestId === lastActiveRequestId
        ) {
          openRoute('CustomerHome', { replace: true });
        }
      }
    }
  }, [activeRequest, activeRoute.key, activeRoute.params?.requestId, lastActiveRequestId, openRoute]);

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
    const AuthScreen = authScreenLoaders.Home();
    return (
      <View style={styles.safe}>
        <AuthScreen />
      </View>
    );
  }

  const activeTabKey = getParentTab(activeRoute.key, activeRoute.params);
  const ActiveScreen = (appScreenLoaders[activeRoute.key] || appScreenLoaders.CustomerHome)();
  const isFullscreenRoute = ['CustomerHome', 'CustomerServiceCall', 'CustomerServiceSelection', 'ServiceRequestTracking', 'JobRequestThread', 'SessionRoom', 'ServiceRequestDetails'].includes(activeRoute.key);
  const isScrollableRoute = !isFullscreenRoute;
  const screenProps = {
    navigate: openRoute,
    goBack,
    route: activeRoute,
    bottomNavVisible,
    notifications,
    isLoading: notificationsLoading,
    bottomInset: bottomNavInset,
    systemInsets,
    onBottomNavVisibilityChange: setBottomNavVisible,
    onMarkAllRead: () => markAllNotificationsRead(user?.uid).catch(() => null),
    onOpenNotification: async (notification) => {
      await markNotificationRead(notification?.id).catch(() => null);
      openRoute(resolveNotificationRoute(notification));
    },
    activeRequest,
  };

  const showBottomNav = bottomNavVisible && !['CustomerServiceCall', 'CustomerServiceSelection', 'ServiceRequestTracking', 'JobRequestThread', 'SessionRoom', 'ServiceRequestDetails'].includes(activeRoute.key);

  return (
    <View style={[styles.safe, isFullscreenRoute ? styles.safeFullscreen : null]}>
      <View style={styles.shell}>
        {isScrollableRoute ? (
          <SafeAreaView style={styles.contentSafe}>
            <ScrollView
              contentContainerStyle={[styles.content, showBottomNav && { paddingBottom: bottomNavInset + 24 }]}
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
            <View style={[styles.bottomNav, { minHeight: bottomNavInset, paddingBottom: bottomSystemInset + 14 }]}>
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
                      color={isActive ? colors.brand : colors.text}
                      name={isActive ? item.activeIcon : item.icon}
                      size={22}
                    />
                    <Text style={[styles.bottomNavLabel, isActive && styles.bottomNavLabelActive]}>
                      {item.label}
                    </Text>
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
  bottomNavSafeArea: {
    bottom: 0,
    elevation: 32,
    left: 0,
    position: 'absolute',
    right: 0,
    zIndex: 32,
  },
  bottomNav: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.98)',
    borderColor: colors.border,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-around',
    overflow: 'hidden',
    paddingHorizontal: 18,
    paddingTop: 10,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 8,
  },
  bottomNavItem: {
    alignItems: 'center',
    borderRadius: 999,
    gap: 2,
    height: 56,
    justifyContent: 'center',
    width: 88,
  },
  bottomNavItemActive: {
    backgroundColor: 'rgba(236,72,153,0.08)',
  },
  bottomNavLabel: {
    color: colors.text,
    fontSize: 11,
    fontWeight: '600',
  },
  bottomNavLabelActive: {
    color: colors.brand,
  },
});
