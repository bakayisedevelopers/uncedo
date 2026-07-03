import { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ActionButton, Card, EmptyState, SectionHeading, StatusBadge } from '../../components/app/HelperUi';
import { getServiceById } from '../../constants/serviceCatalog';
import { useHelpersApp } from '../../context/HelpersAppContext';
import { pickServiceOfferingImagesFromLibrary } from '../../services/imagePickerService';
import { colors } from '../../theme/colors';

function formatStatusLabel(status = 'pending') {
  const normalized = String(status || 'pending').toLowerCase();
  if (normalized === 'approved') return 'Approved';
  if (normalized === 'pending') return 'Pending';
  if (normalized === 'rejected') return 'Rejected';
  return 'Saved';
}

function slugify(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function ServiceOfferingDetailsScreen({ route, goBack }) {
  const { helperServiceOfferings, serviceCatalog, actions, saving, saveError } = useHelpersApp();
  const serviceId = route?.params?.serviceId || '';
  const serviceName = route?.params?.serviceName || '';
  const categoryId = route?.params?.categoryId || '';
  const routeCatalogId = serviceId;
  const mode = route?.params?.mode || 'edit';
  const [selectedAssets, setSelectedAssets] = useState([]);
  const [message, setMessage] = useState('');

  const service = getServiceById(serviceId);
  const catalogService = useMemo(
    () => (Array.isArray(serviceCatalog) ? serviceCatalog.find((entry) => String(entry.id || '').toLowerCase() === String(routeCatalogId || '').toLowerCase()) : null),
    [routeCatalogId, serviceCatalog],
  );
  const savedServiceOffering = useMemo(
    () => helperServiceOfferings.find((offering) => (
      offering.serviceId === serviceId
      && (
        offering.serviceName === serviceName
        || slugify(`${offering.serviceId || ''}_${offering.serviceName || ''}`) === String(routeCatalogId || '').toLowerCase()
      )
    )) || null,
    [helperServiceOfferings, routeCatalogId, serviceId, serviceName],
  );
  const canInheritBundleImages = Boolean(catalogService?.type === 'bundle' && catalogService?.inheritBundleImages !== false);

  useEffect(() => {
    setSelectedAssets([]);
    setMessage('');
  }, [serviceId, serviceName, routeCatalogId, mode]);

  const handleSelectImages = async () => {
    const maxSelection = Math.max(1, 10 - ((savedServiceOffering?.photos || []).length + selectedAssets.length));
    const assets = await pickServiceOfferingImagesFromLibrary({ maxSelection }).catch((error) => {
      setMessage(error.message || 'Unable to select images right now.');
      return null;
    });

    if (assets && assets.length) {
      setSelectedAssets((current) => [...current, ...assets].slice(0, 10 - ((savedServiceOffering?.photos || []).length)));
      setMessage('');
    }
  };

  const handleSaveServiceOffering = async () => {
    const result = await actions.addServiceOfferingWithPhoto({
      serviceId,
      serviceName,
      categoryId: catalogService?.categoryId || service?.categoryId || '',
      imageAssets: selectedAssets,
    });
    setMessage(result?.message || '');
    if (result?.success) {
      setSelectedAssets([]);
    }
  };

  const totalPictures = (savedServiceOffering?.photos || []).length + selectedAssets.length;
  const remainingSlots = Math.max(0, 10 - totalPictures);
  const canToggleActive = Boolean(savedServiceOffering && savedServiceOffering.status === 'approved');

  if (!serviceId || !serviceName) {
    return (
      <ScrollView contentContainerStyle={styles.wrap} showsVerticalScrollIndicator={false}>
        <EmptyState title="Service not found" description="This service reference is missing." />
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.wrap} showsVerticalScrollIndicator={false}>
      <Pressable accessibilityRole="button" onPress={() => goBack('ServicesOffered')} style={styles.backRow}>
        <Ionicons color={colors.brandDark} name="chevron-back" size={18} />
        <Text style={styles.backText}>Back to offerings</Text>
      </Pressable>

      <View style={styles.header}>
        <Text style={styles.eyebrow}>Helper service</Text>
        <Text style={styles.title}>{serviceName}</Text>
        <Text style={styles.description}>{catalogService?.description || service?.description || service?.name || 'Service category'}</Text>
      </View>

      {catalogService?.images?.length ? (
        <Card>
          <SectionHeading
            title="Admin catalog images"
            subtitle="These are the images that the admin has published for this service."
          />
          <View style={styles.gallery}>
            {catalogService.images.map((picture) => (
              <View key={picture.id} style={styles.galleryCard}>
                <Image resizeMode="cover" source={{ uri: picture.uri }} style={styles.galleryImage} />
              </View>
            ))}
          </View>
        </Card>
      ) : null}

      <Card>
        <SectionHeading
          title="Service status"
          subtitle={canInheritBundleImages
            ? 'This bundle stays pending until the admin approves it. It can inherit admin portfolio images from the services inside the bundle.'
            : 'This service stays pending until the admin approves it, and it only becomes available for matching when it is active and has at least one uploaded work picture.'}
          action={savedServiceOffering ? <StatusBadge label={formatStatusLabel(savedServiceOffering.status)} tone={savedServiceOffering.status === 'approved' ? 'success' : 'warning'} /> : <StatusBadge label="New" tone="info" />}
        />
        {savedServiceOffering ? (
          <View style={styles.toggleRow}>
            <View style={styles.toggleCopy}>
              <Text style={styles.toggleTitle}>Available for matching</Text>
              <Text style={styles.toggleDescription}>
                {savedServiceOffering.status === 'approved'
                  ? 'Turn this off if you do not want to receive requests for this service right now.'
                  : 'This switch unlocks after the admin approves your service submission.'}
              </Text>
            </View>
            <Switch
              disabled={saving || !canToggleActive}
              onValueChange={(value) => actions.toggleServiceOfferingActive({
                serviceId,
                serviceName,
                active: value,
              })}
              thumbColor="#ffffff"
              trackColor={{ false: '#d1d5db', true: '#22c55e' }}
              value={savedServiceOffering.active}
            />
          </View>
        ) : (
          <Text style={styles.copy}>
            {canInheritBundleImages
              ? 'Submit this bundle now, or add extra work pictures if you want your own portfolio on top of the inherited images.'
              : 'Upload your first work pictures to submit this service for approval.'}
          </Text>
        )}
        {message ? <Text style={styles.message}>{message}</Text> : null}
        {saveError ? <Text style={styles.error}>{saveError}</Text> : null}
      </Card>

      <Card>
        <SectionHeading
          title={savedServiceOffering ? 'Work portfolio' : 'Submit service'}
          subtitle={canInheritBundleImages
            ? 'You can upload up to 10 extra pictures, or submit the bundle without new uploads and rely on inherited admin images.'
            : 'Upload up to 10 pictures for this service. The admin will review them before the service becomes available.'}
        />
        {selectedAssets.length ? (
          <View style={styles.previewGrid}>
            {selectedAssets.map((asset) => (
              <View key={`${asset.uri}-${asset.fileName}`} style={styles.previewCard}>
                <Image resizeMode="cover" source={{ uri: asset.uri }} style={styles.previewImage} />
                <Text style={styles.previewName}>{asset.fileName || 'Selected image'}</Text>
              </View>
            ))}
          </View>
        ) : null}
        <View style={styles.actionRow}>
          <ActionButton label={selectedAssets.length ? 'Add more pictures' : 'Upload pictures'} onPress={handleSelectImages} tone="secondary" disabled={remainingSlots === 0} />
          {selectedAssets.length || canInheritBundleImages ? (
            <ActionButton label={saving ? 'Submitting...' : savedServiceOffering ? 'Save pictures' : 'Submit for approval'} onPress={handleSaveServiceOffering} disabled={saving} />
          ) : null}
        </View>
        {remainingSlots === 0 ? <Text style={styles.limitText}>This service already has 10 pictures saved.</Text> : null}
      </Card>

      {savedServiceOffering ? (
        <Card>
          <SectionHeading title="Saved pictures" subtitle="Add more pictures or remove older ones from this service." />
          {(savedServiceOffering.photos || []).length ? (
            <View style={styles.gallery}>
              {savedServiceOffering.photos.map((picture) => (
                <View key={picture.id} style={styles.galleryCard}>
                  <Image resizeMode="cover" source={{ uri: picture.uri }} style={styles.galleryImage} />
                  <ActionButton
                    label="Remove picture"
                    onPress={() => actions.removeServiceOfferingPicture({
                      serviceId,
                      serviceName,
                      pictureId: picture.id,
                    })}
                    tone="secondary"
                    disabled={saving}
                  />
                </View>
              ))}
            </View>
          ) : (
            <EmptyState title="No pictures yet" description="Upload at least one picture so this service stays available for matching." />
          )}
          <ActionButton
            label="Delete service"
            onPress={() => actions.removeServiceOffering({ serviceId, serviceName }).then(() => goBack('ServicesOffered'))}
            tone="danger"
            disabled={saving}
          />
        </Card>
      ) : null}
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
  copy: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 20,
  },
  toggleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  toggleCopy: {
    flex: 1,
    gap: 4,
  },
  toggleTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '800',
  },
  toggleDescription: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
  },
  message: {
    color: colors.brandDark,
    fontSize: 13,
    fontWeight: '700',
  },
  error: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: '700',
  },
  previewGrid: {
    gap: 12,
    marginBottom: 10,
  },
  previewCard: {
    backgroundColor: '#fff8fc',
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 1,
    gap: 8,
    overflow: 'hidden',
    padding: 8,
  },
  previewImage: {
    borderRadius: 12,
    height: 220,
    width: '100%',
  },
  previewName: {
    color: colors.muted,
    fontSize: 12,
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  limitText: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 8,
  },
  gallery: {
    gap: 12,
  },
  galleryCard: {
    backgroundColor: '#fff8fc',
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 1,
    gap: 10,
    overflow: 'hidden',
    padding: 8,
  },
  galleryImage: {
    borderRadius: 12,
    height: 180,
    width: '100%',
  },
});
