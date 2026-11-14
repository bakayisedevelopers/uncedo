import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card, SectionHeading, StatusBadge } from '../../components/app/HelperUi';
import { buildHelperServiceCatalog } from '../../services/serviceCatalogService';
import { useHelpersApp } from '../../context/HelpersAppContext';
import { colors } from '../../theme/colors';

function slugify(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function ServiceOfferingCatalogScreen({ navigate, goBack }) {
  const { helperServiceOfferings, serviceCatalog } = useHelpersApp();

  const catalogGroups = useMemo(
    () => buildHelperServiceCatalog(serviceCatalog),
    [serviceCatalog],
  );

  const catalogServiceOfferings = useMemo(
    () => catalogGroups.flatMap((service) => (
      service.services.map((entry) => ({
        id: entry.id,
        serviceId: entry.id,
        categoryId: service.id,
        serviceName: entry.label,
        serviceDescription: entry.description || service.description,
        active: entry.active !== false,
        type: entry.type || 'service',
        optionsCount: Array.isArray(entry.options) ? entry.options.length : 0,
        optionApplicationMode: entry.optionApplicationMode || 'per_option',
      }))
    )),
    [catalogGroups],
  );

  const offeringsByServiceId = useMemo(() => {
    const grouped = new Map();
    helperServiceOfferings.forEach((offering) => {
      const key = String(offering.serviceId || '').trim().toLowerCase();
      if (!key) return;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(offering);
    });
    return grouped;
  }, [helperServiceOfferings]);

  return (
    <ScrollView contentContainerStyle={styles.wrap} showsVerticalScrollIndicator={false}>
      <Pressable accessibilityRole="button" onPress={() => goBack('ServicesOffered')} style={styles.backRow}>
        <Ionicons color={colors.brandDark} name="chevron-back" size={18} />
        <Text style={styles.backText}>Back to offerings</Text>
      </Pressable>

      <View style={styles.header}>
        <Text style={styles.eyebrow}>Helper</Text>
        <Text style={styles.title}>Add service</Text>
        <Text style={styles.description}>
          Choose from the live catalog that the admin team has published. Select the specific options you offer and upload your work pictures for approval.
        </Text>
      </View>

      <Card>
        <SectionHeading
          title="Available services"
          subtitle="Services with configurable options let you apply and upload work proof per option."
        />
      </Card>

      {catalogServiceOfferings.length ? catalogServiceOfferings.map((item) => {
        const existingList = offeringsByServiceId.get(String(item.serviceId || '').toLowerCase()) || [];
        const approvedCount = existingList.filter((entry) => entry.status === 'approved').length;
        const badgeLabel = existingList.length
          ? (item.optionsCount > 0 && item.optionApplicationMode !== 'unified'
            ? `${approvedCount}/${item.optionsCount} approved`
            : (approvedCount > 0 ? 'Approved' : 'Pending'))
          : 'Add';
        const badgeTone = approvedCount > 0 ? 'success' : existingList.length ? 'warning' : 'info';
        return (
          <Pressable
            accessibilityRole="button"
            key={item.id}
            onPress={() => navigate({
              key: 'ServiceOfferingDetails',
              params: {
                parentTab: 'Profile',
                serviceId: item.serviceId,
                categoryId: item.categoryId,
                serviceName: item.serviceName,
                mode: existingList.length ? 'edit' : 'create',
              },
            })}
            style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          >
            <View style={styles.rowIcon}>
              <Ionicons color={colors.brandDark} name="briefcase-outline" size={18} />
            </View>
            <View style={styles.rowBody}>
              <Text style={styles.rowTitle}>{item.serviceName}</Text>
              <Text style={styles.rowDescription}>
                {item.optionsCount > 0
                  ? `${item.optionsCount} option${item.optionsCount === 1 ? '' : 's'}${item.optionApplicationMode === 'unified' ? ' · unified approval' : ' · choose options'}`
                  : (item.type === 'bundle' ? 'Bundle service' : item.serviceDescription || item.serviceName)}
              </Text>
            </View>
            <StatusBadge label={badgeLabel} tone={badgeTone} />
          </Pressable>
        );
      }) : (
        <Card>
          <Text style={styles.emptyTitle}>No live services yet</Text>
          <Text style={styles.emptyCopy}>Once the admin publishes services, they will appear here for you to add to your profile.</Text>
        </Card>
      )}
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
  emptyTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '900',
  },
  emptyCopy: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 20,
    marginTop: 6,
  },
});
