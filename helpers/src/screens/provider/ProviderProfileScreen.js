import { useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import appConfig from '../../../app.json';
import { useAuth } from '../../context/AuthContext';
import { useHelpersApp } from '../../context/HelpersAppContext';
import { getCurrentHelperLocation, reverseGeocodeLocation, requestHelperMapLocationPermission } from '../../services/nearbyCustomersMapService';
import { colors } from '../../theme/colors';

function getInitials(name = '') {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (!parts.length) return 'U';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase() || 'U';
  return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase() || 'U';
}

function ProfileRow({ icon, title, description, onPress, tone = 'default' }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        tone === 'warning' && styles.rowWarning,
        tone === 'danger' && styles.rowDanger,
        pressed && styles.rowPressed,
      ]}
    >
      <View style={styles.rowIcon}>
        <Ionicons color={tone === 'danger' ? colors.danger : colors.brandDark} name={icon} size={18} />
      </View>
      <View style={styles.rowBody}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.rowDescription}>{description}</Text>
      </View>
      <Ionicons color={colors.muted} name="chevron-forward" size={18} />
    </Pressable>
  );
}

export function ProviderProfileScreen({ navigate }) {
  const { logout, user } = useAuth();
  const { profile, onboardingStatus } = useHelpersApp();
  const [deviceLocation, setDeviceLocation] = useState(null);
  const [liveAddress, setLiveAddress] = useState('');
  const fullName = String(profile?.fullName || user?.displayName || 'Helper').trim();
  const initials = getInitials(fullName);
  const photoUri = String(profile?.profilePhoto || profile?.selfieUrl || '').trim();
  const version = appConfig?.expo?.version || '0.1.0';
  const homeAddress = String(profile?.homeAddress || '').trim() || 'Add your home address';
  const liveLocation = deviceLocation || profile?.liveLocation || null;
  const liveLocationText = liveAddress || (
    liveLocation?.latitude && liveLocation?.longitude
      ? `${Number(liveLocation.latitude).toFixed(5)}, ${Number(liveLocation.longitude).toFixed(5)}`
      : 'Live location not available'
  );
  const metrics = [
    {
      key: 'acceptance',
      label: 'Acceptance',
      value: `${Math.round(Number(profile?.metrics?.acceptanceRate || 0) * 100)}%`,
    },
    {
      key: 'completion',
      label: 'Completion',
      value: `${Math.round(Number(profile?.metrics?.completionRate || 0) * 100)}%`,
    },
    {
      key: 'rating',
      label: 'Rating',
      value: profile?.metrics?.overallRating > 0 ? Number(profile.metrics.overallRating).toFixed(1) : 'New',
    },
    {
      key: 'response',
      label: 'Response',
      value: `${Number(profile?.metrics?.avgResponseMinutes || 0)} min`,
    },
  ];

  useEffect(() => {
    let active = true;
    const loadLocation = async () => {
      const granted = await requestHelperMapLocationPermission().catch(() => false);
      if (!active || !granted) return;
      const current = await getCurrentHelperLocation().catch(() => null);
      if (active && current) {
        setDeviceLocation(current);
      }
    };

    loadLocation();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    if (!liveLocation?.latitude || !liveLocation?.longitude) {
      setLiveAddress('');
      return () => {
        active = false;
      };
    }

    reverseGeocodeLocation(liveLocation).then((result) => {
      if (active) {
        setLiveAddress(result || '');
      }
    });

    return () => {
      active = false;
    };
  }, [liveLocation?.latitude, liveLocation?.longitude]);

  return (
    <ScrollView contentContainerStyle={styles.wrap} showsVerticalScrollIndicator={false}>
      <View style={styles.hero}>
        <Text style={styles.kicker}>Account</Text>
        <Text style={styles.title}>Profile</Text>
        <Text style={styles.subtitle}>Manage helper details, profile completion, payout readiness, security, and skill settings.</Text>
      </View>

      <View style={styles.identityCard}>
        <View style={styles.identityRow}>
          <View style={styles.avatarWrap}>
            {photoUri ? (
              <Image source={{ uri: photoUri }} style={styles.avatarImage} />
            ) : (
              <Text style={styles.avatarInitials}>{initials}</Text>
            )}
          </View>
          <View style={styles.identityText}>
            <Text style={styles.name}>{fullName}</Text>
            <Text style={styles.email}>{profile?.email || user?.email || 'No email set'}</Text>
            <View style={styles.ratingRow}>
              <Ionicons color="#f59e0b" name="star" size={16} />
              <Text style={styles.ratingValue}>{profile?.metrics?.overallRating > 0 ? Number(profile.metrics.overallRating).toFixed(1) : '0.0'}</Text>
              <Text style={styles.ratingLabel}>helper rating</Text>
            </View>
          </View>
        </View>

        <View style={styles.statusPill}>
          <Ionicons color={onboardingStatus.complete ? colors.success : colors.warning} name={onboardingStatus.complete ? 'checkmark-circle' : 'alert-circle'} size={16} />
          <Text style={styles.statusText}>{onboardingStatus.complete ? 'Profile complete' : onboardingStatus.message}</Text>
        </View>

        <View style={styles.locationCard}>
          <View style={styles.locationRow}>
            <Ionicons color={colors.brandDark} name="home-outline" size={16} />
            <Text style={styles.locationLabel}>Home address</Text>
          </View>
          <Text style={styles.locationValue}>{homeAddress}</Text>
          <View style={styles.locationRow}>
            <Ionicons color={colors.brandDark} name="navigate-outline" size={16} />
            <Text style={styles.locationLabel}>Current live location</Text>
          </View>
          <Text style={styles.locationValue}>{liveLocationText}</Text>

          <View style={styles.metricsSection}>
            <Text style={styles.metricsHeading}>Performance</Text>
            <View style={styles.metricsGrid}>
              {metrics.map((item) => (
                <View key={item.key} style={styles.metricCard}>
                  <Text style={styles.metricValue}>{item.value}</Text>
                  <Text style={styles.metricLabel}>{item.label}</Text>
                </View>
              ))}
            </View>
          </View>
        </View>
      </View>

      {!onboardingStatus.complete ? (
        <ProfileRow
          icon="sparkles-outline"
          title="Complete your profile"
          description="Finish helper onboarding before you can go online and accept nearby customers."
          onPress={() => navigate({ key: 'ProfileCompletion', params: { parentTab: 'Profile' } })}
          tone="warning"
        />
      ) : null}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Settings</Text>
        <ProfileRow
          icon="person-circle-outline"
          title="Personal details"
          description="Edit your name, phone number, provider type, home address, and business details."
          onPress={() => navigate({ key: 'ProviderDetails', params: { parentTab: 'Profile' } })}
        />
        <ProfileRow
          icon="briefcase-outline"
          title="Skills"
          description="Manage your helper skills, uploaded work pictures, and availability."
          onPress={() => navigate({ key: 'ServicesOffered', params: { parentTab: 'Profile' } })}
        />
        <ProfileRow
          icon="card-outline"
          title="Payment"
          description="Review payout setup, weekly earnings, and your verified bank destination."
          onPress={() => navigate({ key: 'Earnings', params: { parentTab: 'Profile' } })}
        />
        <ProfileRow
          icon="shield-checkmark-outline"
          title="Security"
          description="Review account safety guidance and account deletion controls."
          onPress={() => navigate({ key: 'ProviderSecurity', params: { parentTab: 'Profile' } })}
        />
        <ProfileRow
          icon="document-text-outline"
          title="Agreement and legal"
          description="Review helper agreement status and open policy links."
          onPress={() => navigate({ key: 'ProviderLegal', params: { parentTab: 'Profile' } })}
        />
      </View>

      <View style={styles.bottomActions}>
        <Pressable
          accessibilityRole="button"
          onPress={logout}
          style={({ pressed }) => [styles.logoutButton, pressed && styles.rowPressed]}
        >
          <Ionicons color={colors.text} name="log-out-outline" size={18} />
          <Text style={styles.logoutText}>Log out</Text>
        </Pressable>
        <Text style={styles.version}>App version {version}</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 16,
    paddingBottom: 32,
  },
  hero: {
    gap: 6,
  },
  kicker: {
    color: colors.brandDark,
    fontSize: 12,
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
  identityCard: {
    backgroundColor: '#fff8fc',
    borderColor: 'rgba(236,72,153,0.18)',
    borderRadius: 28,
    borderWidth: 1,
    gap: 14,
    padding: 16,
  },
  identityRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 14,
  },
  avatarWrap: {
    alignItems: 'center',
    backgroundColor: '#fce7f3',
    borderColor: '#f9a8d4',
    borderRadius: 24,
    borderWidth: 1,
    height: 72,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 72,
  },
  avatarImage: {
    height: '100%',
    width: '100%',
  },
  avatarInitials: {
    color: colors.brandDark,
    fontSize: 24,
    fontWeight: '900',
  },
  identityText: {
    flex: 1,
    gap: 4,
  },
  name: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '900',
  },
  email: {
    color: colors.muted,
    fontSize: 13,
  },
  ratingRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 4,
  },
  ratingValue: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '900',
  },
  ratingLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'lowercase',
  },
  statusPill: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(236,72,153,0.08)',
    borderRadius: 999,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  statusText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '700',
  },
  locationCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 22,
    borderWidth: 1,
    gap: 8,
    padding: 14,
  },
  locationRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
    marginTop: 2,
  },
  locationLabel: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  locationValue: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
  },
  metricsSection: {
    gap: 10,
    marginTop: 8,
  },
  metricsHeading: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  metricCard: {
    backgroundColor: '#fff8fc',
    borderColor: 'rgba(236,72,153,0.14)',
    borderRadius: 18,
    borderWidth: 1,
    flexGrow: 1,
    minWidth: '47%',
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  metricValue: {
    color: colors.brandDark,
    fontSize: 15,
    fontWeight: '900',
  },
  metricLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '700',
    marginTop: 3,
  },
  section: {
    gap: 12,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '900',
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
  rowWarning: {
    backgroundColor: '#fff7ed',
    borderColor: '#fdba74',
  },
  rowDanger: {
    backgroundColor: '#fff1f2',
    borderColor: '#fecdd3',
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
    gap: 2,
  },
  rowTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '800',
  },
  rowDescription: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
  },
  bottomActions: {
    gap: 10,
    paddingTop: 4,
  },
  logoutButton: {
    alignItems: 'center',
    backgroundColor: '#fff8fc',
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'center',
    minHeight: 50,
  },
  logoutText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '800',
  },
  version: {
    color: colors.muted,
    fontSize: 12,
    textAlign: 'center',
  },
});
