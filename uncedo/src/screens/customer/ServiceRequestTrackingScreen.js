import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { ErrorState, LoadingState } from '../../components/ui/States';
import { MapPlaceholder } from '../../components/customer/MapPlaceholder';
import { MOCK_PROVIDER_MARKERS } from '../../constants/customer';
import { subscribeToServiceRequestById } from '../../services/customerServiceRequestService';
import { colors } from '../../theme/colors';
import { getServiceRequestProgress, getServiceRequestStatusMeta, getServiceRequestToneStyle } from '../../utils/serviceRequestStatus';

function formatCurrency(value) {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount) || amount <= 0) return 'Pending quote';
  return `R${amount.toFixed(2)}`;
}

function formatTimingLabel(request) {
  const timingPreference = request?.requestPayload?.timingPreference || 'now';
  const scheduledForText = request?.requestPayload?.scheduledForText || '';
  if (timingPreference === 'later') {
    return scheduledForText || 'Scheduled for later';
  }
  return 'Now / as soon as possible';
}

function formatHelperLabel(helperAssignment = null) {
  if (!helperAssignment) return 'Helper not assigned yet';
  return helperAssignment.helperName || helperAssignment.name || helperAssignment.displayName || 'Assigned helper';
}

export function ServiceRequestTrackingScreen({ route, goBack }) {
  const requestId = route?.params?.requestId || '';
  const [request, setRequest] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!requestId) {
      setLoading(false);
      setError('Missing service request id.');
      return () => {};
    }
    return subscribeToServiceRequestById(
      requestId,
      (item) => {
        setRequest(item);
        setLoading(false);
      },
      (nextError) => {
        setError(nextError.message || 'Unable to load this service request right now.');
        setLoading(false);
      },
    );
  }, [requestId]);

  const statusMeta = useMemo(() => getServiceRequestStatusMeta(request?.status), [request?.status]);
  const toneStyle = useMemo(() => getServiceRequestToneStyle(request?.status), [request?.status]);
  const progressSteps = useMemo(() => getServiceRequestProgress(request?.status), [request?.status]);
  const pricingLines = Array.isArray(request?.pricingSnapshot?.lines) ? request.pricingSnapshot.lines : [];

  if (loading) return <LoadingState label="Loading service request" />;
  if (error) return <ErrorState message={error} />;
  if (!request) return <ErrorState title="Service request not found" message="We could not find this service request." />;

  return (
    <View style={styles.screen}>
      <MapPlaceholder floatingBottomInset={340} markers={MOCK_PROVIDER_MARKERS} />

      <View style={styles.overlay}>
        <Card style={styles.heroCard}>
          <Text style={styles.kicker}>Live service tracking</Text>
          <View style={[styles.heroBadge, { backgroundColor: toneStyle.backgroundColor }]}>
            <Text style={[styles.heroBadgeText, { color: toneStyle.textColor }]}>{statusMeta.badge}</Text>
          </View>
          <Text style={styles.title}>{statusMeta.title}</Text>
          <Text style={styles.copy}>{request.statusDetail || statusMeta.description}</Text>
        </Card>

        <Card style={styles.detailCard}>
          <Text style={styles.sectionTitle}>Progress</Text>
          <View style={styles.progressList}>
            {progressSteps.map((step) => (
              <View key={step.id} style={styles.progressRow}>
                <View
                  style={[
                    styles.progressDot,
                    step.state === 'complete' ? styles.progressDotComplete : null,
                    step.state === 'current' ? styles.progressDotCurrent : null,
                  ]}
                />
                <Text
                  style={[
                    styles.progressLabel,
                    step.state === 'upcoming' ? styles.progressLabelUpcoming : null,
                  ]}
                >
                  {step.label}
                </Text>
              </View>
            ))}
          </View>
        </Card>

        <Card style={styles.detailCard}>
          <Text style={styles.sectionTitle}>Request details</Text>
          <Text style={styles.detailLine}>Category: {request.subject || 'Not selected yet'}</Text>
          <Text style={styles.detailLine}>Services: {request.topic || 'Not selected yet'}</Text>
          <Text style={styles.detailLine}>Timing: {formatTimingLabel(request)}</Text>
          <Text style={styles.detailLine}>Address: {request.requestPayload?.serviceAddress || 'Not saved yet'}</Text>
          <Text style={styles.detailLine}>Estimate: {formatCurrency(request.pricingSnapshot?.total)}</Text>
          <Text style={styles.detailLine}>Helper: {formatHelperLabel(request.helperAssignment)}</Text>
        </Card>

        {pricingLines.length ? (
          <Card style={styles.detailCard}>
            <Text style={styles.sectionTitle}>Estimate breakdown</Text>
            {pricingLines.map((line, index) => (
              <View key={`${line.label}-${index}`} style={styles.breakdownRow}>
                <Text style={styles.breakdownLabel}>{line.label || 'Charge'}</Text>
                <Text style={styles.breakdownValue}>{formatCurrency(line.amount)}</Text>
              </View>
            ))}
            <View style={styles.breakdownRow}>
              <Text style={styles.breakdownTotalLabel}>Total</Text>
              <Text style={styles.breakdownTotalValue}>{formatCurrency(request.pricingSnapshot?.total)}</Text>
            </View>
          </Card>
        ) : null}

        <Card style={styles.detailCard}>
          <Text style={styles.sectionTitle}>Next update</Text>
          <Text style={styles.detailLine}>
            {request.status === 'matching'
              ? 'This page will update as soon as a helper is found.'
              : request.status === 'scheduled_pending'
                ? 'This request is scheduled for later. Matching will begin closer to the requested time.'
              : request.status === 'accepted'
                ? 'We will update this page when your helper starts travelling.'
                : request.status === 'en_route'
                  ? 'Arrival updates will appear here as your helper gets closer.'
                  : request.status === 'arrived'
                    ? 'Your helper is at the location.'
                    : request.statusDetail || statusMeta.description}
          </Text>
        </Card>

        <Button variant="secondary" onPress={() => goBack('Requests')}>
          Back to requests
        </Button>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: '#e7f1ec',
    flex: 1,
  },
  overlay: {
    bottom: 0,
    gap: 12,
    left: 0,
    padding: 16,
    position: 'absolute',
    right: 0,
  },
  heroCard: {
    backgroundColor: '#0f172a',
    gap: 8,
  },
  heroBadge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  heroBadgeText: {
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  kicker: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  title: {
    color: '#ffffff',
    fontSize: 28,
    fontWeight: '900',
  },
  copy: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 14,
    lineHeight: 21,
  },
  detailCard: {
    gap: 10,
  },
  progressList: {
    gap: 10,
  },
  progressRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  progressDot: {
    backgroundColor: '#e4e4e7',
    borderRadius: 999,
    height: 10,
    width: 10,
  },
  progressDotCurrent: {
    backgroundColor: colors.brand,
    height: 12,
    width: 12,
  },
  progressDotComplete: {
    backgroundColor: '#22c55e',
  },
  progressLabel: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  progressLabelUpcoming: {
    color: colors.muted,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '900',
  },
  detailLine: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
  },
  breakdownRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  breakdownLabel: {
    color: colors.muted,
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    paddingRight: 12,
  },
  breakdownValue: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '800',
  },
  breakdownTotalLabel: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '900',
  },
  breakdownTotalValue: {
    color: colors.brandDark,
    fontSize: 15,
    fontWeight: '900',
  },
});
