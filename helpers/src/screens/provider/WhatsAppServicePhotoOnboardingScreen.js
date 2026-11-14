import { useMemo, useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ActionButton, Card, SectionHeading } from '../../components/app/HelperUi';
import { useAuth } from '../../context/AuthContext';
import { useHelpersApp } from '../../context/HelpersAppContext';
import { pickServiceOfferingImagesFromLibrary } from '../../services/imagePickerService';
import { getFirebaseClients } from '../../firebase/config';
import { colors } from '../../theme/colors';

export function WhatsAppServicePhotoOnboardingScreen() {
  const { user } = useAuth();
  const { helperServiceOfferings, actions } = useHelpersApp();
  const [assetsByOffering, setAssetsByOffering] = useState({});
  const [busyOfferingKey, setBusyOfferingKey] = useState('');
  const [message, setMessage] = useState('');
  const [finishing, setFinishing] = useState(false);
  const selected = useMemo(() => (Array.isArray(helperServiceOfferings) ? helperServiceOfferings : [])
    .filter((offering) => offering.status === 'pending'), [helperServiceOfferings]);

  const keyFor = (offering) => String(offering?.offeringId || offering?.id || offering?.serviceId || '');

  const choose = async (offering) => {
    const key = keyFor(offering);
    const assets = await pickServiceOfferingImagesFromLibrary({ maxSelection: Math.max(1, 10 - offering.photos.length) }).catch((error) => {
      setMessage(error.message || 'Could not open your photos.');
      return null;
    });
    if (assets?.length) setAssetsByOffering((current) => ({ ...current, [key]: [...(current[key] || []), ...assets].slice(0, 10) }));
  };

  const upload = async (offering) => {
    const key = keyFor(offering);
    const assets = assetsByOffering[key] || [];
    if (!assets.length) return;
    setBusyOfferingKey(key);
    setMessage('');
    const result = await actions.addServiceOfferingWithPhoto({
      serviceId: offering.serviceId,
      serviceName: offering.serviceName,
      categoryId: offering.categoryId,
      optionId: offering.optionId || '',
      optionTitle: offering.optionTitle || '',
      offeringId: offering.offeringId || '',
      imageAssets: assets,
    });
    setMessage(result?.message || '');
    if (result?.success) setAssetsByOffering((current) => ({ ...current, [key]: [] }));
    setBusyOfferingKey('');
  };

  const finish = async () => {
    setFinishing(true);
    setMessage('');
    try {
      const { functions, authProviders } = getFirebaseClients();
      const call = authProviders.httpsCallable(functions, 'completeWhatsAppHelperServicePhotos');
      await call({});
      setMessage('All service photos are complete. Check WhatsApp for your agreement link.');
    } catch (error) {
      setMessage(error?.message || 'Upload at least one photo for each selected option/service before continuing.');
    } finally {
      setFinishing(false);
    }
  };

  if (!user?.uid) return <View style={styles.wrap}><Text style={styles.title}>Sign in to continue</Text><Text style={styles.copy}>Use the helper email account linked to this WhatsApp number.</Text></View>;

  return <ScrollView contentContainerStyle={styles.wrap}>
    <Text style={styles.eyebrow}>WhatsApp helper setup</Text>
    <Text style={styles.title}>Add service work photos</Text>
    <Text style={styles.copy}>Choose photos from your device for every service option you selected. Your progress is saved as each item is uploaded.</Text>
    {selected.map((offering) => {
      const key = keyFor(offering);
      const assets = assetsByOffering[key] || [];
      const photoCount = (offering.photos || []).length;
      const title = offering.optionTitle
        ? `${offering.serviceName} — ${offering.optionTitle}`
        : offering.serviceName;
      return <Card key={key}>
        <SectionHeading title={title} subtitle={`${photoCount ? `${photoCount} uploaded` : 'At least one photo required'}${assets.length ? ` · ${assets.length} selected` : ''}`} />
        {!!assets.length && <View style={styles.grid}>{assets.map((asset, index) => <Image key={`${asset.uri}-${index}`} source={{ uri: asset.uri }} style={styles.photo} />)}</View>}
        <View style={styles.actions}>
          <ActionButton label="Choose photos" tone="secondary" onPress={() => choose(offering)} disabled={busyOfferingKey === key} />
          <ActionButton label={busyOfferingKey === key ? 'Uploading…' : 'Upload photos'} onPress={() => upload(offering)} disabled={!assets.length || busyOfferingKey === key} />
        </View>
      </Card>;
    })}
    {message ? <Text style={styles.message}>{message}</Text> : null}
    <ActionButton label={finishing ? 'Checking uploads…' : 'Finish photo step'} onPress={finish} disabled={finishing || !selected.length || selected.some((offering) => !(offering.photos || []).length)} />
  </ScrollView>;
}

const styles = StyleSheet.create({
  wrap: { flexGrow: 1, width: '100%', maxWidth: 760, alignSelf: 'center', padding: 24, gap: 16, backgroundColor: colors.background },
  eyebrow: { color: colors.brand, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
  title: { color: colors.text, fontSize: 30, fontWeight: '800' },
  copy: { color: colors.muted, fontSize: 16, lineHeight: 24 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 12 },
  photo: { width: 88, height: 88, borderRadius: 10 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  message: { color: colors.brandDark, fontWeight: '700' },
});
