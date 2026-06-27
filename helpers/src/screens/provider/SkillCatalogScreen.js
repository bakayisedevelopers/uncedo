import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card, SectionHeading, StatusBadge } from '../../components/app/HelperUi';
import { SERVICE_CATALOG } from '../../constants/serviceCatalog';
import { useHelpersApp } from '../../context/HelpersAppContext';
import { colors } from '../../theme/colors';

export function SkillCatalogScreen({ navigate, goBack }) {
  const { helperSkills } = useHelpersApp();

  const catalogSkills = useMemo(
    () => SERVICE_CATALOG.flatMap((service) => (
      service.skills.map((skillName) => ({
        id: `${service.id}_${skillName}`,
        serviceId: service.id,
        serviceName: service.name,
        serviceDescription: service.description,
        skillName,
      }))
    )),
    [],
  );

  const existingSkillMap = useMemo(() => new Map(
    helperSkills.map((skill) => [`${skill.serviceId}_${skill.name}`, skill]),
  ), [helperSkills]);

  return (
    <ScrollView contentContainerStyle={styles.wrap} showsVerticalScrollIndicator={false}>
      <Pressable accessibilityRole="button" onPress={() => goBack('ServicesOffered')} style={styles.backRow}>
        <Ionicons color={colors.brandDark} name="chevron-back" size={18} />
        <Text style={styles.backText}>Back to skills</Text>
      </Pressable>

      <View style={styles.header}>
        <Text style={styles.eyebrow}>Helper</Text>
        <Text style={styles.title}>Add skill</Text>
        <Text style={styles.description}>
          Choose a skill from the approved catalog, then upload a work picture on the next page to activate it.
        </Text>
      </View>

      <Card>
        <SectionHeading
          title="Available skills"
          subtitle="Each skill belongs to one service category. If you already added a skill, you can still open it and update its pictures."
        />
      </Card>

      {catalogSkills.map((item) => {
        const existing = existingSkillMap.get(item.id);
        return (
          <Pressable
            accessibilityRole="button"
            key={item.id}
            onPress={() => navigate({
              key: 'SkillDetails',
              params: {
                parentTab: 'Profile',
                serviceId: item.serviceId,
                skillName: item.skillName,
                mode: existing ? 'edit' : 'create',
              },
            })}
            style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          >
            <View style={styles.rowIcon}>
              <Ionicons color={colors.brandDark} name="briefcase-outline" size={18} />
            </View>
            <View style={styles.rowBody}>
              <Text style={styles.rowTitle}>{item.skillName}</Text>
              <Text style={styles.rowDescription}>{item.serviceName}</Text>
            </View>
            {existing ? <StatusBadge label="Added" tone="success" /> : <StatusBadge label="Add" tone="info" />}
          </Pressable>
        );
      })}
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
  row: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 22,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    padding: 14,
  },
  rowPressed: {
    transform: [{ scale: 0.99 }],
  },
  rowIcon: {
    alignItems: 'center',
    backgroundColor: '#fff8fc',
    borderRadius: 16,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  rowBody: {
    flex: 1,
    gap: 2,
  },
  rowTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '800',
  },
  rowDescription: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
  },
});
