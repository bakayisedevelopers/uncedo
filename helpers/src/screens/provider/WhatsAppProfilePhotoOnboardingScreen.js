import { useState } from 'react';
import { Image, Linking, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ActionButton, Card, SectionHeading, StatusBadge } from '../../components/app/HelperUi';
import { useAuth } from '../../context/AuthContext';
import { useHelpersApp } from '../../context/HelpersAppContext';
import { getFirebaseClients } from '../../firebase/config';
import { captureProfileSelfie, pickServiceOfferingImageFromLibrary } from '../../services/imagePickerService';
import { colors } from '../../theme/colors';

const WHATSAPP_RETURN_URL = 'https://wa.me/27605239926';

export function WhatsAppProfilePhotoOnboardingScreen() {
  const { user } = useAuth();
  const { profile, saving, saveError, actions } = useHelpersApp();
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [finishing, setFinishing] = useState(false);
  const [returnUrl, setReturnUrl] = useState('');

  const profilePhoto = String(profile?.profilePhoto || profile?.selfieUrl || '').trim();

  const uploadPhoto = async (loader, source) => {
    setErrorMessage('');
    setMessage('');
    const asset = await loader().catch((error) => {
      setErrorMessage(error?.message || 'Unable to access your camera or photo library.');
      return null;
    });
    if (!asset?.uri) return;
    const result = await actions.saveProfilePhoto({ imageAsset: asset, source });
    if (result?.success) {
      setMessage('Profile photo uploaded. Tap "Finish profile photo step" below to continue in WhatsApp.');
    } else if (result?.message) {
      setErrorMessage(result.message);
    }
  };

  const finish = async () => {
    setFinishing(true);
    setErrorMessage('');
    setMessage('');
    try {
      const { functions, authProviders } = getFirebaseClients();
      const call = authProviders.httpsCallable(functions, 'completeWhatsAppHelperProfilePhoto');
      const response = await call({});
      const nextReturnUrl = String(response?.data?.returnUrl || WHATSAPP_RETURN_URL).trim();
      setReturnUrl(nextReturnUrl);
      setMessage('Your helper profile photo is saved. Check your WhatsApp chat for the next setup step.');
    } catch (error) {
      setErrorMessage(error?.message || 'Upload a clear helper profile photo before continuing.');
    } finally {
      setFinishing(false);
    }
  };

  const openWhatsApp = () => {
    const target = returnUrl || WHATSAPP_RETURN_URL;
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.location.assign(target);
      return;
    }
    Linking.openURL(target).catch(() => null);
  };

  if (!user?.uid) {
    return (
      <View style={styles.wrap}>
        <Text style={styles.title}>Sign in to continue</Text>
        <Text style={styles.copy}>Use the helper email account linked to this WhatsApp number.</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.wrap} showsVerticalScrollIndicator={false}>
      <Text style={styles.eyebrow}>WhatsApp helper setup</Text>
      <Text style={styles.title}>Add your helper profile photo</Text>
      <Text style={styles.copy}>
        Take a clear selfie or choose a photo showing your face clearly. Customers see this photo when you accept a job.
      </Text>

      <Card>
        <SectionHeading
          title="Profile photo"
          subtitle={profilePhoto ? 'Uploaded and saved to your helper profile.' : 'Required before admin verification.'}
          action={<StatusBadge label={profilePhoto ? 'Uploaded' : 'Required'} tone={profilePhoto ? 'success' : 'warning'} />}
        />

        <View style={styles.previewRow}>
          {profilePhoto ? (
            <Image source={{ uri: profilePhoto }} style={styles.previewImage} />
          ) : (
            <View style={styles.previewPlaceholder}>
              <Ionicons color={colors.brandDark} name="person-circle-outline" size={48} />
            </View>
          )}
          <View style={styles.previewCopy}>
            <Text style={styles.previewTitle}>Clear face photo</Text>
            <Text style={styles.previewSubtitle}>
              Make sure your face is well-lit and easy to recognize with no sunglasses or filters.
            </Text>
          </View>
        </View>

        <View style={styles.actions}>
          <ActionButton
            label={saving ? 'Uploading…' : profilePhoto ? 'Retake selfie' : 'Take selfie'}
            onPress={() => uploadPhoto(captureProfileSelfie, 'camera')}
            disabled={saving || finishing}
          />
          <ActionButton
            label={saving ? 'Uploading…' : 'Choose photo'}
            tone="secondary"
            onPress={() => uploadPhoto(pickServiceOfferingImageFromLibrary, 'library')}
            disabled={saving || finishing}
          />
        </View>
      </Card>

      {errorMessage || saveError ? <Text style={styles.error}>{errorMessage || saveError}</Text> : null}
      {message ? <Text style={styles.message}>{message}</Text> : null}

      <ActionButton
        label={finishing ? 'Saving progress…' : 'Finish profile photo step'}
        onPress={finish}
        disabled={saving || finishing || !profilePhoto}
      />
      <ActionButton
        label="Return to WhatsApp"
        tone="secondary"
        onPress={openWhatsApp}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { flexGrow: 1, width: '100%', maxWidth: 760, alignSelf: 'center', padding: 24, gap: 16, backgroundColor: colors.background },
  eyebrow: { color: colors.brand, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
  title: { color: colors.text, fontSize: 30, fontWeight: '800' },
  copy: { color: colors.muted, fontSize: 16, lineHeight: 24 },
  previewRow: { flexDirection: 'row', alignItems: 'center', gap: 16, marginVertical: 12 },
  previewImage: { width: 88, height: 88, borderRadius: 44, backgroundColor: colors.surfaceSoft },
  previewPlaceholder: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: colors.surfaceSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewCopy: { flex: 1, gap: 4 },
  previewTitle: { color: colors.text, fontSize: 16, fontWeight: '700' },
  previewSubtitle: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  message: { color: colors.brandDark, fontWeight: '700', lineHeight: 22 },
  error: { color: colors.danger, fontWeight: '700', lineHeight: 22 },
});
