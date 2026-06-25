import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Linking,
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
import { colors } from '../../theme/colors';
import {
  getServiceRequestProgress,
  getServiceRequestStatusMeta,
  getServiceRequestToneStyle,
} from '../../utils/serviceRequestStatus';
import { subscribeToServiceRequestById } from '../../services/customerServiceRequestService';
import { getCustomerServiceCategoryById, getCustomerServiceById } from '../../constants/serviceCatalog';

function formatCurrency(value) {
  const amount = Math.round(Number(value || 0));
  if (!Number.isFinite(amount) || amount <= 0) return 'Pending quote';
  return `R${amount}`;
}

function formatTimingLabel(request) {
  const timingPreference = request?.requestPayload?.timingPreference || 'now';
  const scheduledForText = request?.requestPayload?.scheduledForText || '';
  if (timingPreference === 'later') {
    return scheduledForText || 'Scheduled for later';
  }
  return 'Now / as soon as possible';
}

function formatCategoryLabel(request) {
  const categoryId = request?.categoryId;
  if (!categoryId) return 'Not selected';
  const cat = getCustomerServiceCategoryById(categoryId);
  return cat?.label || categoryId;
}

function formatServicesLabel(request) {
  const serviceIds = request?.serviceIds;
  if (!Array.isArray(serviceIds) || !serviceIds.length) {
    return request?.subject || 'Not selected';
  }
  return serviceIds
    .map((id) => getCustomerServiceById(id)?.label || '')
    .filter(Boolean)
    .join(', ');
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function BackButton({ onPress, parentTab }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.backBtn, pressed && styles.backBtnPressed]}
    >
      <Ionicons color={colors.brandDark} name="chevron-back" size={18} />
      <Text style={styles.backText}>Back to {parentTab === 'Requests' ? 'services' : 'home'}</Text>
    </Pressable>
  );
}

