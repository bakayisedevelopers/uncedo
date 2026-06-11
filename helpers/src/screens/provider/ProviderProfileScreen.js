import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { ActionButton, Card, MetricCard, Screen, SectionHeading, StatusBadge } from '../../components/app/HelperUi';
import { useHelpersApp } from '../../context/HelpersAppContext';
import { useAuth } from '../../context/AuthContext';
import { colors } from '../../theme/colors';

export function ProviderProfileScreen({ navigate }) {
  const { user, logout, deleteAccount } = useAuth();
  const { profile, onboardingStatus, actions, saving, saveError } = useHelpersApp();
  const [firstName, setFirstName] = useState(profile.firstName || '');
  const [lastName, setLastName] = useState(profile.lastName || '');
  const [providerType, setProviderType] = useState(profile.providerType || '');
  const [businessName, setBusinessName] = useState(profile.businessName || '');
  const [message, setMessage] = useState('');
  const [busyAction, setBusyAction] = useState('');

  useEffect(() => {
    setFirstName(profile.firstName || '');
    setLastName(profile.lastName || '');
    setProviderType(profile.providerType || '');
    setBusinessName(profile.businessName || '');
  }, [profile.businessName, profile.firstName, profile.lastName, profile.providerType]);

  const saveBasics = async () => {
    const result = await actions.updateProfileBasics({
      firstName,
      lastName,
      providerType,
      businessName,
      fullName: [String(firstName || '').trim(), String(lastName || '').trim()].filter(Boolean).join(' '),
    });
    if (result?.success) {
      setMessage('Profile updated.');
    }
  };

  const handleLogout = async () => {
    setBusyAction('logout');
    try {
      await logout();
    } finally {
      setBusyAction('');
    }
  };

  const handleDeleteAccount = async () => {
    if (!user?.uid) return;
    setBusyAction('delete');
    setMessage('');
    try {
      await deleteAccount(user.uid);
    } catch (error) {
      setMessage(error.message || 'Unable to delete helper account.');
    } finally {
      setBusyAction('');
    }
  };

  return (
    <Screen
      eyebrow="Helper"
      title="Profile"
      description="Manage the helper identity, readiness status, payout setup, and account controls from one place."
    >
      <Card>
        <SectionHeading
          title={profile.fullName || 'Complete your helper profile'}
          subtitle={`${profile.city} | Rating ${profile.rating > 0 ? profile.rating.toFixed(2) : 'New'}`}
          action={<StatusBadge label={profile.verificationStatus} tone={profile.verificationStatus === 'verified' ? 'success' : 'warning'} />}
        />
        <Text style={styles.profileCopy}>{onboardingStatus.message}</Text>
        {message ? <Text style={styles.message}>{message}</Text> : null}
        {saveError ? <Text style={styles.error}>{saveError}</Text> : null}
        <View style={styles.metricGrid}>
          <MetricCard label="Active services" value={String(profile.services.length)} />
          <MetricCard
            label="Active skills"
            value={String(profile.services.reduce((sum, service) => sum + (service.skills || []).length, 0))}
          />
        </View>
      </Card>

      <Card>
        <SectionHeading title="Profile basics" subtitle="These fields are required before the helper can go online." />
        <View style={styles.formGroup}>
          <TextInput
            placeholder="First name"
            placeholderTextColor={colors.muted}
            value={firstName}
            onChangeText={setFirstName}
            style={styles.input}
          />
          <TextInput
            placeholder="Last name"
            placeholderTextColor={colors.muted}
            value={lastName}
            onChangeText={setLastName}
            style={styles.input}
          />
          <View style={styles.typeRow}>
            {['individual', 'business'].map((option) => {
              const isActive = providerType === option;
              return (
                <Pressable
                  key={option}
                  accessibilityRole="button"
                  onPress={() => setProviderType(option)}
                  style={[styles.typePill, isActive && styles.typePillActive]}
                >
                  <Text style={[styles.typePillLabel, isActive && styles.typePillLabelActive]}>
                    {option === 'individual' ? 'Individual' : 'Business'}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {providerType === 'business' ? (
            <TextInput
              placeholder="Business name"
              placeholderTextColor={colors.muted}
              value={businessName}
              onChangeText={setBusinessName}
              style={styles.input}
            />
          ) : null}
          <ActionButton label={saving ? 'Saving...' : 'Save profile basics'} onPress={saveBasics} disabled={saving} />
        </View>
      </Card>

      <Card>
        <SectionHeading title="Setup actions" subtitle="Open the required helper setup screens from here." />
        <View style={styles.buttonRow}>
          <ActionButton label="Complete profile" onPress={() => navigate('ProfileCompletion')} />
          <ActionButton label="Services" onPress={() => navigate('Services')} tone="secondary" />
          <ActionButton label="Agreement" onPress={() => navigate('Agreement')} tone="secondary" />
          <ActionButton label="Verification" onPress={() => navigate('Verification')} tone="secondary" />
        </View>
      </Card>

      <Card>
        <SectionHeading title="Payout status" subtitle="Payment stays aligned with the tutor payout logic." />
        <Text style={styles.serviceMeta}>Bank: {profile.payout.bankName || 'Not added'}</Text>
        <Text style={styles.serviceMeta}>Account holder: {profile.payout.accountHolder || 'Not added'}</Text>
        <Text style={styles.serviceMeta}>Account: {profile.payout.accountNumber || 'Not added'}</Text>
        <Text style={styles.serviceMeta}>Recipient: {profile.payout.recipientCode || 'Not added'}</Text>
        <Text style={styles.serviceMeta}>Payout verification: {profile.payout.verificationStatus}</Text>
      </Card>

      <Card>
        <SectionHeading title="Account" subtitle="Use these actions to leave the app or remove the helper account." />
        <View style={styles.buttonRow}>
          <ActionButton
            label={busyAction === 'logout' ? 'Logging out...' : 'Log out'}
            onPress={handleLogout}
            tone="secondary"
            disabled={busyAction === 'logout'}
          />
          <ActionButton
            label={busyAction === 'delete' ? 'Deleting...' : 'Delete account'}
            onPress={handleDeleteAccount}
            tone="danger"
            disabled={busyAction === 'delete'}
          />
        </View>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  profileCopy: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 20,
  },
  formGroup: {
    gap: 10,
  },
  input: {
    backgroundColor: '#ffffff',
    borderColor: colors.border,
    borderRadius: 16,
    borderWidth: 1,
    color: colors.text,
    fontSize: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  typeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  typePill: {
    backgroundColor: '#f8fafc',
    borderColor: colors.border,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  typePillActive: {
    backgroundColor: colors.brand,
    borderColor: colors.brand,
  },
  typePillLabel: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '800',
  },
  typePillLabelActive: {
    color: '#ffffff',
  },
  buttonRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  serviceMeta: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
  },
  message: {
    color: '#166534',
    fontSize: 13,
    fontWeight: '700',
  },
  error: {
    color: '#b91c1c',
    fontSize: 13,
    fontWeight: '700',
  },
});
