import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ActionButton, Card, SectionHeading, StatusBadge } from '../../components/app/HelperUi';
import { useHelpersApp } from '../../context/HelpersAppContext';
import { colors } from '../../theme/colors';

export function ProfileCompletionScreen({ navigate, goBack }) {
  const { onboardingStatus, profile, saving, saveError, actions } = useHelpersApp();
  const payout = profile?.payout && typeof profile.payout === 'object' ? profile.payout : {};
  const [firstName, setFirstName] = useState(profile.firstName || '');
  const [lastName, setLastName] = useState(profile.lastName || '');
  const [providerType, setProviderType] = useState(profile.providerType || '');
  const [businessName, setBusinessName] = useState(profile.businessName || '');
  const [bankName, setBankName] = useState(payout.bankName || '');
  const [accountHolder, setAccountHolder] = useState(payout.accountHolder || '');
  const [accountNumber, setAccountNumber] = useState(payout.accountNumber || '');
  const [recipientCode, setRecipientCode] = useState(payout.recipientCode || '');
  const [message, setMessage] = useState('');

  useEffect(() => {
    setFirstName(profile.firstName || '');
    setLastName(profile.lastName || '');
    setProviderType(profile.providerType || '');
    setBusinessName(profile.businessName || '');
    setBankName(payout.bankName || '');
    setAccountHolder(payout.accountHolder || '');
    setAccountNumber(payout.accountNumber || '');
    setRecipientCode(payout.recipientCode || '');
  }, [payout.accountHolder, payout.accountNumber, payout.bankName, payout.recipientCode, profile.businessName, profile.firstName, profile.lastName, profile.providerType]);

  const saveBasics = async () => {
    const result = await actions.updateProfileBasics({
      firstName,
      lastName,
      providerType,
      businessName,
      fullName: [String(firstName || '').trim(), String(lastName || '').trim()].filter(Boolean).join(' '),
    });
    if (result?.success) {
      setMessage('Profile basics saved.');
    }
  };

  const savePayout = async () => {
    const result = await actions.updatePayoutDetails({
      bankName,
      accountHolder,
      accountNumber,
      recipientCode,
      verificationStatus: bankName && accountHolder && accountNumber && recipientCode ? 'verified' : 'pending',
    });
    if (result?.success) {
      setMessage('Payout details saved.');
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.wrap} showsVerticalScrollIndicator={false}>
      <Pressable accessibilityRole="button" onPress={() => goBack('Profile')} style={styles.backRow}>
        <Ionicons color={colors.brandDark} name="chevron-back" size={18} />
        <Text style={styles.backText}>Back to profile</Text>
      </Pressable>

      <View style={styles.header}>
        <Text style={styles.eyebrow}>Helper setup</Text>
        <Text style={styles.title}>Complete helper profile</Text>
        <Text style={styles.description}>Finish the required helper setup before going online. This flow keeps helper logic intact but now lives as a full page.</Text>
      </View>

      <Card>
        <SectionHeading
          title="Setup status"
          subtitle={onboardingStatus.message}
          action={<StatusBadge label={onboardingStatus.complete ? 'Complete' : 'Required'} tone={onboardingStatus.complete ? 'success' : 'warning'} />}
        />
        {message ? <Text style={styles.success}>{message}</Text> : null}
        {saveError ? <Text style={styles.error}>{saveError}</Text> : null}
      </Card>

      <Card>
        <SectionHeading title="Profile basics" subtitle="Helper name and helper type are required." />
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
                <Text style={[styles.typeLabel, isActive && styles.typeLabelActive]}>
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
        <ActionButton label={saving ? 'Saving...' : 'Save basics'} onPress={saveBasics} disabled={saving} />
      </Card>

      <Card>
        <SectionHeading title="Skills" subtitle="At least one active skill with an uploaded work photo is required." />
        <Text style={styles.copy}>Open your skills page to add helper skills, upload work pictures, and control availability.</Text>
        <ActionButton label="Open skills" onPress={() => navigate({ key: 'ServicesOffered', params: { parentTab: 'Profile' } })} />
      </Card>

      <Card>
        <SectionHeading title="Agreement" subtitle="You must accept the current helper agreement." />
        <ActionButton label="Open agreement" onPress={() => navigate({ key: 'Agreement', params: { parentTab: 'Profile' } })} />
      </Card>

      <Card>
        <SectionHeading title="Payout details" subtitle="Verified payout details are required before going online." />
        <TextInput
          placeholder="Bank name"
          placeholderTextColor={colors.muted}
          value={bankName}
          onChangeText={setBankName}
          style={styles.input}
        />
        <TextInput
          placeholder="Account holder"
          placeholderTextColor={colors.muted}
          value={accountHolder}
          onChangeText={setAccountHolder}
          style={styles.input}
        />
        <TextInput
          placeholder="Account number"
          placeholderTextColor={colors.muted}
          value={accountNumber}
          onChangeText={setAccountNumber}
          style={styles.input}
        />
        <TextInput
          placeholder="Recipient code"
          placeholderTextColor={colors.muted}
          value={recipientCode}
          onChangeText={setRecipientCode}
          style={styles.input}
        />
        <ActionButton label={saving ? 'Saving...' : 'Save payout details'} onPress={savePayout} disabled={saving} />
      </Card>

      <Card>
        <SectionHeading title="Verification" subtitle="Verification remains a required blocker before going online." />
        <ActionButton label="Open verification" onPress={() => navigate({ key: 'Verification', params: { parentTab: 'Profile' } })} />
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 16,
    paddingBottom: 32,
  },
  backRow: {
    alignSelf: 'flex-start',
    alignItems: 'center',
    flexDirection: 'row',
    gap: 4,
  },
  backText: {
    color: colors.brandDark,
    fontSize: 13,
    fontWeight: '800',
  },
  header: {
    gap: 6,
  },
  eyebrow: {
    color: colors.brandDark,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  title: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '900',
  },
  description: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
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
  typeLabel: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '800',
  },
  typeLabelActive: {
    color: '#ffffff',
  },
  copy: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 20,
  },
  success: {
    color: '#166534',
    fontSize: 13,
    fontWeight: '700',
  },
  error: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: '700',
  },
});
