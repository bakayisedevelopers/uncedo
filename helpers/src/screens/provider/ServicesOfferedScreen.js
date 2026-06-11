import { useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { ActionButton, Card, EmptyState, Screen, SectionHeading, StatusBadge } from '../../components/app/HelperUi';
import { SERVICE_CATALOG } from '../../constants/serviceCatalog';
import { useHelpersApp } from '../../context/HelpersAppContext';
import { colors } from '../../theme/colors';

export function ServicesOfferedScreen({ onClose }) {
  const { profile, actions, saving, saveError } = useHelpersApp();
  const [drafts, setDrafts] = useState({});
  const [message, setMessage] = useState('');

  const activeServices = useMemo(() => profile.services || [], [profile.services]);

  const updateDraft = (serviceId, field, value) => {
    setDrafts((current) => ({
      ...current,
      [serviceId]: {
        ...(current[serviceId] || {}),
        [field]: value,
      },
    }));
  };

  const handleAddSkill = async (serviceId, skillName) => {
    const draft = drafts[serviceId] || {};
    const result = await actions.addSkillPicture({
      serviceId,
      skillName,
      pictureUri: draft.pictureUri,
    });
    setMessage(result.message);
    if (result.success) {
      setDrafts((current) => ({
        ...current,
        [serviceId]: {
          pictureUri: '',
        },
      }));
    }
  };

  return (
    <Screen
      eyebrow="Helper"
      title="Services & Skills"
      description="This mirrors the tutor qualification flow, but replaces subjects with services, topics with skills, and result documents with work photos tied to each skill."
      footerAction={<ActionButton label="Close" onPress={onClose} tone="secondary" />}
    >
      <Card>
        <SectionHeading
          title="Service rule"
          subtitle="A helper skill only becomes part of your profile once it has at least one linked work photo. Services can hold multiple skills, and each skill keeps its own gallery."
        />
        <StatusBadge label="Work photos required" tone="warning" />
        {message ? <Text style={styles.message}>{message}</Text> : null}
        {saveError ? <Text style={styles.error}>{saveError}</Text> : null}
      </Card>

      {!activeServices.length ? (
        <Card>
          <EmptyState
            title="No active services yet"
            description="Add a service skill and a linked work photo to make your helper profile eligible for matching."
          />
        </Card>
      ) : null}

      {SERVICE_CATALOG.map((service) => {
        const selected = activeServices.find((item) => item.serviceId === service.id);
        const draft = drafts[service.id] || {};
        return (
          <Card key={service.id}>
            <SectionHeading
              title={service.name}
              subtitle={service.description}
              action={selected ? <StatusBadge label={`${selected.skills.length} skill${selected.skills.length === 1 ? '' : 's'} active`} tone="success" /> : null}
            />

            <TextInput
              placeholder="Paste a work photo URL before adding a skill"
              placeholderTextColor={colors.muted}
              value={draft.pictureUri || ''}
              onChangeText={(value) => updateDraft(service.id, 'pictureUri', value)}
              style={styles.input}
            />

            <View style={styles.skillButtons}>
              {service.skills.map((skill) => (
                <Pressable
                  key={skill}
                  accessibilityRole="button"
                  onPress={() => handleAddSkill(service.id, skill)}
                  style={styles.skillButton}
                  disabled={saving}
                >
                  <Text style={styles.skillButtonLabel}>Add {skill}</Text>
                </Pressable>
              ))}
            </View>

            {selected ? (
              <View style={styles.skillGroups}>
                {selected.skills.map((skill) => (
                  <View key={`${service.id}_${skill.name}`} style={styles.skillCard}>
                    <View style={styles.skillCardTop}>
                      <View style={styles.skillCopy}>
                        <Text style={styles.skillTitle}>{skill.name}</Text>
                        <Text style={styles.skillSubtitle}>{skill.pictures.length} linked work photo{skill.pictures.length === 1 ? '' : 's'}</Text>
                      </View>
                      <ActionButton
                        label="Remove skill"
                        tone="danger"
                        onPress={() => actions.removeSkill({ serviceId: service.id, skillName: skill.name })}
                        disabled={saving}
                      />
                    </View>

                    <View style={styles.pictureGrid}>
                      {skill.pictures.map((picture) => (
                        <View key={picture.id} style={styles.pictureCard}>
                          <Image source={{ uri: picture.uri }} style={styles.picturePreview} resizeMode="cover" />
                          <Text numberOfLines={1} style={styles.pictureUri}>{picture.uri}</Text>
                          <ActionButton
                            label="Remove photo"
                            tone="secondary"
                            onPress={() => actions.removeSkillPicture({
                              serviceId: service.id,
                              skillName: skill.name,
                              pictureId: picture.id,
                            })}
                            disabled={saving}
                          />
                        </View>
                      ))}
                    </View>
                  </View>
                ))}
              </View>
            ) : (
              <EmptyState
                title="No skills saved for this service"
                description="Add one of the service skills above with a work photo URL to activate this service."
              />
            )}
          </Card>
        );
      })}
    </Screen>
  );
}

const styles = StyleSheet.create({
  message: {
    color: colors.brandDark,
    fontSize: 13,
    fontWeight: '700',
  },
  error: {
    color: '#b91c1c',
    fontSize: 13,
    fontWeight: '700',
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
  skillButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  skillButton: {
    backgroundColor: '#f8fafc',
    borderColor: colors.border,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  skillButtonLabel: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '800',
  },
  skillGroups: {
    gap: 12,
  },
  skillCard: {
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 1,
    gap: 12,
    padding: 12,
  },
  skillCardTop: {
    alignItems: 'flex-start',
    gap: 12,
  },
  skillCopy: {
    gap: 4,
  },
  skillTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '900',
  },
  skillSubtitle: {
    color: colors.muted,
    fontSize: 12,
  },
  pictureGrid: {
    gap: 10,
  },
  pictureCard: {
    backgroundColor: '#f8fafc',
    borderColor: colors.border,
    borderRadius: 16,
    borderWidth: 1,
    gap: 8,
    overflow: 'hidden',
    padding: 8,
  },
  picturePreview: {
    borderRadius: 12,
    height: 140,
    width: '100%',
  },
  pictureUri: {
    color: colors.muted,
    fontSize: 11,
  },
});
