import { useEffect, useRef, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { FormField } from '../../components/ui/FormField';
import { LEGAL_LINKS } from '../../constants/legal';
import { useAuth } from '../../context/AuthContext';
import { getUserProfile, updateUserProfile } from '../../services/userService';
import { colors } from '../../theme/colors';
import { getStudentOnboardingStatus } from '../../utils/onboarding';

export function ProfileScreen({ navigate }) {
  const { deleteAccount, logout, setUser, user } = useAuth();
  const currentUser = user;
  const onboardingStatus = getStudentOnboardingStatus(currentUser);
  const hydratedUserIdRef = useRef(null);
  const [confirmText, setConfirmText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [message, setMessage] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [form, setForm] = useState({
    fullName: '',
    phoneNumber: '',
    customerType: '',
    serviceAddress: '',
    discoverySource: '',
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
          customerType: profileData.customerProfile?.customerType || '',
          serviceAddress: profileData.customerProfile?.serviceAddress || '',
          discoverySource: profileData.customerProfile?.discoverySource || profileData.studentProfile?.discoverySource || '',
        });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [setUser, user?.uid]);

  const openLegalUrl = (url) => Linking.openURL(url).catch(() => null);

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
          customerType: form.customerType.trim(),
          serviceAddress: form.serviceAddress.trim(),
          discoverySource: form.discoverySource.trim(),
        },
        studentProfile: {
          ...(user?.studentProfile || {}),
          discoverySource: form.discoverySource.trim(),
        },
      };
      const profile = await updateUserProfile(user.uid, updates);
      setUser((prev) => ({ ...prev, ...profile }));
      setMessage('Profile details saved.');
    } catch (error) {
      setMessage(error.message || 'Unable to save profile right now.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (confirmText !== 'DELETE') {
      setMessage('Type DELETE to confirm account deletion.');
      return;
    }
    try {
      setIsDeleting(true);
      await deleteAccount(user.uid);
      setUser(null);
    } catch (error) {
      setMessage(error.message || 'Unable to delete account. You may need to sign in again.');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.wrap}>
      <View style={styles.header}>
        <Text style={styles.title}>Profile & Settings</Text>
        <Text style={styles.copy}>Manage your customer details, service location, payment readiness, and account settings.</Text>
      </View>

      {!onboardingStatus.complete ? (
        <Card style={styles.card}>
          <Text style={styles.sectionTitle}>Complete profile</Text>
          <Text style={styles.copy}>Finish your customer profile and add a payment card before requesting help.</Text>
          <Button onPress={() => navigate('Onboarding')}>Open complete profile</Button>
        </Card>
      ) : null}

      <Card style={styles.card}>
        <Text style={styles.sectionTitle}>Customer details</Text>
        <FormField
          label="Full name"
          value={form.fullName}
          onChangeText={(value) => setForm((prev) => ({ ...prev, fullName: value }))}
          placeholder="Full name"
        />
        <FormField
          label="Phone number"
          value={form.phoneNumber}
          onChangeText={(value) => setForm((prev) => ({ ...prev, phoneNumber: value }))}
          placeholder="Phone number"
        />
        <FormField
          label="Customer type"
          value={form.customerType}
          onChangeText={(value) => setForm((prev) => ({ ...prev, customerType: value }))}
          placeholder="Homeowner"
        />
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
          {isSaving ? 'Saving...' : 'Save profile'}
        </Button>
      </Card>

      <Card style={styles.card}>
        <View style={styles.accountHeader}>
          <Text style={styles.sectionTitle}>Account</Text>
          <Button variant="secondary" onPress={logout}>Log out</Button>
        </View>
        <View style={styles.detailGrid}>
          <View style={styles.detailItem}>
            <Text style={styles.metaLabel}>Email</Text>
            <Text style={styles.metaValue}>{currentUser?.email || 'Not set'}</Text>
          </View>
          <View style={styles.detailItem}>
            <Text style={styles.metaLabel}>Role</Text>
            <Text style={styles.metaValue}>Customer</Text>
          </View>
          <View style={styles.detailItem}>
            <Text style={styles.metaLabel}>Profile status</Text>
            <Text style={styles.meta}>{onboardingStatus.complete ? 'Ready to request help' : onboardingStatus.message}</Text>
          </View>
          <View style={styles.detailItem}>
            <Text style={styles.metaLabel}>Payment card</Text>
            <Text style={styles.meta}>
              {Array.isArray(currentUser?.paymentMethods) && currentUser.paymentMethods.length
                ? `${currentUser.paymentMethods.length} card${currentUser.paymentMethods.length === 1 ? '' : 's'} on file`
                : 'No card added yet'}
            </Text>
          </View>
        </View>
      </Card>

      <Card style={styles.card}>
        <Text style={styles.sectionTitle}>Safety & legal</Text>
        <Text style={styles.copy}>Open the latest policies and platform documents.</Text>
        <View style={styles.legalList}>
          {LEGAL_LINKS.map((link) => (
            <Pressable key={link.href} onPress={() => openLegalUrl(link.href)} style={styles.legalLink}>
              <Text style={styles.legalLinkText}>{link.label}</Text>
            </Pressable>
          ))}
        </View>
      </Card>

      <Card style={styles.card}>
        <Text style={styles.sectionTitle}>Delete account</Text>
        <Text style={styles.copy}>This permanently removes your profile and access.</Text>
        <Text style={styles.danger}>Type DELETE below to confirm permanent account deletion.</Text>
        <TextInput
          placeholder="Type DELETE"
          placeholderTextColor={colors.muted}
          style={styles.deleteInput}
          value={confirmText}
          onChangeText={setConfirmText}
        />
        <Button variant="secondary" disabled={isDeleting} onPress={handleDelete}>
          {isDeleting ? 'Deleting account...' : 'Delete my account'}
        </Button>
        {message ? <Text style={styles.message}>{message}</Text> : null}
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 16,
    paddingBottom: 28,
  },
  header: {
    gap: 8,
  },
  title: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '900',
  },
  card: {
    gap: 14,
  },
  copy: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '900',
  },
  multilineInput: {
    minHeight: 96,
    paddingTop: 12,
    textAlignVertical: 'top',
  },
  accountHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  detailGrid: {
    gap: 12,
  },
  detailItem: {
    gap: 4,
  },
  meta: {
    color: colors.text,
    fontSize: 14,
    lineHeight: 20,
  },
  metaLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  metaValue: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  legalList: {
    gap: 10,
  },
  legalLink: {
    backgroundColor: 'rgba(16,185,129,0.06)',
    borderColor: 'rgba(16,185,129,0.18)',
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  legalLinkText: {
    color: colors.brandDark,
    fontSize: 14,
    fontWeight: '800',
  },
  danger: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: '700',
  },
  deleteInput: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 16,
    borderWidth: 1,
    color: colors.text,
    fontSize: 14,
    minHeight: 46,
    paddingHorizontal: 14,
  },
  message: {
    color: colors.text,
    fontSize: 13,
  },
});
