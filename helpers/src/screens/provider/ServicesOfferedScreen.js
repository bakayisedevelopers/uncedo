import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ActionButton, Card, EmptyState, SectionHeading, StatusBadge } from '../../components/app/HelperUi';
import { useHelpersApp } from '../../context/HelpersAppContext';
import { colors } from '../../theme/colors';

function formatStatusLabel(status = 'approved') {
  const normalized = String(status || 'approved').toLowerCase();
  if (normalized === 'approved') return 'Approved';
  if (normalized === 'pending') return 'Pending';
  if (normalized === 'rejected') return 'Rejected';
  return 'Saved';
}

export function ServicesOfferedScreen({ navigate, goBack }) {
  const { helperSkills, actions, saving, saveError } = useHelpersApp();
  const orderedSkills = [...helperSkills].sort((left, right) => (
    `${left.serviceName}-${left.name}`.localeCompare(`${right.serviceName}-${right.name}`)
  ));

  return (
    <ScrollView contentContainerStyle={styles.wrap} showsVerticalScrollIndicator={false}>
      <Pressable accessibilityRole="button" onPress={() => goBack('Profile')} style={styles.backRow}>
        <Ionicons color={colors.brandDark} name="chevron-back" size={18} />
        <Text style={styles.backText}>Back to profile</Text>
      </Pressable>

      <View style={styles.header}>
        <Text style={styles.eyebrow}>Helper</Text>
        <Text style={styles.title}>Skills</Text>
        <Text style={styles.description}>
          Manage the skills you offer, keep them active or paused, and open each skill to update its work portfolio.
        </Text>
      </View>

      <Card>
        <SectionHeading
          title="Skill rules"
          subtitle="Every helper skill needs at least one uploaded work picture. Newly added skills are auto-approved for now."
        />
        <ActionButton label="Add skill" onPress={() => navigate({ key: 'SkillCatalog', params: { parentTab: 'Profile' } })} />
        {saveError ? <Text style={styles.error}>{saveError}</Text> : null}
      </Card>

      {!orderedSkills.length ? (
        <Card>
          <EmptyState
            title="No skills added yet"
            description="Add a helper skill, upload a work picture, and it will appear here with its status and availability switch."
          />
        </Card>
      ) : null}

      {orderedSkills.map((skill) => (
        <View key={skill.id} style={styles.skillRow}>
          <Pressable
            accessibilityRole="button"
            onPress={() => navigate({
              key: 'SkillDetails',
              params: {
                parentTab: 'Profile',
                serviceId: skill.serviceId,
                skillName: skill.name,
              },
            })}
            style={({ pressed }) => [styles.skillRowPressable, pressed && styles.rowPressed]}
          >
            <View style={styles.skillIcon}>
              <Ionicons color={colors.brandDark} name="sparkles-outline" size={18} />
            </View>
            <View style={styles.skillBody}>
              <Text style={styles.skillTitle}>{skill.name}</Text>
              <Text style={styles.skillSubtitle}>{skill.serviceName}</Text>
              <Text style={styles.skillMeta}>
                {skill.pictures.length} work photo{skill.pictures.length === 1 ? '' : 's'}
              </Text>
              <View style={styles.badgeRow}>
                <StatusBadge label={formatStatusLabel(skill.status)} tone={skill.status === 'approved' ? 'success' : 'warning'} />
                <StatusBadge label={skill.active ? 'Active' : 'Paused'} tone={skill.active ? 'info' : 'neutral'} />
              </View>
            </View>
          </Pressable>

          <View style={styles.switchWrap}>
            <Text style={styles.switchLabel}>{skill.active ? 'On' : 'Off'}</Text>
            <Switch
              disabled={saving}
              onValueChange={(value) => actions.toggleSkillActive({
                serviceId: skill.serviceId,
                skillName: skill.name,
                active: value,
              })}
              thumbColor="#ffffff"
              trackColor={{ false: '#d1d5db', true: '#22c55e' }}
              value={skill.active}
            />
          </View>
        </View>
      ))}
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
  error: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: '700',
  },
  skillRow: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 24,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    padding: 14,
  },
  skillRowPressable: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 12,
  },
  rowPressed: {
    transform: [{ scale: 0.99 }],
  },
  skillIcon: {
    alignItems: 'center',
    backgroundColor: '#fff8fc',
    borderRadius: 16,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  skillBody: {
    flex: 1,
    gap: 3,
  },
  skillTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '800',
  },
  skillSubtitle: {
    color: colors.brandDark,
    fontSize: 12,
    fontWeight: '700',
  },
  skillMeta: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  switchWrap: {
    alignItems: 'center',
    gap: 4,
  },
  switchLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
});
