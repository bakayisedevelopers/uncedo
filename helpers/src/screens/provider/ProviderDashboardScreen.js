import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ActionButton, Card, EmptyState, MetricCard, Screen, SectionHeading, StatusBadge } from '../../components/app/HelperUi';
import { useHelpersApp } from '../../context/HelpersAppContext';
import { getServiceById } from '../../constants/serviceCatalog';
import { formatCurrency } from '../../utils/payouts';
import { colors } from '../../theme/colors';

export function ProviderDashboardScreen({ navigate, onLogout }) {
  const { profile, onboardingStatus, jobOffers, activeJob, actions } = useHelpersApp();
  const [now, setNow] = useState(Date.now());
  const isOnline = profile.onlineStatus === 'online';

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const metrics = useMemo(() => ({
    acceptanceRate: `${Math.round(Number(profile.metrics.acceptanceRate || 0) * 100)}%`,
    completionRate: `${Math.round(Number(profile.metrics.completionRate || 0) * 100)}%`,
    rating: profile.metrics.overallRating > 0 ? profile.metrics.overallRating.toFixed(2) : 'New',
    response: `${Number(profile.metrics.avgResponseMinutes || 0)} min`,
    cancellationRate: `${Math.round(Number(profile.metrics.cancellationRate || 0) * 100)}%`,
    recentAssignments: String(Number(profile.metrics.recentAssignmentsCount || 0)),
  }), [profile.metrics]);

  return (
    <Screen
      eyebrow="Helper"
      title="Helper Home"
      description="Go online to receive helper offers, review your active service skills, and manage the same payout logic used in the tutor experience."
    >
      {!onboardingStatus.complete ? (
        <Card style={styles.warningCard}>
          <Text style={styles.warningTitle}>Finish helper onboarding</Text>
          <Text style={styles.warningCopy}>{onboardingStatus.message}</Text>
        </Card>
      ) : null}

      {activeJob ? (
        <Card>
          <StatusBadge label={activeJob.status === 'in_progress' ? 'Active job' : 'Accepted job'} tone="success" />
          <Text style={styles.liveTitle}>
            {activeJob.status === 'in_progress' ? 'Your helper job is in progress.' : 'A helper job is ready to start.'}
          </Text>
          <Text style={styles.liveSubtitle}>{activeJob.title} · {getServiceById(activeJob.serviceId)?.name || 'Service'}</Text>
          <View style={styles.liveMeta}>
            <Text style={styles.liveMetaLabel}>{activeJob.customerName}</Text>
            <Text style={styles.liveMetaValue}>{activeJob.address}</Text>
          </View>
          <View style={styles.buttonRow}>
            <ActionButton label="Open active job" onPress={() => navigate('ActiveJob')} />
          </View>
        </Card>
      ) : null}

      <Card>
        <SectionHeading
          title="Go online to view requests"
          subtitle="When you are online, nearby helper requests will appear below in real time."
        />
        <View style={styles.buttonRow}>
          <ActionButton
            label={isOnline ? 'Go Offline' : 'Go Online'}
            onPress={actions.toggleOnlineStatus}
            disabled={!onboardingStatus.complete}
          />
          <ActionButton label="Open offers" onPress={() => navigate('JobOffers')} tone="secondary" />
          <ActionButton label="Logout" onPress={onLogout} tone="secondary" />
        </View>
      </Card>

      {isOnline ? (
        <Card>
          <SectionHeading
            title="Dispatch metrics"
            subtitle="These cards mirror the tutor dashboard logic, but applied to helper matching and trust ranking."
          />
          <View style={styles.metricGrid}>
            <MetricCard label="Acceptance rate" value={metrics.acceptanceRate} />
            <MetricCard label="Completion rate" value={metrics.completionRate} />
            <MetricCard label="Helper rating" value={metrics.rating} accent="success" />
            <MetricCard label="Avg response" value={metrics.response} />
            <MetricCard label="Cancellation rate" value={metrics.cancellationRate} />
            <MetricCard label="Recent assignments" value={metrics.recentAssignments} />
          </View>
        </Card>
      ) : null}

      <Card>
        <SectionHeading
          title="Incoming job offers"
          subtitle="Offer cards preserve the accept or decline rhythm from the tutor flow."
        />
        {!jobOffers.length ? (
          <EmptyState title="No job offers yet" description="Stay online to receive matching helper requests." />
        ) : (
          jobOffers.slice(0, 2).map((offer) => {
            const secondsLeft = Math.max(0, Math.ceil((offer.offerExpiresAt - now) / 1000));
            return (
              <View key={offer.id} style={styles.offerCard}>
                <Text style={styles.offerTitle}>{offer.title}</Text>
                <Text style={styles.offerCopy}>{offer.description}</Text>
                <Text style={styles.offerMeta}>{offer.customerName} · {offer.area}</Text>
                <Text style={styles.offerMeta}>Skills: {(offer.requestedSkills || []).join(', ')}</Text>
                <Text style={styles.offerCountdown}>{secondsLeft}s remaining · {formatCurrency(offer.payoutEstimate)}</Text>
                <View style={styles.buttonRow}>
                  <ActionButton label="Accept" onPress={() => actions.acceptOffer(offer.id)} />
                  <ActionButton label="Decline" onPress={() => actions.declineOffer(offer.id)} tone="secondary" />
                </View>
              </View>
            );
          })
        )}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  warningCard: {
    backgroundColor: '#fffbeb',
    borderColor: '#fcd34d',
  },
  warningTitle: {
    color: '#92400e',
    fontSize: 16,
    fontWeight: '900',
  },
  warningCopy: {
    color: '#92400e',
    fontSize: 13,
    lineHeight: 20,
  },
  liveTitle: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '900',
  },
  liveSubtitle: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
  },
  liveMeta: {
    backgroundColor: '#f8fafc',
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 1,
    gap: 4,
    padding: 14,
  },
  liveMetaLabel: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  liveMetaValue: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '900',
  },
  buttonRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  offerCard: {
    borderColor: colors.border,
    borderRadius: 20,
    borderWidth: 1,
    gap: 8,
    padding: 14,
  },
  offerTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '900',
  },
  offerCopy: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 20,
  },
  offerMeta: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '700',
  },
  offerCountdown: {
    color: colors.brandDark,
    fontSize: 12,
    fontWeight: '900',
  },
});
