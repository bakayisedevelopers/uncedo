import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ProviderLoginScreen } from '../screens/auth/ProviderLoginScreen';
import { ActiveJobScreen } from '../screens/provider/ActiveJobScreen';
import { AgreementScreen } from '../screens/provider/AgreementScreen';
import { CompletedJobsScreen } from '../screens/provider/CompletedJobsScreen';
import { EarningsScreen } from '../screens/provider/EarningsScreen';
import { JobOffersScreen } from '../screens/provider/JobOffersScreen';
import { ProviderDashboardScreen } from '../screens/provider/ProviderDashboardScreen';
import { ProviderProfileScreen } from '../screens/provider/ProviderProfileScreen';
import { ServicesOfferedScreen } from '../screens/provider/ServicesOfferedScreen';
import { VerificationScreen } from '../screens/provider/VerificationScreen';
import { colors } from '../theme/colors';

const screens = {
  Login: ProviderLoginScreen,
  Dashboard: ProviderDashboardScreen,
  Profile: ProviderProfileScreen,
  Services: ServicesOfferedScreen,
  JobOffers: JobOffersScreen,
  ActiveJob: ActiveJobScreen,
  CompletedJobs: CompletedJobsScreen,
  Earnings: EarningsScreen,
  Verification: VerificationScreen,
  Agreement: AgreementScreen,
};

const navItems = [
  { key: 'Dashboard', label: 'Home' },
  { key: 'JobOffers', label: 'Offers' },
  { key: 'Profile', label: 'Profile' },
  { key: 'Services', label: 'Services' },
  { key: 'ActiveJob', label: 'Active Job' },
  { key: 'CompletedJobs', label: 'Completed Jobs' },
  { key: 'Earnings', label: 'Payment' },
  { key: 'Verification', label: 'Verification' },
  { key: 'Agreement', label: 'Agreement' },
];

export function RootNavigator() {
  const [signedIn, setSignedIn] = useState(false);
  const [activeKey, setActiveKey] = useState('Dashboard');

  if (!signedIn) {
    return <ProviderLoginScreen onContinue={() => setSignedIn(true)} />;
  }

  const ActiveScreen = screens[activeKey];

  return (
    <View style={styles.shell}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.nav}>
        {navItems.map((item) => {
          const isActive = item.key === activeKey;
          return (
            <Pressable
              accessibilityRole="button"
              key={item.key}
              onPress={() => setActiveKey(item.key)}
              style={[styles.navItem, isActive && styles.navItemActive]}
            >
              <Text style={[styles.navLabel, isActive && styles.navLabelActive]}>{item.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <ActiveScreen navigate={setActiveKey} onLogout={() => setSignedIn(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    flex: 1,
    backgroundColor: colors.background,
  },
  nav: {
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 6,
  },
  navItem: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  navItemActive: {
    backgroundColor: colors.brand,
    borderColor: colors.brand,
  },
  navLabel: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '800',
  },
  navLabelActive: {
    color: '#ffffff',
  },
});
