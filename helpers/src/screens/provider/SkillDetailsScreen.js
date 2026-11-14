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
  const routeOptionId = String(route?.params?.optionId || '').trim();
  const routeOfferingId = String(route?.params?.offeringId || '').trim();
  const routeCatalogId = serviceId;
  const mode = route?.params?.mode || 'edit';
  const [selectedOptionId, setSelectedOptionId] = useState(routeOptionId);
  const [selectedAssets, setSelectedAssets] = useState([]);
  const [message, setMessage] = useState('');

  const service = getServiceById(serviceId);
  const catalogService = useMemo(
    () => (Array.isArray(serviceCatalog) ? serviceCatalog.find((entry) => String(entry.id || '').toLowerCase() === String(routeCatalogId || '').toLowerCase()) : null),
    [routeCatalogId, serviceCatalog],
  );
  const catalogOptions = useMemo(
    () => (Array.isArray(catalogService?.options) ? catalogService.options : []),
    [catalogService],
  );
  const isUnifiedService = catalogService?.optionApplicationMode === 'unified';
  const requiresOptionSelection = catalogOptions.length > 0 && !isUnifiedService;

  const serviceOfferingsForService = useMemo(
    () => helperServiceOfferings.filter((offering) => (
      String(offering.serviceId || '').trim().toLowerCase() === String(serviceId || '').trim().toLowerCase()
    )),
    [helperServiceOfferings, serviceId],
  );

  useEffect(() => {
    if (!requiresOptionSelection) {
      setSelectedOptionId('');
      return;
    }
    if (routeOptionId && catalogOptions.some((opt) => slugify(opt.id) === slugify(routeOptionId))) {
      setSelectedOptionId(routeOptionId);
      return;
    }
    const existingOptId = serviceOfferingsForService.find((item) => item.optionId)?.optionId || '';
    const fallbackOptId = catalogOptions[0]?.id || '';
    setSelectedOptionId((current) => {
      if (current && catalogOptions.some((opt) => slugify(opt.id) === slugify(current))) return current;
      return existingOptId || fallbackOptId;
    });
  }, [catalogOptions, requiresOptionSelection, routeOptionId, serviceOfferingsForService]);

  const activeOption = useMemo(() => {
    if (!requiresOptionSelection) return null;
    const normalized = slugify(selectedOptionId);
    return catalogOptions.find((opt) => slugify(opt.id) === normalized) || catalogOptions[0] || null;
  }, [catalogOptions, requiresOptionSelection, selectedOptionId]);

  const savedServiceOffering = useMemo(() => {
    if (requiresOptionSelection && activeOption) {
      const targetOptionSlug = slugify(activeOption.id);
      return serviceOfferingsForService.find((offering) => slugify(offering.optionId || '') === targetOptionSlug) || null;
    }
    if (routeOfferingId) {
      const exact = serviceOfferingsForService.find((offering) => offering.offeringId === routeOfferingId);
      if (exact) return exact;
    }
    return serviceOfferingsForService.find((offering) => !offering.optionId) || serviceOfferingsForService[0] || null;
  }, [activeOption, requiresOptionSelection, routeOfferingId, serviceOfferingsForService]);

  const canInheritBundleImages = Boolean(catalogService?.type === 'bundle' && catalogService?.inheritBundleImages !== false);

  useEffect(() => {
    setSelectedAssets([]);
    setMessage('');
  }, [serviceId, serviceName, routeCatalogId, mode, activeOption?.id]);

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
      optionId: activeOption?.id || '',
      optionTitle: activeOption?.title || '',
      offeringId: savedServiceOffering?.offeringId || '',
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
        <Text style={styles.title}>{activeOption ? `${serviceName} — ${activeOption.title}` : serviceName}</Text>
        <Text style={styles.description}>{activeOption?.description || catalogService?.description || service?.description || service?.name || 'Service category'}</Text>
      </View>

      {requiresOptionSelection ? (
        <Card>
          <SectionHeading
            title="Select option to apply for"
            subtitle="Pick an option below to upload proof photos and track its approval independently."
          />
          <View style={styles.optionList}>
            {catalogOptions.map((opt) => {
              const isSelected = slugify(activeOption?.id) === slugify(opt.id);
              const existingOpt = serviceOfferingsForService.find((item) => slugify(item.optionId || '') === slugify(opt.id)) || null;
              return (
                <Pressable
                  key={opt.id}
                  accessibilityRole="button"
                  onPress={() => setSelectedOptionId(opt.id)}
                  style={[styles.optionCard, isSelected && styles.optionCardSelected]}
                >
                  <View style={styles.optionHeader}>
                    <View style={styles.optionCopy}>
                      <Text style={styles.optionTitle}>{opt.title}</Text>
                      {opt.description ? <Text style={styles.optionDescription}>{opt.description}</Text> : null}
                      {Number(opt.price || 0) > 0 ? (
                        <Text style={styles.optionPrice}>Base rate: R{Number(opt.price).toFixed(0)}</Text>
                      ) : null}
                    </View>
                    {existingOpt ? (
                      <StatusBadge
                        label={formatStatusLabel(existingOpt.status)}
                        tone={existingOpt.status === 'approved' ? 'success' : existingOpt.status === 'rejected' ? 'danger' : 'warning'}
                      />
                    ) : (
                      <StatusBadge label={isSelected ? 'Selected' : 'Choose'} tone={isSelected ? 'info' : 'neutral'} />
                    )}
                  </View>
                </Pressable>
              );
            })}
          </View>
        </Card>
      ) : null}

      {isUnifiedService && catalogOptions.length > 0 ? (
        <Card>
          <SectionHeading
            title="Unified service coverage"
            subtitle={`Applying for ${serviceName} covers all ${catalogOptions.length} options (${catalogOptions.map((o) => o.title).filter(Boolean).join(', ')}) once approved.`}
          />
        </Card>
      ) : null}

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
          title={activeOption ? `${activeOption.title} status` : 'Service status'}
          subtitle={canInheritBundleImages
            ? 'This bundle stays pending until the admin approves it. It can inherit admin portfolio images from the services inside the bundle.'
            : 'This submission stays pending until the admin approves it, and it only matches requests when active with at least one uploaded proof picture.'}
          action={savedServiceOffering ? <StatusBadge label={formatStatusLabel(savedServiceOffering.status)} tone={savedServiceOffering.status === 'approved' ? 'success' : 'warning'} /> : <StatusBadge label="New" tone="info" />}
        />
        {savedServiceOffering ? (
          <View style={styles.toggleRow}>
            <View style={styles.toggleCopy}>
              <Text style={styles.toggleTitle}>Available for matching</Text>
              <Text style={styles.toggleDescription}>
                {savedServiceOffering.status === 'approved'
                  ? `Turn this off if you do not want to receive requests for ${activeOption ? activeOption.title : 'this service'} right now.`
                  : 'This switch unlocks after the admin approves your submission.'}
              </Text>
            </View>
            <Switch
              disabled={saving || !canToggleActive}
              onValueChange={(value) => actions.toggleServiceOfferingActive({
                serviceId,
                serviceName,
                optionId: activeOption?.id || savedServiceOffering?.optionId || '',
                offeringId: savedServiceOffering?.offeringId || '',
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
              : `Upload your first work pictures to submit ${activeOption ? activeOption.title : 'this service'} for approval.`}
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
            label={activeOption ? `Delete ${activeOption.title}` : 'Delete service'}
            onPress={() => actions.removeServiceOffering({
              serviceId,
              serviceName,
              optionId: activeOption?.id || savedServiceOffering?.optionId || '',
              offeringId: savedServiceOffering?.offeringId || '',
            }).then(() => goBack('ServicesOffered'))}
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
  optionList: {
    gap: 10,
  },
  optionCard: {
    backgroundColor: '#ffffff',
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 1,
    padding: 14,
  },
  optionCardSelected: {
    backgroundColor: '#fff8fc',
    borderColor: colors.brandDark,
    borderWidth: 2,
  },
  optionHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  optionCopy: {
    flex: 1,
    gap: 4,
  },
  optionTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '800',
  },
  optionDescription: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
  },
  optionPrice: {
    color: colors.brandDark,
    fontSize: 12,
    fontWeight: '800',
  },
});
