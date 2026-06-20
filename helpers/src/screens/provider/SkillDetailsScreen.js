import { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ActionButton, Card, EmptyState, SectionHeading, StatusBadge } from '../../components/app/HelperUi';
import { getServiceById } from '../../constants/serviceCatalog';
import { useHelpersApp } from '../../context/HelpersAppContext';
import { pickSkillImageFromLibrary } from '../../services/imagePickerService';
import { colors } from '../../theme/colors';

function formatStatusLabel(status = 'approved') {
  const normalized = String(status || 'approved').toLowerCase();
  if (normalized === 'approved') return 'Approved';
  if (normalized === 'pending') return 'Pending';
  if (normalized === 'rejected') return 'Rejected';
  return 'Saved';
}

export function SkillDetailsScreen({ route, goBack }) {
  const { helperSkills, actions, saving, saveError } = useHelpersApp();
  const serviceId = route?.params?.serviceId || '';
  const skillName = route?.params?.skillName || '';
  const mode = route?.params?.mode || 'edit';
  const [selectedAsset, setSelectedAsset] = useState(null);
  const [message, setMessage] = useState('');

  const service = getServiceById(serviceId);
  const savedSkill = useMemo(
    () => helperSkills.find((skill) => skill.serviceId === serviceId && skill.name === skillName) || null,
    [helperSkills, serviceId, skillName],
  );

  useEffect(() => {
    setSelectedAsset(null);
    setMessage('');
  }, [serviceId, skillName, mode]);

  const handleSelectImage = async () => {
    const asset = await pickSkillImageFromLibrary().catch((error) => {
      setMessage(error.message || 'Unable to select an image right now.');
      return null;
    });
    if (asset) {
      setSelectedAsset(asset);
      setMessage('');
    }
  };

  const handleSaveSkill = async () => {
    const result = await actions.addSkillWithPhoto({
      serviceId,
      skillName,
      imageAsset: selectedAsset,
    });
    setMessage(result?.message || '');
    if (result?.success) {
      setSelectedAsset(null);
    }
  };

  if (!serviceId || !skillName) {
    return (
      <ScrollView contentContainerStyle={styles.wrap} showsVerticalScrollIndicator={false}>
        <EmptyState title="Skill not found" description="This skill reference is missing." />
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.wrap} showsVerticalScrollIndicator={false}>
      <Pressable accessibilityRole="button" onPress={() => goBack('ServicesOffered')} style={styles.backRow}>
        <Ionicons color={colors.brandDark} name="chevron-back" size={18} />
        <Text style={styles.backText}>Back to skills</Text>
      </Pressable>

      <View style={styles.header}>
        <Text style={styles.eyebrow}>Helper skill</Text>
        <Text style={styles.title}>{skillName}</Text>
        <Text style={styles.description}>{service?.name || 'Skill category'}</Text>
      </View>

      <Card>
        <SectionHeading
          title="Skill status"
          subtitle="This skill becomes available for matching only when it is active and has at least one uploaded work picture."
          action={savedSkill ? <StatusBadge label={formatStatusLabel(savedSkill.status)} tone="success" /> : <StatusBadge label="New" tone="info" />}
        />
        {savedSkill ? (
          <View style={styles.toggleRow}>
            <View style={styles.toggleCopy}>
              <Text style={styles.toggleTitle}>Available for matching</Text>
              <Text style={styles.toggleDescription}>Turn this off if you do not want to receive requests for this skill right now.</Text>
            </View>
            <Switch
              disabled={saving}
              onValueChange={(value) => actions.toggleSkillActive({ serviceId, skillName, active: value })}
              thumbColor="#ffffff"
              trackColor={{ false: '#d1d5db', true: '#22c55e' }}
              value={savedSkill.active}
            />
          </View>
        ) : (
          <Text style={styles.copy}>Upload your first work picture to add this skill to your profile.</Text>
        )}
        {message ? <Text style={styles.message}>{message}</Text> : null}
        {saveError ? <Text style={styles.error}>{saveError}</Text> : null}
      </Card>

      <Card>
        <SectionHeading
          title={savedSkill ? 'Work portfolio' : 'Add first work picture'}
          subtitle="Pictures help customers trust the skill and are required before the skill can be offered."
        />
        {selectedAsset ? (
          <View style={styles.previewCard}>
            <Image resizeMode="cover" source={{ uri: selectedAsset.uri }} style={styles.previewImage} />
            <Text style={styles.previewName}>{selectedAsset.fileName || 'Selected image'}</Text>
          </View>
        ) : null}
        <View style={styles.actionRow}>
          <ActionButton label={selectedAsset ? 'Choose a different picture' : 'Upload picture'} onPress={handleSelectImage} tone="secondary" />
          {selectedAsset ? (
            <ActionButton label={saving ? 'Saving...' : savedSkill ? 'Save picture' : 'Save skill'} onPress={handleSaveSkill} disabled={saving} />
          ) : null}
        </View>
      </Card>

      {savedSkill ? (
        <Card>
          <SectionHeading title="Saved pictures" subtitle="Add more pictures or remove older ones from this skill." />
          {(savedSkill.pictures || []).length ? (
            <View style={styles.gallery}>
              {savedSkill.pictures.map((picture) => (
                <View key={picture.id} style={styles.galleryCard}>
                  <Image resizeMode="cover" source={{ uri: picture.uri }} style={styles.galleryImage} />
                  <ActionButton
                    label="Remove picture"
                    onPress={() => actions.removeSkillPicture({
                      serviceId,
                      skillName,
                      pictureId: picture.id,
                    })}
                    tone="secondary"
                    disabled={saving}
                  />
                </View>
              ))}
            </View>
          ) : (
            <EmptyState title="No pictures yet" description="Upload at least one picture so this skill stays available for matching." />
          )}
          <ActionButton
            label="Delete skill"
            onPress={() => actions.removeSkill({ serviceId, skillName }).then(() => goBack('ServicesOffered'))}
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
