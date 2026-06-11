import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ProviderLoginScreen } from '../screens/auth/ProviderLoginScreen';
import { ActiveJobScreen } from '../screens/provider/ActiveJobScreen';
import { AgreementScreen } from '../screens/provider/AgreementScreen';
import { CompletedJobsScreen } from '../screens/provider/CompletedJobsScreen';
import { EarningsScreen } from '../screens/provider/EarningsScreen';
import { JobOffersScreen } from '../screens/provider/JobOffersScreen';
import { ProfileCompletionScreen } from '../screens/provider/ProfileCompletionScreen';
import { ProviderDashboardScreen } from '../screens/provider/ProviderDashboardScreen';
import { ProviderProfileScreen } from '../screens/provider/ProviderProfileScreen';
import { ServicesOfferedScreen } from '../screens/provider/ServicesOfferedScreen';
import { VerificationScreen } from '../screens/provider/VerificationScreen';
import { useAuth } from '../context/AuthContext';
import { useHelpersApp } from '../context/HelpersAppContext';
import { colors } from '../theme/colors';

const rootTabs = [
  { key: 'Home', label: 'Home' },
  { key: 'CompletedJobs', label: 'Completed Jobs' },
  { key: 'Payment', label: 'Payment' },
  { key: 'Profile', label: 'Profile' },
];

const rootScreens = {
  Home: ProviderDashboardScreen,
  CompletedJobs: CompletedJobsScreen,
  Payment: EarningsScreen,
  Profile: ProviderProfileScreen,
};

const secondaryScreens = {
  ProfileCompletion: ProfileCompletionScreen,
  Services: ServicesOfferedScreen,
  Agreement: AgreementScreen,
  Verification: VerificationScreen,
  JobOffers: JobOffersScreen,
  ActiveJob: ActiveJobScreen,
};

function LoadingScreen() {
  return (
    <View style={styles.loadingWrap}>
      <Text style={styles.loadingTitle}>Loading helpers</Text>
      <Text style={styles.loadingCopy}>Connecting your helper account and profile data.</Text>
    </View>
  );
}

function mapOnboardingStepToScreen(step) {
  switch (step) {
    case 'services':
      return 'Services';
    case 'agreement':
      return 'Agreement';
    case 'payout':
      return 'ProfileCompletion';
    case 'verification':
      return 'Verification';
    case 'profile':
    default:
      return 'ProfileCompletion';
  }
}

export function RootNavigator() {
  const { initializing, user } = useAuth();
  const { onboardingStatus } = useHelpersApp();
  const [activeTab, setActiveTab] = useState('Home');
  const [activeOverlay, setActiveOverlay] = useState('');
  const [dismissedOnboarding, setDismissedOnboarding] = useState(false);

  useEffect(() => {
    if (onboardingStatus.complete) {
      setDismissedOnboarding(false);
    }
  }, [onboardingStatus.complete]);

  useEffect(() => {
    if (user?.uid && !onboardingStatus.complete && !activeOverlay && !dismissedOnboarding) {
      setActiveOverlay(mapOnboardingStepToScreen(onboardingStatus.step));
    }
  }, [activeOverlay, dismissedOnboarding, onboardingStatus.complete, onboardingStatus.step, user?.uid]);

  const navigate = (target) => {
    if (rootScreens[target]) {
      setActiveOverlay('');
      setActiveTab(target);
      return;
    }

    if (secondaryScreens[target]) {
      setActiveOverlay(target);
    }
  };

  const closeOverlay = () => {
    setActiveOverlay('');
    setDismissedOnboarding(true);
  };

  const ActiveRootScreen = useMemo(() => rootScreens[activeTab] || ProviderDashboardScreen, [activeTab]);
  const ActiveOverlayScreen = activeOverlay ? secondaryScreens[activeOverlay] : null;

  if (initializing) {
    return <LoadingScreen />;
  }

  if (!user?.uid) {
    return <ProviderLoginScreen />;
  }

  return (
    <View style={styles.shell}>
      <View style={styles.content}>
        <ActiveRootScreen navigate={navigate} />
      </View>

      {ActiveOverlayScreen ? (
        <View style={styles.overlay}>
          <ActiveOverlayScreen navigate={navigate} onClose={closeOverlay} />
        </View>
      ) : null}

      <View style={styles.bottomBar}>
        {rootTabs.map((item) => {
          const isActive = item.key === activeTab;
          return (
            <Pressable
              accessibilityRole="button"
              key={item.key}
              onPress={() => navigate(item.key)}
              style={[styles.navItem, isActive && styles.navItemActive]}
            >
              <Text style={[styles.navLabel, isActive && styles.navLabelActive]}>{item.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
  },
  bottomBar: {
    backgroundColor: '#ffffff',
    borderTopColor: colors.border,
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  navItem: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: 8,
  },
  navItemActive: {
    backgroundColor: colors.brand,
    borderColor: colors.brand,
  },
  navLabel: {
    color: colors.text,
    fontSize: 11,
    fontWeight: '800',
    textAlign: 'center',
  },
  navLabelActive: {
    color: '#ffffff',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.24)',
    paddingBottom: 88,
    paddingTop: 12,
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
