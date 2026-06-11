import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { PaymentMethodsManager } from '../../components/student/PaymentMethodsManager';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { FormField } from '../../components/ui/FormField';
import { StatusBadge } from '../../components/ui/StatusBadge';
import {
  BUSINESS_CATEGORY_OPTIONS,
  CUSTOMER_ACCOUNT_TYPE_OPTIONS,
  INDIVIDUAL_CUSTOMER_TYPE_OPTIONS,
} from '../../constants/customer';
import { useAuth } from '../../context/AuthContext';
import { syncStudentGrowth } from '../../services/studentGrowthService';
import { updateUserProfile } from '../../services/userService';
import { colors } from '../../theme/colors';
import { getStudentOnboardingStatus } from '../../utils/onboarding';

export function OnboardingScreen() {
  const { setUser, user } = useAuth();
  const [fullName, setFullName] = useState(user?.fullName || user?.displayName || '');
  const [phoneNumber, setPhoneNumber] = useState(user?.phoneNumber || '');
  const [accountType, setAccountType] = useState(user?.customerProfile?.accountType || '');
  const [customerType, setCustomerType] = useState(user?.customerProfile?.customerType || '');
  const [businessName, setBusinessName] = useState(user?.customerProfile?.businessName || '');
  const [businessEmail, setBusinessEmail] = useState(user?.customerProfile?.businessEmail || user?.email || '');
  const [businessCategory, setBusinessCategory] = useState(user?.customerProfile?.businessCategory || '');
  const [serviceAddress, setServiceAddress] = useState(user?.customerProfile?.serviceAddress || '');
  const [discoverySource, setDiscoverySource] = useState(
    user?.customerProfile?.discoverySource || user?.studentProfile?.discoverySource || '',
  );
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setFullName(user?.fullName || user?.displayName || '');
    setPhoneNumber(user?.phoneNumber || '');
    setAccountType(user?.customerProfile?.accountType || '');
    setCustomerType(user?.customerProfile?.customerType || '');
    setBusinessName(user?.customerProfile?.businessName || '');
    setBusinessEmail(user?.customerProfile?.businessEmail || user?.email || '');
    setBusinessCategory(user?.customerProfile?.businessCategory || '');
    setServiceAddress(user?.customerProfile?.serviceAddress || '');
    setDiscoverySource(user?.customerProfile?.discoverySource || user?.studentProfile?.discoverySource || '');
  }, [user?.email, user?.uid]);

  const status = useMemo(() => getStudentOnboardingStatus(user), [user]);

  async function saveProfile() {
    if (!user?.uid) {
      return;
    }

    setSaving(true);
    setMessage('');
    try {
      const profile = await updateUserProfile(user.uid, {
        fullName: fullName.trim(),
        displayName: fullName.trim(),
        phoneNumber: phoneNumber.trim(),
        customerProfile: {
          ...(user?.customerProfile || {}),
          accountType,
          customerType: accountType === 'individual' ? customerType : '',
          serviceAddress: serviceAddress.trim(),
          discoverySource: discoverySource.trim(),
          businessName: accountType === 'business' ? businessName.trim() : '',
          businessEmail: accountType === 'business' ? businessEmail.trim() : '',
          businessCategory: accountType === 'business' ? businessCategory : '',
        },
        studentProfile: {
          ...(user?.studentProfile || {}),
          discoverySource: discoverySource.trim(),
        },
      });
      const syncedProfile = await syncStudentGrowth().catch(() => null);
      setUser((prev) => ({ ...prev, ...profile, ...(syncedProfile || {}) }));
      setMessage('Customer profile details saved.');
    } catch (error) {
      setMessage(error.message || 'Unable to save your customer profile.');
    } finally {
      setSaving(false);
    }
  }

  const isBusinessAccount = accountType === 'business';
  const isIndividualAccount = accountType === 'individual';
  const canSave = Boolean(
    fullName.trim()
    && phoneNumber.trim()
    && accountType
    && serviceAddress.trim()
    && discoverySource.trim()
    && (
      isBusinessAccount
        ? businessName.trim() && businessEmail.trim() && businessCategory
        : customerType
    ),
  );

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Text style={styles.title}>Complete Your Profile</Text>
        <StatusBadge label={status.complete ? 'Complete' : 'In progress'} tone={status.complete ? 'success' : 'warning'} />
      </View>
      <Text style={styles.copy}>Complete your basic details and add a payment card before requesting help.</Text>
      <Text style={styles.copy}>{status.message}</Text>
      {message ? <Card><Text style={styles.message}>{message}</Text></Card> : null}

      <Card style={styles.section}>
        <Text style={styles.sectionTitle}>Customer profile</Text>
        <FormField label="Full name" value={fullName} onChangeText={setFullName} placeholder="Jane Doe" />
        <FormField label="Phone number" value={phoneNumber} onChangeText={setPhoneNumber} placeholder="+27 71 234 5678" />
        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>Account type</Text>
          <View style={styles.optionWrap}>
            {CUSTOMER_ACCOUNT_TYPE_OPTIONS.map((option) => {
              const isActive = option.key === accountType;
              return (
                <Pressable
                  accessibilityRole="button"
                  key={option.key}
                  onPress={() => setAccountType(option.key)}
                  style={[styles.optionChip, isActive && styles.optionChipActive]}
                >
                  <Text style={[styles.optionText, isActive && styles.optionTextActive]}>{option.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
        {isBusinessAccount ? (
          <>
            <FormField
              label="Business name"
              value={businessName}
              onChangeText={setBusinessName}
              placeholder="Acme Catering"
            />
            <FormField
              label="Business email"
              autoCapitalize="none"
              keyboardType="email-address"
              value={businessEmail}
              onChangeText={setBusinessEmail}
              placeholder="bookings@acme.co.za"
            />
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Business type</Text>
              <View style={styles.optionWrap}>
                {BUSINESS_CATEGORY_OPTIONS.map((option) => {
                  const isActive = option === businessCategory;
                  return (
                    <Pressable
                      accessibilityRole="button"
                      key={option}
                      onPress={() => setBusinessCategory(option)}
                      style={[styles.optionChip, isActive && styles.optionChipActive]}
                    >
                      <Text style={[styles.optionText, isActive && styles.optionTextActive]}>{option}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </>
        ) : null}
        {isIndividualAccount ? (
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Customer type</Text>
            <View style={styles.optionWrap}>
              {INDIVIDUAL_CUSTOMER_TYPE_OPTIONS.map((option) => {
                const isActive = option === customerType;
                return (
                  <Pressable
                    accessibilityRole="button"
                    key={option}
                    onPress={() => setCustomerType(option)}
                    style={[styles.optionChip, isActive && styles.optionChipActive]}
                  >
                    <Text style={[styles.optionText, isActive && styles.optionTextActive]}>{option}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : null}
        <FormField
          label="Address or service location"
          multiline
          numberOfLines={3}
          value={serviceAddress}
          onChangeText={setServiceAddress}
          placeholder="45 Palm Street, Midrand"
          inputStyle={styles.multilineInput}
        />
        <FormField
          label="How did you hear about us?"
          value={discoverySource}
          onChangeText={setDiscoverySource}
          placeholder="Instagram, a friend, an event..."
        />
        <Button disabled={saving || !canSave} onPress={saveProfile}>
          {saving ? 'Saving...' : 'Save customer profile'}
        </Button>
      </Card>

      <Card style={styles.section}>
        <Text style={styles.sectionTitle}>Payment card</Text>
        <Text style={styles.copy}>A verified card is required before you can send a live job request.</Text>
        <PaymentMethodsManager user={user} setUser={setUser} onMessage={setMessage} />
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 14,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  title: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '900',
  },
  copy: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22,
  },
  message: {
    color: colors.text,
    fontSize: 14,
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
  fieldGroup: {
    gap: 8,
  },
  fieldLabel: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  optionWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  optionChip: {
    backgroundColor: '#fafafa',
    borderColor: colors.border,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  optionChipActive: {
    backgroundColor: colors.brand,
    borderColor: colors.brand,
  },
  optionText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '800',
  },
  optionTextActive: {
    color: '#ffffff',
  },
  multilineInput: {
    minHeight: 92,
    paddingTop: 12,
    textAlignVertical: 'top',
  },
});
