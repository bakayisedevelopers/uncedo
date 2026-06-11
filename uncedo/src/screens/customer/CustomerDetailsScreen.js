import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { FormField } from '../../components/ui/FormField';
import {
  BUSINESS_CATEGORY_OPTIONS,
  CUSTOMER_ACCOUNT_TYPE_OPTIONS,
  INDIVIDUAL_CUSTOMER_TYPE_OPTIONS,
} from '../../constants/customer';
import { useAuth } from '../../context/AuthContext';
import { getCustomerOnboardingStatus } from '../../utils/onboarding';
import { getUserProfile, updateUserProfile } from '../../services/userService';
import { colors } from '../../theme/colors';

export function CustomerDetailsScreen({ navigate }) {
  const { setUser, user } = useAuth();
  const onboardingStatus = getCustomerOnboardingStatus(user);
  const hydratedUserIdRef = useRef(null);
  const [message, setMessage] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [form, setForm] = useState({
    fullName: '',
    phoneNumber: '',
    accountType: '',
    customerType: '',
    serviceAddress: '',
    discoverySource: '',
    businessName: '',
    businessEmail: '',
    businessCategory: '',
  });

  useEffect(() => {
    if (!user?.uid) return;

    let cancelled = false;

    getUserProfile(user.uid).then((profile) => {
      if (cancelled) return;

      const profileData = profile || user;
      if (profile) {
        setUser((prev) => ({ ...prev, ...profile }));
      }

      if (hydratedUserIdRef.current !== user.uid) {
        hydratedUserIdRef.current = user.uid;
        setForm({
          fullName: profileData.fullName || profileData.displayName || '',
          phoneNumber: profileData.phoneNumber || '',
          accountType: profileData.customerProfile?.accountType || '',
          customerType: profileData.customerProfile?.customerType || '',
          serviceAddress: profileData.customerProfile?.serviceAddress || '',
          discoverySource: profileData.customerProfile?.discoverySource || profileData.studentProfile?.discoverySource || '',
          businessName: profileData.customerProfile?.businessName || '',
          businessEmail: profileData.customerProfile?.businessEmail || profileData.email || '',
          businessCategory: profileData.customerProfile?.businessCategory || '',
        });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [setUser, user?.uid]);

  const isBusinessAccount = form.accountType === 'business';
  const isIndividualAccount = form.accountType === 'individual';

  const handleSave = async () => {
    if (!user?.uid) return;

    setIsSaving(true);
    setMessage('');
    try {
      const updates = {
        fullName: form.fullName.trim(),
        displayName: form.fullName.trim(),
        phoneNumber: form.phoneNumber.trim(),
        customerProfile: {
          ...(user?.customerProfile || {}),
          accountType: form.accountType,
          customerType: form.accountType === 'individual' ? form.customerType.trim() : '',
          serviceAddress: form.serviceAddress.trim(),
          discoverySource: form.discoverySource.trim(),
          businessName: form.accountType === 'business' ? form.businessName.trim() : '',
          businessEmail: form.accountType === 'business' ? form.businessEmail.trim() : '',
          businessCategory: form.accountType === 'business' ? form.businessCategory.trim() : '',
        },
        studentProfile: {
          ...(user?.studentProfile || {}),
          discoverySource: form.discoverySource.trim(),
        },
      };
      const profile = await updateUserProfile(user.uid, updates);
      setUser((prev) => ({ ...prev, ...profile }));
      setMessage('Personal details saved.');
    } catch (error) {
      setMessage(error.message || 'Unable to save your profile right now.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.wrap} showsVerticalScrollIndicator={false}>
      <Pressable accessibilityRole="button" onPress={() => navigate('Profile')} style={styles.backRow}>
        <Ionicons color={colors.brandDark} name="chevron-back" size={18} />
        <Text style={styles.backText}>Back to profile</Text>
      </Pressable>

      <View style={styles.header}>
        <Text style={styles.title}>Personal details</Text>
        <Text style={styles.copy}>Edit the details you already gave the app. This stays connected to your main profile.</Text>
      </View>

      <Card style={styles.statusCard}>
        <Text style={styles.sectionTitle}>{onboardingStatus.title}</Text>
        <Text style={styles.copy}>{onboardingStatus.message}</Text>
      </Card>

      {message ? <Card><Text style={styles.message}>{message}</Text></Card> : null}

      <Card style={styles.card}>
        <Text style={styles.sectionTitle}>Customer profile</Text>
        <FormField
          label="Full name"
          value={form.fullName}
          onChangeText={(value) => setForm((prev) => ({ ...prev, fullName: value }))}
          placeholder="Jane Doe"
        />
        <FormField
          label="Phone number"
          value={form.phoneNumber}
          onChangeText={(value) => setForm((prev) => ({ ...prev, phoneNumber: value }))}
          placeholder="+27 71 234 5678"
        />
        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>Account type</Text>
          <View style={styles.optionWrap}>
            {CUSTOMER_ACCOUNT_TYPE_OPTIONS.map((option) => {
              const isActive = option.key === form.accountType;
              return (
                <Pressable
                  accessibilityRole="button"
                  key={option.key}
                  onPress={() => setForm((prev) => ({ ...prev, accountType: option.key }))}
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
              value={form.businessName}
              onChangeText={(value) => setForm((prev) => ({ ...prev, businessName: value }))}
              placeholder="Business name"
            />
            <FormField
              label="Business email"
              autoCapitalize="none"
              keyboardType="email-address"
              value={form.businessEmail}
              onChangeText={(value) => setForm((prev) => ({ ...prev, businessEmail: value }))}
              placeholder="business@example.com"
            />
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Business type</Text>
              <View style={styles.optionWrap}>
                {BUSINESS_CATEGORY_OPTIONS.map((option) => {
                  const isActive = option === form.businessCategory;
                  return (
                    <Pressable
                      accessibilityRole="button"
                      key={option}
                      onPress={() => setForm((prev) => ({ ...prev, businessCategory: option }))}
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
                const isActive = option === form.customerType;
                return (
                  <Pressable
                    accessibilityRole="button"
                    key={option}
                    onPress={() => setForm((prev) => ({ ...prev, customerType: option }))}
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
          value={form.serviceAddress}
          onChangeText={(value) => setForm((prev) => ({ ...prev, serviceAddress: value }))}
          placeholder="Address or service location"
          inputStyle={styles.multilineInput}
        />
        <FormField
          label="How did you hear about us?"
          value={form.discoverySource}
          onChangeText={(value) => setForm((prev) => ({ ...prev, discoverySource: value }))}
          placeholder="Instagram"
        />
        <Button disabled={isSaving} onPress={handleSave}>
          {isSaving ? 'Saving...' : 'Save personal details'}
        </Button>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 14,
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
  title: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '900',
  },
  copy: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
  },
  statusCard: {
    gap: 8,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '900',
  },
  card: {
    gap: 14,
  },
  message: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
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
