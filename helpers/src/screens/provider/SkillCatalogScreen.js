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
        }))
    )),
    [catalogGroups],
  );

  const existingServiceOfferingMap = useMemo(() => new Map(
    helperServiceOfferings.flatMap((offering) => ([
      [String(offering.serviceId || '').trim().toLowerCase(), offering],
      [slugify(offering.serviceName), offering],
      [slugify(`${offering.serviceId || ''}_${offering.serviceName || ''}`), offering],
    ])).filter(([key]) => Boolean(key)),
  ), [helperServiceOfferings]);

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
          Choose from the live catalog that the admin team has published. Each service opens the next page where you upload the work pictures and submit it for approval.
        </Text>
      </View>

      <Card>
        <SectionHeading
          title="Available services"
          subtitle="Only services that the admin has published appear here. If you already added a service, you can still open it and update its pictures."
        />
      </Card>

      {catalogServiceOfferings.length ? catalogServiceOfferings.map((item) => {
        const existing = existingServiceOfferingMap.get(item.serviceId);
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
                mode: existing ? 'edit' : 'create',
              },
            })}
            style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          >
            <View style={styles.rowIcon}>
              <Ionicons color={colors.brandDark} name="briefcase-outline" size={18} />
            </View>
            <View style={styles.rowBody}>
              <Text style={styles.rowTitle}>{item.serviceName}</Text>
              <Text style={styles.rowDescription}>{item.serviceName}{item.type === 'bundle' ? ' • bundle' : ''}</Text>
            </View>
            {existing ? (
              <StatusBadge label={existing.status === 'approved' ? 'Approved' : 'Pending'} tone={existing.status === 'approved' ? 'success' : 'warning'} />
            ) : (
              <StatusBadge label="Add" tone="info" />
            )}
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
