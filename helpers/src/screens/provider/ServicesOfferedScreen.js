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
  const { helperServiceOfferings, actions, saving, saveError } = useHelpersApp();
  const orderedServiceOfferings = [...helperServiceOfferings].sort((left, right) => (
    `${left.serviceName}`.localeCompare(`${right.serviceName}`)
  ));

  return (
    <ScrollView contentContainerStyle={styles.wrap} showsVerticalScrollIndicator={false}>
      <Pressable accessibilityRole="button" onPress={() => goBack('Profile')} style={styles.backRow}>
        <Ionicons color={colors.brandDark} name="chevron-back" size={18} />
        <Text style={styles.backText}>Back to profile</Text>
      </Pressable>

      <View style={styles.header}>
        <Text style={styles.eyebrow}>Helper</Text>
        <Text style={styles.title}>ServiceOfferings</Text>
        <Text style={styles.description}>
          Manage the services you offer, keep them active or paused, and open each service to update its work portfolio.
        </Text>
      </View>

      <Card>
        <SectionHeading
          title="Service rules"
          subtitle="Every helper service needs at least one uploaded work picture and must be approved by the admin before it can go live."
        />
        <ActionButton label="Add service" onPress={() => navigate({ key: 'ServiceOfferingCatalog', params: { parentTab: 'Profile' } })} />
        {saveError ? <Text style={styles.error}>{saveError}</Text> : null}
      </Card>

      {!orderedServiceOfferings.length ? (
        <Card>
          <EmptyState
            title="No services added yet"
            description="Add a helper service, upload work pictures, and it will appear here with its status and availability switch."
          />
        </Card>
      ) : null}

      {orderedServiceOfferings.map((offering) => (
        <View key={offering.id} style={styles.offeringRow}>
          <Pressable
            accessibilityRole="button"
            onPress={() => navigate({
              key: 'ServiceOfferingDetails',
              params: {
                parentTab: 'Profile',
                serviceId: offering.serviceId,
                serviceName: offering.serviceName,
              },
            })}
            style={({ pressed }) => [styles.offeringRowPressable, pressed && styles.rowPressed]}
          >
            <View style={styles.offeringIcon}>
              <Ionicons color={colors.brandDark} name="sparkles-outline" size={18} />
            </View>
            <View style={styles.offeringBody}>
              <Text style={styles.offeringTitle}>{offering.serviceName}</Text>
              <Text style={styles.offeringSubtitle}>{offering.serviceName}</Text>
              <Text style={styles.offeringMeta}>
                {offering.photos.length} work photo{offering.photos.length === 1 ? '' : 's'}
              </Text>
              <View style={styles.badgeRow}>
                <StatusBadge label={formatStatusLabel(offering.status)} tone={offering.status === 'approved' ? 'success' : 'warning'} />
                <StatusBadge label={offering.active ? 'Active' : 'Paused'} tone={offering.active ? 'info' : 'neutral'} />
              </View>
            </View>
          </Pressable>

          <View style={styles.switchWrap}>
            <Text style={styles.switchLabel}>{offering.active ? 'On' : 'Off'}</Text>
            <Switch
              disabled={saving || offering.status !== 'approved'}
              onValueChange={(value) => actions.toggleServiceOfferingActive({
                serviceId: offering.serviceId,
                serviceName: offering.serviceName,
                active: value,
              })}
              thumbColor="#ffffff"
              trackColor={{ false: '#d1d5db', true: '#22c55e' }}
              value={offering.active}
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
  offeringRow: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 24,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    padding: 14,
  },
  offeringRowPressable: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 12,
  },
  rowPressed: {
    transform: [{ scale: 0.99 }],
  },
  offeringIcon: {
    alignItems: 'center',
    backgroundColor: '#fff8fc',
    borderRadius: 16,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  offeringBody: {
    flex: 1,
    gap: 3,
  },
  offeringTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '800',
  },
  offeringSubtitle: {
    color: colors.brandDark,
    fontSize: 12,
    fontWeight: '700',
  },
  offeringMeta: {
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