function HeroBanner({ statusMeta, toneStyle, request }) {
  return (
    <View style={[styles.heroBanner, { borderColor: toneStyle.backgroundColor }]}>
      <View style={[styles.heroBannerAccent, { backgroundColor: toneStyle.backgroundColor }]} />
      <View style={styles.heroBannerContent}>
        <Text style={styles.kicker}>Request details</Text>
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

function HelperCard({ helperAssignment }) {
  if (!helperAssignment) {
    return (
      <View style={styles.noHelperCard}>
        <View style={styles.noHelperIconWrap}>
          <Ionicons color={colors.muted} name="person-outline" size={24} />
        </View>
        <View style={styles.noHelperInfo}>
          <Text style={styles.noHelperTitle}>No helper assigned yet</Text>
          <Text style={styles.noHelperDesc}>We will automatically match a helper to your request closer to the scheduled time.</Text>
        </View>
      </View>
    );
  }

  const name = helperAssignment.helperName || 'Helper';
  const initials = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase() || 'H';

  const handleCallHelper = () => {
    if (helperAssignment.helperPhone) {
      Linking.openURL(`tel:${helperAssignment.helperPhone}`);
    }
  };

  return (
    <View style={styles.helperCard}>
      <View style={styles.helperAvatarWrap}>
        {helperAssignment.helperPhoto ? (
          <Image source={{ uri: helperAssignment.helperPhoto }} style={styles.helperAvatar} />
        ) : (
          <View style={styles.helperAvatarFallback}>
            <Text style={styles.helperInitials}>{initials}</Text>
          </View>
        )}
      </View>
      <View style={styles.helperInfo}>
        <Text style={styles.helperName}>{name}</Text>
        <Text style={styles.helperCaption}>Assigned Student Helper</Text>
      </View>
      {helperAssignment.helperPhone ? (
        <Pressable
          accessibilityRole="button"
          onPress={handleCallHelper}
          style={({ pressed }) => [styles.callBtn, pressed && styles.callBtnPressed]}
        >
          <Ionicons color={colors.brandDark} name="call" size={18} />
        </Pressable>
      ) : null}
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

export function ServiceRequestDetailsScreen({ route, goBack }) {
  const requestId = route?.params?.requestId || '';
  const parentTab = route?.params?.parentTab || 'Requests';
  const [request, setRequest] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!requestId) {
      setLoading(false);
      setError('Missing service request ID.');
      return () => {};
    }

    return subscribeToServiceRequestById(
      requestId,
      (item) => {
        setRequest(item);
        setLoading(false);
      },
      (err) => {
        setError(err.message || 'Unable to subscribe to this service request.');
        setLoading(false);
      }
    );
  }, [requestId]);

  const statusMeta = useMemo(() => getServiceRequestStatusMeta(request?.status), [request?.status]);
  const toneStyle = useMemo(() => getServiceRequestToneStyle(request?.status), [request?.status]);
  const progressSteps = useMemo(() => getServiceRequestProgress(request?.status), [request?.status]);
  const pricingLines = Array.isArray(request?.pricingSnapshot?.lines) ? request.pricingSnapshot.lines : [];

  const detailRows = useMemo(() => {
    if (!request) return [];
    return [
      { label: 'Category', value: formatCategoryLabel(request) },
      { label: 'Services', value: formatServicesLabel(request) },
      { label: 'Timing', value: formatTimingLabel(request) },
      {
        label: 'Address',
        value: request.requestPayload?.serviceAddress || request.serviceAddress || 'Not saved yet',
      },
      {
        label: 'Price',
        value: formatCurrency(request.pricingSnapshot?.total || request.totalAmount),
      },
    ];
  }, [request]);

  const nextUpdateText = useMemo(() => {
    if (!request) return '';
    const status = String(request.status || '').toLowerCase();
    if (status === 'collecting_details') {
      return 'AI details collection is active. Reconnect to finish setting up your request.';
    }
    if (status === 'matching') {
      return 'We are searching for a helper in your area. You will receive a notification as soon as they accept.';
    }
    if (status === 'no_helper_available') {
      return 'No helpers have accepted yet. We will continue checking as more helpers log in.';
    }
    if (status === 'scheduled_pending') {
      return 'This request is successfully scheduled. We will match you with a helper closer to the appointment time.';
    }
    if (status === 'accepted') {
      return 'Your helper has confirmed! You can view live travel progress here once they start travelling to you.';
    }
    if (status === 'completed') {
      return 'This service request is completed. Thank you for using Uncedo!';
    }
    if (status === 'canceled' || status === 'canceled') {
      return 'This request has been cancelled.';
    }
    return request.statusDetail || statusMeta.description;
  }, [request, statusMeta.description]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color={colors.brand} size="large" />
        <Text style={styles.loadingText}>Loading request details...</Text>
      </View>
    );
  }

  if (error || !request) {
    return (
      <View style={styles.missingWrap}>
        <View style={styles.missingIconWrap}>
          <Ionicons color={colors.muted} name="document-outline" size={36} />
        </View>
        <Text style={styles.missingTitle}>Service request not found</Text>
        <Text style={styles.missingCopy}>{error || 'We could not find this service request.'}</Text>
        <Pressable accessibilityRole="button" style={styles.backBtnLink} onPress={() => goBack(parentTab)}>
          <Text style={styles.backBtnLinkText}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.wrap} showsVerticalScrollIndicator={false}>
        {/* ── Back button ── */}
        <BackButton onPress={() => goBack(parentTab)} parentTab={parentTab} />

        {/* ── Hero banner ── */}
        <HeroBanner request={request} statusMeta={statusMeta} toneStyle={toneStyle} />

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

        {/* ── Helper card ── */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionIconWrap}>
              <Ionicons color={colors.brandDark} name="people-outline" size={18} />
            </View>
            <Text style={styles.sectionTitle}>Assigned Helper</Text>
          </View>
          <HelperCard helperAssignment={request.helperAssignment} />
        </View>

        {/* ── Request details ── */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionIconWrap}>
              <Ionicons color={colors.brandDark} name="document-text-outline" size={18} />
            </View>
            <Text style={styles.sectionTitle}>Request details</Text>
          </View>
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: colors.muted,
  },

  // ── Missing state ────────────────────────────────────────────────────────
  missingWrap: {
    alignItems: 'center',
    flex: 1,
    gap: 10,
    justifyContent: 'center',
    padding: 24,
    backgroundColor: colors.background,
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
  backBtnLink: {
    padding: 12,
    marginTop: 8,
  },
  backBtnLinkText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.brandDark,
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
  historyButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(217,70,239,0.08)',
    borderColor: colors.border,
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  historyButtonPressed: {
    opacity: 0.7,
    transform: [{ scale: 0.97 }],
  },
  historyButtonText: {
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
    backgroundColor: 'rgba(217,70,239,0.08)',
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

  // ── Helper card ──────────────────────────────────────────────────────────
  helperCard: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: 20,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    padding: 14,
  },
  helperAvatarWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    overflow: 'hidden',
  },
  helperAvatar: {
    width: '100%',
    height: '100%',
  },
  helperAvatarFallback: {
    width: '100%',
    height: '100%',
    backgroundColor: colors.brandSoft || 'rgba(217,70,239,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  helperInitials: {
    fontSize: 16,
    fontWeight: '900',
    color: colors.brandDark,
  },
  helperInfo: {
    flex: 1,
    gap: 3,
  },
  helperName: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '800',
  },
  helperCaption: {
    color: colors.muted,
    fontSize: 12,
  },
  callBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(217,70,239,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  callBtnPressed: {
    opacity: 0.7,
    transform: [{ scale: 0.95 }],
  },
  noHelperCard: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: 20,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    padding: 14,
  },
  noHelperIconWrap: {
    alignItems: 'center',
    backgroundColor: 'rgba(113,113,122,0.08)',
    borderRadius: 12,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  noHelperInfo: {
    flex: 1,
    gap: 2,
  },
  noHelperTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '800',
  },
  noHelperDesc: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 16,
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
