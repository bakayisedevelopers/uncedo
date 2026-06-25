import {
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { useHelpersApp } from '../../context/HelpersAppContext';
import { colors } from '../../theme/colors';
import {
  getServiceRequestProgress,
  getServiceRequestStatusMeta,
  getServiceRequestToneStyle,
} from '../../utils/serviceRequestStatus';

function formatCurrency(value) {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount) || amount <= 0) return 'Pending quote';
  return `R${Math.round(amount)}`;
}

function formatTimingLabel(request) {
  const timingPreference = request?.requestPayload?.timingPreference || 'now';
  const scheduledForText = request?.requestPayload?.scheduledForText || '';
  if (timingPreference === 'later') {
    return scheduledForText || 'Scheduled for later';
  }
  return 'Now / as soon as possible';
}

function formatCustomerLabel(request) {
  return request?.customerName || 'Customer not available';
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function BackButton({ onPress }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.backBtn, pressed && styles.backBtnPressed]}
    >
      <Ionicons color={colors.brandDark} name="chevron-back" size={18} />
      <Text style={styles.backText}>Back to services</Text>
    </Pressable>
  );
}

function HeroBanner({ statusMeta, toneStyle, request }) {
  return (
    <View style={[styles.heroBanner, { borderColor: toneStyle.backgroundColor }]}>
      <View style={[styles.heroBannerAccent, { backgroundColor: toneStyle.backgroundColor }]} />
      <View style={styles.heroBannerContent}>
        <Text style={styles.kicker}>Job details</Text>
        <Text style={styles.heroTitle}>{statusMeta.title}</Text>
        <Text style={styles.heroCopy}>{request.statusDetail || statusMeta.description}</Text>
        <View style={[styles.statusPill, { backgroundColor: toneStyle.backgroundColor }]}>
          <Text style={[styles.statusPillText, { color: toneStyle.textColor }]}>
            {statusMeta.badge}
          </Text>
        </View>
      </View>
    </View>
  );
}

