import { useEffect, useState } from 'react';
import { Platform, Pressable, SafeAreaView, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ProviderLoginScreen } from '../screens/auth/ProviderLoginScreen';
import { ActiveJobScreen } from '../screens/provider/ActiveJobScreen';
import { AgreementScreen } from '../screens/provider/AgreementScreen';
import { CompletedJobsScreen } from '../screens/provider/CompletedJobsScreen';
import { EarningsScreen } from '../screens/provider/EarningsScreen';
import { JobOffersScreen } from '../screens/provider/JobOffersScreen';
import { JobDetailsScreen } from '../screens/provider/JobDetailsScreen';
import { ProfileCompletionScreen } from '../screens/provider/ProfileCompletionScreen';
import { ProviderDashboardScreen } from '../screens/provider/ProviderDashboardScreen';
import { ProviderDetailsScreen } from '../screens/provider/ProviderDetailsScreen';
import { ProviderLegalScreen } from '../screens/provider/ProviderLegalScreen';
import { ProviderProfileScreen } from '../screens/provider/ProviderProfileScreen';
import { ProviderSecurityScreen } from '../screens/provider/ProviderSecurityScreen';
import { SkillCatalogScreen } from '../screens/provider/SkillCatalogScreen';
import { SkillDetailsScreen } from '../screens/provider/SkillDetailsScreen';
import { ServicesOfferedScreen } from '../screens/provider/ServicesOfferedScreen';
import { VerificationScreen } from '../screens/provider/VerificationScreen';
import { HelperOfferOverlay } from '../components/app/HelperOfferOverlay';
import { useAuth } from '../context/AuthContext';
import { useHelpersApp } from '../context/HelpersAppContext';
import { colors } from '../theme/colors';

const rootTabs = [
  { key: 'Services', label: 'Services', icon: 'briefcase-outline', activeIcon: 'briefcase' },
  { key: 'Home', label: 'Home', icon: 'home-outline', activeIcon: 'home' },
  { key: 'Profile', label: 'Profile', icon: 'person-outline', activeIcon: 'person' },
];

const rootScreens = {
  Home: ProviderDashboardScreen,
  Services: CompletedJobsScreen,
  Profile: ProviderProfileScreen,
};

const secondaryScreens = {
  ProviderDetails: ProviderDetailsScreen,
  ProviderSecurity: ProviderSecurityScreen,
  ProviderLegal: ProviderLegalScreen,
  ProfileCompletion: ProfileCompletionScreen,
  ServicesOffered: ServicesOfferedScreen,
  SkillCatalog: SkillCatalogScreen,
  SkillDetails: SkillDetailsScreen,
  Earnings: EarningsScreen,
  Agreement: AgreementScreen,
  Verification: VerificationScreen,
  JobOffers: JobOffersScreen,
  JobDetails: JobDetailsScreen,
  ActiveJob: ActiveJobScreen,
};

const FULLSCREEN_ROUTES = ['Home', 'ActiveJob'];
const HIDE_BOTTOM_NAV_ROUTES = ['ActiveJob'];
const BOTTOM_NAV_HEIGHT = 84;

function LoadingScreen() {
  return (
    <View style={styles.loadingWrap}>
      <Text style={styles.loadingTitle}>Loading helpers</Text>
      <Text style={styles.loadingCopy}>Connecting your helper account and profile data.</Text>
    </View>
  );
}

export function RootNavigator() {
  const { initializing, user } = useAuth();
  const { activeJob } = useHelpersApp();
  const [activeRoute, setActiveRoute] = useState({ key: 'Home', params: {} });
  const [bottomNavVisible, setBottomNavVisible] = useState(true);
  const [lastActiveJobId, setLastActiveJobId] = useState(null);

  useEffect(() => {
    if (activeJob) {
      setLastActiveJobId(activeJob.id);
      if (activeRoute.key !== 'ActiveJob') {
        openRoute({ key: 'ActiveJob', params: { requestId: activeJob.requestId } });
      }
    } else {
      if (lastActiveJobId) {
        setLastActiveJobId(null);
        if (activeRoute.key === 'ActiveJob') {
          openRoute('Home');
        }
      }
    }
  }, [activeJob, activeRoute.key, lastActiveJobId]);

  if (initializing) {
    return <LoadingScreen />;
  }

  if (!user?.uid) {
    return <ProviderLoginScreen />;
  }

  const openRoute = (target) => {
    setBottomNavVisible(true);
    if (typeof target === 'string') {
      setActiveRoute({ key: target, params: {} });
    } else if (target?.key) {
      setActiveRoute({ key: target.key, params: target.params || {} });
    }
  };

  const goBack = (fallbackKey = 'Profile') => {
    const parent = activeRoute?.params?.parentTab;
    openRoute(parent || fallbackKey);
  };

  const ActiveScreen = rootScreens[activeRoute.key] || secondaryScreens[activeRoute.key] || ProviderDashboardScreen;
  const activeTabKey = rootScreens[activeRoute.key] ? activeRoute.key : (activeRoute.params?.parentTab || 'Home');
  const isFullscreenRoute = FULLSCREEN_ROUTES.includes(activeRoute.key);
  const showBottomNav = bottomNavVisible && !HIDE_BOTTOM_NAV_ROUTES.includes(activeRoute.key);
  const isScrollableRoute = !isFullscreenRoute;
  const screenProps = {
    navigate: openRoute,
    goBack,
    route: activeRoute,
    bottomInset: BOTTOM_NAV_HEIGHT,
    bottomNavVisible,
    onBottomNavVisibilityChange: setBottomNavVisible,
  };

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
              {rootTabs.map((item) => {
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

        <HelperOfferOverlay />
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
    borderColor: colors.border,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-around',
    minHeight: BOTTOM_NAV_HEIGHT,
    overflow: 'hidden',
    paddingBottom: 14,
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
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  loadingTitle: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '900',
  },
  loadingCopy: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 8,
    textAlign: 'center',
  },
});
