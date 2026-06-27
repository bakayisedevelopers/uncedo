import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import appConfig from '../../../app.json';
import { useAuth } from '../../context/AuthContext';
import { getCustomerOnboardingStatus } from '../../utils/onboarding';
import { colors } from '../../theme/colors';

function getInitials(name = '') {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (!parts.length) return 'U';
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase() || 'U';
  }

  return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase() || 'U';
}

function getAverageRating(user = {}) {
  const candidates = [
    user?.ratings?.asCustomer?.average,
    user?.ratings?.asStudent?.average,
    user?.ratings?.asTutor?.average,
    user?.tutorProfile?.overallRating,
  ];

  const value = candidates
    .map((item) => Number(item))
    .find((item) => Number.isFinite(item) && item > 0);

  return Number.isFinite(value) ? value : 0;
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

export function CustomerProfileScreen({ navigate }) {
  const { logout, user } = useAuth();
  const currentUser = user || {};
  const onboardingStatus = getCustomerOnboardingStatus(currentUser);
  const fullName = String(currentUser?.fullName || currentUser?.displayName || 'Customer').trim();
  const initials = getInitials(fullName);
  const photoUri = String(currentUser?.profilePhoto || currentUser?.selfieUrl || '').trim();
  const rating = getAverageRating(currentUser);
  const version = appConfig?.expo?.version || '0.1.0';

  const openDetails = () => navigate('CustomerDetails');
  const openOnboarding = () => navigate('Onboarding');
  const openPayments = () => navigate('Wallet');
  const openSecurity = () => navigate('CustomerSecurity');
  const openLegal = () => navigate('CustomerLegal');

  return (
    <ScrollView contentContainerStyle={styles.wrap} showsVerticalScrollIndicator={false}>
      <View style={styles.hero}>
        <Text style={styles.kicker}>Account</Text>
        <Text style={styles.title}>Profile</Text>
        <Text style={styles.subtitle}>Manage your customer details, payment methods, safety settings, and legal documents.</Text>
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
            <Text style={styles.email}>{currentUser?.email || 'No email set'}</Text>
            <View style={styles.ratingRow}>
              <Ionicons color="#f59e0b" name="star" size={16} />
              <Text style={styles.ratingValue}>{rating > 0 ? rating.toFixed(1) : '0.0'}</Text>
              <Text style={styles.ratingLabel}>overall rating</Text>
            </View>
          </View>
        </View>

        <View style={styles.statusPill}>
          <Ionicons color={onboardingStatus.complete ? '#a21caf' : '#b45309'} name={onboardingStatus.complete ? 'checkmark-circle' : 'alert-circle'} size={16} />
          <Text style={styles.statusText}>{onboardingStatus.complete ? 'Profile complete' : onboardingStatus.message}</Text>
        </View>
      </View>

      {!onboardingStatus.complete ? (
        <ProfileRow
          icon="sparkles-outline"
          title="Complete your profile"
          description="Finish onboarding, choose your service categories, and add a payment method before using the app fully."
          onPress={openOnboarding}
          tone="warning"
        />
      ) : null}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Settings</Text>
        <ProfileRow
          icon="person-circle-outline"
          title="Personal details"
          description="Edit your name, phone number, address, account type, and business details."
          onPress={openDetails}
        />
        <ProfileRow
          icon="card-outline"
          title="Payment"
          description="Manage your saved cards and review payment policies."
          onPress={openPayments}
        />
        <ProfileRow
          icon="shield-checkmark-outline"
          title="Security"
          description="Review safety guidance and account deletion controls."
          onPress={openSecurity}
        />
        <ProfileRow
          icon="document-text-outline"
          title="Legal"
          description="Open the terms, privacy policy, pricing policy, refund policy, and data policy."
          onPress={openLegal}
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
    backgroundColor: '#f8fafc',
    borderColor: 'rgba(217,70,239,0.18)',
    borderRadius: 28,
    borderWidth: 1,
    gap: 14,
    padding: 16,
  },
  identityRow: {
    flexDirection: 'row',
    gap: 14,
    alignItems: 'center',
  },
  avatarWrap: {
    alignItems: 'center',
    backgroundColor: '#fae8ff',
    borderColor: '#f0abfc',
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
    backgroundColor: 'rgba(217,70,239,0.08)',
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
    backgroundColor: '#fffbeb',
    borderColor: '#fcd34d',
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
    backgroundColor: '#f8fafc',
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
    backgroundColor: '#f8fafc',
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
