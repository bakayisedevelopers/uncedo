import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { ActionButton, Card, MetricCard, Screen, SectionHeading, StatusBadge } from '../../components/app/HelperUi';
import { useHelpersApp } from '../../context/HelpersAppContext';
import { colors } from '../../theme/colors';

export function ProviderProfileScreen({ navigate }) {
  const { profile, onboardingStatus, actions } = useHelpersApp();
  const [firstName, setFirstName] = useState(profile.firstName || '');
  const [lastName, setLastName] = useState(profile.lastName || '');
  const [providerType, setProviderType] = useState(profile.providerType || 'individual');
  const [businessName, setBusinessName] = useState(profile.businessName || '');

  useEffect(() => {
    setFirstName(profile.firstName || '');
    setLastName(profile.lastName || '');
    setProviderType(profile.providerType || 'individual');
    setBusinessName(profile.businessName || '');
  }, [profile.businessName, profile.firstName, profile.lastName, profile.providerType]);

  const saveBasics = () => {
    actions.updateProfileBasics({
      firstName,
      lastName,
      providerType,
      businessName,
      fullName: [String(firstName || '').trim(), String(lastName || '').trim()].filter(Boolean).join(' '),
    });
  };

  return (
    <Screen
      eyebrow="Helper"
      title="Profile"
      description="This profile keeps the same operational shape as tutor onboarding, but it is centered on services, skills, work proof, verification, and helper payout readiness."
    >
      <Card>
        <SectionHeading
          title={profile.fullName}
          subtitle={`${profile.city} · Rating ${profile.rating.toFixed(2)}`}
          action={<StatusBadge label={profile.verificationStatus} tone={profile.verificationStatus === 'verified' ? 'success' : 'warning'} />}
        />
        <Text style={styles.profileCopy}>{onboardingStatus.message}</Text>
        <View style={styles.metricGrid}>
          <MetricCard label="Active services" value={String(profile.services.length)} />
          <MetricCard
            label="Active skills"
            value={String(profile.services.reduce((sum, service) => sum + (service.skills || []).length, 0))}
          />
        </View>
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
          <ActionButton label="Save profile basics" onPress={saveBasics} />
        </View>
        <View style={styles.buttonRow}>
          <ActionButton label="Open services" onPress={() => navigate('Services')} />
          <ActionButton label="Open verification" onPress={() => navigate('Verification')} tone="secondary" />
        </View>
      </Card>

      <Card>
        <SectionHeading title="Service summary" subtitle="Each helper service is matched through its own skills and linked work photos." />
        {profile.services.map((service) => (
          <View key={service.serviceId} style={styles.serviceRow}>
            <Text style={styles.serviceTitle}>{service.serviceName}</Text>
            <Text style={styles.serviceMeta}>
              {(service.skills || []).map((skill) => `${skill.name} (${skill.pictures.length})`).join(' · ')}
            </Text>
          </View>
        ))}
      </Card>

      <Card>
        <SectionHeading title="Payout status" subtitle="Payment logic mirrors the tutor payout flow." />
        <Text style={styles.serviceMeta}>Bank: {profile.payout.bankName}</Text>
        <Text style={styles.serviceMeta}>Account: {profile.payout.accountNumber}</Text>
        <Text style={styles.serviceMeta}>Recipient: {profile.payout.recipientCode}</Text>
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
  serviceRow: {
    borderColor: colors.border,
    borderRadius: 16,
    borderWidth: 1,
    gap: 4,
    padding: 12,
  },
  serviceTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '900',
  },
  serviceMeta: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
  },
});