function ProgressStepper({ steps }) {
  return (
    <View style={styles.stepperWrap}>
      {steps.map((step, index) => {
        const isLast = index === steps.length - 1;
        const isComplete = step.state === 'complete';
        const isCurrent = step.state === 'current';
        return (
          <View key={step.id} style={styles.stepRow}>
            {/* Connector line column */}
            <View style={styles.stepTrack}>
              <View
                style={[
                  styles.stepDot,
                  isComplete && styles.stepDotComplete,
                  isCurrent && styles.stepDotCurrent,
                ]}
              >
                {isComplete ? (
                  <Ionicons color="#ffffff" name="checkmark" size={10} />
                ) : isCurrent ? (
                  <View style={styles.stepDotInner} />
                ) : null}
              </View>
              {!isLast && (
                <View style={[styles.stepLine, isComplete && styles.stepLineComplete]} />
              )}
            </View>
            {/* Label column */}
            <View style={styles.stepLabel}>
              <Text
                style={[
                  styles.stepText,
                  isComplete && styles.stepTextComplete,
                  isCurrent && styles.stepTextCurrent,
                  step.state === 'upcoming' && styles.stepTextUpcoming,
                ]}
              >
                {step.label}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

function CustomerCard({ request }) {
  const name = formatCustomerLabel(request);
  const initials = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase() || 'C';

  return (
    <View style={styles.customerCard}>
      <View style={styles.customerAvatarFallback}>
        <Text style={styles.customerAvatarInitials}>{initials}</Text>
      </View>
      <View style={styles.customerInfo}>
        <Text style={styles.customerName}>{name}</Text>
        <Text style={styles.customerCaption}>Customer who made this request</Text>
      </View>
      <View style={styles.customerBadge}>
        <Ionicons color={colors.brandDark} name="person-circle" size={16} />
        <Text style={styles.customerBadgeText}>Customer</Text>
      </View>
    </View>
  );
}

function DetailGrid({ rows }) {
  return (
    <View style={styles.detailGrid}>
      {rows.map(({ label, value }) => (
        <View key={label} style={styles.detailCell}>
          <Text style={styles.detailLabel}>{label}</Text>
          <Text style={styles.detailValue}>{value}</Text>
        </View>
      ))}
    </View>
  );
}

function PricingBreakdown({ lines, total }) {
  return (
    <View style={styles.pricingWrap}>
      {lines.map((line, index) => (
        <View key={`${line.label}-${index}`} style={styles.pricingRow}>
          <Text style={styles.pricingLabel}>{line.label || 'Charge'}</Text>
          <Text style={styles.pricingValue}>{formatCurrency(line.amount)}</Text>
        </View>
      ))}
      <View style={styles.pricingDivider} />
      <View style={styles.pricingRow}>
        <Text style={styles.pricingTotalLabel}>Total</Text>
        <Text style={styles.pricingTotalValue}>{formatCurrency(total)}</Text>
      </View>
    </View>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────

export function JobDetailsScreen({ route, goBack }) {
  const { serviceRequests } = useHelpersApp();
  const requestId = route?.params?.requestId || '';

  const request = useMemo(
    () => serviceRequests.find((item) => item.id === requestId) || null,
    [requestId, serviceRequests],
  );

  const statusMeta = useMemo(
    () => getServiceRequestStatusMeta(request?.status),
    [request?.status],
  );
  const toneStyle = useMemo(
    () => getServiceRequestToneStyle(request?.status),
    [request?.status],
  );
  const progressSteps = useMemo(
    () => getServiceRequestProgress(request?.status),
    [request?.status],
  );
  const pricingLines = Array.isArray(request?.pricingSnapshot?.lines)
    ? request.pricingSnapshot.lines
    : [];

  const detailRows = request
    ? [
        { label: 'Category', value: request.categoryId || 'Not selected yet' },
        { label: 'Services', value: request.title || 'Not selected yet' },
        { label: 'Timing', value: formatTimingLabel(request) },
        {
          label: 'Address',
          value: request.requestPayload?.serviceAddress || request.address || 'Not saved yet',
        },
        {
          label: 'Estimate',
          value: formatCurrency(request.pricingSnapshot?.total || request.totalAmount),
        },
        { label: 'Customer', value: formatCustomerLabel(request) },
      ]
    : [];

  const nextUpdateText = !request
    ? ''
    : request.status === 'matching'
    ? 'This request is still matching and will update as soon as a helper is selected.'
    : request.status === 'no_helper_available'
    ? 'No helper accepted yet. Matching will continue as more helpers come online.'
    : request.status === 'scheduled_pending'
    ? 'This request is scheduled for later. Matching will begin closer to the requested time.'
    : request.status === 'accepted'
    ? 'The accepted request will update again once travel begins.'
    : request.status === 'en_route'
    ? 'Arrival updates will appear here as the helper gets closer.'
    : request.status === 'arrived'
    ? 'The helper is at the location.'
    : request.statusDetail || statusMeta.description;

  if (!request) {
    return (
      <View style={styles.missingWrap}>
        <View style={styles.missingIconWrap}>
          <Ionicons color={colors.muted} name="document-outline" size={36} />
        </View>
        <Text style={styles.missingTitle}>Service request not found</Text>
        <Text style={styles.missingCopy}>We could not find this service request.</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.wrap} showsVerticalScrollIndicator={false}>

        {/* ── Back button ── */}
        <BackButton onPress={() => goBack('Services')} />

        {/* ── Hero banner ── */}
        <HeroBanner statusMeta={statusMeta} toneStyle={toneStyle} request={request} />

        {/* ── Progress stepper ── */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionIconWrap}>
              <Ionicons color={colors.brandDark} name="navigate-circle-outline" size={18} />
            </View>
            <Text style={styles.sectionTitle}>Progress</Text>
          </View>
          <ProgressStepper steps={progressSteps} />
        </View>

        {/* ── Request details ── */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionIconWrap}>
              <Ionicons color={colors.brandDark} name="document-text-outline" size={18} />
            </View>
            <Text style={styles.sectionTitle}>Request details</Text>
          </View>
          <CustomerCard request={request} />
          <DetailGrid rows={detailRows} />
        </View>

        {/* ── Pricing breakdown ── */}
        {pricingLines.length ? (
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionIconWrap}>
                <Ionicons color={colors.brandDark} name="receipt-outline" size={18} />
              </View>
              <Text style={styles.sectionTitle}>Estimate breakdown</Text>
            </View>
            <PricingBreakdown
              lines={pricingLines}
              total={request.pricingSnapshot?.total || request.totalAmount}
            />
          </View>
        ) : null}

        {/* ── Next update ── */}
        <View style={[styles.sectionCard, styles.nextUpdateCard]}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionIconWrap}>
              <Ionicons color={colors.brandDark} name="time-outline" size={18} />
            </View>
            <Text style={styles.sectionTitle}>Next update</Text>
          </View>
          <Text style={styles.nextUpdateText}>{nextUpdateText}</Text>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: colors.background,
    flex: 1,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 0) : 0,
  },
  wrap: {
    gap: 14,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 36,
  },

  // ── Missing state ────────────────────────────────────────────────────────
  missingWrap: {
    alignItems: 'center',
    flex: 1,
    gap: 10,
    justifyContent: 'center',
    padding: 24,
  },
  missingIconWrap: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderRadius: 999,
    height: 72,
    justifyContent: 'center',
    marginBottom: 4,
    width: 72,
  },
  missingTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '900',
    textAlign: 'center',
  },
  missingCopy: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },

  // ── Back button ──────────────────────────────────────────────────────────
  backBtn: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  backBtnPressed: {
    opacity: 0.7,
    transform: [{ scale: 0.97 }],
  },
  backText: {
    color: colors.brandDark,
    fontSize: 13,
    fontWeight: '800',
  },

  // ── Hero banner ──────────────────────────────────────────────────────────
  heroBanner: {
    backgroundColor: colors.surface,
    borderRadius: 28,
    borderWidth: 1.5,
    overflow: 'hidden',
  },
  heroBannerAccent: {
    height: 4,
    width: '100%',
  },
  heroBannerContent: {
    gap: 8,
    padding: 20,
  },
  kicker: {
    color: colors.brandDark,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.6,
    textTransform: 'uppercase',
  },
  heroTitle: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '900',
    lineHeight: 34,
  },
  heroCopy: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
  },
  statusPill: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    marginTop: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
  },

  // ── Section cards ────────────────────────────────────────────────────────
  sectionCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 28,
    borderWidth: 1,
    elevation: 3,
    gap: 14,
    padding: 18,
    shadowColor: '#1f1724',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.05,
    shadowRadius: 14,
  },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  sectionIconWrap: {
    alignItems: 'center',
    backgroundColor: colors.brandSoft,
    borderRadius: 12,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '900',
  },
  nextUpdateCard: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
  },
  nextUpdateText: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 22,
  },

  // ── Progress stepper ─────────────────────────────────────────────────────
  stepperWrap: {
    gap: 0,
    paddingLeft: 4,
  },
  stepRow: {
    flexDirection: 'row',
    gap: 14,
    minHeight: 36,
  },
  stepTrack: {
    alignItems: 'center',
    width: 20,
  },
  stepDot: {
    alignItems: 'center',
    backgroundColor: colors.border,
    borderRadius: 999,
    height: 20,
    justifyContent: 'center',
    width: 20,
  },
  stepDotComplete: {
    backgroundColor: colors.brand,
  },
  stepDotCurrent: {
    backgroundColor: colors.surface,
    borderColor: colors.brand,
    borderWidth: 2.5,
  },
  stepDotInner: {
    backgroundColor: colors.brand,
    borderRadius: 999,
    height: 8,
    width: 8,
  },
  stepLine: {
    backgroundColor: colors.border,
    flex: 1,
    marginVertical: 2,
    width: 2,
  },
  stepLineComplete: {
    backgroundColor: colors.brand,
  },
  stepLabel: {
    flex: 1,
    justifyContent: 'center',
    paddingBottom: 12,
    paddingTop: 2,
  },
  stepText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  stepTextComplete: {
    color: colors.brandDark,
  },
  stepTextCurrent: {
    color: colors.brand,
    fontWeight: '900',
  },
  stepTextUpcoming: {
    color: colors.muted,
    fontWeight: '500',
  },

  // ── Customer card ────────────────────────────────────────────────────────
  customerCard: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: 20,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    padding: 14,
  },
  customerAvatarFallback: {
    alignItems: 'center',
    backgroundColor: colors.brandSoft,
    borderColor: colors.border,
    borderRadius: 22,
    borderWidth: 1,
    height: 54,
    justifyContent: 'center',
    width: 54,
  },
  customerAvatarInitials: {
    color: colors.brandDark,
    fontSize: 18,
    fontWeight: '900',
  },
  customerInfo: {
    flex: 1,
    gap: 3,
  },
  customerName: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '800',
  },
  customerCaption: {
    color: colors.muted,
    fontSize: 12,
  },
  customerBadge: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 4,
  },
  customerBadgeText: {
    color: colors.brandDark,
    fontSize: 12,
    fontWeight: '800',
  },

  // ── Detail grid ───────────────────────────────────────────────────────────
  detailGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  detailCell: {
    flex: 1,
    gap: 4,
    minWidth: '45%',
  },
  detailLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  detailValue: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
  },

  // ── Pricing ───────────────────────────────────────────────────────────────
  pricingWrap: {
    gap: 10,
  },
  pricingRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  pricingLabel: {
    color: colors.muted,
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    paddingRight: 12,
  },
  pricingValue: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  pricingDivider: {
    backgroundColor: colors.border,
    height: 1,
    marginVertical: 4,
  },
  pricingTotalLabel: {
    color: colors.text,
    flex: 1,
    fontSize: 16,
    fontWeight: '900',
  },
  pricingTotalValue: {
    color: colors.brandDark,
    fontSize: 16,
    fontWeight: '900',
  },
});
