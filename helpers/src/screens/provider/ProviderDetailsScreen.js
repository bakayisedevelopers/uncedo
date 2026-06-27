import { useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ActionButton, Card } from '../../components/app/HelperUi';
import { useHelpersApp } from '../../context/HelpersAppContext';
import { captureProfileSelfie } from '../../services/imagePickerService';
import { colors } from '../../theme/colors';

export function ProviderDetailsScreen({ goBack }) {
  const { profile, actions, onboardingStatus, saving, saveError } = useHelpersApp();
  const [message, setMessage] = useState('');
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    phoneNumber: '',
    providerType: '',
    businessName: '',
    homeAddress: '',
  });

  useEffect(() => {
    setForm({
      firstName: profile.firstName || '',
      lastName: profile.lastName || '',
      phoneNumber: profile.phoneNumber || '',
      providerType: profile.providerType || '',
      businessName: profile.businessName || '',
      homeAddress: profile.homeAddress || '',
    });
  }, [profile]);

  const handleSave = async () => {
    const result = await actions.updateProfileBasics({
      ...form,
      fullName: [String(form.firstName || '').trim(), String(form.lastName || '').trim()].filter(Boolean).join(' '),
    });
    if (result?.success) {
      setMessage('Personal details saved.');
    }
  };

  const handleCaptureSelfie = async () => {
    const imageAsset = await captureProfileSelfie().catch((error) => {
      setMessage(error.message || 'Unable to open the camera right now.');
      return null;
    });

    if (!imageAsset) return;

    const result = await actions.saveProfilePhoto({
      imageAsset,
      source: 'camera',
    });
    if (result?.message) {
      setMessage(result.message);
    }
  };

  const profilePhoto = String(profile.profilePhoto || profile.selfieUrl || '').trim();

  return (
    <ScrollView contentContainerStyle={styles.wrap} showsVerticalScrollIndicator={false}>
      <Pressable accessibilityRole="button" onPress={() => goBack('Profile')} style={styles.backRow}>
        <Ionicons color={colors.brandDark} name="chevron-back" size={18} />
        <Text style={styles.backText}>Back to profile</Text>
      </Pressable>

      <View style={styles.header}>
        <Text style={styles.title}>Personal details</Text>
        <Text style={styles.copy}>Edit your helper identity, provider type, and address details used for dispatch and profile completion.</Text>
      </View>

      <Card style={styles.card}>
        <Text style={styles.sectionTitle}>Completion status</Text>
        <Text style={styles.copy}>{onboardingStatus.message}</Text>
      </Card>

      {message ? <Card style={styles.card}><Text style={styles.message}>{message}</Text></Card> : null}
      {saveError ? <Card style={styles.card}><Text style={styles.error}>{saveError}</Text></Card> : null}

      <Card style={styles.card}>
        <Text style={styles.sectionTitle}>Helper profile</Text>
        <View style={styles.selfieCard}>
          {profilePhoto ? (
            <Image source={{ uri: profilePhoto }} style={styles.selfieImage} />
          ) : (
            <View style={styles.selfiePlaceholder}>
              <Ionicons color={colors.brandDark} name="person-circle-outline" size={42} />
            </View>
          )}
          <View style={styles.selfieCopy}>
            <Text style={styles.selfieTitle}>Profile selfie</Text>
            <Text style={styles.selfieDescription}>
              This is required for helper verification and helps customers recognize who is arriving.
            </Text>
          </View>
        </View>
        <ActionButton
          label={saving ? 'Saving...' : profilePhoto ? 'Retake selfie' : 'Take selfie'}
          onPress={handleCaptureSelfie}
          disabled={saving}
          tone="secondary"
        />
        <TextInput placeholder="First name" placeholderTextColor={colors.muted} style={styles.input} value={form.firstName} onChangeText={(value) => setForm((prev) => ({ ...prev, firstName: value }))} />
        <TextInput placeholder="Last name" placeholderTextColor={colors.muted} style={styles.input} value={form.lastName} onChangeText={(value) => setForm((prev) => ({ ...prev, lastName: value }))} />
        <TextInput placeholder="Phone number" placeholderTextColor={colors.muted} style={styles.input} value={form.phoneNumber} onChangeText={(value) => setForm((prev) => ({ ...prev, phoneNumber: value }))} />
        <View style={styles.optionWrap}>
          {['individual', 'business'].map((option) => {
            const isActive = option === form.providerType;
            return (
              <Pressable
                accessibilityRole="button"
                key={option}
                onPress={() => setForm((prev) => ({ ...prev, providerType: option }))}
                style={[styles.optionChip, isActive && styles.optionChipActive]}
              >
                <Text style={[styles.optionText, isActive && styles.optionTextActive]}>
                  {option === 'individual' ? 'Individual' : 'Business'}
                </Text>
              </Pressable>
            );
          })}
        </View>
        {form.providerType === 'business' ? (
          <TextInput placeholder="Business name" placeholderTextColor={colors.muted} style={styles.input} value={form.businessName} onChangeText={(value) => setForm((prev) => ({ ...prev, businessName: value }))} />
        ) : null}
        <TextInput
          multiline
          numberOfLines={3}
          placeholder="Home address"
          placeholderTextColor={colors.muted}
          style={[styles.input, styles.multilineInput]}
          value={form.homeAddress}
          onChangeText={(value) => setForm((prev) => ({ ...prev, homeAddress: value }))}
        />
        <ActionButton label={saving ? 'Saving...' : 'Save personal details'} onPress={handleSave} disabled={saving} />
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
  card: {
    gap: 12,
  },
  selfieCard: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  selfieImage: {
    borderRadius: 18,
    height: 84,
    width: 84,
  },
  selfiePlaceholder: {
    alignItems: 'center',
    backgroundColor: '#fff8fc',
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 1,
    height: 84,
    justifyContent: 'center',
    width: 84,
  },
  selfieCopy: {
    flex: 1,
    gap: 4,
  },
  selfieTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '800',
  },
  selfieDescription: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '900',
  },
  message: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  error: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: '700',
  },
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 16,
    borderWidth: 1,
    color: colors.text,
    fontSize: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  multilineInput: {
    minHeight: 92,
    paddingTop: 12,
    textAlignVertical: 'top',
  },
  optionWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  optionChip: {
    backgroundColor: '#fff8fc',
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
});
